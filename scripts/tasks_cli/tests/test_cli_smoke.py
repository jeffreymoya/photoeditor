"""
Smoke tests for CLI integration.

Tests that CLI commands can be invoked without crashing due to:
- API signature mismatches
- Missing parameters
- Type errors (dict vs dataclass)
- Unreachable code paths

These tests don't validate full functionality, just that the command
handlers are properly wired and can execute without immediate errors.

IMPORTANT: Tests that modify repository state use fixtures to ensure
cleanup happens even if tests fail.
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
import shutil

import pytest


def run_cli(*args, expect_success=False, env_override=None):
    """
    Run CLI command and return (exit_code, stdout, stderr).

    Args:
        *args: CLI arguments
        expect_success: If True, asserts exit code is 0
        env_override: Optional dict of environment variables to override

    Returns:
        Tuple of (exit_code, stdout, stderr)
    """
    cmd = [sys.executable, "-m", "scripts.tasks_cli", *args]
    env = os.environ.copy()
    if env_override:
        env.update(env_override)

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        cwd=Path(__file__).parent.parent.parent.parent,
        env=env
    )

    if expect_success:
        assert result.returncode == 0, f"Command failed: {result.stderr}"

    return result.returncode, result.stdout, result.stderr


@pytest.fixture
def clean_test_ledger():
    """Fixture to clean up exception ledger test entries before and after tests."""
    repo_root = Path(__file__).parent.parent.parent.parent
    ledger_path = repo_root / "docs" / "compliance" / "context-cache-exceptions.json"
    lock_path = repo_root / "docs" / "compliance" / "context-cache-exceptions.lock"

    def cleanup():
        """Remove TASK-9999 test entries from ledger."""
        if ledger_path.exists():
            try:
                with open(ledger_path, 'r') as f:
                    ledger = json.load(f)
                original_count = len(ledger.get("exceptions", []))
                ledger["exceptions"] = [e for e in ledger.get("exceptions", []) if e.get("task_id") != "TASK-9999"]

                if ledger["exceptions"]:
                    with open(ledger_path, 'w') as f:
                        json.dump(ledger, f, indent=2)
                elif original_count > 0:
                    # Ledger is now empty after cleanup, remove files
                    ledger_path.unlink(missing_ok=True)
                    lock_path.unlink(missing_ok=True)
            except Exception:
                pass  # Ignore cleanup errors

    # Cleanup before test
    cleanup()

    yield

    # Cleanup after test (even if test fails)
    cleanup()


@pytest.fixture
def clean_test_agent_output():
    """Fixture to clean up test task agent output directories."""
    repo_root = Path(__file__).parent.parent.parent.parent
    test_output_dir = repo_root / ".agent-output" / "TASK-9999"

    # Remove before test
    if test_output_dir.exists():
        shutil.rmtree(test_output_dir, ignore_errors=True)

    yield

    # Remove after test (even if test fails)
    if test_output_dir.exists():
        shutil.rmtree(test_output_dir, ignore_errors=True)


class TestCLISmoke:
    """Smoke tests verifying CLI commands don't crash on invocation."""

    def test_help_commands_work(self):
        """All --help commands should succeed."""
        exit_code, stdout, stderr = run_cli("--help", expect_success=True)
        assert "usage:" in stdout.lower()

    def test_list_commands_work(self):
        """List commands should not crash (may return empty)."""
        # These should execute without TypeError/AttributeError
        run_cli("--list")
        run_cli("--list", "--format", "json")
        run_cli("--list-exceptions")
        run_cli("--list-exceptions", "--format", "json")
        run_cli("--list-quarantined")
        run_cli("--list-quarantined", "--format", "json")

    def test_json_output_parseable(self):
        """JSON output should be valid JSON."""
        commands_to_test = [
            ["--list", "--format", "json"],
            ["--list-exceptions", "--format", "json"],
            ["--list-quarantined", "--format", "json"],
        ]

        for cmd in commands_to_test:
            exit_code, stdout, stderr = run_cli(*cmd)
            try:
                json.loads(stdout)
            except json.JSONDecodeError as e:
                pytest.fail(
                    f"Invalid JSON from {' '.join(cmd)}: {e}\n"
                    f"stdout: {stdout}\n"
                    f"stderr: {stderr}"
                )

    def test_evidence_commands_exist(self):
        """Evidence commands should be callable (may fail with validation errors)."""
        # These tests verify the commands are wired, not that they succeed
        # We expect validation errors because we're not providing valid task IDs

        # attach-evidence should fail with validation error, not TypeError
        exit_code, stdout, stderr = run_cli(
            "--attach-evidence", "TASK-9999",
            "--type", "log",
            "--path", "/tmp/fake.log",
            "--description", "test"
        )
        # Should fail with validation error (exit code 10-19) not crash (exit code 1)
        assert exit_code != 1 or "TypeError" not in stderr

        # list-evidence should be callable
        exit_code, stdout, stderr = run_cli("--list-evidence", "TASK-9999")
        assert "TypeError" not in stderr

    def test_standards_excerpt_commands_exist(self):
        """Standards excerpt commands should be callable."""
        exit_code, stdout, stderr = run_cli(
            "--attach-standard", "TASK-9999",
            "--file", "standards/backend-tier.md",
            "--section", "Nonexistent Section"
        )
        # Should fail with FileNotFound or ValueError, not TypeError
        assert "TypeError" not in stderr

    def test_exception_ledger_commands_exist(self, clean_test_ledger):
        """
        Exception ledger commands should be callable.

        Uses fixture to ensure cleanup happens even if test fails.
        """
        # add-exception
        exit_code, stdout, stderr = run_cli(
            "--add-exception", "TASK-9999",
            "--exception-type", "malformed_yaml",
            "--message", "test error"
        )
        # Should complete or fail gracefully, not crash with TypeError
        assert "TypeError" not in stderr

        # list-exceptions
        exit_code, stdout, stderr = run_cli("--list-exceptions")
        assert "TypeError" not in stderr

    def test_qa_commands_exist(self, clean_test_agent_output):
        """
        QA recording commands should be callable.

        Uses fixture to ensure cleanup happens even if test fails.
        """
        exit_code, stdout, stderr = run_cli(
            "--record-qa", "TASK-9999",
            "--command", "pnpm typecheck",
            "--exit-code", "0",
            "--log-path", "/tmp/fake.log"
        )
        # Should fail with validation error or complete, not TypeError
        assert "TypeError" not in stderr

    def test_verify_worktree_command_exists(self):
        """Verify worktree command should be callable."""
        exit_code, stdout, stderr = run_cli(
            "--verify-worktree", "TASK-9999"
        )
        # Should fail gracefully if task doesn't exist, not crash
        assert "context_store.data" not in stderr  # The specific bug we fixed
        assert "AttributeError" not in stderr


