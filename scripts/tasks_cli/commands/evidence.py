"""CLI command handlers for evidence management operations."""

from pathlib import Path
from typing import Dict, Any
import sys
import json

from ..context_store import TaskContextStore
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
        context_store = TaskContextStore(repo_root)

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
            task_id=args.task_id,
            artifact_type=args.type,
            artifact_path=Path(args.path),
            description=args.description,
            metadata=metadata
        )

        if is_json_mode():
            print_success(evidence.to_dict())
        else:
            print(f"✓ Evidence attached: {evidence.id}")
            print(f"  Type: {evidence.type}")
            print(f"  Path: {evidence.path}")

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
        context_store = TaskContextStore(repo_root)

        evidence_list = context_store.list_evidence(task_id=args.task_id)

        if is_json_mode():
            print_success({"evidence": [e.to_dict() for e in evidence_list], "count": len(evidence_list)})
        else:
            if not evidence_list:
                print("No evidence attachments found")
            else:
                print(f"Evidence attachments for {args.task_id}:")
                for ev in evidence_list:
                    print(f"  - {ev.id}: {ev.type} - {ev.description}")

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
        context_store = TaskContextStore(repo_root)

        # Extract and cache excerpt
        excerpt = context_store.extract_standards_excerpt(
            task_id=args.task_id,
            standards_file=args.file,
            section_heading=args.section
        )

        if is_json_mode():
            print_success(excerpt.to_dict())
        else:
            print(f"✓ Standards excerpt attached: {excerpt.excerpt_id}")
            print(f"  File: {excerpt.file}")
            print(f"  Section: {excerpt.section}")
            print(f"  Lines: {excerpt.line_span}")

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
