"""
Unit tests for OutputChannel classes.

Tests the instance-based output system that replaces global state,
ensuring thread-safe operation for concurrent command execution.
"""

import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import List

import pytest

from scripts.tasks_cli.output import (
    BufferingOutputChannel,
    NullOutputChannel,
    OutputChannel,
)


class TestOutputChannel:
    """Tests for the base OutputChannel class."""

    def test_from_cli_flags(self) -> None:
        """OutputChannel.from_cli_flags creates instance with correct settings."""
        channel = OutputChannel.from_cli_flags(json_mode=True, verbose=True)
        assert channel.json_mode is True
        assert channel.verbose is True

    def test_emit_json(self) -> None:
        """emit_json outputs valid JSON to stdout."""
        channel = BufferingOutputChannel()
        data = {"key": "value", "count": 42}
        channel.emit_json(data)

        output = channel.get_stdout()
        parsed = json.loads(output)
        assert parsed == data

    def test_emit_text(self) -> None:
        """emit_text outputs plain text to stdout."""
        channel = BufferingOutputChannel()
        channel.emit_text("Hello, world!")

        assert "Hello, world!" in channel.get_stdout()

    def test_emit_warning_text_mode(self) -> None:
        """emit_warning outputs to stdout in text mode."""
        channel = BufferingOutputChannel(json_mode=False)
        channel.emit_warning("Test warning")

        assert "[WARNING] Test warning" in channel.get_stdout()
        assert channel.get_stderr() == ""

    def test_emit_warning_json_mode(self) -> None:
        """emit_warning outputs to stderr in JSON mode."""
        channel = BufferingOutputChannel(json_mode=True)
        channel.emit_warning("Test warning")

        assert "[WARNING] Test warning" in channel.get_stderr()
        assert "WARNING" not in channel.get_stdout()

    def test_emit_warning_custom_level(self) -> None:
        """emit_warning respects custom level."""
        channel = BufferingOutputChannel()
        channel.emit_warning("Critical issue", level="error")

        assert "[ERROR] Critical issue" in channel.get_stdout()

    def test_emit_verbose_when_enabled(self) -> None:
        """emit_verbose outputs when verbose mode is enabled."""
        channel = BufferingOutputChannel(verbose=True)
        channel.emit_verbose("Debug info")

        assert "[VERBOSE] Debug info" in channel.get_stderr()

    def test_emit_verbose_when_disabled(self) -> None:
        """emit_verbose is silent when verbose mode is disabled."""
        channel = BufferingOutputChannel(verbose=False)
        channel.emit_verbose("Debug info")

        assert channel.get_stderr() == ""

    def test_warnings_as_evidence(self) -> None:
        """warnings_as_evidence returns collected warnings."""
        channel = BufferingOutputChannel()
        channel.emit_warning("First warning")
        channel.emit_warning("Second warning", level="error")

        warnings = channel.warnings_as_evidence()
        assert len(warnings) == 2
        assert warnings[0]["message"] == "First warning"
        assert warnings[0]["level"] == "warning"
        assert warnings[1]["message"] == "Second warning"
        assert warnings[1]["level"] == "error"
        assert "timestamp" in warnings[0]

    def test_clear_warnings(self) -> None:
        """clear_warnings removes all collected warnings."""
        channel = BufferingOutputChannel()
        channel.emit_warning("Warning to clear")
        assert len(channel.warnings_as_evidence()) == 1

        channel.clear_warnings()
        assert len(channel.warnings_as_evidence()) == 0


class TestNullOutputChannel:
    """Tests for NullOutputChannel (silent/no-op output)."""

    def test_emit_json_discarded(self) -> None:
        """NullOutputChannel discards JSON output."""
        channel = NullOutputChannel()
        channel.emit_json({"key": "value"})
        # No exception raised, output discarded

    def test_emit_text_discarded(self) -> None:
        """NullOutputChannel discards text output."""
        channel = NullOutputChannel()
        channel.emit_text("Test message")
        # No exception raised, output discarded

    def test_emit_warning_collects_but_discards_output(self) -> None:
        """NullOutputChannel collects warnings but discards printed output."""
        channel = NullOutputChannel()
        channel.emit_warning("Silent warning")

        # Warning collected for evidence
        warnings = channel.warnings_as_evidence()
        assert len(warnings) == 1
        assert warnings[0]["message"] == "Silent warning"

    def test_emit_verbose_discarded(self) -> None:
        """NullOutputChannel discards verbose output."""
        channel = NullOutputChannel()
        channel.emit_verbose("Debug info")
        # No exception raised, output discarded


