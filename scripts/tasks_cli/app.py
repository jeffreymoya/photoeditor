"""
Typer application for task CLI.

This module defines the Typer app instance and registers all Typer-migrated
commands. Commands are progressively migrated from the legacy argparse
implementation.

Wave 1 (Active): list, validate, show commands via commands/tasks.py
Wave 2 (Active): pick, claim, complete, archive, graph, refresh-cache, check-halt
"""

import typer
from pathlib import Path

from .context import TaskCliContext

# Create Typer app instance
app = typer.Typer(
    name="tasks",
    help="Task workflow management CLI",
    add_completion=False,  # Disable shell completion for now
)


@app.command()
def version():
    """Display CLI version."""
    typer.echo("0.0.1-typer")


def get_app() -> typer.Typer:
    """
    Get Typer app instance.

    Useful for testing and programmatic access to the app.

    Returns:
        Typer app instance
    """
    return app


def initialize_commands(repo_root: Path) -> None:
    """
    Initialize and register Typer commands with context.

    This function creates the TaskCliContext and registers all Typer-migrated
    commands. It should be called once at application startup.

    Args:
        repo_root: Repository root path for context initialization
    """
    from .commands.tasks import register_commands
    from .commands.context import register_context_commands
    from .commands.workflow import register_commands as register_workflow_commands
    from .commands.graph import register_commands as register_graph_commands

    # Create context
    ctx = TaskCliContext.from_repo_root(repo_root)

    # Register Wave 1 commands
    register_commands(app, ctx)

    # Register Wave 2 workflow commands
    register_workflow_commands(app, ctx)

    # Register Wave 2 graph commands
    register_graph_commands(app, ctx)

    # Register Wave 3 context commands
    register_context_commands(app, ctx)
