"""
Runtime utility helpers for context store operations.

Provides runtime helper methods for:
- File path operations (context dir, manifest, evidence)
- Atomic file writes
- File SHA256 calculation
- Git operations (current HEAD, staleness checks)
- Secret scanning
- Path normalization
- Task path resolution
"""

import hashlib
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import Any, List, Optional

from ..exceptions import ValidationError
from ..providers import GitProvider


# ============================================================================
# Secret Scanning Patterns
# ============================================================================

SECRET_PATTERNS = [
    (r'AKIA[0-9A-Z]{16}', 'AWS access key'),
    (r'sk_live_[a-zA-Z0-9]{24,}', 'Stripe live key'),
    (r'eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.', 'JWT token'),
    (r'gh[pousr]_[a-zA-Z0-9]{36,}', 'GitHub token'),
    (r'glpat-[a-zA-Z0-9_-]{20,}', 'GitLab token'),
    (r'-----BEGIN (RSA|DSA|EC|OPENSSH|) ?PRIVATE KEY-----', 'Private key'),
]


# ============================================================================
# RuntimeHelper Class
# ============================================================================

class RuntimeHelper:
    """Runtime utility helpers for context store operations."""

    def __init__(self, repo_root: Path, context_root: Path, git_provider=None):
        """
        Initialize runtime helper.

        Args:
            repo_root: Absolute path to repository root
            context_root: Absolute path to context storage root (.agent-output)
            git_provider: Optional GitProvider instance (defaults to new instance)
        """
        self.repo_root = Path(repo_root)
        self.context_root = Path(context_root)
        self._git_provider = git_provider or GitProvider(repo_root)

    # ========================================================================
    # Path Helpers
    # ========================================================================

    def get_context_dir(self, task_id: str) -> Path:
        """
        Get context directory path for task.

        Args:
            task_id: Task identifier (e.g., "TASK-0824")

        Returns:
            Path to .agent-output/TASK-XXXX/
        """
        return self.context_root / task_id

    def get_context_file(self, task_id: str) -> Path:
        """
        Get context.json file path for task.

        Args:
            task_id: Task identifier

        Returns:
            Path to .agent-output/TASK-XXXX/context.json
        """
        return self.get_context_dir(task_id) / "context.json"

    def get_manifest_file(self, task_id: str) -> Path:
        """
        Get context.manifest file path for task (GAP-4).

        Args:
            task_id: Task identifier

        Returns:
            Path to .agent-output/TASK-XXXX/context.manifest
        """
        return self.get_context_dir(task_id) / "context.manifest"

    def get_evidence_dir(self, task_id: str) -> Path:
        """
        Get evidence directory path for task.

        Args:
            task_id: Task identifier

        Returns:
            Path to .agent-output/TASK-XXXX/evidence/
        """
        context_dir = self.get_context_dir(task_id)
        return context_dir / 'evidence'

    # ========================================================================
    # File Operations
    # ========================================================================

    def atomic_write(self, path: Path, content: str) -> None:
        """
        Write content atomically via temp file + os.replace().

        Args:
            path: Target file path
            content: Content to write
        """
        # Ensure parent directory exists
        path.parent.mkdir(parents=True, exist_ok=True)

        # Write to temp file in same directory
        fd, temp_path = tempfile.mkstemp(
            dir=path.parent,
            prefix=f".{path.name}.tmp",
            text=True
        )

        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                f.write(content)

            # Atomic replace
            os.replace(temp_path, path)
        except Exception:
            # Clean up temp file on error
            try:
                os.unlink(temp_path)
            except FileNotFoundError:
                pass
            raise

    def calculate_file_sha256(self, file_path: Path) -> str:
        """
        Calculate SHA256 hash of file contents.

        Args:
            file_path: Path to file (absolute or relative to repo_root)

        Returns:
            Full SHA256 hex digest
        """
        # Resolve path relative to repo_root if needed
        if not file_path.is_absolute():
            file_path = self.repo_root / file_path

        sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            while chunk := f.read(8192):
                sha256.update(chunk)

        return sha256.hexdigest()

    # ========================================================================
    # Secret Scanning
    # ========================================================================

    def scan_for_secrets(self, data: dict, force: bool = False) -> None:
        """
        Recursively scan dict for secret patterns.

        Args:
            data: Dictionary to scan
            force: Bypass secret detection (logs warning)

        Raises:
            ValidationError: On secret match (unless force=True)
        """
        if force:
            return

        def scan_value(value: Any) -> Optional[str]:
            """Scan a single value, return pattern name if matched."""
            if isinstance(value, str):
                for pattern, name in SECRET_PATTERNS:
                    if re.search(pattern, value):
                        return name
            elif isinstance(value, dict):
                for v in value.values():
                    result = scan_value(v)
                    if result:
                        return result
            elif isinstance(value, (list, tuple)):
                for item in value:
                    result = scan_value(item)
                    if result:
                        return result
            return None

        matched_pattern = scan_value(data)
        if matched_pattern:
            raise ValidationError(
                f"Potential secret detected (pattern: {matched_pattern}). "
                "Use --force-secrets to bypass."
            )

    # ========================================================================
    # Git Operations
    # ========================================================================

    def get_current_git_head(self) -> str:
        """
        Get current git HEAD SHA.

        Returns:
            Full git commit SHA (40 chars)

        Raises:
            ProcessError: If git command fails
        """
        return self._git_provider.get_current_commit()

    def check_staleness(self, context_git_head: str) -> None:
        """
        Compare context.git_head to current HEAD.

        Logs warning if mismatched (not an error).

        Args:
            context_git_head: Git HEAD SHA from context
        """
        try:
            current_head = self.get_current_git_head()

            if current_head != context_git_head:
                print(
                    f"Warning: Context created at {context_git_head[:8]}, "
                    f"but current HEAD is {current_head[:8]}. "
                    "Context may be stale.",
                    file=sys.stderr
                )
        except Exception:
            # Git command failed (not a git repo, detached HEAD, etc.)
            pass

    # ========================================================================
    # Path Normalization
    # ========================================================================

    def normalize_repo_paths(self, paths: List[str]) -> List[str]:
        """
        Normalize legacy file paths to directory paths for backward compatibility.

        FIX #3 (2025-11-19): Pre-hardening contexts stored individual file paths
        (e.g., "mobile/src/components/Foo.tsx"). Post-hardening code expects
        directory prefixes (e.g., "mobile/src/components"). This migration step
        collapses file paths to their parent directories so existing tasks don't
        break when the new code runs.

        Args:
            paths: List of paths (may be files or directories from legacy contexts)

        Returns:
            Normalized list of directory paths

        Examples:
            ["mobile/src/App.tsx", "backend/services/"] →
            ["mobile/src", "backend/services"]
        """
        normalized = set()

        for path_str in paths:
            path_obj = Path(path_str)

            # Check if this looks like a file path (has extension in the last component)
            # This heuristic handles most cases: .ts, .tsx, .py, .yaml, etc.
            if '.' in path_obj.name and not path_str.endswith('/'):
                # File path - use parent directory
                parent = str(path_obj.parent)
                # Handle edge case: root files like ".env", "Makefile", etc. → "."
                if parent == '.':
                    normalized.add('.')
                else:
                    normalized.add(parent)
            else:
                # Already a directory path - normalize (remove trailing slash)
                normalized.add(path_str.rstrip('/'))

        return sorted(normalized)

    # ========================================================================
    # Task Resolution
    # ========================================================================

    def resolve_task_path(self, task_id: str) -> Optional[Path]:
        """
        Resolve task file path, checking multiple locations.

        Checks in order:
        1. Active tasks: tasks/{tier}/TASK-XXXX-....yaml
        2. Completed tasks: docs/completed-tasks/TASK-XXXX-....yaml
        3. Quarantined tasks: docs/compliance/quarantine/TASK-XXXX.quarantine.json

        Args:
            task_id: Task identifier (e.g., "TASK-0824")

        Returns:
            Resolved Path to task file, or None if not found
        """
        # Try active tasks in each tier
        for tier in ['mobile', 'backend', 'shared', 'infrastructure', 'ops']:
            tasks_dir = self.repo_root / 'tasks' / tier
            if tasks_dir.exists():
                for task_file in tasks_dir.glob(f'{task_id}-*.task.yaml'):
                    return task_file

        # Try completed tasks
        completed_dir = self.repo_root / 'docs' / 'completed-tasks'
        if completed_dir.exists():
            for task_file in completed_dir.glob(f'{task_id}-*.task.yaml'):
                return task_file

        # Try quarantine
        quarantine_dir = self.repo_root / 'docs' / 'compliance' / 'quarantine'
        if quarantine_dir.exists():
            quarantine_file = quarantine_dir / f'{task_id}.quarantine.json'
            if quarantine_file.exists():
                return quarantine_file

        return None
