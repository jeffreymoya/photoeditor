"""
Test QA baseline management functionality.

Tests QABaselineManager class extracted from validation.py (S3.5).
Covers command execution, drift detection, and report formatting.
"""

import pytest
import subprocess
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timezone

from tasks_cli.context_store.qa import QABaselineManager
from tasks_cli.context_store.models import (
    QAResults,
    QACommandResult,
    QACommandSummary,
    QACoverageSummary,
)
from tasks_cli.models import ValidationCommand, RetryPolicy, Task


@pytest.fixture
def temp_repo(tmp_path):
    """Create temporary git repository."""
    repo = tmp_path / "repo"
    repo.mkdir()

    # Initialize git repo with explicit branch name (required by newer git versions)
    subprocess.run(['git', 'init', '-b', 'main'], cwd=repo, check=True, capture_output=True)
    subprocess.run(['git', 'config', 'user.name', 'Test User'], cwd=repo, check=True, capture_output=True)
    subprocess.run(['git', 'config', 'user.email', 'test@example.com'], cwd=repo, check=True, capture_output=True)
    # Disable GPG signing for test commits
    subprocess.run(['git', 'config', 'commit.gpgsign', 'false'], cwd=repo, check=True, capture_output=True)

    # Create initial commit
    test_file = repo / "test.txt"
    test_file.write_text("initial content\n")
    subprocess.run(['git', 'add', '.'], cwd=repo, check=True, capture_output=True)
    subprocess.run(['git', 'commit', '-m', 'Initial commit'], cwd=repo, check=True, capture_output=True)

    # Create task directory
    tasks_dir = repo / "tasks"
    tasks_dir.mkdir()

    return repo


@pytest.fixture
def qa_manager(temp_repo):
    """Create QABaselineManager instance."""
    return QABaselineManager(temp_repo)


@pytest.fixture
def sample_validation_command():
    """Sample ValidationCommand for testing."""
    return ValidationCommand(
        id="val-001",
        command="echo 'test'",
        description="Test command",
        cwd=".",
        expected_exit_codes=[0],
        timeout_ms=5000,
        retry_policy=RetryPolicy(max_attempts=1, backoff_ms=1000)
    )


# ============================================================================
# Test 1-5: QABaselineManager Initialization and Basic Operations
# ============================================================================

def test_qa_manager_initialization(temp_repo):
    """Test QABaselineManager can be initialized."""
    manager = QABaselineManager(temp_repo)
    assert manager.repo_root == temp_repo


def test_execute_command_success(qa_manager, sample_validation_command):
    """Test successful command execution."""
    result = qa_manager.execute_command(sample_validation_command, "TASK-0001")

    assert result["success"] is True
    assert result["exit_code"] == 0
    assert result["stdout"].strip() == "test"
    assert result["skipped"] is False
    assert result["attempts"] == 1
    assert result["duration_ms"] >= 0  # Fast commands may complete in <1ms


def test_execute_command_with_custom_cwd(temp_repo):
    """Test command execution with custom working directory."""
    # Create subdirectory
    subdir = temp_repo / "subdir"
    subdir.mkdir()
    (subdir / "marker.txt").write_text("marker")

    manager = QABaselineManager(temp_repo)
    cmd = ValidationCommand(
        id="val-001",
        command="cat marker.txt",
        description="Test in subdir",
        cwd="subdir",
        expected_exit_codes=[0]
    )

    result = manager.execute_command(cmd, "TASK-0001")

    assert result["success"] is True
    assert result["stdout"].strip() == "marker"


def test_execute_command_with_env_vars(qa_manager):
    """Test command execution with environment variables."""
    cmd = ValidationCommand(
        id="val-001",
        command="echo $TEST_VAR",
        description="Test env var",
        env={"TEST_VAR": "hello_world"},
        expected_exit_codes=[0]
    )

    result = qa_manager.execute_command(cmd, "TASK-0001")

    assert result["success"] is True
    assert result["stdout"].strip() == "hello_world"


def test_execute_command_nonzero_exit_code(qa_manager):
    """Test command execution with non-zero exit code."""
    cmd = ValidationCommand(
        id="val-001",
        command="exit 1",
        description="Test failure",
        expected_exit_codes=[0]
    )

    result = qa_manager.execute_command(cmd, "TASK-0001")

    assert result["success"] is False
    assert result["exit_code"] == 1
    assert result["skipped"] is False


# ============================================================================
# Test 6-10: Expected Paths and Pre-flight Checks
# ============================================================================

def test_execute_command_skipped_missing_path(qa_manager):
    """Test command skipped when expected path missing."""
    cmd = ValidationCommand(
        id="val-001",
        command="echo 'test'",
        description="Test missing path",
        expected_paths=["nonexistent/path/file.txt"],
        expected_exit_codes=[0]
    )

    result = qa_manager.execute_command(cmd, "TASK-0001")

    assert result["success"] is False
    assert result["skipped"] is True
    assert "Expected path not found" in result["skip_reason"]
    assert "nonexistent/path/file.txt" in result["skip_reason"]


