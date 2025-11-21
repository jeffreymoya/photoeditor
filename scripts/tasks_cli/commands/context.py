"""
Context management commands for tasks CLI.

Implements context store management commands:
- migrate: Migrate context bundles to current schema version
- info: Show context bundle schema version and metadata
- validate: Validate context bundle integrity and schema compliance
- init-context: Initialize task context with immutable snapshot
- get-context: Read task context (immutable + coordination)
- update-agent: Update coordination state for one agent
- purge-context: Delete context directory (idempotent)
- rebuild-context: Rebuild context from manifest after changes
"""

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import typer

from ..context import TaskCliContext
from ..context_store import (
    ContextExistsError,
    ContextNotFoundError,
    SourceFile,
    TaskContextStore,
)
from ..datastore import TaskDatastore
from ..exceptions import ValidationError
from ..providers import GitProvider


# Schema version constants (matching context_store.py expectations)
CURRENT_CONTEXT_VERSION = 1
CURRENT_MANIFEST_VERSION = 1


def migrate_context(
    store: TaskContextStore,
    task_id: str,
    dry_run: bool = False,
    force: bool = False
) -> Dict[str, Any]:
    """
    Migrate a context bundle to current schema version.

    Args:
        store: TaskContextStore instance
        task_id: Task identifier
        dry_run: If True, show changes without applying
        force: If True, force migration even if already current

    Returns:
        Migration report dict with:
        - old_version, new_version
        - changes_applied (list of changes)
        - success (bool)
    """
    # Load context
    context = store.get_context(task_id)
    if context is None:
        return {
            'success': False,
            'error': f'Context not found for {task_id}',
            'task_id': task_id,
            'dry_run': dry_run
        }

    old_version = context.version
    new_version = CURRENT_CONTEXT_VERSION

    changes: List[str] = []

    # Always check for normalization changes (FIX #3 from context_store.py)
    if context.repo_paths:
        normalized = store._runtime.normalize_repo_paths(context.repo_paths)
        if normalized != sorted(context.repo_paths):
            changes.append(
                f'Normalized repo_paths: {len(context.repo_paths)} paths '
                f'→ {len(normalized)} directory paths'
            )
            if not dry_run:
                context.repo_paths = normalized

    # Check if migration needed
    if old_version == new_version and not force and not changes:
        return {
            'success': True,
            'task_id': task_id,
            'old_version': old_version,
            'new_version': new_version,
            'changes_applied': [],
            'message': 'Already at current version',
            'dry_run': dry_run
        }

    # Apply changes if not dry_run
    if changes and not dry_run:
        # Update context version
        context.version = new_version

        # Write back atomically
        context_file = store._runtime.get_context_file(task_id)
        json_content = json.dumps(
            context.to_dict(),
            indent=2,
            sort_keys=True,
            ensure_ascii=False
        )
        json_content += '\n'
        store._runtime.atomic_write(context_file, json_content)

    return {
        'success': True,
        'task_id': task_id,
        'old_version': old_version,
        'new_version': new_version,
        'changes_applied': changes,
        'dry_run': dry_run
    }


def discover_contexts(store: TaskContextStore) -> List[str]:
    """
    Discover all context directories.

    Args:
        store: TaskContextStore instance

    Returns:
        List of task IDs with contexts
    """
    context_root = store.context_root
    if not context_root.exists():
        return []

    task_ids = []
    for context_dir in context_root.iterdir():
        if context_dir.is_dir() and context_dir.name.startswith('TASK-'):
            context_file = context_dir / 'context.json'
            if context_file.exists():
                task_ids.append(context_dir.name)

    return sorted(task_ids)


def get_context_info(store: TaskContextStore, task_id: str) -> Dict[str, Any]:
    """
    Get context bundle metadata.

    Args:
        store: TaskContextStore instance
        task_id: Task identifier

    Returns:
        Info dict with schema versions, metadata, evidence count
    """
    # Load context
    context = store.get_context(task_id)
    if context is None:
        return {
            'error': f'Context not found for {task_id}',
            'task_id': task_id
        }

    # Load manifest if available
    manifest = store.get_manifest(task_id)

    # Count evidence
    evidence_list = store.list_evidence(task_id)

    info = {
        'task_id': task_id,
        'context_version': context.version,
        'created_at': context.created_at,
        'created_by': context.created_by,
        'git_head': context.git_head,
        'audit': {
            'updated_at': context.audit_updated_at,
            'updated_by': context.audit_updated_by,
            'update_count': context.audit_update_count
        },
        'evidence_count': len(evidence_list),
        'repo_paths_count': len(context.repo_paths)
    }

    if manifest:
        info['manifest_version'] = manifest.version
        info['manifest_context_schema_version'] = manifest.context_schema_version
        info['manifest_source_files'] = len(manifest.source_files)

    return info


