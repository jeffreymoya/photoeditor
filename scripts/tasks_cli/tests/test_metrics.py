"""Tests for metrics collection and dashboard generation."""

import pytest
import json
from pathlib import Path
from scripts.tasks_cli.metrics import (
    collect_task_metrics,
    generate_metrics_dashboard,
    compare_metrics,
    SUCCESS_CRITERIA,
    TaskMetricsSummary,
    MetricsDashboard
)


@pytest.fixture
def mock_telemetry_data(tmp_path):
    """Create mock telemetry files for testing."""
    task_dir = tmp_path / ".agent-output" / "TASK-TEST-001"
    task_dir.mkdir(parents=True, exist_ok=True)

    # Implementer telemetry (per schema: metrics nested under "metrics" key)
    telemetry_impl = {
        "agent_role": "implementer",
        "session_start": "2025-11-18T10:00:00Z",
        "session_end": "2025-11-18T10:30:00Z",
        "metrics": {
            "file_operations": {
                "read_calls": 4,
                "files_read": ["file1.py", "file2.py"]
            },
            "cache_operations": {
                "cache_hits": 10,
                "cache_misses": 2,
                "estimated_tokens_saved": 5000
            }
        },
        "warnings": [
            {"message": "Warning 1", "level": "warning"}
        ],
        "json_calls": 5,
        "json_parse_failures": 0
    }

    (task_dir / "telemetry-implementer.json").write_text(json.dumps(telemetry_impl))

    # Reviewer telemetry (per schema: metrics nested under "metrics" key)
    telemetry_rev = {
        "agent_role": "reviewer",
        "session_start": "2025-11-18T10:30:00Z",
        "session_end": "2025-11-18T10:45:00Z",
        "metrics": {
            "file_operations": {
                "read_calls": 3,
                "files_read": ["file3.py"]
            },
            "cache_operations": {
                "cache_hits": 8,
                "cache_misses": 1,
                "estimated_tokens_saved": 3000
            }
        },
        "warnings": [],
        "json_calls": 3,
        "json_parse_failures": 0
    }

    (task_dir / "telemetry-reviewer.json").write_text(json.dumps(telemetry_rev))

    # Context with QA info (nested under immutable per TaskContext.to_dict structure)
    context = {
        "immutable": {
            "validation_baseline": {
                "initial_results": [
                    {"command": "lint", "log_path": ".agent-output/TASK-TEST-001/qa-lint.log"},
                    {"command": "test", "log_path": ".agent-output/TASK-TEST-001/qa-test.log"}
                ]
            }
        }
    }

    (task_dir / "context.json").write_text(json.dumps(context))

    # Create log files
    (task_dir / "qa-lint.log").write_text("Lint output")
    (task_dir / "qa-test.log").write_text("Test output")

    return tmp_path


def test_collect_task_metrics(mock_telemetry_data):
    """Test collecting metrics for a task."""
    metrics = collect_task_metrics("TASK-TEST-001", mock_telemetry_data)

    assert metrics.task_id == "TASK-TEST-001"
    assert len(metrics.agents_run) == 2
    assert "implementer" in metrics.agents_run
    assert "reviewer" in metrics.agents_run

    # File reads
    assert metrics.total_file_reads == 7  # 4 + 3
    assert metrics.avg_file_reads_per_agent == 3.5

    # Cache
    assert metrics.total_cache_hits == 18  # 10 + 8
    assert metrics.total_cache_misses == 3  # 2 + 1
    assert metrics.cache_hit_rate > 0.8

    # QA
    assert metrics.qa_commands_run == 2
    assert metrics.qa_commands_with_logs == 2
    assert metrics.qa_artifact_coverage == 100.0

    # JSON
    assert metrics.json_calls == 8  # 5 + 3
    assert metrics.json_parse_failures == 0


def test_collect_task_metrics_success_criteria(mock_telemetry_data):
    """Test success criteria validation."""
    metrics = collect_task_metrics("TASK-TEST-001", mock_telemetry_data)

    assert "file_reads_per_agent" in metrics.success_criteria_met
    assert metrics.success_criteria_met["file_reads_per_agent"] is True  # 3.5 <= 5

    assert "repeated_warnings" in metrics.success_criteria_met
    assert metrics.success_criteria_met["repeated_warnings"] is True  # 0 <= 1

    assert "qa_artifact_coverage" in metrics.success_criteria_met
    assert metrics.success_criteria_met["qa_artifact_coverage"] is True  # 100 >= 100

    assert "json_parse_failures" in metrics.success_criteria_met
    assert metrics.success_criteria_met["json_parse_failures"] is True  # 0 == 0


