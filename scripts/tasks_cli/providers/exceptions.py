"""Exception hierarchy for provider operations.

Shared exceptions for ProcessProvider and future GitProvider.
All provider-specific errors inherit from ProviderError base class.

Standards compliance:
- Follows standards/typescript.md principle of explicit error types
- Supports structured error handling per standards/cross-cutting.md
"""

from typing import Sequence


class ProviderError(Exception):
    """Base exception for all provider operations."""
    pass


class ProcessError(ProviderError):
    """Base exception for process execution errors."""
    pass


class CommandFailed(ProcessError):
    """Raised when command exits with non-zero status without stderr.

    Attributes:
        cmd: Command that failed (list of strings)
        returncode: Non-zero exit code
    """

    def __init__(self, cmd: Sequence[str], returncode: int):
        """Initialize CommandFailed.

        Args:
            cmd: Command and arguments as list
            returncode: Non-zero exit code
        """
        self.cmd = cmd
        self.returncode = returncode
        cmd_str = ' '.join(cmd)
        super().__init__(f"Command failed with exit code {returncode}: {cmd_str}")


class NonZeroExitWithStdErr(ProcessError):
    """Raised when command exits with non-zero status and has stderr output.

    Attributes:
        cmd: Command that failed (list of strings)
        returncode: Non-zero exit code
        stderr: Standard error output
    """

    def __init__(self, cmd: Sequence[str], returncode: int, stderr: str):
        """Initialize NonZeroExitWithStdErr.

        Args:
            cmd: Command and arguments as list
            returncode: Non-zero exit code
            stderr: Standard error output
        """
        self.cmd = cmd
        self.returncode = returncode
        self.stderr = stderr
        cmd_str = ' '.join(cmd)
        stderr_preview = stderr[:200] if stderr else ''
        super().__init__(
            f"Command failed with exit code {returncode}: {cmd_str}\n"
            f"stderr: {stderr_preview}"
        )


class TimeoutExceeded(ProcessError):
    """Raised when command execution exceeds timeout limit.

    Attributes:
        cmd: Command that timed out (list of strings)
        timeout: Timeout limit in seconds
    """

    def __init__(self, cmd: Sequence[str], timeout: float):
        """Initialize TimeoutExceeded.

        Args:
            cmd: Command and arguments as list
            timeout: Timeout limit in seconds
        """
        self.cmd = cmd
        self.timeout = timeout
        cmd_str = ' '.join(cmd)
        super().__init__(f"Command timed out after {timeout}s: {cmd_str}")
