"""Legacy CLI command handlers for metrics operations."""

from pathlib import Path
from typing import Dict, Any
import sys
import json

from ..metrics import (
    collect_task_metrics,
    generate_metrics_dashboard,
    compare_metrics
)
from ..output import (
    format_success_response,
    format_error_response
)

# Exit codes per schemas doc section 6.1
EXIT_SUCCESS = 0
EXIT_GENERAL_ERROR = 1
EXIT_IO_ERROR = 40


def print_success(ctx: "TaskCliContext", data: Dict[str, Any]) -> None:
    """Print success response in JSON mode or text mode."""
    if ctx.output_channel.json_mode:
        response = format_success_response(data)
        ctx.output_channel.print_json(response)


def print_error(ctx: "TaskCliContext", error: Dict[str, Any], exit_code: int) -> None:
    """Print error response and exit."""
    if ctx.output_channel.json_mode:
        response = format_error_response(
            code=error["code"],
            message=error["message"],
            details=error.get("details"),
            name=error.get("name"),
            recovery_action=error.get("recovery_action")
        )
        ctx.output_channel.print_json(response)
    else:
        print(f"Error [{error['code']}]: {error['message']}", file=sys.stderr)
        if "recovery_action" in error:
            print(f"Recovery: {error['recovery_action']}", file=sys.stderr)
    sys.exit(exit_code)


def cmd_collect_metrics(ctx: "TaskCliContext", args) -> int:
    """
    Collect metrics for a task.

    Args:
        ctx: TaskCliContext with output channel
        args: Parsed arguments with task_id, baseline_path (optional)

    Returns:
        Exit code
    """
    try:
        repo_root = Path.cwd()

        baseline = None
        if hasattr(args, 'baseline_path') and args.baseline_path:
            with open(args.baseline_path) as f:
                baseline = json.load(f)

        metrics = collect_task_metrics(args.task_id, repo_root, baseline)

        metrics_output = {
            "task_id": args.task_id,
            "completed_at": metrics.timestamp,
            "metrics": {
                "file_read_reduction": {
                    "implementer_reads": metrics.file_reads_by_agent.get("implementer", 0),
                    "reviewer_reads": metrics.file_reads_by_agent.get("reviewer", 0),
                    "validator_reads": metrics.file_reads_by_agent.get("validator", 0),
                    "target_met": metrics.success_criteria_met.get("file_reads", False)
                },
                "warning_noise": {
                    "total_warnings": metrics.total_warnings,
                    "unique_warnings": metrics.total_warnings - metrics.repeated_warnings,
                    "repeated_warnings": metrics.repeated_warnings,
                    "target_met": metrics.success_criteria_met.get("warnings", False)
                },
                "qa_artifact_availability": {
                    "required_commands": metrics.qa_commands_run,
                    "commands_with_logs": metrics.qa_commands_with_logs,
                    "coverage_percent": metrics.qa_artifact_coverage,
                    "target_met": metrics.success_criteria_met.get("qa_coverage", False)
                },
                "prompt_size_savings": {
                    "baseline_kb": (metrics.baseline_prompt_tokens / 1024) if metrics.baseline_prompt_tokens else None,
                    "current_kb": (metrics.current_prompt_tokens / 1024) if metrics.current_prompt_tokens else None,
                    "reduction_percent": metrics.prompt_size_savings_pct,
                    "target_met": metrics.success_criteria_met.get("prompt_savings", False)
                },
                "json_output_reliability": {
                    "total_json_calls": metrics.json_calls,
                    "parse_failures": metrics.json_parse_failures,
                    "target_met": metrics.success_criteria_met.get("json_reliability", False)
                }
            }
        }

        if baseline:
            metrics_output["baseline"] = baseline

        output_path = repo_root / ".agent-output" / args.task_id / "metrics-summary.json"
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, 'w') as f:
            json.dump(metrics_output, f, indent=2)

        if ctx.output_channel.json_mode:
            print_success(ctx, metrics_output)
        else:
            print(f"✓ Metrics collected for {args.task_id}")
            print(f"  Agents: {len(metrics.agents_run)}")
            print(f"  Avg file reads: {metrics.avg_file_reads_per_agent:.1f}")
            print(f"  QA coverage: {metrics.qa_artifact_coverage:.1f}%")
            print(f"  Saved to: {output_path}")

        return EXIT_SUCCESS

    except FileNotFoundError as e:
        error = {
            "code": "E041",
            "name": "FileNotFound",
            "message": str(e),
            "details": {},
            "recovery_action": "Ensure task has telemetry data"
        }
        print_error(ctx, error, exit_code=EXIT_IO_ERROR)

    except Exception as e:
        error = {
            "code": "E999",
            "name": "UnknownError",
            "message": str(e),
            "details": {},
            "recovery_action": "Check logs and retry"
        }
        print_error(ctx, error, exit_code=EXIT_GENERAL_ERROR)


