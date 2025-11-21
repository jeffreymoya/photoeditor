"""CLI command handlers for exception ledger operations."""

from typing import Dict, Any, Optional, TYPE_CHECKING
import sys

if TYPE_CHECKING:
    import typer
    from ..context import TaskCliContext

from ..exception_ledger import (
    add_exception,
    list_exceptions,
    resolve_exception,
    cleanup_exception
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


def cmd_add_exception(args) -> int:
    """
    Add exception to ledger.

    Args:
        args: Parsed arguments with task_id, exception_type, message, owner

    Returns:
        Exit code
    """
    try:
        add_exception(
            task_id=args.task_id,
            exception_type=args.exception_type,
            parse_error=args.message
        )

        if is_json_mode():
            print_success({"task_id": args.task_id, "exception_type": args.exception_type})
        else:
            print(f"✓ Exception added for {args.task_id}")
            print(f"  Type: {args.exception_type}")

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


def cmd_list_exceptions(args) -> int:
    """
    List exceptions from ledger.

    Args:
        args: Parsed arguments with optional status filter

    Returns:
        Exit code
    """
    try:
        status_filter = args.status if hasattr(args, 'status') and args.status else None
        exceptions = list_exceptions(status_filter=status_filter)

        # Convert to dicts for JSON serialization
        exception_dicts = [exc.to_dict() for exc in exceptions]

        if is_json_mode():
            print_success({"exceptions": exception_dicts, "count": len(exception_dicts)})
        else:
            if not exception_dicts:
                print("No exceptions found")
            else:
                print(f"Exceptions ({len(exception_dicts)}):")
                for exc in exception_dicts:
                    status_icon = "🔴" if exc['remediation']['status'] == 'open' else "✅"
                    print(f"  {status_icon} {exc['task_id']}: {exc['exception_type']}")
                    if exc.get('parse_error'):
                        print(f"     Error: {exc['parse_error'][:80]}...")

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


def cmd_resolve_exception(args) -> int:
    """
    Resolve exception in ledger.

    Args:
        args: Parsed arguments with task_id, notes

    Returns:
        Exit code
    """
    try:
        notes = args.notes if hasattr(args, 'notes') and args.notes else "Resolved"
        resolve_exception(task_id=args.task_id, notes=notes)

        if is_json_mode():
            print_success({"task_id": args.task_id, "status": "resolved"})
        else:
            print(f"✓ Exception resolved for {args.task_id}")

        return EXIT_SUCCESS

    except ValueError as e:
        error = {
            "code": "E010",
            "name": "NotFound",
            "message": str(e),
            "details": {"task_id": args.task_id},
            "recovery_action": "Verify task_id exists in exception ledger"
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


def cmd_cleanup_exceptions(args) -> int:
    """
    Cleanup exceptions based on trigger.

    Args:
        args: Parsed arguments with task_id, trigger

    Returns:
        Exit code
    """
    try:
        trigger = args.trigger if hasattr(args, 'trigger') and args.trigger else "manual"
        cleanup_exception(task_id=args.task_id, trigger=trigger)

        if is_json_mode():
            print_success({"task_id": args.task_id, "trigger": trigger})
        else:
            print(f"✓ Exception cleanup for {args.task_id} (trigger: {trigger})")

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


# Typer registration

def register_exception_commands(app: "typer.Typer", ctx: "TaskCliContext") -> None:
    """
    Register Typer exception commands with the app.

    Args:
        app: Typer app instance to register commands with
        ctx: TaskCliContext to inject into commands
    """
    import typer

    @app.command("add-exception")
    def add_exception_cmd(
        task_id: str = typer.Argument(..., help="Task ID"),
        exception_type: str = typer.Option(..., "--type", "-t", help="Exception type"),
        message: str = typer.Option(..., "--message", "-m", help="Exception message")
    ):
        """Add exception to ledger."""
        class Args:
            pass
        args = Args()
        args.task_id = task_id
        args.exception_type = exception_type
        args.message = message
        exit_code = cmd_add_exception(args)
        raise typer.Exit(code=exit_code or 0)

    @app.command("list-exceptions")
    def list_exceptions_cmd(
        status: Optional[str] = typer.Option(None, "--status", "-s", help="Filter by status")
    ):
        """List exceptions from ledger."""
        class Args:
            pass
        args = Args()
        args.status = status
        exit_code = cmd_list_exceptions(args)
        raise typer.Exit(code=exit_code or 0)

    @app.command("resolve-exception")
    def resolve_exception_cmd(
        task_id: str = typer.Argument(..., help="Task ID"),
        notes: Optional[str] = typer.Option(None, "--notes", "-n", help="Resolution notes")
    ):
        """Resolve exception in ledger."""
        class Args:
            pass
        args = Args()
        args.task_id = task_id
        args.notes = notes
        exit_code = cmd_resolve_exception(args)
        raise typer.Exit(code=exit_code or 0)

    @app.command("cleanup-exceptions")
    def cleanup_exceptions_cmd(
        task_id: str = typer.Argument(..., help="Task ID"),
        trigger: Optional[str] = typer.Option("manual", "--trigger", "-t", help="Cleanup trigger")
    ):
        """Cleanup exceptions based on trigger."""
        class Args:
            pass
        args = Args()
        args.task_id = task_id
        args.trigger = trigger
        exit_code = cmd_cleanup_exceptions(args)
        raise typer.Exit(code=exit_code or 0)
