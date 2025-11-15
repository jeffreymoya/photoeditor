"""
Task YAML linter for schema version 1.1+ validation.

Validates task files against schema requirements:
- Evidence path file existence
- Validation section completeness
- Plan step outputs non-empty
- Standards anchor references (basic file-level check)

Usage:
    linter = TaskLinter(repo_root=Path("/path/to/repo"))
    violations = linter.lint_file(Path("tasks/backend/TASK-0902.task.yaml"))
    if violations:
        for v in violations:
            print(f"{v.level.upper()}: {v.message}")
"""

import re
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import List, Dict, Any, Optional

from ruamel.yaml import YAML


class ViolationLevel(Enum):
    """Severity level for lint violations."""
    ERROR = "error"  # Blocks status transitions
    WARNING = "warning"  # Does not block, but should be fixed
    INFO = "info"  # Informational only


@dataclass
class LintViolation:
    """Represents a single lint violation."""
    level: ViolationLevel
    message: str
    field: Optional[str] = None  # YAML field path (e.g., "validation.pipeline")
    suggestion: Optional[str] = None  # How to fix


class TaskLinter:
    """Validates task YAML files against schema requirements."""

    def __init__(self, repo_root: Path):
        """
        Initialize linter.

        Args:
            repo_root: Absolute path to repository root
        """
        self.repo_root = repo_root
        self.yaml = YAML(typ='safe')

        # Known standards files (for anchor validation)
        self.standards_files = [
            "standards/global.md",
            "standards/AGENTS.md",
            "standards/typescript.md",
            "standards/backend-tier.md",
            "standards/frontend-tier.md",
            "standards/shared-contracts-tier.md",
            "standards/infrastructure-tier.md",
            "standards/cross-cutting.md",
            "standards/testing-standards.md",
            "standards/qa-commands-ssot.md",
            "standards/standards-governance-ssot.md",
            "standards/task-breakdown-canon.md",
            "standards/task-sizing-guide.md",
        ]

    def lint_file(self, file_path: Path) -> List[LintViolation]:
        """
        Lint a single task file.

        Args:
            file_path: Path to .task.yaml file

        Returns:
            List of violations (empty if valid)
        """
        violations = []

        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = self.yaml.load(f)

            if not data or not isinstance(data, dict):
                violations.append(LintViolation(
                    level=ViolationLevel.ERROR,
                    message=f"Failed to parse YAML: file is empty or invalid",
                ))
                return violations

            # Get schema version (default to "1.0" if missing)
            schema_version = data.get('schema_version', '1.0')

            # Schema 1.1+ requires stricter validation
            if self._is_schema_1_1_or_later(schema_version):
                violations.extend(self._validate_schema_1_1(data, file_path))
            else:
                # Schema 1.0: minimal validation (backward compatibility)
                violations.extend(self._validate_schema_1_0(data, file_path))

        except Exception as e:
            violations.append(LintViolation(
                level=ViolationLevel.ERROR,
                message=f"Failed to read or parse file: {e}",
            ))

        return violations

    def _is_schema_1_1_or_later(self, version: str) -> bool:
        """Check if schema version is 1.1 or later."""
        try:
            # Parse "1.1" -> (1, 1)
            parts = version.split('.')
            major = int(parts[0])
            minor = int(parts[1]) if len(parts) > 1 else 0
            return (major, minor) >= (1, 1)
        except (ValueError, IndexError):
            # Invalid version format, default to old schema
            return False

    def _validate_schema_1_0(self, data: Dict[str, Any], file_path: Path) -> List[LintViolation]:
        """
        Minimal validation for schema 1.0 (legacy tasks).

        Args:
            data: Parsed YAML dict
            file_path: Path to task file

        Returns:
            List of violations
        """
        violations = []

        # Only check required fields exist
        required_fields = ['id', 'title', 'status', 'priority', 'area']
        for field in required_fields:
            if field not in data:
                violations.append(LintViolation(
                    level=ViolationLevel.ERROR,
                    message=f"Missing required field: {field}",
                    field=field,
                ))

        return violations

    def _validate_schema_1_1(self, data: Dict[str, Any], file_path: Path) -> List[LintViolation]:
        """
        Full validation for schema 1.1+ tasks.

        Args:
            data: Parsed YAML dict
            file_path: Path to task file

        Returns:
            List of violations
        """
        violations = []

        # A. Evidence path validation
        violations.extend(self._check_evidence_path(data, file_path))

        # B. Validation section validation
        violations.extend(self._check_validation_section(data))

        # C. Plan outputs validation
        violations.extend(self._check_plan_outputs(data))

        # D. Standards anchor validation (basic)
        violations.extend(self._check_standards_anchors(data))

        # E. Complexity budget validation (task granularity)
        violations.extend(self._check_complexity_budget(data))

        return violations

    def _check_evidence_path(self, data: Dict[str, Any], file_path: Path) -> List[LintViolation]:
        """
        Check that clarifications.evidence_path exists (for non-draft tasks).

        Args:
            data: Parsed YAML dict
            file_path: Path to task file

        Returns:
            List of violations
        """
        violations = []

        status = data.get('status', 'draft')
        clarifications = data.get('clarifications', {})
        evidence_path_str = clarifications.get('evidence_path') if clarifications else None

        if not evidence_path_str:
            # Missing evidence_path field
            if status in ('todo', 'in_progress', 'completed'):
                violations.append(LintViolation(
                    level=ViolationLevel.ERROR,
                    message=f"clarifications.evidence_path is required for status='{status}'",
                    field="clarifications.evidence_path",
                    suggestion="Add evidence_path field or use: python scripts/tasks.py --bootstrap-evidence TASK-ID",
                ))
            else:
                # Draft tasks can skip (but warn)
                violations.append(LintViolation(
                    level=ViolationLevel.WARNING,
                    message="clarifications.evidence_path is missing (required before transition to 'todo')",
                    field="clarifications.evidence_path",
                    suggestion="Add evidence_path before transitioning from draft",
                ))
            return violations

        # Check file exists
        evidence_path = self.repo_root / evidence_path_str

        if not evidence_path.exists():
            if status in ('todo', 'in_progress', 'completed'):
                violations.append(LintViolation(
                    level=ViolationLevel.ERROR,
                    message=f"Evidence file does not exist: {evidence_path_str}",
                    field="clarifications.evidence_path",
                    suggestion=f"Create file: python scripts/tasks.py --bootstrap-evidence {data.get('id', 'TASK-ID')}",
                ))
            else:
                # Draft tasks: warning only
                violations.append(LintViolation(
                    level=ViolationLevel.WARNING,
                    message=f"Evidence file does not exist: {evidence_path_str} (required before transitioning to 'todo')",
                    field="clarifications.evidence_path",
                    suggestion=f"Create file before claiming: python scripts/tasks.py --bootstrap-evidence {data.get('id', 'TASK-ID')}",
                ))

        return violations

    def _check_validation_section(self, data: Dict[str, Any]) -> List[LintViolation]:
        """
        Check that validation section exists and has required structure.

        Args:
            data: Parsed YAML dict

        Returns:
            List of violations
        """
        violations = []

        validation = data.get('validation')

        if not validation:
            violations.append(LintViolation(
                level=ViolationLevel.ERROR,
                message="Missing 'validation' section (required in schema 1.1)",
                field="validation",
                suggestion="Add validation section with pipeline commands (see docs/templates/validation-section-examples.md)",
            ))
            return violations

        if not isinstance(validation, dict):
            violations.append(LintViolation(
                level=ViolationLevel.ERROR,
                message="validation field must be a dict/object",
                field="validation",
            ))
            return violations

        # Check pipeline exists and is non-empty
        pipeline = validation.get('pipeline')

        if pipeline is None:
            violations.append(LintViolation(
                level=ViolationLevel.ERROR,
                message="validation.pipeline is required",
                field="validation.pipeline",
                suggestion="Add pipeline commands (see docs/templates/validation-section-examples.md)",
            ))
        elif not isinstance(pipeline, list):
            violations.append(LintViolation(
                level=ViolationLevel.ERROR,
                message="validation.pipeline must be an array",
                field="validation.pipeline",
            ))
        elif len(pipeline) == 0:
            violations.append(LintViolation(
                level=ViolationLevel.ERROR,
                message="validation.pipeline cannot be empty (add at least one validation command)",
                field="validation.pipeline",
                suggestion="Add commands like: lint:fix, qa:static, test, coverage (see docs/templates/validation-section-examples.md)",
            ))
        else:
            # Validate each pipeline entry
            for idx, entry in enumerate(pipeline):
                if not isinstance(entry, dict):
                    violations.append(LintViolation(
                        level=ViolationLevel.ERROR,
                        message=f"validation.pipeline[{idx}] must be a dict with 'command' and 'description' fields",
                        field=f"validation.pipeline[{idx}]",
                    ))
                    continue

                if 'command' not in entry:
                    violations.append(LintViolation(
                        level=ViolationLevel.ERROR,
                        message=f"validation.pipeline[{idx}] missing 'command' field",
                        field=f"validation.pipeline[{idx}].command",
                    ))

                if 'description' not in entry:
                    violations.append(LintViolation(
                        level=ViolationLevel.ERROR,
                        message=f"validation.pipeline[{idx}] missing 'description' field",
                        field=f"validation.pipeline[{idx}].description",
                    ))

        # manual_checks is optional, but check structure if present
        manual_checks = validation.get('manual_checks')
        if manual_checks is not None and not isinstance(manual_checks, list):
            violations.append(LintViolation(
                level=ViolationLevel.ERROR,
                message="validation.manual_checks must be an array (or omit if empty)",
                field="validation.manual_checks",
            ))

        return violations

    def _check_plan_outputs(self, data: Dict[str, Any]) -> List[LintViolation]:
        """
        Check that plan steps have non-empty outputs.

        Args:
            data: Parsed YAML dict

        Returns:
            List of violations
        """
        violations = []

        plan = data.get('plan', [])

        if not isinstance(plan, list):
            # Plan exists but wrong type - error
            violations.append(LintViolation(
                level=ViolationLevel.ERROR,
                message="plan field must be an array",
                field="plan",
            ))
            return violations

        for idx, step in enumerate(plan):
            if not isinstance(step, dict):
                continue

            step_id = step.get('id', idx + 1)
            outputs = step.get('outputs')

            if outputs is None:
                violations.append(LintViolation(
                    level=ViolationLevel.ERROR,
                    message=f"plan[{idx}] (step {step_id}): missing 'outputs' field",
                    field=f"plan[{idx}].outputs",
                    suggestion="Add specific deliverable files or evidence artifacts",
                ))
            elif isinstance(outputs, list) and len(outputs) == 0:
                violations.append(LintViolation(
                    level=ViolationLevel.ERROR,
                    message=f"plan[{idx}] (step {step_id}): 'outputs' cannot be empty array",
                    field=f"plan[{idx}].outputs",
                    suggestion="List specific files/artifacts produced by this step (e.g., src/domain/job.ts, tests/job.test.ts)",
                ))

        return violations

    def _check_standards_anchors(self, data: Dict[str, Any]) -> List[LintViolation]:
        """
        Validate standards references cite real files (Phase 1: file-level only).

        Future enhancement: parse markdown headings and validate anchor slugs.

        Args:
            data: Parsed YAML dict

        Returns:
            List of violations
        """
        violations = []

        # Extract standards references from plan.details and definition_of_done
        plan = data.get('plan', [])

        # Regex to match standards/foo.md#anchor
        anchor_pattern = re.compile(r'(standards/[\w\-]+\.md)(#[\w\-]+)?')

        for idx, step in enumerate(plan):
            if not isinstance(step, dict):
                continue

            step_id = step.get('id', idx + 1)
            details = step.get('details', '')
            dod = step.get('definition_of_done', [])

            # Check details field
            if isinstance(details, str):
                for match in anchor_pattern.finditer(details):
                    file_ref = match.group(1)  # e.g., "standards/backend-tier.md"
                    anchor = match.group(2)  # e.g., "#domain-service-layer" or None

                    # Check file exists
                    file_path = self.repo_root / file_ref
                    if not file_path.exists():
                        violations.append(LintViolation(
                            level=ViolationLevel.WARNING,
                            message=f"plan[{idx}] (step {step_id}): Referenced file does not exist: {file_ref}",
                            field=f"plan[{idx}].details",
                            suggestion=f"Verify file path is correct or create missing standards file",
                        ))

                    # Phase 1: Skip anchor validation (future enhancement)
                    # Phase 2 would parse markdown and validate heading slugs

            # Check definition_of_done items
            if isinstance(dod, list):
                for dod_idx, dod_item in enumerate(dod):
                    if not isinstance(dod_item, str):
                        continue

                    for match in anchor_pattern.finditer(dod_item):
                        file_ref = match.group(1)
                        anchor = match.group(2)

                        file_path = self.repo_root / file_ref
                        if not file_path.exists():
                            violations.append(LintViolation(
                                level=ViolationLevel.WARNING,
                                message=f"plan[{idx}] (step {step_id}), definition_of_done[{dod_idx}]: Referenced file does not exist: {file_ref}",
                                field=f"plan[{idx}].definition_of_done[{dod_idx}]",
                                suggestion=f"Verify file path is correct",
                            ))

        return violations

    def _check_complexity_budget(self, data: Dict[str, Any]) -> List[LintViolation]:
        """
        Check task complexity against granularity thresholds.

        Validates per standards/task-breakdown-canon.md and standards/task-sizing-guide.md:
        - File count ≤10 (hard fail)
        - Plan steps ≤6 (warn at threshold)
        - Session time risk: >6 steps AND >5 files (hard fail)
        - L-sized tasks flagged for breakdown review

        Args:
            data: Parsed YAML dict

        Returns:
            List of violations
        """
        violations = []

        # Extract plan and deliverables
        plan = data.get('plan', [])
        deliverables = data.get('deliverables', {})
        estimate = data.get('estimate', '')

        # Count plan steps
        plan_steps = len(plan) if isinstance(plan, list) else 0

        # Estimate file count from deliverables
        file_count = self._estimate_file_count(deliverables)

        # Check file count threshold (hard fail at >10)
        if file_count > 10:
            violations.append(LintViolation(
                level=ViolationLevel.ERROR,
                message=f"Task exceeds file count limit: {file_count} files (max 10). MUST break down per standards/task-breakdown-canon.md",
                field="deliverables",
                suggestion=f"Split task into subtasks, each ≤10 files. See standards/task-sizing-guide.md for XS/S/M/L taxonomy",
            ))
        elif file_count > 8:
            violations.append(LintViolation(
                level=ViolationLevel.WARNING,
                message=f"Task approaching file count limit: {file_count} files (warn at 8, fail at 10). Consider breakdown.",
                field="deliverables",
                suggestion="Review if task can be split into smaller subtasks. L-sized tasks (9-10 files) are at upper limit.",
            ))

        # Check plan step threshold (warn at >6)
        if plan_steps > 6:
            violations.append(LintViolation(
                level=ViolationLevel.WARNING,
                message=f"Task exceeds plan step limit: {plan_steps} steps (max 6). Consider breakdown.",
                field="plan",
                suggestion="Break complex plans into subtasks with ≤6 steps each. See standards/task-breakdown-canon.md",
            ))

        # Check session time risk: >6 steps AND >5 files (hard fail)
        if plan_steps > 6 and file_count > 5:
            violations.append(LintViolation(
                level=ViolationLevel.ERROR,
                message=f"Session time risk: {plan_steps} steps AND {file_count} files exceeds single-session budget (<45 min). MUST break down.",
                field="plan",
                suggestion="Split task to reduce either plan steps ≤6 OR file count ≤5. See standards/task-sizing-guide.md session time estimation.",
            ))

        # Warn if task is L-sized (should review breakdown)
        if estimate == 'L':
            violations.append(LintViolation(
                level=ViolationLevel.WARNING,
                message="Task marked as L (Large) - at upper limit. Verify breakdown is not needed.",
                field="estimate",
                suggestion="L-sized tasks (9-10 files, 300-500 LOC) are acceptable but should be reviewed for split opportunities.",
            ))

        # Info-level reminder if task has no estimate field
        if not estimate and plan_steps > 0:
            violations.append(LintViolation(
                level=ViolationLevel.INFO,
                message="Task missing 'estimate' field (XS/S/M/L). Recommended for tracking complexity.",
                field="estimate",
                suggestion="Add estimate: XS|S|M|L per standards/task-sizing-guide.md taxonomy",
            ))

        return violations

    def _estimate_file_count(self, deliverables: Any) -> int:
        """
        Estimate file count from deliverables section.

        Counts:
        - Individual file paths in deliverables list
        - Files listed in plan step outputs
        - Conservative estimate if structure is unclear

        Args:
            deliverables: Deliverables section (list, dict, or string)

        Returns:
            Estimated file count (0 if cannot parse)
        """
        if not deliverables:
            return 0

        file_count = 0

        # Handle list format: ["file1.ts", "file2.ts"]
        if isinstance(deliverables, list):
            file_count = len(deliverables)

        # Handle dict format: {files: [...], artifacts: [...]}
        elif isinstance(deliverables, dict):
            files = deliverables.get('files', [])
            if isinstance(files, list):
                file_count += len(files)

            # Also count artifacts if they're file paths
            artifacts = deliverables.get('artifacts', [])
            if isinstance(artifacts, list):
                # Filter for file-like artifacts (exclude descriptions)
                file_artifacts = [a for a in artifacts if isinstance(a, str) and '/' in a]
                file_count += len(file_artifacts)

        # Handle string format (fallback: estimate 1 file)
        elif isinstance(deliverables, str):
            # Count file-like patterns in string (e.g., "src/foo.ts, tests/foo.test.ts")
            file_patterns = re.findall(r'\S+\.\w{1,4}(?:\s|,|$)', deliverables)
            file_count = len(file_patterns) if file_patterns else 1

        return file_count


