"""
Constants for task workflow including status and priority enums.

Status and priority ranks are defined to support deterministic prioritization
per standards/task-breakdown-canon.md and the prioritization algorithm in
docs/proposals/task-workflow-python-refactor.md Section 3.2.
"""

from enum import Enum
from typing import Dict


class TaskStatus(str, Enum):
    """Valid task status values per standards/task-breakdown-canon.md."""
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    COMPLETED = "completed"


class TaskPriority(str, Enum):
    """Valid task priority values."""
    P0 = "P0"
    P1 = "P1"
    P2 = "P2"


# Status ranking for prioritization
# Lower rank = higher priority
# blocked tasks surfaced first for manual intervention
# in_progress tasks resume before starting new work
# todo tasks are new work
STATUS_RANK: Dict[str, int] = {
    TaskStatus.BLOCKED: 0,       # Surface for manual intervention
    TaskStatus.IN_PROGRESS: 1,   # Resume existing work
    TaskStatus.TODO: 2,          # New work
    TaskStatus.COMPLETED: 3,     # Archived/done
}

# Priority ranking for prioritization
# Lower rank = higher priority
PRIORITY_RANK: Dict[str, int] = {
    TaskPriority.P0: 0,
    TaskPriority.P1: 1,
    TaskPriority.P2: 2,
}

# Default ranks for unknown values (avoids KeyError, lower priority)
DEFAULT_STATUS_RANK = 99
DEFAULT_PRIORITY_RANK = 99

# Cache schema version
CACHE_VERSION = 1

# Snapshot tracking for audit trail
SNAPSHOT_COUNTER_FILE = "tasks/.cache/snapshot_counter.txt"