def test_execute_command_expected_paths_exist(temp_repo, qa_manager):
    """Test command executes when expected paths exist."""
    # Create expected file
    test_file = temp_repo / "expected.txt"
    test_file.write_text("content")

    cmd = ValidationCommand(
        id="val-001",
        command="echo 'test'",
        description="Test expected path",
        expected_paths=["expected.txt"],
        expected_exit_codes=[0]
    )

    result = qa_manager.execute_command(cmd, "TASK-0001")

    assert result["success"] is True
    assert result["skipped"] is False


def test_execute_command_skipped_missing_cwd(temp_repo):
    """Test command skipped when working directory missing."""
    manager = QABaselineManager(temp_repo)
    cmd = ValidationCommand(
        id="val-001",
        command="echo 'test'",
        description="Test missing cwd",
        cwd="nonexistent_dir",
        expected_exit_codes=[0]
    )

    result = manager.execute_command(cmd, "TASK-0001")

    assert result["success"] is False
    assert result["skipped"] is True
    assert "Working directory does not exist" in result["skip_reason"]


def test_verify_expected_paths_all_exist(temp_repo, qa_manager):
    """Test _verify_expected_paths with all paths existing."""
    # Create test files
    (temp_repo / "file1.txt").write_text("content")
    (temp_repo / "file2.txt").write_text("content")

    all_exist, missing = qa_manager._verify_expected_paths(["file1.txt", "file2.txt"])

    assert all_exist is True
    assert missing == []


def test_verify_expected_paths_some_missing(temp_repo, qa_manager):
    """Test _verify_expected_paths with missing paths."""
    (temp_repo / "file1.txt").write_text("content")

    all_exist, missing = qa_manager._verify_expected_paths(["file1.txt", "missing.txt"])

    assert all_exist is False
    assert "missing.txt" in missing


# ============================================================================
# Test 11-15: Blocker Status and Drift Detection
# ============================================================================

def test_check_blocker_status_not_found(temp_repo, qa_manager):
    """Test blocker status when blocker task doesn't exist."""
    is_blocked, reason = qa_manager._check_blocker_status("TASK-9999")

    assert is_blocked is False
    assert "not found" in reason


def test_check_blocker_status_completed(temp_repo, qa_manager):
    """Test blocker status when blocker is completed."""
    # Create completed blocker task
    tasks_dir = temp_repo / "tasks"
    task_file = tasks_dir / "TASK-0001-blocker.task.yaml"
    task_file.write_text("""
id: TASK-0001
title: Blocker task
status: completed
priority: P1
area: backend
schema_version: "1.1"
scope:
  in: ["backend/"]
  out: []
acceptance_criteria:
  must: ["Done"]
plan:
  - step: 1
    outputs: ["result"]
deliverables: ["file.txt"]
validation:
  pipeline:
    - id: val-001
      command: echo test
      description: Test
""")

    is_blocked, reason = qa_manager._check_blocker_status("TASK-0001")

    assert is_blocked is False
    assert reason == ""


def test_detect_drift_no_changes(qa_manager):
    """Test drift detection with identical results."""
    baseline = QAResults(
        recorded_at=datetime.now(timezone.utc).isoformat(),
        agent="implementer",
        git_sha="abc123",
        results=[
            QACommandResult(
                command_id="val-001",
                command="echo test",
                exit_code=0,
                duration_ms=100,
                summary=QACommandSummary(lint_errors=0, type_errors=0)
            )
        ]
    )

    current = QAResults(
        recorded_at=datetime.now(timezone.utc).isoformat(),
        agent="implementer",
        git_sha="abc123",
        results=[
            QACommandResult(
                command_id="val-001",
                command="echo test",
                exit_code=0,
                duration_ms=105,
                summary=QACommandSummary(lint_errors=0, type_errors=0)
            )
        ]
    )

    drift = qa_manager.detect_drift(baseline, current)

    assert drift["has_drift"] is False
    assert drift["regressions"] == []
    assert drift["improvements"] == []


def test_detect_drift_exit_code_regression(qa_manager):
    """Test drift detection with exit code regression."""
    baseline = QAResults(
        recorded_at=datetime.now(timezone.utc).isoformat(),
        agent="implementer",
        results=[
            QACommandResult(
                command_id="val-001",
                command="echo test",
                exit_code=0,
                duration_ms=100
            )
        ]
    )

    current = QAResults(
        recorded_at=datetime.now(timezone.utc).isoformat(),
        agent="implementer",
        results=[
            QACommandResult(
                command_id="val-001",
                command="echo test",
                exit_code=1,
                duration_ms=100
            )
        ]
    )

    drift = qa_manager.detect_drift(baseline, current)

    assert drift["has_drift"] is True
    assert len(drift["regressions"]) == 1
    assert drift["regressions"][0]["type"] == "exit_code_regression"
    assert drift["regressions"][0]["severity"] == "error"


