"""
Unit tests for output.py module.

Tests stream routing, JSON formatting, warning collection, and response
structure per task-context-cache-hardening proposal Section 3.2.

Key test coverage:
- JSON mode vs text mode stream routing
- JSON output to stdout only
- Warnings to stderr in JSON mode, stdout in text mode
- Structured warning collection
- Standardized response formatting
- Warning deduplication and ordering
"""

import json
import sys
from datetime import datetime, timezone
from io import StringIO
from typing import Any, Dict

import pytest

from ..output import (
    add_warning,
    clear_warnings,
    collect_warnings,
    format_error_response,
    format_json_response,
    format_success_response,
    is_json_mode,
    print_json,
    print_warning,
    set_json_mode,
)


class TestModeManagement:
    """Test JSON mode enable/disable and state tracking."""

    def test_json_mode_default_disabled(self):
        """JSON mode should be disabled by default."""
        # Reset state
        set_json_mode(False)
        assert is_json_mode() is False

    def test_enable_json_mode(self):
        """Should enable JSON mode."""
        set_json_mode(True)
        assert is_json_mode() is True
        # Reset
        set_json_mode(False)

    def test_disable_json_mode(self):
        """Should disable JSON mode."""
        set_json_mode(True)
        set_json_mode(False)
        assert is_json_mode() is False

    def test_mode_toggle(self):
        """Should toggle between modes correctly."""
        set_json_mode(False)
        assert is_json_mode() is False

        set_json_mode(True)
        assert is_json_mode() is True

        set_json_mode(False)
        assert is_json_mode() is False


class TestPrintJson:
    """Test JSON output routing to stdout."""

    def test_json_output_to_stdout(self, monkeypatch):
        """JSON output should go to stdout only."""
        stdout_buffer = StringIO()
        stderr_buffer = StringIO()
        monkeypatch.setattr(sys, 'stdout', stdout_buffer)
        monkeypatch.setattr(sys, 'stderr', stderr_buffer)

        data = {"message": "test", "value": 42}
        print_json(data)

        # Check stdout has JSON
        stdout_content = stdout_buffer.getvalue()
        assert stdout_content
        parsed = json.loads(stdout_content)
        assert parsed == data

        # Check stderr is empty
        assert stderr_buffer.getvalue() == ""

    def test_json_formatting(self, monkeypatch):
        """JSON should be formatted with 2-space indentation."""
        stdout_buffer = StringIO()
        monkeypatch.setattr(sys, 'stdout', stdout_buffer)

        data = {"a": 1, "b": {"c": 2}}
        print_json(data)

        output = stdout_buffer.getvalue()
        # Should have indentation (not single-line)
        assert '\n' in output
        assert '  ' in output  # 2-space indent

    def test_json_utf8_support(self, monkeypatch):
        """JSON should preserve UTF-8 characters."""
        stdout_buffer = StringIO()
        monkeypatch.setattr(sys, 'stdout', stdout_buffer)

        data = {"message": "Testing UTF-8: 日本語, émojis: 🎉"}
        print_json(data)

        output = stdout_buffer.getvalue()
        parsed = json.loads(output)
        assert parsed["message"] == "Testing UTF-8: 日本語, émojis: 🎉"


class TestPrintWarning:
    """Test warning output routing based on mode."""

    def test_warning_to_stderr_in_json_mode(self, monkeypatch):
        """Warnings should go to stderr when JSON mode enabled."""
        stdout_buffer = StringIO()
        stderr_buffer = StringIO()
        monkeypatch.setattr(sys, 'stdout', stdout_buffer)
        monkeypatch.setattr(sys, 'stderr', stderr_buffer)

        set_json_mode(True)
        print_warning("Test warning")

        # Check stderr has warning
        stderr_content = stderr_buffer.getvalue()
        assert "[WARNING] Test warning" in stderr_content

        # Check stdout is empty
        assert stdout_buffer.getvalue() == ""

        # Reset
        set_json_mode(False)

    def test_warning_to_stdout_in_text_mode(self, monkeypatch):
        """Warnings should go to stdout when JSON mode disabled."""
        stdout_buffer = StringIO()
        stderr_buffer = StringIO()
        monkeypatch.setattr(sys, 'stdout', stdout_buffer)
        monkeypatch.setattr(sys, 'stderr', stderr_buffer)

        set_json_mode(False)
        print_warning("Test warning")

        # Check stdout has warning
        stdout_content = stdout_buffer.getvalue()
        assert "[WARNING] Test warning" in stdout_content

        # Check stderr is empty
        assert stderr_buffer.getvalue() == ""

    def test_warning_level_formatting(self, monkeypatch):
        """Warning level should be formatted correctly."""
        stdout_buffer = StringIO()
        monkeypatch.setattr(sys, 'stdout', stdout_buffer)

        set_json_mode(False)
        print_warning("Critical issue", level="error")

        output = stdout_buffer.getvalue()
        assert "[ERROR] Critical issue" in output

    def test_warning_level_uppercase(self, monkeypatch):
        """Warning level should be uppercased."""
        stdout_buffer = StringIO()
        monkeypatch.setattr(sys, 'stdout', stdout_buffer)

        set_json_mode(False)
        print_warning("Info message", level="info")

        output = stdout_buffer.getvalue()
        assert "[INFO] Info message" in output


