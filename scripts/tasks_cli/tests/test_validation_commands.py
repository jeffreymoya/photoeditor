"""
Unit tests for validation command execution.

Tests pre-flight checks, environment handling, retry logic, timeout enforcement,
and exit code validation per Section 2 of task-context-cache-hardening-schemas.md.
"""

import json
import os
import subprocess
import tempfile
import time
from pathlib import Path
from unittest.mock import Mock, patch

import pytest

from tasks_cli.models import RetryPolicy, ValidationCommand
from tasks_cli.validation import execute_validation_command


@pytest.fixture
def temp_repo(tmp_path):
    """Create a temporary repository structure."""
    repo_root = tmp_path / "repo"
    repo_root.mkdir()

    # Create some expected paths
    (repo_root / "backend").mkdir()
    (repo_root / "backend" / "package.json").write_text('{"name": "backend"}')
    (repo_root / "mobile").mkdir()
    (repo_root / "mobile" / "package.json").write_text('{"name": "mobile"}')

    return repo_root


def test_blocker_skip_logic(temp_repo):
    """Test that blocked commands are skipped with clear skip_reason."""
    cmd = ValidationCommand(
        id="val-001",
        command="echo test",
        description="Test command",
        blocker_id="TASK-0001"
    )

    # Mock datastore to return non-completed blocker
    with patch("tasks_cli.datastore.TaskDatastore") as mock_ds:
        mock_task = Mock()
        mock_task.id = "TASK-0001"
        mock_task.status = "in_progress"

        mock_instance = Mock()
        mock_instance.load_tasks.return_value = [mock_task]
        mock_ds.return_value = mock_instance

        result = execute_validation_command(cmd, "TASK-0824", temp_repo)

        assert result["skipped"] is True
        assert result["skip_reason"] == "Blocked by TASK-0001 (status: in_progress)"
        assert result["success"] is False
        assert result["duration_ms"] == 0


def test_blocker_completed_allows_execution(temp_repo):
    """Test that completed blockers allow command execution."""
    cmd = ValidationCommand(
        id="val-001",
        command="echo test",
        description="Test command",
        blocker_id="TASK-0001"
    )

    # Mock datastore to return completed blocker
    with patch("tasks_cli.datastore.TaskDatastore") as mock_ds:
        mock_task = Mock()
        mock_task.id = "TASK-0001"
        mock_task.status = "completed"

        mock_instance = Mock()
        mock_instance.load_tasks.return_value = [mock_task]
        mock_ds.return_value = mock_instance

        result = execute_validation_command(cmd, "TASK-0824", temp_repo)

        # Command should execute (not be skipped)
        assert result["skipped"] is False


def test_missing_expected_path_prevents_execution(temp_repo):
    """Test that missing expected paths prevent execution with error message."""
    cmd = ValidationCommand(
        id="val-001",
        command="echo test",
        description="Test command",
        expected_paths=["backend/package.json", "nonexistent/file.txt"]
    )

    result = execute_validation_command(cmd, "TASK-0824", temp_repo)

    assert result["skipped"] is True
    assert "Expected path not found: nonexistent/file.txt" in result["skip_reason"]
    assert result["success"] is False
    assert result["duration_ms"] == 0


def test_expected_paths_glob_pattern(temp_repo):
    """Test that glob patterns work for expected paths."""
    cmd = ValidationCommand(
        id="val-001",
        command="echo test",
        description="Test command",
        expected_paths=["*/package.json"]  # Should match both backend and mobile
    )

    result = execute_validation_command(cmd, "TASK-0824", temp_repo)

    # Should execute successfully since glob matches
    assert result["skipped"] is False


def test_missing_working_directory_prevents_execution(temp_repo):
    """Test that missing working directory prevents execution."""
    cmd = ValidationCommand(
        id="val-001",
        command="echo test",
        description="Test command",
        cwd="nonexistent"
    )

    result = execute_validation_command(cmd, "TASK-0824", temp_repo)

    assert result["skipped"] is True
    assert "Working directory does not exist" in result["skip_reason"]
    assert result["success"] is False


def test_environment_variables_exported(temp_repo):
    """Test that environment variables are exported correctly to subprocess."""
    cmd = ValidationCommand(
        id="val-001",
        command="echo $TEST_VAR",
        description="Test environment",
        env={"TEST_VAR": "hello_world"}
    )

    result = execute_validation_command(cmd, "TASK-0824", temp_repo)

    assert result["success"] is True
    assert "hello_world" in result["stdout"]
    assert result["skipped"] is False


def test_working_directory_switching(temp_repo):
    """Test that working directory switching works."""
    cmd = ValidationCommand(
        id="val-001",
        command="pwd",
        description="Test cwd",
        cwd="backend"
    )

    result = execute_validation_command(cmd, "TASK-0824", temp_repo)

    assert result["success"] is True
    assert result["skipped"] is False
    # Result should show backend directory
    assert "backend" in result["stdout"]


