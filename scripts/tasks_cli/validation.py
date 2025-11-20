"""
Validation command execution and QA drift detection.

Per Section 2 and Section 4 of task-context-cache-hardening-schemas.md.

DEPRECATED MODULE:
------------------
QA baseline logic has been extracted to context_store/qa.py (S3.5).
Functions in this module are now thin wrappers for backward compatibility.
Will be removed in Phase 5.

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

from pathlib import Path
from typing import Dict

from .context_store import QAResults
from .context_store.qa import (
    execute_validation_command,
    detect_qa_drift,
    format_drift_report,
)
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


# execute_validation_command, detect_qa_drift, and format_drift_report
# are now imported from context_store.qa (see imports above)
# Keeping this module for backward compatibility only


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
