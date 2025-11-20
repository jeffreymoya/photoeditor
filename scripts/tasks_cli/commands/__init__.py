"""Typer-based command modules for task CLI.

Commands are organized by domain:
- tasks.py: Core task query commands (list, show, validate)
- workflow.py: Task lifecycle commands (pick, claim, complete) - TBD Wave 2
- context.py: Context cache operations - TBD Wave 3

For backward compatibility, this package also re-exports legacy command functions
from the commands.py module (note: commands.py is a file, this is commands/ package).
"""

# Re-export legacy command functions from parent's commands.py module
# Note: commands.py (file) lives alongside commands/ (package directory)
# This allows `from .commands import cmd_*` to work in __main__.py
import sys
from pathlib import Path

# Import from sibling commands.py module
# Note: commands.py uses relative imports, so we need to register it properly
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

        # Re-export all cmd_* functions
        cmd_add_exception = _legacy_commands.cmd_add_exception
        cmd_attach_evidence = _legacy_commands.cmd_attach_evidence
        cmd_attach_standard = _legacy_commands.cmd_attach_standard
        cmd_cleanup_exceptions = _legacy_commands.cmd_cleanup_exceptions
        cmd_collect_metrics = _legacy_commands.cmd_collect_metrics
        cmd_compare_metrics = _legacy_commands.cmd_compare_metrics
        cmd_generate_dashboard = _legacy_commands.cmd_generate_dashboard
        cmd_init_context = _legacy_commands.cmd_init_context
        cmd_list_evidence = _legacy_commands.cmd_list_evidence
        cmd_list_exceptions = _legacy_commands.cmd_list_exceptions
        cmd_list_quarantined = _legacy_commands.cmd_list_quarantined
        cmd_quarantine_task = _legacy_commands.cmd_quarantine_task
        cmd_record_qa = _legacy_commands.cmd_record_qa
        cmd_release_quarantine = _legacy_commands.cmd_release_quarantine
        cmd_resolve_exception = _legacy_commands.cmd_resolve_exception
        cmd_run_validation = _legacy_commands.cmd_run_validation
        cmd_verify_worktree = _legacy_commands.cmd_verify_worktree

        __all__ = [
            'cmd_add_exception',
            'cmd_attach_evidence',
            'cmd_attach_standard',
            'cmd_cleanup_exceptions',
            'cmd_collect_metrics',
            'cmd_compare_metrics',
            'cmd_generate_dashboard',
            'cmd_init_context',
            'cmd_list_evidence',
            'cmd_list_exceptions',
            'cmd_list_quarantined',
            'cmd_quarantine_task',
            'cmd_record_qa',
            'cmd_release_quarantine',
            'cmd_resolve_exception',
            'cmd_run_validation',
            'cmd_verify_worktree',
        ]
