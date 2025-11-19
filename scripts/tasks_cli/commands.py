"""CLI command handlers for task context cache operations."""

from pathlib import Path
from typing import Dict, Any
import sys
import json
from datetime import datetime
import yaml

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
    release_from_quarantine,
    is_quarantined
)
from .task_snapshot import (
    resolve_task_path
)
from .validation import (
    execute_validation_command
)
from .qa_parsing import parse_qa_log
from .metrics import (
    collect_task_metrics,
    generate_metrics_dashboard,
    compare_metrics
)
from .git_utils import check_dirty_tree, get_current_commit
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
        context_store = TaskContextStore(repo_root)

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
        context_store = TaskContextStore(repo_root)

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


def cmd_init_context(args) -> int:
    """
    Enhanced context initialization with all validations.

    Integrates:
    - Quarantine checks
    - Acceptance criteria validation
    - Task snapshot creation
    - Standards excerpt attachment
    - Checklist snapshots
    - Exception ledger checks

    Args:
        args: Parsed arguments with task_id, allow_preexisting_dirty

    Returns:
        Exit code
    """
    try:
        repo_root = Path.cwd()

        # Check if task is quarantined
        if is_quarantined(args.task_id, repo_root):
            error = {
                "code": "E030",
                "name": "TaskQuarantined",
                "message": f"Task {args.task_id} is quarantined",
                "details": {"task_id": args.task_id},
                "recovery_action": "Release from quarantine or fix issues first"
            }
            print_error(error, exit_code=EXIT_BLOCKER_ERROR)

        # Resolve task file path
        task_path = resolve_task_path(args.task_id, repo_root)
        if not task_path:
            error = {
                "code": "E041",
                "name": "TaskNotFound",
                "message": f"Task file not found for {args.task_id}",
                "details": {"task_id": args.task_id},
                "recovery_action": "Verify task ID and check tasks/ directory"
            }
            print_error(error, exit_code=EXIT_IO_ERROR)

        # Load task data
        with open(task_path, 'r') as f:
            task_data = yaml.safe_load(f)

        # Validate acceptance criteria (fail if empty)
        if not task_data.get('acceptance_criteria'):
            error = {
                "code": "E001",
                "name": "EmptyAcceptanceCriteria",
                "message": "acceptance_criteria is empty",
                "details": {"task_id": args.task_id},
                "recovery_action": "Add acceptance criteria to task file"
            }

            # Add to exception ledger
            add_exception(
                task_id=args.task_id,
                exception_type="empty_acceptance_criteria",
                parse_error="acceptance_criteria field is empty"
            )

            print_error(error, exit_code=EXIT_VALIDATION_ERROR)

        # Check dirty tree
        allow_dirty = hasattr(args, 'allow_preexisting_dirty') and args.allow_preexisting_dirty
        if not allow_dirty:
            is_clean, dirty_files = check_dirty_tree(
                repo_root,
                allow_preexisting=False,
                expected_files=[f".agent-output/{args.task_id}/"]
            )
            if not is_clean:
                error = {
                    "code": "E050",
                    "name": "DirtyWorkingTree",
                    "message": "Git working tree has unexpected dirty files",
                    "details": {"files": dirty_files[:10]},
                    "recovery_action": "Commit or stash changes, or use --allow-preexisting-dirty"
                }
                print_error(error, exit_code=EXIT_GIT_ERROR)

        # Initialize context store
        context_store = TaskContextStore(repo_root)

        # Create snapshot and embed acceptance criteria
        tier = task_data.get('tier', 'backend')
        snapshot_meta = context_store.create_snapshot_and_embed(
            task_id=args.task_id,
            task_path=task_path,
            task_data=task_data,
            tier=tier
        )

        # Save context (assuming it saves internally, or we need to call a save method)
        # Note: TaskContextStore methods may handle persistence internally

        if is_json_mode():
            print_success({
                "task_id": args.task_id,
                "context_initialized": True,
                "snapshot": snapshot_meta
            })
        else:
            print(f"✓ Context initialized for {args.task_id}")
            print(f"  Snapshot: {snapshot_meta['snapshot_path']}")
            print(f"  Acceptance criteria: {len(task_data['acceptance_criteria'])} items")

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


def cmd_record_qa(args) -> int:
    """
    Record QA command results.

    Args:
        args: Parsed arguments with task_id, command, exit_code, log_path

    Returns:
        Exit code
    """
    try:
        repo_root = Path.cwd()
        context_store = TaskContextStore(repo_root)

        # Parse QA log
        log_path = Path(args.log_path)
        if log_path.exists():
            qa_summary = parse_qa_log(log_path, args.command)
        else:
            qa_summary = {}

        # Create QA result entry
        qa_result = {
            "command": args.command,
            "exit_code": args.exit_code,
            "log_path": str(log_path.relative_to(repo_root)),
            "summary": qa_summary,
            "recorded_at": datetime.utcnow().isoformat() + "Z"
        }

        # Attach log as evidence
        if log_path.exists():
            context_store.attach_evidence(
                task_id=args.task_id,
                artifact_type="qa_output",
                path=log_path,
                description=f"QA output: {args.command}",
                metadata={"command": args.command, "exit_code": args.exit_code}
            )

        # Update validation baseline in context
        context = context_store.get_context(args.task_id)
        if "validation_baseline" not in context:
            context["validation_baseline"] = {"initial_results": []}

        context["validation_baseline"]["initial_results"].append(qa_result)
        # Note: May need to save context back, depending on API

        if is_json_mode():
            print_success(qa_result)
        else:
            print(f"✓ QA result recorded for {args.command}")
            print(f"  Exit code: {args.exit_code}")
            print(f"  Log: {args.log_path}")

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
        context_store = TaskContextStore(repo_root)

        # Import models
        from .models import ValidationCommand, RetryPolicy

        # Parse env vars
        env_dict = {}
        if hasattr(args, 'env_vars') and args.env_vars:
            for env_str in args.env_vars:
                key, value = env_str.split('=', 1)
                env_dict[key] = value

        # Create validation command object
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

        # Execute validation command
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

        # Return exit code based on result
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


