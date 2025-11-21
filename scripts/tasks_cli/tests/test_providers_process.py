"""Tests for ProcessProvider.

Comprehensive test suite covering:
- ProcessProvider initialization
- Command execution (success, failure, timeout)
- Secret redaction in logs
- OpenTelemetry span emission
- Error handling and exception types

Standards compliance:
- Follows standards/testing-standards.md for test structure
- Uses unittest.mock for subprocess isolation
"""

import subprocess
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock

import pytest

from tasks_cli.providers import (
    ProcessProvider,
    CommandFailed,
    NonZeroExitWithStdErr,
    TimeoutExceeded,
)


class TestProcessProviderInitialization:
    """Tests for ProcessProvider initialization."""

    def test_init_with_no_args(self):
        """ProcessProvider initializes with default (None) logger and clock."""
        provider = ProcessProvider()
        assert provider._logger is None
        assert provider._clock is None
        assert provider._tracer is not None

    def test_init_with_logger_and_clock(self):
        """ProcessProvider initializes with provided logger and clock."""
        logger = Mock()
        clock = Mock()
        provider = ProcessProvider(logger=logger, clock=clock)
        assert provider._logger is logger
        assert provider._clock is clock
        assert provider._tracer is not None


class TestProcessProviderRunBasic:
    """Tests for basic run() execution."""

    @patch("subprocess.run")
    def test_run_success_basic(self, mock_run):
        """run() executes command successfully and returns CompletedProcess."""
        mock_run.return_value = subprocess.CompletedProcess(
            args=["echo", "hello"],
            returncode=0,
            stdout="hello\n",
            stderr="",
        )

        provider = ProcessProvider()
        result = provider.run(["echo", "hello"])

        assert result.returncode == 0
        assert result.stdout == "hello\n"
        assert result.stderr == ""
        mock_run.assert_called_once()

    @patch("subprocess.run")
    def test_run_captures_output_by_default(self, mock_run):
        """run() captures stdout/stderr by default (capture=True)."""
        mock_run.return_value = subprocess.CompletedProcess(
            args=["ls", "-la"],
            returncode=0,
            stdout="file1\nfile2\n",
            stderr="",
        )

        provider = ProcessProvider()
        provider.run(["ls", "-la"])

        call_kwargs = mock_run.call_args[1]
        assert call_kwargs["capture_output"] is True
        assert call_kwargs["text"] is True

    @patch("subprocess.run")
    def test_run_with_custom_env(self, mock_run):
        """run() passes custom environment variables to subprocess."""
        mock_run.return_value = subprocess.CompletedProcess(
            args=["printenv", "FOO"],
            returncode=0,
            stdout="bar\n",
            stderr="",
        )

        provider = ProcessProvider()
        custom_env = {"FOO": "bar", "BAZ": "qux"}
        provider.run(["printenv", "FOO"], env=custom_env)

        call_kwargs = mock_run.call_args[1]
        assert call_kwargs["env"] == custom_env

    @patch("subprocess.run")
    def test_run_with_custom_cwd(self, mock_run):
        """run() executes command in specified working directory."""
        mock_run.return_value = subprocess.CompletedProcess(
            args=["pwd"],
            returncode=0,
            stdout="/tmp/test\n",
            stderr="",
        )

        provider = ProcessProvider()
        custom_cwd = Path("/tmp/test")
        provider.run(["pwd"], cwd=custom_cwd)

        call_kwargs = mock_run.call_args[1]
        assert call_kwargs["cwd"] == custom_cwd