class TestWarningCollection:
    """Test warning collection and retrieval."""

    def setup_method(self):
        """Clear warnings before each test."""
        clear_warnings()
        set_json_mode(False)

    def test_add_warning_collects(self, monkeypatch):
        """add_warning should collect warnings for later retrieval."""
        # Suppress output
        monkeypatch.setattr(sys, 'stdout', StringIO())

        add_warning("First warning")
        add_warning("Second warning")

        warnings = collect_warnings()
        assert len(warnings) == 2
        assert warnings[0]["message"] == "First warning"
        assert warnings[1]["message"] == "Second warning"

    def test_warning_structure(self, monkeypatch):
        """Collected warnings should have required fields."""
        monkeypatch.setattr(sys, 'stdout', StringIO())

        add_warning("Test warning", level="error")

        warnings = collect_warnings()
        warning = warnings[0]

        # Check required fields
        assert "timestamp" in warning
        assert "level" in warning
        assert "message" in warning

        # Check values
        assert warning["level"] == "error"
        assert warning["message"] == "Test warning"

        # Timestamp should be ISO 8601
        datetime.fromisoformat(warning["timestamp"])

    def test_warning_timestamp_utc(self, monkeypatch):
        """Warning timestamps should be in UTC."""
        monkeypatch.setattr(sys, 'stdout', StringIO())

        add_warning("Test")

        warnings = collect_warnings()
        timestamp_str = warnings[0]["timestamp"]

        # Should parse as ISO 8601 with timezone
        dt = datetime.fromisoformat(timestamp_str)
        assert dt.tzinfo is not None

    def test_clear_warnings(self, monkeypatch):
        """clear_warnings should reset collection."""
        monkeypatch.setattr(sys, 'stdout', StringIO())

        add_warning("Warning 1")
        add_warning("Warning 2")
        assert len(collect_warnings()) == 2

        clear_warnings()
        assert len(collect_warnings()) == 0

    def test_warnings_sorted_by_timestamp(self, monkeypatch):
        """Collected warnings should be sorted by timestamp."""
        monkeypatch.setattr(sys, 'stdout', StringIO())

        add_warning("First")
        add_warning("Second")
        add_warning("Third")

        warnings = collect_warnings()

        # Timestamps should be in ascending order
        timestamps = [w["timestamp"] for w in warnings]
        assert timestamps == sorted(timestamps)


class TestFormatJsonResponse:
    """Test standardized JSON response formatting."""

    def test_success_response_structure(self):
        """Success response should have correct structure."""
        response = format_json_response(
            success=True,
            data={"result": "value"},
            error=None
        )

        assert response["success"] is True
        assert response["data"] == {"result": "value"}
        assert response["error"] is None

    def test_error_response_structure(self):
        """Error response should have correct structure."""
        error_obj = {
            "code": "VALIDATION_ERROR",
            "message": "Invalid input",
            "details": {"field": "name"}
        }

        response = format_json_response(
            success=False,
            data=None,
            error=error_obj
        )

        assert response["success"] is False
        assert response["data"] is None
        assert response["error"] == error_obj

    def test_minimal_success_response(self):
        """Success response with minimal data."""
        response = format_json_response(success=True)

        assert response["success"] is True
        assert response["data"] is None
        assert response["error"] is None

    def test_minimal_error_response(self):
        """Error response with minimal data."""
        response = format_json_response(success=False)

        assert response["success"] is False
        assert response["data"] is None
        assert response["error"] is None


