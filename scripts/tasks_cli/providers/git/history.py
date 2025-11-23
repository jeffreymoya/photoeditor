"""Git history mixin for commit, branch, and ref operations.

Part of task-cli-modularization M2.2 decomposition.
"""

from typing import Optional

from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from ..exceptions import CommandFailed, NonZeroExitWithStdErr


class GitHistoryMixin:
    """Mixin providing git operations for commit history, branches, and refs.

    This mixin requires the including class to provide:
    - self._run_git(args, timeout, capture_output)
    - self._tracer (OpenTelemetry tracer)
    - self.clock (time module or mock)
    - self.logger (optional logger)
    """

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
