"""
Typer-based task query commands (Wave 1 migration).

Implements read-only commands:
- list: List tasks with optional filtering
- validate: Validate dependency graph
- show: Show task details (placeholder for future implementation)

These commands delegate to TaskCliContext for business logic and use
the output module for formatting.
"""

import sys
from typing import Any, Dict, Optional

import typer

from ..context import TaskCliContext
from ..models import Task


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


# Command implementations

def list_tasks(
    ctx: TaskCliContext,
    filter_arg: Optional[str] = None,
    format_arg: str = 'text'
) -> int:
    """
    List tasks with optional filtering.

    Replicates legacy cmd_list behavior from __main__.py.

    Args:
        ctx: TaskCliContext with picker and output channel
        filter_arg: Optional filter (status name or 'unblocker')
        format_arg: Output format ('text' or 'json')

    Returns:
        Exit code (0 for success)
    """
    # Configure output mode
    ctx.output_channel.set_json_mode(format_arg == 'json')

    # Determine filter
    status_filter = None
    unblocker_only = False

    if filter_arg:
        if filter_arg == "unblocker":
            unblocker_only = True
        else:
            status_filter = filter_arg

    # Get filtered tasks
    tasks = ctx.picker.list_tasks(
        status_filter=status_filter,
        unblocker_only=unblocker_only
    )

    # Output based on format
    if format_arg == 'json':
        ctx.output_channel.print_json({
            'tasks': [task_to_dict(task) for task in tasks],
            'count': len(tasks),
            'filter': {
                'status': status_filter,
                'unblocker_only': unblocker_only,
            }
        })
    else:
        # Tab-delimited format (backward compatible with Bash script)
        for task in tasks:
            print(f"{task.id}\t{task.status}\t{task.path}\t{task.title}")

    return 0


def validate_tasks(
    ctx: TaskCliContext,
    format_arg: str = 'text'
) -> int:
    """
    Validate dependency graph.

    Replicates legacy cmd_validate behavior from __main__.py.

    Args:
        ctx: TaskCliContext with graph and output channel
        format_arg: Output format ('text' or 'json')

    Returns:
        Exit code (0 if valid, 1 if errors found)
    """
    # Configure output mode
    ctx.output_channel.set_json_mode(format_arg == 'json')

    # Validate graph
    is_valid, errors = ctx.graph.validate()

    # Output based on format
    if format_arg == 'json':
        ctx.output_channel.print_json({
            'valid': is_valid,
            'error_count': len(errors),
            'errors': errors
        })
    else:
        if is_valid:
            print("Validation passed: No dependency errors found")
        else:
            print("Validation failed:", file=sys.stderr)
            for error in errors:
                print(f"  - {error}", file=sys.stderr)

    return 0 if is_valid else 1


def show_task(
    ctx: TaskCliContext,
    task_id: str,
    format_arg: str = 'text'
) -> int:
    """
    Show task details.

    Note: This is a placeholder implementation. The legacy CLI doesn't
    have a 'show' command yet, so this provides basic functionality for
    completeness.

    Args:
        ctx: TaskCliContext with datastore and output channel
        task_id: Task ID to display
        format_arg: Output format ('text' or 'json')

    Returns:
        Exit code (0 for success, 1 if task not found)
    """
    # Configure output mode
    ctx.output_channel.set_json_mode(format_arg == 'json')

    # Find task
    tasks = ctx.datastore.load_tasks()
    task = next((t for t in tasks if t.id == task_id), None)

    if not task:
        if format_arg == 'json':
            ctx.output_channel.print_json({
                'error': f'Task {task_id} not found',
                'task_id': task_id
            })
        else:
            print(f"Error: Task {task_id} not found", file=sys.stderr)
        return 1

    # Output task details
    if format_arg == 'json':
        ctx.output_channel.print_json({
            'task': task_to_dict(task)
        })
    else:
        print(f"ID: {task.id}")
        print(f"Title: {task.title}")
        print(f"Status: {task.status}")
        print(f"Priority: {task.priority}")
        print(f"Area: {task.area}")
        print(f"Path: {task.path}")
        if task.blocked_by:
            print(f"Blocked by: {', '.join(sorted(task.blocked_by))}")
        if task.depends_on:
            print(f"Depends on: {', '.join(sorted(task.depends_on))}")

    return 0


# Typer command registration

def register_commands(app: typer.Typer, ctx: TaskCliContext) -> None:
    """
    Register Typer commands with the app.

    This function wires up the command implementations with Typer decorators.
    It uses a closure pattern to inject the TaskCliContext into each command.

    Args:
        app: Typer app instance to register commands with
        ctx: TaskCliContext to inject into commands
    """

    @app.command("list")
    def list_cmd(
        filter: Optional[str] = typer.Argument(
            None,
            help="Filter tasks by status or 'unblocker'"
        ),
        format: str = typer.Option(
            'text',
            '--format',
            '-f',
            help="Output format: 'text' or 'json'"
        )
    ):
        """List tasks with optional filtering."""
        exit_code = list_tasks(ctx, filter, format)
        raise typer.Exit(code=exit_code)

    @app.command("validate")
    def validate_cmd(
        format: str = typer.Option(
            'text',
            '--format',
            '-f',
            help="Output format: 'text' or 'json'"
        )
    ):
        """Validate dependency graph for cycles and missing dependencies."""
        exit_code = validate_tasks(ctx, format)
        raise typer.Exit(code=exit_code)

    @app.command("show")
    def show_cmd(
        task_id: str = typer.Argument(
            ...,
            help="Task ID to display"
        ),
        format: str = typer.Option(
            'text',
            '--format',
            '-f',
            help="Output format: 'text' or 'json'"
        )
    ):
        """Show detailed information for a specific task."""
        exit_code = show_task(ctx, task_id, format)
        raise typer.Exit(code=exit_code)