def cmd_generate_dashboard(ctx: "TaskCliContext", args) -> int:
    """
    Generate metrics dashboard across tasks.

    Args:
        ctx: TaskCliContext with output channel
        args: Parsed arguments with task_ids (list), output_path

    Returns:
        Exit code
    """
    try:
        repo_root = Path.cwd()
        output_path = Path(args.output_path)

        dashboard = generate_metrics_dashboard(args.task_ids, repo_root, output_path)

        if ctx.output_channel.json_mode:
            from dataclasses import asdict
            print_success(ctx, asdict(dashboard))
        else:
            print(f"✓ Dashboard generated for {dashboard.total_tasks} tasks")
            print(f"  All criteria met: {dashboard.all_criteria_met}")
            print(f"  Saved to: {output_path}")

        return EXIT_SUCCESS

    except Exception as e:
        error = {
            "code": "E999",
            "name": "UnknownError",
            "message": str(e),
            "details": {},
            "recovery_action": "Check logs and retry"
        }
        print_error(ctx, error, exit_code=EXIT_GENERAL_ERROR)


def cmd_compare_metrics(ctx: "TaskCliContext", args) -> int:
    """
    Compare baseline and current metrics.

    Args:
        ctx: TaskCliContext with output channel
        args: Parsed arguments with baseline_path, current_path

    Returns:
        Exit code
    """
    try:
        comparison = compare_metrics(Path(args.baseline_path), Path(args.current_path))

        if ctx.output_channel.json_mode:
            print_success(ctx, comparison)
        else:
            print("Metrics Comparison:")
            for metric, delta in comparison["deltas"].items():
                improvement = "✓" if delta["improvement"] else "✗"
                print(f"  {improvement} {metric}: {delta['baseline']:.1f} → {delta['current']:.1f} (Δ {delta['delta']:+.1f})")

        return EXIT_SUCCESS

    except Exception as e:
        error = {
            "code": "E999",
            "name": "UnknownError",
            "message": str(e),
            "details": {},
            "recovery_action": "Check logs and retry"
        }
        print_error(ctx, error, exit_code=EXIT_GENERAL_ERROR)


# --- Typer Registration (Wave 7: S7.3) ---

def register_metrics_commands(app, ctx) -> None:
    """Register metrics commands with Typer app."""
    import typer
    from typing import Optional, List

    @app.command("collect-metrics")
    def collect_metrics_cmd(
        task_id: str = typer.Argument(..., help="Task ID to collect metrics for"),
        baseline_path: Optional[str] = typer.Option(None, "--baseline", help="Path to baseline metrics JSON"),
    ):
        """Collect metrics for a task."""
        class Args:
            pass
        args = Args()
        args.task_id = task_id
        args.baseline_path = baseline_path
        raise SystemExit(cmd_collect_metrics(ctx, args))

    @app.command("generate-dashboard")
    def generate_dashboard_cmd(
        task_ids: List[str] = typer.Argument(..., help="Task IDs to include"),
        output_path: str = typer.Option(..., "--output", "-o", help="Output path for dashboard"),
    ):
        """Generate metrics dashboard across tasks."""
        class Args:
            pass
        args = Args()
        args.task_ids = task_ids
        args.output_path = output_path
        raise SystemExit(cmd_generate_dashboard(ctx, args))

    @app.command("compare-metrics")
    def compare_metrics_cmd(
        baseline_path: str = typer.Argument(..., help="Path to baseline metrics"),
        current_path: str = typer.Argument(..., help="Path to current metrics"),
    ):
        """Compare baseline and current metrics."""
        class Args:
            pass
        args = Args()
        args.baseline_path = baseline_path
        args.current_path = current_path
        raise SystemExit(cmd_compare_metrics(ctx, args))