class TestBufferingOutputChannel:
    """Tests for BufferingOutputChannel (test assertions)."""

    def test_get_stdout(self) -> None:
        """get_stdout returns buffered stdout content."""
        channel = BufferingOutputChannel()
        channel.emit_text("Line 1")
        channel.emit_text("Line 2")

        stdout = channel.get_stdout()
        assert "Line 1" in stdout
        assert "Line 2" in stdout

    def test_get_stderr(self) -> None:
        """get_stderr returns buffered stderr content."""
        channel = BufferingOutputChannel(json_mode=True)
        channel.emit_warning("Warning 1")
        channel.emit_warning("Warning 2")

        stderr = channel.get_stderr()
        assert "Warning 1" in stderr
        assert "Warning 2" in stderr

    def test_get_json_output(self) -> None:
        """get_json_output parses JSON from stdout."""
        channel = BufferingOutputChannel()
        channel.emit_json({"id": 1, "name": "test"})

        outputs = channel.get_json_output()
        assert len(outputs) == 1
        assert outputs[0] == {"id": 1, "name": "test"}

    def test_clear_resets_all_buffers(self) -> None:
        """clear() resets stdout, stderr, and warnings."""
        channel = BufferingOutputChannel()
        channel.emit_text("Text")
        channel.emit_warning("Warning")

        channel.clear()

        assert channel.get_stdout() == ""
        assert channel.get_stderr() == ""
        assert len(channel.warnings_as_evidence()) == 0


class TestConcurrency:
    """Tests for thread-safe concurrent execution."""

    def test_no_warning_bleed_between_channels(self) -> None:
        """Concurrent channels do not share warning state."""
        results: List[List[str]] = []
        lock = threading.Lock()

        def worker(channel_id: int) -> None:
            channel = BufferingOutputChannel()
            for i in range(5):
                channel.emit_warning(f"Channel {channel_id} warning {i}")
                time.sleep(0.001)  # Small delay to interleave

            warnings = [w["message"] for w in channel.warnings_as_evidence()]
            with lock:
                results.append(warnings)

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(3)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # Each channel should only have its own warnings
        for i, warnings in enumerate(results):
            assert len(warnings) == 5
            for w in warnings:
                assert f"Channel {i}" in w

    def test_parallel_json_output_isolation(self) -> None:
        """Parallel channels produce isolated JSON output."""

        def emit_json(channel_id: int) -> dict:
            channel = BufferingOutputChannel()
            data = {"channel": channel_id, "data": list(range(10))}
            channel.emit_json(data)
            outputs = channel.get_json_output()
            return outputs[0] if outputs else {}

        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = [executor.submit(emit_json, i) for i in range(4)]
            results = [f.result() for f in futures]

        # Each result should match its channel ID
        for i, result in enumerate(results):
            assert result.get("channel") == i
            assert result.get("data") == list(range(10))

    def test_no_global_state_pollution(self) -> None:
        """OutputChannel instances don't affect global state."""
        from scripts.tasks_cli.output import _WARNINGS, clear_warnings

        clear_warnings()
        initial_count = len(_WARNINGS)

        # Use OutputChannel (should not touch globals)
        channel = BufferingOutputChannel()
        channel.emit_warning("Instance warning")

        # Global warnings unchanged
        assert len(_WARNINGS) == initial_count

    def test_parallel_command_simulation(self) -> None:
        """Simulate two CLI commands running in parallel threads.

        This test verifies that OutputChannel instances are isolated when
        multiple command handlers execute concurrently, as would happen
        with pytest -n (parallel test execution) or concurrent CLI invocations.
        """
        command_results: List[dict] = []
        lock = threading.Lock()

        def simulate_command(cmd_name: str, output_count: int) -> None:
            """Simulate a CLI command with its own OutputChannel."""
            channel = BufferingOutputChannel(json_mode=True)

            # Simulate command work with output
            for i in range(output_count):
                channel.emit_warning(f"{cmd_name}: processing step {i}")
                time.sleep(0.002)  # Interleave with other commands

            # Final JSON output
            channel.emit_json({
                "command": cmd_name,
                "steps_completed": output_count,
                "warnings_count": len(channel.warnings_as_evidence()),
            })

            with lock:
                command_results.append({
                    "name": cmd_name,
                    "json_output": channel.get_json_output(),
                    "warnings": channel.warnings_as_evidence(),
                    "stderr": channel.get_stderr(),
                })

        # Run two commands in parallel
        threads = [
            threading.Thread(target=simulate_command, args=("list", 5)),
            threading.Thread(target=simulate_command, args=("validate", 3)),
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # Verify isolation
        assert len(command_results) == 2

        for result in command_results:
            name = result["name"]
            json_out = result["json_output"]
            warnings = result["warnings"]

            # JSON output matches command
            assert len(json_out) == 1
            assert json_out[0]["command"] == name

            # Warnings only from this command
            expected_count = 5 if name == "list" else 3
            assert len(warnings) == expected_count
            for w in warnings:
                assert name in w["message"]

            # No cross-contamination
            other_name = "validate" if name == "list" else "list"
            assert other_name not in result["stderr"]
