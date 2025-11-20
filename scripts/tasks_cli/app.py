"""
Typer application for task CLI.

This module defines the Typer app instance and will host all command
definitions during the Typer migration. Initially contains only a
placeholder version command for testing the app shell.

Commands will be progressively migrated from commands.py in later sessions.
"""

import typer

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
