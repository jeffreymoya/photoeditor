"""
Agent coordination commands for tasks CLI.

Implements agent state management for task context.
"""

import sys
from datetime import datetime, timezone
from typing import Optional

import typer

from ...context import TaskCliContext
from ...context_store import ContextNotFoundError, TaskContextStore
from ...exceptions import ValidationError


def register_coordination_command(app: typer.Typer, ctx: TaskCliContext) -> None:
    """
    Register the update-agent command as a top-level command.

    Args:
        app: Main Typer app instance
        ctx: TaskCliContext with store and output channel
    """
    @app.command("update-agent")
    def update_agent_cmd(
        task_id: str = typer.Argument(..., help="Task ID to update"),
        agent: str = typer.Option(..., "--agent", help="Agent role: implementer, reviewer, or validator"),
        status: Optional[str] = typer.Option(None, "--status", help="New status for the agent"),
        qa_log: Optional[str] = typer.Option(None, "--qa-log", help="Path to QA log file"),
        session_id: Optional[str] = typer.Option(None, "--session-id", help="Agent session ID"),
        actor: str = typer.Option("task-runner", "--actor", help="Actor performing the update"),
        force_secrets: bool = typer.Option(False, "--force-secrets", help="Bypass drift budget check"),
        format: str = typer.Option("text", "--format", "-f", help="Output format: 'text' or 'json'"),
    ):
        """Update coordination state for one agent."""
        from ..worktree_commands import _auto_verify_worktree, _check_drift_budget

        repo_root = ctx.repo_root
        store = TaskContextStore(repo_root)

        updates = {}
        if status:
            updates['status'] = status
        if qa_log:
            updates['qa_log_path'] = qa_log
        if session_id:
            updates['session_id'] = session_id

        # Auto-populate completed_at when status changes to 'done'
        if updates.get('status') == 'done' and 'completed_at' not in updates:
            updates['completed_at'] = datetime.now(timezone.utc).isoformat()

        if not updates:
            print("Error: No updates specified (use --status, --qa-log, or --session-id)", file=sys.stderr)
            raise typer.Exit(code=1)

        try:
            _check_drift_budget(store, task_id)
            _auto_verify_worktree(store, task_id, agent)

            store.update_coordination(
                task_id=task_id,
                agent_role=agent,
                updates=updates,
                actor=actor,
                force_secrets=force_secrets,
            )

            if format == 'json':
                ctx.output_channel.print_json({
                    'success': True,
                    'task_id': task_id,
                    'agent_role': agent,
                    'updates': updates,
                })
            else:
                print(f"Updated {agent} coordination for {task_id}")
                for key, value in updates.items():
                    print(f"  {key}: {value}")
        except (ContextNotFoundError, ValidationError) as e:
            if format == 'json':
                ctx.output_channel.print_json({'success': False, 'error': str(e)})
            else:
                print(f"Error: {e}", file=sys.stderr)
            raise typer.Exit(code=1)