class TestProcessProviderErrorHandling:
    """Tests for error handling and exception types."""

    @patch("subprocess.run")
    def test_run_raises_command_failed_on_non_zero_exit_no_stderr(self, mock_run):
        """run() raises CommandFailed when command exits non-zero without stderr."""
        mock_run.return_value = subprocess.CompletedProcess(
            args=["false"],
            returncode=1,
            stdout="",
            stderr="",
        )

        provider = ProcessProvider()
        with pytest.raises(CommandFailed) as exc_info:
            provider.run(["false"])

        assert exc_info.value.returncode == 1
        assert exc_info.value.cmd == ["false"]

    @patch("subprocess.run")
    def test_run_raises_non_zero_exit_with_stderr(self, mock_run):
        """run() raises NonZeroExitWithStdErr when command fails with stderr output."""
        mock_run.return_value = subprocess.CompletedProcess(
            args=["cat", "nonexistent.txt"],
            returncode=1,
            stdout="",
            stderr="cat: nonexistent.txt: No such file or directory\n",
        )

        provider = ProcessProvider()
        with pytest.raises(NonZeroExitWithStdErr) as exc_info:
            provider.run(["cat", "nonexistent.txt"])

        assert exc_info.value.returncode == 1
        assert exc_info.value.cmd == ["cat", "nonexistent.txt"]
        assert "No such file or directory" in exc_info.value.stderr

    @patch("subprocess.run")
    def test_run_raises_timeout_exceeded(self, mock_run):
        """run() raises TimeoutExceeded when command execution exceeds timeout."""
        mock_run.side_effect = subprocess.TimeoutExpired(
            cmd=["sleep", "10"],
            timeout=1.0,
        )

        provider = ProcessProvider()
        with pytest.raises(TimeoutExceeded) as exc_info:
            provider.run(["sleep", "10"], timeout=1.0)

        assert exc_info.value.timeout == 1.0
        assert exc_info.value.cmd == ["sleep", "10"]

    @patch("subprocess.run")
    def test_run_check_false_does_not_raise_on_failure(self, mock_run):
        """run() with check=False returns result without raising on non-zero exit."""
        mock_run.return_value = subprocess.CompletedProcess(
            args=["false"],
            returncode=1,
            stdout="",
            stderr="error message",
        )

        provider = ProcessProvider()
        result = provider.run(["false"], check=False)

        assert result.returncode == 1
        assert result.stderr == "error message"


class TestProcessProviderSecretRedaction:
    """Tests for secret redaction in logs."""

    @patch("subprocess.run")
    def test_redact_single_secret(self, mock_run):
        """_redact() replaces single secret pattern with redaction marker."""
        provider = ProcessProvider()
        text = "password is secret123 and more text"
        redacted = provider._redact(text, ["secret123"])
        assert redacted == "password is ***REDACTED*** and more text"

    @patch("subprocess.run")
    def test_redact_multiple_secrets(self, mock_run):
        """_redact() replaces multiple secret patterns with redaction markers."""
        provider = ProcessProvider()
        text = "user secret123 has token abc456def"
        redacted = provider._redact(text, ["secret123", "abc456def"])
        assert redacted == "user ***REDACTED*** has token ***REDACTED***"

    @patch("subprocess.run")
    def test_redact_empty_patterns(self, mock_run):
        """_redact() skips empty patterns without errors."""
        provider = ProcessProvider()
        text = "no secrets here"
        redacted = provider._redact(text, ["", ""])
        assert redacted == "no secrets here"

    @patch("subprocess.run")
    def test_redact_no_secrets(self, mock_run):
        """_redact() returns text unchanged when no patterns provided."""
        provider = ProcessProvider()
        text = "plain text"
        redacted = provider._redact(text, [])
        assert redacted == "plain text"

    @patch("subprocess.run")
    def test_run_redacts_stdout_preview_only(self, mock_run):
        """run() redacts secrets in span attributes but not in actual result."""
        mock_run.return_value = subprocess.CompletedProcess(
            args=["echo", "secret123"],
            returncode=0,
            stdout="output with secret123 visible",
            stderr="",
        )

        provider = ProcessProvider()
        result = provider.run(["echo", "secret123"], redact=["secret123"])

        # Actual result should NOT be redacted
        assert result.stdout == "output with secret123 visible"


