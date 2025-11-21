"""Provider layer for external process and git operations.

Provides structured interfaces for:
- ProcessProvider: Arbitrary shell commands (tar, pnpm, etc.)
- GitProvider: Git operations with retry/telemetry (S4.1)

All providers share common exception hierarchy and telemetry integration.

BACKWARD COMPATIBILITY NOTE:
GitProvider will eventually replace git_utils.py functions (in S4.3).
During the migration phase, both modules will coexist.
"""

from .exceptions import (
    ProviderError,
    ProcessError,
    CommandFailed,
    NonZeroExitWithStdErr,
    TimeoutExceeded,
)
from .git import GitProvider
from .process import ProcessProvider

__all__ = [
    'ProviderError',
    'ProcessError',
    'CommandFailed',
    'NonZeroExitWithStdErr',
    'TimeoutExceeded',
    'GitProvider',
    'ProcessProvider',
]
