"""
Unit tests for acceptance criteria validation module.

Tests validation of task snapshot completeness per Section 8 of
task-context-cache-hardening-schemas.md.
"""

import pytest
from tasks_cli.validation import (
    E001_REQUIRED_FIELD_EMPTY,
    check_optional_fields,
    check_required_fields,
    check_standards_citations,
    validate_plan_structure,
    validate_task_snapshot_completeness,
)


class TestValidateTaskSnapshotCompleteness:
    """Tests for the main validation entry point."""

    def test_valid_task_passes(self):
        """Test that a valid task passes all validation checks."""
        task_data = {
            "schema_version": "1.1",
            "acceptance_criteria": {
                "must": ["Criterion 1", "Criterion 2"],
                "quality_gates": ["Gate 1"]
            },
            "scope": {
                "in": ["Item 1", "Item 2"],
                "out": ["Item 3"]
            },
            "plan": [
                {"id": 1, "title": "Step 1", "outputs": ["output1"]},
                {"id": 2, "title": "Step 2", "outputs": ["output2"]}
            ],
            "deliverables": ["File 1", "File 2"],
            "validation": {
                "pipeline": [
                    {"command": "test", "description": "Test command"}
                ]
            },
            "context": {
                "standards_tier": "backend"
            },
            "risks": [
                {"description": "Risk 1", "mitigation": "Mitigation 1"}
            ]
        }

        issues = validate_task_snapshot_completeness(task_data)
        assert issues == []

    def test_multiple_errors_and_warnings_combined(self):
        """Test that validation returns both errors and warnings."""
        task_data = {
            "schema_version": "1.1",
            # Missing acceptance_criteria, scope.in, plan, deliverables, validation.pipeline
            # Also missing optional scope.out and risks
            "scope": {},
            "validation": {}
        }

        issues = validate_task_snapshot_completeness(task_data)

        # Should have errors for required fields
        error_issues = [i for i in issues if i["severity"] == "error"]
        assert len(error_issues) >= 5  # At least 5 required fields missing

        # Should have warnings for optional fields
        warning_issues = [i for i in issues if i["severity"] == "warning"]
        assert len(warning_issues) >= 2  # scope.out, risks, standards


