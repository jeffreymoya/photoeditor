"""
End-to-end integration tests for CLI commands via subprocess.

These tests execute actual CLI commands to catch integration issues that
unit tests miss (e.g., frozen dataclass mutation, schema mismatches).
"""

import json
import subprocess
from pathlib import Path
import pytest


@pytest.fixture
def temp_workspace(tmp_path):
    """Create a temporary workspace with a sample task file."""
    # Create minimal directory structure
    tasks_dir = tmp_path / "tasks" / "backend"
    tasks_dir.mkdir(parents=True)

    agent_output_dir = tmp_path / ".agent-output"
    agent_output_dir.mkdir()

    # Create a minimal task file with legacy 'cmd' format
    task_file = tasks_dir / "TASK-9999-e2e-test.task.yaml"
    task_content = """id: TASK-9999
title: End-to-end integration test task
priority: P2
area: backend
description: Test task for e2e integration testing
status: in_progress

scope:
  in:
    - Test scope item 1
  out:
    - Out of scope item

acceptance_criteria:
  - Criterion 1
  - Criterion 2

plan:
  - step: Step 1
    outputs:
      - Output 1

deliverables:
  - Deliverable 1

validation:
  pipeline:
    - cmd: echo "test command 1"
      description: Legacy format command
    - command: echo "test command 2"
      description: New format command

context:
  repo_paths:
    - backend/src/test.ts
"""
    task_file.write_text(task_content)

    # Initialize git repo (required for context init)
    subprocess.run(["git", "init"], cwd=tmp_path, check=True, capture_output=True)
    subprocess.run(
        ["git", "config", "user.email", "test@example.com"],
        cwd=tmp_path,
        check=True,
        capture_output=True
    )
    subprocess.run(
        ["git", "config", "user.name", "Test User"],
        cwd=tmp_path,
        check=True,
        capture_output=True
    )
    subprocess.run(["git", "add", "."], cwd=tmp_path, check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", "Initial commit"],
        cwd=tmp_path,
        check=True,
        capture_output=True
    )

    yield tmp_path

    # Cleanup is automatic via tmp_path fixture


def test_init_context_with_standards_citations(temp_workspace):
    """
    Test that --init-context properly builds standards citations.

    Verifies fix for Issue 1: empty standards_citations causing immediate crash.
    """
    result = subprocess.run(
        [
            "python", "-m", "scripts.tasks_cli",
            "--init-context", "TASK-9999",
            "--format", "json"
        ],
        cwd=temp_workspace,
        capture_output=True,
        text=True
    )

    # Should succeed
    assert result.returncode == 0, f"stderr: {result.stderr}"

    # Parse JSON output
    output = json.loads(result.stdout)
    assert output["success"] is True
    assert output["data"]["task_id"] == "TASK-9999"

    # Verify context was created with standards citations
    context_file = temp_workspace / ".agent-output" / "TASK-9999" / "context.json"
    assert context_file.exists()

    with open(context_file) as f:
        context = json.load(f)

    # Verify standards_citations is not empty
    standards_citations = context.get("standards_citations", [])
    assert len(standards_citations) > 0, "standards_citations should not be empty"

    # Verify at least global standards are present
    files = [c["file"] for c in standards_citations]
    assert "standards/global.md" in files
    assert "standards/AGENTS.md" in files
    assert "standards/backend-tier.md" in files  # area-specific


def test_init_context_supports_legacy_cmd_key(temp_workspace):
    """
    Test that validation commands support both 'command' and legacy 'cmd' keys.

    Verifies fix for Issue 2: legacy cmd key not supported.
    """
    result = subprocess.run(
        [
            "python", "-m", "scripts.tasks_cli",
            "--init-context", "TASK-9999",
            "--format", "json"
        ],
        cwd=temp_workspace,
        capture_output=True,
        text=True
    )

    assert result.returncode == 0, f"stderr: {result.stderr}"

    # Verify context has validation commands from both formats
    context_file = temp_workspace / ".agent-output" / "TASK-9999" / "context.json"
    with open(context_file) as f:
        context = json.load(f)

    validation_baseline = context.get("validation_baseline", {})
    commands = validation_baseline.get("commands", [])

    # Both commands should be extracted (legacy 'cmd' and new 'command')
    assert len(commands) == 2, "Should extract both legacy and new format commands"
    assert 'echo "test command 1"' in commands
    assert 'echo "test command 2"' in commands