def test_generate_metrics_dashboard(mock_telemetry_data, tmp_path):
    """Test generating dashboard across multiple tasks."""
    output_path = tmp_path / "dashboard.json"

    dashboard = generate_metrics_dashboard(
        task_ids=["TASK-TEST-001"],
        repo_root=mock_telemetry_data,
        output_path=output_path
    )

    assert dashboard.total_tasks == 1
    assert "TASK-TEST-001" in dashboard.tasks_analyzed

    # Check aggregates
    assert dashboard.avg_file_reads_per_agent == 3.5
    assert dashboard.avg_qa_coverage == 100.0
    assert dashboard.total_json_parse_failures == 0
    assert dashboard.json_reliability == 100.0

    # Check file written
    assert output_path.exists()
    with open(output_path) as f:
        data = json.load(f)
    assert data["total_tasks"] == 1


def test_generate_metrics_dashboard_criteria_pass(mock_telemetry_data, tmp_path):
    """Test criteria pass summary in dashboard."""
    output_path = tmp_path / "dashboard.json"

    dashboard = generate_metrics_dashboard(
        task_ids=["TASK-TEST-001"],
        repo_root=mock_telemetry_data,
        output_path=output_path
    )

    assert "file_reads_per_agent" in dashboard.criteria_pass_summary
    assert dashboard.criteria_pass_summary["file_reads_per_agent"]["met"] is True

    assert "qa_artifact_coverage" in dashboard.criteria_pass_summary
    assert dashboard.criteria_pass_summary["qa_artifact_coverage"]["met"] is True

    # All criteria met should be True
    assert dashboard.all_criteria_met is True


def test_compare_metrics(tmp_path):
    """Test comparing baseline and current metrics."""
    baseline_data = {
        "avg_file_reads_per_agent": 20,
        "avg_qa_coverage": 70,
        "json_reliability": 80
    }

    current_data = {
        "avg_file_reads_per_agent": 4,
        "avg_qa_coverage": 100,
        "json_reliability": 100
    }

    baseline_path = tmp_path / "baseline.json"
    current_path = tmp_path / "current.json"

    baseline_path.write_text(json.dumps(baseline_data))
    current_path.write_text(json.dumps(current_data))

    comparison = compare_metrics(baseline_path, current_path)

    assert "deltas" in comparison
    assert comparison["deltas"]["file_reads_per_agent"]["delta"] == -16  # 4 - 20
    assert comparison["deltas"]["file_reads_per_agent"]["improvement"] is True

    assert comparison["deltas"]["qa_coverage"]["delta"] == 30  # 100 - 70
    assert comparison["deltas"]["qa_coverage"]["improvement"] is True

    assert comparison["overall_improvement"] is True


def test_success_criteria_constants():
    """Test success criteria constants."""
    assert "file_reads_per_agent" in SUCCESS_CRITERIA
    assert SUCCESS_CRITERIA["file_reads_per_agent"]["target"] == 5
    assert SUCCESS_CRITERIA["file_reads_per_agent"]["baseline"] == 20

    assert "json_parse_failures" in SUCCESS_CRITERIA
    assert SUCCESS_CRITERIA["json_parse_failures"]["target"] == 0


def test_collect_task_metrics_missing_directory(tmp_path):
    """Test handling of missing agent output directory."""
    with pytest.raises(FileNotFoundError, match="Agent output directory not found"):
        collect_task_metrics("TASK-MISSING", tmp_path)


def test_collect_task_metrics_no_telemetry(tmp_path):
    """Test handling of directory with no telemetry files."""
    task_dir = tmp_path / ".agent-output" / "TASK-EMPTY"
    task_dir.mkdir(parents=True, exist_ok=True)

    metrics = collect_task_metrics("TASK-EMPTY", tmp_path)

    # Should return zero values
    assert metrics.task_id == "TASK-EMPTY"
    assert len(metrics.agents_run) == 0
    assert metrics.total_file_reads == 0
    assert metrics.avg_file_reads_per_agent == 0


