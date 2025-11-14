"""
Task operations for status transitions and file management.

Provides safe, atomic operations for updating task status, archiving
completed tasks, and managing task lifecycle with proper validation.

Per proposal Section 3.6: CLI-managed operations ensure consistency
and provide audit trail for task state transitions.
"""

import shutil
import sys
from pathlib import Path
from typing import Optional

from ruamel.yaml import YAML

from .models import Task
from .notify import get_notification_service


class TaskOperationError(Exception):
    """Raised when a task operation fails validation or execution."""
    pass


class TaskOperations:
    """Manages task lifecycle operations (claim, complete, transition)."""

    def __init__(self, repo_root: Path):
        """
        Initialize task operations manager.

        Args:
            repo_root: Repository root directory path
        """
        self.repo_root = repo_root
        self.tasks_dir = repo_root / "tasks"
        self.archive_dir = repo_root / "docs" / "completed-tasks"
        self.yaml = YAML()
        self.yaml.preserve_quotes = True
        self.yaml.default_flow_style = False

    def claim_task(self, task: Task) -> Path:
        """
        Claim a task (transition to in_progress status).

        Validates that task is in 'todo' or 'blocked' status before claiming.

        Args:
            task: Task to claim

        Returns:
            Updated file path (same as original)

        Raises:
            TaskOperationError: If task cannot be claimed
        """
        # Validate current status
        if task.status == 'draft':
            raise TaskOperationError(
                f"Cannot claim task {task.id}: status is 'draft'. "
                f"Resolve clarifications, attach evidence, and transition to 'todo' first."
            )

        if task.status not in ('todo', 'blocked'):
            raise TaskOperationError(
                f"Cannot claim task {task.id}: status is '{task.status}'. "
                f"Only 'todo' or 'blocked' tasks can be claimed."
            )

        # Update status in YAML file
        self._update_status(task.path, 'in_progress')

        return Path(task.path)

    def complete_task(self, task: Task, archive: bool = True) -> Path:
        """
        Complete a task and optionally archive it.

        Transitions task to 'completed' status and moves file to
        docs/completed-tasks/ (per user preference).

        Args:
            task: Task to complete
            archive: Whether to move file to archive directory (default: True)

        Returns:
            Final file path (in archive if moved, else original location)

        Raises:
            TaskOperationError: If task cannot be completed
        """
        # Validate task is not already completed
        if task.status == 'completed':
            raise TaskOperationError(
                f"Task {task.id} is already completed"
            )

        # Validate task is not in draft status
        if task.status == 'draft':
            raise TaskOperationError(
                f"Cannot complete task {task.id}: status is 'draft'. "
                f"Resolve clarifications, attach evidence, and transition to 'todo' first."
            )

        # Update status to completed
        task_path = Path(task.path)
        self._update_status(str(task_path), 'completed')

        # Archive if requested
        if archive:
            result_path = self._archive_task(task_path, task.id)
        else:
            result_path = task_path

        # Send success notification
        notifier = get_notification_service()
        notifier.notify_success(
            task_id=task.id,
            title=getattr(task, 'title', 'Task completed')
        )

        # Purge context after successful completion + notification (Phase 2 lifecycle hook)
        try:
            from .context_store import TaskContextStore
            context_store = TaskContextStore(self.repo_root)
            context_store.purge_context(task.id)
        except Exception as e:
            # Non-fatal: log warning but don't fail completion
            print(f"Warning: Failed to purge context for {task.id}: {e}", file=sys.stderr)

        return result_path

    def archive_task(self, task: Task) -> Path:
        """
        Archive a completed task without changing its status.

        Useful when a task was manually marked completed but the file
        was not moved to docs/completed-tasks/.

        Args:
            task: Task to archive

        Returns:
            Final file path in archive directory (or original path if already archived)

        Raises:
            TaskOperationError: If task cannot be archived
        """
        task_path = Path(task.path)

        if not task_path.exists():
            raise TaskOperationError(
                f"Task file not found: {task_path}"
            )

        # If already in archive directory, treat as no-op
        if self._is_in_archive(task_path):
            return task_path

        # Ensure task status is completed (both cached model and on-disk YAML)
        if task.status != 'completed':
            raise TaskOperationError(
                f"Cannot archive task {task.id}: status is '{task.status}'. "
                f"Only completed tasks can be archived."
            )

        try:
            with open(task_path, 'r', encoding='utf-8') as f:
                data = self.yaml.load(f)
        except Exception as e:
            raise TaskOperationError(
                f"Failed to read task file {task_path}: {e}"
            ) from e

        file_status = data.get('status')
        if file_status != 'completed':
            raise TaskOperationError(
                f"Cannot archive task {task.id}: file status is '{file_status}'. "
                f"Resolve status before archiving."
            )

        return self._archive_task(task_path, task.id)

    def transition_status(
        self,
        task: Task,
        to_status: str,
        validate: bool = True
    ) -> Path:
        """
        Transition task to a new status.

        Args:
            task: Task to transition
            to_status: Target status (todo, in_progress, blocked, completed)
            validate: Whether to validate transition is allowed (default: True)

        Returns:
            Updated file path

        Raises:
            TaskOperationError: If transition is invalid
        """
        # Validate status value
        valid_statuses = ('draft', 'todo', 'in_progress', 'blocked', 'completed')
        if to_status not in valid_statuses:
            raise TaskOperationError(
                f"Invalid status '{to_status}'. Must be one of: {valid_statuses}"
            )

        # Validate transition if requested
        if validate:
            self._validate_transition(task.status, to_status)

        # Update status
        self._update_status(task.path, to_status)

        return Path(task.path)

    def _validate_transition(self, from_status: str, to_status: str) -> None:
        """
        Validate status transition is allowed.

        Canonical transitions (per proposal):
        - todo → in_progress, blocked
        - in_progress → completed, blocked, todo
        - blocked → todo, in_progress
        - completed → (no transitions allowed)

        Args:
            from_status: Current status
            to_status: Target status

        Raises:
            TaskOperationError: If transition is not allowed
        """
        # No transitions from completed
        if from_status == 'completed':
            raise TaskOperationError(
                f"Cannot transition from 'completed' to '{to_status}'. "
                f"Completed tasks cannot be reopened."
            )

        # Same status is no-op (but allowed)
        if from_status == to_status:
            return

        # From draft, only allow staying draft, moving to todo, or blocked
        if from_status == 'draft' and to_status not in ('draft', 'todo', 'blocked'):
            raise TaskOperationError(
                "Draft tasks can only transition to 'todo' or 'blocked' after clarifications are resolved."
            )

        # All other transitions are allowed (flexible workflow)
        # This aligns with solo-developer needs where blocked tasks
        # can be manually marked todo, etc.

    def _update_status(self, file_path: str, new_status: str) -> None:
        """
        Update status field in task YAML file.

        Uses ruamel.yaml to preserve comments and formatting.

        Args:
            file_path: Path to task YAML file
            new_status: New status value

        Raises:
            TaskOperationError: If file cannot be read/written
        """
        path = Path(file_path)

        if not path.exists():
            raise TaskOperationError(f"Task file not found: {file_path}")

        try:
            # Load YAML preserving structure
            with open(path, 'r', encoding='utf-8') as f:
                data = self.yaml.load(f)

            # Update status field
            data['status'] = new_status

            # Write back atomically (temp file + rename)
            temp_path = path.with_suffix('.tmp')
            with open(temp_path, 'w', encoding='utf-8') as f:
                self.yaml.dump(data, f)

            # Atomic rename
            temp_path.replace(path)

        except Exception as e:
            raise TaskOperationError(
                f"Failed to update status in {file_path}: {e}"
            ) from e

    def _archive_task(self, task_path: Path, task_id: str) -> Path:
        """
        Move task file to archive directory.

        Args:
            task_path: Current task file path
            task_id: Task ID for error messages

        Returns:
            New path in archive directory

        Raises:
            TaskOperationError: If move fails
        """
        # Ensure archive directory exists
        self.archive_dir.mkdir(parents=True, exist_ok=True)

        # Determine destination path
        dest_path = self.archive_dir / task_path.name

        # Check for conflicts
        if dest_path.exists():
            raise TaskOperationError(
                f"Archive destination already exists: {dest_path}. "
                f"Task {task_id} may already be archived."
            )

        try:
            # Move file
            shutil.move(str(task_path), str(dest_path))
            return dest_path

        except Exception as e:
            raise TaskOperationError(
                f"Failed to archive task {task_id} to {dest_path}: {e}"
            ) from e

    def _is_in_archive(self, task_path: Path) -> bool:
        """Return True if path already resides within the archive directory."""
        try:
            task_path.resolve().relative_to(self.archive_dir.resolve())
            return True
        except ValueError:
            return False