def validate_context(
    store: TaskContextStore,
    task_id: str
) -> Dict[str, Any]:
    """
    Validate context bundle integrity.

    Args:
        store: TaskContextStore instance
        task_id: Task identifier

    Returns:
        Validation report dict
    """
    issues: List[str] = []

    # Load context
    try:
        context = store.get_context(task_id)
        if context is None:
            return {
                'valid': False,
                'task_id': task_id,
                'issues': ['Context file not found']
            }
    except Exception as e:
        return {
            'valid': False,
            'task_id': task_id,
            'issues': [f'Failed to load context: {str(e)}']
        }

    # Validate schema version
    if context.version != CURRENT_CONTEXT_VERSION:
        issues.append(
            f'Context version {context.version} != current {CURRENT_CONTEXT_VERSION}. '
            'Run migrate command.'
        )

    # Validate required fields
    if not context.task_id:
        issues.append('Missing task_id')
    if not context.git_head:
        issues.append('Missing git_head')
    if not context.task_file_sha:
        issues.append('Missing task_file_sha')

    # Validate manifest if present
    manifest = store.get_manifest(task_id)
    if manifest:
        if manifest.version != CURRENT_MANIFEST_VERSION:
            issues.append(
                f'Manifest version {manifest.version} != current {CURRENT_MANIFEST_VERSION}'
            )

    # Validate evidence attachments
    try:
        evidence_list = store.list_evidence(task_id)
        for evidence in evidence_list:
            # Check if evidence file exists
            evidence_path = store.repo_root / evidence.path
            if not evidence_path.exists():
                issues.append(f'Evidence file missing: {evidence.path}')
            else:
                # Verify SHA256
                actual_sha = store._runtime.calculate_file_sha256(evidence_path)
                if actual_sha != evidence.sha256:
                    issues.append(
                        f'Evidence SHA mismatch: {evidence.path} '
                        f'(expected {evidence.sha256[:8]}, got {actual_sha[:8]})'
                    )
    except Exception as e:
        issues.append(f'Failed to validate evidence: {str(e)}')

    return {
        'valid': len(issues) == 0,
        'task_id': task_id,
        'issues': issues
    }


# Typer command registration

