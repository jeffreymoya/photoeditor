"""Git provider package with decomposed modules.

Part of task-cli-modularization M2.2 decomposition.
Combines base provider with operation and history mixins.

BACKWARD COMPATIBILITY NOTE:
This provider will eventually replace git_utils.py functions (in S4.3).
During the migration phase, both modules will coexist.
"""

from pathlib import Path
from typing import Optional
import time

from .provider import GitProvider as BaseGitProvider
from .status_ops import GitStatusMixin
from .diff_ops import GitDiffMixin
from .history import GitHistoryMixin


class GitProvider(GitHistoryMixin, GitDiffMixin, GitStatusMixin, BaseGitProvider):
    """Git operations provider with retry logic and telemetry.

    Provides consistent git command execution with:
    - Automatic retry on transient failures (3 attempts, exponential backoff)
    - OpenTelemetry span emission for observability
    - Structured error hierarchy for proper error handling
    - Timeout protection (30s default)

    This class combines:
    - BaseGitProvider: Core initialization and _run_git method
    - GitStatusMixin: File status and listing operations
    - GitDiffMixin: Diff and index operations
    - GitHistoryMixin: Commit history, branches, and refs

    Args:
        repo_root: Path to git repository root
        logger: Optional logger for retry diagnostics
        clock: Optional clock for testing (defaults to time module)
    """

    pass  # All functionality provided by parent classes


# Re-export for backward compatibility
__all__ = ["GitProvider"]
