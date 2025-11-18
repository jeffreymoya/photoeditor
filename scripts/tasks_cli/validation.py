"""
Validation command execution and QA drift detection.

Per Section 2 and Section 4 of task-context-cache-hardening-schemas.md.
"""

import os
import subprocess
import time
from pathlib import Path
from typing import Dict

from .context_store import QAResults
from .models import ValidationCommand


def check_blocker_status(blocker_id: str, repo_root: Path) -> tuple[bool, str]:
    """
    Check if a blocker task is active (not completed).

    Args:
        blocker_id: Task ID to check (e.g., TASK-0001)
        repo_root: Repository root path

    Returns:
        Tuple of (is_blocked, reason):
        - is_blocked: True if blocker is active (not completed)
        - reason: Human-readable reason string
    """
    from .datastore import TaskDatastore
    ds = TaskDatastore(repo_root)
    tasks = ds.load_all_tasks()
    blocker_task = next((t for t in tasks if t.id == blocker_id), None)

    if blocker_task is None:
        return False, f"Blocker {blocker_id} not found"

    if blocker_task.status != "completed":
        return True, f"Blocked by {blocker_id} (status: {blocker_task.status})"

    return False, ""


def verify_expected_paths(patterns: list[str], repo_root: Path) -> tuple[bool, list[str]]:
    """
    Verify that all expected path patterns exist.

    Args:
        patterns: List of glob patterns to verify
        repo_root: Repository root path

    Returns:
        Tuple of (all_exist, missing_patterns):
        - all_exist: True if all patterns have at least one match
        - missing_patterns: List of patterns that had no matches
    """
    missing = []
    for pattern in patterns:
        matches = list(repo_root.glob(pattern))
        if not matches:
            missing.append(pattern)

    return len(missing) == 0, missing


def execute_validation_command(
    cmd: ValidationCommand,
    task_id: str,
    repo_root: Path
) -> Dict:
    """
    Execute validation command with pre-flight checks.

    Per Section 2.2 of task-context-cache-hardening-schemas.md.

    Args:
        cmd: ValidationCommand to execute
        task_id: Task ID for context
        repo_root: Repository root path

    Returns:
        {
            success: bool,
            exit_code: Optional[int],
            stdout: str,
            stderr: str,
            skipped: bool,
            skip_reason: Optional[str],
            duration_ms: int,
            attempts: int
        }
    """
    # 1. Check if blocked by another task
    if cmd.blocker_id:
        is_blocked, reason = check_blocker_status(cmd.blocker_id, repo_root)
        if is_blocked:
            return {
                "success": False,
                "exit_code": None,
                "stdout": "",
                "stderr": "",
                "skipped": True,
                "skip_reason": reason,
                "duration_ms": 0,
                "attempts": 0
            }

    # 2. Verify expected paths exist
    all_exist, missing = verify_expected_paths(cmd.expected_paths, repo_root)
    if not all_exist:
        return {
            "success": False,
            "exit_code": None,
            "stdout": "",
            "stderr": "",
            "skipped": True,
            "skip_reason": f"Expected path not found: {missing[0]}",
            "duration_ms": 0,
            "attempts": 0
        }

    # 3. Prepare environment
    env = os.environ.copy()
    env.update(cmd.env)

    # 4. Change to working directory
    cwd = repo_root / cmd.cwd
    if not cwd.exists():
        return {
            "success": False,
            "exit_code": None,
            "stdout": "",
            "stderr": "",
            "skipped": True,
            "skip_reason": f"Working directory does not exist: {cwd}",
            "duration_ms": 0,
            "attempts": 0
        }

    # 5. Execute with retry policy
    retry_policy = cmd.retry_policy
    start_time = time.time()

    for attempt in range(retry_policy.max_attempts):
        try:
            attempt_start = time.time()
            result = subprocess.run(
                cmd.command,
                shell=True,
                cwd=cwd,
                env=env,
                capture_output=True,
                text=True,
                timeout=cmd.timeout_ms / 1000
            )
            attempt_duration = int((time.time() - attempt_start) * 1000)

            success = result.returncode in cmd.expected_exit_codes

            return {
                "success": success,
                "exit_code": result.returncode,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "skipped": False,
                "skip_reason": None,
                "duration_ms": attempt_duration,
                "attempts": attempt + 1
            }

        except subprocess.TimeoutExpired as e:
            if attempt < retry_policy.max_attempts - 1:
                # Retry after backoff
                time.sleep(retry_policy.backoff_ms / 1000)
                continue

            # Final timeout
            total_duration = int((time.time() - start_time) * 1000)
            return {
                "success": False,
                "exit_code": -1,
                "stdout": e.stdout.decode() if e.stdout else "",
                "stderr": f"Command timed out after {cmd.timeout_ms}ms",
                "skipped": False,
                "skip_reason": None,
                "duration_ms": total_duration,
                "attempts": attempt + 1,
                "timeout": True
            }

        except Exception as e:
            # Unexpected error
            total_duration = int((time.time() - start_time) * 1000)
            return {
                "success": False,
                "exit_code": -1,
                "stdout": "",
                "stderr": f"Unexpected error: {str(e)}",
                "skipped": False,
                "skip_reason": None,
                "duration_ms": total_duration,
                "attempts": attempt + 1,
                "error": str(e)
            }

    # Should never reach here
    return {
        "success": False,
        "exit_code": -1,
        "stdout": "",
        "stderr": "Retry logic failed",
        "skipped": False,
        "skip_reason": None,
        "duration_ms": int((time.time() - start_time) * 1000),
        "attempts": retry_policy.max_attempts
    }


