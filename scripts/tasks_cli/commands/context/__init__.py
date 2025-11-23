"""
Context management commands package for tasks CLI.

This package provides context store management commands:
- migrate: Migrate context bundles to current schema version
- info: Show context bundle schema version and metadata
- validate: Validate context bundle integrity and schema compliance
- init-context: Initialize task context with immutable snapshot
- get-context: Read task context (immutable + coordination)
- update-agent: Update coordination state for one agent
- purge-context: Delete context directory (idempotent)
- rebuild-context: Rebuild context from manifest after changes
"""

import typer

from ...context import TaskCliContext
from .coordination import register_coordination_command
from .inspect import register_inspect_commands
from .lifecycle import register_lifecycle_commands
from .migrate import register_migrate_command


def register_context_commands(app: typer.Typer, ctx: TaskCliContext) -> None:
    """
    Register all context management commands.

    This is the main entry point for registering context commands.
    It creates a context subcommand group and registers all lifecycle
    commands as top-level commands.

    Args:
        app: Main Typer app instance
        ctx: TaskCliContext with store and output channel
    """
    # Create context subcommand group for migrate/info/validate
    context_app = typer.Typer(help="Context store management commands")

    # Register subcommands under 'context' group
    register_migrate_command(context_app, ctx)
    register_inspect_commands(context_app, ctx)

    # Add context subcommand group to main app
    app.add_typer(context_app, name="context")

    # Register top-level lifecycle commands
    register_lifecycle_commands(app, ctx)

    # Register top-level coordination command
    register_coordination_command(app, ctx)


__all__ = ['register_context_commands']