def test_collect_task_metrics_with_repeated_warnings(tmp_path):
    """Test repeated warnings detection."""
    task_dir = tmp_path / ".agent-output" / "TASK-WARNINGS"
    task_dir.mkdir(parents=True, exist_ok=True)

    telemetry = {
        "agent_role": "implementer",
        "session_start": "2025-11-18T10:00:00Z",
        "session_end": "2025-11-18T10:30:00Z",
        "metrics": {
            "file_operations": {"read_calls": 2},
            "cache_operations": {"cache_hits": 0, "cache_misses": 0}
        },
        "warnings": [
            {"message": "Same warning"},
            {"message": "Same warning"},
            {"message": "Different warning"}
        ],
        "json_calls": 0,
        "json_parse_failures": 0
    }

    (task_dir / "telemetry-implementer.json").write_text(json.dumps(telemetry))
    (task_dir / "context.json").write_text(json.dumps({"validation_baseline": {"initial_results": []}}))

    metrics = collect_task_metrics("TASK-WARNINGS", tmp_path)

    assert metrics.total_warnings == 3
    assert metrics.repeated_warnings == 1  # 3 total - 2 unique = 1 repeated


def test_generate_metrics_dashboard_multiple_tasks(tmp_path):
    """Test dashboard with multiple tasks."""
    # Create two tasks
    for i in range(1, 3):
        task_dir = tmp_path / ".agent-output" / f"TASK-TEST-{i:03d}"
        task_dir.mkdir(parents=True, exist_ok=True)

        telemetry = {
            "agent_role": "implementer",
            "session_start": "2025-11-18T10:00:00Z",
            "session_end": "2025-11-18T10:30:00Z",
            "metrics": {
                "file_operations": {"read_calls": 3 + i},
                "cache_operations": {"cache_hits": 10, "cache_misses": 2}
            },
            "warnings": [],
            "json_calls": 5,
            "json_parse_failures": 0
        }

        (task_dir / "telemetry-implementer.json").write_text(json.dumps(telemetry))

        context = {
            "validation_baseline": {
                "initial_results": [
                    {"command": "lint", "log_path": f".agent-output/TASK-TEST-{i:03d}/qa-lint.log"}
                ]
            }
        }
        (task_dir / "context.json").write_text(json.dumps(context))
        (task_dir / "qa-lint.log").write_text("Lint output")

    output_path = tmp_path / "dashboard.json"
    dashboard = generate_metrics_dashboard(
        task_ids=["TASK-TEST-001", "TASK-TEST-002"],
        repo_root=tmp_path,
        output_path=output_path
    )

    assert dashboard.total_tasks == 2
    assert len(dashboard.tasks_analyzed) == 2
    assert dashboard.avg_file_reads_per_agent == 4.5  # (4 + 5) / 2


def test_generate_metrics_dashboard_no_tasks(tmp_path):
    """Test dashboard with no valid tasks."""
    output_path = tmp_path / "dashboard.json"

    with pytest.raises(ValueError, match="No task metrics collected"):
        generate_metrics_dashboard(
            task_ids=["TASK-MISSING"],
            repo_root=tmp_path,
            output_path=output_path
        )


def test_compare_metrics_with_prompt_savings(tmp_path):
    """Test comparison with prompt savings data."""
    baseline_data = {
        "avg_file_reads_per_agent": 20,
        "avg_qa_coverage": 70,
        "json_reliability": 80,
        "avg_prompt_savings": 10
    }

    current_data = {
        "avg_file_reads_per_agent": 4,
        "avg_qa_coverage": 100,
        "json_reliability": 100,
        "avg_prompt_savings": 20
    }

    baseline_path = tmp_path / "baseline.json"
    current_path = tmp_path / "current.json"

    baseline_path.write_text(json.dumps(baseline_data))
    current_path.write_text(json.dumps(current_data))

    comparison = compare_metrics(baseline_path, current_path)

    assert "prompt_savings" in comparison["deltas"]
    assert comparison["deltas"]["prompt_savings"]["delta"] == 10  # 20 - 10
    assert comparison["deltas"]["prompt_savings"]["improvement"] is True


def test_task_metrics_summary_dataclass():
    """Test TaskMetricsSummary dataclass structure."""
    summary = TaskMetricsSummary(
        task_id="TASK-001",
        duration_minutes=30.0,
        agents_run=["implementer"],
        total_file_reads=5,
        file_reads_by_agent={"implementer": 5},
        avg_file_reads_per_agent=5.0,
        total_cache_hits=10,
        total_cache_misses=2,
        cache_hit_rate=0.833,
        estimated_tokens_saved=5000,
        qa_commands_run=3,
        qa_commands_with_logs=3,
        qa_artifact_coverage=100.0,
        total_warnings=1,
        repeated_warnings=0,
        json_calls=5,
        json_parse_failures=0
    )

    assert summary.task_id == "TASK-001"
    assert summary.duration_minutes == 30.0
    assert len(summary.agents_run) == 1
    assert summary.timestamp is not None  # Should have default timestamp