def detect_qa_drift(baseline: QAResults, current: QAResults) -> Dict:
    """
    Compare current QA results to baseline.

    Per Section 4.3 of task-context-cache-hardening-schemas.md.

    Args:
        baseline: Baseline QA results
        current: Current QA results

    Returns:
        {
            has_drift: bool,
            regressions: List[dict],
            improvements: List[dict]
        }
    """
    regressions = []
    improvements = []

    # Build lookup dicts
    baseline_results = {r.command_id: r for r in baseline.results}
    current_results = {r.command_id: r for r in current.results}

    for cmd_id, current_result in current_results.items():
        baseline_result = baseline_results.get(cmd_id)
        if not baseline_result:
            # New command - not a regression
            continue

        # Compare exit codes
        if baseline_result.exit_code == 0 and current_result.exit_code != 0:
            regressions.append({
                "command_id": cmd_id,
                "type": "exit_code_regression",
                "baseline": 0,
                "current": current_result.exit_code,
                "severity": "error"
            })

        # Compare summaries (if both exist)
        if baseline_result.summary and current_result.summary:
            baseline_summary = baseline_result.summary
            current_summary = current_result.summary

            # Check for new lint errors
            if baseline_summary.lint_errors is not None and current_summary.lint_errors is not None:
                if baseline_summary.lint_errors < current_summary.lint_errors:
                    regressions.append({
                        "command_id": cmd_id,
                        "type": "lint_errors_increased",
                        "baseline": baseline_summary.lint_errors,
                        "current": current_summary.lint_errors,
                        "delta": current_summary.lint_errors - baseline_summary.lint_errors,
                        "severity": "error"
                    })
                elif baseline_summary.lint_errors > current_summary.lint_errors:
                    improvements.append({
                        "command_id": cmd_id,
                        "type": "lint_errors_decreased",
                        "baseline": baseline_summary.lint_errors,
                        "current": current_summary.lint_errors,
                        "delta": baseline_summary.lint_errors - current_summary.lint_errors
                    })

            # Check for new type errors
            if baseline_summary.type_errors is not None and current_summary.type_errors is not None:
                if baseline_summary.type_errors < current_summary.type_errors:
                    regressions.append({
                        "command_id": cmd_id,
                        "type": "type_errors_increased",
                        "baseline": baseline_summary.type_errors,
                        "current": current_summary.type_errors,
                        "delta": current_summary.type_errors - baseline_summary.type_errors,
                        "severity": "error"
                    })
                elif baseline_summary.type_errors > current_summary.type_errors:
                    improvements.append({
                        "command_id": cmd_id,
                        "type": "type_errors_decreased",
                        "baseline": baseline_summary.type_errors,
                        "current": current_summary.type_errors,
                        "delta": baseline_summary.type_errors - current_summary.type_errors
                    })

            # Check test failures
            if baseline_summary.tests_failed is not None and current_summary.tests_failed is not None:
                if baseline_summary.tests_failed < current_summary.tests_failed:
                    regressions.append({
                        "command_id": cmd_id,
                        "type": "tests_failed_increased",
                        "baseline": baseline_summary.tests_failed,
                        "current": current_summary.tests_failed,
                        "delta": current_summary.tests_failed - baseline_summary.tests_failed,
                        "severity": "error"
                    })
                elif baseline_summary.tests_failed > current_summary.tests_failed:
                    improvements.append({
                        "command_id": cmd_id,
                        "type": "tests_failed_decreased",
                        "baseline": baseline_summary.tests_failed,
                        "current": current_summary.tests_failed,
                        "delta": baseline_summary.tests_failed - current_summary.tests_failed
                    })

            # Check coverage regression (>1% drop is significant)
            if baseline_summary.coverage and current_summary.coverage:
                baseline_cov = baseline_summary.coverage
                current_cov = current_summary.coverage

                for metric in ["lines", "branches"]:
                    baseline_val = getattr(baseline_cov, metric, None)
                    current_val = getattr(current_cov, metric, None)

                    if baseline_val is not None and current_val is not None:
                        if current_val < baseline_val - 1.0:  # >1% drop
                            regressions.append({
                                "command_id": cmd_id,
                                "type": f"coverage_{metric}_dropped",
                                "baseline": baseline_val,
                                "current": current_val,
                                "delta": baseline_val - current_val,
                                "severity": "warning"
                            })
                        elif current_val > baseline_val + 1.0:  # >1% improvement
                            improvements.append({
                                "command_id": cmd_id,
                                "type": f"coverage_{metric}_improved",
                                "baseline": baseline_val,
                                "current": current_val,
                                "delta": current_val - baseline_val
                            })

    return {
        "has_drift": len(regressions) > 0,
        "regressions": regressions,
        "improvements": improvements
    }


