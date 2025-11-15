"""
CLI Integration Tests for Task Context Store.

Tests all CLI commands exposed by tasks.py for context store operations,
including init, get, update, snapshot, verify, diff retrieval, and purge.

Session 2 of test implementation plan.
"""

import json
import os
import subprocess
from pathlib import Path
from typing import Tuple

import pytest


# ============================================================================
# Helper Functions
# ============================================================================

def run_cli_command(
    *args: str,
    cwd: Path,
    format: str = "text",
    expect_success: bool = True
) -> Tuple[int, str, str]:
    """
    Run tasks.py CLI command and capture output.

    Args:
        *args: Command arguments (e.g., "--init-context", "TASK-9001")
        cwd: Working directory (test repo root)
        format: Output format ("text" or "json")
        expect_success: Whether to expect success (for better error messages)

    Returns:
        Tuple of (exit_code, stdout, stderr)
    """
    # Find the actual repo root (where this test file lives)
    test_file = Path(__file__)
    actual_repo_root = test_file.parent.parent.parent.parent
    tasks_py = actual_repo_root / "scripts" / "tasks.py"

    cmd = ["python", str(tasks_py)]
    cmd.extend(args)

    if format == "json" and "--format" not in args:
        cmd.extend(["--format", "json"])

    result = subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True,
    )

    # Help debug failures
    if expect_success and result.returncode != 0:
        print(f"Command failed: {' '.join(cmd)}")
        print(f"Exit code: {result.returncode}")
        print(f"Stdout: {result.stdout}")
        print(f"Stderr: {result.stderr}")

    return result.returncode, result.stdout, result.stderr


def parse_json_output(stdout: str) -> dict:
    """
    Parse JSON output from CLI command.

    Args:
        stdout: Command stdout containing JSON

    Returns:
        Parsed JSON dictionary

    Raises:
        json.JSONDecodeError: If output is not valid JSON
    """
    return json.loads(stdout)


# ============================================================================
# Test Suite 1: --init-context Command
# ============================================================================

def test_cli_init_context_success(mock_repo_clean):
    """Test --init-context creates context successfully."""
    tmp_path, repo = mock_repo_clean

    # Run init-context command
    exit_code, stdout, stderr = run_cli_command(
        "--init-context", "TASK-9001",
        cwd=tmp_path,
        format="json"
    )

    assert exit_code == 0, f"Command failed with stderr: {stderr}"

    # Parse JSON output
    output = parse_json_output(stdout)
    assert output["success"] is True
    assert output["task_id"] == "TASK-9001"
    assert "base_commit" in output
    assert "context_version" in output

    # Verify context directory created
    context_dir = tmp_path / ".agent-output/TASK-9001"
    assert context_dir.exists()
    assert (context_dir / "context.json").exists()


def test_cli_init_context_duplicate_error(mock_repo_clean):
    """Test --init-context fails when context already exists."""
    tmp_path, repo = mock_repo_clean

    # Initialize context first time (should succeed)
    exit_code1, _, _ = run_cli_command(
        "--init-context", "TASK-9001",
        cwd=tmp_path
    )
    assert exit_code1 == 0

    # Try to initialize again (should fail)
    exit_code2, stdout2, stderr2 = run_cli_command(
        "--init-context", "TASK-9001",
        cwd=tmp_path,
        format="json",
        expect_success=False
    )

    assert exit_code2 == 1
    output = parse_json_output(stdout2)
    assert output["success"] is False
    # Error message should indicate context already exists
    error_lower = output["error"].lower()
    assert "already" in error_lower or "exists" in error_lower


def test_cli_init_context_dirty_worktree_warning(mock_repo_dirty):
    """Test --init-context warns about dirty working tree."""
    tmp_path, repo = mock_repo_dirty

    # Run init-context on dirty worktree
    exit_code, stdout, stderr = run_cli_command(
        "--init-context", "TASK-9001",
        cwd=tmp_path
    )

    # Should succeed but warn
    assert exit_code == 0
    assert "warning" in stderr.lower() or "uncommitted" in stderr.lower()


# ============================================================================
# Test Suite 2: --get-context Command
# ============================================================================

