"""Metrics collection and dashboard generation."""

from pathlib import Path
from typing import Dict, Any, Optional, List
import json
from datetime import datetime, timezone
from dataclasses import dataclass, field, asdict


# Success criteria targets from proposal section 6
SUCCESS_CRITERIA = {
    "file_reads_per_agent": {
        "target": 5,
        "baseline": 20,
        "comparison": "<=",
        "pass_threshold": 0.80  # 80% of agents must meet target
    },
    "repeated_warnings": {
        "target": 1,
        "baseline": "multiple",
        "comparison": "<=",
        "pass_threshold": 1.0  # 100% of tasks must meet target
    },
    "qa_artifact_coverage": {
        "target": 100,
        "baseline": 70,
        "comparison": ">=",
        "pass_threshold": 1.0  # 100% of tasks must meet target
    },
    "prompt_size_savings": {
        "target": 15,
        "baseline": 0,
        "comparison": ">=",
        "pass_threshold": None  # Average across tasks
    },
    "json_parse_failures": {
        "target": 0,
        "baseline": "multiple",
        "comparison": "==",
        "pass_threshold": 1.0  # 100% success (0 failures)
    }
}


@dataclass
class TaskMetricsSummary:
    """Task-level metrics summary."""
    task_id: str
    duration_minutes: float
    agents_run: List[str]

    # File operations
    total_file_reads: int
    file_reads_by_agent: Dict[str, int]
    avg_file_reads_per_agent: float

    # Cache operations
    total_cache_hits: int
    total_cache_misses: int
    cache_hit_rate: float
    estimated_tokens_saved: int

    # QA artifacts
    qa_commands_run: int
    qa_commands_with_logs: int
    qa_artifact_coverage: float  # Percentage

    # Warnings
    total_warnings: int
    repeated_warnings: int

    # JSON operations
    json_calls: int
    json_parse_failures: int

    # Prompt size (if available)
    baseline_prompt_tokens: Optional[int] = None
    current_prompt_tokens: Optional[int] = None
    prompt_size_savings_pct: Optional[float] = None

    # Success criteria validation
    success_criteria_met: Dict[str, bool] = field(default_factory=dict)

    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class MetricsDashboard:
    """Rollup dashboard across multiple tasks."""
    total_tasks: int
    tasks_analyzed: List[str]

    # Aggregate metrics
    avg_file_reads_per_agent: float
    agents_meeting_file_read_target: float  # Percentage

    avg_repeated_warnings: float
    tasks_meeting_warning_target: float  # Percentage

    avg_qa_coverage: float
    tasks_meeting_qa_target: float  # Percentage

    avg_prompt_savings: Optional[float]

    total_json_parse_failures: int
    json_reliability: float  # Percentage (0 failures = 100%)

    # Overall compliance
    all_criteria_met: bool
    criteria_pass_summary: Dict[str, Dict[str, Any]]

    generated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


