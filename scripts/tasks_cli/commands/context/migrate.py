"""
Context migration commands for tasks CLI.

Implements schema migration functionality for context bundles.
"""

import json
import sys
from typing import Any, Dict, List, Optional

import typer

from ...context import TaskCliContext
from ...context_store import TaskContextStore


# Schema version constants (matching context_store.py expectations)
CURRENT_CONTEXT_VERSION = 1


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


def register_migrate_command(context_app: typer.Typer, ctx: TaskCliContext) -> None:
    """
    Register the migrate command.

    Args:
        context_app: Typer subapp for context commands
        ctx: TaskCliContext with store and output channel
    """
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
