"""
Quarantine operations module for managing task failures and repairs.

This module provides functions to quarantine tasks with critical validation failures,
track repair attempts, and manage the quarantine lifecycle. Tasks are quarantined when
they have malformed YAML, validation failures, or corrupted context.

Directory structure:
    docs/compliance/quarantine/
        TASK-XXXX.quarantine.json       # Individual quarantine entries
        index.json                       # Fast lookup index
        resolved/                        # Archived resolved entries
"""

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from filelock import FileLock

from .models import QuarantineEntry

# Quarantine directory location
QUARANTINE_DIR = Path('docs/compliance/quarantine')


def quarantine_task(
    task_id: str,
    reason: str,
    error_details: Optional[str],
    repo_root: Path
) -> Path:
    """
    Move task to quarantine and record in index.

    Args:
        task_id: Task identifier (TASK-NNNN format)
        reason: Quarantine reason (malformed_yaml, validation_failed, corrupted_context, manual)
        error_details: Detailed error message (optional)
        repo_root: Repository root path

    Returns:
        Path to created quarantine entry file

    Raises:
        ValueError: If task_id or reason format is invalid
    """
    # Ensure quarantine directory exists
    quarantine_dir = repo_root / QUARANTINE_DIR
    quarantine_dir.mkdir(parents=True, exist_ok=True)

    # Create QuarantineEntry with validation
    entry = QuarantineEntry(
        task_id=task_id,
        quarantined_at=datetime.now(timezone.utc).isoformat(),
        reason=reason,
        original_path=f"tasks/{task_id}.task.yaml",
        error_details=error_details,
        auto_repair_attempted=False,
        repair_status="pending"
    )

    # Write quarantine entry file
    entry_path = quarantine_dir / f"{task_id}.quarantine.json"
    entry_path.write_text(json.dumps(entry.to_dict(), indent=2, sort_keys=True))

    # Update index atomically using file lock
    index_path = quarantine_dir / "index.json"
    lock_path = quarantine_dir / "index.json.lock"

    with FileLock(str(lock_path), timeout=10):
        # Load or create index
        if index_path.exists():
            index = json.loads(index_path.read_text())
        else:
            index = {"quarantined_tasks": []}

        # Add to index if not already present (idempotent)
        if task_id not in index["quarantined_tasks"]:
            index["quarantined_tasks"].append(task_id)

        # Write index with sorted keys
        index_path.write_text(json.dumps(index, indent=2, sort_keys=True))

    return entry_path


def is_quarantined(task_id: str, repo_root: Optional[Path] = None) -> bool:
    """
    Check if task is currently in quarantine.

    Performs fast lookup using index.json without reading individual entries.

    Args:
        task_id: Task identifier (TASK-NNNN format)
        repo_root: Repository root path (defaults to cwd)

    Returns:
        True if task is quarantined, False otherwise
    """
    if repo_root is None:
        repo_root = Path.cwd()

    index_path = repo_root / QUARANTINE_DIR / "index.json"

    if not index_path.exists():
        return False

    index = json.loads(index_path.read_text())
    return task_id in index.get("quarantined_tasks", [])


def attempt_auto_repair(task_id: str, repo_root: Optional[Path] = None) -> bool:
    """
    Attempt automatic repair of quarantined task.

    NOTE: Auto-repair implementation is deferred to a future session.
    This function currently serves as a placeholder and always returns False.

    Full implementation will include:
    - YAML syntax repair (indentation, quoting)
    - Schema validation fixes
    - Context cache regeneration

    Args:
        task_id: Task identifier (TASK-NNNN format)
        repo_root: Repository root path (defaults to cwd)

    Returns:
        False (auto-repair not yet implemented)
    """
    # Placeholder implementation - auto-repair deferred per specifications
    # Future implementation will:
    # 1. Load quarantine entry
    # 2. Determine repair strategy based on reason
    # 3. Attempt repair (YAML fixing, schema validation, context rebuild)
    # 4. Update entry with repair_status and repair_notes
    # 5. Return True if successful, False otherwise
    return False


def release_from_quarantine(task_id: str, repo_root: Optional[Path] = None) -> None:
    """
    Release task from quarantine after manual repair.

    Moves quarantine entry to resolved/ subdirectory and updates index.

    Args:
        task_id: Task identifier (TASK-NNNN format)
        repo_root: Repository root path (defaults to cwd)

    Raises:
        FileNotFoundError: If quarantine entry does not exist
    """
    if repo_root is None:
        repo_root = Path.cwd()

    quarantine_dir = repo_root / QUARANTINE_DIR
    entry_path = quarantine_dir / f"{task_id}.quarantine.json"

    if not entry_path.exists():
        raise FileNotFoundError(f"Quarantine entry not found: {entry_path}")

    # Create resolved archive directory
    resolved_dir = quarantine_dir / "resolved"
    resolved_dir.mkdir(exist_ok=True)

    # Move entry to resolved/
    shutil.move(str(entry_path), str(resolved_dir / entry_path.name))

    # Update index atomically
    index_path = quarantine_dir / "index.json"
    lock_path = quarantine_dir / "index.json.lock"

    with FileLock(str(lock_path), timeout=10):
        if index_path.exists():
            index = json.loads(index_path.read_text())

            # Remove from quarantined_tasks list
            index["quarantined_tasks"] = [
                t for t in index.get("quarantined_tasks", [])
                if t != task_id
            ]

            # Write updated index
            index_path.write_text(json.dumps(index, indent=2, sort_keys=True))


def list_quarantined(
    status_filter: Optional[str] = None,
    repo_root: Optional[Path] = None
) -> List[QuarantineEntry]:
    """
    List all quarantined tasks, optionally filtered by repair status.

    Args:
        status_filter: Filter by repair_status (pending, in_progress, repaired, cannot_repair)
                      If None, returns all quarantined tasks
        repo_root: Repository root path (defaults to cwd)

    Returns:
        List of QuarantineEntry objects matching the filter
    """
    if repo_root is None:
        repo_root = Path.cwd()

    quarantine_dir = repo_root / QUARANTINE_DIR

    if not quarantine_dir.exists():
        return []

    # Find all .quarantine.json files
    entry_files = list(quarantine_dir.glob("*.quarantine.json"))
    entries = []

    for entry_file in entry_files:
        try:
            data = json.loads(entry_file.read_text())
            entry = QuarantineEntry.from_dict(data)

            # Apply status filter if specified
            if status_filter is None or entry.repair_status == status_filter:
                entries.append(entry)

        except (json.JSONDecodeError, ValueError, KeyError) as e:
            # Skip corrupted entries (log warning in production)
            continue

    return entries
