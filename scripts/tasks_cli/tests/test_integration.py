"""Integration tests for complete context lifecycle."""

import pytest
import json
import yaml
import subprocess
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
from scripts.tasks_cli.commands import (
    cmd_init_context,
    cmd_record_qa,
    cmd_verify_worktree,
    cmd_collect_metrics,
    EXIT_SUCCESS,
    EXIT_VALIDATION_ERROR,
    EXIT_BLOCKER_ERROR,
    EXIT_DRIFT_ERROR,
)


@pytest.fixture
def temp_repo(tmp_path):
    """Create temporary repo with git."""
    repo = tmp_path / "repo"
    repo.mkdir()

    subprocess.run(["git", "init"], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.email", "test@test.com"], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=repo, check=True, capture_output=True)

    # Create initial commit
    (repo / "README.md").write_text("# Test")
    subprocess.run(["git", "add", "."], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "commit", "-m", "init"], cwd=repo, check=True, capture_output=True)

    return repo


@pytest.fixture
def sample_task_file(temp_repo):
    """Create sample task file."""
    task_dir = temp_repo / "tasks" / "backend"
    task_dir.mkdir(parents=True, exist_ok=True)

    task_data = {
        "id": "TASK-TEST-001",
        "title": "Test task",
        "tier": "backend",
        "acceptance_criteria": [
            "Criterion 1",
            "Criterion 2"
        ],
        "plan": [
            {"step": "Step 1", "outputs": ["file1.py"]}
        ],
        "scope": {
            "in": ["Item 1"],
            "out": ["Item 2"]
        },
        "deliverables": ["Deliverable 1"]
    }

    task_path = task_dir / "TASK-TEST-001.task.yaml"
    with open(task_path, 'w') as f:
        yaml.dump(task_data, f)

    return task_path


def test_init_context_full_integration(temp_repo, sample_task_file):
    """Test complete init context flow."""
    args = Mock()
    args.task_id = "TASK-TEST-001"
    args.allow_preexisting_dirty = True  # Allow preexisting files in test
    args.format = "text"

    # Create checklists
    checklist_dir = temp_repo / "docs" / "agents"
    checklist_dir.mkdir(parents=True, exist_ok=True)
    (checklist_dir / "implementation-preflight.md").write_text("# Preflight")

    with patch('scripts.tasks_cli.commands.Path.cwd', return_value=temp_repo):
        with patch('scripts.tasks_cli.commands.is_json_mode', return_value=False):
            with patch('builtins.print'):
                exit_code = cmd_init_context(args)

    assert exit_code == EXIT_SUCCESS

    # Verify context created
    context_path = temp_repo / ".agent-output" / "TASK-TEST-001" / "context.json"
    assert context_path.exists()

    with open(context_path) as f:
        context = json.load(f)

    # Verify embedded data
    assert "acceptance_criteria" in context["immutable"]
    assert len(context["immutable"]["acceptance_criteria"]) == 2


def test_init_context_empty_acceptance_criteria(temp_repo):
    """Test init context fails with empty acceptance criteria."""
    # Create task with empty AC
    task_dir = temp_repo / "tasks" / "backend"
    task_dir.mkdir(parents=True, exist_ok=True)

    task_data = {
        "id": "TASK-EMPTY-AC",
        "acceptance_criteria": [],  # Empty!
        "plan": [{"step": "Step"}],
        "scope": {"in": ["Item"]},
        "deliverables": ["Del"]
    }

    task_path = task_dir / "TASK-EMPTY-AC.task.yaml"
    with open(task_path, 'w') as f:
        yaml.dump(task_data, f)

    args = Mock()
    args.task_id = "TASK-EMPTY-AC"
    args.allow_preexisting_dirty = True

    with patch('scripts.tasks_cli.commands.Path.cwd', return_value=temp_repo):
        with patch('scripts.tasks_cli.commands.print_error') as mock_error:
            mock_error.side_effect = SystemExit(EXIT_VALIDATION_ERROR)

            with pytest.raises(SystemExit):
                cmd_init_context(args)


