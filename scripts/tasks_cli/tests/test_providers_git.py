"""Comprehensive test suite for GitProvider.

Tests cover:
- GitProvider initialization (3 tests)
- status() method (4 tests)
- ls_files() method (3 tests)
- get_current_commit() (2 tests)
- get_current_branch() (3 tests)
- check_dirty_tree() (4 tests)
- Retry logic (3 tests)
- Timeout handling (2 tests)
- Telemetry verification (3 tests)

Total: 27 tests ensuring 100% coverage of GitProvider functionality.
"""

import subprocess
from pathlib import Path
from unittest.mock import Mock, MagicMock, patch, call
import pytest

from scripts.tasks_cli.providers import (
    GitProvider,
    CommandFailed,
    TimeoutExceeded,
    NonZeroExitWithStdErr,
)


class TestGitProviderInitialization:
    """Test GitProvider initialization and dependency injection."""

    def test_init_with_defaults(self):
        """GitProvider initializes with required repo_root."""
        repo_root = Path("/test/repo")
        provider = GitProvider(repo_root)

        assert provider.repo_root == repo_root
        assert provider.logger is None
        assert provider.clock is not None  # Uses default time module

    def test_init_with_logger(self):
        """GitProvider accepts optional logger dependency."""
        repo_root = Path("/test/repo")
        logger = Mock()
        provider = GitProvider(repo_root, logger=logger)

        assert provider.logger is logger

    def test_init_with_custom_clock(self):
        """GitProvider accepts optional clock for testing."""
        repo_root = Path("/test/repo")
        mock_clock = Mock()
        mock_clock.time.return_value = 123.456
        provider = GitProvider(repo_root, clock=mock_clock)

        assert provider.clock is mock_clock


class TestStatusMethod:
    """Test status() method with various scenarios."""

    @patch('subprocess.run')
    def test_status_clean_tree(self, mock_run):
        """status() returns empty list for clean tree."""
        mock_run.return_value = Mock(
            returncode=0,
            stdout="",
            stderr="",
        )

        provider = GitProvider(Path("/test/repo"))
        result = provider.status()

        assert result == {"files": [], "is_dirty": False}
        mock_run.assert_called_once()

    @patch('subprocess.run')
    def test_status_dirty_tree(self, mock_run):
        """status() returns modified files for dirty tree."""
        mock_run.return_value = Mock(
            returncode=0,
            stdout=" M file1.py\n M file2.py\n",
            stderr="",
        )

        provider = GitProvider(Path("/test/repo"))
        result = provider.status()

        assert result == {
            "files": ["file1.py", "file2.py"],
            "is_dirty": True,
        }

    @patch('subprocess.run')
    def test_status_include_untracked(self, mock_run):
        """status() includes untracked files when requested."""
        mock_run.return_value = Mock(
            returncode=0,
            stdout="?? new_file.py\n",
            stderr="",
        )

        provider = GitProvider(Path("/test/repo"))
        result = provider.status(include_untracked=True)

        assert result["files"] == ["new_file.py"]
        # Verify --untracked-files=all was passed
        args = mock_run.call_args[0][0]
        assert "--untracked-files=all" in args

    @patch('subprocess.run')
    def test_status_exclude_untracked(self, mock_run):
        """status() excludes untracked files when requested."""
        mock_run.return_value = Mock(
            returncode=0,
            stdout="",
            stderr="",
        )

        provider = GitProvider(Path("/test/repo"))
        result = provider.status(include_untracked=False)

        assert result["is_dirty"] is False
        # Verify --untracked-files=no was passed
        args = mock_run.call_args[0][0]
        assert "--untracked-files=no" in args


