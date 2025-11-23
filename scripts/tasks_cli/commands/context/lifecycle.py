"""
Context lifecycle commands for tasks CLI.

Implements context creation, retrieval, purging, and rebuilding.
"""

import hashlib
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import typer

from ...context import TaskCliContext
from ...context_store import (
    ContextExistsError,
    ContextNotFoundError,
    SourceFile,
    TaskContextStore,
)
from ...datastore import TaskDatastore
from ...exceptions import ValidationError
from ...providers import GitProvider


def register_lifecycle_commands(app: typer.Typer, ctx: TaskCliContext) -> None:
    """
    Register context lifecycle commands as top-level commands.

    Args:
        app: Main Typer app instance
        ctx: TaskCliContext with store and output channel
    """
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
        from ...__main__ import _build_immutable_context_from_task

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
        from ...__main__ import _build_immutable_context_from_task

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
