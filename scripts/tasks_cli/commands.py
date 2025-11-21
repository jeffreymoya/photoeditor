"""CLI command handlers for task context cache operations.

This module serves as a backward-compatible re-export layer.
All command implementations have been decomposed into:
- commands/evidence.py - Evidence attachment commands
- commands/exceptions.py - Exception ledger commands
- commands/quarantine.py - Quarantine management commands
- commands/init_context.py - Context initialization
- commands/qa_commands.py - QA recording commands
- commands/validation_commands.py - Validation execution
- commands/worktree_commands.py - Worktree verification
- commands/metrics_commands.py - Metrics collection/dashboard
"""

# Exit codes per schemas doc section 6.1
EXIT_SUCCESS = 0
EXIT_GENERAL_ERROR = 1
EXIT_VALIDATION_ERROR = 10
EXIT_DRIFT_ERROR = 20
EXIT_BLOCKER_ERROR = 30
EXIT_IO_ERROR = 40
EXIT_GIT_ERROR = 50

# Re-export evidence commands
from .commands.evidence import (
    cmd_attach_evidence,
    cmd_list_evidence,
    cmd_attach_standard,
)

# Re-export exception commands
from .commands.exceptions import (
    cmd_add_exception,
    cmd_list_exceptions,
    cmd_resolve_exception,
    cmd_cleanup_exceptions,
)

# Re-export quarantine commands
from .commands.quarantine import (
    cmd_list_quarantined,
    cmd_release_quarantine,
    cmd_quarantine_task,
)

# Re-export context initialization
from .commands.init_context import cmd_init_context
from .commands.standards_helpers import (
    _extract_standards_citations,
    _build_standards_citations,
)

# Re-export QA commands
from .commands.qa_commands import (
    cmd_record_qa,
    _infer_command_type,
)

# Re-export validation commands
from .commands.validation_commands import (
    cmd_run_validation,
)

# Worktree commands migrated to Typer in S5.2 - no longer re-exported
# Use: python -m scripts.tasks_cli snapshot-worktree / verify-worktree / get-diff

# Re-export metrics commands
from .commands.metrics_commands import (
    cmd_collect_metrics,
    cmd_generate_dashboard,
    cmd_compare_metrics,
)

# Re-export common output helpers for backward compatibility
from .output import (
    print_json,
    is_json_mode,
    format_success_response,
    format_error_response
)

__all__ = [
    # Exit codes
    'EXIT_SUCCESS',
    'EXIT_GENERAL_ERROR',
    'EXIT_VALIDATION_ERROR',
    'EXIT_DRIFT_ERROR',
    'EXIT_BLOCKER_ERROR',
    'EXIT_IO_ERROR',
    'EXIT_GIT_ERROR',
    # Evidence commands
    'cmd_attach_evidence',
    'cmd_list_evidence',
    'cmd_attach_standard',
    # Exception commands
    'cmd_add_exception',
    'cmd_list_exceptions',
    'cmd_resolve_exception',
    'cmd_cleanup_exceptions',
    # Quarantine commands
    'cmd_list_quarantined',
    'cmd_release_quarantine',
    'cmd_quarantine_task',
    # Context commands
    'cmd_init_context',
    '_extract_standards_citations',
    '_build_standards_citations',
    # QA commands
    'cmd_record_qa',
    '_infer_command_type',
    # Validation commands
    'cmd_run_validation',
    # Worktree commands migrated to Typer in S5.2
    # Metrics commands
    'cmd_collect_metrics',
    'cmd_generate_dashboard',
    'cmd_compare_metrics',
    # Output helpers
    'print_json',
    'is_json_mode',
    'format_success_response',
    'format_error_response',
]