def format_drift_report(drift: Dict) -> str:
    """
    Format drift detection results as human-readable report.

    Args:
        drift: Output from detect_qa_drift()

    Returns:
        Formatted string report
    """
    if not drift["has_drift"]:
        return "✓ No regressions detected"

    lines = []
    lines.append(f"⚠ {len(drift['regressions'])} regression(s) detected:")
    lines.append("")

    for reg in drift["regressions"]:
        cmd_id = reg["command_id"]
        reg_type = reg["type"]
        severity = reg.get("severity", "warning")
        symbol = "✖" if severity == "error" else "⚠"

        if "delta" in reg:
            lines.append(
                f"  {symbol} {cmd_id}: {reg_type} "
                f"(baseline: {reg['baseline']}, current: {reg['current']}, Δ{reg['delta']})"
            )
        else:
            lines.append(
                f"  {symbol} {cmd_id}: {reg_type} "
                f"(baseline: {reg['baseline']}, current: {reg['current']})"
            )

    if drift["improvements"]:
        lines.append("")
        lines.append(f"✓ {len(drift['improvements'])} improvement(s):")
        for imp in drift["improvements"]:
            cmd_id = imp["command_id"]
            imp_type = imp["type"]
            if "delta" in imp:
                lines.append(
                    f"  ✓ {cmd_id}: {imp_type} "
                    f"(baseline: {imp['baseline']}, current: {imp['current']}, Δ-{imp['delta']})"
                )

    return "\n".join(lines)
