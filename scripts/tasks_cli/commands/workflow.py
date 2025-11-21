"""
Typer-based workflow commands (Wave 2 migration).

Implements stateful workflow operations:
- pick: Pick next task using priority algorithm
- claim: Claim a task (transition to in_progress)
- complete: Complete a task and archive it
- archive: Archive a completed task without status change

These commands delegate to TaskCliContext for business logic and use
the output module for formatting.
"""

import sys
from pathlib import Path
from typing import Any, Dict, Optional

import typer

from ..context import TaskCliContext
from ..exceptions import WorkflowHaltError
from ..models import Task
from ..operations import TaskOperationError, TaskOperations


def task_to_dict(task: Task) -> Dict[str, Any]:
    """
    Convert Task to JSON-serializable dict.

    Per proposal Section 3.2: includes all metadata fields with
    deterministic ordering (sorted keys).

    Phase 2: Includes effective_priority and priority_reason fields
    (always present, null when not applicable).

    Args:
        task: Task instance to serialize

    Returns:
        Dictionary with sorted keys, suitable for JSON output
    """
    return {
        'area': task.area,
        'blocked_by': sorted(task.blocked_by),  # Deterministic ordering
        'depends_on': sorted(task.depends_on),
        'effective_priority': task.effective_priority,  # Phase 2: Runtime-computed
        'hash': task.hash,
        'id': task.id,
        'mtime': task.mtime,
        'order': task.order,
        'path': str(task.path),
        'priority': task.priority,
        'priority_reason': task.priority_reason,  # Phase 2: Audit trail
        'status': task.status,
        'title': task.title,
        'unblocker': task.unblocker,
    }


def emit_draft_warnings(alerts: Dict[str, Any]) -> None:
    """
    Emit human-readable warnings for draft tasks and their downstream dependencies.

    Args:
        alerts: Draft alert metadata from TaskPicker.get_draft_alerts()
    """
    if not alerts.get('has_drafts'):
        return

    draft_meta = {draft['id']: draft for draft in alerts.get('drafts', [])}

    header = (
        f"WARNING: {alerts['draft_count']} draft task(s) require clarification "
        f"before new work is picked."
    )
    print(header, file=sys.stderr)

    # High-priority warning for draft unblockers
    draft_unblockers = alerts.get('draft_unblockers', [])
    if draft_unblockers:
        print(
            f"  {len(draft_unblockers)} draft task(s) marked as unblockers:",
            file=sys.stderr
        )
        for task_id in draft_unblockers:
            meta = draft_meta.get(task_id, {})
            print(f"    - {task_id} ({meta.get('title', 'Unknown')})", file=sys.stderr)

    # Additional warning for blocked downstream work
    blocked_count = alerts.get('downstream_blocked_count', 0)
    if blocked_count > 0:
        print(
            f"  {blocked_count} task(s) blocked by draft dependencies",
            file=sys.stderr
        )

    print(
        "\nRecommendation: Use '/groom-drafts' to review and promote these tasks.",
        file=sys.stderr
    )


# Command implementations

def pick_task(
    ctx: TaskCliContext,
    filter_arg: Optional[str] = None,
    format_arg: str = 'text'
) -> int:
    """
    Pick next task to work on.

    Args:
        ctx: TaskCliContext with picker, datastore, and output channel
        filter_arg: Optional status filter (or 'auto')
        format_arg: Output format ('text' or 'json')

    Returns:
        Exit code (0 for success, 1 if no ready tasks)
    """
    # Configure output mode
    ctx.output_channel.set_json_mode(format_arg == 'json')

    # Get completed task IDs for readiness check
    tasks = ctx.datastore.load_tasks()
    graph = ctx.datastore.get_dependency_graph()
    ctx.picker.refresh(tasks, graph)
    completed_ids = {task.id for task in tasks if task.is_completed()}

    # Determine status filter
    status_filter = filter_arg if filter_arg and filter_arg != "auto" else None

    # Gather draft alerts and emit warnings for text mode
    draft_alerts = ctx.picker.get_draft_alerts()
    if format_arg != 'json':
        emit_draft_warnings(draft_alerts)

    # Pick next task (returns tuple of (task, reason) or None)
    result = ctx.picker.pick_next_task(completed_ids, status_filter=status_filter)

    if result:
        task, reason = result
        # Get snapshot_id for audit trail
        snapshot_id = ctx.datastore.get_snapshot_id()

        # Output based on format
        if format_arg == 'json':
            ctx.output_channel.print_json({
                'task': task_to_dict(task),
                'reason': reason,
                'snapshot_id': snapshot_id,
                'status': 'success',
                'draft_alerts': draft_alerts,
            })
        else:
            # Just the file path (backward compatible)
            print(task.path)
        return 0
    else:
        if format_arg == 'json':
            ctx.output_channel.print_json({
                'task': None,
                'status': 'no_ready_tasks',
                'message': 'No ready tasks found',
                'draft_alerts': draft_alerts,
            })
        else:
            print("No ready tasks found", file=sys.stderr)
        return 1