def test_cli_get_context_json_output(initialized_context):
    """Test --get-context returns valid JSON structure."""
    tmp_path, repo = initialized_context

    exit_code, stdout, stderr = run_cli_command(
        "--get-context", "TASK-9001",
        cwd=tmp_path,
        format="json"
    )

    assert exit_code == 0

    # Parse and validate JSON structure
    output = parse_json_output(stdout)
    assert output["success"] is True
    assert "context" in output
    assert "age_hours" in output

    # Validate context structure
    context = output["context"]
    assert context["task_id"] == "TASK-9001"
    assert "version" in context
    assert "created_at" in context
    assert "task_snapshot" in context
    assert "implementer" in context
    assert "reviewer" in context
    assert "validator" in context


def test_cli_get_context_not_found(mock_repo_clean):
    """Test --get-context fails when context doesn't exist."""
    tmp_path, repo = mock_repo_clean

    exit_code, stdout, stderr = run_cli_command(
        "--get-context", "TASK-9001",
        cwd=tmp_path,
        format="json",
        expect_success=False
    )

    assert exit_code == 1
    output = parse_json_output(stdout)
    assert output["success"] is False
    # Error message should indicate context not found
    error_lower = output["error"].lower()
    assert "not found" in error_lower or "no context" in error_lower


# ============================================================================
# Test Suite 3: --update-agent Command
# ============================================================================

def test_cli_update_agent_status(initialized_context):
    """Test --update-agent updates coordination state."""
    tmp_path, repo = initialized_context

    exit_code, stdout, stderr = run_cli_command(
        "--update-agent", "TASK-9001",
        "--agent", "implementer",
        "--status", "in_progress",
        cwd=tmp_path,
        format="json"
    )

    assert exit_code == 0

    output = parse_json_output(stdout)
    assert output["success"] is True
    assert output["task_id"] == "TASK-9001"
    assert output["agent_role"] == "implementer"
    assert "in_progress" in output["updates"]["status"]

    # Verify state persisted
    exit_code2, stdout2, _ = run_cli_command(
        "--get-context", "TASK-9001",
        cwd=tmp_path,
        format="json"
    )
    context = parse_json_output(stdout2)["context"]
    assert context["implementer"]["status"] == "in_progress"


# ============================================================================
# Test Suite 4: --snapshot-worktree Command
# ============================================================================

def test_cli_snapshot_worktree_creates_diff(initialized_context):
    """Test --snapshot-worktree creates diff artifacts."""
    tmp_path, repo = initialized_context

    # Make some changes
    service_file = tmp_path / "backend/services/upload.ts"
    service_file.write_text("export const upload = () => { return 'uploaded'; };")

    # Snapshot worktree
    exit_code, stdout, stderr = run_cli_command(
        "--snapshot-worktree", "TASK-9001",
        "--agent", "implementer",
        cwd=tmp_path,
        format="json"
    )

    assert exit_code == 0

    output = parse_json_output(stdout)
    assert output["success"] is True
    assert output["agent_role"] == "implementer"

    snapshot = output["snapshot"]
    assert "base_commit" in snapshot
    assert "files_changed" in snapshot
    assert len(snapshot["files_changed"]) > 0
    assert "diff_from_base" in snapshot

    # Verify diff file exists
    diff_path = tmp_path / snapshot["diff_from_base"]
    # May be compressed (.gz), so check both
    assert diff_path.exists() or Path(str(diff_path) + ".gz").exists()


def test_cli_snapshot_worktree_clean_tree(initialized_context):
    """Test --snapshot-worktree handles clean working tree."""
    tmp_path, repo = initialized_context

    # Don't make any changes - clean tree

    exit_code, stdout, stderr = run_cli_command(
        "--snapshot-worktree", "TASK-9001",
        "--agent", "implementer",
        cwd=tmp_path,
        format="json"
    )

    assert exit_code == 0

    output = parse_json_output(stdout)
    assert output["success"] is True

    snapshot = output["snapshot"]
    # Clean tree should have empty or minimal changes
    assert isinstance(snapshot["files_changed"], list)


# ============================================================================
# Test Suite 5: --verify-worktree Command
# ============================================================================

def test_cli_verify_worktree_no_drift(initialized_context_with_snapshot):
    """Test --verify-worktree succeeds when no drift detected."""
    tmp_path, repo = initialized_context_with_snapshot

    exit_code, stdout, stderr = run_cli_command(
        "--verify-worktree", "TASK-9001",
        "--expected-agent", "implementer",
        cwd=tmp_path,
        format="json"
    )

    assert exit_code == 0

    output = parse_json_output(stdout)
    assert output["success"] is True
    assert output["drift_detected"] is False