def register_context_commands(app: typer.Typer, ctx: TaskCliContext) -> None:
    """
    Register context management commands.

    Args:
        app: Typer app instance to register commands with
        ctx: TaskCliContext with store and output channel
    """
    context_app = typer.Typer(help="Context store management commands")

    @context_app.command("migrate")
    def migrate_cmd(
        task_id: Optional[str] = typer.Argument(
            None,
            help="Specific task to migrate (or all if omitted)"
        ),
        auto: bool = typer.Option(
            False,
            "--auto",
            help="Auto-migrate all contexts"
        ),
        dry_run: bool = typer.Option(
            False,
            "--dry-run",
            help="Show migration plan without applying"
        ),
        force: bool = typer.Option(
            False,
            "--force",
            help="Force migration even if already current"
        ),
        format: str = typer.Option(
            'text',
            '--format',
            '-f',
            help="Output format: 'text' or 'json'"
        )
    ):
        """Migrate context bundles to current schema version."""
        store = TaskContextStore(ctx.repo_root)

        # Determine which contexts to migrate
        if task_id:
            task_ids = [task_id]
        elif auto:
            task_ids = discover_contexts(store)
            if not task_ids:
                if format == 'json':
                    ctx.output_channel.print_json({
                        'message': 'No contexts found',
                        'migrated': []
                    })
                else:
                    print("No contexts found to migrate")
                return
        else:
            if format == 'json':
                ctx.output_channel.print_json({
                    'error': 'Must specify task_id or use --auto flag'
                })
            else:
                print("Error: Must specify task_id or use --auto flag", file=sys.stderr)
            raise typer.Exit(code=1)

        # Migrate each context
        results = []
        for tid in task_ids:
            result = migrate_context(store, tid, dry_run=dry_run, force=force)
            results.append(result)

        # Output results
        if format == 'json':
            ctx.output_channel.print_json({
                'dry_run': dry_run,
                'total': len(results),
                'successful': sum(1 for r in results if r.get('success')),
                'failed': sum(1 for r in results if not r.get('success')),
                'results': results
            })
        else:
            for result in results:
                tid = result.get('task_id', 'unknown')
                if result.get('success'):
                    changes = result.get('changes_applied', [])
                    if changes:
                        status = 'Would migrate' if dry_run else 'Migrated'
                        print(f"{status}: {tid}")
                        for change in changes:
                            print(f"  - {change}")
                    else:
                        msg = result.get('message', 'No changes needed')
                        print(f"Skipped: {tid} ({msg})")
                else:
                    error = result.get('error', 'Unknown error')
                    print(f"Failed: {tid} - {error}", file=sys.stderr)

    @context_app.command("info")
    def info_cmd(
        task_id: str = typer.Argument(
            ...,
            help="Task ID to inspect"
        ),
        format: str = typer.Option(
            'text',
            '--format',
            '-f',
            help="Output format: 'text' or 'json'"
        )
    ):
        """Show context bundle schema version and metadata."""
        store = TaskContextStore(ctx.repo_root)
        info = get_context_info(store, task_id)

        if format == 'json':
            ctx.output_channel.print_json(info)
        else:
            if 'error' in info:
                print(f"Error: {info['error']}", file=sys.stderr)
                raise typer.Exit(code=1)

            print(f"Task ID: {info['task_id']}")
            print(f"Context Version: {info['context_version']}")
            print(f"Created: {info['created_at']} by {info['created_by']}")
            print(f"Git HEAD: {info['git_head']}")
            print(f"Evidence Count: {info['evidence_count']}")
            print(f"Repo Paths: {info['repo_paths_count']}")
            print("\nAudit Trail:")
            print(f"  Updated: {info['audit']['updated_at']} by {info['audit']['updated_by']}")
            print(f"  Update Count: {info['audit']['update_count']}")

            if 'manifest_version' in info:
                print("\nManifest:")
                print(f"  Version: {info['manifest_version']}")
                print(f"  Context Schema: {info['manifest_context_schema_version']}")
                print(f"  Source Files: {info['manifest_source_files']}")

    @context_app.command("validate")
    def validate_cmd(
        task_id: Optional[str] = typer.Argument(
            None,
            help="Task ID to validate (or all if omitted)"
        ),
        format: str = typer.Option(
            'text',
            '--format',
            '-f',
            help="Output format: 'text' or 'json'"
        )
    ):
        """Validate context bundle integrity and schema compliance."""
        store = TaskContextStore(ctx.repo_root)

        # Determine which contexts to validate
        if task_id:
            task_ids = [task_id]
        else:
            task_ids = discover_contexts(store)
            if not task_ids:
                if format == 'json':
                    ctx.output_channel.print_json({
                        'message': 'No contexts found',
                        'validated': []
                    })
                else:
                    print("No contexts found to validate")
                return

        # Validate each context
        results = []
        for tid in task_ids:
            result = validate_context(store, tid)
            results.append(result)

        # Output results
        if format == 'json':
            ctx.output_channel.print_json({
                'total': len(results),
                'valid': sum(1 for r in results if r.get('valid')),
                'invalid': sum(1 for r in results if not r.get('valid')),
                'results': results
            })
        else:
            all_valid = True
            for result in results:
                tid = result.get('task_id', 'unknown')
                if result.get('valid'):
                    print(f"✓ {tid}: Valid")
                else:
                    all_valid = False
                    print(f"✗ {tid}: Invalid")
                    for issue in result.get('issues', []):
                        print(f"  - {issue}")

            if not all_valid:
                raise typer.Exit(code=1)

    app.add_typer(context_app, name="context")

    # Register top-level context lifecycle commands
    @app.command("init-context")
    def init_context_cmd(
        task_id: str = typer.Argument(..., help="Task ID to initialize context for"),
        base_commit: Optional[str] = typer.Option(
            None, "--base-commit", help="Git commit to use as base (auto-detected if omitted)"
        ),
        actor: str = typer.Option("task-runner", "--actor", help="Actor performing the initialization"),
        force_secrets: bool = typer.Option(
            False, "--force-secrets", help="Bypass dirty working tree and source change warnings"
        ),
        format: str = typer.Option("text", "--format", "-f", help="Output format: 'text' or 'json'"),
    ):
        """Initialize task context with immutable snapshot."""
        # Import helper from __main__ (stays there per plan)
        from ..__main__ import _build_immutable_context_from_task

        repo_root = ctx.repo_root
        store = TaskContextStore(repo_root)

        # Check for dirty working tree
        try:
            git_provider = GitProvider(repo_root)
            status_result = git_provider.status(include_untracked=True)
            if status_result['is_dirty']:
                print("Warning: Working tree has uncommitted changes:", file=sys.stderr)
                for file_path in status_result['files'][:5]:
                    print(f"  {file_path}", file=sys.stderr)
                if not force_secrets:
                    print("\nContext initialization will proceed, but diffs may include uncommitted changes.", file=sys.stderr)
                    print("Commit your changes first or use --force-secrets to bypass this warning.", file=sys.stderr)
        except Exception:
            pass

        # Auto-detect base commit if not provided
        if not base_commit:
            try:
                git_provider = GitProvider(repo_root)
                base_commit = git_provider.get_current_commit()
            except Exception as e:
                if format == 'json':
                    ctx.output_channel.print_json({'success': False, 'error': f'Unable to determine git HEAD: {e}'})
                else:
                    print(f"Error: Unable to determine git HEAD: {e}", file=sys.stderr)
                raise typer.Exit(code=1)

        # Load task
        datastore = TaskDatastore(repo_root)
        tasks = datastore.load_tasks()
        task = next((t for t in tasks if t.id == task_id), None)

        if not task:
            if format == 'json':
                ctx.output_channel.print_json({'success': False, 'error': f'Task not found: {task_id}'})
            else:
                print(f"Error: Task not found: {task_id}", file=sys.stderr)
            raise typer.Exit(code=1)

        # Build immutable context
        try:
            immutable = _build_immutable_context_from_task(Path(task.path))
        except ValidationError as e:
            if format == 'json':
                ctx.output_channel.print_json({'success': False, 'error': f'Failed to build context: {e}'})
            else:
                print(f"Error: Failed to build context: {e}", file=sys.stderr)
            raise typer.Exit(code=1)

        # Enrich standards citations with excerpts
        enriched_citations = []
        for citation in immutable.get('standards_citations', []):
            std_file = citation.get('file')
            std_section = citation.get('section')
            if std_file and std_section:
                try:
                    excerpt = store.extract_standards_excerpt(
                        task_id=task_id, standards_file=std_file, section_heading=std_section
                    )
                    enriched_citations.append({
                        'file': excerpt.file,
                        'section': excerpt.section,
                        'requirement': excerpt.requirement,
                        'line_span': excerpt.line_span,
                        'content_sha256': excerpt.content_sha256,
                        'excerpt_id': excerpt.excerpt_id,
                        'cached_path': excerpt.cached_path,
                        'extracted_at': excerpt.extracted_at,
                    })
                except (FileNotFoundError, ValueError) as e:
                    print(f"Warning: Failed to extract excerpt for {std_file}#{std_section}: {e}", file=sys.stderr)
                    enriched_citations.append(citation)
            else:
                enriched_citations.append(citation)
        immutable['standards_citations'] = enriched_citations

        # Calculate task file SHA
        task_content = Path(task.path).read_bytes()
        task_file_sha = hashlib.sha256(task_content).hexdigest()

        # Build source files list
        source_files = []
        task_rel_path = Path(task.path).relative_to(repo_root)
        source_files.append(SourceFile(path=str(task_rel_path), sha256=task_file_sha, purpose='task_yaml'))

        standards_files_seen = set()
        for citation in immutable.get('standards_citations', []):
            std_file = citation.get('file')
            if std_file and std_file not in standards_files_seen:
                standards_files_seen.add(std_file)
                std_path = repo_root / std_file
                if std_path.exists():
                    std_content = std_path.read_bytes()
                    std_sha = hashlib.sha256(std_content).hexdigest()
                    source_files.append(SourceFile(path=std_file, sha256=std_sha, purpose='standards_citation'))

        # Initialize context
        try:
            context = store.init_context(
                task_id=task_id,
                immutable=immutable,
                git_head=base_commit,
                task_file_sha=task_file_sha,
                created_by=actor,
                force_secrets=force_secrets,
                source_files=source_files,
            )
            if format == 'json':
                ctx.output_channel.print_json({
                    'success': True,
                    'task_id': task_id,
                    'base_commit': base_commit,
                    'context_version': context.version,
                    'manifest_created': len(source_files) > 0,
                    'source_files_count': len(source_files),
                })
            else:
                print(f"Initialized context for {task_id}")
                print(f"  Base commit: {base_commit[:8]}")
                print(f"  Context file: .agent-output/{task_id}/context.json")
                if source_files:
                    print(f"  Manifest file: .agent-output/{task_id}/context.manifest ({len(source_files)} sources)")
        except ContextExistsError as e:
            if format == 'json':
                ctx.output_channel.print_json({'success': False, 'error': str(e)})
            else:
                print(f"Error: {e}", file=sys.stderr)
            raise typer.Exit(code=1)
        except ValidationError as e:
            if format == 'json':
                ctx.output_channel.print_json({'success': False, 'error': str(e)})
            else:
                print(f"Error: {e}", file=sys.stderr)
            raise typer.Exit(code=1)

    @app.command("get-context")
    def get_context_cmd(
        task_id: str = typer.Argument(..., help="Task ID to get context for"),
        format: str = typer.Option("text", "--format", "-f", help="Output format: 'text' or 'json'"),
    ):
        """Read task context (immutable + coordination)."""
        store = TaskContextStore(ctx.repo_root)
        context = store.get_context(task_id)

        if context is None:
            if format == 'json':
                ctx.output_channel.print_json({'success': False, 'error': f'No context found for {task_id}'})
            else:
                print(f"Error: No context found for {task_id}", file=sys.stderr)
            raise typer.Exit(code=1)

        # Check staleness
        created_dt = datetime.fromisoformat(context.created_at.replace('Z', '+00:00'))
        age_hours = (datetime.now(timezone.utc) - created_dt).total_seconds() / 3600
        staleness_warning = None
        if age_hours > 48:
            staleness_warning = f"Context is {age_hours:.1f} hours old. Consider rebuilding if task requirements changed."

        if format == 'json':
            ctx.output_channel.print_json({
                'success': True,
                'context': context.to_dict(),
                'staleness_warning': staleness_warning,
                'age_hours': round(age_hours, 1),
            })
        else:
            print(f"Context for {context.task_id}")
            print(f"  Version: {context.version}")
            print(f"  Created: {context.created_at}")
            print(f"  Created by: {context.created_by}")
            print(f"  Git HEAD: {context.git_head[:8]}")
            print(f"  Age: {age_hours:.1f} hours")
            if staleness_warning:
                print(f"\nWarning: {staleness_warning}")
            print()
            print("Task Snapshot:")
            print(f"  Title: {context.task_snapshot.title}")
            print(f"  Priority: {context.task_snapshot.priority}")
            print(f"  Area: {context.task_snapshot.area}")
            print()
            print("Agent Coordination:")
            print(f"  Implementer: {context.implementer.status}")
            print(f"  Reviewer: {context.reviewer.status}")
            print(f"  Validator: {context.validator.status}")

    @app.command("update-agent")
    def update_agent_cmd(
        task_id: str = typer.Argument(..., help="Task ID to update"),
        agent: str = typer.Option(..., "--agent", help="Agent role: implementer, reviewer, or validator"),
        status: Optional[str] = typer.Option(None, "--status", help="New status for the agent"),
        qa_log: Optional[str] = typer.Option(None, "--qa-log", help="Path to QA log file"),
        session_id: Optional[str] = typer.Option(None, "--session-id", help="Agent session ID"),
        actor: str = typer.Option("task-runner", "--actor", help="Actor performing the update"),
        force_secrets: bool = typer.Option(False, "--force-secrets", help="Bypass drift budget check"),
        format: str = typer.Option("text", "--format", "-f", help="Output format: 'text' or 'json'"),
    ):
        """Update coordination state for one agent."""
        from ..__main__ import _auto_verify_worktree, _check_drift_budget

        repo_root = ctx.repo_root
        store = TaskContextStore(repo_root)

        updates = {}
        if status:
            updates['status'] = status
        if qa_log:
            updates['qa_log_path'] = qa_log
        if session_id:
            updates['session_id'] = session_id

        # Auto-populate completed_at when status changes to 'done'
        if updates.get('status') == 'done' and 'completed_at' not in updates:
            updates['completed_at'] = datetime.now(timezone.utc).isoformat()

        if not updates:
            print("Error: No updates specified (use --status, --qa-log, or --session-id)", file=sys.stderr)
            raise typer.Exit(code=1)

        try:
            _check_drift_budget(store, task_id)
            _auto_verify_worktree(store, task_id, agent)

            store.update_coordination(
                task_id=task_id,
                agent_role=agent,
                updates=updates,
                actor=actor,
                force_secrets=force_secrets,
            )

            if format == 'json':
                ctx.output_channel.print_json({
                    'success': True,
                    'task_id': task_id,
                    'agent_role': agent,
                    'updates': updates,
                })
            else:
                print(f"Updated {agent} coordination for {task_id}")
                for key, value in updates.items():
                    print(f"  {key}: {value}")
        except (ContextNotFoundError, ValidationError) as e:
            if format == 'json':
                ctx.output_channel.print_json({'success': False, 'error': str(e)})
            else:
                print(f"Error: {e}", file=sys.stderr)
            raise typer.Exit(code=1)

    @app.command("purge-context")
    def purge_context_cmd(
        task_id: str = typer.Argument(..., help="Task ID to purge context for"),
        format: str = typer.Option("text", "--format", "-f", help="Output format: 'text' or 'json'"),
    ):
        """Delete context directory (idempotent)."""
        store = TaskContextStore(ctx.repo_root)
        store.purge_context(task_id)

        if format == 'json':
            ctx.output_channel.print_json({'success': True, 'task_id': task_id})
        else:
            print(f"Purged context for {task_id}")

    @app.command("rebuild-context")
    def rebuild_context_cmd(
        task_id: str = typer.Argument(..., help="Task ID to rebuild context for"),
        actor: str = typer.Option("task-runner", "--actor", help="Actor performing the rebuild"),
        force_secrets: bool = typer.Option(
            False, "--force-secrets", help="Bypass source change warnings"
        ),
        format: str = typer.Option("text", "--format", "-f", help="Output format: 'text' or 'json'"),
    ):
        """Rebuild context from manifest after standards/task changes."""
        from ..__main__ import _build_immutable_context_from_task

        repo_root = ctx.repo_root
        store = TaskContextStore(repo_root)

        # Check if context exists
        existing_context = store.get_context(task_id)
        if not existing_context:
            if format == 'json':
                ctx.output_channel.print_json({
                    'success': False,
                    'error': f'No context found for {task_id}. Use init-context first.',
                })
            else:
                print(f"Error: No context found for {task_id}", file=sys.stderr)
                print("Use init-context to create a new context.", file=sys.stderr)
            raise typer.Exit(code=1)

        # Load manifest
        manifest = store.get_manifest(task_id)
        if not manifest:
            if format == 'json':
                ctx.output_channel.print_json({
                    'success': False,
                    'error': f'No manifest found for {task_id}. Cannot rebuild without provenance info.',
                })
            else:
                print(f"Error: No manifest found for {task_id}", file=sys.stderr)
                print("Manifest is required for rebuild.", file=sys.stderr)
            raise typer.Exit(code=1)

        # Load task
        datastore = TaskDatastore(repo_root)
        tasks = datastore.load_tasks()
        task = next((t for t in tasks if t.id == task_id), None)

        if not task:
            if format == 'json':
                ctx.output_channel.print_json({'success': False, 'error': f'Task {task_id} not found.'})
            else:
                print(f"Error: Task {task_id} not found.", file=sys.stderr)
            raise typer.Exit(code=1)

        # Verify source files and detect changes
        changes_detected = []
        for source_file in manifest.source_files:
            source_path = repo_root / source_file.path
            if not source_path.exists():
                changes_detected.append(f"Missing: {source_file.path}")
            else:
                current_sha = hashlib.sha256(source_path.read_bytes()).hexdigest()
                if current_sha != source_file.sha256:
                    changes_detected.append(f"Modified: {source_file.path}")

        if changes_detected and not force_secrets:
            if format == 'json':
                ctx.output_channel.print_json({
                    'success': False,
                    'error': 'Source files have changed. Review changes before rebuilding.',
                    'changes': changes_detected,
                })
            else:
                print("Warning: Source files have changed since last initialization:", file=sys.stderr)
                for change in changes_detected[:10]:
                    print(f"  {change}", file=sys.stderr)
                print("\nReview these changes before rebuilding.", file=sys.stderr)
                print("Use --force-secrets to proceed anyway.", file=sys.stderr)
            raise typer.Exit(code=1)

        # Get current git HEAD
        try:
            git_provider = GitProvider(repo_root)
            current_head = git_provider.get_current_commit()
        except Exception as e:
            if format == 'json':
                ctx.output_channel.print_json({'success': False, 'error': f'Unable to determine git HEAD: {e}'})
            else:
                print(f"Error: Unable to determine git HEAD: {e}", file=sys.stderr)
            raise typer.Exit(code=1)

        # Purge old context
        store.purge_context(task_id)

        # Rebuild immutable context
        try:
            immutable = _build_immutable_context_from_task(Path(task.path))
        except ValidationError as e:
            if format == 'json':
                ctx.output_channel.print_json({'success': False, 'error': f'Failed to build context: {e}'})
            else:
                print(f"Error: Failed to build context: {e}", file=sys.stderr)
            raise typer.Exit(code=1)

        # Enrich standards citations
        enriched_citations = []
        for citation in immutable.get('standards_citations', []):
            std_file = citation.get('file')
            std_section = citation.get('section')
            if std_file and std_section:
                try:
                    excerpt = store.extract_standards_excerpt(
                        task_id=task_id, standards_file=std_file, section_heading=std_section
                    )
                    enriched_citations.append({
                        'file': excerpt.file,
                        'section': excerpt.section,
                        'requirement': excerpt.requirement,
                        'line_span': excerpt.line_span,
                        'content_sha256': excerpt.content_sha256,
                        'excerpt_id': excerpt.excerpt_id,
                        'cached_path': excerpt.cached_path,
                        'extracted_at': excerpt.extracted_at,
                    })
                except (FileNotFoundError, ValueError) as e:
                    print(f"Warning: Failed to extract excerpt for {std_file}#{std_section}: {e}", file=sys.stderr)
                    enriched_citations.append(citation)
            else:
                enriched_citations.append(citation)
        immutable['standards_citations'] = enriched_citations

        # Calculate task file SHA
        task_content = Path(task.path).read_bytes()
        task_file_sha = hashlib.sha256(task_content).hexdigest()

        # Build fresh source files list
        source_files = []
        task_rel_path = Path(task.path).relative_to(repo_root)
        source_files.append(SourceFile(path=str(task_rel_path), sha256=task_file_sha, purpose='task_yaml'))

        standards_files_seen = set()
        for citation in immutable.get('standards_citations', []):
            std_file = citation.get('file')
            if std_file and std_file not in standards_files_seen:
                standards_files_seen.add(std_file)
                std_path = repo_root / std_file
                if std_path.exists():
                    std_content = std_path.read_bytes()
                    std_sha = hashlib.sha256(std_content).hexdigest()
                    source_files.append(SourceFile(path=std_file, sha256=std_sha, purpose='standards_citation'))

        # Re-initialize context
        try:
            store.init_context(
                task_id=task_id,
                immutable=immutable,
                git_head=current_head,
                task_file_sha=task_file_sha,
                created_by=actor,
                force_secrets=force_secrets,
                source_files=source_files,
            )

            if format == 'json':
                ctx.output_channel.print_json({
                    'success': True,
                    'task_id': task_id,
                    'git_head': current_head,
                    'changes_applied': len(changes_detected),
                    'source_files_count': len(source_files),
                })
            else:
                print(f"Rebuilt context for {task_id}")
                print(f"  Git HEAD: {current_head[:8]}")
                if changes_detected:
                    print(f"  Changes applied: {len(changes_detected)} source files updated")
                print(f"  Context file: .agent-output/{task_id}/context.json")
                print(f"  Manifest file: .agent-output/{task_id}/context.manifest ({len(source_files)} sources)")
        except Exception as e:
            if format == 'json':
                ctx.output_channel.print_json({'success': False, 'error': str(e)})
            else:
                print(f"Error: Failed to rebuild context: {e}", file=sys.stderr)
            raise typer.Exit(code=1)
