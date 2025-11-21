"""
QA commands for tasks CLI (Typer-based).

Implements QA baseline recording and drift detection commands:
- record-qa: Record QA command results in context
- compare-qa: Compare current QA results against baseline
- resolve-drift: Reset drift budget and record resolution

Migrated from __main__.py per S5.3 of modularization mitigation plan.
"""

import hashlib
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import typer

from ..context import TaskCliContext
from ..context_store import (
    ContextNotFoundError,
    DriftError,
    QACommandResult,
    QAResults,
    TaskContextStore,
)
from ..exceptions import ValidationError
from ..output import print_json
from ..providers import GitProvider
from ..qa_parsing import parse_qa_log

# Exit codes per schemas doc section 6.1
EXIT_SUCCESS = 0
EXIT_GENERAL_ERROR = 1
EXIT_DRIFT_ERROR = 20


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


def _parse_qa_log_content(qa_log_content: str, command_type: Optional[str] = None) -> dict:
    """
    Parse QA log content to extract test results.

    Per Section 4.2 of task-context-cache-hardening-schemas.md.
    """
    import re

    # Auto-detect command type if not provided
    if command_type is None:
        content_lower = qa_log_content.lower()
        if 'eslint' in content_lower or 'prettier' in content_lower:
            command_type = 'lint'
        elif 'typescript' in content_lower or 'error ts' in content_lower or 'tsc' in content_lower:
            command_type = 'typecheck'
        elif 'jest' in content_lower or 'vitest' in content_lower:
            command_type = 'test'
        elif 'coverage' in content_lower or 'istanbul' in content_lower:
            command_type = 'coverage'

    results: dict = {
        'lint_errors': None,
        'lint_warnings': None,
        'type_errors': None,
        'tests_passed': None,
        'tests_failed': None,
        'coverage': None,
    }

    if command_type == 'lint':
        # ESLint format: "X 3 problems (2 errors, 1 warning)"
        problem_match = re.search(r'(\d+)\s+problems?\s+\((\d+)\s+errors?,\s+(\d+)\s+warnings?\)', qa_log_content)
        if problem_match:
            results['lint_errors'] = int(problem_match.group(2))
            results['lint_warnings'] = int(problem_match.group(3))
        else:
            error_match = re.search(r'(\d+)\s+errors?', qa_log_content, re.IGNORECASE)
            warning_match = re.search(r'(\d+)\s+warnings?', qa_log_content, re.IGNORECASE)
            if error_match:
                results['lint_errors'] = int(error_match.group(1))
            if warning_match:
                results['lint_warnings'] = int(warning_match.group(1))

    elif command_type == 'typecheck':
        error_match = re.search(r'(\d+)\s+(?:type\s+)?errors?', qa_log_content, re.IGNORECASE)
        if error_match:
            results['type_errors'] = int(error_match.group(1))
        elif 'error' not in qa_log_content.lower():
            results['type_errors'] = 0

    elif command_type == 'test':
        # Jest/Vitest format
        pass_match = re.search(r'(\d+)\s+(?:tests?\s+)?passed', qa_log_content, re.IGNORECASE)
        fail_match = re.search(r'(\d+)\s+(?:tests?\s+)?failed', qa_log_content, re.IGNORECASE)
        if pass_match:
            results['tests_passed'] = int(pass_match.group(1))
        if fail_match:
            results['tests_failed'] = int(fail_match.group(1))

    elif command_type == 'coverage':
        line_match = re.search(r'lines\s*:\s*([\d.]+)%', qa_log_content, re.IGNORECASE)
        branch_match = re.search(r'branches?\s*:\s*([\d.]+)%', qa_log_content, re.IGNORECASE)
        if line_match or branch_match:
            results['coverage'] = {}
            if line_match:
                results['coverage']['lines'] = float(line_match.group(1))
            if branch_match:
                results['coverage']['branches'] = float(branch_match.group(1))

    return {k: v for k, v in results.items() if v is not None}


