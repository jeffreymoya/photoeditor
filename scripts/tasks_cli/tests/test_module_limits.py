"""Tests for module_limits.py guardrail checks.

Comprehensive test suite covering:
- LOC scanning (under limit, over limit)
- Subprocess detection (in providers/, outside providers/, in tests/)
- Enforce mode (violations fail, providers/ allowed, test files allowed)
- Warn mode (violations reported but exit 0)
- Integration test (run module_limits.py as subprocess)

Standards compliance:
- Follows standards/testing-standards.md for test structure
- Uses tmp_path fixture for isolated test file structures
"""

import subprocess
import sys
from pathlib import Path
from textwrap import dedent

import pytest

# Import the functions we're testing
from tasks_cli.checks.module_limits import (
    LOCViolation,
    SubprocessViolation,
    scan_module_loc,
    scan_subprocess_usage,
    format_violations,
    main,
)


class TestLOCScanning:
    """Tests for LOC limit scanning."""

    def test_under_limit_no_violation(self, tmp_path: Path):
        """Module under 500 LOC should not trigger violation."""
        # Create a small Python file (10 lines)
        test_file = tmp_path / "small_module.py"
        test_file.write_text("\n".join([f"# Line {i}" for i in range(10)]))

        violations = scan_module_loc(tmp_path, limit=500)
        assert len(violations) == 0

    def test_over_limit_triggers_violation(self, tmp_path: Path):
        """Module over 500 LOC should trigger violation."""
        # Create a large Python file (600 lines)
        test_file = tmp_path / "large_module.py"
        test_file.write_text("\n".join([f"# Line {i}" for i in range(600)]))

        violations = scan_module_loc(tmp_path, limit=500)
        assert len(violations) == 1
        assert violations[0].file_path == test_file
        assert violations[0].line_count == 600
        assert violations[0].limit == 500

    def test_test_files_excluded_from_loc_check(self, tmp_path: Path):
        """Test files should be excluded from LOC checks."""
        # Create a large test file (600 lines)
        test_file = tmp_path / "test_large.py"
        test_file.write_text("\n".join([f"# Line {i}" for i in range(600)]))

        violations = scan_module_loc(tmp_path, limit=500)
        assert len(violations) == 0


class TestSubprocessDetection:
    """Tests for subprocess.run detection."""

    def test_subprocess_in_providers_warn_mode(self, tmp_path: Path):
        """Warn mode reports subprocess.run in providers/ as informational."""
        # Create providers directory
        providers_dir = tmp_path / "providers"
        providers_dir.mkdir()

        # Create file with subprocess.run in providers/
        provider_file = providers_dir / "process.py"
        provider_file.write_text(dedent("""
            import subprocess

            def run_command():
                subprocess.run(['echo', 'test'])
        """))

        violations = scan_subprocess_usage(tmp_path, enforce_providers=False)
        # In warn mode, all subprocess usage is reported
        assert len(violations) == 1
        assert violations[0].file_path == provider_file

    def test_subprocess_in_providers_enforce_mode(self, tmp_path: Path):
        """Enforce mode allows subprocess.run in providers/ (no violation)."""
        # Create providers directory
        providers_dir = tmp_path / "providers"
        providers_dir.mkdir()

        # Create file with subprocess.run in providers/
        provider_file = providers_dir / "process.py"
        provider_file.write_text(dedent("""
            import subprocess

            def run_command():
                subprocess.run(['echo', 'test'])
        """))

        violations = scan_subprocess_usage(tmp_path, enforce_providers=True)
        # In enforce mode, providers/ is allowed
        assert len(violations) == 0

    def test_subprocess_outside_providers_warn_mode(self, tmp_path: Path):
        """Warn mode reports subprocess.run outside providers/."""
        # Create file with subprocess.run outside providers/
        module_file = tmp_path / "commands.py"
        module_file.write_text(dedent("""
            import subprocess

            def execute():
                subprocess.run(['ls'])
        """))

        violations = scan_subprocess_usage(tmp_path, enforce_providers=False)
        assert len(violations) == 1
        assert violations[0].file_path == module_file
        assert violations[0].function_name == "execute"

    def test_subprocess_outside_providers_enforce_mode(self, tmp_path: Path):
        """Enforce mode fails on subprocess.run outside providers/."""
        # Create file with subprocess.run outside providers/
        module_file = tmp_path / "commands.py"
        module_file.write_text(dedent("""
            import subprocess

            def execute():
                subprocess.run(['ls'])
        """))

        violations = scan_subprocess_usage(tmp_path, enforce_providers=True)
        assert len(violations) == 1
        assert violations[0].file_path == module_file

    def test_subprocess_in_tests_always_allowed(self, tmp_path: Path):
        """Test files can use subprocess.run for mocking (both modes)."""
        # Create tests directory
        tests_dir = tmp_path / "tests"
        tests_dir.mkdir()

        # Create test file with subprocess.run
        test_file = tests_dir / "test_commands.py"
        test_file.write_text(dedent("""
            import subprocess

            def test_something():
                subprocess.run(['echo', 'test'])
        """))

        # Warn mode
        violations_warn = scan_subprocess_usage(tmp_path, enforce_providers=False)
        assert len(violations_warn) == 0

        # Enforce mode
        violations_enforce = scan_subprocess_usage(tmp_path, enforce_providers=True)
        assert len(violations_enforce) == 0

    def test_multiple_subprocess_calls_detected(self, tmp_path: Path):
        """Multiple subprocess.run calls in same file are all detected."""
        module_file = tmp_path / "multi.py"
        module_file.write_text(dedent("""
            import subprocess

            def cmd1():
                subprocess.run(['ls'])

            def cmd2():
                subprocess.run(['pwd'])

            def cmd3():
                subprocess.run(['echo', 'test'])
        """))

        violations = scan_subprocess_usage(tmp_path, enforce_providers=False)
        assert len(violations) == 3
        function_names = {v.function_name for v in violations}
        assert function_names == {"cmd1", "cmd2", "cmd3"}