def collect_task_metrics(
    task_id: str,
    repo_root: Path,
    baseline: Optional[Dict[str, Any]] = None
) -> TaskMetricsSummary:
    """
    Collect metrics for a single task.

    Args:
        task_id: Task ID (e.g., "TASK-0818")
        repo_root: Repository root path
        baseline: Optional baseline metrics for comparison

    Returns:
        TaskMetricsSummary with all collected metrics
    """
    agent_output_dir = repo_root / ".agent-output" / task_id

    if not agent_output_dir.exists():
        raise FileNotFoundError(f"Agent output directory not found: {agent_output_dir}")

    # Collect telemetry from all agents
    telemetry_files = list(agent_output_dir.glob("telemetry-*.json"))

    total_file_reads = 0
    file_reads_by_agent = {}
    total_cache_hits = 0
    total_cache_misses = 0
    estimated_tokens = 0
    agents_run = []
    total_warnings = 0
    json_calls = 0
    json_failures = 0

    for telemetry_file in telemetry_files:
        with open(telemetry_file) as f:
            telemetry = json.load(f)

        agent_role = telemetry.get("agent_role", "unknown")
        agents_run.append(agent_role)

        # Per schema: metrics are nested under "metrics" key
        metrics_data = telemetry.get("metrics", {})

        # File operations (nested under metrics.file_operations)
        file_ops = metrics_data.get("file_operations", {})
        agent_reads = file_ops.get("read_calls", 0)
        total_file_reads += agent_reads
        file_reads_by_agent[agent_role] = agent_reads

        # Cache operations (nested under metrics.cache_operations)
        cache_ops = metrics_data.get("cache_operations", {})
        total_cache_hits += cache_ops.get("cache_hits", 0)
        total_cache_misses += cache_ops.get("cache_misses", 0)
        estimated_tokens += cache_ops.get("estimated_tokens_saved", 0)

        # Warnings
        warnings = telemetry.get("warnings", [])
        total_warnings += len(warnings)

        # JSON calls (track from commands or explicit field)
        json_calls += telemetry.get("json_calls", 0)
        json_failures += telemetry.get("json_parse_failures", 0)

    # Calculate derived metrics
    avg_file_reads = total_file_reads / len(agents_run) if agents_run else 0
    cache_hit_rate = (
        total_cache_hits / (total_cache_hits + total_cache_misses)
        if (total_cache_hits + total_cache_misses) > 0
        else 0
    )

    # QA artifact coverage
    context_file = agent_output_dir / "context.json"
    qa_commands = 0
    qa_with_logs = 0

    if context_file.exists():
        with open(context_file) as f:
            context = json.load(f)

        # Read from nested immutable object per TaskContext.to_dict structure
        immutable = context.get("immutable", {})
        validation_baseline = immutable.get("validation_baseline", {})
        initial_results_data = validation_baseline.get("initial_results")

        # Handle both new format (QAResults dict) and legacy format (list)
        if isinstance(initial_results_data, dict):
            # New format: QAResults with "results" array
            initial_results = initial_results_data.get("results", [])
        elif isinstance(initial_results_data, list):
            # Legacy format: direct list
            initial_results = initial_results_data
        else:
            # None or other
            initial_results = []

        qa_commands = len(initial_results)
        qa_with_logs = sum(
            1 for result in initial_results
            if result.get("log_path") and Path(repo_root / result["log_path"]).exists()
        )

    qa_coverage = (qa_with_logs / qa_commands * 100) if qa_commands > 0 else 0

    # Count repeated warnings (basic heuristic: duplicate messages)
    all_warning_messages = []
    for telemetry_file in telemetry_files:
        with open(telemetry_file) as f:
            telemetry = json.load(f)
        warnings = telemetry.get("warnings", [])
        all_warning_messages.extend([w.get("message", "") for w in warnings])

    unique_warnings = set(all_warning_messages)
    repeated_warnings = len(all_warning_messages) - len(unique_warnings)

    # Prompt size savings (if baseline provided)
    prompt_savings_pct = None
    baseline_tokens = None
    current_tokens = None

    if baseline:
        baseline_tokens = baseline.get("prompt_tokens")
        current_tokens = estimated_tokens  # Rough estimate
        if baseline_tokens and baseline_tokens > 0:
            prompt_savings_pct = (1 - current_tokens / baseline_tokens) * 100

    # Validate against success criteria
    criteria_met = {
        "file_reads_per_agent": avg_file_reads <= SUCCESS_CRITERIA["file_reads_per_agent"]["target"],
        "repeated_warnings": repeated_warnings <= SUCCESS_CRITERIA["repeated_warnings"]["target"],
        "qa_artifact_coverage": qa_coverage >= SUCCESS_CRITERIA["qa_artifact_coverage"]["target"],
        "json_parse_failures": json_failures == SUCCESS_CRITERIA["json_parse_failures"]["target"]
    }

    if prompt_savings_pct is not None:
        criteria_met["prompt_size_savings"] = (
            prompt_savings_pct >= SUCCESS_CRITERIA["prompt_size_savings"]["target"]
        )

    # Calculate duration (rough estimate from telemetry timestamps)
    duration_minutes = 0.0
    if telemetry_files:
        timestamps = []
        for telemetry_file in telemetry_files:
            with open(telemetry_file) as f:
                telemetry = json.load(f)
            timestamps.append(telemetry.get("session_start"))
            timestamps.append(telemetry.get("session_end"))

        valid_timestamps = [t for t in timestamps if t]
        if len(valid_timestamps) >= 2:
            from dateutil.parser import parse
            start = parse(min(valid_timestamps))
            end = parse(max(valid_timestamps))
            duration_minutes = (end - start).total_seconds() / 60

    return TaskMetricsSummary(
        task_id=task_id,
        duration_minutes=duration_minutes,
        agents_run=agents_run,
        total_file_reads=total_file_reads,
        file_reads_by_agent=file_reads_by_agent,
        avg_file_reads_per_agent=avg_file_reads,
        total_cache_hits=total_cache_hits,
        total_cache_misses=total_cache_misses,
        cache_hit_rate=cache_hit_rate,
        estimated_tokens_saved=estimated_tokens,
        qa_commands_run=qa_commands,
        qa_commands_with_logs=qa_with_logs,
        qa_artifact_coverage=qa_coverage,
        total_warnings=total_warnings,
        repeated_warnings=repeated_warnings,
        json_calls=json_calls,
        json_parse_failures=json_failures,
        baseline_prompt_tokens=baseline_tokens,
        current_prompt_tokens=current_tokens,
        prompt_size_savings_pct=prompt_savings_pct,
        success_criteria_met=criteria_met
    )


