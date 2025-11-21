"""Legacy CLI command handlers for validation operations."""

from pathlib import Path
from typing import Dict, Any
import sys

from ..output import (
    print_json,
    is_json_mode,
    format_success_response,
    format_error_response
)
from ..validation import execute_validation_command

# Exit codes per schemas doc section 6.1
EXIT_SUCCESS = 0
EXIT_GENERAL_ERROR = 1
EXIT_VALIDATION_ERROR = 10
EXIT_BLOCKER_ERROR = 30


def print_success(data: Dict[str, Any]) -> None:
    """Print success response in JSON mode or text mode."""
    if is_json_mode():
        response = format_success_response(data)
        print_json(response)


def print_error(error: Dict[str, Any], exit_code: int) -> None:
    """Print error response and exit."""
    if is_json_mode():
        response = format_error_response(
            code=error["code"],
            message=error["message"],
            details=error.get("details"),
            name=error.get("name"),
            recovery_action=error.get("recovery_action")
        )
        print_json(response)
    else:
        print(f"Error [{error['code']}]: {error['message']}", file=sys.stderr)
        if "recovery_action" in error:
            print(f"Recovery: {error['recovery_action']}", file=sys.stderr)
    sys.exit(exit_code)


def cmd_run_validation(args) -> int:
    """
    Run validation command with all features.

    Args:
        args: Parsed arguments with task_id, command_id, command, and other options

    Returns:
        Exit code matching validation result
    """
    try:
        repo_root = Path.cwd()

        from ..models import ValidationCommand, RetryPolicy

        env_dict = {}
        if hasattr(args, 'env_vars') and args.env_vars:
            for env_str in args.env_vars:
                key, value = env_str.split('=', 1)
                env_dict[key] = value

        validation_cmd = ValidationCommand(
            id=args.command_id,
            command=args.command if hasattr(args, 'command') else "echo 'placeholder'",
            description=args.description if hasattr(args, 'description') else "Validation command",
            cwd=args.cwd if hasattr(args, 'cwd') else str(repo_root),
            package=args.package if hasattr(args, 'package') else None,
            env=env_dict,
            expected_paths=args.expected_paths if hasattr(args, 'expected_paths') else [],
            blocker_id=args.blocker_id if hasattr(args, 'blocker_id') else None,
            timeout_ms=args.timeout_ms if hasattr(args, 'timeout_ms') else 120000,
            retry_policy=RetryPolicy(max_attempts=1, backoff_ms=0),
            criticality=args.criticality if hasattr(args, 'criticality') else "error",
            expected_exit_codes=args.expected_exit_codes if hasattr(args, 'expected_exit_codes') else [0]
        )

        result = execute_validation_command(validation_cmd, args.task_id, repo_root)

        if is_json_mode():
            print_success(result)
        else:
            if result.get("skipped"):
                print(f"⊘ Validation skipped: {result['skip_reason']}")
            elif result.get("success"):
                print(f"✓ Validation passed: {args.command_id}")
            else:
                print(f"✗ Validation failed: {args.command_id}")
                print(f"  Exit code: {result.get('exit_code')}")

        if result.get("skipped"):
            return EXIT_BLOCKER_ERROR
        elif result.get("success"):
            return EXIT_SUCCESS
        else:
            return EXIT_VALIDATION_ERROR

    except Exception as e:
        error = {
            "code": "E999",
            "name": "UnknownError",
            "message": str(e),
            "details": {},
            "recovery_action": "Check logs and retry"
        }
        print_error(error, exit_code=EXIT_GENERAL_ERROR)