def test_cli_verify_worktree_detects_drift(initialized_context_with_snapshot):
    """Test --verify-worktree detects drift when files changed manually."""
    tmp_path, repo = initialized_context_with_snapshot

    # Make manual change (outside of context store)
    drift_file = tmp_path / "backend/services/drift.ts"
    drift_file.write_text("export const drift = true;")

    exit_code, stdout, stderr = run_cli_command(
        "--verify-worktree", "TASK-9001",
        "--expected-agent", "implementer",
        cwd=tmp_path,
        format="json",
        expect_success=False
    )

    assert exit_code == 1

    output = parse_json_output(stdout)
    assert output["success"] is False
    assert output["drift_detected"] is True


# ============================================================================
# Test Suite 6: --get-diff Command
# ============================================================================

def test_cli_get_diff_cumulative(initialized_context_with_snapshot):
    """Test --get-diff retrieves cumulative diff from base."""
    tmp_path, repo = initialized_context_with_snapshot

    exit_code, stdout, stderr = run_cli_command(
        "--get-diff", "TASK-9001",
        "--agent", "implementer",
        "--diff-type", "from_base",
        cwd=tmp_path,
        format="json"
    )

    assert exit_code == 0

    output = parse_json_output(stdout)
    assert output["success"] is True
    assert output["diff_type"] == "from_base"
    assert "diff_content" in output
    assert "diff_path" in output


def test_cli_get_diff_incremental(initialized_context_with_implementer_and_reviewer):
    """Test --get-diff retrieves incremental diff for reviewer."""
    tmp_path, repo = initialized_context_with_implementer_and_reviewer

    exit_code, stdout, stderr = run_cli_command(
        "--get-diff", "TASK-9001",
        "--agent", "reviewer",
        "--diff-type", "incremental",
        cwd=tmp_path,
        format="json"
    )

    assert exit_code == 0

    output = parse_json_output(stdout)
    assert output["success"] is True
    assert output["diff_type"] == "incremental"
    assert "diff_content" in output


# ============================================================================
# Test Suite 7: --record-qa Command
# ============================================================================

def test_cli_record_qa_result(initialized_context_with_snapshot, tmp_path):
    """Test --record-qa updates QA results."""
    repo_path, repo = initialized_context_with_snapshot

    # Create a QA log file
    qa_log_path = tmp_path / "qa_output.txt"
    qa_log_content = """
Tests: 10 passed, 10 total
All files   |   85.5  |   75.2  |   90.0  |   88.0  |
✓ All tests passed
"""
    qa_log_path.write_text(qa_log_content)

    exit_code, stdout, stderr = run_cli_command(
        "--record-qa", "TASK-9001",
        "--agent", "validator",
        "--from", str(qa_log_path),
        cwd=repo_path,
        format="json"
    )

    assert exit_code == 0

    output = parse_json_output(stdout)
    assert output["success"] is True
    assert output["agent_role"] == "validator"

    qa_results = output["qa_results"]
    assert qa_results["passed"] is True
    assert qa_results["tests_run"] == 10
    assert qa_results["tests_passed"] == 10


# ============================================================================
# Test Suite 8: --purge-context Command
# ============================================================================

def test_cli_purge_context_success(initialized_context):
    """Test --purge-context removes context directory."""
    tmp_path, repo = initialized_context

    # Verify context exists
    context_dir = tmp_path / "tasks/.context/TASK-9001"
    assert context_dir.exists()

    # Purge context
    exit_code, stdout, stderr = run_cli_command(
        "--purge-context", "TASK-9001",
        cwd=tmp_path,
        format="json"
    )

    assert exit_code == 0

    output = parse_json_output(stdout)
    assert output["success"] is True
    assert output["task_id"] == "TASK-9001"

    # Verify context removed
    assert not context_dir.exists()


def test_cli_purge_context_idempotent(initialized_context):
    """Test --purge-context is idempotent (can run twice)."""
    tmp_path, repo = initialized_context

    # Purge first time
    exit_code1, _, _ = run_cli_command(
        "--purge-context", "TASK-9001",
        cwd=tmp_path
    )
    assert exit_code1 == 0

    # Purge second time (should still succeed)
    exit_code2, stdout2, stderr2 = run_cli_command(
        "--purge-context", "TASK-9001",
        cwd=tmp_path,
        format="json"
    )

    assert exit_code2 == 0
    output = parse_json_output(stdout2)
    assert output["success"] is True


# ============================================================================
# Test Suite 9: Error Handling
# ============================================================================