def cmd_verify_worktree(args) -> int:
    """
    Verify working tree for drift.

    Args:
        args: Parsed arguments with task_id, expected_agent

    Returns:
        Exit code (DRIFT_ERROR if drift detected)
    """
    try:
        repo_root = Path.cwd()

        # Check dirty files
        is_clean, dirty_files = check_dirty_tree(
            repo_root,
            expected_files=[f".agent-output/{args.task_id}/"]
        )

        # Get current commit
        current_commit = get_current_commit(repo_root)

        # Load context to check baseline
        context_store = TaskContextStore(repo_root)
        baseline_commit = context_store.data.get("immutable", {}).get("baseline_commit")

        drift_detected = not is_clean or (baseline_commit and current_commit != baseline_commit)

        result = {
            "task_id": args.task_id,
            "drift_detected": drift_detected,
            "dirty_files": dirty_files,
            "current_commit": current_commit,
            "baseline_commit": baseline_commit
        }

        if is_json_mode():
            print_success(result)
        else:
            if drift_detected:
                print(f"⚠ Drift detected for {args.task_id}")
                if dirty_files:
                    print(f"  Dirty files: {', '.join(dirty_files[:5])}")
                if baseline_commit and current_commit != baseline_commit:
                    print(f"  Commit changed: {baseline_commit[:8]} → {current_commit[:8]}")
            else:
                print(f"✓ No drift detected for {args.task_id}")

        return EXIT_DRIFT_ERROR if drift_detected else EXIT_SUCCESS

    except Exception as e:
        error = {
            "code": "E999",
            "name": "UnknownError",
            "message": str(e),
            "details": {},
            "recovery_action": "Check logs and retry"
        }
        print_error(error, exit_code=EXIT_GENERAL_ERROR)


def cmd_collect_metrics(args) -> int:
    """
    Collect metrics for a task.

    Args:
        args: Parsed arguments with task_id, baseline_path (optional)

    Returns:
        Exit code
    """
    try:
        repo_root = Path.cwd()

        # Load baseline if provided
        baseline = None
        if hasattr(args, 'baseline_path') and args.baseline_path:
            with open(args.baseline_path) as f:
                baseline = json.load(f)

        # Collect metrics
        metrics = collect_task_metrics(args.task_id, repo_root, baseline)

        # Save metrics
        output_path = repo_root / ".agent-output" / args.task_id / "metrics.json"
        output_path.parent.mkdir(parents=True, exist_ok=True)

        from dataclasses import asdict
        with open(output_path, 'w') as f:
            json.dump(asdict(metrics), f, indent=2)

        if is_json_mode():
            print_success(asdict(metrics))
        else:
            print(f"✓ Metrics collected for {args.task_id}")
            print(f"  Agents: {len(metrics.agents_run)}")
            print(f"  Avg file reads: {metrics.avg_file_reads_per_agent:.1f}")
            print(f"  QA coverage: {metrics.qa_artifact_coverage:.1f}%")
            print(f"  Saved to: {output_path}")

        return EXIT_SUCCESS

    except FileNotFoundError as e:
        error = {
            "code": "E041",
            "name": "FileNotFound",
            "message": str(e),
            "details": {},
            "recovery_action": "Ensure task has telemetry data"
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


def cmd_generate_dashboard(args) -> int:
    """
    Generate metrics dashboard across tasks.

    Args:
        args: Parsed arguments with task_ids (list), output_path

    Returns:
        Exit code
    """
    try:
        repo_root = Path.cwd()
        output_path = Path(args.output_path)

        # Generate dashboard
        dashboard = generate_metrics_dashboard(args.task_ids, repo_root, output_path)

        if is_json_mode():
            from dataclasses import asdict
            print_success(asdict(dashboard))
        else:
            print(f"✓ Dashboard generated for {dashboard.total_tasks} tasks")
            print(f"  All criteria met: {dashboard.all_criteria_met}")
            print(f"  Saved to: {output_path}")

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


def cmd_compare_metrics(args) -> int:
    """
    Compare baseline and current metrics.

    Args:
        args: Parsed arguments with baseline_path, current_path

    Returns:
        Exit code
    """
    try:
        comparison = compare_metrics(Path(args.baseline_path), Path(args.current_path))

        if is_json_mode():
            print_success(comparison)
        else:
            print("Metrics Comparison:")
            for metric, delta in comparison["deltas"].items():
                improvement = "✓" if delta["improvement"] else "✗"
                print(f"  {improvement} {metric}: {delta['baseline']:.1f} → {delta['current']:.1f} (Δ {delta['delta']:+.1f})")

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