class TestCheckRequiredFields:
    """Tests for required field validation."""

    def test_empty_acceptance_criteria_returns_e001(self):
        """Test that empty acceptance_criteria returns E001 error."""
        task_data = {
            "acceptance_criteria": [],
            "scope": {"in": ["item"]},
            "plan": [{"outputs": ["out"]}],
            "deliverables": ["file"],
            "schema_version": "1.0"
        }

        errors = check_required_fields(task_data)

        error_codes = [e["code"] for e in errors]
        assert E001_REQUIRED_FIELD_EMPTY in error_codes

        ac_error = next((e for e in errors if e["field"] == "acceptance_criteria"), None)
        assert ac_error is not None
        assert ac_error["severity"] == "error"
        assert "acceptance criteria" in ac_error["message"].lower()

    def test_missing_scope_in_returns_e001(self):
        """Test that missing scope.in returns E001 error."""
        task_data = {
            "acceptance_criteria": ["criterion"],
            "scope": {},  # Missing 'in'
            "plan": [{"outputs": ["out"]}],
            "deliverables": ["file"],
            "schema_version": "1.0"
        }

        errors = check_required_fields(task_data)

        scope_error = next((e for e in errors if e["field"] == "scope.in"), None)
        assert scope_error is not None
        assert scope_error["code"] == E001_REQUIRED_FIELD_EMPTY
        assert scope_error["severity"] == "error"

    def test_empty_plan_returns_e001(self):
        """Test that empty plan returns E001 error."""
        task_data = {
            "acceptance_criteria": ["criterion"],
            "scope": {"in": ["item"]},
            "plan": [],
            "deliverables": ["file"],
            "schema_version": "1.0"
        }

        errors = check_required_fields(task_data)

        plan_error = next((e for e in errors if e["field"] == "plan"), None)
        assert plan_error is not None
        assert plan_error["code"] == E001_REQUIRED_FIELD_EMPTY

    def test_empty_deliverables_returns_e001(self):
        """Test that empty deliverables returns E001 error."""
        task_data = {
            "acceptance_criteria": ["criterion"],
            "scope": {"in": ["item"]},
            "plan": [{"outputs": ["out"]}],
            "deliverables": [],
            "schema_version": "1.0"
        }

        errors = check_required_fields(task_data)

        deliverables_error = next((e for e in errors if e["field"] == "deliverables"), None)
        assert deliverables_error is not None
        assert deliverables_error["code"] == E001_REQUIRED_FIELD_EMPTY

    def test_empty_validation_pipeline_schema_11_returns_e001(self):
        """Test that empty validation.pipeline in schema 1.1 returns E001 error."""
        task_data = {
            "schema_version": "1.1",
            "acceptance_criteria": ["criterion"],
            "scope": {"in": ["item"]},
            "plan": [{"outputs": ["out"]}],
            "deliverables": ["file"],
            "validation": {}  # Missing pipeline
        }

        errors = check_required_fields(task_data)

        pipeline_error = next((e for e in errors if e["field"] == "validation.pipeline"), None)
        assert pipeline_error is not None
        assert pipeline_error["code"] == E001_REQUIRED_FIELD_EMPTY
        assert "schema 1.1" in pipeline_error["message"]

    def test_validation_pipeline_not_required_schema_10(self):
        """Test that validation.pipeline is not required in schema 1.0."""
        task_data = {
            "schema_version": "1.0",
            "acceptance_criteria": ["criterion"],
            "scope": {"in": ["item"]},
            "plan": [{"outputs": ["out"]}],
            "deliverables": ["file"],
            "validation": {}  # Missing pipeline - OK for 1.0
        }

        errors = check_required_fields(task_data)

        pipeline_errors = [e for e in errors if e["field"] == "validation.pipeline"]
        assert len(pipeline_errors) == 0

    def test_all_required_fields_present_no_errors(self):
        """Test that all required fields present returns no errors."""
        task_data = {
            "schema_version": "1.1",
            "acceptance_criteria": ["criterion"],
            "scope": {"in": ["item"]},
            "plan": [{"outputs": ["out"]}],
            "deliverables": ["file"],
            "validation": {"pipeline": [{"command": "test"}]}
        }

        errors = check_required_fields(task_data)
        assert errors == []


class TestValidatePlanStructure:
    """Tests for plan structure validation."""

    def test_empty_plan_step_outputs_returns_e001(self):
        """Test that empty plan step outputs returns E001 error."""
        plan = [
            {"id": 1, "title": "Step 1", "outputs": []},  # Empty outputs
            {"id": 2, "title": "Step 2", "outputs": ["output2"]}
        ]

        errors = validate_plan_structure(plan)

        output_error = next((e for e in errors if "plan[0].outputs" in e["field"]), None)
        assert output_error is not None
        assert output_error["code"] == E001_REQUIRED_FIELD_EMPTY
        assert output_error["severity"] == "error"
        assert "step 1" in output_error["message"].lower()

    def test_missing_plan_step_outputs_returns_e001(self):
        """Test that missing plan step outputs returns E001 error."""
        plan = [
            {"id": 1, "title": "Step 1"},  # Missing outputs
            {"id": 2, "title": "Step 2", "outputs": ["output2"]}
        ]

        errors = validate_plan_structure(plan)

        output_error = next((e for e in errors if "plan[0].outputs" in e["field"]), None)
        assert output_error is not None
        assert output_error["code"] == E001_REQUIRED_FIELD_EMPTY

    def test_all_plan_steps_have_outputs_no_errors(self):
        """Test that all plan steps with outputs returns no errors."""
        plan = [
            {"id": 1, "title": "Step 1", "outputs": ["output1"]},
            {"id": 2, "title": "Step 2", "outputs": ["output2", "output3"]}
        ]

        errors = validate_plan_structure(plan)
        assert errors == []

    def test_empty_plan_no_errors(self):
        """Test that empty plan returns no structural errors."""
        # Empty plan is caught by check_required_fields, not validate_plan_structure
        plan = []

        errors = validate_plan_structure(plan)
        assert errors == []

    def test_multiple_steps_with_empty_outputs(self):
        """Test multiple plan steps with empty outputs."""
        plan = [
            {"id": 1, "title": "Step 1", "outputs": []},
            {"id": 2, "title": "Step 2", "outputs": []},
            {"id": 3, "title": "Step 3", "outputs": ["output3"]}
        ]

        errors = validate_plan_structure(plan)

        assert len(errors) == 2  # Two errors for steps 1 and 2
        assert all(e["code"] == E001_REQUIRED_FIELD_EMPTY for e in errors)