def test_cli_invalid_task_id_format(mock_repo_clean):
    """Test CLI rejects invalid task ID format."""
    tmp_path, repo = mock_repo_clean

    exit_code, stdout, stderr = run_cli_command(
        "--init-context", "INVALID-ID",
        cwd=tmp_path,
        format="json",
        expect_success=False
    )

    # Should fail - task not found
    assert exit_code == 1


def test_cli_missing_required_args(initialized_context):
    """Test CLI fails when required arguments missing."""
    tmp_path, repo = initialized_context

    # --update-agent requires --agent
    result = subprocess.run(
        ["python", "scripts/tasks.py", "--update-agent", "TASK-9001", "--status", "done"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
    )

    # Should succeed because --agent is validated at runtime, not argparse
    # But the command will fail due to missing --agent
    # Actually, looking at the code, --status requires --agent to be set
    # Let's test --snapshot-worktree which requires --agent

    result2 = subprocess.run(
        ["python", "scripts/tasks.py", "--snapshot-worktree", "TASK-9001"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
    )

    # Should fail because --agent is required
    assert result2.returncode != 0
    assert "agent" in result2.stderr.lower() or "required" in result2.stderr.lower()


def test_cli_json_output_format(initialized_context):
    """Test JSON output has correct structure for all commands."""
    tmp_path, repo = initialized_context

    # Test that JSON output always includes 'generated_at'
    exit_code, stdout, stderr = run_cli_command(
        "--get-context", "TASK-9001",
        cwd=tmp_path,
        format="json"
    )

    assert exit_code == 0
    output = parse_json_output(stdout)

    # All JSON outputs should include generated_at timestamp
    assert "generated_at" in output
    # Should be ISO-8601 format
    assert "T" in output["generated_at"]
    assert "Z" in output["generated_at"] or "+" in output["generated_at"]


# ============================================================================
# Test Suite 10: Parametric Tests
# ============================================================================

@pytest.mark.parametrize("command,task_arg", [
    ("--get-context", "TASK-9001"),
    ("--purge-context", "TASK-9001"),
])
def test_cli_json_format_for_all_commands(initialized_context, command, task_arg):
    """Test all context commands support --format json."""
    tmp_path, repo = initialized_context

    exit_code, stdout, stderr = run_cli_command(
        command, task_arg,
        cwd=tmp_path,
        format="json"
    )

    # Should be valid JSON
    output = parse_json_output(stdout)
    assert isinstance(output, dict)
    assert "generated_at" in output


def test_cli_help_text_validation():
    """Test --help displays usage information."""
    result = subprocess.run(
        ["python", "scripts/tasks.py", "--help"],
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0
    assert "init-context" in result.stdout
    assert "get-context" in result.stdout
    assert "snapshot-worktree" in result.stdout
    assert "verify-worktree" in result.stdout
    assert "purge-context" in result.stdout


# ============================================================================
# Additional Coverage: Edge Cases
# ============================================================================

def test_cli_init_context_auto_detects_base_commit(mock_repo_clean):
    """Test --init-context auto-detects git HEAD when --base-commit not provided."""
    tmp_path, repo = mock_repo_clean

    # Don't provide --base-commit, should auto-detect
    exit_code, stdout, stderr = run_cli_command(
        "--init-context", "TASK-9001",
        cwd=tmp_path,
        format="json"
    )

    assert exit_code == 0
    output = parse_json_output(stdout)
    assert output["success"] is True
    assert len(output["base_commit"]) == 40  # Full SHA


def test_cli_context_commands_fail_outside_git_repo(tmp_path):
    """Test context commands fail gracefully outside git repository."""
    # Create a non-git directory with tasks structure
    non_git_dir = tmp_path / "non_git_repo"
    non_git_dir.mkdir()
    (non_git_dir / "tasks").mkdir()

    # Create a minimal task file
    task_file = non_git_dir / "tasks/TASK-TEST.task.yaml"
    task_file.write_text("""
task_id: TASK-TEST
title: Test task
status: todo
priority: P2
area: backend
description: Test
scope:
  in: []
  out: []
plan: []
acceptance_criteria: []
validation:
  commands: []
deliverables: []
""")

    # Try to initialize context (should fail - no git repo)
    result = subprocess.run(
        ["python", "scripts/tasks.py", "--init-context", "TASK-TEST"],
        cwd=non_git_dir,
        capture_output=True,
        text=True,
    )

    # Should fail because we can't find repo root or git HEAD
    assert result.returncode != 0
