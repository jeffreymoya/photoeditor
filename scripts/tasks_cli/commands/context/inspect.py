"""
Context inspection and validation commands for tasks CLI.

Implements info and validation functionality for context bundles.
"""

import sys
from typing import Any, Dict, List, Optional

import typer

from ...context import TaskCliContext
from ...context_store import TaskContextStore


# Schema version constants
CURRENT_CONTEXT_VERSION = 1
CURRENT_MANIFEST_VERSION = 1


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


def register_inspect_commands(context_app: typer.Typer, ctx: TaskCliContext) -> None:
    """
    Register inspection commands (info, validate).

    Args:
        context_app: Typer subapp for context commands
        ctx: TaskCliContext with store and output channel
    """
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
        from .migrate import discover_contexts

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
