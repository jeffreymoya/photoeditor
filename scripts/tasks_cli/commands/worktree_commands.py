"""Legacy CLI command handlers for worktree verification."""

from pathlib import Path
from typing import Dict, Any
import sys

from ..context_store import (
    TaskContextStore,
    DriftError,
    ContextNotFoundError,
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
EXIT_DRIFT_ERROR = 20


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


def cmd_verify_worktree(args) -> int:
    """
    Verify working tree matches expected state from previous agent.

    Uses SHA256 verification via TaskContextStore.verify_worktree_state() to detect
    drift, tampered files, and mismatched diffs.

    Args:
        args: Parsed arguments with task_id, expected_agent

    Returns:
        Exit code (DRIFT_ERROR if drift detected)
    """
    try:
        repo_root = Path.cwd()

        if not hasattr(args, 'expected_agent') or not args.expected_agent:
            error = {
                "code": "E011",
                "name": "MissingRequiredArgument",
                "message": "--expected-agent is required for verify-worktree",
                "details": {},
                "recovery_action": "Specify which agent's snapshot to verify against (implementer, reviewer, validator)"
            }
            print_error(error, exit_code=EXIT_VALIDATION_ERROR)

        context_store = TaskContextStore(repo_root)

        try:
            context_store.verify_worktree_state(
                task_id=args.task_id,
                expected_agent=args.expected_agent
            )

            if is_json_mode():
                print_success({
                    "task_id": args.task_id,
                    "expected_agent": args.expected_agent,
                    "drift_detected": False
                })
            else:
                print(f"✓ Working tree verified against {args.expected_agent} snapshot for {args.task_id}")
                print("  No drift detected")

            return EXIT_SUCCESS

        except DriftError as e:
            if is_json_mode():
                print_json({
                    "success": False,
                    "drift_detected": True,
                    "task_id": args.task_id,
                    "expected_agent": args.expected_agent,
                    "error": str(e)
                })
            else:
                print(f"⚠ Drift detected for {args.task_id} ({args.expected_agent} snapshot):", file=sys.stderr)
                print(f"  {e}", file=sys.stderr)

            return EXIT_DRIFT_ERROR

        except ContextNotFoundError as e:
            error = {
                "code": "E020",
                "name": "ContextNotFoundError",
                "message": str(e),
                "details": {"task_id": args.task_id, "expected_agent": args.expected_agent},
                "recovery_action": "Ensure context exists and agent has created a snapshot"
            }
            print_error(error, exit_code=EXIT_DRIFT_ERROR)

    except Exception as e:
        error = {
            "code": "E999",
            "name": "UnknownError",
            "message": str(e),
            "details": {},
            "recovery_action": "Check logs and retry"
        }
        print_error(error, exit_code=EXIT_GENERAL_ERROR)
