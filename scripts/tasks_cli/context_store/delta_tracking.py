"""
Delta tracking module for worktree snapshots and drift detection.

Handles:
- Worktree snapshotting with temporary index
- Incremental diff calculation
- Drift detection and verification
- File checksum calculation
"""

import hashlib
import os
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from ..exceptions import ValidationError, ContextNotFoundError, DriftError
from ..providers import GitProvider


# ============================================================================
# Helper Functions
# ============================================================================

def normalize_diff_for_hashing(diff_content: str) -> str:
    """
    Normalize git diff output to POSIX LF-only format for deterministic hashing.

    Ensures identical SHA256 across Windows (CRLF), macOS (LF), and Linux (LF).

    Args:
        diff_content: Raw diff content from git

    Returns:
        Normalized diff with LF line endings and trailing newline
    """
    # Convert all line endings to LF
    normalized = diff_content.replace('\r\n', '\n').replace('\r', '\n')

    # Ensure trailing newline (git diff convention)
    if normalized and not normalized.endswith('\n'):
        normalized += '\n'

    return normalized


def calculate_scope_hash(repo_paths: List[str]) -> str:
    """
    Calculate deterministic hash of task scope to detect missing/renamed files.

    Hashes paths only (not file contents) for lightweight structural checks.

    Args:
        repo_paths: List of file/directory paths from immutable context

    Returns:
        SHA256 hash (16-char prefix) of concatenated paths
    """
    # Ensure paths are sorted for determinism
    sorted_paths = sorted(repo_paths)

    # Concatenate with newline separator (POSIX convention)
    concatenated = "\n".join(sorted_paths) + "\n"

    # Hash the paths themselves (not file contents for performance)
    scope_hash = hashlib.sha256(concatenated.encode('utf-8')).hexdigest()[:16]

    return scope_hash


# ============================================================================
# Data Models (imported from parent module)
# ============================================================================

# NOTE: These are imported to avoid circular dependency issues.
# The actual dataclass definitions remain in context_store.py
# We'll import them when needed via TYPE_CHECKING or at module load.


# ============================================================================
# DeltaTracker Class
# ============================================================================

