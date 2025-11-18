"""
Output formatting and stream management for task CLI.

Implements warning channel separation per task-context-cache-hardening proposal
Section 3.2. Ensures JSON output goes to stdout only, warnings go to stderr when
--format json is used, and all JSON output is machine-parseable (no interleaved
warnings).

Key behaviors:
- JSON mode: JSON to stdout, warnings to stderr
- Text mode: All output to stdout
- Structured warning collection for context.warnings array
- Standardized JSON response format per schemas doc Section 6.3

Usage:
    from .output import set_json_mode, print_json, print_warning, add_warning

    set_json_mode(args.format == 'json')

    # Print JSON response (stdout only)
    print_json({"tasks": [...]})

    # Print warning (stderr in JSON mode, stdout in text mode)
    print_warning("Task TASK-1234 has malformed YAML")

    # Collect warning for later inclusion in context
    add_warning("Task TASK-1234 has malformed YAML", level="warning")
"""

import json
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


# Global state
_JSON_MODE = False
_WARNINGS: List[Dict[str, str]] = []


def set_json_mode(enabled: bool) -> None:
    """
    Enable or disable JSON output mode.

    When JSON mode is enabled:
    - print_json() outputs to stdout
    - print_warning() outputs to stderr

    When JSON mode is disabled:
    - All output goes to stdout

    Args:
        enabled: True to enable JSON mode, False for text mode
    """
    global _JSON_MODE
    _JSON_MODE = enabled


def is_json_mode() -> bool:
    """
    Check if JSON output mode is enabled.

    Returns:
        True if JSON mode is active, False otherwise
    """
    return _JSON_MODE


def print_json(data: Dict[str, Any]) -> None:
    """
    Print JSON-formatted data to stdout.

    Always outputs to stdout regardless of mode. Uses consistent formatting
    with 2-space indentation and UTF-8 encoding.

    Args:
        data: Dictionary to serialize as JSON
    """
    output = json.dumps(data, indent=2, ensure_ascii=False)
    sys.stdout.write(output + '\n')
    sys.stdout.flush()


def print_warning(message: str, level: str = "warning") -> None:
    """
    Print warning message to appropriate stream based on mode.

    In JSON mode: writes to stderr (prevents pollution of JSON output)
    In text mode: writes to stdout (normal console output)

    Format: [LEVEL] message

    Args:
        message: Warning message text
        level: Severity level (default: "warning")
    """
    formatted = f"[{level.upper()}] {message}"

    if _JSON_MODE:
        # JSON mode: warnings to stderr to keep stdout clean for JSON
        sys.stderr.write(formatted + '\n')
        sys.stderr.flush()
    else:
        # Text mode: warnings to stdout like normal console output
        sys.stdout.write(formatted + '\n')
        sys.stdout.flush()


def add_warning(message: str, level: str = "warning") -> None:
    """
    Add warning to collection and print it.

    Warnings are collected for later inclusion in context.warnings array.
    Also prints the warning immediately using print_warning().

    Args:
        message: Warning message text
        level: Severity level (default: "warning")
    """
    global _WARNINGS

    warning_record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": level,
        "message": message
    }

    _WARNINGS.append(warning_record)
    print_warning(message, level)


def collect_warnings() -> List[Dict[str, str]]:
    """
    Return collected warnings for inclusion in context.warnings array.

    Each warning contains:
    - timestamp: ISO 8601 timestamp in UTC
    - level: Severity level (e.g., "warning", "error")
    - message: Warning message text

    Returns:
        List of warning dictionaries sorted by timestamp
    """
    return sorted(_WARNINGS, key=lambda w: w["timestamp"])


def clear_warnings() -> None:
    """
    Clear collected warnings.

    Useful for resetting state between commands or tests.
    """
    global _WARNINGS
    _WARNINGS = []


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
    details: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Create standardized error response.

    Convenience function for formatting error responses with consistent
    structure.

    Args:
        code: Error code (e.g., "VALIDATION_ERROR", "NOT_FOUND")
        message: Human-readable error message
        details: Optional additional error details

    Returns:
        Standardized error response dictionary
    """
    error_obj = {
        "code": code,
        "message": message,
        "details": details
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
