"""
Persistent datastore for task metadata cache.

Maintains a JSON cache at tasks/.cache/tasks_index.json with atomic writes
to prevent torn reads under concurrent access. Cache is automatically
invalidated when file mtime or hash changes.

See: docs/proposals/task-workflow-python-refactor.md Section 3.3
"""

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from filelock import FileLock

from .constants import CACHE_VERSION
from .models import Task
from .parser import TaskParser


class TaskDatastore:
    """Manages persistent cache for task metadata."""

    def __init__(self, repo_root: Path):
        """
        Initialize datastore.

        Args:
            repo_root: Absolute path to repository root
        """
        self.repo_root = repo_root
        self.cache_dir = repo_root / "tasks" / ".cache"
        self.cache_file = self.cache_dir / "tasks_index.json"
        self.lock_file = self.cache_dir / "tasks_index.lock"
        self.parser = TaskParser(repo_root)

        # Ensure cache directory exists
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def load_tasks(self, force_refresh: bool = False) -> List[Task]:
        """
        Load tasks from cache or parse from YAML files.

        Args:
            force_refresh: Force cache rebuild even if valid

        Returns:
            List of Task objects
        """
        # Use file lock to prevent concurrent access issues
        with FileLock(str(self.lock_file), timeout=10):
            if not force_refresh and self._is_cache_valid():
                tasks = self._load_from_cache()
                if tasks is not None:
                    return tasks

            # Cache invalid or force refresh - rebuild
            tasks = self.parser.discover_tasks()
            self._save_to_cache(tasks)
            return tasks

    def _is_cache_valid(self) -> bool:
        """
        Check if cache file exists and is potentially valid.

        Validates that:
        1. Cache file exists
        2. No new task files have been added since cache was built

        Returns:
            True if cache exists and no new files detected
        """
        if not self.cache_file.exists():
            return False

        try:
            # Load cache to check for new files
            with open(self.cache_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            cached_paths = {task_info['path'] for task_info in data.get('tasks', {}).values()}

            # Scan for all .task.yaml files in tasks/ directory
            tasks_dir = self.repo_root / "tasks"
            completed_dir = self.repo_root / "docs" / "completed-tasks"

            actual_files = set()
            for directory in [tasks_dir, completed_dir]:
                if directory.exists():
                    for task_file in directory.rglob("*.task.yaml"):
                        actual_files.add(str(task_file))

            # Check if any new files exist that aren't in cache
            new_files = actual_files - cached_paths
            if new_files:
                # New files detected - cache is stale
                return False

            return True

        except (json.JSONDecodeError, KeyError, OSError):
            # Cache corrupted or unreadable
            return False

    def _load_from_cache(self) -> Optional[List[Task]]:
        """
        Load tasks from JSON cache.

        Returns:
            List of Task objects or None if cache is stale/invalid
        """
        try:
            with open(self.cache_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # Validate cache version
            if data.get('version') != CACHE_VERSION:
                return None

            tasks = []
            task_data = data.get('tasks', {})

            for task_id, cached_task in task_data.items():
                # Check if file still exists
                path = Path(cached_task['path'])
                if not path.exists():
                    # File deleted - cache stale
                    return None

                # Check if file modified since cache
                stat = path.stat()
                if stat.st_mtime != cached_task['mtime']:
                    # File modified - cache stale
                    return None

                # Reconstruct Task object from cache
                task = Task(
                    id=task_id,
                    title=cached_task.get('title', ''),
                    status=cached_task['status'],
                    priority=cached_task['priority'],
                    area=cached_task.get('area', ''),
                    path=cached_task['path'],
                    unblocker=cached_task.get('unblocker', False),
                    order=cached_task.get('order'),
                    blocked_by=cached_task.get('blocked_by', []),
                    depends_on=cached_task.get('depends_on', []),
                    blocked_reason=cached_task.get('blocked_reason'),
                    mtime=cached_task['mtime'],
                    hash=cached_task.get('hash', ''),
                )
                tasks.append(task)

            return tasks

        except (json.JSONDecodeError, KeyError, OSError) as e:
            # Cache corrupted or unreadable - return None to trigger rebuild
            print(f"Warning: Cache invalid ({e}), rebuilding...", flush=True)
            return None

    def _save_to_cache(self, tasks: List[Task]) -> None:
        """
        Save tasks to JSON cache with atomic write.

        Uses temp file + rename pattern to ensure atomic writes.

        Args:
            tasks: List of tasks to cache
        """
        try:
            # Build cache data structure
            task_data = {}
            archives = []

            for task in tasks:
                task_entry = {
                    'path': task.path,
                    'title': task.title,
                    'status': task.status,
                    'priority': task.priority,
                    'area': task.area,
                    'unblocker': task.unblocker,
                    'order': task.order,
                    'blocked_by': task.blocked_by,
                    'depends_on': task.depends_on,
                    'blocked_reason': task.blocked_reason,
                    'mtime': task.mtime,
                    'hash': task.hash,
                }
                task_data[task.id] = task_entry

                # Track archived tasks
                if 'completed-tasks' in task.path:
                    archives.append(task.id)

            cache = {
                'version': CACHE_VERSION,
                'generated_at': datetime.now(timezone.utc).isoformat(),
                'tasks': task_data,
                'archives': archives,
            }

            # Write to temp file then atomic rename
            fd, temp_path = tempfile.mkstemp(
                suffix='.json.tmp',
                dir=self.cache_dir,
                text=True
            )

            try:
                with os.fdopen(fd, 'w', encoding='utf-8') as f:
                    # Sort keys for deterministic output
                    json.dump(cache, f, indent=2, sort_keys=True)

                # Atomic rename (POSIX guarantees atomicity)
                os.replace(temp_path, self.cache_file)

            except Exception:
                # Clean up temp file on error
                try:
                    os.unlink(temp_path)
                except OSError:
                    pass
                raise

        except Exception as e:
            print(f"Warning: Failed to save cache: {e}", flush=True)

    def get_cache_info(self) -> Dict:
        """
        Get cache metadata for diagnostics.

        Returns:
            Dictionary with cache info (version, generated_at, task_count)
        """
        if not self.cache_file.exists():
            return {'exists': False}

        try:
            with open(self.cache_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            return {
                'exists': True,
                'version': data.get('version'),
                'generated_at': data.get('generated_at'),
                'task_count': len(data.get('tasks', {})),
                'archive_count': len(data.get('archives', [])),
            }
        except Exception as e:
            return {'exists': True, 'error': str(e)}
