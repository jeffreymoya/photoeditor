"""
Task model for the task workflow CLI.

Defines the Task dataclass that represents a parsed .task.yaml file
with all metadata needed for prioritization, dependency resolution,
and workflow management.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional


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


@dataclass(frozen=True)
class RetryPolicy:
    """
    Retry policy for validation commands.

    Attributes:
        max_attempts: Maximum number of execution attempts (1-5)
        backoff_ms: Delay between retries in milliseconds
    """
    max_attempts: int = 1
    backoff_ms: int = 1000

    def __post_init__(self):
        """Validate retry policy constraints."""
        if not 1 <= self.max_attempts <= 5:
            raise ValueError(f"max_attempts must be 1-5, got {self.max_attempts}")
        if self.backoff_ms < 0:
            raise ValueError(f"backoff_ms must be >= 0, got {self.backoff_ms}")


@dataclass(frozen=True)
class ValidationCommand:
    """
    Represents a validation command from task YAML validation.pipeline.

    Supports rich schema per Section 2 of task-context-cache-hardening-schemas.md.

    Attributes:
        id: Unique validation command ID (e.g., val-001)
        command: Shell command to execute
        description: Human-readable purpose
        cwd: Working directory relative to repo root
        package: Package scope for turbo commands (e.g., @photoeditor/backend)
        env: Environment variables to export before execution
        expected_paths: Paths that must exist before command runs (glob patterns supported)
        blocker_id: Task ID blocking this validation (skip if open)
        timeout_ms: Command timeout in milliseconds (1000-600000)
        retry_policy: Retry configuration
        criticality: Failure impact (required, recommended, optional)
        expected_exit_codes: Exit codes considered success
    """
    id: str
    command: str
    description: str
    cwd: str = "."
    package: Optional[str] = None
    env: Dict[str, str] = field(default_factory=dict)
    expected_paths: List[str] = field(default_factory=list)
    blocker_id: Optional[str] = None
    timeout_ms: int = 120000
    retry_policy: RetryPolicy = field(default_factory=RetryPolicy)
    criticality: str = "required"
    expected_exit_codes: List[int] = field(default_factory=lambda: [0])

    def __post_init__(self):
        """Validate ValidationCommand constraints."""
        # Validate ID format (val-001, val-002, etc.)
        import re
        if not re.match(r'^val-[0-9]{3}$', self.id):
            raise ValueError(f"id must match pattern 'val-NNN', got {self.id!r}")

        # Validate description length
        if len(self.description) > 200:
            raise ValueError(f"description exceeds 200 chars: {len(self.description)}")

        # Validate timeout
        if not 1000 <= self.timeout_ms <= 600000:
            raise ValueError(f"timeout_ms must be 1000-600000, got {self.timeout_ms}")

        # Validate criticality
        valid_criticalities = {"required", "recommended", "optional"}
        if self.criticality not in valid_criticalities:
            raise ValueError(
                f"criticality must be one of {valid_criticalities}, got {self.criticality!r}"
            )

        # Validate blocker_id format if present
        if self.blocker_id is not None:
            if not re.match(r'^TASK-[0-9]{4}$', self.blocker_id):
                raise ValueError(
                    f"blocker_id must match pattern 'TASK-NNNN', got {self.blocker_id!r}"
                )

    def __repr__(self) -> str:
        """String representation for debugging."""
        return (
            f"ValidationCommand(id={self.id!r}, command={self.command[:40]!r}..., "
            f"criticality={self.criticality!r})"
        )


# Enum constants for exception ledger and quarantine models
EXCEPTION_TYPES = ['malformed_yaml', 'missing_standards', 'empty_acceptance_criteria', 'invalid_schema']
REMEDIATION_STATUSES = ['open', 'in_progress', 'resolved', 'wont_fix']
AUTO_REMOVE_TRIGGERS = ['task_completion', 'task_deletion', 'manual']
QUARANTINE_REASONS = ['malformed_yaml', 'validation_failed', 'corrupted_context', 'manual']
REPAIR_STATUSES = ['pending', 'in_progress', 'repaired', 'cannot_repair']


@dataclass(frozen=True)
class RemediationStatus:
    """
    Remediation status for exception ledger entries.

    Attributes:
        owner: GitHub username or 'system'
        status: Current remediation status (open, in_progress, resolved, wont_fix)
        deadline: Target resolution date (ISO 8601 date string, optional)
        notes: Additional notes about remediation
        resolved_at: Timestamp when resolved (ISO 8601 datetime string, optional)
    """
    owner: str
    status: str
    deadline: Optional[str] = None
    notes: Optional[str] = None
    resolved_at: Optional[str] = None

    def __post_init__(self):
        """Validate RemediationStatus constraints."""
        if self.status not in REMEDIATION_STATUSES:
            raise ValueError(
                f"status must be one of {REMEDIATION_STATUSES}, got {self.status!r}"
            )

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        result = {
            "owner": self.owner,
            "status": self.status
        }
        if self.deadline is not None:
            result["deadline"] = self.deadline
        if self.notes is not None:
            result["notes"] = self.notes
        if self.resolved_at is not None:
            result["resolved_at"] = self.resolved_at
        return result

    @classmethod
    def from_dict(cls, data: dict) -> "RemediationStatus":
        """Create RemediationStatus from dictionary."""
        return cls(
            owner=data["owner"],
            status=data["status"],
            deadline=data.get("deadline"),
            notes=data.get("notes"),
            resolved_at=data.get("resolved_at")
        )


@dataclass(frozen=True)
class ExceptionLedgerEntry:
    """
    Exception ledger entry for tracking task validation exceptions.

    Per schemas doc Section 3.1, tracks tasks that fail validation but are
    allowed to proceed with suppressed warnings.

    Attributes:
        task_id: Task identifier (TASK-NNNN format)
        exception_type: Type of exception (malformed_yaml, missing_standards, etc.)
        detected_at: ISO 8601 timestamp when exception was detected
        parse_error: Detailed error message from parser (optional)
        suppressed_warnings: List of warning messages suppressed for this task
        remediation: Remediation status and ownership
        auto_remove_on: Condition for automatic removal (task_completion, task_deletion, manual)
    """
    task_id: str
    exception_type: str
    detected_at: str
    remediation: RemediationStatus
    parse_error: Optional[str] = None
    suppressed_warnings: List[str] = field(default_factory=list)
    auto_remove_on: str = "task_completion"

    def __post_init__(self):
        """Validate ExceptionLedgerEntry constraints."""
        import re

        # Validate task_id format
        if not re.match(r'^TASK-[0-9]{4}$', self.task_id):
            raise ValueError(
                f"task_id must match pattern 'TASK-NNNN', got {self.task_id!r}"
            )

        # Validate exception_type
        if self.exception_type not in EXCEPTION_TYPES:
            raise ValueError(
                f"exception_type must be one of {EXCEPTION_TYPES}, got {self.exception_type!r}"
            )

        # Validate auto_remove_on
        if self.auto_remove_on not in AUTO_REMOVE_TRIGGERS:
            raise ValueError(
                f"auto_remove_on must be one of {AUTO_REMOVE_TRIGGERS}, got {self.auto_remove_on!r}"
            )

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        result = {
            "task_id": self.task_id,
            "exception_type": self.exception_type,
            "detected_at": self.detected_at,
            "remediation": self.remediation.to_dict(),
            "suppressed_warnings": self.suppressed_warnings,
            "auto_remove_on": self.auto_remove_on
        }
        if self.parse_error is not None:
            result["parse_error"] = self.parse_error
        return result

    @classmethod
    def from_dict(cls, data: dict) -> "ExceptionLedgerEntry":
        """Create ExceptionLedgerEntry from dictionary."""
        return cls(
            task_id=data["task_id"],
            exception_type=data["exception_type"],
            detected_at=data["detected_at"],
            remediation=RemediationStatus.from_dict(data["remediation"]),
            parse_error=data.get("parse_error"),
            suppressed_warnings=data.get("suppressed_warnings", []),
            auto_remove_on=data.get("auto_remove_on", "task_completion")
        )


@dataclass(frozen=True)
class QuarantineEntry:
    """
    Quarantine entry for tasks with critical validation failures.

    Per schemas doc Section 9.2, tracks tasks moved to quarantine due to
    malformed YAML, validation failures, or corrupted context.

    Attributes:
        task_id: Task identifier (TASK-NNNN format)
        quarantined_at: ISO 8601 timestamp when task was quarantined
        reason: Quarantine reason (malformed_yaml, validation_failed, etc.)
        original_path: Original task file path before quarantine
        error_details: Detailed error message (optional)
        auto_repair_attempted: Whether auto-repair was attempted
        repair_status: Current repair status (pending, in_progress, repaired, cannot_repair)
        repair_notes: Notes about repair attempts (optional)
        resolved_at: ISO 8601 timestamp when resolved (optional)
    """
    task_id: str
    quarantined_at: str
    reason: str
    original_path: str
    error_details: Optional[str] = None
    auto_repair_attempted: bool = False
    repair_status: str = "pending"
    repair_notes: Optional[str] = None
    resolved_at: Optional[str] = None

    def __post_init__(self):
        """Validate QuarantineEntry constraints."""
        import re

        # Validate task_id format
        if not re.match(r'^TASK-[0-9]{4}$', self.task_id):
            raise ValueError(
                f"task_id must match pattern 'TASK-NNNN', got {self.task_id!r}"
            )

        # Validate reason
        if self.reason not in QUARANTINE_REASONS:
            raise ValueError(
                f"reason must be one of {QUARANTINE_REASONS}, got {self.reason!r}"
            )

        # Validate repair_status
        if self.repair_status not in REPAIR_STATUSES:
            raise ValueError(
                f"repair_status must be one of {REPAIR_STATUSES}, got {self.repair_status!r}"
            )

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        result = {
            "task_id": self.task_id,
            "quarantined_at": self.quarantined_at,
            "reason": self.reason,
            "original_path": self.original_path,
            "auto_repair_attempted": self.auto_repair_attempted,
            "repair_status": self.repair_status
        }
        if self.error_details is not None:
            result["error_details"] = self.error_details
        if self.repair_notes is not None:
            result["repair_notes"] = self.repair_notes
        if self.resolved_at is not None:
            result["resolved_at"] = self.resolved_at
        return result

    @classmethod
    def from_dict(cls, data: dict) -> "QuarantineEntry":
        """Create QuarantineEntry from dictionary."""
        return cls(
            task_id=data["task_id"],
            quarantined_at=data["quarantined_at"],
            reason=data["reason"],
            original_path=data["original_path"],
            error_details=data.get("error_details"),
            auto_repair_attempted=data.get("auto_repair_attempted", False),
            repair_status=data.get("repair_status", "pending"),
            repair_notes=data.get("repair_notes"),
            resolved_at=data.get("resolved_at")
        )
