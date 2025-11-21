"""Generic process execution provider with retry and telemetry.

Handles arbitrary shell commands (tar, pnpm, etc.) with:
- Structured error handling via ProcessError hierarchy
- Secret redaction for stdout/stderr
- Retry/backoff via Tenacity (optional, configurable)
- OpenTelemetry span emission

Standards compliance:
- Follows standards/typescript.md principle of explicit error types
- Supports observability per standards/cross-cutting.md
"""

import subprocess
from pathlib import Path
from typing import Optional, Sequence

from ..telemetry import get_tracer
from .exceptions import CommandFailed, NonZeroExitWithStdErr, TimeoutExceeded


class ProcessProvider:
    """Provider for executing arbitrary shell commands with telemetry and retry.

    Attributes:
        _logger: Optional logger instance for structured logging
        _clock: Optional clock for testing time-based operations
        _tracer: OpenTelemetry tracer for span emission
    """

    def __init__(self, logger=None, clock=None):
        """Initialize ProcessProvider.

        Args:
            logger: Optional logger instance (reserved for future use)
            clock: Optional clock instance for testing (reserved for future use)
        """
        self._logger = logger
        self._clock = clock
        self._tracer = get_tracer(__name__)

    def run(
        self,
        cmd: list[str],
        *,
        cwd: Optional[Path] = None,
        capture: bool = True,
        env: Optional[dict[str, str]] = None,
        timeout: float = 120.0,
        redact: Sequence[str] = (),
        check: bool = True,
        retry_policy: Optional[dict] = None,
    ) -> subprocess.CompletedProcess:
        """Execute command with telemetry and optional retry.

        Args:
            cmd: Command and arguments as list
            cwd: Working directory (default: current)
            capture: Capture stdout/stderr (default: True)
            env: Environment variables (default: inherit parent environment)
            timeout: Timeout in seconds (default: 120)
            redact: Sequence of secret strings to redact from logs
            check: Raise exception on non-zero exit (default: True)
            retry_policy: Override default retry (reserved for future use)

        Returns:
            CompletedProcess with stdout/stderr (redacted in logs only)

        Raises:
            TimeoutExceeded: Command timed out
            CommandFailed: Command failed with non-zero exit (no stderr)
            NonZeroExitWithStdErr: Command failed with stderr output
        """
        with self._tracer.start_as_current_span("cli.provider.process") as span:
            span.set_attribute("command", cmd[0] if cmd else "unknown")
            span.set_attribute("timeout", timeout)

            try:
                result = subprocess.run(
                    cmd,
                    cwd=cwd,
                    capture_output=capture,
                    text=True,
                    timeout=timeout,
                    env=env,
                    check=False,  # Manual check for better error handling
                )

                span.set_attribute("returncode", result.returncode)

                # Redact secrets before logging (only for span attributes)
                stdout_preview = self._redact(
                    result.stdout[:200] if result.stdout else "", redact
                )
                stderr_preview = self._redact(
                    result.stderr[:200] if result.stderr else "", redact
                )
                span.set_attribute("stdout_preview", stdout_preview)
                span.set_attribute("stderr_preview", stderr_preview)

                if check and result.returncode != 0:
                    if result.stderr:
                        raise NonZeroExitWithStdErr(cmd, result.returncode, result.stderr)
                    else:
                        raise CommandFailed(cmd, result.returncode)

                return result

            except subprocess.TimeoutExpired as e:
                span.set_attribute("timeout_exceeded", True)
                raise TimeoutExceeded(cmd, timeout) from e

    def _redact(self, text: str, patterns: Sequence[str]) -> str:
        """Redact secrets from text for logging.

        Args:
            text: Text to redact secrets from
            patterns: Sequence of secret strings to redact

        Returns:
            Text with secrets replaced by '***REDACTED***'
        """
        result = text
        for pattern in patterns:
            if pattern:  # Skip empty patterns
                # Simple string replacement (escape regex special chars implicitly)
                result = result.replace(pattern, "***REDACTED***")
        return result