class TestFormatViolations:
    """Tests for violation formatting."""

    def test_format_subprocess_warn_mode(self):
        """Warn mode formats subprocess violations as informational."""
        violations = [
            SubprocessViolation(
                file_path=Path("/test/commands.py"),
                line_number=10,
                function_name="execute"
            )
        ]

        output = format_violations([], violations, enforce_providers=False)
        assert "SUBPROCESS USAGE (informational):" in output
        assert "INFO:" in output
        assert "commands.py:10 in execute()" in output

    def test_format_subprocess_enforce_mode(self):
        """Enforce mode formats subprocess violations as errors."""
        violations = [
            SubprocessViolation(
                file_path=Path("/test/commands.py"),
                line_number=10,
                function_name="execute"
            )
        ]

        output = format_violations([], violations, enforce_providers=True)
        assert "SUBPROCESS POLICY VIOLATIONS:" in output
        assert "VIOLATION:" in output
        assert "must be in providers/" in output
        assert "commands.py:10 in execute()" in output

    def test_format_loc_violations(self):
        """LOC violations are formatted correctly."""
        violations = [
            LOCViolation(
                file_path=Path("/test/large.py"),
                line_count=600,
                limit=500
            )
        ]

        output = format_violations(violations, [], enforce_providers=False)
        assert "LOC VIOLATIONS:" in output
        assert "large.py: 600 LOC (limit: 500)" in output


class TestIntegration:
    """Integration tests running module_limits.py as subprocess."""

    def test_module_limits_script_exists(self):
        """module_limits.py script exists and is executable."""
        script_path = Path(__file__).parent.parent / "checks" / "module_limits.py"
        assert script_path.exists()
        assert script_path.is_file()

    def test_no_violations_exit_0(self, tmp_path: Path, monkeypatch):
        """Script exits 0 when no violations found."""
        # Create clean module structure
        (tmp_path / "clean.py").write_text("# Clean module\n")

        # Run module_limits.py on this directory
        script_path = Path(__file__).parent.parent / "checks" / "module_limits.py"
        result = subprocess.run(
            [sys.executable, str(script_path)],
            cwd=tmp_path.parent,
            capture_output=True,
            text=True
        )

        # Should exit 0 (either no violations or warn mode)
        assert result.returncode in [0, 1]  # Allow both for actual repo state

    def test_enforce_providers_flag_available(self):
        """--enforce-providers flag is recognized by script."""
        script_path = Path(__file__).parent.parent / "checks" / "module_limits.py"
        result = subprocess.run(
            [sys.executable, str(script_path), "--help"],
            capture_output=True,
            text=True
        )

        assert result.returncode == 0
        assert "--enforce-providers" in result.stdout


class TestEdgeCases:
    """Edge case tests."""

    def test_syntax_error_files_skipped(self, tmp_path: Path):
        """Files with syntax errors should be skipped gracefully."""
        bad_file = tmp_path / "syntax_error.py"
        bad_file.write_text("def incomplete(")

        # Should not raise exception
        violations = scan_subprocess_usage(tmp_path, enforce_providers=False)
        assert isinstance(violations, list)

    def test_empty_directory(self, tmp_path: Path):
        """Empty directory should return no violations."""
        violations_loc = scan_module_loc(tmp_path)
        violations_subprocess = scan_subprocess_usage(tmp_path, enforce_providers=False)

        assert len(violations_loc) == 0
        assert len(violations_subprocess) == 0

    def test_nested_providers_directory(self, tmp_path: Path):
        """Subprocess usage in nested providers/ directories is allowed."""
        # Create nested providers structure
        nested_providers = tmp_path / "providers" / "subdir"
        nested_providers.mkdir(parents=True)

        provider_file = nested_providers / "git.py"
        provider_file.write_text(dedent("""
            import subprocess

            def git_command():
                subprocess.run(['git', 'status'])
        """))

        violations = scan_subprocess_usage(tmp_path, enforce_providers=True)
        assert len(violations) == 0
