"""
Typer-based graph and cache commands (Wave 2 migration).

Implements graph visualization and cache management:
- graph: Export dependency graph in DOT format
- refresh-cache: Force rebuild of task cache
- check-halt: Check for workflow halt conditions

These commands delegate to TaskCliContext for business logic and use
the output module for formatting.
"""

import sys
from typing import List

import typer

from ..context import TaskCliContext
from ..exceptions import WorkflowHaltError
from ..models import Task
from ..picker import check_halt_conditions


# Command implementations

def export_graph(ctx: TaskCliContext) -> int:
    """
    Export dependency graph in DOT format.

    Args:
        ctx: TaskCliContext with graph

    Returns:
        Exit code (0 for success)
    """
    # Get the dependency graph
    graph = ctx.datastore.get_dependency_graph()

    # Generate DOT format
    dot_output = graph.export_dot()

    print(dot_output)
    print("\n# Render with: dot -Tpng -o tasks.png", file=sys.stderr)
    print("# Or view online: https://dreampuf.github.io/GraphvizOnline/", file=sys.stderr)

    return 0


def refresh_cache(ctx: TaskCliContext) -> int:
    """
    Force cache rebuild.

    Args:
        ctx: TaskCliContext with datastore

    Returns:
        Exit code (0 for success)
    """
    tasks = ctx.datastore.load_tasks(force_refresh=True)
    print(f"Cache refreshed: {len(tasks)} tasks loaded")

    # Show cache info
    info = ctx.datastore.get_cache_info()
    if info.get('exists'):
        print(f"Cache generated at: {info.get('generated_at')}")
        print(f"Active tasks: {info.get('task_count', 0) - info.get('archive_count', 0)}")
        print(f"Archived tasks: {info.get('archive_count', 0)}")

    return 0


def check_halt(
    ctx: TaskCliContext,
    format_arg: str = 'text'
) -> int:
    """
    Check for workflow halt conditions (blocked unblockers).

    Per docs/proposals/task-workflow-python-refactor.md Section 3.4,
    the workflow must halt when unblocker tasks are blocked.

    Args:
        ctx: TaskCliContext with datastore and output channel
        format_arg: Output format ('text' or 'json')

    Returns:
        Exit code (0 if no halt conditions, 2 if halt detected)
    """
    # Configure output mode
    ctx.output_channel.set_json_mode(format_arg == 'json')

    # Load tasks
    tasks = ctx.datastore.load_tasks()

    try:
        # Check for halt conditions
        check_halt_conditions(tasks)

        # No halt conditions detected
        if format_arg == 'json':
            ctx.output_channel.print_json({
                'halt': False,
                'type': None,
                'tasks': [],
                'message': 'No halt conditions detected'
            })
        else:
            print("No halt conditions detected - workflow can proceed")

        return 0

    except WorkflowHaltError as e:
        # Halt condition detected
        if format_arg == 'json':
            ctx.output_channel.print_json({
                'halt': True,
                'type': e.halt_type,
                'tasks': e.task_ids,
                'message': str(e)
            })
        else:
            print(str(e), file=sys.stderr)

        # Return exit code 2 (distinct from normal errors)
        return 2


# Typer registration

def register_commands(app: typer.Typer, ctx: TaskCliContext) -> None:
    """
    Register Typer graph commands with the app.

    This function wires up the command implementations with Typer decorators.
    It uses a closure pattern to inject the TaskCliContext into each command.

    Args:
        app: Typer app instance to register commands with
        ctx: TaskCliContext to inject into commands
    """

    @app.command("graph")
    def graph_cmd():
        """Export dependency graph in DOT format."""
        exit_code = export_graph(ctx)
        raise typer.Exit(code=exit_code)

    @app.command("refresh-cache")
    def refresh_cache_cmd():
        """Force rebuild of task cache."""
        exit_code = refresh_cache(ctx)
        raise typer.Exit(code=exit_code)

    @app.command("check-halt")
    def check_halt_cmd(
        format: str = typer.Option(
            'text',
            '--format',
            help="Output format: text or json"
        )
    ):
        """Check for workflow halt conditions (blocked unblockers)."""
        exit_code = check_halt(ctx, format)
        raise typer.Exit(code=exit_code)
