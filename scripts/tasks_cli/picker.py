"""
Task prioritization and selection logic.

Implements the deterministic prioritization algorithm from
docs/proposals/task-workflow-python-refactor.md Section 3.2.

CRITICAL FIX: Prioritizes unblocker tasks BEFORE higher-priority non-unblockers.
The Bash script incorrectly sorts by priority first.
"""

from typing import Dict, List, Optional, Set, Tuple

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
        self._task_by_id: Dict[str, Task] = {}
        self._draft_ids: Set[str] = set()
        self._draft_downstream: Dict[str, Dict[str, List[Task]]] = {}
        self._depends_on_draft_only: Dict[str, Set[str]] = {}
        self._blocked_by_draft_wrong_status: Dict[str, Set[str]] = {}
        self.refresh(tasks, graph)

    def refresh(self, tasks: List[Task], graph: DependencyGraph) -> None:
        """
        Refresh picker state with an updated task list or dependency graph.

        Args:
            tasks: Updated list of tasks
            graph: Updated dependency graph
        """
        self.tasks = tasks
        self.graph = graph
        self._task_by_id = {task.id: task for task in tasks}
        self._build_draft_maps()

    def _build_draft_maps(self) -> None:
        """Precompute draft task metadata for dependency warnings."""
        self._draft_ids = {task.id for task in self.tasks if task.status == 'draft'}
        # Initialize downstream mapping for every draft
        self._draft_downstream = {
            draft_id: {'blocked_by': [], 'depends_on_only': []}
            for draft_id in self._draft_ids
        }
        self._depends_on_draft_only = {}
        self._blocked_by_draft_wrong_status = {}

        if not self._draft_ids:
            return

        for task in self.tasks:
            # Skip the draft task collecting its own downstream references
            if task.id in self._draft_ids:
                continue

            # blocked_by references
            for dep_id in task.blocked_by:
                if dep_id in self._draft_ids:
                    entry = self._draft_downstream.setdefault(
                        dep_id,
                        {'blocked_by': [], 'depends_on_only': []}
                    )
                    entry['blocked_by'].append(task)
                    if task.status != 'blocked':
                        self._blocked_by_draft_wrong_status.setdefault(task.id, set()).add(dep_id)

            # depends_on references that are not also blocked_by
            for dep_id in task.depends_on:
                if dep_id in self._draft_ids and dep_id not in task.blocked_by:
                    entry = self._draft_downstream.setdefault(
                        dep_id,
                        {'blocked_by': [], 'depends_on_only': []}
                    )
                    entry['depends_on_only'].append(task)
                    self._depends_on_draft_only.setdefault(task.id, set()).add(dep_id)

    def pick_next_task(
        self,
        completed_ids: set,
        status_filter: Optional[str] = None
    ) -> Optional[Tuple[Task, str]]:
        """
        Pick the next task following solo-developer workflow priorities.

        Prioritization order (within ready tasks):
        1. Unblocker tasks ALWAYS first (regardless of priority level)
        2. Status (blocked=0, in_progress=1, todo=2, draft=3)
        3. Priority (P0=0, P1=1, P2=2)
        4. Order field (lower values first)
        5. Task ID (lexicographic tie-breaker)

        HALT conditions (raises exceptions):
        - If any unblocker task is blocked → WorkflowHaltError

        Args:
            completed_ids: Set of completed task IDs
            status_filter: Optional status filter (todo, in_progress, blocked, etc.)

        Returns:
            Tuple of (task, reason) or None if no ready tasks
            Reason values: "unblocker", "blocked_manual_intervention",
                          "in_progress_resume", "highest_priority"

        Raises:
            WorkflowHaltError: If workflow must halt for manual intervention
        """
        # CRITICAL: Check for blocked unblockers first (before selecting ready tasks)
        check_halt_conditions(self.tasks)

        # Get topologically ready tasks (all blocked_by dependencies completed)
        ready = self.graph.topological_ready_set(completed_ids)

        # Phase 2: Compute effective priorities before sorting
        # Tasks inherit max priority of all work they transitively block
        self.compute_effective_priorities()

        if not ready:
            return None

        # Draft tasks are grooming-only and must never be picked
        ready = [task for task in ready if task.status != 'draft']

        # Exclude tasks that only depend on drafts via depends_on (missing blocked_by linkage)
        if self._depends_on_draft_only:
            ready = [task for task in ready if task.id not in self._depends_on_draft_only]

        # Apply status filter if provided
        if status_filter:
            ready = [task for task in ready if task.status == status_filter]
            if not ready:
                return None

        # Sort by priority algorithm
        sorted_tasks = sorted(ready, key=self._sort_key)

        if not sorted_tasks:
            return None

        task = sorted_tasks[0]

        # Determine selection reason based on task characteristics
        if task.unblocker:
            reason = "unblocker"
        elif task.effective_priority and task.effective_priority != task.priority:
            reason = "priority_inherited"  # Phase 2: Inherited from blocked work
        elif task.status == "blocked":
            reason = "blocked_manual_intervention"
        elif task.status == "in_progress":
            reason = "in_progress_resume"
        else:
            reason = "highest_priority"

        return (task, reason)

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

    def get_draft_alerts(self) -> Dict[str, object]:
        """
        Provide draft-task metadata for CLI warnings and JSON output.

        Returns:
            Dictionary summarizing draft tasks, downstream references, and violations.
        """
        if not self._draft_ids:
            return {
                'has_drafts': False,
                'draft_count': 0,
                'drafts': [],
                'draft_unblockers': [],
                'downstream': [],
                'violations': {
                    'missing_blocked_by': [],
                    'needs_blocked_status': [],
                },
                'filtered_out_by_picker': [],
            }

        drafts_info = [
            {
                'id': draft_id,
                'title': self._task_by_id[draft_id].title,
                'path': self._task_by_id[draft_id].path,
            }
            for draft_id in sorted(self._draft_ids)
        ]

        # Identify draft tasks that are also unblockers (high priority concern)
        draft_unblockers = [
            {
                'id': draft_id,
                'title': self._task_by_id[draft_id].title,
                'priority': self._task_by_id[draft_id].priority,
                'path': self._task_by_id[draft_id].path,
            }
            for draft_id in sorted(self._draft_ids)
            if self._task_by_id[draft_id].unblocker
        ]

        downstream_info = []
        for draft_id in sorted(self._draft_ids):
            entry = self._draft_downstream.get(draft_id, {'blocked_by': [], 'depends_on_only': []})
            downstream_info.append({
                'draft_id': draft_id,
                'blocked_by': [
                    {
                        'task_id': task.id,
                        'status': task.status,
                        'title': task.title,
                        'path': task.path,
                    }
                    for task in sorted(entry['blocked_by'], key=lambda t: t.id)
                ],
                'depends_on_only': [
                    {
                        'task_id': task.id,
                        'status': task.status,
                        'title': task.title,
                        'path': task.path,
                    }
                    for task in sorted(entry['depends_on_only'], key=lambda t: t.id)
                ],
            })

        missing_blocked_by = []
        for task_id, draft_ids in sorted(self._depends_on_draft_only.items()):
            task = self._task_by_id.get(task_id)
            if not task:
                continue
            for draft_id in sorted(draft_ids):
                missing_blocked_by.append({
                    'task_id': task.id,
                    'task_status': task.status,
                    'draft_id': draft_id,
                })

        needs_blocked_status = []
        for task_id, draft_ids in sorted(self._blocked_by_draft_wrong_status.items()):
            task = self._task_by_id.get(task_id)
            if not task:
                continue
            for draft_id in sorted(draft_ids):
                needs_blocked_status.append({
                    'task_id': task.id,
                    'task_status': task.status,
                    'draft_id': draft_id,
                })

        return {
            'has_drafts': True,
            'draft_count': len(self._draft_ids),
            'drafts': drafts_info,
            'draft_unblockers': draft_unblockers,
            'downstream': downstream_info,
            'violations': {
                'missing_blocked_by': missing_blocked_by,
                'needs_blocked_status': needs_blocked_status,
            },
            'filtered_out_by_picker': [
                {
                    'task_id': task_id,
                    'draft_ids': sorted(list(draft_ids)),
                }
                for task_id, draft_ids in sorted(self._depends_on_draft_only.items())
            ],
        }

    def compute_effective_priorities(self) -> None:
        """
        Compute effective priority based on what each task blocks.

        A task inherits the MAX priority of:
        1. Its own declared priority
        2. All tasks it transitively blocks

        Priority ordering: P0 > P1 > P2 (numerically: 0 < 1 < 2)

        Modifies task.effective_priority and task.priority_reason in place
        for use in prioritization. These fields are runtime-only and never
        persisted to YAML.

        Example:
            TASK-A (P2) blocks TASK-B (P1) blocks TASK-C (P0)
            → TASK-A effective priority: P0 (inherits from C)
            → TASK-B effective priority: P0 (inherits from C)
            → TASK-C effective priority: P0 (own priority)
        """
        # Priority rank map: lower numeric value = higher priority
        PRIORITY_RANK = {"P0": 0, "P1": 1, "P2": 2}

        # Reset all effective priorities to declared priority
        for task in self.tasks:
            task.effective_priority = task.priority
            task.priority_reason = None

        # For each task, compute max priority of transitively blocked work
        for task in self.tasks:
            # Find what this task blocks (transitively)
            blocked_tasks = self.graph.find_transitively_blocked(task.id)

            if not blocked_tasks:
                continue  # No priority inheritance

            # Find max priority among blocked tasks (min numeric rank)
            blocked_priorities = [t.priority for t in blocked_tasks]
            max_blocked_priority = min(
                blocked_priorities,
                key=lambda p: PRIORITY_RANK.get(p, 999)
            )

            # If blocking higher-priority work, inherit that urgency
            task_rank = PRIORITY_RANK.get(task.priority, 999)
            blocked_rank = PRIORITY_RANK.get(max_blocked_priority, 999)

            if blocked_rank < task_rank:
                task.effective_priority = max_blocked_priority

                # Build audit trail: list all high-priority tasks blocked
                high_priority_tasks = [
                    t.id for t in blocked_tasks
                    if t.priority == max_blocked_priority
                ]
                task.priority_reason = (
                    f"Blocks {max_blocked_priority} work: " +
                    ", ".join(sorted(high_priority_tasks))
                )

    def _sort_key(self, task: Task) -> tuple:
        """
        Generate sort key for deterministic prioritization with effective priority.

        CRITICAL: Unblocker tasks are prioritized FIRST, before priority.
        Phase 2: Effective priority (inherited from blocked work) ranks before
        declared priority.

        Sort order:
        1. unblocker (0=true, 1=false) - MANUAL OVERRIDE
        2. status rank (blocked=0, in_progress=1, todo=2, draft=3, completed=4)
        3. effective priority rank (P0=0, P1=1, P2=2) - INHERITED FROM BLOCKED WORK
        4. order (lower first, None = 9999) - USER-SPECIFIED ORDERING
        5. declared priority rank (P0=0, P1=1, P2=2) - TIE-BREAKER
        6. task ID (lexicographic)

        Args:
            task: Task to generate key for

        Returns:
            Tuple for sorting
        """
        # Unblocker rank: 0 if manual unblocker flag set
        unblocker_rank = 0 if task.unblocker else 1

        # Status rank from constants
        status_rank = STATUS_RANK.get(task.status, DEFAULT_STATUS_RANK)

        # Effective priority rank: Use computed effective priority (Phase 2)
        # Falls back to declared priority if not computed
        effective_priority_rank = PRIORITY_RANK.get(
            task.effective_priority or task.priority,
            DEFAULT_PRIORITY_RANK
        )

        # Declared priority rank: Tie-breaker within same effective priority
        declared_priority_rank = PRIORITY_RANK.get(task.priority, DEFAULT_PRIORITY_RANK)

        # Order (None treated as 9999 for sorting)
        order = task.order if task.order is not None else 9999

        return (
            unblocker_rank,           # Manual unblocker override
            status_rank,              # Status-based urgency
            effective_priority_rank,  # Inherited from blocked work (Phase 2)
            order,                    # User-specified ordering
            declared_priority_rank,   # Tie-breaker
            task.id,                  # Deterministic tie-breaker
        )