class TestCLIAPISignatures:
    """Test that command handlers have correct API signatures."""

    def test_attach_evidence_signature(self):
        """attach_evidence should accept task_id and artifact_path."""
        from scripts.tasks_cli.commands import cmd_attach_evidence
        import inspect

        sig = inspect.signature(cmd_attach_evidence)
        # Should only take (args), not (args, repo_root)
        assert len(sig.parameters) == 1
        assert 'args' in sig.parameters

    def test_list_evidence_signature(self):
        """list_evidence should accept task_id parameter."""
        from scripts.tasks_cli.commands import cmd_list_evidence
        import inspect

        sig = inspect.signature(cmd_list_evidence)
        assert len(sig.parameters) == 1
        assert 'args' in sig.parameters

    def test_attach_standard_signature(self):
        """attach_standard should accept task_id parameter."""
        from scripts.tasks_cli.commands import cmd_attach_standard
        import inspect

        sig = inspect.signature(cmd_attach_standard)
        assert len(sig.parameters) == 1
        assert 'args' in sig.parameters

    def test_record_qa_typer_exists(self):
        """record_qa Typer command should exist in qa_commands module."""
        from scripts.tasks_cli.commands.qa_commands import record_qa
        # Typer commands use decorated functions - verify it exists
        assert callable(record_qa)

    def test_verify_worktree_typer_exists(self):
        """verify_worktree Typer command should exist in worktree_commands module."""
        from scripts.tasks_cli.commands.worktree_commands import verify_worktree
        # Typer commands use decorated functions - verify it exists
        assert callable(verify_worktree)


class TestErrorResponseFormat:
    """Test that error responses match schema."""

    def test_error_response_has_all_fields(self):
        """Error responses should include code, name, message, details, recovery_action."""
        from scripts.tasks_cli.output import format_error_response

        error = format_error_response(
            code="E001",
            message="Test error",
            name="TestError",
            recovery_action="Fix it"
        )

        error_obj = error["error"]
        assert "code" in error_obj
        assert "name" in error_obj
        assert "message" in error_obj
        assert "details" in error_obj
        assert "recovery_action" in error_obj

        assert error_obj["code"] == "E001"
        assert error_obj["name"] == "TestError"
        assert error_obj["message"] == "Test error"
        assert error_obj["recovery_action"] == "Fix it"

    def test_error_response_has_defaults(self):
        """Error responses should provide defaults for missing fields."""
        from scripts.tasks_cli.output import format_error_response

        error = format_error_response(
            code="E999",
            message="Test error"
        )

        error_obj = error["error"]
        assert error_obj["name"] == "Error"  # Default
        assert error_obj["recovery_action"] == "Check error details and retry"  # Default
        assert error_obj["details"] == {}  # Default