class DeltaTracker:
    """
    Handles worktree snapshotting, incremental diff calculation, and drift detection.

    Extracted from TaskContextStore to provide focused delta tracking functionality
    while maintaining clear separation of concerns.
    """

    def __init__(self, repo_root: Path, git_provider=None):
        """
        Initialize delta tracker.

        Args:
            repo_root: Absolute path to repository root
            git_provider: Optional GitProvider instance (defaults to new instance)
        """
        self.repo_root = Path(repo_root)
        self._git_provider = git_provider or GitProvider(repo_root)

    def _calculate_file_sha256(self, file_path: Path) -> str:
        """
        Calculate SHA256 hash of file contents.

        Args:
            file_path: Path to file (absolute or relative to repo_root)

        Returns:
            Full SHA256 hex digest
        """
        if not file_path.is_absolute():
            file_path = self.repo_root / file_path

        sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            while chunk := f.read(8192):
                sha256.update(chunk)
        return sha256.hexdigest()

    def _get_current_git_head(self) -> str:
        """Get current git HEAD SHA."""
        return self._git_provider.get_current_commit()

    def _check_staleness(self, git_head: str) -> None:
        """
        Compare provided git_head to current HEAD.

        Logs warning if mismatched (not an error).

        Args:
            git_head: Expected git HEAD SHA
        """
        try:
            current_head = self._get_current_git_head()
            if current_head != git_head:
                import sys
                print(
                    f"⚠️  Warning: Context git HEAD ({git_head[:8]}) differs "
                    f"from current HEAD ({current_head[:8]}). "
                    f"Context may be stale.",
                    file=sys.stderr
                )
        except Exception:
            # Unable to get current HEAD - non-fatal
            pass

    def _is_working_tree_dirty(self) -> bool:
        """
        Check if working tree has uncommitted changes or untracked files.

        Returns:
            True if working tree is dirty (has changes or untracked files)
        """
        # Use GitProvider status to check for dirty state
        status_result = self._git_provider.status(include_untracked=True)

        if status_result['is_dirty']:
            # Filter out .agent-output directory from dirty files
            dirty_files = [
                f for f in status_result['files']
                if not f.startswith('.agent-output/')
            ]
            return len(dirty_files) > 0

        return False

    def _calculate_file_checksum(self, file_path: Path) -> str:
        """
        Calculate SHA256 checksum of file.

        Args:
            file_path: Path to file

        Returns:
            SHA256 hex digest
        """
        sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                sha256.update(chunk)
        return sha256.hexdigest()

    def _get_untracked_files_in_scope(
        self,
        repo_paths: List[str]
    ) -> Tuple[List[str], List[str]]:
        """
        Get untracked files filtered to task scope.

        Args:
            repo_paths: List of paths defining task scope (from context)

        Returns:
            Tuple of (in_scope_files, out_of_scope_files)
            - in_scope_files: Untracked files matching repo_paths prefixes
            - out_of_scope_files: Untracked files outside declared scope
        """
        # Get all untracked files (respecting .gitignore)
        all_untracked = self._git_provider.ls_files(untracked=True)

        # Filter to task scope
        in_scope = []
        out_of_scope = []

        for untracked_path in all_untracked:
            # Check if untracked file matches any repo_paths prefix
            matches_scope = False
            for scope_path in repo_paths:
                # Normalize scope_path to not have trailing slash for consistent matching
                normalized_scope = scope_path.rstrip('/')

                # Special case: '.' means root directory (matches all files)
                if normalized_scope == '.':
                    matches_scope = True
                    break

                # Handle both file and directory scopes
                # e.g., "backend" should match "backend/foo.ts"
                # e.g., "mobile/src/App.tsx" should match exactly
                if untracked_path == normalized_scope or untracked_path.startswith(normalized_scope + '/'):
                    matches_scope = True
                    break

            if matches_scope:
                in_scope.append(untracked_path)
            else:
                out_of_scope.append(untracked_path)

        return (in_scope, out_of_scope)

    def _get_changed_files(
        self,
        base_commit: str,
        env: Optional[Dict[str, str]] = None
    ) -> List['FileSnapshot']:
        """
        Get list of changed files with checksums.

        Args:
            base_commit: Base commit to diff against
            env: Optional environment dict (e.g., for GIT_INDEX_FILE)

        Returns:
            List of FileSnapshot objects
        """
        # Import here to avoid circular dependency
        from ..context_store import FileSnapshot

        # Get list of changed files with status
        result = subprocess.run(
            ['git', 'diff', '--name-status', base_commit],
            cwd=self.repo_root,
            env=env,
            capture_output=True,
            text=True,
            check=True
        )

        files_changed = []
        for line in result.stdout.strip().split('\n'):
            if not line:
                continue

            parts = line.split('\t', 1)
            if len(parts) != 2:
                continue

            status = parts[0]
            path = parts[1]

            # For deleted files, we can't calculate checksum
            if status == 'D':
                files_changed.append(FileSnapshot(
                    path=path,
                    sha256='',
                    status=status,
                    mode='',
                    size=0
                ))
                continue

            # Calculate checksum for existing files
            file_path = self.repo_root / path
            if file_path.exists() and file_path.is_file():
                sha256 = self._calculate_file_checksum(file_path)
                stat = file_path.stat()
                mode = oct(stat.st_mode)[-3:]
                size = stat.st_size

                files_changed.append(FileSnapshot(
                    path=path,
                    sha256=sha256,
                    status=status,
                    mode=mode,
                    size=size
                ))

        return files_changed

    def _compare_file_checksums(
        self,
        expected_files: List['FileSnapshot']
    ) -> str:
        """
        Compare current file checksums with expected.

        Args:
            expected_files: Expected file snapshots

        Returns:
            Detailed drift report (empty string if no drift)
        """
        drift_details = []

        for expected in expected_files:
            file_path = self.repo_root / expected.path

            # Check if deleted file
            if expected.status == 'D':
                if file_path.exists():
                    drift_details.append(
                        f"  {expected.path}:\n"
                        f"    Expected: deleted\n"
                        f"    Current: exists"
                    )
                continue

            # Check if file exists
            if not file_path.exists():
                drift_details.append(
                    f"  {expected.path}:\n"
                    f"    Expected: exists\n"
                    f"    Current: deleted"
                )
                continue

            # Compare checksum
            if file_path.is_file():
                current_sha = self._calculate_file_checksum(file_path)
                if current_sha != expected.sha256:
                    drift_details.append(
                        f"  {expected.path}:\n"
                        f"    Expected SHA: {expected.sha256[:16]}...\n"
                        f"    Current SHA:  {current_sha[:16]}..."
                    )

        return '\n'.join(drift_details)

    def snapshot_worktree(
        self,
        base_commit: str,
        repo_paths: List[str],
        context_dir: Path,
        agent_role: str
    ) -> 'WorktreeSnapshot':
        """
        Snapshot working tree state at agent completion.

        Args:
            base_commit: Base commit to diff against
            repo_paths: List of paths defining task scope
            context_dir: Directory to write diff artifacts
            agent_role: "implementer" | "reviewer" | "validator"

        Returns:
            WorktreeSnapshot

        Raises:
            ValidationError: If working tree is clean (unexpected)
        """
        # Import here to avoid circular dependency
        from ..context_store import WorktreeSnapshot

        # 1. Verify working tree is dirty
        if not self._is_working_tree_dirty():
            raise ValidationError(
                "Working tree is clean (no uncommitted changes). "
                "Expected dirty state for delta tracking."
            )

        # 2. Filter untracked files to task scope
        in_scope_untracked, out_of_scope_untracked = self._get_untracked_files_in_scope(
            repo_paths
        )

        # Warn if untracked files exist outside declared scope
        if out_of_scope_untracked:
            import sys
            print(
                f"⚠️  Warning: {len(out_of_scope_untracked)} untracked file(s) "
                f"outside task scope (will be ignored):\n  "
                + "\n  ".join(out_of_scope_untracked[:5])
                + (f"\n  ... and {len(out_of_scope_untracked) - 5} more"
                   if len(out_of_scope_untracked) > 5 else ""),
                file=sys.stderr
            )

        # 3. Generate diff using temporary index to avoid polluting real index
        with tempfile.NamedTemporaryFile(mode='w', suffix='.index', delete=False) as tmp_index:
            tmp_index_path = tmp_index.name

        try:
            # Set up environment to use temporary index
            env = os.environ.copy()
            env['GIT_INDEX_FILE'] = tmp_index_path

            # Read current HEAD into temporary index
            subprocess.run(
                ['git', 'read-tree', 'HEAD'],
                cwd=self.repo_root,
                env=env,
                capture_output=True,
                text=True,
                check=True
            )

            # Stage in-scope untracked files in temporary index only
            # Exclude only generated .agent-output diffs, not all .diff files
            if in_scope_untracked:
                # Build pathspec: exclude .agent-output directory and its diffs
                pathspec = ['--'] + in_scope_untracked + [':!.agent-output/**']
                subprocess.run(
                    ['git', 'add', '-N'] + pathspec,
                    cwd=self.repo_root,
                    env=env,
                    capture_output=True,
                    text=True,
                    check=False  # Ignore errors if files already tracked
                )

            # Generate cumulative diff from base using temporary index
            diff_file = context_dir / f"{agent_role}-from-base.diff"
            result = subprocess.run(
                ['git', 'diff', base_commit],
                cwd=self.repo_root,
                env=env,
                capture_output=True,
                text=True,
                check=True
            )
            diff_content = result.stdout

            # 5. Calculate file checksums using temporary index
            files_changed = self._get_changed_files(base_commit, env=env)

            # 8. Get diff stat using temporary index
            result_stat = subprocess.run(
                ['git', 'diff', '--stat', base_commit],
                cwd=self.repo_root,
                env=env,
                capture_output=True,
                text=True,
                check=True
            )
            diff_stat = result_stat.stdout.strip()

        finally:
            # Clean up temporary index file
            if os.path.exists(tmp_index_path):
                os.unlink(tmp_index_path)

        # Save diff file
        diff_file.write_text(diff_content, encoding='utf-8')

        # Check diff size and warn if > 10MB (proposal Section 3.6)
        diff_size_mb = diff_file.stat().st_size / (1024 * 1024)
        if diff_size_mb > 10:
            import sys
            print(
                f"⚠️  Warning: Diff size {diff_size_mb:.1f}MB exceeds 10MB threshold. "
                f"Review for unintended binary files.",
                file=sys.stderr
            )

        # 4. Normalize and hash diff
        normalized_diff = normalize_diff_for_hashing(diff_content)
        diff_sha = hashlib.sha256(normalized_diff.encode('utf-8')).hexdigest()

        # 6. Calculate scope hash
        scope_hash = calculate_scope_hash(repo_paths)

        # 7. Capture git status report
        result = subprocess.run(
            ['git', 'status', '--porcelain', '-z'],
            cwd=self.repo_root,
            capture_output=True,
            text=True,
            check=True
        )
        status_report = result.stdout

        # 10. Create WorktreeSnapshot
        snapshot = WorktreeSnapshot(
            base_commit=base_commit,
            snapshot_time=datetime.now(timezone.utc).isoformat(),
            diff_from_base=str(diff_file.relative_to(self.repo_root)),
            diff_sha=diff_sha,
            status_report=status_report,
            files_changed=files_changed,
            diff_stat=diff_stat,
            scope_hash=scope_hash,
            diff_from_implementer=None,
            incremental_diff_sha=None,
            incremental_diff_error=None,
        )

        return snapshot

    def _calculate_incremental_diff(
        self,
        implementer_diff_file: Path,
        base_commit: str,
        repo_paths: List[str]
    ) -> Tuple[Optional[str], Optional[str]]:
        """
        Calculate reviewer's incremental changes by reverse-applying implementer diff.

        Uses git's index manipulation to safely calculate the diff without modifying
        the working tree. Creates a temporary index, applies implementer's changes to
        it, then diffs working tree against this reconstructed state.

        Args:
            implementer_diff_file: Path to implementer's diff file
            base_commit: Base commit SHA to start from
            repo_paths: List of paths defining task scope for filtering

        Returns:
            Tuple of (incremental_diff_content, error_message)
            - On success: (diff_string, None)
            - On conflict: (None, user_friendly_error)
        """
        try:
            # Create a temporary index file
            with tempfile.NamedTemporaryFile(mode='w', suffix='.index', delete=False) as tmp_index:
                tmp_index_path = tmp_index.name

            try:
                # Set up environment to use temporary index
                env = os.environ.copy()
                env['GIT_INDEX_FILE'] = tmp_index_path

                # 1. Read base tree into temporary index
                subprocess.run(
                    ['git', 'read-tree', base_commit],
                    cwd=self.repo_root,
                    env=env,
                    capture_output=True,
                    text=True,
                    check=True
                )

                # 2. Apply implementer's diff to the temporary index
                # Use --cached to apply only to index, not working tree
                result = subprocess.run(
                    ['git', 'apply', '--cached', str(implementer_diff_file)],
                    cwd=self.repo_root,
                    env=env,
                    capture_output=True,
                    text=True,
                    check=False  # Don't raise on conflict
                )

                if result.returncode != 0:
                    # Could not apply implementer's diff (likely due to conflicts)
                    conflict_details = result.stderr

                    error_msg = (
                        f"Cannot calculate incremental diff: implementer's changes "
                        f"could not be cleanly applied to base commit.\n\n"
                        f"This can happen when:\n"
                        f"- Both agents modified the same lines in a file\n"
                        f"- The base commit has changed since implementer started\n"
                        f"- File modes or paths changed\n\n"
                        f"Mitigation: Review the cumulative diff instead "
                        f"(--get-diff TASK --agent reviewer --type from_base)\n\n"
                        f"Git apply error:\n{conflict_details}"
                    )

                    return (None, error_msg)

                # 2.5. Add in-scope untracked files to the temporary index as intent-to-add
                # This ensures new files created by reviewer are included in the diff
                # Only exclude .agent-output directory (not all .diff files)
                in_scope_untracked, _ = self._get_untracked_files_in_scope(repo_paths)

                if in_scope_untracked:
                    pathspec = ['--'] + in_scope_untracked + [':!.agent-output/**']
                    subprocess.run(
                        ['git', 'add', '-N'] + pathspec,
                        cwd=self.repo_root,
                        env=env,
                        capture_output=True,
                        text=True,
                        check=False  # Ignore errors if files already tracked
                    )

                # 3. Diff working tree against temporary index
                # This shows what the reviewer changed on top of implementer's work
                result = subprocess.run(
                    ['git', 'diff'],
                    cwd=self.repo_root,
                    env=env,
                    capture_output=True,
                    text=True,
                    check=True
                )

                incremental_diff = result.stdout

                # If diff is empty, reviewer made no additional changes
                if not incremental_diff.strip():
                    return (
                        None,
                        "No incremental changes detected. Reviewer's state matches "
                        "implementer's changes exactly."
                    )

                return (incremental_diff, None)

            finally:
                # Clean up temporary index file
                if os.path.exists(tmp_index_path):
                    os.unlink(tmp_index_path)

        except subprocess.CalledProcessError as e:
            # Unexpected git error
            error_msg = (
                f"Git error while calculating incremental diff:\n{e.stderr}\n\n"
                f"Mitigation: Review the cumulative diff instead "
                f"(--get-diff TASK --agent reviewer --type from_base)"
            )

            return (None, error_msg)
        except Exception as e:
            # Unexpected Python error
            error_msg = (
                f"Unexpected error calculating incremental diff: {str(e)}\n\n"
                f"Mitigation: Review the cumulative diff instead "
                f"(--get-diff TASK --agent reviewer --type from_base)"
            )

            return (None, error_msg)

    def verify_worktree_state(
        self,
        base_commit: str,
        diff_sha: str,
        files_changed: List['FileSnapshot'],
        scope_hash: str,
        repo_paths: List[str]
    ) -> None:
        """
        Verify working tree matches expected state from previous agent.

        Args:
            base_commit: Expected base commit SHA
            diff_sha: Expected diff SHA256
            files_changed: Expected file snapshots
            scope_hash: Expected scope hash
            repo_paths: List of paths defining task scope

        Raises:
            DriftError: On mismatch with detailed file-by-file report
        """
        # 3. Verify base commit unchanged
        try:
            current_head = self._get_current_git_head()
        except Exception as exc:
            raise DriftError("Unable to determine current git HEAD") from exc

        if current_head != base_commit:
            raise DriftError(
                f"Base commit changed (rebase/merge detected):\n"
                f"  Expected: {base_commit[:8]}\n"
                f"  Current:  {current_head[:8]}\n\n"
                f"Cannot verify deltas - base commit must remain unchanged."
            )

        # 4. Verify working tree still dirty
        if not self._is_working_tree_dirty():
            raise DriftError(
                "Working tree is clean (no uncommitted changes).\n"
                "Expected dirty state based on snapshot.\n\n"
                "Working tree may have been committed prematurely, "
                "invalidating delta tracking."
            )

        # 5. Calculate current diff and compare SHA
        # Use temporary index to include in-scope untracked files (mirrors snapshot_worktree)
        in_scope_untracked, _ = self._get_untracked_files_in_scope(repo_paths)

        with tempfile.NamedTemporaryFile(mode='w', suffix='.index', delete=False) as tmp_index:
            tmp_index_path = tmp_index.name

        try:
            # Set up environment to use temporary index
            env = os.environ.copy()
            env['GIT_INDEX_FILE'] = tmp_index_path

            # Read current HEAD into temporary index
            subprocess.run(
                ['git', 'read-tree', 'HEAD'],
                cwd=self.repo_root,
                env=env,
                capture_output=True,
                text=True,
                check=True
            )

            # Stage in-scope untracked files in temporary index only
            if in_scope_untracked:
                pathspec = ['--'] + in_scope_untracked + [':!.agent-output/**']
                subprocess.run(
                    ['git', 'add', '-N'] + pathspec,
                    cwd=self.repo_root,
                    env=env,
                    capture_output=True,
                    text=True,
                    check=False  # Ignore errors if files already tracked
                )

            # Generate diff from base using temporary index
            result = subprocess.run(
                ['git', 'diff', base_commit],
                cwd=self.repo_root,
                env=env,
                capture_output=True,
                text=True,
                check=True
            )
            current_diff = result.stdout
        finally:
            # Clean up temporary index
            if os.path.exists(tmp_index_path):
                os.unlink(tmp_index_path)

        current_diff_normalized = normalize_diff_for_hashing(current_diff)
        current_diff_sha = hashlib.sha256(
            current_diff_normalized.encode('utf-8')
        ).hexdigest()

        if current_diff_sha != diff_sha:
            # Detailed file-by-file comparison
            drift_details = self._compare_file_checksums(files_changed)

            raise DriftError(
                f"Working tree drift detected:\n"
                f"{drift_details}\n\n"
                f"Files were modified outside the agent workflow.\n"
                f"Cannot validate - working tree state is inconsistent."
            )

        # 6. Verify scope hash unchanged
        current_scope_hash = calculate_scope_hash(repo_paths)
        if current_scope_hash != scope_hash:
            raise DriftError(
                f"Task scope changed (file renamed/deleted):\n"
                f"  Expected scope hash: {scope_hash}\n"
                f"  Current scope hash:  {current_scope_hash}\n\n"
                f"Files in task scope may have been renamed or deleted."
            )

        # All checks passed - no drift detected