def test_record_qa_no_frozen_dataclass_error(temp_workspace):
    """
    Test that --record-qa does not crash with FrozenInstanceError.

    Verifies fix for Issue 3: frozen dataclass mutation.
    """
    # First init context
    subprocess.run(
        [
            "python", "-m", "scripts.tasks_cli",
            "--init-context", "TASK-9999"
        ],
        cwd=temp_workspace,
        check=True,
        capture_output=True
    )

    # Create a dummy log file
    log_file = temp_workspace / "test.log"
    log_file.write_text("Test log output\n")

    # Record QA result
    result = subprocess.run(
        [
            "python", "-m", "scripts.tasks_cli",
            "--record-qa", "TASK-9999",
            "--cmd", "echo test",
            "--exit-code", "0",
            "--log-path", str(log_file),
            "--format", "json"
        ],
        cwd=temp_workspace,
        capture_output=True,
        text=True
    )

    # Should succeed without FrozenInstanceError
    assert result.returncode == 0, f"stderr: {result.stderr}"
    assert "FrozenInstanceError" not in result.stderr

    # Verify QA result was stored
    output = json.loads(result.stdout)
    assert output["success"] is True


def test_record_qa_uses_qa_results_schema(temp_workspace):
    """
    Test that --record-qa stores data in proper QAResults format.

    Verifies fix for Issue 4: schema mismatch.
    """
    # Init context
    subprocess.run(
        [
            "python", "-m", "scripts.tasks_cli",
            "--init-context", "TASK-9999"
        ],
        cwd=temp_workspace,
        check=True,
        capture_output=True
    )

    # Record QA
    log_file = temp_workspace / "test.log"
    log_file.write_text("Test log\n")

    subprocess.run(
        [
            "python", "-m", "scripts.tasks_cli",
            "--record-qa", "TASK-9999",
            "--cmd", "echo test",
            "--exit-code", "0",
            "--log-path", str(log_file)
        ],
        cwd=temp_workspace,
        check=True,
        capture_output=True
    )

    # Verify stored format matches QAResults schema
    context_file = temp_workspace / ".agent-output" / "TASK-9999" / "context.json"
    with open(context_file) as f:
        context = json.load(f)

    validation_baseline = context.get("validation_baseline", {})
    initial_results = validation_baseline.get("initial_results")

    # Should be QAResults dict, not simple list
    assert isinstance(initial_results, dict), "initial_results should be QAResults dict"
    assert "recorded_at" in initial_results
    assert "agent" in initial_results
    assert "results" in initial_results
    assert isinstance(initial_results["results"], list)

    # Verify result structure
    results = initial_results["results"]
    assert len(results) == 1
    result = results[0]
    assert "command_id" in result
    assert "command" in result
    assert "exit_code" in result
    assert "duration_ms" in result
    assert result["command"] == "echo test"
    assert result["exit_code"] == 0


def test_collect_metrics_handles_qa_results_format(temp_workspace):
    """
    Test that --collect-metrics can parse the new QAResults format.

    Verifies metrics.py correctly handles both old and new formats.
    """
    # Init context
    subprocess.run(
        [
            "python", "-m", "scripts.tasks_cli",
            "--init-context", "TASK-9999"
        ],
        cwd=temp_workspace,
        check=True,
        capture_output=True
    )

    # Record QA
    log_file = temp_workspace / "test.log"
    log_file.write_text("Test log\n")

    subprocess.run(
        [
            "python", "-m", "scripts.tasks_cli",
            "--record-qa", "TASK-9999",
            "--cmd", "echo test",
            "--exit-code", "0",
            "--log-path", str(log_file)
        ],
        cwd=temp_workspace,
        check=True,
        capture_output=True
    )

    # Collect metrics
    result = subprocess.run(
        [
            "python", "-m", "scripts.tasks_cli",
            "--collect-metrics", "TASK-9999",
            "--format", "json"
        ],
        cwd=temp_workspace,
        capture_output=True,
        text=True
    )

    # Should succeed without 'str' object has no attribute 'get' error
    assert result.returncode == 0, f"stderr: {result.stderr}"

    # Parse metrics output
    output = json.loads(result.stdout)
    assert output["success"] is True

    metrics = output["data"]
    assert "qa_coverage" in metrics
    assert metrics["qa_coverage"]["coverage_pct"] >= 0


