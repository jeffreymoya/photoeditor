"""Git provider with retry logic and telemetry.

Centralizes git operations with retry/backoff via Tenacity and OpenTelemetry spans.
Implements Phase 3 of task-cli-modularization.md Section 4.3.

BACKWARD COMPATIBILITY NOTE:
This provider will eventually replace git_utils.py functions (in S4.3).
During the migration phase, both modules will coexist.
"""

import subprocess
import time
from pathlib import Path
from typing import Optional

from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from .exceptions import ProcessError, CommandFailed, TimeoutExceeded, NonZeroExitWithStdErr
from ..telemetry import get_tracer


class GitProvider:
    """Git operations provider with retry logic and telemetry.

    Provides consistent git command execution with:
    - Automatic retry on transient failures (3 attempts, exponential backoff)
    - OpenTelemetry span emission for observability
    - Structured error hierarchy for proper error handling
    - Timeout protection (30s default)

    Args:
        repo_root: Path to git repository root
        logger: Optional logger for retry diagnostics
        clock: Optional clock for testing (defaults to time module)
    """

    def __init__(
        self,
        repo_root: Path,
        logger=None,
        clock=None,
    ):
        self.repo_root = repo_root
        self.logger = logger
        self.clock = clock or time
        self._tracer = get_tracer(__name__)

    def _run_git(
        self,
        args: list[str],
        timeout: float = 30,
        capture_output: bool = True,
    ) -> subprocess.CompletedProcess:
        """Execute git command with timeout and error handling.

        Args:
            args: Git command arguments (without 'git' prefix)
            timeout: Command timeout in seconds
            capture_output: Whether to capture stdout/stderr

        Returns:
            CompletedProcess result

        Raises:
            TimeoutExceeded: Command exceeded timeout
            NonZeroExitWithStdErr: Command failed with stderr output
            CommandFailed: Command failed with non-zero exit
        """
        cmd = ["git"] + args
        start_time = self.clock.time()

        try:
            result = subprocess.run(
                cmd,
                cwd=self.repo_root,
                capture_output=capture_output,
                text=True,
                timeout=timeout,
            )

            duration_ms = (self.clock.time() - start_time) * 1000

            if result.returncode != 0:
                stderr = result.stderr if capture_output else ""
                if stderr:
                    raise NonZeroExitWithStdErr(cmd, result.returncode, stderr)
                else:
                    raise CommandFailed(cmd, result.returncode)

            return result

        except subprocess.TimeoutExpired as e:
            if self.logger:
                self.logger.warning(f"Git command timed out after {timeout}s: {cmd}")
            raise TimeoutExceeded(cmd, timeout) from e

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(min=0.5, max=8.0),
        retry=retry_if_exception_type(CommandFailed),
    )
    def status(self, include_untracked: bool = True) -> dict:
        """Get git status with file list and dirty flag.

        Args:
            include_untracked: Whether to include untracked files in result

        Returns:
            Dict with keys:
                - files: List of modified file paths
                - is_dirty: Boolean indicating if tree has changes

        Raises:
            TimeoutExceeded: Command exceeded timeout
            NonZeroExitWithStdErr: Git command failed with stderr
            CommandFailed: Git command failed
        """
        retry_count = 0
        method_name = "status"

        with self._tracer.start_as_current_span(f"cli.provider.git.{method_name}") as span:
            try:
                start_time = self.clock.time()

                args = ["status", "--porcelain"]
                if include_untracked:
                    args.append("--untracked-files=all")
                else:
                    args.append("--untracked-files=no")

                result = self._run_git(args)

                duration_ms = (self.clock.time() - start_time) * 1000

                # Parse porcelain output
                files = []
                for line in result.stdout.strip().split('\n'):
                    if not line:
                        continue
                    # Format: XY filename
                    filename = line[2:].strip()
                    files.append(filename)

                is_dirty = len(files) > 0

                # Set span attributes
                span.set_attribute("command", " ".join(["git"] + args))
                span.set_attribute("duration_ms", duration_ms)
                span.set_attribute("returncode", result.returncode)
                span.set_attribute("retry_count", retry_count)
                if result.stderr:
                    stderr_preview = result.stderr[:200]
                    span.set_attribute("stderr_preview", stderr_preview)

                return {"files": files, "is_dirty": is_dirty}

            except Exception as e:
                # Record failure in span
                if hasattr(e, 'returncode'):
                    span.set_attribute("returncode", e.returncode)
                if hasattr(e, 'stderr'):
                    stderr_preview = e.stderr[:200] if e.stderr else ""
                    span.set_attribute("stderr_preview", stderr_preview)
                span.set_attribute("error", str(e))
                raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(min=0.5, max=8.0),
        retry=retry_if_exception_type(CommandFailed),
    )
    def ls_files(
        self,
        paths: Optional[list[str]] = None,
        untracked: bool = False,
    ) -> list[str]:
        """List files tracked by git.

        Args:
            paths: Optional list of paths to filter (defaults to all files)
            untracked: Whether to include untracked files

        Returns:
            List of file paths relative to repo root

        Raises:
            TimeoutExceeded: Command exceeded timeout
            NonZeroExitWithStdErr: Git command failed with stderr
            CommandFailed: Git command failed
        """
        retry_count = 0
        method_name = "ls_files"

        with self._tracer.start_as_current_span(f"cli.provider.git.{method_name}") as span:
            try:
                start_time = self.clock.time()

                args = ["ls-files"]
                if untracked:
                    args.append("--others")
                    args.append("--exclude-standard")

                if paths:
                    args.extend(paths)

                result = self._run_git(args)

                duration_ms = (self.clock.time() - start_time) * 1000

                # Parse output
                files = []
                for line in result.stdout.strip().split('\n'):
                    if line:
                        files.append(line)

                # Set span attributes
                span.set_attribute("command", " ".join(["git"] + args))
                span.set_attribute("duration_ms", duration_ms)
                span.set_attribute("returncode", result.returncode)
                span.set_attribute("retry_count", retry_count)
                if result.stderr:
                    stderr_preview = result.stderr[:200]
                    span.set_attribute("stderr_preview", stderr_preview)

                return files

            except Exception as e:
                # Record failure in span
                if hasattr(e, 'returncode'):
                    span.set_attribute("returncode", e.returncode)
                if hasattr(e, 'stderr'):
                    stderr_preview = e.stderr[:200] if e.stderr else ""
                    span.set_attribute("stderr_preview", stderr_preview)
                span.set_attribute("error", str(e))
                raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(min=0.5, max=8.0),
        retry=retry_if_exception_type(CommandFailed),
    )
    def resolve_merge_base(self, branch: str) -> str:
        """Resolve merge base between current HEAD and target branch.

        Args:
            branch: Target branch name

        Returns:
            Commit SHA of merge base

        Raises:
            TimeoutExceeded: Command exceeded timeout
            NonZeroExitWithStdErr: Git command failed with stderr
            CommandFailed: Git command failed
        """
        retry_count = 0
        method_name = "resolve_merge_base"

        with self._tracer.start_as_current_span(f"cli.provider.git.{method_name}") as span:
            try:
                start_time = self.clock.time()

                args = ["merge-base", "HEAD", branch]
                result = self._run_git(args)

                duration_ms = (self.clock.time() - start_time) * 1000

                commit_sha = result.stdout.strip()

                # Set span attributes
                span.set_attribute("command", " ".join(["git"] + args))
                span.set_attribute("duration_ms", duration_ms)
                span.set_attribute("returncode", result.returncode)
                span.set_attribute("retry_count", retry_count)
                if result.stderr:
                    stderr_preview = result.stderr[:200]
                    span.set_attribute("stderr_preview", stderr_preview)

                return commit_sha

            except Exception as e:
                # Record failure in span
                if hasattr(e, 'returncode'):
                    span.set_attribute("returncode", e.returncode)
                if hasattr(e, 'stderr'):
                    stderr_preview = e.stderr[:200] if e.stderr else ""
                    span.set_attribute("stderr_preview", stderr_preview)
                span.set_attribute("error", str(e))
                raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(min=0.5, max=8.0),
        retry=retry_if_exception_type(CommandFailed),
    )
    def get_current_commit(self) -> str:
        """Get current commit SHA.

        Returns:
            Current commit SHA (full 40-char hash)

        Raises:
            TimeoutExceeded: Command exceeded timeout
            NonZeroExitWithStdErr: Git command failed with stderr
            CommandFailed: Git command failed
        """
        retry_count = 0
        method_name = "get_current_commit"

        with self._tracer.start_as_current_span(f"cli.provider.git.{method_name}") as span:
            try:
                start_time = self.clock.time()

                args = ["rev-parse", "HEAD"]
                result = self._run_git(args)

                duration_ms = (self.clock.time() - start_time) * 1000

                commit_sha = result.stdout.strip()

                # Set span attributes
                span.set_attribute("command", " ".join(["git"] + args))
                span.set_attribute("duration_ms", duration_ms)
                span.set_attribute("returncode", result.returncode)
                span.set_attribute("retry_count", retry_count)
                if result.stderr:
                    stderr_preview = result.stderr[:200]
                    span.set_attribute("stderr_preview", stderr_preview)

                return commit_sha

            except Exception as e:
                # Record failure in span
                if hasattr(e, 'returncode'):
                    span.set_attribute("returncode", e.returncode)
                if hasattr(e, 'stderr'):
                    stderr_preview = e.stderr[:200] if e.stderr else ""
                    span.set_attribute("stderr_preview", stderr_preview)
                span.set_attribute("error", str(e))
                raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(min=0.5, max=8.0),
        retry=retry_if_exception_type(CommandFailed),
    )
    def get_current_branch(self) -> Optional[str]:
        """Get current branch name.

        Returns:
            Branch name or None if detached HEAD

        Raises:
            TimeoutExceeded: Command exceeded timeout
        """
        retry_count = 0
        method_name = "get_current_branch"

        with self._tracer.start_as_current_span(f"cli.provider.git.{method_name}") as span:
            try:
                start_time = self.clock.time()

                args = ["rev-parse", "--abbrev-ref", "HEAD"]
                result = self._run_git(args)

                duration_ms = (self.clock.time() - start_time) * 1000

                branch = result.stdout.strip()

                # "HEAD" means detached HEAD state
                if branch == "HEAD":
                    branch = None

                # Set span attributes
                span.set_attribute("command", " ".join(["git"] + args))
                span.set_attribute("duration_ms", duration_ms)
                span.set_attribute("returncode", result.returncode)
                span.set_attribute("retry_count", retry_count)
                if result.stderr:
                    stderr_preview = result.stderr[:200]
                    span.set_attribute("stderr_preview", stderr_preview)

                return branch

            except (CommandFailed, NonZeroExitWithStdErr):
                # Graceful fallback for detached HEAD or other errors
                return None
            except Exception as e:
                # Record failure in span for unexpected errors
                if hasattr(e, 'returncode'):
                    span.set_attribute("returncode", e.returncode)
                if hasattr(e, 'stderr'):
                    stderr_preview = e.stderr[:200] if e.stderr else ""
                    span.set_attribute("stderr_preview", stderr_preview)
                span.set_attribute("error", str(e))
                raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(min=0.5, max=8.0),
        retry=retry_if_exception_type(CommandFailed),
    )
    def check_dirty_tree(
        self,
        allow_preexisting: bool = False,
        expected_files: Optional[list[str]] = None,
    ) -> tuple[bool, list[str]]:
        """Check if git working tree is dirty.

        Args:
            allow_preexisting: If True, allow pre-existing untracked files
            expected_files: List of file patterns expected to be modified

        Returns:
            Tuple of (is_clean, dirty_files):
                - is_clean: True if tree is clean or only expected files are dirty
                - dirty_files: List of dirty file paths (or unexpected dirty files)

        Raises:
            TimeoutExceeded: Command exceeded timeout
            NonZeroExitWithStdErr: Git command failed with stderr
            CommandFailed: Git command failed
        """
        retry_count = 0
        method_name = "check_dirty_tree"

        with self._tracer.start_as_current_span(f"cli.provider.git.{method_name}") as span:
            try:
                start_time = self.clock.time()

                args = ["status", "--porcelain"]
                result = self._run_git(args)

                duration_ms = (self.clock.time() - start_time) * 1000

                dirty_files = []
                for line in result.stdout.strip().split('\n'):
                    if not line:
                        continue

                    # Parse git status porcelain format
                    # Format: XY filename (with space separator)
                    # X = index status, Y = worktree status
                    status = line[:2]
                    # Skip the two status chars and the space
                    filename = line[2:].strip()

                    # Skip untracked files if allow_preexisting
                    if allow_preexisting and status.strip() == '??':
                        continue

                    dirty_files.append(filename)

                # If expected_files provided, filter to unexpected changes
                if expected_files is not None:
                    unexpected = [
                        f
                        for f in dirty_files
                        if not any(f.startswith(pattern) for pattern in expected_files)
                    ]
                    is_clean = len(unexpected) == 0
                    result_files = unexpected
                else:
                    is_clean = len(dirty_files) == 0
                    result_files = dirty_files

                # Set span attributes
                span.set_attribute("command", " ".join(["git"] + args))
                span.set_attribute("duration_ms", duration_ms)
                span.set_attribute("returncode", result.returncode)
                span.set_attribute("retry_count", retry_count)
                if result.stderr:
                    stderr_preview = result.stderr[:200]
                    span.set_attribute("stderr_preview", stderr_preview)

                return is_clean, result_files

            except Exception as e:
                # Record failure in span
                if hasattr(e, 'returncode'):
                    span.set_attribute("returncode", e.returncode)
                if hasattr(e, 'stderr'):
                    stderr_preview = e.stderr[:200] if e.stderr else ""
                    span.set_attribute("stderr_preview", stderr_preview)
                span.set_attribute("error", str(e))
                raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(min=0.5, max=8.0),
        retry=retry_if_exception_type(CommandFailed),
    )
    def diff_name_status(
        self,
        base_commit: str,
        env: Optional[dict] = None,
    ) -> list[tuple[str, str]]:
        """Get list of changed files with their status.

        Args:
            base_commit: Base commit to diff against
            env: Optional environment dict (e.g., for GIT_INDEX_FILE)

        Returns:
            List of (status, path) tuples
            Status codes: A=added, M=modified, D=deleted, R=renamed, etc.

        Raises:
            TimeoutExceeded: Command exceeded timeout
            NonZeroExitWithStdErr: Git command failed with stderr
            CommandFailed: Git command failed
        """
        retry_count = 0
        method_name = "diff_name_status"

        with self._tracer.start_as_current_span(f"cli.provider.git.{method_name}") as span:
            try:
                start_time = self.clock.time()

                args = ["diff", "--name-status", base_commit]

                # Use custom environment if provided
                if env:
                    import subprocess as sp
                    cmd = ["git"] + args
                    result = sp.run(
                        cmd,
                        cwd=self.repo_root,
                        env=env,
                        capture_output=True,
                        text=True,
                        timeout=30,
                    )
                    if result.returncode != 0:
                        stderr = result.stderr if result.stderr else ""
                        if stderr:
                            raise NonZeroExitWithStdErr(cmd, result.returncode, stderr)
                        else:
                            raise CommandFailed(cmd, result.returncode)
                else:
                    result = self._run_git(args)

                duration_ms = (self.clock.time() - start_time) * 1000

                # Parse output into (status, path) tuples
                files = []
                for line in result.stdout.strip().split('\n'):
                    if not line:
                        continue
                    parts = line.split('\t', 1)
                    if len(parts) == 2:
                        status = parts[0]
                        path = parts[1]
                        files.append((status, path))

                # Set span attributes
                span.set_attribute("command", " ".join(["git"] + args))
                span.set_attribute("duration_ms", duration_ms)
                span.set_attribute("returncode", result.returncode)
                span.set_attribute("retry_count", retry_count)
                if result.stderr:
                    stderr_preview = result.stderr[:200]
                    span.set_attribute("stderr_preview", stderr_preview)

                return files

            except Exception as e:
                # Record failure in span
                if hasattr(e, 'returncode'):
                    span.set_attribute("returncode", e.returncode)
                if hasattr(e, 'stderr'):
                    stderr_preview = e.stderr[:200] if e.stderr else ""
                    span.set_attribute("stderr_preview", stderr_preview)
                span.set_attribute("error", str(e))
                raise

    def read_tree(
        self,
        ref: str,
        env: Optional[dict] = None,
    ) -> None:
        """Read tree object into the index.

        Args:
            ref: Tree-ish reference (e.g., 'HEAD', commit SHA)
            env: Optional environment dict (e.g., for GIT_INDEX_FILE)

        Raises:
            TimeoutExceeded: Command exceeded timeout
            NonZeroExitWithStdErr: Git command failed with stderr
            CommandFailed: Git command failed
        """
        method_name = "read_tree"

        with self._tracer.start_as_current_span(f"cli.provider.git.{method_name}") as span:
            try:
                start_time = self.clock.time()

                args = ["read-tree", ref]

                # Use custom environment if provided
                if env:
                    import subprocess as sp
                    cmd = ["git"] + args
                    result = sp.run(
                        cmd,
                        cwd=self.repo_root,
                        env=env,
                        capture_output=True,
                        text=True,
                        timeout=30,
                    )
                    if result.returncode != 0:
                        stderr = result.stderr if result.stderr else ""
                        if stderr:
                            raise NonZeroExitWithStdErr(cmd, result.returncode, stderr)
                        else:
                            raise CommandFailed(cmd, result.returncode)
                else:
                    result = self._run_git(args)

                duration_ms = (self.clock.time() - start_time) * 1000

                # Set span attributes
                span.set_attribute("command", " ".join(["git"] + args))
                span.set_attribute("duration_ms", duration_ms)
                span.set_attribute("returncode", result.returncode)
                if result.stderr:
                    stderr_preview = result.stderr[:200]
                    span.set_attribute("stderr_preview", stderr_preview)

            except Exception as e:
                # Record failure in span
                if hasattr(e, 'returncode'):
                    span.set_attribute("returncode", e.returncode)
                if hasattr(e, 'stderr'):
                    stderr_preview = e.stderr[:200] if e.stderr else ""
                    span.set_attribute("stderr_preview", stderr_preview)
                span.set_attribute("error", str(e))
                raise

    def add_intent_to_add(
        self,
        pathspec: list[str],
        env: Optional[dict] = None,
    ) -> None:
        """Add files to index as intent-to-add (without content).

        Args:
            pathspec: List of file paths/patterns to add
            env: Optional environment dict (e.g., for GIT_INDEX_FILE)

        Raises:
            TimeoutExceeded: Command exceeded timeout
            NonZeroExitWithStdErr: Git command failed with stderr
            CommandFailed: Git command failed
        """
        method_name = "add_intent_to_add"

        with self._tracer.start_as_current_span(f"cli.provider.git.{method_name}") as span:
            try:
                start_time = self.clock.time()

                args = ["add", "-N"] + pathspec

                # Use custom environment if provided
                # Don't raise on non-zero exit for add -N (files may already be tracked)
                # This matches the original behavior with check=False
                import subprocess as sp
                cmd = ["git"] + args
                result = sp.run(
                    cmd,
                    cwd=self.repo_root,
                    env=env if env else None,
                    capture_output=True,
                    text=True,
                    timeout=30,
                )

                duration_ms = (self.clock.time() - start_time) * 1000

                # Set span attributes
                span.set_attribute("command", " ".join(["git"] + args))
                span.set_attribute("duration_ms", duration_ms)
                span.set_attribute("returncode", result.returncode)
                if result.stderr:
                    stderr_preview = result.stderr[:200]
                    span.set_attribute("stderr_preview", stderr_preview)

            except subprocess.TimeoutExpired as e:
                cmd = ["git"] + args
                if self.logger:
                    self.logger.warning(f"Git command timed out after 30s: {cmd}")
                raise TimeoutExceeded(cmd, 30) from e
            except Exception as e:
                # Record failure in span
                if hasattr(e, 'returncode'):
                    span.set_attribute("returncode", e.returncode)
                if hasattr(e, 'stderr'):
                    stderr_preview = e.stderr[:200] if e.stderr else ""
                    span.set_attribute("stderr_preview", stderr_preview)
                span.set_attribute("error", str(e))
                raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(min=0.5, max=8.0),
        retry=retry_if_exception_type(CommandFailed),
    )
    def diff(
        self,
        base_commit: Optional[str] = None,
        pathspec: Optional[list[str]] = None,
        env: Optional[dict] = None,
    ) -> str:
        """Generate diff output.

        Args:
            base_commit: Optional base commit to diff against (omit for working tree diff)
            pathspec: Optional list of paths to limit diff to
            env: Optional environment dict (e.g., for GIT_INDEX_FILE)

        Returns:
            Diff content as string

        Raises:
            TimeoutExceeded: Command exceeded timeout
            NonZeroExitWithStdErr: Git command failed with stderr
            CommandFailed: Git command failed
        """
        retry_count = 0
        method_name = "diff"

        with self._tracer.start_as_current_span(f"cli.provider.git.{method_name}") as span:
            try:
                start_time = self.clock.time()

                args = ["diff"]
                if base_commit:
                    args.append(base_commit)
                if pathspec:
                    args.append("--")
                    args.extend(pathspec)

                # Use custom environment if provided
                if env:
                    import subprocess as sp
                    cmd = ["git"] + args
                    result = sp.run(
                        cmd,
                        cwd=self.repo_root,
                        env=env,
                        capture_output=True,
                        text=True,
                        timeout=30,
                    )
                    if result.returncode != 0:
                        stderr = result.stderr if result.stderr else ""
                        if stderr:
                            raise NonZeroExitWithStdErr(cmd, result.returncode, stderr)
                        else:
                            raise CommandFailed(cmd, result.returncode)
                else:
                    result = self._run_git(args)

                duration_ms = (self.clock.time() - start_time) * 1000

                # Set span attributes
                span.set_attribute("command", " ".join(["git"] + args))
                span.set_attribute("duration_ms", duration_ms)
                span.set_attribute("returncode", result.returncode)
                span.set_attribute("retry_count", retry_count)
                if result.stderr:
                    stderr_preview = result.stderr[:200]
                    span.set_attribute("stderr_preview", stderr_preview)

                return result.stdout

            except Exception as e:
                # Record failure in span
                if hasattr(e, 'returncode'):
                    span.set_attribute("returncode", e.returncode)
                if hasattr(e, 'stderr'):
                    stderr_preview = e.stderr[:200] if e.stderr else ""
                    span.set_attribute("stderr_preview", stderr_preview)
                span.set_attribute("error", str(e))
                raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(min=0.5, max=8.0),
        retry=retry_if_exception_type(CommandFailed),
    )
    def diff_stat(
        self,
        base_commit: str,
        env: Optional[dict] = None,
    ) -> str:
        """Generate diff statistics.

        Args:
            base_commit: Base commit to diff against
            env: Optional environment dict (e.g., for GIT_INDEX_FILE)

        Returns:
            Diff stat output as string

        Raises:
            TimeoutExceeded: Command exceeded timeout
            NonZeroExitWithStdErr: Git command failed with stderr
            CommandFailed: Git command failed
        """
        retry_count = 0
        method_name = "diff_stat"

        with self._tracer.start_as_current_span(f"cli.provider.git.{method_name}") as span:
            try:
                start_time = self.clock.time()

                args = ["diff", "--stat", base_commit]

                # Use custom environment if provided
                if env:
                    import subprocess as sp
                    cmd = ["git"] + args
                    result = sp.run(
                        cmd,
                        cwd=self.repo_root,
                        env=env,
                        capture_output=True,
                        text=True,
                        timeout=30,
                    )
                    if result.returncode != 0:
                        stderr = result.stderr if result.stderr else ""
                        if stderr:
                            raise NonZeroExitWithStdErr(cmd, result.returncode, stderr)
                        else:
                            raise CommandFailed(cmd, result.returncode)
                else:
                    result = self._run_git(args)

                duration_ms = (self.clock.time() - start_time) * 1000

                # Set span attributes
                span.set_attribute("command", " ".join(["git"] + args))
                span.set_attribute("duration_ms", duration_ms)
                span.set_attribute("returncode", result.returncode)
                span.set_attribute("retry_count", retry_count)
                if result.stderr:
                    stderr_preview = result.stderr[:200]
                    span.set_attribute("stderr_preview", stderr_preview)

                return result.stdout.strip()

            except Exception as e:
                # Record failure in span
                if hasattr(e, 'returncode'):
                    span.set_attribute("returncode", e.returncode)
                if hasattr(e, 'stderr'):
                    stderr_preview = e.stderr[:200] if e.stderr else ""
                    span.set_attribute("stderr_preview", stderr_preview)
                span.set_attribute("error", str(e))
                raise

    def apply_cached(
        self,
        diff_file: str,
        env: Optional[dict] = None,
    ) -> subprocess.CompletedProcess:
        """Apply patch to index only (not working tree).

        Args:
            diff_file: Path to diff file to apply
            env: Optional environment dict (e.g., for GIT_INDEX_FILE)

        Returns:
            CompletedProcess result (may have non-zero returncode on conflict)

        Raises:
            TimeoutExceeded: Command exceeded timeout
        """
        method_name = "apply_cached"

        with self._tracer.start_as_current_span(f"cli.provider.git.{method_name}") as span:
            try:
                start_time = self.clock.time()

                args = ["apply", "--cached", str(diff_file)]

                # Use custom environment if provided
                # Don't raise on non-zero exit (conflicts are expected)
                import subprocess as sp
                cmd = ["git"] + args
                result = sp.run(
                    cmd,
                    cwd=self.repo_root,
                    env=env if env else None,
                    capture_output=True,
                    text=True,
                    timeout=30,
                )

                duration_ms = (self.clock.time() - start_time) * 1000

                # Set span attributes
                span.set_attribute("command", " ".join(["git"] + args))
                span.set_attribute("duration_ms", duration_ms)
                span.set_attribute("returncode", result.returncode)
                if result.stderr:
                    stderr_preview = result.stderr[:200]
                    span.set_attribute("stderr_preview", stderr_preview)

                return result

            except subprocess.TimeoutExpired as e:
                cmd = ["git"] + args
                if self.logger:
                    self.logger.warning(f"Git command timed out after 30s: {cmd}")
                raise TimeoutExceeded(cmd, 30) from e
            except Exception as e:
                # Record failure in span
                if hasattr(e, 'returncode'):
                    span.set_attribute("returncode", e.returncode)
                if hasattr(e, 'stderr'):
                    stderr_preview = e.stderr[:200] if e.stderr else ""
                    span.set_attribute("stderr_preview", stderr_preview)
                span.set_attribute("error", str(e))
                raise

    def status_porcelain_z(
        self,
    ) -> str:
        """Get git status in porcelain format with null separators.

        Returns:
            Status output in porcelain -z format

        Raises:
            TimeoutExceeded: Command exceeded timeout
            NonZeroExitWithStdErr: Git command failed with stderr
            CommandFailed: Git command failed
        """
        method_name = "status_porcelain_z"

        with self._tracer.start_as_current_span(f"cli.provider.git.{method_name}") as span:
            try:
                start_time = self.clock.time()

                args = ["status", "--porcelain", "-z"]
                result = self._run_git(args)

                duration_ms = (self.clock.time() - start_time) * 1000

                # Set span attributes
                span.set_attribute("command", " ".join(["git"] + args))
                span.set_attribute("duration_ms", duration_ms)
                span.set_attribute("returncode", result.returncode)
                if result.stderr:
                    stderr_preview = result.stderr[:200]
                    span.set_attribute("stderr_preview", stderr_preview)

                return result.stdout

            except Exception as e:
                # Record failure in span
                if hasattr(e, 'returncode'):
                    span.set_attribute("returncode", e.returncode)
                if hasattr(e, 'stderr'):
                    stderr_preview = e.stderr[:200] if e.stderr else ""
                    span.set_attribute("stderr_preview", stderr_preview)
                span.set_attribute("error", str(e))
                raise