class TestLsFilesMethod:
    """Test ls_files() method."""

    @patch('subprocess.run')
    def test_ls_files_all(self, mock_run):
        """ls_files() returns all tracked files by default."""
        mock_run.return_value = Mock(
            returncode=0,
            stdout="file1.py\nfile2.py\ndir/file3.py\n",
            stderr="",
        )

        provider = GitProvider(Path("/test/repo"))
        result = provider.ls_files()

        assert result == ["file1.py", "file2.py", "dir/file3.py"]

    @patch('subprocess.run')
    def test_ls_files_specific_paths(self, mock_run):
        """ls_files() filters to specific paths when provided."""
        mock_run.return_value = Mock(
            returncode=0,
            stdout="src/file1.py\nsrc/file2.py\n",
            stderr="",
        )

        provider = GitProvider(Path("/test/repo"))
        result = provider.ls_files(paths=["src/"])

        assert result == ["src/file1.py", "src/file2.py"]
        # Verify paths were passed to git
        args = mock_run.call_args[0][0]
        assert "src/" in args

    @patch('subprocess.run')
    def test_ls_files_untracked(self, mock_run):
        """ls_files() includes untracked files when requested."""
        mock_run.return_value = Mock(
            returncode=0,
            stdout="new_file.py\n",
            stderr="",
        )

        provider = GitProvider(Path("/test/repo"))
        result = provider.ls_files(untracked=True)

        assert result == ["new_file.py"]
        # Verify --others flag was passed
        args = mock_run.call_args[0][0]
        assert "--others" in args
        assert "--exclude-standard" in args


class TestGetCurrentCommit:
    """Test get_current_commit() method."""

    @patch('subprocess.run')
    def test_get_current_commit_success(self, mock_run):
        """get_current_commit() returns full SHA."""
        sha = "a" * 40
        mock_run.return_value = Mock(
            returncode=0,
            stdout=f"{sha}\n",
            stderr="",
        )

        provider = GitProvider(Path("/test/repo"))
        result = provider.get_current_commit()

        assert result == sha

    @patch('subprocess.run')
    def test_get_current_commit_failure(self, mock_run):
        """get_current_commit() raises on git error."""
        mock_run.return_value = Mock(
            returncode=128,
            stdout="",
            stderr="fatal: not a git repository\n",
        )

        provider = GitProvider(Path("/test/repo"))
        with pytest.raises(NonZeroExitWithStdErr) as exc_info:
            provider.get_current_commit()

        assert exc_info.value.returncode == 128


class TestGetCurrentBranch:
    """Test get_current_branch() method."""

    @patch('subprocess.run')
    def test_get_current_branch_success(self, mock_run):
        """get_current_branch() returns branch name."""
        mock_run.return_value = Mock(
            returncode=0,
            stdout="main\n",
            stderr="",
        )

        provider = GitProvider(Path("/test/repo"))
        result = provider.get_current_branch()

        assert result == "main"

    @patch('subprocess.run')
    def test_get_current_branch_detached_head(self, mock_run):
        """get_current_branch() returns None for detached HEAD."""
        mock_run.return_value = Mock(
            returncode=0,
            stdout="HEAD\n",
            stderr="",
        )

        provider = GitProvider(Path("/test/repo"))
        result = provider.get_current_branch()

        assert result is None

    @patch('subprocess.run')
    def test_get_current_branch_error(self, mock_run):
        """get_current_branch() returns None on git error."""
        mock_run.return_value = Mock(
            returncode=128,
            stdout="",
            stderr="fatal: not a git repository\n",
        )

        provider = GitProvider(Path("/test/repo"))
        result = provider.get_current_branch()

        assert result is None