class TestCheckOptionalFields:
    """Tests for optional field warnings."""

    def test_missing_scope_out_returns_warning(self):
        """Test that missing scope.out returns warning."""
        task_data = {
            "scope": {"in": ["item"]}  # Missing 'out'
        }

        warnings = check_optional_fields(task_data)

        scope_out_warning = next((w for w in warnings if w["field"] == "scope.out"), None)
        assert scope_out_warning is not None
        assert scope_out_warning["severity"] == "warning"
        assert scope_out_warning["code"] == "W001"

    def test_empty_scope_out_returns_warning(self):
        """Test that empty scope.out returns warning."""
        task_data = {
            "scope": {"in": ["item"], "out": []}
        }

        warnings = check_optional_fields(task_data)

        scope_out_warning = next((w for w in warnings if w["field"] == "scope.out"), None)
        assert scope_out_warning is not None
        assert scope_out_warning["severity"] == "warning"

    def test_missing_risks_returns_warning(self):
        """Test that missing risks returns warning."""
        task_data = {}

        warnings = check_optional_fields(task_data)

        risks_warning = next((w for w in warnings if w["field"] == "risks"), None)
        assert risks_warning is not None
        assert risks_warning["severity"] == "warning"
        assert risks_warning["code"] == "W003"

    def test_all_optional_fields_present_no_warnings(self):
        """Test that all optional fields present returns no warnings."""
        task_data = {
            "scope": {"in": ["item"], "out": ["excluded"]},
            "risks": [{"description": "risk"}]
        }

        warnings = check_optional_fields(task_data)
        assert warnings == []


class TestCheckStandardsCitations:
    """Tests for standards citations validation."""

    def test_missing_standards_tier_returns_warning(self):
        """Test that missing standards_tier returns warning."""
        task_data = {
            "context": {},
            "acceptance_criteria": {"must": ["criterion"]}
        }

        warnings = check_standards_citations(task_data)

        tier_warning = next((w for w in warnings if w["field"] == "context.standards_tier"), None)
        assert tier_warning is not None
        assert tier_warning["severity"] == "warning"
        assert tier_warning["code"] == "W002"

    def test_standards_tier_present_no_tier_warning(self):
        """Test that standards_tier present does not return tier warning."""
        task_data = {
            "context": {"standards_tier": "backend"},
            "acceptance_criteria": {"must": ["Must reference standards/backend-tier.md"]}
        }

        warnings = check_standards_citations(task_data)

        tier_warnings = [w for w in warnings if w["field"] == "context.standards_tier"]
        assert len(tier_warnings) == 0

    def test_acceptance_criteria_without_standards_ref_returns_warning(self):
        """Test that acceptance criteria without standards/ reference returns warning."""
        task_data = {
            "context": {},
            "acceptance_criteria": {
                "must": ["Criterion without standards reference"]
            }
        }

        warnings = check_standards_citations(task_data)

        # Should have warning for both missing tier and missing standards ref
        assert len(warnings) >= 2

    def test_acceptance_criteria_with_standards_ref_no_criteria_warning(self):
        """Test that acceptance criteria with standards/ ref does not return criteria warning."""
        task_data = {
            "context": {"standards_tier": "backend"},
            "acceptance_criteria": {
                "must": ["Must satisfy standards/backend-tier.md handler constraints"]
            }
        }

        warnings = check_standards_citations(task_data)

        criteria_warnings = [w for w in warnings if w["field"] == "acceptance_criteria"]
        assert len(criteria_warnings) == 0

    def test_acceptance_criteria_legacy_list_format(self):
        """Test standards checking works with legacy list format."""
        task_data = {
            "context": {"standards_tier": "backend"},
            "acceptance_criteria": [
                "Criterion 1 per standards/backend-tier.md",
                "Criterion 2"
            ]
        }

        warnings = check_standards_citations(task_data)

        # Should not warn about criteria since standards/ is present
        criteria_warnings = [w for w in warnings if w["field"] == "acceptance_criteria"]
        assert len(criteria_warnings) == 0

    def test_both_standards_tier_and_criteria_ref_no_warnings(self):
        """Test that both standards_tier and criteria ref returns no warnings."""
        task_data = {
            "context": {"standards_tier": "backend"},
            "acceptance_criteria": {
                "must": ["Follow standards/typescript.md"],
                "quality_gates": ["Meet standards/testing-standards.md thresholds"]
            }
        }

        warnings = check_standards_citations(task_data)
        assert warnings == []


