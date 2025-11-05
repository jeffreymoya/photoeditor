"""
Task model for the task workflow CLI.

Defines the Task dataclass that represents a parsed .task.yaml file
with all metadata needed for prioritization, dependency resolution,
and workflow management.
"""

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class Task:
    """
    Represents a single task from a .task.yaml file.

    Attributes:
        id: Unique task identifier (e.g., TASK-0824)
        title: Human-readable task title
        status: Current task status (draft, todo, in_progress, blocked, completed)
        priority: Task priority (P0, P1, P2)
        area: Task area/category (e.g., mobile, backend, infra)
        path: Absolute file path to the .task.yaml file
        schema_version: Task schema version (e.g., "1.0", "1.1")
        unblocker: Whether this task unblocks other tasks (prioritized first)
        order: Optional ordering within same priority/status
        blocked_by: List of task IDs that block this task (hard blockers)
        depends_on: List of task IDs this depends on (informational only)
        blocked_reason: Optional reason why task is blocked (required when status=blocked)
        mtime: File modification time (Unix timestamp)
        hash: File content hash for cache invalidation
    """

    id: str
    title: str
    status: str
    priority: str
    area: str
    path: str
    schema_version: str = "1.0"  # Default to 1.0 for backward compatibility
    unblocker: bool = False
    order: Optional[int] = None
    blocked_by: List[str] = field(default_factory=list)
    depends_on: List[str] = field(default_factory=list)
    blocked_reason: Optional[str] = None
    mtime: float = 0.0
    hash: str = ""

    # Phase 2: Runtime-only fields for effective priority propagation
    # (NOT serialized to YAML, recomputed fresh on every CLI invocation)
    effective_priority: Optional[str] = field(default=None, init=False, repr=False)
    priority_reason: Optional[str] = field(default=None, init=False, repr=False)

    def is_ready(self, completed_ids: set) -> bool:
        """
        Check if task is ready to be worked on.

        A task is ready if all hard blockers (blocked_by) are completed.
        The depends_on field is informational and does not block execution.

        Args:
            completed_ids: Set of task IDs with status 'completed'

        Returns:
            True if all blocked_by dependencies are in completed_ids
        """
        return all(dep_id in completed_ids for dep_id in self.blocked_by)

    def is_completed(self) -> bool:
        """Check if task has completed status."""
        return self.status == "completed"

    def __repr__(self) -> str:
        """String representation for debugging."""
        blockers = f"blocked_by={self.blocked_by}" if self.blocked_by else ""
        deps = f"depends_on={self.depends_on}" if self.depends_on else ""
        return (
            f"Task(id={self.id!r}, status={self.status!r}, "
            f"priority={self.priority!r}, unblocker={self.unblocker}, {blockers} {deps})"
        ).strip()
