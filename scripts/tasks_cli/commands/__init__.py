"""Typer-based command modules for task CLI.

Commands are organized by domain:
- tasks.py: Core task query commands (list, show, validate)
- workflow.py: Task lifecycle commands (pick, claim, complete)
- context.py: Context cache operations
- graph.py: Dependency graph commands
- evidence.py: Evidence management commands
- exceptions.py: Exception ledger commands
- quarantine.py: Task quarantine commands

For backward compatibility, this package also re-exports legacy command functions
from the commands.py module (note: commands.py is a file, this is commands/ package).
"""

# Import from decomposed command modules
from .evidence import (
    cmd_attach_evidence,
    cmd_list_evidence,
    cmd_attach_standard,
)
from .exceptions import (
    cmd_add_exception,
    cmd_list_exceptions,
    cmd_resolve_exception,
    cmd_cleanup_exceptions,
)
from .quarantine import (
    cmd_list_quarantined,
    cmd_release_quarantine,
    cmd_quarantine_task,
)

# Re-export remaining legacy command functions from parent's commands.py module
# Note: commands.py (file) lives alongside commands/ (package directory)
import sys
from pathlib import Path

parent_dir = Path(__file__).parent.parent
commands_file = parent_dir / "commands.py"

if commands_file.exists():
    import importlib.util
    # Use tasks_cli.commands_legacy as module name to allow relative imports
    spec = importlib.util.spec_from_file_location("tasks_cli.commands_legacy", commands_file)
    if spec and spec.loader:
        _legacy_commands = importlib.util.module_from_spec(spec)
        sys.modules['tasks_cli.commands_legacy'] = _legacy_commands
        spec.loader.exec_module(_legacy_commands)

        # Re-export remaining cmd_* functions not yet decomposed
        cmd_collect_metrics = _legacy_commands.cmd_collect_metrics
        cmd_compare_metrics = _legacy_commands.cmd_compare_metrics
        cmd_generate_dashboard = _legacy_commands.cmd_generate_dashboard
        cmd_init_context = _legacy_commands.cmd_init_context
        cmd_run_validation = _legacy_commands.cmd_run_validation
        # cmd_record_qa migrated to Typer in S5.3
        # cmd_verify_worktree migrated to Typer in S5.2

__all__ = [
    # Evidence commands (from evidence.py)
    'cmd_attach_evidence',
    'cmd_list_evidence',
    'cmd_attach_standard',
    # Exception commands (from exceptions.py)
    'cmd_add_exception',
    'cmd_list_exceptions',
    'cmd_resolve_exception',
    'cmd_cleanup_exceptions',
    # Quarantine commands (from quarantine.py)
    'cmd_list_quarantined',
    'cmd_release_quarantine',
    'cmd_quarantine_task',
    # Remaining legacy commands (from commands.py)
    'cmd_collect_metrics',
    'cmd_compare_metrics',
    'cmd_generate_dashboard',
    'cmd_init_context',
    'cmd_run_validation',
    # cmd_record_qa migrated to Typer in S5.3
    # cmd_verify_worktree migrated to Typer in S5.2
]
