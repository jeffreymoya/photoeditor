"""
Dependency graph for task workflow.

Provides dependency resolution, cycle detection, missing dependency
validation, and topological readiness checks.

Key semantics (per proposal Section 3.5):
- blocked_by: Hard execution blockers (task cannot start until completed)
- depends_on: Informational dependencies (not enforced by readiness)
"""

from collections import deque
from typing import Dict, List, Set, Tuple

from .models import Task


class DependencyGraph:
    """Manages task dependency graph and validation."""

    def __init__(self, tasks: List[Task]):
        """
        Initialize dependency graph.

        Args:
            tasks: List of all tasks (including completed/archived)
        """
        self.tasks = tasks
        self.task_by_id = {task.id: task for task in tasks}

        # Build adjacency lists for blocked_by (hard blockers)
        self.blocked_by_edges: Dict[str, List[str]] = {}
        for task in tasks:
            self.blocked_by_edges[task.id] = task.blocked_by.copy()

        # Build adjacency list for depends_on (informational)
        self.depends_on_edges: Dict[str, List[str]] = {}
        for task in tasks:
            self.depends_on_edges[task.id] = task.depends_on.copy()

        # Phase 2: Build reverse adjacency list for priority propagation
        # Maps blocker_id → [task_ids that are blocked by it]
        self.reverse_blocked_by: Dict[str, List[str]] = {}
        for task in tasks:
            for blocker_id in task.blocked_by:
                if blocker_id not in self.reverse_blocked_by:
                    self.reverse_blocked_by[blocker_id] = []
                self.reverse_blocked_by[blocker_id].append(task.id)

    def detect_cycles(self) -> List[List[str]]:
        """
        Detect circular dependencies in blocked_by graph.

        Uses DFS with path tracking to find cycles.

        Returns:
            List of cycles, where each cycle is a list of task IDs forming a loop
        """
        cycles = []
        visited = set()
        rec_stack = set()
        path = []

        def dfs(task_id: str) -> bool:
            """
            DFS helper to detect cycles.

            Returns:
                True if cycle detected from this node
            """
            if task_id in rec_stack:
                # Found cycle - extract it from path
                cycle_start = path.index(task_id)
                cycle = path[cycle_start:] + [task_id]
                cycles.append(cycle)
                return True

            if task_id in visited:
                return False

            visited.add(task_id)
            rec_stack.add(task_id)
            path.append(task_id)

            # Visit blocked_by dependencies
            for dep_id in self.blocked_by_edges.get(task_id, []):
                if dep_id in self.task_by_id:  # Only follow existing tasks
                    dfs(dep_id)

            path.pop()
            rec_stack.remove(task_id)
            return False

        # Check all tasks as potential cycle entry points
        for task in self.tasks:
            if task.id not in visited:
                dfs(task.id)

        return cycles

    def missing_dependencies(self) -> Dict[str, List[str]]:
        """
        Find tasks with blocked_by or depends_on references that don't exist.

        Archive resolution: Completed tasks in docs/completed-tasks/ are NOT
        considered missing - they satisfy dependencies.

        Returns:
            Dictionary mapping task ID to list of missing dependency IDs
        """
        missing = {}

        for task in self.tasks:
            missing_deps = []

            # Check blocked_by dependencies
            for dep_id in task.blocked_by:
                if dep_id not in self.task_by_id:
                    missing_deps.append(dep_id)

            # Check depends_on dependencies
            for dep_id in task.depends_on:
                if dep_id not in self.task_by_id:
                    missing_deps.append(dep_id)

            if missing_deps:
                missing[task.id] = missing_deps

        return missing

    def topological_ready_set(self, completed_ids: Set[str]) -> List[Task]:
        """
        Get tasks that are ready to work on (all blocked_by dependencies completed).

        Implements Kahn's algorithm with lexicographically sorted ordering for
        deterministic results (per proposal Section 3.2).

        Only considers blocked_by dependencies - depends_on is informational only.

        Args:
            completed_ids: Set of task IDs with status 'completed'

        Returns:
            List of tasks where all blocked_by dependencies are completed,
            sorted lexicographically by task ID for determinism
        """
        # Build in-degree map (count of uncompleted blocked_by dependencies)
        in_degree = {}
        non_completed_tasks = []

        for task in self.tasks:
            # Skip already completed tasks
            if task.is_completed():
                continue

            non_completed_tasks.append(task)

            # Count uncompleted blockers
            uncompleted_blockers = 0
            for blocker_id in task.blocked_by:
                if blocker_id not in completed_ids:
                    uncompleted_blockers += 1

            in_degree[task.id] = uncompleted_blockers

        # Find all tasks with in-degree 0 (no uncompleted blockers)
        ready_tasks = [
            task for task in non_completed_tasks
            if in_degree[task.id] == 0
        ]

        # Sort lexicographically by task ID for deterministic ordering
        # This ensures byte-identical JSON output on repeated runs
        ready_tasks.sort(key=lambda t: t.id)

        return ready_tasks

    def get_blockers(self, task_id: str) -> Dict[str, List[str]]:
        """
        Get all dependencies (blocked_by and depends_on) for a task.

        Args:
            task_id: Task ID to query

        Returns:
            Dictionary with 'blocked_by' and 'depends_on' lists
        """
        return {
            'blocked_by': self.blocked_by_edges.get(task_id, []),
            'depends_on': self.depends_on_edges.get(task_id, []),
        }

    def validate(self) -> Tuple[bool, List[str]]:
        """
        Run all validation checks on the dependency graph.

        Returns:
            Tuple of (is_valid, error_messages)
        """
        errors = []

        # Check for cycles
        cycles = self.detect_cycles()
        if cycles:
            for cycle in cycles:
                cycle_str = ' -> '.join(cycle)
                errors.append(f"Circular dependency detected: {cycle_str}")

        # Check for missing dependencies
        missing = self.missing_dependencies()
        if missing:
            for task_id, missing_deps in missing.items():
                deps_str = ', '.join(missing_deps)
                errors.append(
                    f"Task {task_id} references non-existent dependencies: {deps_str}"
                )

        # Check for duplicate task IDs (should never happen with dict, but validate)
        task_ids = [task.id for task in self.tasks]
        duplicates = {tid for tid in task_ids if task_ids.count(tid) > 1}
        if duplicates:
            for dup_id in duplicates:
                errors.append(f"Duplicate task ID: {dup_id}")

        is_valid = len(errors) == 0
        return is_valid, errors

    def compute_dependency_closure(self, task_id: str) -> Dict[str, Set[str]]:
        """
        Compute full dependency closure for a task.

        Returns both direct and transitive dependencies, separated by type:
        - blocking: blocked_by dependencies (hard blockers)
        - artifacts: depends_on dependencies (informational)
        - transitive: All transitive dependencies (union of both)

        Args:
            task_id: Task ID to compute closure for

        Returns:
            Dictionary with 'blocking', 'artifacts', 'transitive' sets of task IDs

        Example:
            If TASK-A blocked_by [TASK-B], TASK-B blocked_by [TASK-C]:
            closure['blocking'] = {TASK-B, TASK-C}
            closure['transitive'] = {TASK-B, TASK-C}
        """
        closure = {
            'blocking': set(),    # blocked_by (hard blockers)
            'artifacts': set(),   # depends_on (informational)
            'transitive': set()   # All transitive dependencies
        }

        # Validate task exists
        if task_id not in self.task_by_id:
            return closure

        # Track visited nodes to prevent infinite loops
        visited_blocking = set()
        visited_artifacts = set()

        def traverse_blocking(tid: str):
            """Recursively traverse blocked_by edges."""
            if tid in visited_blocking or tid not in self.task_by_id:
                return

            visited_blocking.add(tid)

            # Add all blocked_by dependencies
            for dep_id in self.blocked_by_edges.get(tid, []):
                if dep_id in self.task_by_id:  # Only follow existing tasks
                    closure['blocking'].add(dep_id)
                    closure['transitive'].add(dep_id)
                    # Recursively traverse
                    traverse_blocking(dep_id)

        def traverse_artifacts(tid: str):
            """Recursively traverse depends_on edges."""
            if tid in visited_artifacts or tid not in self.task_by_id:
                return

            visited_artifacts.add(tid)

            # Add all depends_on dependencies
            for dep_id in self.depends_on_edges.get(tid, []):
                if dep_id in self.task_by_id:  # Only follow existing tasks
                    closure['artifacts'].add(dep_id)
                    closure['transitive'].add(dep_id)
                    # Recursively traverse
                    traverse_artifacts(dep_id)

        # Start traversal from the given task
        traverse_blocking(task_id)
        traverse_artifacts(task_id)

        return closure

    def find_transitively_blocked(self, task_id: str) -> List[Task]:
        """
        Find all tasks that are transitively blocked by this task.

        Traverses the dependency graph in REVERSE: if task_id appears in
        another task's blocked_by, that task is directly blocked. Recursively
        traverses to find all downstream tasks.

        Uses BFS with visited set to handle diamond dependencies correctly
        and prevent infinite loops (even though cycles are validated elsewhere).

        Args:
            task_id: Task ID to find downstream blocked tasks for

        Returns:
            List of Task objects that are directly or transitively blocked
            by this task. Empty list if task blocks nothing.

        Example:
            TASK-A blocks TASK-B, TASK-B blocks TASK-C
            find_transitively_blocked("TASK-A") → [TASK-B, TASK-C]
        """
        blocked = []
        blocked_ids = set()  # Track IDs to prevent duplicates
        queue = deque([task_id])
        visited = {task_id}

        while queue:
            current_id = queue.popleft()  # O(1) with deque, not list.pop(0)

            # Find tasks directly blocked by current task
            for blocked_id in self.reverse_blocked_by.get(current_id, []):
                if blocked_id not in visited:
                    visited.add(blocked_id)
                    queue.append(blocked_id)

                    # Add to result list (only if task exists and not already added)
                    if blocked_id in self.task_by_id and blocked_id not in blocked_ids:
                        blocked_ids.add(blocked_id)
                        blocked.append(self.task_by_id[blocked_id])

        return blocked

    def export_dot(self) -> str:
        """
        Export dependency graph in Graphviz DOT format.

        Node styling:
        - Color by status: completed=green, in_progress=yellow, blocked=red, todo=gray
        - Unblocker tasks have double border and bold label
        - Node label includes task ID and priority

        Edge styling:
        - Solid arrows for blocked_by (hard blockers)
        - Dashed arrows for depends_on (informational)

        Returns:
            DOT format string suitable for rendering with Graphviz
        """
        lines = ['digraph task_dependencies {']
        lines.append('  rankdir=LR;')  # Left to right layout
        lines.append('  node [shape=box, style=filled];')
        lines.append('')

        # Define nodes with styling
        for task in self.tasks:
            # Determine color based on status
            status_colors = {
                'completed': 'lightgreen',
                'in_progress': 'lightyellow',
                'blocked': 'lightcoral',
                'draft': 'aliceblue',
                'todo': 'lightgray',
            }
            color = status_colors.get(task.status, 'white')

            # Build node label
            label = f"{task.id}\\n{task.priority}"
            if task.unblocker:
                label += "\\n[UNBLOCKER]"

            # Build node attributes
            attrs = [f'label="{label}"', f'fillcolor="{color}"']

            # Unblockers get special styling
            if task.unblocker:
                attrs.append('peripheries=2')  # Double border
                attrs.append('fontweight=bold')

            attrs_str = ', '.join(attrs)
            lines.append(f'  "{task.id}" [{attrs_str}];')

        lines.append('')

        # Define edges for blocked_by (solid)
        lines.append('  // blocked_by edges (hard blockers)')
        for task in self.tasks:
            for dep_id in task.blocked_by:
                # Solid arrow: dependency blocks this task
                lines.append(f'  "{dep_id}" -> "{task.id}" [style=solid, color=black];')

        lines.append('')

        # Define edges for depends_on (dashed)
        lines.append('  // depends_on edges (informational)')
        for task in self.tasks:
            for dep_id in task.depends_on:
                # Dashed arrow: task depends on this for context
                lines.append(f'  "{dep_id}" -> "{task.id}" [style=dashed, color=gray];')

        lines.append('}')
        return '\n'.join(lines)