class TestFormatErrorResponse:
    """Test error response convenience function."""

    def test_error_response_basic(self):
        """Should create standardized error response."""
        response = format_error_response(
            code="NOT_FOUND",
            message="Task not found"
        )

        assert response["success"] is False
        assert response["data"] is None
        assert response["error"]["code"] == "NOT_FOUND"
        assert response["error"]["message"] == "Task not found"
        assert response["error"]["details"] == {}  # Empty dict, not None

    def test_error_response_with_details(self):
        """Should include optional details."""
        response = format_error_response(
            code="VALIDATION_ERROR",
            message="Invalid task format",
            details={"line": 42, "column": 10}
        )

        assert response["error"]["details"] == {"line": 42, "column": 10}

    def test_error_response_structure_complete(self):
        """Error response should match schema spec."""
        response = format_error_response(
            code="DEPENDENCY_CYCLE",
            message="Circular dependency detected",
            details={"cycle": ["TASK-001", "TASK-002", "TASK-001"]}
        )

        # Check top-level structure
        assert "success" in response
        assert "data" in response
        assert "error" in response

        # Check error object structure
        error = response["error"]
        assert "code" in error
        assert "message" in error
        assert "details" in error


class TestFormatSuccessResponse:
    """Test success response convenience function."""

    def test_success_response_basic(self):
        """Should create standardized success response."""
        response = format_success_response(
            data={"tasks": [{"id": "TASK-001"}]}
        )

        assert response["success"] is True
        assert response["data"]["tasks"] == [{"id": "TASK-001"}]
        assert response["error"] is None

    def test_success_response_empty_data(self):
        """Should handle empty data dict."""
        response = format_success_response(data={})

        assert response["success"] is True
        assert response["data"] == {}
        assert response["error"] is None

    def test_success_response_nested_data(self):
        """Should preserve nested data structures."""
        data = {
            "task": {
                "id": "TASK-001",
                "dependencies": ["TASK-002"],
                "metadata": {"priority": "P0"}
            }
        }

        response = format_success_response(data=data)

        assert response["data"] == data


class TestIntegration:
    """Integration tests for output module."""

    def setup_method(self):
        """Reset state before each test."""
        clear_warnings()
        set_json_mode(False)

    def test_json_mode_workflow(self, monkeypatch):
        """Test complete workflow in JSON mode."""
        stdout_buffer = StringIO()
        stderr_buffer = StringIO()
        monkeypatch.setattr(sys, 'stdout', stdout_buffer)
        monkeypatch.setattr(sys, 'stderr', stderr_buffer)

        # Enable JSON mode
        set_json_mode(True)

        # Add warnings (should go to stderr)
        add_warning("Warning 1")
        add_warning("Warning 2", level="error")

        # Output JSON response (should go to stdout)
        response = format_success_response(data={"result": "ok"})
        print_json(response)

        # Verify stdout has only JSON
        stdout_content = stdout_buffer.getvalue()
        json.loads(stdout_content)  # Should parse cleanly

        # Verify stderr has warnings
        stderr_content = stderr_buffer.getvalue()
        assert "[WARNING] Warning 1" in stderr_content
        assert "[ERROR] Warning 2" in stderr_content

        # Verify no JSON in stderr
        assert "{" not in stderr_content

    def test_text_mode_workflow(self, monkeypatch):
        """Test complete workflow in text mode."""
        stdout_buffer = StringIO()
        stderr_buffer = StringIO()
        monkeypatch.setattr(sys, 'stdout', stdout_buffer)
        monkeypatch.setattr(sys, 'stderr', stderr_buffer)

        # Text mode (default)
        set_json_mode(False)

        # Add warnings (should go to stdout)
        add_warning("Warning 1")

        # Output JSON (still to stdout)
        print_json({"result": "ok"})

        # Verify everything in stdout
        stdout_content = stdout_buffer.getvalue()
        assert "[WARNING] Warning 1" in stdout_content
        assert '"result"' in stdout_content

        # Verify stderr is empty
        assert stderr_buffer.getvalue() == ""

    def test_json_parseable_after_warnings(self, monkeypatch):
        """JSON output should be parseable even with warnings."""
        stdout_buffer = StringIO()
        stderr_buffer = StringIO()
        monkeypatch.setattr(sys, 'stdout', stdout_buffer)
        monkeypatch.setattr(sys, 'stderr', stderr_buffer)

        set_json_mode(True)

        # Add multiple warnings
        for i in range(10):
            add_warning(f"Warning {i}")

        # Output JSON
        data = {"tasks": list(range(100))}
        print_json(data)

        # stdout should be pure JSON (no warnings mixed in)
        stdout_content = stdout_buffer.getvalue()
        parsed = json.loads(stdout_content)
        assert parsed == data

        # All warnings in stderr
        stderr_content = stderr_buffer.getvalue()
        for i in range(10):
            assert f"Warning {i}" in stderr_content
