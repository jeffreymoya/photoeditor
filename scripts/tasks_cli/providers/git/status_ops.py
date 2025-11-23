"""Git status and file listing operations.

Part of task-cli-modularization M2.2 decomposition.
"""

from typing import Optional

from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from ..exceptions import CommandFailed


class GitStatusMixin:
    """Mixin providing git operations for status and file listing.

    This mixin requires the including class to provide:
    - self._run_git(args, timeout, capture_output)
    - self._tracer (OpenTelemetry tracer)
    - self.clock (time module or mock)
    """

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

    def status_porcelain_z(self) -> str:
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