class TestProcessProviderTimeout:
    """Tests for timeout behavior."""

    @patch("subprocess.run")
    def test_timeout_exceeded_raised_on_timeout(self, mock_run):
        """run() raises TimeoutExceeded when subprocess times out."""
        mock_run.side_effect = subprocess.TimeoutExpired(
            cmd=["sleep", "infinity"],
            timeout=0.1,
        )

        provider = ProcessProvider()
        with pytest.raises(TimeoutExceeded) as exc_info:
            provider.run(["sleep", "infinity"], timeout=0.1)

        assert exc_info.value.timeout == 0.1

    @patch("subprocess.run")
    def test_timeout_within_limit(self, mock_run):
        """run() succeeds when command completes within timeout."""
        mock_run.return_value = subprocess.CompletedProcess(
            args=["echo", "fast"],
            returncode=0,
            stdout="fast\n",
            stderr="",
        )

        provider = ProcessProvider()
        result = provider.run(["echo", "fast"], timeout=10.0)

        assert result.returncode == 0
        call_kwargs = mock_run.call_args[1]
        assert call_kwargs["timeout"] == 10.0


class TestProcessProviderTelemetry:
    """Tests for OpenTelemetry span emission."""

    @patch("subprocess.run")
    def test_span_created_on_run(self, mock_run):
        """run() creates OpenTelemetry span with correct name."""
        mock_run.return_value = subprocess.CompletedProcess(
            args=["echo", "test"],
            returncode=0,
            stdout="test\n",
            stderr="",
        )

        provider = ProcessProvider()
        with patch.object(provider._tracer, "start_as_current_span") as mock_span:
            mock_context = MagicMock()
            mock_span.return_value.__enter__ = Mock(return_value=mock_context)
            mock_span.return_value.__exit__ = Mock(return_value=False)

            provider.run(["echo", "test"])

            mock_span.assert_called_once_with("cli.provider.process")

    @patch("subprocess.run")
    def test_span_attributes_set_correctly(self, mock_run):
        """run() sets span attributes for command, timeout, and returncode."""
        mock_run.return_value = subprocess.CompletedProcess(
            args=["ls", "-la"],
            returncode=0,
            stdout="file1\nfile2\n",
            stderr="",
        )

        provider = ProcessProvider()
        with patch.object(provider._tracer, "start_as_current_span") as mock_span:
            mock_context = MagicMock()
            mock_span.return_value.__enter__ = Mock(return_value=mock_context)
            mock_span.return_value.__exit__ = Mock(return_value=False)

            provider.run(["ls", "-la"], timeout=30.0)

            # Verify attributes were set
            assert mock_context.set_attribute.call_count >= 3
            calls = mock_context.set_attribute.call_args_list
            # Check that command, timeout, returncode were set
            call_args = [call[0] for call in calls]
            assert ("command", "ls") in call_args
            assert ("timeout", 30.0) in call_args
            assert ("returncode", 0) in call_args

    @patch("subprocess.run")
    def test_span_attributes_include_redacted_previews(self, mock_run):
        """run() includes redacted stdout/stderr previews in span attributes."""
        mock_run.return_value = subprocess.CompletedProcess(
            args=["echo", "secret"],
            returncode=0,
            stdout="output with secret123 token",
            stderr="",
        )

        provider = ProcessProvider()
        with patch.object(provider._tracer, "start_as_current_span") as mock_span:
            mock_context = MagicMock()
            mock_span.return_value.__enter__ = Mock(return_value=mock_context)
            mock_span.return_value.__exit__ = Mock(return_value=False)

            provider.run(["echo", "secret"], redact=["secret123"])

            # Verify stdout_preview was set with redacted content
            calls = mock_context.set_attribute.call_args_list
            call_args = [call[0] for call in calls]
            stdout_preview_calls = [
                call for call in call_args if call[0] == "stdout_preview"
            ]
            assert len(stdout_preview_calls) == 1
            assert "***REDACTED***" in stdout_preview_calls[0][1]


class TestProcessProviderIntegration:
    """Integration tests with real commands (marked for selective execution)."""

    @pytest.mark.integration
    def test_real_echo_command(self):
        """Integration test: run real echo command."""
        provider = ProcessProvider()
        result = provider.run(["echo", "hello world"])

        assert result.returncode == 0
        assert "hello world" in result.stdout

    @pytest.mark.integration
    def test_real_ls_command(self):
        """Integration test: run real ls command."""
        provider = ProcessProvider()
        result = provider.run(["ls", "-la"], cwd=Path("/tmp"))

        assert result.returncode == 0
        # /tmp should contain at least . and ..
        assert "." in result.stdout