def test_full_lifecycle_workflow(temp_workspace):
    """
    Test complete workflow: init → record-qa → collect-metrics.

    End-to-end validation of all fixes working together.
    """
    # 1. Initialize context
    result = subprocess.run(
        [
            "python", "-m", "scripts.tasks_cli",
            "--init-context", "TASK-9999",
            "--format", "json"
        ],
        cwd=temp_workspace,
        capture_output=True,
        text=True
    )
    assert result.returncode == 0, f"Init failed: {result.stderr}"

    # 2. Record multiple QA commands
    for i, cmd in enumerate(["pnpm typecheck", "pnpm lint", "pnpm test"]):
        log_file = temp_workspace / f"qa-{i}.log"
        log_file.write_text(f"Output from {cmd}\n")

        result = subprocess.run(
            [
                "python", "-m", "scripts.tasks_cli",
                "--record-qa", "TASK-9999",
                "--cmd", cmd,
                "--exit-code", "0",
                "--log-path", str(log_file)
            ],
            cwd=temp_workspace,
            capture_output=True,
            text=True
        )
        assert result.returncode == 0, f"QA record failed for {cmd}: {result.stderr}"

    # 3. Collect metrics
    result = subprocess.run(
        [
            "python", "-m", "scripts.tasks_cli",
            "--collect-metrics", "TASK-9999",
            "--format", "json"
        ],
        cwd=temp_workspace,
        capture_output=True,
        text=True
    )
    assert result.returncode == 0, f"Metrics collection failed: {result.stderr}"

    # Verify metrics
    output = json.loads(result.stdout)
    metrics = output["data"]

    # Should have 100% QA coverage (all 3 commands have logs)
    assert metrics["qa_coverage"]["qa_commands"] == 3
    assert metrics["qa_coverage"]["qa_with_logs"] == 3
    assert metrics["qa_coverage"]["coverage_pct"] == 100.0


def test_json_output_always_parseable(temp_workspace):
    """
    Test that all --format json outputs are valid JSON.

    Verifies warnings don't get mixed into JSON output.
    """
    commands_to_test = [
        ["--init-context", "TASK-9999"],
        ["--list", "todo"],
    ]

    for cmd_args in commands_to_test:
        result = subprocess.run(
            ["python", "-m", "scripts.tasks_cli", "--format", "json"] + cmd_args,
            cwd=temp_workspace,
            capture_output=True,
            text=True
        )

        # Should be valid JSON (no warnings interleaved)
        try:
            json.loads(result.stdout)
        except json.JSONDecodeError as e:
            pytest.fail(
                f"Command {' '.join(cmd_args)} produced invalid JSON:\n"
                f"Error: {e}\n"
                f"stdout: {result.stdout}\n"
                f"stderr: {result.stderr}"
            )