class TestValidationIssueStructure:
    """Tests for validation issue format."""

    def test_error_issue_has_required_fields(self):
        """Test that error issues have all required fields."""
        task_data = {
            "schema_version": "1.1",
            "acceptance_criteria": [],  # Empty to trigger error
            "scope": {"in": ["item"]},
            "plan": [{"outputs": ["out"]}],
            "deliverables": ["file"],
            "validation": {"pipeline": [{"command": "test"}]}
        }

        errors = check_required_fields(task_data)

        assert len(errors) > 0
        error = errors[0]

        # Check all required fields present
        assert "code" in error
        assert "severity" in error
        assert "message" in error
        assert "field" in error
        assert "recovery_action" in error

        # Check types
        assert isinstance(error["code"], str)
        assert isinstance(error["severity"], str)
        assert isinstance(error["message"], str)
        assert isinstance(error["field"], str)
        assert isinstance(error["recovery_action"], str)

    def test_warning_issue_has_required_fields(self):
        """Test that warning issues have all required fields."""
        task_data = {
            "scope": {}  # Missing scope.out to trigger warning
        }

        warnings = check_optional_fields(task_data)

        assert len(warnings) > 0
        warning = warnings[0]

        # Check all required fields present
        assert "code" in warning
        assert "severity" in warning
        assert "message" in warning
        assert "field" in warning
        assert "recovery_action" in warning

        assert warning["severity"] == "warning"


class TestSchemaVersionHandling:
    """Tests for schema version differences."""

    def test_schema_10_does_not_require_validation_pipeline(self):
        """Test schema 1.0 does not require validation.pipeline."""
        task_data = {
            "schema_version": "1.0",
            "acceptance_criteria": ["criterion"],
            "scope": {"in": ["item"]},
            "plan": [{"outputs": ["out"]}],
            "deliverables": ["file"]
            # No validation.pipeline - OK for 1.0
        }

        issues = validate_task_snapshot_completeness(task_data)

        # Should not have error for validation.pipeline
        pipeline_errors = [i for i in issues if i["field"] == "validation.pipeline" and i["severity"] == "error"]
        assert len(pipeline_errors) == 0

    def test_schema_11_requires_validation_pipeline(self):
        """Test schema 1.1 requires validation.pipeline."""
        task_data = {
            "schema_version": "1.1",
            "acceptance_criteria": ["criterion"],
            "scope": {"in": ["item"]},
            "plan": [{"outputs": ["out"]}],
            "deliverables": ["file"]
            # Missing validation.pipeline - ERROR for 1.1
        }

        issues = validate_task_snapshot_completeness(task_data)

        # Should have error for validation.pipeline
        pipeline_errors = [i for i in issues if i["field"] == "validation.pipeline" and i["severity"] == "error"]
        assert len(pipeline_errors) == 1

    def test_default_schema_version_treated_as_10(self):
        """Test that missing schema_version defaults to 1.0 behavior."""
        task_data = {
            # schema_version not specified - defaults to 1.0
            "acceptance_criteria": ["criterion"],
            "scope": {"in": ["item"]},
            "plan": [{"outputs": ["out"]}],
            "deliverables": ["file"]
            # No validation.pipeline - OK for default 1.0
        }

        issues = validate_task_snapshot_completeness(task_data)

        # Should not require validation.pipeline
        pipeline_errors = [i for i in issues if i["field"] == "validation.pipeline" and i["severity"] == "error"]
        assert len(pipeline_errors) == 0
