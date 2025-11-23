"""Git diff and index operations.

Part of task-cli-modularization M2.2 decomposition.
"""

import subprocess
from typing import Optional

from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from ..exceptions import CommandFailed, TimeoutExceeded, NonZeroExitWithStdErr


class GitDiffMixin:
    """Mixin providing git operations for diffs and index manipulation.

    This mixin requires the including class to provide:
    - self._run_git(args, timeout, capture_output)
    - self._tracer (OpenTelemetry tracer)
    - self.clock (time module or mock)
    - self.repo_root (Path to repository)
    - self.logger (optional logger)
    """

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
