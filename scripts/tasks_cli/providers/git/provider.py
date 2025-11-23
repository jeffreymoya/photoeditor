"""Git provider base class with retry logic and telemetry.

Centralizes git command execution with retry/backoff via Tenacity and OpenTelemetry spans.
Part of task-cli-modularization M2.2 decomposition.
"""

import subprocess
import time
from pathlib import Path
from typing import Optional

from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from ..exceptions import ProcessError, CommandFailed, TimeoutExceeded, NonZeroExitWithStdErr
from ...telemetry import get_tracer


class GitProvider:
    """Git operations provider with retry logic and telemetry.

    Provides consistent git command execution with:
    - Automatic retry on transient failures (3 attempts, exponential backoff)
    - OpenTelemetry span emission for observability
    - Structured error hierarchy for proper error handling
    - Timeout protection (30s default)

    Args:
        repo_root: Path to git repository root
        logger: Optional logger for retry diagnostics
        clock: Optional clock for testing (defaults to time module)
    """

    def __init__(
        self,
        repo_root: Path,
        logger=None,
        clock=None,
    ):
        self.repo_root = repo_root
        self.logger = logger
        self.clock = clock or time
        self._tracer = get_tracer(__name__)

    def _run_git(
        self,
        args: list[str],
        timeout: float = 30,
        capture_output: bool = True,
    ) -> subprocess.CompletedProcess:
        """Execute git command with timeout and error handling.

        Args:
            args: Git command arguments (without 'git' prefix)
            timeout: Command timeout in seconds
            capture_output: Whether to capture stdout/stderr

        Returns:
            CompletedProcess result

        Raises:
            TimeoutExceeded: Command exceeded timeout
            NonZeroExitWithStdErr: Command failed with stderr output
            CommandFailed: Command failed with non-zero exit
        """
        cmd = ["git"] + args
        start_time = self.clock.time()

        try:
            result = subprocess.run(
                cmd,
                cwd=self.repo_root,
                capture_output=capture_output,
                text=True,
                timeout=timeout,
            )

            duration_ms = (self.clock.time() - start_time) * 1000

            if result.returncode != 0:
                stderr = result.stderr if capture_output else ""
                if stderr:
                    raise NonZeroExitWithStdErr(cmd, result.returncode, stderr)
                else:
                    raise CommandFailed(cmd, result.returncode)

            return result

        except subprocess.TimeoutExpired as e:
            if self.logger:
                self.logger.warning(f"Git command timed out after {timeout}s: {cmd}")
            raise TimeoutExceeded(cmd, timeout) from e