def generate_metrics_dashboard(
    task_ids: List[str],
    repo_root: Path,
    output_path: Path
) -> MetricsDashboard:
    """
    Generate rollup metrics dashboard across multiple tasks.

    Args:
        task_ids: List of task IDs to analyze
        repo_root: Repository root path
        output_path: Path to write dashboard JSON

    Returns:
        MetricsDashboard with aggregate metrics
    """
    # Collect metrics for each task
    task_summaries = []
    for task_id in task_ids:
        try:
            summary = collect_task_metrics(task_id, repo_root)
            task_summaries.append(summary)
        except Exception as e:
            print(f"Warning: Could not collect metrics for {task_id}: {e}")

    if not task_summaries:
        raise ValueError("No task metrics collected")

    # Aggregate metrics
    total_agents = sum(len(s.agents_run) for s in task_summaries)

    avg_file_reads = (
        sum(s.avg_file_reads_per_agent for s in task_summaries) / len(task_summaries)
    )

    # File read target: 80% of agents must meet ≤5 reads
    agents_meeting_target = sum(
        sum(1 for reads in s.file_reads_by_agent.values() if reads <= 5)
        for s in task_summaries
    )
    pct_agents_meeting = (agents_meeting_target / total_agents * 100) if total_agents > 0 else 0

    # Warning target: 100% of tasks must have ≤1 repeated warning
    avg_repeated_warnings = (
        sum(s.repeated_warnings for s in task_summaries) / len(task_summaries)
    )
    tasks_meeting_warning = sum(
        1 for s in task_summaries if s.repeated_warnings <= 1
    )
    pct_tasks_warning = (tasks_meeting_warning / len(task_summaries) * 100)

    # QA coverage: 100% of tasks must have 100% coverage
    avg_qa_coverage = (
        sum(s.qa_artifact_coverage for s in task_summaries) / len(task_summaries)
    )
    tasks_meeting_qa = sum(
        1 for s in task_summaries if s.qa_artifact_coverage >= 100
    )
    pct_tasks_qa = (tasks_meeting_qa / len(task_summaries) * 100)

    # Prompt savings: average ≥15%
    prompt_savings_values = [
        s.prompt_size_savings_pct
        for s in task_summaries
        if s.prompt_size_savings_pct is not None
    ]
    avg_prompt_savings = (
        sum(prompt_savings_values) / len(prompt_savings_values)
        if prompt_savings_values else None
    )

    # JSON reliability: 0 failures across all tasks
    total_json_failures = sum(s.json_parse_failures for s in task_summaries)
    json_reliability = 100.0 if total_json_failures == 0 else 0.0

    # Validate criteria
    criteria_pass = {
        "file_reads_per_agent": {
            "met": pct_agents_meeting >= (SUCCESS_CRITERIA["file_reads_per_agent"]["pass_threshold"] * 100),
            "target": f"≥{SUCCESS_CRITERIA['file_reads_per_agent']['pass_threshold'] * 100}% of agents ≤5 reads",
            "actual": f"{pct_agents_meeting:.1f}%"
        },
        "repeated_warnings": {
            "met": pct_tasks_warning >= (SUCCESS_CRITERIA["repeated_warnings"]["pass_threshold"] * 100),
            "target": "100% of tasks ≤1 repeated warning",
            "actual": f"{pct_tasks_warning:.1f}%"
        },
        "qa_artifact_coverage": {
            "met": pct_tasks_qa >= (SUCCESS_CRITERIA["qa_artifact_coverage"]["pass_threshold"] * 100),
            "target": "100% of tasks with 100% coverage",
            "actual": f"{pct_tasks_qa:.1f}%"
        },
        "json_parse_failures": {
            "met": total_json_failures == 0,
            "target": "0 failures",
            "actual": f"{total_json_failures} failures"
        }
    }

    if avg_prompt_savings is not None:
        criteria_pass["prompt_size_savings"] = {
            "met": avg_prompt_savings >= SUCCESS_CRITERIA["prompt_size_savings"]["target"],
            "target": "≥15% average savings",
            "actual": f"{avg_prompt_savings:.1f}%"
        }

    all_met = all(c["met"] for c in criteria_pass.values())

    dashboard = MetricsDashboard(
        total_tasks=len(task_summaries),
        tasks_analyzed=[s.task_id for s in task_summaries],
        avg_file_reads_per_agent=avg_file_reads,
        agents_meeting_file_read_target=pct_agents_meeting,
        avg_repeated_warnings=avg_repeated_warnings,
        tasks_meeting_warning_target=pct_tasks_warning,
        avg_qa_coverage=avg_qa_coverage,
        tasks_meeting_qa_target=pct_tasks_qa,
        avg_prompt_savings=avg_prompt_savings,
        total_json_parse_failures=total_json_failures,
        json_reliability=json_reliability,
        all_criteria_met=all_met,
        criteria_pass_summary=criteria_pass
    )

    # Write dashboard to output path
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w') as f:
        json.dump(asdict(dashboard), f, indent=2)

    return dashboard


