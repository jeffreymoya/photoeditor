"""CLI command handlers for quarantine operations."""

from pathlib import Path
from typing import Dict, Any
import sys

from ..quarantine import (
    quarantine_task,
    list_quarantined,
    release_from_quarantine,
)
from ..output import (
    print_json,
    is_json_mode,
    format_success_response,
    format_error_response
)

# Exit codes per schemas doc section 6.1
EXIT_SUCCESS = 0
EXIT_GENERAL_ERROR = 1
EXIT_VALIDATION_ERROR = 10
EXIT_IO_ERROR = 40


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


def cmd_list_quarantined(args) -> int:
    """
    List quarantined tasks.

    Args:
        args: Parsed arguments with optional status filter

    Returns:
        Exit code
    """
    try:
        status_filter = args.status if hasattr(args, 'status') and args.status else None
        quarantined = list_quarantined(status_filter=status_filter)

        if is_json_mode():
            # Convert to dict for JSON serialization
            quarantined_dicts = [q.to_dict() for q in quarantined]
            print_success({"quarantined": quarantined_dicts, "count": len(quarantined_dicts)})
        else:
            if not quarantined:
                print("No quarantined tasks")
            else:
                print(f"Quarantined tasks ({len(quarantined)}):")
                for q in quarantined:
                    print(f"  🚫 {q.task_id}: {q.reason}")
                    print(f"     Quarantined: {q.quarantined_at}")

        return EXIT_SUCCESS

    except Exception as e:
        error = {
            "code": "E999",
            "name": "UnknownError",
            "message": str(e),
            "details": {},
            "recovery_action": "Check logs and retry"
        }
        print_error(error, exit_code=EXIT_GENERAL_ERROR)


def cmd_release_quarantine(args) -> int:
    """
    Release task from quarantine.

    Args:
        args: Parsed arguments with task_id

    Returns:
        Exit code
    """
    try:
        release_from_quarantine(task_id=args.task_id)

        if is_json_mode():
            print_success({"task_id": args.task_id, "status": "released"})
        else:
            print(f"✓ Released {args.task_id} from quarantine")

        return EXIT_SUCCESS

    except FileNotFoundError as e:
        error = {
            "code": "E041",
            "name": "NotFound",
            "message": str(e),
            "details": {"task_id": args.task_id},
            "recovery_action": "Verify task is currently quarantined"
        }
        print_error(error, exit_code=EXIT_IO_ERROR)

    except Exception as e:
        error = {
            "code": "E999",
            "name": "UnknownError",
            "message": str(e),
            "details": {},
            "recovery_action": "Check logs and retry"
        }
        print_error(error, exit_code=EXIT_GENERAL_ERROR)


def cmd_quarantine_task(args) -> int:
    """
    Quarantine a task.

    Args:
        args: Parsed arguments with task_id, reason, error_details

    Returns:
        Exit code
    """
    try:
        repo_root = Path.cwd()
        error_details = args.error_details if hasattr(args, 'error_details') and args.error_details else None

        entry_path = quarantine_task(
            task_id=args.task_id,
            reason=args.reason,
            error_details=error_details,
            repo_root=repo_root
        )

        if is_json_mode():
            print_success({"task_id": args.task_id, "reason": args.reason, "path": str(entry_path)})
        else:
            print(f"✓ Task {args.task_id} quarantined")
            print(f"  Reason: {args.reason}")
            print(f"  Entry: {entry_path}")

        return EXIT_SUCCESS

    except ValueError as e:
        error = {
            "code": "E010",
            "name": "ValidationError",
            "message": str(e),
            "details": {},
            "recovery_action": "Verify task_id and reason format"
        }
        print_error(error, exit_code=EXIT_VALIDATION_ERROR)

    except Exception as e:
        error = {
            "code": "E999",
            "name": "UnknownError",
            "message": str(e),
            "details": {},
            "recovery_action": "Check logs and retry"
        }
        print_error(error, exit_code=EXIT_GENERAL_ERROR)
