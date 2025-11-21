"""Legacy CLI command handlers for QA operations."""

from pathlib import Path
from typing import Dict, Any
import sys
import json
from datetime import datetime, timezone
import hashlib

from ..context_store import (
    TaskContextStore,
    QACommandResult,
    QAResults
)
from ..providers import GitProvider
from ..qa_parsing import parse_qa_log
from ..output import (
    print_json,
    is_json_mode,
    format_success_response,
    format_error_response
)

# Exit codes per schemas doc section 6.1
EXIT_SUCCESS = 0
EXIT_GENERAL_ERROR = 1
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


def _infer_command_type(command: str) -> str:
    """
    Infer QA command type from command string.

    Maps common command patterns to standard types: lint, typecheck, test, coverage.
    Falls back to 'unknown' if no pattern matches.
    """
    command_lower = command.lower()

    if any(pattern in command_lower for pattern in ['lint', 'eslint', 'ruff', 'flake8', 'pylint']):
        return 'lint'

    if any(pattern in command_lower for pattern in ['typecheck', 'tsc', 'pyright', 'mypy']):
        return 'typecheck'

    if any(pattern in command_lower for pattern in ['coverage', 'cov']):
        return 'coverage'

    if any(pattern in command_lower for pattern in ['test', 'jest', 'pytest', 'vitest']):
        return 'test'

    return 'unknown'


def cmd_record_qa(args) -> int:
    """
    Record QA command results in context.validation_baseline.initial_results.

    Args:
        args: Parsed arguments with task_id, command, exit_code, log_path

    Returns:
        Exit code
    """
    try:
        repo_root = Path.cwd()
        context_store = TaskContextStore(repo_root)

        log_path = Path(args.log_path)

        git_provider = GitProvider(repo_root)
        try:
            git_sha = git_provider.get_current_commit()
        except Exception:
            git_sha = None

        qa_summary = None
        log_sha256 = None
        if log_path.exists():
            command_type = getattr(args, 'command_type', None) or _infer_command_type(args.command)
            qa_summary = parse_qa_log(log_path, command_type)
            log_sha256 = hashlib.sha256(log_path.read_bytes()).hexdigest()

        command_id = getattr(args, 'command_id', None)
        if not command_id:
            context = context_store.get_context(args.task_id)
            if context and context.immutable.task_snapshot.validation_commands:
                matching_cmd = next(
                    (cmd for cmd in context.immutable.task_snapshot.validation_commands
                     if cmd.get('command') == args.command),
                    None
                )
                if matching_cmd:
                    command_id = matching_cmd.get('id')

        if not command_id:
            command_id = hashlib.sha256(args.command.encode('utf-8')).hexdigest()[:8]

        duration_ms = getattr(args, 'duration_ms', 0)

        evidence_log_path = None
        if log_path.exists():
            evidence_attachment = context_store.attach_evidence(
                task_id=args.task_id,
                artifact_type="qa_output",
                artifact_path=log_path,
                description=f"QA output: {args.command}",
                metadata={
                    "command": args.command,
                    "exit_code": args.exit_code,
                    "duration_ms": duration_ms
                }
            )
            evidence_log_path = evidence_attachment.path

        qa_command_result = QACommandResult(
            command_id=command_id,
            command=args.command,
            exit_code=args.exit_code,
            duration_ms=duration_ms,
            log_path=evidence_log_path,
            log_sha256=log_sha256,
            summary=qa_summary
        )

        context = context_store.get_context(args.task_id)
        if context is None:
            error = {
                "code": "E020",
                "name": "ContextNotFoundError",
                "message": f"Context not found for {args.task_id}",
                "details": {"task_id": args.task_id},
                "recovery_action": "Run --init-context first to create context"
            }
            print_error(error, exit_code=EXIT_DRIFT_ERROR)
        assert context is not None

        existing_qa_results = context.validation_baseline.get_qa_results()
        if existing_qa_results is not None:
            results_list = list(existing_qa_results.results)
            results_list.append(qa_command_result)
            new_qa_results = QAResults(
                recorded_at=existing_qa_results.recorded_at,
                agent=existing_qa_results.agent,
                git_sha=git_sha or existing_qa_results.git_sha,
                results=results_list
            )
        else:
            new_qa_results = QAResults(
                recorded_at=datetime.now(timezone.utc).isoformat(),
                agent=getattr(args, 'actor', 'qa-recorder'),
                git_sha=git_sha,
                results=[qa_command_result]
            )

        context.validation_baseline = context.validation_baseline.with_qa_results(new_qa_results)

        from filelock import FileLock
        context_file = context_store._get_context_file(args.task_id)

        with FileLock(str(context_store.lock_file), timeout=10):
            context.audit_updated_at = datetime.now(timezone.utc).isoformat()
            context.audit_updated_by = getattr(args, 'actor', 'qa-recorder')
            context.audit_update_count += 1

            json_content = json.dumps(context.to_dict(), indent=2, sort_keys=True, ensure_ascii=False)
            json_content += '\n'
            context_store._atomic_write(context_file, json_content)

        if is_json_mode():
            print_success(qa_command_result.to_dict())
        else:
            relative_log_path = str(log_path)
            print(f"✓ QA result recorded for {args.command}")
            print(f"  Exit code: {args.exit_code}")
            print(f"  Log: {relative_log_path}")
            print("  Stored in context.validation_baseline.initial_results")

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