def test_complete_lifecycle(temp_repo, sample_task_file):
    """Test complete context lifecycle: init → record-qa → verify → collect."""
    # 1. Init context
    args_init = Mock()
    args_init.task_id = "TASK-TEST-001"
    args_init.allow_preexisting_dirty = True

    checklist_dir = temp_repo / "docs" / "agents"
    checklist_dir.mkdir(parents=True, exist_ok=True)
    (checklist_dir / "implementation-preflight.md").write_text("# Preflight")

    with patch('scripts.tasks_cli.commands.Path.cwd', return_value=temp_repo):
        with patch('scripts.tasks_cli.commands.is_json_mode', return_value=False):
            with patch('builtins.print'):
                exit_code = cmd_init_context(args_init)

    assert exit_code == EXIT_SUCCESS

    # 2. Record QA
    qa_log = temp_repo / ".agent-output" / "TASK-TEST-001" / "qa.log"
    qa_log.parent.mkdir(parents=True, exist_ok=True)
    qa_log.write_text("All tests passed\n10 passed, 0 failed")

    args_qa = Mock()
    args_qa.task_id = "TASK-TEST-001"
    args_qa.command = "test"
    args_qa.exit_code = 0
    args_qa.log_path = str(qa_log)

    with patch('scripts.tasks_cli.commands.Path.cwd', return_value=temp_repo):
        with patch('scripts.tasks_cli.commands.is_json_mode', return_value=False):
            with patch('builtins.print'):
                exit_code = cmd_record_qa(args_qa)

    assert exit_code == EXIT_SUCCESS

    # 3. Verify worktree
    args_verify = Mock()
    args_verify.task_id = "TASK-TEST-001"

    with patch('scripts.tasks_cli.commands.Path.cwd', return_value=temp_repo):
        with patch('scripts.tasks_cli.commands.is_json_mode', return_value=False):
            with patch('builtins.print'):
                exit_code = cmd_verify_worktree(args_verify)

    assert exit_code == EXIT_SUCCESS  # No drift


def test_init_context_quarantine_check(temp_repo, sample_task_file):
    """Test init context fails if task is quarantined."""
    args = Mock()
    args.task_id = "TASK-TEST-001"
    args.allow_preexisting_dirty = True

    # Mock quarantine check
    with patch('scripts.tasks_cli.commands.Path.cwd', return_value=temp_repo):
        with patch('scripts.tasks_cli.commands.is_quarantined', return_value=True):
            with patch('scripts.tasks_cli.commands.print_error') as mock_error:
                mock_error.side_effect = SystemExit(EXIT_BLOCKER_ERROR)

                with pytest.raises(SystemExit):
                    cmd_init_context(args)


def test_verify_worktree_detects_drift(temp_repo, sample_task_file):
    """Test verify worktree detects dirty files."""
    # Initialize context first
    args_init = Mock()
    args_init.task_id = "TASK-TEST-001"
    args_init.allow_preexisting_dirty = True

    checklist_dir = temp_repo / "docs" / "agents"
    checklist_dir.mkdir(parents=True, exist_ok=True)
    (checklist_dir / "implementation-preflight.md").write_text("# Preflight")

    with patch('scripts.tasks_cli.commands.Path.cwd', return_value=temp_repo):
        with patch('scripts.tasks_cli.commands.is_json_mode', return_value=False):
            with patch('builtins.print'):
                cmd_init_context(args_init)

    # Create a dirty file
    (temp_repo / "dirty.txt").write_text("dirty content")

    # Verify worktree - should detect drift
    args_verify = Mock()
    args_verify.task_id = "TASK-TEST-001"

    with patch('scripts.tasks_cli.commands.Path.cwd', return_value=temp_repo):
        with patch('scripts.tasks_cli.commands.is_json_mode', return_value=False):
            with patch('builtins.print'):
                exit_code = cmd_verify_worktree(args_verify)

    assert exit_code == EXIT_DRIFT_ERROR