def test_metrics_dashboard_dataclass():
    """Test MetricsDashboard dataclass structure."""
    dashboard = MetricsDashboard(
        total_tasks=2,
        tasks_analyzed=["TASK-001", "TASK-002"],
        avg_file_reads_per_agent=4.5,
        agents_meeting_file_read_target=80.0,
        avg_repeated_warnings=0.5,
        tasks_meeting_warning_target=100.0,
        avg_qa_coverage=95.0,
        tasks_meeting_qa_target=50.0,
        avg_prompt_savings=15.0,
        total_json_parse_failures=0,
        json_reliability=100.0,
        all_criteria_met=True,
        criteria_pass_summary={}
    )

    assert dashboard.total_tasks == 2
    assert len(dashboard.tasks_analyzed) == 2
    assert dashboard.all_criteria_met is True
    assert dashboard.generated_at is not None  # Should have default timestamp


# ============================================================================
# Regression Tests for Code Review Fixes
# ============================================================================


def test_metrics_reads_validation_baseline_from_immutable(tmp_path):
    """
    Regression test for Issue #3: QA coverage metrics broken.

    Metrics should read validation_baseline from context["immutable"]["validation_baseline"]
    not context["validation_baseline"].
    """
    task_dir = tmp_path / ".agent-output" / "TASK-REGRESSION-003"
    task_dir.mkdir(parents=True, exist_ok=True)

    # Create context with validation_baseline in immutable structure
    context = {
        "immutable": {
            "validation_baseline": {
                "initial_results": {
                    "results": [
                        {
                            "command_id": "abc12345",
                            "command": "pnpm test",
                            "exit_code": 0,
                            "log_path": ".agent-output/TASK-REGRESSION-003/logs/test.log"
                        },
                        {
                            "command_id": "def67890",
                            "command": "pnpm lint",
                            "exit_code": 0,
                            "log_path": ".agent-output/TASK-REGRESSION-003/logs/lint.log"
                        }
                    ]
                }
            }
        }
    }

    (task_dir / "context.json").write_text(json.dumps(context))

    # Create log files
    logs_dir = task_dir / "logs"
    logs_dir.mkdir()
    (logs_dir / "test.log").write_text("Test output")
    (logs_dir / "lint.log").write_text("Lint output")

    # Create minimal telemetry
    telemetry = {
        "agent_role": "test-agent",
        "metrics": {
            "file_operations": {"read_calls": 0},
            "cache_operations": {"cache_hits": 0, "cache_misses": 0}
        }
    }
    (task_dir / "telemetry-test.json").write_text(json.dumps(telemetry))

    # Collect metrics
    metrics = collect_task_metrics("TASK-REGRESSION-003", tmp_path)

    # Verify QA coverage is calculated correctly (not 0%)
    assert metrics.qa_commands_run == 2, "Should find 2 QA commands"
    assert metrics.qa_commands_with_logs == 2, "Should find 2 logs"
    assert metrics.qa_artifact_coverage == 100.0, "Coverage should be 100%"


def test_metrics_handles_legacy_validation_baseline_format(tmp_path):
    """
    Regression test: Metrics should handle both new nested format and legacy flat format.
    """
    task_dir = tmp_path / ".agent-output" / "TASK-LEGACY"
    task_dir.mkdir(parents=True, exist_ok=True)

    # Create context with legacy flat structure (for backwards compatibility)
    context = {
        "immutable": {
            "validation_baseline": {
                "initial_results": [  # Legacy: direct list, not nested in dict
                    {
                        "command_id": "abc12345",
                        "command": "pnpm test",
                        "exit_code": 0,
                        "log_path": ".agent-output/TASK-LEGACY/logs/test.log"
                    }
                ]
            }
        }
    }

    (task_dir / "context.json").write_text(json.dumps(context))

    # Create log file
    logs_dir = task_dir / "logs"
    logs_dir.mkdir()
    (logs_dir / "test.log").write_text("Test output")

    # Create minimal telemetry
    telemetry = {
        "agent_role": "test-agent",
        "metrics": {
            "file_operations": {"read_calls": 0},
            "cache_operations": {"cache_hits": 0, "cache_misses": 0}
        }
    }
    (task_dir / "telemetry-test.json").write_text(json.dumps(telemetry))

    # Should not crash
    metrics = collect_task_metrics("TASK-LEGACY", tmp_path)

    assert metrics.qa_commands_run == 1
    assert metrics.qa_commands_with_logs == 1
