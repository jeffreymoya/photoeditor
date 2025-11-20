"""
Validation command execution and QA drift detection.

Per Section 2 and Section 4 of task-context-cache-hardening-schemas.md.

SECURITY NOTE:
--------------
This module uses subprocess with shell=True for command execution.
This is ONLY safe because:
1. Commands are sourced from task.yaml files, which are part of the trusted repository
2. Task files are committed and reviewed before execution
3. The codebase is maintained by a solo developer with full trust in their own task definitions
4. No user input or external data is passed to subprocess commands

DO NOT use this module with untrusted command sources or user-provided task files.
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


# Error codes per schemas doc Section 6.2
E001_REQUIRED_FIELD_EMPTY = "E001"
E002_INVALID_PLAN_STRUCTURE = "E002"


def validate_task_snapshot_completeness(task_data: dict) -> list[dict]:
    """
    Validate task data completeness for context init.

    Per Section 8 of task-context-cache-hardening-schemas.md.

    Args:
        task_data: Parsed task YAML data as dict

    Returns:
        List of validation issues (empty if valid).
        Each issue: {"code": str, "severity": str, "message": str, "field": str, "recovery_action": str}
    """
    issues = []

    # Run all validation checks
    issues.extend(check_required_fields(task_data))
    issues.extend(validate_plan_structure(task_data.get("plan", [])))
    issues.extend(check_optional_fields(task_data))
    issues.extend(check_standards_citations(task_data))

    return issues


def check_required_fields(task_data: dict) -> list[dict]:
    """
    Validate required fields are present and non-empty.

    Per Section 8.1 of task-context-cache-hardening-schemas.md.

    Args:
        task_data: Parsed task YAML data

    Returns:
        List of E001 errors for empty required fields
    """
    errors = []

    # Required non-empty fields
    required_fields = {
        "acceptance_criteria": "Acceptance criteria",
        "scope.in": "Scope (in)",
        "plan": "Implementation plan",
        "deliverables": "Deliverables",
    }

    # Add validation.pipeline requirement for schema 1.1+
    schema_version = task_data.get("schema_version", "1.0")
    if schema_version >= "1.1":
        required_fields["validation.pipeline"] = "Validation pipeline (schema 1.1+)"

    for field_path, field_name in required_fields.items():
        # Navigate nested fields
        value = task_data
        for key in field_path.split('.'):
            value = value.get(key, None)
            if value is None:
                break

        # Check if empty
        if value is None or (isinstance(value, list) and len(value) == 0):
            errors.append({
                "code": E001_REQUIRED_FIELD_EMPTY,
                "severity": "error",
                "message": f"Required field '{field_name}' is empty",
                "field": field_path,
                "recovery_action": f"Add {field_name.lower()} to the task file"
            })

    return errors


def validate_plan_structure(plan_steps: list) -> list[dict]:
    """
    Validate plan steps have required fields.

    Per Section 8.2 of task-context-cache-hardening-schemas.md.

    Args:
        plan_steps: List of plan step dicts

    Returns:
        List of E001 errors for empty required plan step fields
    """
    errors = []

    for i, step in enumerate(plan_steps):
        # Each step must have outputs (non-empty array in schema 1.1)
        outputs = step.get("outputs")
        if not outputs or (isinstance(outputs, list) and len(outputs) == 0):
            errors.append({
                "code": E001_REQUIRED_FIELD_EMPTY,
                "severity": "error",
                "message": f"Plan step {i+1} has empty outputs array (schema 1.1 violation)",
                "field": f"plan[{i}].outputs",
                "recovery_action": f"Add outputs to plan step {i+1}"
            })

    return errors


def check_optional_fields(task_data: dict) -> list[dict]:
    """
    Check optional fields and warn if missing.

    Per Section 8.2 of task-context-cache-hardening-schemas.md.

    Args:
        task_data: Parsed task YAML data

    Returns:
        List of warnings for missing optional fields
    """
    warnings = []

    # Check scope.out
    scope_out = task_data.get("scope", {}).get("out")
    if not scope_out or (isinstance(scope_out, list) and len(scope_out) == 0):
        warnings.append({
            "code": "W001",
            "severity": "warning",
            "message": "Scope exclusions (out) not specified - consider adding for clarity",
            "field": "scope.out",
            "recovery_action": "Add scope.out to clarify what is not in scope"
        })

    # Check risks
    risks = task_data.get("risks")
    if not risks or (isinstance(risks, list) and len(risks) == 0):
        warnings.append({
            "code": "W003",
            "severity": "warning",
            "message": "No risks specified - consider adding risk analysis",
            "field": "risks",
            "recovery_action": "Add risks section with potential issues and mitigations"
        })

    return warnings


def check_standards_citations(task_data: dict) -> list[dict]:
    """
    Verify acceptance_criteria reference standards/ tier files.

    Per Section 8.2 of task-context-cache-hardening-schemas.md.

    Args:
        task_data: Parsed task YAML data

    Returns:
        List of warnings if no standards citations found
    """
    warnings = []

    # Check if standards_tier is specified in context
    standards_tier = task_data.get("context", {}).get("standards_tier")
    if not standards_tier:
        warnings.append({
            "code": "W002",
            "severity": "warning",
            "message": "No standards tier specified - context may lack grounding",
            "field": "context.standards_tier",
            "recovery_action": "Add context.standards_tier referencing applicable standards/ tier files"
        })

    # Check if acceptance criteria mention standards files
    acceptance_criteria = task_data.get("acceptance_criteria", {})

    # acceptance_criteria can be a dict with 'must' and 'quality_gates' keys
    # or a simple list (legacy format)
    criteria_text = ""

    if isinstance(acceptance_criteria, dict):
        must_items = acceptance_criteria.get("must", [])
        quality_gates = acceptance_criteria.get("quality_gates", [])

        if isinstance(must_items, list):
            criteria_text += " ".join(str(item) for item in must_items)
        if isinstance(quality_gates, list):
            criteria_text += " ".join(str(item) for item in quality_gates)
    elif isinstance(acceptance_criteria, list):
        criteria_text = " ".join(str(item) for item in acceptance_criteria)

    # Look for standards/ references
    has_standards_ref = "standards/" in criteria_text.lower()

    if not has_standards_ref and not standards_tier:
        warnings.append({
            "code": "W004",
            "severity": "warning",
            "message": "Acceptance criteria do not reference standards/ tier files",
            "field": "acceptance_criteria",
            "recovery_action": "Add references to relevant standards/ tier files in acceptance criteria"
        })

    return warnings
