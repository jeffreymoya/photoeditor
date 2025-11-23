"""
Output formatting and stream management for task CLI.

Provides thread-safe output management via OutputChannel instances. All output now
uses dependency-injected OutputChannel objects passed via TaskCliContext, eliminating
global state for better testability and concurrent invocation support.

Key behaviors:
- JSON mode: JSON to stdout, warnings to stderr
- Text mode: All output to stdout
- Structured warning collection for context.warnings array
- Standardized JSON response format per schemas doc Section 6.3

Usage:
    from .output import OutputChannel

    # Create channel from CLI flags
    channel = OutputChannel.from_cli_flags(json_mode=True, verbose=False)

    # Or get from TaskCliContext
    ctx.output_channel.emit_json({"tasks": [...]})
    ctx.output_channel.emit_warning("Task TASK-1234 has malformed YAML")

    # Collect warnings for evidence
    warnings = ctx.output_channel.warnings_as_evidence()
"""

import json
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from io import StringIO
from typing import Any, Dict, List, Optional, TextIO


@dataclass
class OutputChannel:
    """
    Instance-based output channel that replaces global state.

    Provides thread-safe output management for CLI commands. Each command
    invocation should use its own OutputChannel instance to avoid state
    pollution in concurrent scenarios.

    Attributes:
        json_mode: When True, JSON output to stdout, warnings to stderr
        verbose: When True, emit verbose/debug output
        stdout: Stream for primary output (default: sys.stdout)
        stderr: Stream for warning output (default: sys.stderr)
    """

    json_mode: bool = False
    verbose: bool = False
    stdout: TextIO = field(default_factory=lambda: sys.stdout)
    stderr: TextIO = field(default_factory=lambda: sys.stderr)
    _warnings: List[Dict[str, str]] = field(default_factory=list)

    @classmethod
    def from_cli_flags(cls, json_mode: bool, verbose: bool = False) -> "OutputChannel":
        """Create OutputChannel from CLI flags."""
        return cls(json_mode=json_mode, verbose=verbose)

    def emit_json(self, data: Dict[str, Any]) -> None:
        """Output JSON data to stdout with consistent formatting."""
        output = json.dumps(data, indent=2, ensure_ascii=False)
        self.stdout.write(output + "\n")
        self.stdout.flush()

    def emit_text(self, message: str) -> None:
        """Output plain text to stdout."""
        self.stdout.write(message + "\n")
        self.stdout.flush()

    def emit_warning(self, message: str, level: str = "warning") -> None:
        """
        Output warning to appropriate stream and collect for evidence.

        In JSON mode: writes to stderr (keeps stdout clean for JSON)
        In text mode: writes to stdout
        """
        warning_record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": level,
            "message": message,
        }
        self._warnings.append(warning_record)

        formatted = f"[{level.upper()}] {message}"
        if self.json_mode:
            self.stderr.write(formatted + "\n")
            self.stderr.flush()
        else:
            self.stdout.write(formatted + "\n")
            self.stdout.flush()

    def emit_verbose(self, message: str) -> None:
        """Output verbose message (only if verbose mode enabled)."""
        if self.verbose:
            self.stderr.write(f"[VERBOSE] {message}\n")
            self.stderr.flush()

    def warnings_as_evidence(self) -> List[Dict[str, str]]:
        """Return collected warnings for inclusion in context.warnings."""
        return sorted(self._warnings, key=lambda w: w["timestamp"])

    def clear_warnings(self) -> None:
        """Clear collected warnings."""
        self._warnings = []

    # Compatibility methods for backward compatibility with commands
    # These delegate to the proper emit_* methods

    def set_json_mode(self, enabled: bool) -> None:
        """
        Set JSON output mode.

        Compatibility method for commands that need to toggle JSON mode.
        Prefer setting json_mode at construction via from_cli_flags().

        Args:
            enabled: True to enable JSON mode, False for text mode
        """
        self.json_mode = enabled

    def print_json(self, data: Dict[str, Any]) -> None:
        """
        Print JSON data (compatibility wrapper).

        Delegates to emit_json(). Prefer calling emit_json() directly.

        Args:
            data: Dictionary to serialize as JSON
        """
        self.emit_json(data)

    def print_warning(self, message: str, level: str = "warning") -> None:
        """
        Print warning (compatibility wrapper).

        Delegates to emit_warning(). Prefer calling emit_warning() directly.

        Args:
            message: Warning message
            level: Severity level
        """
        self.emit_warning(message, level)


