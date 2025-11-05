"""
YAML parser for task files.

Handles parsing of .task.yaml files with support for both inline and
multi-line array formats for blocked_by and depends_on fields.

Critical fix: The Bash-based picker only handles multi-line YAML arrays,
but all real tasks use inline format like: blocked_by: [TASK-A, TASK-B]
"""

import hashlib
import os
from pathlib import Path
from typing import List, Optional

from ruamel.yaml import YAML

from .models import Task


class TaskParser:
    """Parser for .task.yaml files."""

    def __init__(self, repo_root: Path):
        """
        Initialize parser.

        Args:
            repo_root: Absolute path to repository root
        """
        self.repo_root = repo_root
        self.yaml = YAML(typ='safe')  # Safe loading, no code execution

    def parse_file(self, file_path: Path) -> Optional[Task]:
        """
        Parse a single .task.yaml file.

        Args:
            file_path: Path to .task.yaml file

        Returns:
            Task object or None if parsing fails
        """
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                data = self.yaml.load(content)

            if not data or not isinstance(data, dict):
                return None

            # Extract required fields
            task_id = data.get('id')
            title = data.get('title')
            status = data.get('status')
            priority = data.get('priority')
            area = data.get('area')

            # Skip if missing required fields
            if not all([task_id, title, status, priority, area]):
                return None

            # Extract schema version (default to "1.0" for backward compatibility)
            schema_version = data.get('schema_version', '1.0')
            if not isinstance(schema_version, str):
                schema_version = str(schema_version)

            # Extract optional fields
            unblocker = bool(data.get('unblocker', False))
            order = data.get('order')
            if order is not None:
                try:
                    order = int(order)
                except (ValueError, TypeError):
                    order = None

            # Extract blocked_reason (required when status=blocked, optional otherwise)
            blocked_reason = data.get('blocked_reason')
            if blocked_reason is not None and not isinstance(blocked_reason, str):
                # Handle non-string values (e.g., null/None in YAML)
                blocked_reason = None

            # Parse blocked_by and depends_on (handles both inline and multi-line)
            blocked_by = self._parse_string_list(data.get('blocked_by', []))
            depends_on = self._parse_string_list(data.get('depends_on', []))

            # Calculate file metadata
            stat = file_path.stat()
            mtime = stat.st_mtime
            file_hash = self._calculate_hash(content)

            return Task(
                id=task_id,
                title=title,
                status=status,
                priority=priority,
                area=area,
                path=str(file_path),
                schema_version=schema_version,
                unblocker=unblocker,
                order=order,
                blocked_by=blocked_by,
                depends_on=depends_on,
                blocked_reason=blocked_reason,
                mtime=mtime,
                hash=file_hash,
            )

        except Exception as e:
            # Log error but don't crash - skip malformed files
            try:
                import sys
                print(f"Warning: Failed to parse {file_path}: {e}", file=sys.stderr, flush=True)
            except (BrokenPipeError, IOError):
                # Ignore broken pipe errors (e.g., when piping to head)
                pass
            return None

    def _parse_string_list(self, value) -> List[str]:
        """
        Parse a YAML field that can be either an inline array or multi-line list.

        Handles both:
        - Inline: blocked_by: [TASK-0818, TASK-0819]
        - Multi-line:
            blocked_by:
              - TASK-0818
              - TASK-0819

        Args:
            value: YAML value (list, None, or other)

        Returns:
            List of strings (empty if None or invalid)
        """
        if value is None:
            return []

        if isinstance(value, list):
            # Filter out None values and convert to strings
            return [str(item).strip() for item in value if item is not None]

        # Handle single string value (edge case)
        if isinstance(value, str):
            return [value.strip()]

        return []

    def _calculate_hash(self, content: str) -> str:
        """
        Calculate SHA256 hash of file content.

        Args:
            content: File content string

        Returns:
            Hex digest of SHA256 hash
        """
        return hashlib.sha256(content.encode('utf-8')).hexdigest()

    def discover_tasks(self) -> List[Task]:
        """
        Discover and parse all .task.yaml files in tasks/ and docs/completed-tasks/.

        Returns:
            List of Task objects (completed tasks included)
        """
        tasks = []

        # Scan active tasks
        tasks_dir = self.repo_root / "tasks"
        if tasks_dir.exists():
            for task_file in tasks_dir.rglob("*.task.yaml"):
                task = self.parse_file(task_file)
                if task:
                    tasks.append(task)

        # Scan archived/completed tasks
        archive_dir = self.repo_root / "docs" / "completed-tasks"
        if archive_dir.exists():
            for task_file in archive_dir.rglob("*.task.yaml"):
                task = self.parse_file(task_file)
                if task:
                    # Ensure archived tasks are marked as completed
                    if task.status != "completed":
                        try:
                            import sys
                            print(
                                f"Warning: Archived task {task.id} has status '{task.status}' "
                                f"but should be 'completed'",
                                file=sys.stderr,
                                flush=True
                            )
                        except (BrokenPipeError, IOError):
                            pass
                    tasks.append(task)

        return tasks

    def get_completed_ids(self, tasks: List[Task]) -> set:
        """
        Get set of completed task IDs.

        Args:
            tasks: List of all tasks

        Returns:
            Set of task IDs with status 'completed'
        """
        return {task.id for task in tasks if task.is_completed()}
