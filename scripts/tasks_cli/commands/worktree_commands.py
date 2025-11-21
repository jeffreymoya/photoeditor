"""
Worktree management commands for tasks CLI (Typer-based).

Implements delta tracking and drift verification commands:
- snapshot-worktree: Snapshot working tree state at agent completion
- verify-worktree: Verify working tree matches expected state from previous agent
- get-diff: Retrieve diff file path for an agent's changes

Migrated from __main__.py per S5.2 of modularization mitigation plan.
"""

import sys
from pathlib import Path
from typing import Optional

import typer

from ..context import TaskCliContext
from ..context_store import (
    ContextNotFoundError,
    DriftError,
    TaskContextStore,
)
from ..exceptions import ValidationError
from ..output import print_json


# Exit codes per schemas doc section 6.1
EXIT_SUCCESS = 0
EXIT_GENERAL_ERROR = 1
EXIT_VALIDATION_ERROR = 10
EXIT_DRIFT_ERROR = 20


def _auto_verify_worktree(
    context_store: TaskContextStore, task_id: str, agent_role: str
) -> None:
    """
    Auto-verify worktree before mutations (Issue #2).

    Per proposal Section 3.3: state-changing CLI verbs implicitly run
    verify_worktree for the previous agent and abort on drift.

    Args:
        context_store: TaskContextStore instance
        task_id: Task identifier
        agent_role: Current agent role

    Raises:
        DriftError: On worktree drift (increments drift_budget)
        ContextNotFoundError: If no context or snapshot found
    """
    agent_sequence = ["implementer", "reviewer", "validator"]
    try:
        current_idx = agent_sequence.index(agent_role)
        if current_idx > 0:
            expected_agent = agent_sequence[current_idx - 1]
            try:
                context_store.verify_worktree_state(
                    task_id=task_id, expected_agent=expected_agent
                )
            except DriftError:
                # Increment drift budget for the current agent (Issue #3 fix)
                context = context_store.get_context(task_id)
                if context:
                    agent_coord = getattr(context, agent_role)
                    context_store.update_coordination(
                        task_id=task_id,
                        agent_role=agent_role,
                        updates={"drift_budget": agent_coord.drift_budget + 1},
                        actor="auto-verification",
                    )
                raise
    except ValueError:
        # Agent not in sequence, skip verification
        pass


def _check_drift_budget(context_store: TaskContextStore, task_id: str) -> None:
    """
    Check drift budget and block operations if non-zero (Issue #3).

    Per proposal Section 3.4: when drift_budget > 0, state-changing CLI verbs
    refuse to launch a new agent until operator records a resolution note.

    Args:
        context_store: TaskContextStore instance
        task_id: Task identifier

    Raises:
        ValidationError: If any agent has drift_budget > 0
    """
    context = context_store.get_context(task_id)
    if context:
        for agent_role in ["implementer", "reviewer", "validator"]:
            agent_coord = getattr(context, agent_role)
            if agent_coord.drift_budget > 0:
                raise ValidationError(
                    f"Drift budget exceeded for {agent_role} (count: {agent_coord.drift_budget}). "
                    f'Manual intervention required. Run: python scripts/tasks.py --resolve-drift {task_id} '
                    f'--agent {agent_role} --note "Resolution description"'
                )