def claim_task_cli(repo_root: Path, task: Task) -> None:
    """
    CLI wrapper for claim operation with user feedback.

    Args:
        repo_root: Repository root path
        task: Task to claim
    """
    ops = TaskOperations(repo_root)
    try:
        result_path = ops.claim_task(task)
        print(f"✓ Claimed task {task.id}")
        print(f"  Status: todo → in_progress")
        print(f"  File: {result_path}")
    except TaskOperationError as e:
        # Send error notification
        notifier = get_notification_service()
        notifier.notify_error(
            task_id=task.id,
            title=getattr(task, 'title', 'Unknown task'),
            error_message=str(e)
        )
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


def complete_task_cli(repo_root: Path, task: Task, archive: bool = True) -> None:
    """
    CLI wrapper for complete operation with user feedback.

    Args:
        repo_root: Repository root path
        task: Task to complete
        archive: Whether to archive (default: True)
    """
    ops = TaskOperations(repo_root)
    try:
        result_path = ops.complete_task(task, archive=archive)

        print(f"✓ Completed task {task.id}")
        print(f"  Status: {task.status} → completed")

        if archive:
            print(f"  Archived to: {result_path}")
        else:
            print(f"  File: {result_path}")

    except TaskOperationError as e:
        # Send error notification
        notifier = get_notification_service()
        notifier.notify_error(
            task_id=task.id,
            title=getattr(task, 'title', 'Unknown task'),
            error_message=str(e)
        )
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