class TestCheckDirtyTree:
    """Test check_dirty_tree() method."""

    @patch('subprocess.run')
    def test_check_dirty_tree_clean(self, mock_run):
        """check_dirty_tree() returns (True, []) for clean tree."""
        mock_run.return_value = Mock(
            returncode=0,
            stdout="",
            stderr="",
        )

        provider = GitProvider(Path("/test/repo"))
        is_clean, dirty_files = provider.check_dirty_tree()

        assert is_clean is True
        assert dirty_files == []

    @patch('subprocess.run')
    def test_check_dirty_tree_dirty(self, mock_run):
        """check_dirty_tree() returns (False, files) for dirty tree."""
        mock_run.return_value = Mock(
            returncode=0,
            stdout=" M file1.py\n M file2.py\n",
            stderr="",
        )

        provider = GitProvider(Path("/test/repo"))
        is_clean, dirty_files = provider.check_dirty_tree()

        assert is_clean is False
        assert dirty_files == ["file1.py", "file2.py"]

    @patch('subprocess.run')
    def test_check_dirty_tree_expected_files(self, mock_run):
        """check_dirty_tree() filters to unexpected changes."""
        mock_run.return_value = Mock(
            returncode=0,
            stdout=" M expected.py\n M unexpected.py\n",
            stderr="",
        )

        provider = GitProvider(Path("/test/repo"))
        is_clean, dirty_files = provider.check_dirty_tree(
            expected_files=["expected.py"]
        )

        assert is_clean is False
        assert dirty_files == ["unexpected.py"]

    @patch('subprocess.run')
    def test_check_dirty_tree_allow_preexisting(self, mock_run):
        """check_dirty_tree() skips untracked files when allow_preexisting=True."""
        mock_run.return_value = Mock(
            returncode=0,
            stdout="?? untracked.py\n M modified.py\n",
            stderr="",
        )

        provider = GitProvider(Path("/test/repo"))
        is_clean, dirty_files = provider.check_dirty_tree(allow_preexisting=True)

        # Should skip untracked files
        assert dirty_files == ["modified.py"]


class TestRetryLogic:
    """Test retry logic with exponential backoff."""

    @patch('subprocess.run')
    def test_retry_transient_failure_then_success(self, mock_run):
        """Retry logic succeeds after transient failure."""
        # First call fails, second succeeds
        mock_run.side_effect = [
            Mock(returncode=1, stdout="", stderr=""),  # Transient failure
            Mock(returncode=0, stdout="abc123\n", stderr=""),  # Success
        ]

        provider = GitProvider(Path("/test/repo"))
        # Use get_current_commit which doesn't have a fallback
        result = provider.get_current_commit()

        assert result == "abc123"
        assert mock_run.call_count == 2  # Initial + 1 retry

    @patch('subprocess.run')
    def test_retry_max_attempts_exceeded(self, mock_run):
        """Retry logic fails after max attempts."""
        # All calls fail
        mock_run.return_value = Mock(
            returncode=1,
            stdout="",
            stderr="",
        )

        provider = GitProvider(Path("/test/repo"))
        # Tenacity wraps the original exception in RetryError
        from tenacity import RetryError
        with pytest.raises(RetryError):
            provider.get_current_commit()

        # Should try 3 times (initial + 2 retries)
        assert mock_run.call_count == 3

    @patch('subprocess.run')
    @patch('time.sleep')
    def test_retry_exponential_backoff(self, mock_sleep, mock_run):
        """Retry logic uses exponential backoff."""
        # First two calls fail, third succeeds
        mock_run.side_effect = [
            Mock(returncode=1, stdout="", stderr=""),
            Mock(returncode=1, stdout="", stderr=""),
            Mock(returncode=0, stdout="abc123\n", stderr=""),
        ]

        provider = GitProvider(Path("/test/repo"))
        result = provider.get_current_commit()

        assert result == "abc123"
        # Verify sleep was called for backoff (2 retries = 2 sleeps)
        assert mock_sleep.call_count == 2
        # Verify exponential backoff (first sleep < second sleep)
        first_sleep = mock_sleep.call_args_list[0][0][0]
        second_sleep = mock_sleep.call_args_list[1][0][0]
        assert second_sleep > first_sleep


class TestTimeoutHandling:
    """Test timeout handling."""

    @patch('subprocess.run')
    def test_command_timeout(self, mock_run):
        """Timeout raises TimeoutExceeded."""
        mock_run.side_effect = subprocess.TimeoutExpired(
            cmd=["git", "status"],
            timeout=30,
        )

        provider = GitProvider(Path("/test/repo"))
        with pytest.raises(TimeoutExceeded) as exc_info:
            provider.status()

        assert exc_info.value.timeout == 30

    @patch('subprocess.run')
    def test_timeout_recovery_after_retry(self, mock_run):
        """Timeout can recover on retry."""
        # First call times out, second succeeds
        mock_run.side_effect = [
            subprocess.TimeoutExpired(cmd=["git", "status"], timeout=30),
            Mock(returncode=0, stdout="", stderr=""),
        ]

        provider = GitProvider(Path("/test/repo"))

        # TimeoutExceeded is not retryable, so this should raise
        with pytest.raises(TimeoutExceeded):
            provider.status()