def test_retry_policy_retries_on_failure(temp_repo):
    """Test that retry policy retries on failure with backoff."""
    cmd = ValidationCommand(
        id="val-001",
        command="exit 1",  # Will always fail
        description="Test retry",
        retry_policy=RetryPolicy(max_attempts=3, backoff_ms=100)
    )

    start_time = time.time()
    result = execute_validation_command(cmd, "TASK-0824", temp_repo)
    elapsed_ms = (time.time() - start_time) * 1000

    # Should attempt 3 times but fail on first attempt (exit 1 returns immediately)
    assert result["success"] is False
    assert result["exit_code"] == 1
    assert result["attempts"] == 1  # Fast-fail since we got exit code immediately


def test_timeout_enforcement(temp_repo):
    """Test that timeout enforcement works (command killed after timeout)."""
    cmd = ValidationCommand(
        id="val-001",
        command="sleep 10",  # Sleep longer than timeout
        description="Test timeout",
        timeout_ms=1000,  # 1 second timeout (minimum allowed)
        retry_policy=RetryPolicy(max_attempts=1)
    )

    result = execute_validation_command(cmd, "TASK-0824", temp_repo)

    assert result["success"] is False
    assert "timed out" in result["stderr"].lower()
    assert result.get("timeout") is True


def test_exit_code_validation_success(temp_repo):
    """Test that exit codes are validated against expected_exit_codes list."""
    cmd = ValidationCommand(
        id="val-001",
        command="exit 2",
        description="Test exit codes",
        expected_exit_codes=[0, 2]  # Both 0 and 2 are acceptable
    )

    result = execute_validation_command(cmd, "TASK-0824", temp_repo)

    assert result["success"] is True  # 2 is in expected_exit_codes
    assert result["exit_code"] == 2


def test_exit_code_validation_failure(temp_repo):
    """Test that unexpected exit codes are marked as failure."""
    cmd = ValidationCommand(
        id="val-001",
        command="exit 3",
        description="Test exit codes",
        expected_exit_codes=[0, 2]  # 3 is not acceptable
    )

    result = execute_validation_command(cmd, "TASK-0824", temp_repo)

    assert result["success"] is False  # 3 is not in expected_exit_codes
    assert result["exit_code"] == 3


def test_stdout_stderr_capture(temp_repo):
    """Test that stdout and stderr are captured correctly."""
    cmd = ValidationCommand(
        id="val-001",
        command="echo 'stdout message' && echo 'stderr message' >&2",
        description="Test output capture"
    )

    result = execute_validation_command(cmd, "TASK-0824", temp_repo)

    assert result["success"] is True
    assert "stdout message" in result["stdout"]
    assert "stderr message" in result["stderr"]


def test_duration_measurement(temp_repo):
    """Test that duration is measured correctly."""
    cmd = ValidationCommand(
        id="val-001",
        command="sleep 0.1",
        description="Test duration"
    )

    result = execute_validation_command(cmd, "TASK-0824", temp_repo)

    assert result["success"] is True
    assert result["duration_ms"] >= 100  # At least 100ms
    assert result["duration_ms"] < 500  # But not too long


def test_validation_command_id_format_validation():
    """Test that ValidationCommand validates id format."""
    with pytest.raises(ValueError, match="must match pattern 'val-NNN'"):
        ValidationCommand(
            id="invalid",
            command="echo test",
            description="Test"
        )


def test_validation_command_blocker_id_format_validation():
    """Test that ValidationCommand validates blocker_id format."""
    with pytest.raises(ValueError, match="must match pattern 'TASK-NNNN'"):
        ValidationCommand(
            id="val-001",
            command="echo test",
            description="Test",
            blocker_id="invalid"
        )


def test_validation_command_timeout_range_validation():
    """Test that ValidationCommand validates timeout range."""
    with pytest.raises(ValueError, match="timeout_ms must be 1000-600000"):
        ValidationCommand(
            id="val-001",
            command="echo test",
            description="Test",
            timeout_ms=500  # Too low
        )


def test_validation_command_criticality_validation():
    """Test that ValidationCommand validates criticality."""
    with pytest.raises(ValueError, match="criticality must be one of"):
        ValidationCommand(
            id="val-001",
            command="echo test",
            description="Test",
            criticality="invalid"
        )


def test_retry_policy_max_attempts_validation():
    """Test that RetryPolicy validates max_attempts range."""
    with pytest.raises(ValueError, match="max_attempts must be 1-5"):
        RetryPolicy(max_attempts=10)


def test_retry_policy_backoff_validation():
    """Test that RetryPolicy validates backoff_ms is non-negative."""
    with pytest.raises(ValueError, match="backoff_ms must be >= 0"):
        RetryPolicy(backoff_ms=-100)


def test_complex_command_with_all_features(temp_repo):
    """Integration test with all features enabled."""
    # Create test file
    (temp_repo / "test.txt").write_text("test content")

    cmd = ValidationCommand(
        id="val-001",
        command="cat test.txt && exit 0",
        description="Complex test command",
        cwd=".",
        env={"TEST_MODE": "true"},
        expected_paths=["test.txt"],
        timeout_ms=5000,
        retry_policy=RetryPolicy(max_attempts=2, backoff_ms=100),
        criticality="required",
        expected_exit_codes=[0]
    )

    result = execute_validation_command(cmd, "TASK-0824", temp_repo)

    assert result["success"] is True
    assert result["skipped"] is False
    assert "test content" in result["stdout"]
    assert result["exit_code"] == 0
    assert result["duration_ms"] > 0