def register_worktree_commands(app: typer.Typer, ctx: TaskCliContext) -> None:
    """
    Register worktree management commands with Typer app.

    Args:
        app: Typer app instance to register commands with
        ctx: TaskCliContext with store and output channel
    """

    @app.command("snapshot-worktree")
    def snapshot_worktree_cmd(
        task_id: str = typer.Argument(..., help="Task ID to snapshot worktree for"),
        agent: str = typer.Option(
            ..., "--agent", help="Agent role: implementer, reviewer, or validator"
        ),
        actor: str = typer.Option(
            "task-runner", "--actor", help="Actor performing the snapshot"
        ),
        previous_agent: Optional[str] = typer.Option(
            None, "--previous-agent", help="Previous agent in handoff chain"
        ),
        format: str = typer.Option(
            "text", "--format", "-f", help="Output format: 'text' or 'json'"
        ),
    ) -> None:
        """Snapshot working tree state at agent completion."""
        repo_root = ctx.repo_root
        context_store = TaskContextStore(repo_root)
        context = context_store.get_context(task_id)

        if context is None:
            if format == "json":
                print_json({"success": False, "error": f"No context found for {task_id}"})
            else:
                print(f"Error: No context found for {task_id}", file=sys.stderr)
            raise typer.Exit(code=EXIT_GENERAL_ERROR)

        base_commit = context.git_head

        try:
            _check_drift_budget(context_store, task_id)
            _auto_verify_worktree(context_store, task_id, agent)

            snapshot = context_store.snapshot_worktree(
                task_id=task_id,
                agent_role=agent,
                actor=actor,
                base_commit=base_commit,
                previous_agent=previous_agent,
            )

            if format == "json":
                print_json(
                    {
                        "success": True,
                        "task_id": task_id,
                        "agent_role": agent,
                        "snapshot": snapshot.to_dict(),
                    }
                )
            else:
                print(f"Snapshotted working tree for {agent} on {task_id}")
                print(f"  Base commit: {snapshot.base_commit[:8]}")
                print(f"  Files changed: {len(snapshot.files_changed)}")
                print(f"  Diff saved to: {snapshot.diff_from_base}")
                print(f"  Diff stat: {snapshot.diff_stat}")

                if snapshot.incremental_diff_error:
                    print("\n  Incremental diff calculation failed:")
                    print(f"  {snapshot.incremental_diff_error}")

        except (ValidationError, ContextNotFoundError, DriftError) as e:
            if format == "json":
                print_json({"success": False, "error": str(e)})
            else:
                print(f"Error: {e}", file=sys.stderr)
            raise typer.Exit(code=EXIT_GENERAL_ERROR)

    @app.command("verify-worktree")
    def verify_worktree_cmd(
        task_id: str = typer.Argument(..., help="Task ID to verify worktree for"),
        expected_agent: str = typer.Option(
            ...,
            "--expected-agent",
            help="Agent whose snapshot to verify against (implementer, reviewer, validator)",
        ),
        format: str = typer.Option(
            "text", "--format", "-f", help="Output format: 'text' or 'json'"
        ),
    ) -> None:
        """Verify working tree matches expected state from previous agent."""
        repo_root = ctx.repo_root
        context_store = TaskContextStore(repo_root)

        try:
            context_store.verify_worktree_state(
                task_id=task_id, expected_agent=expected_agent
            )

            if format == "json":
                print_json(
                    {
                        "success": True,
                        "task_id": task_id,
                        "expected_agent": expected_agent,
                        "drift_detected": False,
                    }
                )
            else:
                print(
                    f"Working tree verified against {expected_agent} snapshot for {task_id}"
                )
                print("  No drift detected")

        except DriftError as e:
            if format == "json":
                print_json(
                    {
                        "success": False,
                        "drift_detected": True,
                        "task_id": task_id,
                        "expected_agent": expected_agent,
                        "error": str(e),
                    }
                )
            else:
                print("Drift detected:", file=sys.stderr)
                print(str(e), file=sys.stderr)
            raise typer.Exit(code=EXIT_DRIFT_ERROR)

        except ContextNotFoundError as e:
            if format == "json":
                print_json({"success": False, "error": str(e)})
            else:
                print(f"Error: {e}", file=sys.stderr)
            raise typer.Exit(code=EXIT_DRIFT_ERROR)

    @app.command("get-diff")
    def get_diff_cmd(
        task_id: str = typer.Argument(..., help="Task ID to get diff for"),
        agent: str = typer.Option(
            ..., "--agent", help="Agent role: implementer, reviewer, or validator"
        ),
        diff_type: str = typer.Option(
            "from_base",
            "--diff-type",
            help="Diff type: 'from_base' or 'incremental'",
        ),
        format: str = typer.Option(
            "text", "--format", "-f", help="Output format: 'text' or 'json'"
        ),
    ) -> None:
        """Retrieve diff file path for an agent's changes."""
        repo_root = ctx.repo_root
        context_store = TaskContextStore(repo_root)
        context = context_store.get_context(task_id)

        if context is None:
            if format == "json":
                print_json({"success": False, "error": f"No context found for {task_id}"})
            else:
                print(f"Error: No context found for {task_id}", file=sys.stderr)
            raise typer.Exit(code=EXIT_GENERAL_ERROR)

        try:
            agent_coord = getattr(context, agent)
            snapshot = agent_coord.worktree_snapshot

            if snapshot is None:
                raise ContextNotFoundError(f"No worktree snapshot found for {agent}")

            # Get diff path based on type
            if diff_type == "from_base":
                diff_path = snapshot.diff_from_base
            elif diff_type == "incremental":
                if agent != "reviewer":
                    raise ValidationError("Incremental diff only available for reviewer")
                if snapshot.diff_from_implementer is None:
                    if snapshot.incremental_diff_error:
                        raise ValidationError(
                            f"Incremental diff unavailable: {snapshot.incremental_diff_error}"
                        )
                    else:
                        raise ValidationError("Incremental diff not calculated")
                diff_path = snapshot.diff_from_implementer
            else:
                raise ValidationError(f"Invalid diff type: {diff_type}")

            # Read diff content
            full_diff_path = repo_root / diff_path
            if not full_diff_path.exists():
                raise ValidationError(f"Diff file not found: {diff_path}")

            diff_content = full_diff_path.read_text(encoding="utf-8")

            if format == "json":
                print_json(
                    {
                        "success": True,
                        "task_id": task_id,
                        "agent_role": agent,
                        "diff_type": diff_type,
                        "diff_path": diff_path,
                        "diff_content": diff_content,
                        "diff_stat": snapshot.diff_stat,
                    }
                )
            else:
                print(f"Diff for {agent} ({diff_type}): {diff_path}")
                print()
                print(diff_content)

        except (AttributeError, ContextNotFoundError, ValidationError) as e:
            if format == "json":
                print_json({"success": False, "error": str(e)})
            else:
                print(f"Error: {e}", file=sys.stderr)
            raise typer.Exit(code=EXIT_GENERAL_ERROR)