class NullOutputChannel(OutputChannel):
    """OutputChannel that discards all output (for tests/silent mode)."""

    def __init__(self) -> None:
        super().__init__(
            json_mode=False,
            verbose=False,
            stdout=StringIO(),
            stderr=StringIO(),
        )

    def emit_json(self, data: Dict[str, Any]) -> None:
        """Discard JSON output."""
        pass

    def emit_text(self, message: str) -> None:
        """Discard text output."""
        pass

    def emit_warning(self, message: str, level: str = "warning") -> None:
        """Collect warning but discard output."""
        warning_record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": level,
            "message": message,
        }
        self._warnings.append(warning_record)

    def emit_verbose(self, message: str) -> None:
        """Discard verbose output."""
        pass


class BufferingOutputChannel(OutputChannel):
    """OutputChannel that buffers all output for test assertions."""

    def __init__(self, json_mode: bool = False, verbose: bool = False) -> None:
        self._stdout_buffer = StringIO()
        self._stderr_buffer = StringIO()
        super().__init__(
            json_mode=json_mode,
            verbose=verbose,
            stdout=self._stdout_buffer,
            stderr=self._stderr_buffer,
        )

    def get_stdout(self) -> str:
        """Return buffered stdout content."""
        return self._stdout_buffer.getvalue()

    def get_stderr(self) -> str:
        """Return buffered stderr content."""
        return self._stderr_buffer.getvalue()

    def get_json_output(self) -> List[Dict[str, Any]]:
        """Parse and return all JSON objects emitted to stdout."""
        content = self.get_stdout().strip()
        if not content:
            return []

        # Try parsing entire content as single JSON first (handles indented)
        try:
            return [json.loads(content)]
        except json.JSONDecodeError:
            pass

        # Fallback: try line-by-line for newline-delimited JSON
        results = []
        for line in content.split("\n"):
            if line.strip():
                try:
                    results.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
        return results

    def clear(self) -> None:
        """Clear all buffers and warnings."""
        self._stdout_buffer = StringIO()
        self._stderr_buffer = StringIO()
        self.stdout = self._stdout_buffer
        self.stderr = self._stderr_buffer
        self.clear_warnings()


def format_json_response(
    success: bool,
    data: Optional[Dict[str, Any]] = None,
    error: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Create standardized JSON response structure.

    Implements format from schemas doc Section 6.3. Ensures consistent
    response structure across all CLI commands.

    Format:
        {
            "success": bool,
            "data": dict | null,
            "error": dict | null
        }

    Error format (when success=False):
        {
            "success": false,
            "data": null,
            "error": {
                "code": str,
                "message": str,
                "details": dict | null
            }
        }

    Args:
        success: Whether the operation succeeded
        data: Response data (when success=True)
        error: Error details (when success=False)

    Returns:
        Standardized response dictionary
    """
    response: Dict[str, Any] = {
        "success": success,
        "data": data,
        "error": error
    }

    return response


def format_error_response(
    code: str,
    message: str,
    details: Optional[Dict[str, Any]] = None,
    name: Optional[str] = None,
    recovery_action: Optional[str] = None
) -> Dict[str, Any]:
    """
    Create standardized error response.

    Convenience function for formatting error responses with consistent
    structure. Per schemas doc Section 6.3, all error responses must include
    code, name, message, details, and recovery_action.

    Args:
        code: Error code (e.g., "E001", "E040")
        message: Human-readable error message
        details: Optional additional error details
        name: Error name (e.g., "ValidationError", "FileNotFound")
        recovery_action: Suggested recovery action for the user

    Returns:
        Standardized error response dictionary
    """
    error_obj = {
        "code": code,
        "name": name or "Error",
        "message": message,
        "details": details or {},
        "recovery_action": recovery_action or "Check error details and retry"
    }

    return format_json_response(success=False, data=None, error=error_obj)


def format_success_response(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Create standardized success response.

    Convenience function for formatting success responses with consistent
    structure.

    Args:
        data: Response data

    Returns:
        Standardized success response dictionary
    """
    return format_json_response(success=True, data=data, error=None)