def format_violations(violations: List[LintViolation], show_suggestions: bool = True) -> str:
    """
    Format lint violations for display.

    Args:
        violations: List of violations to format
        show_suggestions: Whether to include fix suggestions

    Returns:
        Formatted string (one violation per line)
    """
    if not violations:
        return "✅ No violations found"

    lines = []
    errors = [v for v in violations if v.level == ViolationLevel.ERROR]
    warnings = [v for v in violations if v.level == ViolationLevel.WARNING]
    infos = [v for v in violations if v.level == ViolationLevel.INFO]

    if errors:
        lines.append(f"\n❌ {len(errors)} ERROR(S):")
        for v in errors:
            field_info = f" [{v.field}]" if v.field else ""
            lines.append(f"  • {v.message}{field_info}")
            if show_suggestions and v.suggestion:
                lines.append(f"    💡 {v.suggestion}")

    if warnings:
        lines.append(f"\n⚠️  {len(warnings)} WARNING(S):")
        for v in warnings:
            field_info = f" [{v.field}]" if v.field else ""
            lines.append(f"  • {v.message}{field_info}")
            if show_suggestions and v.suggestion:
                lines.append(f"    💡 {v.suggestion}")

    if infos:
        lines.append(f"\nℹ️  {len(infos)} INFO:")
        for v in infos:
            field_info = f" [{v.field}]" if v.field else ""
            lines.append(f"  • {v.message}{field_info}")

    return "\n".join(lines)
