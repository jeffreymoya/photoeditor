"""
Task CLI main entry point.

Provides command-line interface for task workflow management.
All commands have been migrated to Typer for better UX and maintainability.

Usage:
    python scripts/tasks.py list [filter] [--format json]
    python scripts/tasks.py pick [filter] [--format json]
    python scripts/tasks.py validate [--format json]
    python scripts/tasks.py check-halt [--format json]
    python scripts/tasks.py refresh-cache
    python scripts/tasks.py graph
    python scripts/tasks.py explain TASK-ID [--format json]
    python scripts/tasks.py claim TASK_PATH
    python scripts/tasks.py complete TASK_PATH
    python scripts/tasks.py archive TASK_PATH

For full command reference, run:
    python scripts/tasks.py --help
"""

import os
import sys
from pathlib import Path


def find_repo_root() -> Path:
    """
    Find repository root by looking for .git directory.

    Returns:
        Absolute path to repository root

    Raises:
        SystemExit: If repo root cannot be found
    """
    current = Path.cwd().resolve()

    # Walk up directory tree looking for .git
    for parent in [current] + list(current.parents):
        if (parent / ".git").exists():
            return parent

    # Fallback: assume we're in scripts/ and repo root is parent
    script_dir = Path(__file__).parent.parent.parent
    if (script_dir / ".git").exists():
        return script_dir

    print("Error: Could not find repository root (no .git directory)", file=sys.stderr)
    sys.exit(1)


def main():
    """
    Main CLI entry point.

    Initializes Typer app with repository context and dispatches to commands.
    All legacy argparse commands have been migrated to Typer.
    """
    # Check for legacy dispatch environment variable (deprecated)
    if os.environ.get('TASKS_CLI_LEGACY_DISPATCH'):
        print(
            "Warning: TASKS_CLI_LEGACY_DISPATCH is deprecated and no longer supported.",
            file=sys.stderr
        )
        print(
            "All commands have been migrated to Typer. The flag will be ignored.",
            file=sys.stderr
        )

    # Find repository root
    try:
        repo_root = find_repo_root()
    except SystemExit:
        return 1

    # Import and initialize Typer app
    from .app import app, initialize_commands

    # Initialize all Typer commands with repository context
    initialize_commands(repo_root)

    # Invoke Typer app
    # Typer/Click will automatically read from sys.argv when called
    try:
        app()
    except SystemExit as e:
        return e.code if e.code is not None else 0
    except Exception as e:
        print(f"Error executing command: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