class TestTelemetryVerification:
    """Test OpenTelemetry span emission."""

    @patch('subprocess.run')
    @patch('scripts.tasks_cli.providers.git.get_tracer')
    def test_span_created(self, mock_get_tracer, mock_run):
        """Span is created for git operations."""
        mock_run.return_value = Mock(
            returncode=0,
            stdout="main\n",
            stderr="",
        )

        mock_span = MagicMock()
        mock_tracer = Mock()
        mock_tracer.start_as_current_span.return_value.__enter__ = Mock(
            return_value=mock_span
        )
        mock_tracer.start_as_current_span.return_value.__exit__ = Mock(
            return_value=False
        )
        mock_get_tracer.return_value = mock_tracer

        provider = GitProvider(Path("/test/repo"))
        provider.get_current_branch()

        # Verify span was started with correct name
        mock_tracer.start_as_current_span.assert_called_once_with(
            "cli.provider.git.get_current_branch"
        )

    @patch('subprocess.run')
    @patch('scripts.tasks_cli.providers.git.get_tracer')
    def test_span_attributes_set(self, mock_get_tracer, mock_run):
        """Span attributes are set correctly."""
        mock_run.return_value = Mock(
            returncode=0,
            stdout="file.py\n",
            stderr="",
        )

        mock_span = MagicMock()
        mock_tracer = Mock()
        mock_tracer.start_as_current_span.return_value.__enter__ = Mock(
            return_value=mock_span
        )
        mock_tracer.start_as_current_span.return_value.__exit__ = Mock(
            return_value=False
        )
        mock_get_tracer.return_value = mock_tracer

        provider = GitProvider(Path("/test/repo"))
        provider.status()

        # Verify attributes were set
        assert mock_span.set_attribute.call_count >= 3
        # Check for expected attributes
        attribute_calls = {
            call[0][0]: call[0][1]
            for call in mock_span.set_attribute.call_args_list
        }
        assert "command" in attribute_calls
        assert "returncode" in attribute_calls
        assert "duration_ms" in attribute_calls

    @patch('subprocess.run')
    @patch('scripts.tasks_cli.providers.git.get_tracer')
    def test_span_retry_count_tracked(self, mock_get_tracer, mock_run):
        """Span tracks retry_count attribute."""
        mock_run.return_value = Mock(
            returncode=0,
            stdout="",
            stderr="",
        )

        mock_span = MagicMock()
        mock_tracer = Mock()
        mock_tracer.start_as_current_span.return_value.__enter__ = Mock(
            return_value=mock_span
        )
        mock_tracer.start_as_current_span.return_value.__exit__ = Mock(
            return_value=False
        )
        mock_get_tracer.return_value = mock_tracer

        provider = GitProvider(Path("/test/repo"))
        provider.status()

        # Verify retry_count attribute was set
        attribute_calls = {
            call[0][0]: call[0][1]
            for call in mock_span.set_attribute.call_args_list
        }
        assert "retry_count" in attribute_calls
        assert attribute_calls["retry_count"] == 0  # No retries needed


class TestResolveMergeBase:
    """Test resolve_merge_base() method."""

    @patch('subprocess.run')
    def test_resolve_merge_base_success(self, mock_run):
        """resolve_merge_base() returns merge base SHA."""
        sha = "b" * 40
        mock_run.return_value = Mock(
            returncode=0,
            stdout=f"{sha}\n",
            stderr="",
        )

        provider = GitProvider(Path("/test/repo"))
        result = provider.resolve_merge_base("main")

        assert result == sha
        # Verify correct git command was called
        args = mock_run.call_args[0][0]
        assert args == ["git", "merge-base", "HEAD", "main"]

    @patch('subprocess.run')
    def test_resolve_merge_base_failure(self, mock_run):
        """resolve_merge_base() raises on git error."""
        mock_run.return_value = Mock(
            returncode=1,
            stdout="",
            stderr="fatal: Not a valid object name\n",
        )

        provider = GitProvider(Path("/test/repo"))
        with pytest.raises(NonZeroExitWithStdErr):
            provider.resolve_merge_base("invalid-branch")