def compare_metrics(
    baseline_path: Path,
    current_path: Path
) -> Dict[str, Any]:
    """
    Compare baseline and current metrics.

    Args:
        baseline_path: Path to baseline metrics JSON
        current_path: Path to current metrics JSON

    Returns:
        Dict with comparison results and deltas
    """
    with open(baseline_path) as f:
        baseline = json.load(f)

    with open(current_path) as f:
        current = json.load(f)

    # Calculate deltas
    deltas = {
        "file_reads_per_agent": {
            "baseline": baseline.get("avg_file_reads_per_agent", 0),
            "current": current.get("avg_file_reads_per_agent", 0),
            "delta": current.get("avg_file_reads_per_agent", 0) - baseline.get("avg_file_reads_per_agent", 0),
            "improvement": baseline.get("avg_file_reads_per_agent", 0) > current.get("avg_file_reads_per_agent", 0)
        },
        "qa_coverage": {
            "baseline": baseline.get("avg_qa_coverage", 0),
            "current": current.get("avg_qa_coverage", 0),
            "delta": current.get("avg_qa_coverage", 0) - baseline.get("avg_qa_coverage", 0),
            "improvement": current.get("avg_qa_coverage", 0) > baseline.get("avg_qa_coverage", 0)
        },
        "json_reliability": {
            "baseline": baseline.get("json_reliability", 0),
            "current": current.get("json_reliability", 0),
            "delta": current.get("json_reliability", 0) - baseline.get("json_reliability", 0),
            "improvement": current.get("json_reliability", 0) > baseline.get("json_reliability", 0)
        }
    }

    if baseline.get("avg_prompt_savings") and current.get("avg_prompt_savings"):
        deltas["prompt_savings"] = {
            "baseline": baseline["avg_prompt_savings"],
            "current": current["avg_prompt_savings"],
            "delta": current["avg_prompt_savings"] - baseline["avg_prompt_savings"],
            "improvement": current["avg_prompt_savings"] > baseline["avg_prompt_savings"]
        }

    return {
        "comparison_date": datetime.now(timezone.utc).isoformat(),
        "baseline_file": str(baseline_path),
        "current_file": str(current_path),
        "deltas": deltas,
        "overall_improvement": sum(1 for d in deltas.values() if d["improvement"]) >= len(deltas) * 0.6
    }
