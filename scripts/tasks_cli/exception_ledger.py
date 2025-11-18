"""
Exception ledger operations for task validation exceptions.

Manages docs/compliance/context-cache-exceptions.json ledger with atomic
file updates and idempotent operations per task-context-cache-hardening-schemas.md.
"""

import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional

from filelock import FileLock

from .models import ExceptionLedgerEntry, RemediationStatus

# Default ledger path relative to repo root
LEDGER_PATH = Path("docs/compliance/context-cache-exceptions.json")


def _get_ledger_path(repo_root: Optional[Path] = None) -> Path:
    """
    Get absolute path to ledger file.

    Args:
        repo_root: Repository root path (defaults to current working directory)

    Returns:
        Absolute path to ledger file
    """
    if repo_root is None:
        repo_root = Path.cwd()
    return repo_root / LEDGER_PATH


def _load_ledger(ledger_path: Path) -> dict:
    """
    Load ledger from JSON file or create empty structure.

    Args:
        ledger_path: Absolute path to ledger file

    Returns:
        Ledger dictionary with version, last_updated, and exceptions
    """
    if not ledger_path.exists():
        return {
            "version": "1.0",
            "last_updated": datetime.utcnow().isoformat() + "Z",
            "exceptions": []
        }

    with open(ledger_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def _save_ledger(ledger_path: Path, ledger: dict) -> None:
    """
    Save ledger to JSON file atomically with deterministic formatting.

    Args:
        ledger_path: Absolute path to ledger file
        ledger: Ledger dictionary to save
    """
    # Ensure parent directory exists
    ledger_path.parent.mkdir(parents=True, exist_ok=True)

    # Update last_updated timestamp
    ledger["last_updated"] = datetime.utcnow().isoformat() + "Z"

    # Write with deterministic formatting
    with open(ledger_path, 'w', encoding='utf-8') as f:
        json.dump(ledger, f, indent=2, sort_keys=True)
        f.write('\n')  # Add trailing newline


def add_exception(
    task_id: str,
    exception_type: str,
    parse_error: Optional[str] = None,
    repo_root: Optional[Path] = None
) -> None:
    """
    Add or update exception ledger entry for a task.

    Idempotent operation: if task_id exists, updates detected_at and parse_error;
    otherwise appends new entry with 30-day deadline.

    Args:
        task_id: Task identifier (TASK-NNNN format)
        exception_type: Type of exception (malformed_yaml, missing_standards, etc.)
        parse_error: Detailed error message from parser (optional)
        repo_root: Repository root path (defaults to current working directory)
    """
    ledger_path = _get_ledger_path(repo_root)
    lock_path = ledger_path.with_suffix('.lock')

    with FileLock(str(lock_path), timeout=10):
        ledger = _load_ledger(ledger_path)

        # Check if task_id already exists
        existing_idx = None
        for idx, entry_dict in enumerate(ledger["exceptions"]):
            if entry_dict["task_id"] == task_id:
                existing_idx = idx
                break

        now = datetime.utcnow().isoformat() + "Z"

        if existing_idx is not None:
            # Update existing entry
            ledger["exceptions"][existing_idx]["detected_at"] = now
            if parse_error is not None:
                ledger["exceptions"][existing_idx]["parse_error"] = parse_error
        else:
            # Create new entry with 30-day deadline
            deadline = (datetime.utcnow() + timedelta(days=30)).date().isoformat()
            remediation = RemediationStatus(
                owner="system",
                status="open",
                deadline=deadline
            )
            entry = ExceptionLedgerEntry(
                task_id=task_id,
                exception_type=exception_type,
                detected_at=now,
                remediation=remediation,
                parse_error=parse_error
            )
            ledger["exceptions"].append(entry.to_dict())

        _save_ledger(ledger_path, ledger)


def should_suppress_warnings(task_id: str, repo_root: Optional[Path] = None) -> bool:
    """
    Check if task has an active exception entry (warnings should be suppressed).

    Args:
        task_id: Task identifier (TASK-NNNN format)
        repo_root: Repository root path (defaults to current working directory)

    Returns:
        True if task_id exists in exceptions array
    """
    ledger_path = _get_ledger_path(repo_root)

    if not ledger_path.exists():
        return False

    lock_path = ledger_path.with_suffix('.lock')
    with FileLock(str(lock_path), timeout=10):
        ledger = _load_ledger(ledger_path)
        return any(entry["task_id"] == task_id for entry in ledger["exceptions"])


def cleanup_exception(
    task_id: str,
    trigger: str,
    repo_root: Optional[Path] = None
) -> None:
    """
    Remove exception entries matching task_id and auto_remove_on trigger.

    Args:
        task_id: Task identifier (TASK-NNNN format)
        trigger: Removal trigger (task_completion, task_deletion, manual)
        repo_root: Repository root path (defaults to current working directory)
    """
    ledger_path = _get_ledger_path(repo_root)

    if not ledger_path.exists():
        return

    lock_path = ledger_path.with_suffix('.lock')
    with FileLock(str(lock_path), timeout=10):
        ledger = _load_ledger(ledger_path)

        # Filter out entries matching task_id and auto_remove_on trigger
        original_count = len(ledger["exceptions"])
        ledger["exceptions"] = [
            entry for entry in ledger["exceptions"]
            if not (entry["task_id"] == task_id and entry["auto_remove_on"] == trigger)
        ]

        # Only save if something was removed
        if len(ledger["exceptions"]) < original_count:
            _save_ledger(ledger_path, ledger)


def list_exceptions(
    status_filter: Optional[str] = None,
    repo_root: Optional[Path] = None
) -> List[ExceptionLedgerEntry]:
    """
    List all exception entries, optionally filtered by remediation status.

    Args:
        status_filter: Optional remediation status filter (open, in_progress, resolved, wont_fix)
        repo_root: Repository root path (defaults to current working directory)

    Returns:
        List of ExceptionLedgerEntry objects
    """
    ledger_path = _get_ledger_path(repo_root)

    if not ledger_path.exists():
        return []

    lock_path = ledger_path.with_suffix('.lock')
    with FileLock(str(lock_path), timeout=10):
        ledger = _load_ledger(ledger_path)

        entries = [
            ExceptionLedgerEntry.from_dict(entry_dict)
            for entry_dict in ledger["exceptions"]
        ]

        if status_filter is not None:
            entries = [
                entry for entry in entries
                if entry.remediation.status == status_filter
            ]

        return entries


def resolve_exception(
    task_id: str,
    notes: Optional[str] = None,
    repo_root: Optional[Path] = None
) -> None:
    """
    Mark exception as resolved with timestamp and optional notes.

    Args:
        task_id: Task identifier (TASK-NNNN format)
        notes: Optional resolution notes
        repo_root: Repository root path (defaults to current working directory)

    Raises:
        ValueError: If task_id not found in ledger
    """
    ledger_path = _get_ledger_path(repo_root)
    lock_path = ledger_path.with_suffix('.lock')

    with FileLock(str(lock_path), timeout=10):
        ledger = _load_ledger(ledger_path)

        # Find matching entry
        found = False
        for entry_dict in ledger["exceptions"]:
            if entry_dict["task_id"] == task_id:
                found = True
                now = datetime.utcnow().isoformat() + "Z"
                entry_dict["remediation"]["status"] = "resolved"
                entry_dict["remediation"]["resolved_at"] = now
                if notes is not None:
                    entry_dict["remediation"]["notes"] = notes
                break

        if not found:
            raise ValueError(f"Task {task_id} not found in exception ledger")

        _save_ledger(ledger_path, ledger)