def test_detect_drift_lint_errors_increased(qa_manager):
    """Test drift detection with increased lint errors."""
    baseline = QAResults(
        recorded_at=datetime.now(timezone.utc).isoformat(),
        agent="implementer",
        results=[
            QACommandResult(
                command_id="val-001",
                command="lint",
                exit_code=0,
                duration_ms=100,
                summary=QACommandSummary(lint_errors=2, type_errors=0)
            )
        ]
    )

    current = QAResults(
        recorded_at=datetime.now(timezone.utc).isoformat(),
        agent="implementer",
        results=[
            QACommandResult(
                command_id="val-001",
                command="lint",
                exit_code=0,
                duration_ms=100,
                summary=QACommandSummary(lint_errors=5, type_errors=0)
            )
        ]
    )

    drift = qa_manager.detect_drift(baseline, current)

    assert drift["has_drift"] is True
    assert len(drift["regressions"]) == 1
    reg = drift["regressions"][0]
    assert reg["type"] == "lint_errors_increased"
    assert reg["baseline"] == 2
    assert reg["current"] == 5
    assert reg["delta"] == 3


# ============================================================================
# Test 16-20: Drift Detection - Type Errors, Tests, Coverage
# ============================================================================

def test_detect_drift_type_errors_increased(qa_manager):
    """Test drift detection with increased type errors."""
    baseline = QAResults(
        recorded_at=datetime.now(timezone.utc).isoformat(),
        agent="implementer",
        results=[
            QACommandResult(
                command_id="val-001",
                command="typecheck",
                exit_code=0,
                duration_ms=100,
                summary=QACommandSummary(lint_errors=0, type_errors=1)
            )
        ]
    )

    current = QAResults(
        recorded_at=datetime.now(timezone.utc).isoformat(),
        agent="implementer",
        results=[
            QACommandResult(
                command_id="val-001",
                command="typecheck",
                exit_code=0,
                duration_ms=100,
                summary=QACommandSummary(lint_errors=0, type_errors=4)
            )
        ]
    )

    drift = qa_manager.detect_drift(baseline, current)

    assert drift["has_drift"] is True
    assert len(drift["regressions"]) == 1
    reg = drift["regressions"][0]
    assert reg["type"] == "type_errors_increased"
    assert reg["delta"] == 3


def test_detect_drift_tests_failed_increased(qa_manager):
    """Test drift detection with increased test failures."""
    baseline = QAResults(
        recorded_at=datetime.now(timezone.utc).isoformat(),
        agent="implementer",
        results=[
            QACommandResult(
                command_id="val-001",
                command="test",
                exit_code=0,
                duration_ms=100,
                summary=QACommandSummary(tests_passed=10, tests_failed=0)
            )
        ]
    )

    current = QAResults(
        recorded_at=datetime.now(timezone.utc).isoformat(),
        agent="implementer",
        results=[
            QACommandResult(
                command_id="val-001",
                command="test",
                exit_code=0,
                duration_ms=100,
                summary=QACommandSummary(tests_passed=8, tests_failed=2)
            )
        ]
    )

    drift = qa_manager.detect_drift(baseline, current)

    assert drift["has_drift"] is True
    assert len(drift["regressions"]) == 1
    reg = drift["regressions"][0]
    assert reg["type"] == "tests_failed_increased"
    assert reg["delta"] == 2


def test_detect_drift_coverage_dropped(qa_manager):
    """Test drift detection with dropped coverage."""
    baseline = QAResults(
        recorded_at=datetime.now(timezone.utc).isoformat(),
        agent="implementer",
        results=[
            QACommandResult(
                command_id="val-001",
                command="test",
                exit_code=0,
                duration_ms=100,
                summary=QACommandSummary(
                    coverage=QACoverageSummary(lines=85.0, branches=75.0)
                )
            )
        ]
    )

    current = QAResults(
        recorded_at=datetime.now(timezone.utc).isoformat(),
        agent="implementer",
        results=[
            QACommandResult(
                command_id="val-001",
                command="test",
                exit_code=0,
                duration_ms=100,
                summary=QACommandSummary(
                    coverage=QACoverageSummary(lines=80.0, branches=70.0)
                )
            )
        ]
    )

    drift = qa_manager.detect_drift(baseline, current)

    assert drift["has_drift"] is True
    assert len(drift["regressions"]) == 2  # lines and branches both dropped
    assert any(r["type"] == "coverage_lines_dropped" for r in drift["regressions"])
    assert any(r["type"] == "coverage_branches_dropped" for r in drift["regressions"])