def register_qa_commands(app: typer.Typer, ctx: TaskCliContext) -> None:
    """
    Register QA management commands with Typer app.

    Args:
        app: Typer app instance to register commands with
        ctx: TaskCliContext with store and output channel
    """
    from .worktree_commands import _auto_verify_worktree, _check_drift_budget
    from ..context_store.qa import detect_qa_drift, format_drift_report

    @app.command("record-qa")
    def record_qa_cmd(
        task_id: str = typer.Argument(..., help="Task ID to record QA for"),
        agent: str = typer.Option(..., "--agent", help="Agent role performing QA"),
        log_from: str = typer.Option(..., "--from", help="Path to QA log file"),
        command_type: Optional[str] = typer.Option(
            None, "--command-type", help="Command type: lint, typecheck, test, coverage"
        ),
        actor: str = typer.Option("task-runner", "--actor", help="Actor recording QA"),
        format: str = typer.Option(
            "text", "--format", "-f", help="Output format: 'text' or 'json'"
        ),
    ) -> None:
        """Record QA command results in context."""
        repo_root = ctx.repo_root
        context_store = TaskContextStore(repo_root)

        qa_log_file = Path(log_from)
        if not qa_log_file.exists():
            if format == "json":
                print_json({"success": False, "error": f"QA log file not found: {log_from}"})
            else:
                print(f"Error: QA log file not found: {log_from}", file=sys.stderr)
            raise typer.Exit(code=EXIT_GENERAL_ERROR)

        try:
            # Check drift budget before mutations
            _check_drift_budget(context_store, task_id)

            # Auto-verify worktree before mutations
            _auto_verify_worktree(context_store, task_id, agent)

            qa_log_content = qa_log_file.read_text(encoding="utf-8")
            qa_results = _parse_qa_log_content(qa_log_content, command_type=command_type)
            log_sha256 = hashlib.sha256(qa_log_content.encode("utf-8")).hexdigest()

            # Get current git SHA
            try:
                git_provider = GitProvider(repo_root)
                git_sha = git_provider.get_current_commit()
            except Exception:
                git_sha = None

            detected_type = command_type or _infer_command_type(qa_log_content)
            qa_results_with_metadata = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "git_sha": git_sha,
                "log_path": str(log_from),
                "log_sha256": log_sha256,
                "command_type": detected_type,
                "summary": qa_results,
            }

            updates = {
                "qa_log_path": str(log_from),
                "qa_results": qa_results_with_metadata,
            }

            context_store.update_coordination(
                task_id=task_id,
                agent_role=agent,
                updates=updates,
                actor=actor,
            )

            if format == "json":
                print_json({
                    "success": True,
                    "task_id": task_id,
                    "agent_role": agent,
                    "qa_log_path": str(log_from),
                    "log_sha256": log_sha256,
                    "qa_results": qa_results,
                })
            else:
                print(f"Recorded QA results for {agent} on {task_id}")
                print(f"  QA log: {log_from}")
                print(f"  Command type: {detected_type or 'auto-detected'}")

                if "lint_errors" in qa_results:
                    errors = qa_results["lint_errors"]
                    warnings = qa_results.get("lint_warnings", 0)
                    status = "OK" if errors == 0 else "FAIL"
                    print(f"  Lint: {status} {errors} errors, {warnings} warnings")

                if "type_errors" in qa_results:
                    errors = qa_results["type_errors"]
                    status = "OK" if errors == 0 else "FAIL"
                    print(f"  Typecheck: {status} {errors} errors")

                if "tests_passed" in qa_results and "tests_failed" in qa_results:
                    passed = qa_results["tests_passed"]
                    failed = qa_results["tests_failed"]
                    total = passed + failed
                    status = "OK" if failed == 0 else "FAIL"
                    print(f"  Tests: {status} {passed}/{total} passed")

                if "coverage" in qa_results:
                    cov = qa_results["coverage"]
                    if "lines" in cov and "branches" in cov:
                        print(f"  Coverage: {cov['lines']:.1f}% lines, {cov['branches']:.1f}% branches")

        except (ContextNotFoundError, ValidationError, DriftError) as e:
            if format == "json":
                print_json({"success": False, "error": str(e)})
            else:
                print(f"Error: {e}", file=sys.stderr)
            raise typer.Exit(code=EXIT_GENERAL_ERROR)

    @app.command("compare-qa")
    def compare_qa_cmd(
        task_id: str = typer.Argument(..., help="Task ID to compare QA for"),
        agent: str = typer.Option(..., "--agent", help="Agent role to compare"),
        log_from: str = typer.Option(..., "--from", help="Path to current QA log file"),
        command_type: Optional[str] = typer.Option(
            None, "--command-type", help="Command type: lint, typecheck, test, coverage"
        ),
        format: str = typer.Option(
            "text", "--format", "-f", help="Output format: 'text' or 'json'"
        ),
    ) -> None:
        """Compare current QA results against baseline and detect drift."""
        repo_root = ctx.repo_root
        context_store = TaskContextStore(repo_root)

        qa_log_file = Path(log_from)
        if not qa_log_file.exists():
            if format == "json":
                print_json({"success": False, "error": f"QA log file not found: {log_from}"})
            else:
                print(f"Error: QA log file not found: {log_from}", file=sys.stderr)
            raise typer.Exit(code=EXIT_GENERAL_ERROR)

        try:
            context = context_store.get_context(task_id)
            if context is None:
                raise ContextNotFoundError(f"No context found for {task_id}")

            agent_coord = getattr(context, agent)
            baseline_data = agent_coord.qa_results

            if not baseline_data:
                if format == "json":
                    print_json({
                        "success": False,
                        "error": f"No baseline QA results found for {agent} on {task_id}",
                    })
                else:
                    print(f"Error: No baseline QA results found for {agent} on {task_id}", file=sys.stderr)
                    print("Run --record-qa first to establish a baseline", file=sys.stderr)
                raise typer.Exit(code=EXIT_GENERAL_ERROR)

            qa_log_content = qa_log_file.read_text(encoding="utf-8")
            current_results = _parse_qa_log_content(qa_log_content, command_type=command_type)

            # Build QAResults objects for comparison
            baseline_summary = baseline_data.get("summary", {})
            baseline_qa_results = QAResults(
                recorded_at=baseline_data.get("timestamp", datetime.now(timezone.utc).isoformat()),
                agent=agent,
                git_sha=baseline_data.get("git_sha"),
                results=[QACommandResult(
                    command_id="baseline",
                    command=baseline_data.get("log_path", ""),
                    exit_code=0,
                    duration_ms=0,
                    summary=baseline_summary,
                )],
            )

            current_qa_results = QAResults(
                recorded_at=datetime.now(timezone.utc).isoformat(),
                agent=agent,
                git_sha=None,
                results=[QACommandResult(
                    command_id="baseline",
                    command=str(log_from),
                    exit_code=0,
                    duration_ms=0,
                    summary=current_results,
                )],
            )

            drift = detect_qa_drift(baseline_qa_results, current_qa_results)

            if format == "json":
                print_json({
                    "success": True,
                    "task_id": task_id,
                    "agent_role": agent,
                    "has_drift": drift["has_drift"],
                    "regressions": drift["regressions"],
                    "improvements": drift["improvements"],
                    "baseline": baseline_summary,
                    "current": current_results,
                })
            else:
                print(f"QA Drift Detection for {task_id} ({agent})")
                print("=" * 60)
                print(f"\nBaseline: {baseline_data.get('log_path', 'unknown')}")
                print(f"Current:  {log_from}\n")
                print(format_drift_report(drift))

            if drift["has_drift"]:
                raise typer.Exit(code=EXIT_DRIFT_ERROR)

        except ContextNotFoundError as e:
            if format == "json":
                print_json({"success": False, "error": str(e)})
            else:
                print(f"Error: {e}", file=sys.stderr)
            raise typer.Exit(code=EXIT_GENERAL_ERROR)

    @app.command("resolve-drift")
    def resolve_drift_cmd(
        task_id: str = typer.Argument(..., help="Task ID to resolve drift for"),
        agent: str = typer.Option(..., "--agent", help="Agent role to resolve drift for"),
        note: str = typer.Option(..., "--note", help="Resolution description"),
        actor: str = typer.Option("operator", "--actor", help="Actor resolving drift"),
        format: str = typer.Option(
            "text", "--format", "-f", help="Output format: 'text' or 'json'"
        ),
    ) -> None:
        """Reset drift budget and record resolution."""
        repo_root = ctx.repo_root
        context_store = TaskContextStore(repo_root)

        try:
            context = context_store.get_context(task_id)
            if context is None:
                raise ContextNotFoundError(f"No context found for {task_id}")

            agent_coord = getattr(context, agent)
            current_drift = agent_coord.drift_budget

            if current_drift == 0:
                if format == "json":
                    print_json({
                        "success": True,
                        "task_id": task_id,
                        "agent_role": agent,
                        "message": "No drift budget to resolve (already 0)",
                    })
                else:
                    print(f"No drift budget to resolve for {agent} on {task_id}")
                    print("  Drift budget is already 0")
                return

            resolution_record = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "note": note,
                "previous_drift_budget": current_drift,
            }

            context_store.update_coordination(
                task_id=task_id,
                agent_role=agent,
                updates={"drift_budget": 0},
                actor=actor,
            )

            if format == "json":
                print_json({
                    "success": True,
                    "task_id": task_id,
                    "agent_role": agent,
                    "previous_drift_budget": current_drift,
                    "resolution": resolution_record,
                })
            else:
                print(f"Resolved drift for {agent} on {task_id}")
                print(f"  Previous drift budget: {current_drift}")
                print("  New drift budget: 0")
                print(f"  Resolution note: {note}")

        except (ContextNotFoundError, ValidationError) as e:
            if format == "json":
                print_json({"success": False, "error": str(e)})
            else:
                print(f"Error: {e}", file=sys.stderr)
            raise typer.Exit(code=EXIT_GENERAL_ERROR)