def claim_task(
    ctx: TaskCliContext,
    task_path: str
) -> int:
    """
    Claim a task (transition to in_progress).

    Args:
        ctx: TaskCliContext with datastore and repo_root
        task_path: Path to task file

    Returns:
        Exit code (0 for success, 1 for errors)
    """
    # Find task by path
    tasks = ctx.datastore.load_tasks()
    resolved_path = Path(task_path).resolve()

    task = None
    for t in tasks:
        if Path(t.path).resolve() == resolved_path:
            task = t
            break

    if not task:
        print(f"Error: Task not found: {task_path}", file=sys.stderr)
        return 1

    # Perform claim operation
    ops = TaskOperations(ctx.repo_root)
    try:
        result_path = ops.claim_task(task)
        print(f"✓ Claimed task {task.id}")
        print(f"  Status: {task.status} → in_progress")
        print(f"  File: {result_path}")

        # Invalidate cache
        ctx.datastore.load_tasks(force_refresh=True)

        return 0

    except TaskOperationError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


def complete_task(
    ctx: TaskCliContext,
    task_path: str
) -> int:
    """
    Complete a task and archive it.

    Args:
        ctx: TaskCliContext with datastore and repo_root
        task_path: Path to task file

    Returns:
        Exit code (0 for success, 1 for errors)
    """
    # Find task by path
    tasks = ctx.datastore.load_tasks()
    resolved_path = Path(task_path).resolve()

    task = None
    for t in tasks:
        if Path(t.path).resolve() == resolved_path:
            task = t
            break

    if not task:
        print(f"Error: Task not found: {task_path}", file=sys.stderr)
        return 1

    # Perform complete operation (with archiving per user preference)
    ops = TaskOperations(ctx.repo_root)
    try:
        result_path = ops.complete_task(task, archive=True)

        print(f"✓ Completed task {task.id}")
        print(f"  Status: {task.status} → completed")
        print(f"  Archived to: {result_path}")

        # Invalidate cache
        ctx.datastore.load_tasks(force_refresh=True)

        return 0

    except TaskOperationError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


def archive_task(
    ctx: TaskCliContext,
    task_path: str
) -> int:
    """
    Archive an already-completed task without modifying its status.

    Args:
        ctx: TaskCliContext with datastore and repo_root
        task_path: Path to task file

    Returns:
        Exit code (0 for success, 1 for errors)
    """
    tasks = ctx.datastore.load_tasks()
    resolved_path = Path(task_path).resolve()

    task = None
    for t in tasks:
        if Path(t.path).resolve() == resolved_path:
            task = t
            break

    if not task:
        print(f"Error: Task not found: {task_path}", file=sys.stderr)
        return 1

    ops = TaskOperations(ctx.repo_root)
    try:
        result_path = ops.archive_task(task)

        if Path(task.path).resolve() == Path(result_path).resolve():
            print(f"✓ Task {task.id} already archived")
            print(f"  File: {result_path}")
        else:
            print(f"✓ Archived task {task.id}")
            print(f"  Moved to: {result_path}")

        ctx.datastore.load_tasks(force_refresh=True)
        return 0

    except TaskOperationError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


# Typer registration

def register_commands(app: typer.Typer, ctx: TaskCliContext) -> None:
    """
    Register Typer workflow commands with the app.

    This function wires up the command implementations with Typer decorators.
    It uses a closure pattern to inject the TaskCliContext into each command.

    Args:
        app: Typer app instance to register commands with
        ctx: TaskCliContext to inject into commands
    """

    @app.command("pick")
    def pick_cmd(
        filter: Optional[str] = typer.Argument(
            None,
            help="Filter tasks by status or 'auto'"
        ),
        format: str = typer.Option(
            'text',
            '--format',
            help="Output format: text or json"
        )
    ):
        """Pick next task using priority algorithm."""
        exit_code = pick_task(ctx, filter, format)
        raise typer.Exit(code=exit_code)

    @app.command("claim")
    def claim_cmd(
        task_path: str = typer.Argument(
            ...,
            help="Path to task file to claim"
        )
    ):
        """Claim a task (transition to in_progress)."""
        exit_code = claim_task(ctx, task_path)
        raise typer.Exit(code=exit_code)

    @app.command("complete")
    def complete_cmd(
        task_path: str = typer.Argument(
            ...,
            help="Path to task file to complete"
        )
    ):
        """Complete a task and archive it."""
        exit_code = complete_task(ctx, task_path)
        raise typer.Exit(code=exit_code)

    @app.command("archive")
    def archive_cmd(
        task_path: str = typer.Argument(
            ...,
            help="Path to task file to archive"
        )
    ):
        """Archive an already-completed task without status change."""
        exit_code = archive_task(ctx, task_path)
        raise typer.Exit(code=exit_code)