def test_detect_drift_improvements(qa_manager):
    """Test drift detection captures improvements."""
    baseline = QAResults(
        recorded_at=datetime.now(timezone.utc).isoformat(),
        agent="implementer",
        results=[
            QACommandResult(
                command_id="val-001",
                command="lint",
                exit_code=0,
                duration_ms=100,
                summary=QACommandSummary(lint_errors=5, type_errors=3)
            )
        ]
    )

    current = QAResults(
        recorded_at=datetime.now(timezone.utc).isoformat(),
        agent="implementer",
        results=[
            QACommandResult(
                command_id="val-001",
                command="lint",
                exit_code=0,
                duration_ms=100,
                summary=QACommandSummary(lint_errors=2, type_errors=1)
            )
        ]
    )

    drift = qa_manager.detect_drift(baseline, current)

    assert drift["has_drift"] is False  # No regressions
    assert len(drift["improvements"]) == 2
    assert any(imp["type"] == "lint_errors_decreased" for imp in drift["improvements"])
    assert any(imp["type"] == "type_errors_decreased" for imp in drift["improvements"])


def test_detect_drift_new_command_not_regression(qa_manager):
    """Test that new commands in current results are not flagged as regressions."""
    baseline = QAResults(
        recorded_at=datetime.now(timezone.utc).isoformat(),
        agent="implementer",
        results=[
            QACommandResult(
                command_id="val-001",
                command="lint",
                exit_code=0,
                duration_ms=100
            )
        ]
    )

    current = QAResults(
        recorded_at=datetime.now(timezone.utc).isoformat(),
        agent="implementer",
        results=[
            QACommandResult(
                command_id="val-001",
                command="lint",
                exit_code=0,
                duration_ms=100
            ),
            QACommandResult(
                command_id="val-002",
                command="test",
                exit_code=0,
                duration_ms=200
            )
        ]
    )

    drift = qa_manager.detect_drift(baseline, current)

    assert drift["has_drift"] is False
    assert drift["regressions"] == []


# ============================================================================
# Test 21-25: Drift Report Formatting
# ============================================================================

def test_format_drift_report_no_drift(qa_manager):
    """Test drift report formatting with no drift."""
    drift = {
        "has_drift": False,
        "regressions": [],
        "improvements": []
    }

    report = qa_manager.format_drift_report(drift)

    assert report == "✓ No regressions detected"


def test_format_drift_report_with_regressions(qa_manager):
    """Test drift report formatting with regressions."""
    drift = {
        "has_drift": True,
        "regressions": [
            {
                "command_id": "val-001",
                "type": "lint_errors_increased",
                "baseline": 2,
                "current": 5,
                "delta": 3,
                "severity": "error"
            }
        ],
        "improvements": []
    }

    report = qa_manager.format_drift_report(drift)

    assert "1 regression(s) detected" in report
    assert "val-001" in report
    assert "lint_errors_increased" in report
    assert "Δ3" in report


def test_format_drift_report_with_improvements(qa_manager):
    """Test drift report formatting with improvements."""
    drift = {
        "has_drift": False,
        "regressions": [],
        "improvements": [
            {
                "command_id": "val-001",
                "type": "lint_errors_decreased",
                "baseline": 5,
                "current": 2,
                "delta": 3
            }
        ]
    }

    report = qa_manager.format_drift_report(drift)

    assert "No regressions detected" in report


def test_format_drift_report_mixed(qa_manager):
    """Test drift report formatting with both regressions and improvements."""
    drift = {
        "has_drift": True,
        "regressions": [
            {
                "command_id": "val-001",
                "type": "type_errors_increased",
                "baseline": 0,
                "current": 2,
                "delta": 2,
                "severity": "error"
            }
        ],
        "improvements": [
            {
                "command_id": "val-002",
                "type": "lint_errors_decreased",
                "baseline": 5,
                "current": 1,
                "delta": 4
            }
        ]
    }

    report = qa_manager.format_drift_report(drift)

    assert "1 regression(s) detected" in report
    assert "1 improvement(s)" in report
    assert "val-001" in report
    assert "val-002" in report


def test_format_drift_report_severity_symbols(qa_manager):
    """Test drift report uses correct severity symbols."""
    drift = {
        "has_drift": True,
        "regressions": [
            {
                "command_id": "val-001",
                "type": "coverage_lines_dropped",
                "baseline": 85.0,
                "current": 80.0,
                "delta": 5.0,
                "severity": "warning"
            },
            {
                "command_id": "val-002",
                "type": "exit_code_regression",
                "baseline": 0,
                "current": 1,
                "severity": "error"
            }
        ],
        "improvements": []
    }

    report = qa_manager.format_drift_report(drift)

    # Warning should use ⚠, error should use ✖
    assert "⚠" in report
    assert "✖" in report
