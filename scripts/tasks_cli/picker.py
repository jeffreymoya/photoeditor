"""
Task prioritization and selection logic.

Implements the deterministic prioritization algorithm from
docs/proposals/task-workflow-python-refactor.md Section 3.2.

CRITICAL FIX: Prioritizes unblocker tasks BEFORE higher-priority non-unblockers.
The Bash script incorrectly sorts by priority first.
"""

from typing import List, Optional

from .constants import DEFAULT_PRIORITY_RANK, DEFAULT_STATUS_RANK, PRIORITY_RANK, STATUS_RANK
from .exceptions import WorkflowHaltError
from .graph import DependencyGraph
from .models import Task


def check_halt_conditions(tasks: List[Task]) -> None:
    """
    Check for workflow-halting conditions.

    Per docs/proposals/task-workflow-python-refactor.md Section 3.4,
    the workflow must halt when unblocker tasks are blocked.

    Args:
        tasks: List of all tasks to check

    Raises:
        WorkflowHaltError: If unblockers are blocked
    """
    blocked_unblockers = [
        t for t in tasks
        if t.unblocker and t.status == 'blocked'
    ]

    if blocked_unblockers:
        # Build detailed message with task information
        task_details = []
        for t in blocked_unblockers:
            # Note: blocked_reason will be added in next phase
            reason = getattr(t, 'blocked_reason', None)
            if reason:
                task_details.append(f"  - {t.id}: {reason}")
            else:
                task_details.append(f"  - {t.id}: (no reason specified)")

        message = (
            f"WORKFLOW HALTED: {len(blocked_unblockers)} unblocker task(s) blocked.\n"
            f"Manual intervention required:\n" +
            "\n".join(task_details) +
            f"\n\nFix these unblockers before resuming workflow."
        )

        raise WorkflowHaltError(
            message,
            halt_type="blocked_unblocker",
            task_ids=[t.id for t in blocked_unblockers]
        )


class TaskPicker:
    """Handles task selection and prioritization."""

    def __init__(self, tasks: List[Task], graph: DependencyGraph):
        """
        Initialize picker.

        Args:
            tasks: List of all tasks
            graph: Dependency graph for readiness checks
        """
        self.tasks = tasks
        self.graph = graph

    def pick_next_task(
        self,
        completed_ids: set,
        status_filter: Optional[str] = None
    ) -> Optional[Task]:
        """
        Pick the next task following solo-developer workflow priorities.

        Prioritization order (within ready tasks):
        1. Unblocker tasks ALWAYS first (regardless of priority level)
        2. Status (blocked=0, in_progress=1, todo=2)
        3. Priority (P0=0, P1=1, P2=2)
        4. Order field (lower values first)
        5. Task ID (lexicographic tie-breaker)

        HALT conditions (raises exceptions):
        - If any unblocker task is blocked → WorkflowHaltError

        Args:
            completed_ids: Set of completed task IDs
            status_filter: Optional status filter (todo, in_progress, blocked, etc.)

        Returns:
            Next task to execute, or None if no ready tasks

        Raises:
            WorkflowHaltError: If workflow must halt for manual intervention
        """
        # CRITICAL: Check for blocked unblockers first (before selecting ready tasks)
        check_halt_conditions(self.tasks)

        # Get topologically ready tasks (all blocked_by dependencies completed)
        ready = self.graph.topological_ready_set(completed_ids)

        if not ready:
            return None

        # Apply status filter if provided
        if status_filter:
            ready = [task for task in ready if task.status == status_filter]
            if not ready:
                return None

        # Sort by priority algorithm
        sorted_tasks = sorted(ready, key=self._sort_key)

        return sorted_tasks[0] if sorted_tasks else None

    def list_tasks(
        self,
        status_filter: Optional[str] = None,
        unblocker_only: bool = False
    ) -> List[Task]:
        """
        List tasks with optional filtering.

        Args:
            status_filter: Filter by status (todo, in_progress, blocked, completed)
            unblocker_only: Only show unblocker tasks

        Returns:
            Filtered and sorted list of tasks
        """
        tasks = self.tasks

        # Apply filters
        if status_filter:
            tasks = [task for task in tasks if task.status == status_filter]

        if unblocker_only:
            tasks = [task for task in tasks if task.unblocker]

        # Sort by priority algorithm (same as pick, but includes completed)
        return sorted(tasks, key=self._sort_key)

    def _sort_key(self, task: Task) -> tuple:
        """
        Generate sort key for deterministic prioritization.

        CRITICAL: Unblocker tasks are prioritized FIRST, before priority.
        This fixes the Bash script bug where priority was sorted first.

        Sort order:
        1. unblocker (0=true, 1=false) - UNBLOCKER FIRST
        2. status rank (blocked=0, in_progress=1, todo=2, completed=3)
        3. priority rank (P0=0, P1=1, P2=2)
        4. order (lower first, None = 9999)
        5. task ID (lexicographic)

        Args:
            task: Task to generate key for

        Returns:
            Tuple for sorting
        """
        # Unblocker rank: 0 if unblocker (higher priority), 1 if not
        unblocker_rank = 0 if task.unblocker else 1

        # Status rank from constants
        status_rank = STATUS_RANK.get(task.status, DEFAULT_STATUS_RANK)

        # Priority rank from constants
        priority_rank = PRIORITY_RANK.get(task.priority, DEFAULT_PRIORITY_RANK)

        # Order (None treated as 9999 for sorting)
        order = task.order if task.order is not None else 9999

        return (
            unblocker_rank,  # UNBLOCKER FIRST (critical fix)
            status_rank,
            priority_rank,
            order,
            task.id,
        )
