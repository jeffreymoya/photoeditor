"""CLI command handlers for task context cache operations."""

from pathlib import Path
from typing import Dict, Any
import sys
import json

from .context_store import TaskContextStore
from .exception_ledger import (
    add_exception,
    list_exceptions,
    resolve_exception,
    cleanup_exception
)
from .quarantine import (
    quarantine_task,
    list_quarantined,
    release_from_quarantine
)
from .output import (
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
EXIT_BLOCKER_ERROR = 30
EXIT_IO_ERROR = 40
EXIT_GIT_ERROR = 50


def print_success(data: Dict[str, Any]) -> None:
    """Print success response in JSON mode or text mode."""
    if is_json_mode():
        response = format_success_response(data)
        print_json(response)
    # In text mode, caller handles output


def print_error(error: Dict[str, Any], exit_code: int) -> None:
    """Print error response and exit."""
    if is_json_mode():
        response = format_error_response(
            code=error["code"],
            message=error["message"],
            details=error.get("details")
        )
        print_json(response)
    else:
        print(f"Error [{error['code']}]: {error['message']}", file=sys.stderr)
        if "recovery_action" in error:
            print(f"Recovery: {error['recovery_action']}", file=sys.stderr)
    sys.exit(exit_code)


def cmd_attach_evidence(args) -> int:
    """
    Attach evidence to task context.

    Args:
        args: Parsed arguments with task_id, type, path, description, metadata

    Returns:
        Exit code
    """
    try:
        repo_root = Path.cwd()
        context_store = TaskContextStore(task_id=args.task_id, repo_root=repo_root)

        # Parse metadata if provided
        metadata = None
        if hasattr(args, 'metadata') and args.metadata:
            try:
                metadata = json.loads(args.metadata)
            except json.JSONDecodeError as e:
                error = {
                    "code": "E040",
                    "name": "InvalidMetadata",
                    "message": "Failed to parse metadata JSON",
                    "details": {"error": str(e)},
                    "recovery_action": "Provide valid JSON for --metadata"
                }
                print_error(error, exit_code=EXIT_VALIDATION_ERROR)

        # Attach evidence
        evidence = context_store.attach_evidence(
            artifact_type=args.type,
            path=Path(args.path),
            description=args.description,
            metadata=metadata
        )

        if is_json_mode():
            print_success(evidence)
        else:
            print(f"✓ Evidence attached: {evidence['id']}")
            print(f"  Type: {evidence['type']}")
            print(f"  Path: {evidence['path']}")

        return EXIT_SUCCESS

    except FileNotFoundError as e:
        error = {
            "code": "E041",
            "name": "FileNotFound",
            "message": str(e),
            "details": {"path": args.path},
            "recovery_action": "Verify file path exists"
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


def cmd_list_evidence(args) -> int:
    """
    List evidence attachments for a task.

    Args:
        args: Parsed arguments with task_id

    Returns:
        Exit code
    """
    try:
        repo_root = Path.cwd()
        context_store = TaskContextStore(task_id=args.task_id, repo_root=repo_root)

        evidence_list = context_store.list_evidence()

        if is_json_mode():
            print_success({"evidence": evidence_list, "count": len(evidence_list)})
        else:
            if not evidence_list:
                print("No evidence attachments found")
            else:
                print(f"Evidence attachments for {args.task_id}:")
                for ev in evidence_list:
                    print(f"  - {ev['id']}: {ev['type']} - {ev['description']}")

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


def cmd_attach_standard(args) -> int:
    """
    Attach standards excerpt to task context.

    Args:
        args: Parsed arguments with task_id, file, section

    Returns:
        Exit code
    """
    try:
        repo_root = Path.cwd()
        context_store = TaskContextStore(task_id=args.task_id, repo_root=repo_root)

        # Extract and cache excerpt
        excerpt = context_store.extract_standards_excerpt(
            standards_file=args.file,
            section_heading=args.section
        )

        if is_json_mode():
            print_success(excerpt)
        else:
            print(f"✓ Standards excerpt attached: {excerpt['excerpt_id']}")
            print(f"  File: {excerpt['file']}")
            print(f"  Section: {excerpt['section']}")
            print(f"  Lines: {excerpt['line_span'][0]}-{excerpt['line_span'][1]}")

        return EXIT_SUCCESS

    except FileNotFoundError:
        error = {
            "code": "E041",
            "name": "FileNotFound",
            "message": f"Standards file not found: {args.file}",
            "details": {"file": args.file},
            "recovery_action": "Verify standards file path"
        }
        print_error(error, exit_code=EXIT_IO_ERROR)

    except ValueError:
        error = {
            "code": "E010",
            "name": "SectionNotFound",
            "message": f"Section not found: {args.section}",
            "details": {"section": args.section},
            "recovery_action": "Check section heading exists in standards file"
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
            parse_error=args.message,
            owner=args.owner if hasattr(args, 'owner') and args.owner else None
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