def test_record_qa_with_missing_log(temp_repo, sample_task_file):
    """Test record QA handles missing log file gracefully."""
    # Initialize context first
    args_init = Mock()
    args_init.task_id = "TASK-TEST-001"
    args_init.allow_preexisting_dirty = True

    checklist_dir = temp_repo / "docs" / "agents"
    checklist_dir.mkdir(parents=True, exist_ok=True)
    (checklist_dir / "implementation-preflight.md").write_text("# Preflight")

    with patch('scripts.tasks_cli.commands.Path.cwd', return_value=temp_repo):
        with patch('scripts.tasks_cli.commands.is_json_mode', return_value=False):
            with patch('builtins.print'):
                cmd_init_context(args_init)

    # Record QA with non-existent log
    args_qa = Mock()
    args_qa.task_id = "TASK-TEST-001"
    args_qa.command = "test"
    args_qa.exit_code = 0
    args_qa.log_path = str(temp_repo / "nonexistent.log")

    with patch('scripts.tasks_cli.commands.Path.cwd', return_value=temp_repo):
        with patch('scripts.tasks_cli.commands.is_json_mode', return_value=False):
            with patch('builtins.print'):
                exit_code = cmd_record_qa(args_qa)

    assert exit_code == EXIT_SUCCESS


def test_collect_metrics_basic(temp_repo, sample_task_file):
    """Test basic metrics collection."""
    # Initialize context and create telemetry
    args_init = Mock()
    args_init.task_id = "TASK-TEST-001"
    args_init.allow_preexisting_dirty = True

    checklist_dir = temp_repo / "docs" / "agents"
    checklist_dir.mkdir(parents=True, exist_ok=True)
    (checklist_dir / "implementation-preflight.md").write_text("# Preflight")

    with patch('scripts.tasks_cli.commands.Path.cwd', return_value=temp_repo):
        with patch('scripts.tasks_cli.commands.is_json_mode', return_value=False):
            with patch('builtins.print'):
                cmd_init_context(args_init)

    # Create minimal telemetry file
    telemetry_dir = temp_repo / ".agent-output" / "TASK-TEST-001" / "telemetry"
    telemetry_dir.mkdir(parents=True, exist_ok=True)

    telemetry_data = {
        "agent": "implementer",
        "start_time": "2025-01-01T00:00:00Z",
        "end_time": "2025-01-01T00:30:00Z",
        "file_operations": {
            "reads": []
        },
        "cache_operations": {
            "context_reads": 1,
            "cache_hits": 0,
            "cache_misses": 1
        },
        "commands": [],
        "warnings": []
    }

    (telemetry_dir / "implementer_session_001.json").write_text(json.dumps(telemetry_data))

    # Mock collect_task_metrics to return a simple summary
    args_metrics = Mock()
    args_metrics.task_id = "TASK-TEST-001"
    args_metrics.baseline_path = None

    with patch('scripts.tasks_cli.commands.Path.cwd', return_value=temp_repo):
        with patch('scripts.tasks_cli.commands.is_json_mode', return_value=False):
            with patch('scripts.tasks_cli.commands.collect_task_metrics') as mock_collect:
                from dataclasses import dataclass

                @dataclass
                class MockMetrics:
                    task_id: str = "TASK-TEST-001"
                    duration_minutes: float = 30.0
                    agents_run: list = None
                    total_file_reads: int = 0
                    file_reads_by_agent: dict = None
                    avg_file_reads_per_agent: float = 0.0
                    total_cache_hits: int = 0
                    total_cache_misses: int = 1
                    cache_hit_rate: float = 0.0
                    estimated_tokens_saved: int = 0
                    qa_commands_run: int = 0
                    qa_commands_with_logs: int = 0
                    qa_artifact_coverage: float = 0.0
                    total_warnings: int = 0
                    repeated_warnings: int = 0
                    json_calls: int = 0
                    json_parse_failures: int = 0

                    def __post_init__(self):
                        if self.agents_run is None:
                            self.agents_run = ["implementer"]
                        if self.file_reads_by_agent is None:
                            self.file_reads_by_agent = {}

                mock_collect.return_value = MockMetrics()

                with patch('builtins.print'):
                    exit_code = cmd_collect_metrics(args_metrics)

    assert exit_code == EXIT_SUCCESS