def test_multiple_qa_records_append_correctly(temp_workspace):
    """
    Test that recording multiple QA results appends to results array.

    Verifies QAResults.results array grows correctly.
    """
    # Init context
    subprocess.run(
        [
            "python", "-m", "scripts.tasks_cli",
            "--init-context", "TASK-9999"
        ],
        cwd=temp_workspace,
        check=True,
        capture_output=True
    )

    # Record 3 different QA commands
    commands = ["pnpm typecheck", "pnpm lint", "pnpm test"]
    for cmd in commands:
        log_file = temp_workspace / f"{cmd.replace(' ', '-')}.log"
        log_file.write_text(f"Output from {cmd}\n")

        subprocess.run(
            [
                "python", "-m", "scripts.tasks_cli",
                "--record-qa", "TASK-9999",
                "--cmd", cmd,
                "--exit-code", "0",
                "--log-path", str(log_file)
            ],
            cwd=temp_workspace,
            check=True,
            capture_output=True
        )

    # Verify all 3 are in results array
    context_file = temp_workspace / ".agent-output" / "TASK-9999" / "context.json"
    with open(context_file) as f:
        context = json.load(f)

    initial_results = context["validation_baseline"]["initial_results"]
    results = initial_results["results"]

    assert len(results) == 3, "Should have 3 QA results"

    # Verify each command is present
    result_commands = [r["command"] for r in results]
    for cmd in commands:
        assert cmd in result_commands


def test_snapshot_parity():
    """
    Test that CLI output structure matches baseline snapshots.

    Verifies that list, pick, and validate commands maintain expected
    JSON output structure for backward compatibility.
    """
    # Load baseline snapshots
    fixtures_dir = Path(__file__).parent / "fixtures"
    snapshots_file = fixtures_dir / "cli_outputs.json"

    with open(snapshots_file, "r") as f:
        snapshots = json.load(f)

    # Test --list command
    result = subprocess.run(
        ["python", "-m", "scripts.tasks_cli", "--list", "--format", "json"],
        cwd=Path(__file__).parent.parent.parent.parent,
        capture_output=True,
        text=True
    )
    assert result.returncode == 0, f"--list failed: {result.stderr}"

    list_output = json.loads(result.stdout)

    # Verify list output structure (ignore dynamic fields)
    assert "count" in list_output
    assert "filter" in list_output
    assert "tasks" in list_output
    assert isinstance(list_output["tasks"], list)

    # Verify task structure matches snapshot
    if list_output["tasks"]:
        task = list_output["tasks"][0]
        snapshot_task = snapshots["list"]["tasks"][0]

        # Check keys match (ignore dynamic values like hash, mtime, path)
        static_keys = {
            "id", "title", "area", "priority", "status", "unblocker",
            "blocked_by", "depends_on", "order", "effective_priority", "priority_reason"
        }
        for key in static_keys:
            assert key in task, f"Missing key '{key}' in task output"

    # Test --pick command
    result = subprocess.run(
        ["python", "-m", "scripts.tasks_cli", "--pick", "--format", "json"],
        cwd=Path(__file__).parent.parent.parent.parent,
        capture_output=True,
        text=True
    )
    assert result.returncode == 0, f"--pick failed: {result.stderr}"

    pick_output = json.loads(result.stdout)

    # Verify pick output structure
    assert "status" in pick_output
    assert "reason" in pick_output
    assert "draft_alerts" in pick_output
    assert pick_output["status"] == "success"

    # Verify task structure if present
    if "task" in pick_output:
        task = pick_output["task"]
        snapshot_task = snapshots["pick"]["task"]

        static_keys = {
            "id", "title", "area", "priority", "status", "unblocker",
            "blocked_by", "depends_on", "order", "effective_priority"
        }
        for key in static_keys:
            assert key in task, f"Missing key '{key}' in pick task output"

    # Test --validate command (may fail with validation errors)
    result = subprocess.run(
        ["python", "-m", "scripts.tasks_cli", "--validate", "--format", "json"],
        cwd=Path(__file__).parent.parent.parent.parent,
        capture_output=True,
        text=True
    )

    # validate command can exit with non-zero if there are errors
    validate_output = json.loads(result.stdout)

    # Verify validate output structure
    assert "valid" in validate_output
    assert isinstance(validate_output["valid"], bool)

    if not validate_output["valid"]:
        assert "errors" in validate_output
        assert "error_count" in validate_output
        assert isinstance(validate_output["errors"], list)
        assert validate_output["error_count"] == len(validate_output["errors"])
