"""
Unit tests for QA log parsing functions.

Tests coverage for lint, typecheck, test, and coverage log parsing,
plus drift detection algorithm.
"""

import tempfile
from pathlib import Path

from tasks_cli.qa_parsing import (
    _parse_coverage_log,
    _parse_lint_log,
    _parse_test_log,
    _parse_typecheck_log,
    detect_qa_drift,
    parse_qa_log,
)
from tasks_cli.context_store import (
    QACommandResult,
    QACommandSummary,
    QACoverageSummary,
    QAResults,
)


# ============================================================================
# Lint Log Parsing Tests
# ============================================================================

def test_parse_lint_log_eslint_format():
    """Test parsing ESLint output with standard format."""
    content = """
    /path/to/file.ts
      5:10  error    'x' is defined but never used  @typescript-eslint/no-unused-vars
      8:15  warning  Missing return type               @typescript-eslint/explicit-function-return-type

    ✖ 2 problems (1 error, 1 warning)
    """

    result = _parse_lint_log(content)

    assert result.lint_errors == 1
    assert result.lint_warnings == 1


def test_parse_lint_log_ruff_format():
    """Test parsing Ruff output."""
    content = """
    scripts/tasks_cli/context_store.py:42:5: E501 line too long (120 > 88 characters)
    scripts/tasks_cli/context_store.py:89:10: F841 local variable 'x' is assigned to but never used

    Found 2 errors.
    """

    result = _parse_lint_log(content)

    assert result.lint_errors == 2


def test_parse_lint_log_individual_errors():
    """Test parsing lint output by counting individual error/warning lines."""
    content = """
    file1.ts:5:10: error no-unused-vars
    file1.ts:8:15: warning missing-return-type
    file2.ts:12:3: error no-console
    """

    result = _parse_lint_log(content)

    assert result.lint_errors == 2
    assert result.lint_warnings == 1


def test_parse_lint_log_no_errors():
    """Test parsing lint output with no errors."""
    content = """
    ✔ No problems found.
    """

    result = _parse_lint_log(content)

    assert result.lint_errors is None
    assert result.lint_warnings is None


# ============================================================================
# Typecheck Log Parsing Tests
# ============================================================================

def test_parse_typecheck_log_tsc_format():
    """Test parsing TypeScript tsc output."""
    content = """
    src/App.tsx(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
    src/utils.ts(25,10): error TS2339: Property 'foo' does not exist on type 'Bar'.
    src/index.ts(5,1): error TS1005: ',' expected.

    Found 3 errors.
    """

    result = _parse_typecheck_log(content)

    assert result.type_errors == 3


def test_parse_typecheck_log_pyright_format():
    """Test parsing pyright output."""
    content = """
    /path/to/file.py:10:5 - error: Type "str" cannot be assigned to type "int"
    /path/to/file.py:25:10 - error: Argument of type "float" cannot be assigned to parameter of type "int"

    2 errors, 0 warnings
    """

    result = _parse_typecheck_log(content)

    assert result.type_errors == 2


def test_parse_typecheck_log_generic_errors():
    """Test parsing typecheck output with generic error: format."""
    content = """
    file1.py:10: error: Undefined variable 'x'
    file2.py:25: error: Type mismatch
    file3.py:40: error: Invalid syntax
    """

    result = _parse_typecheck_log(content)

    assert result.type_errors == 3


def test_parse_typecheck_log_no_errors():
    """Test parsing typecheck output with no errors."""
    content = """
    ✔ No type errors found.
    """

    result = _parse_typecheck_log(content)

    assert result.type_errors is None


# ============================================================================
# Test Log Parsing Tests
# ============================================================================

def test_parse_test_log_jest_format():
    """Test parsing Jest test output."""
    content = """
    PASS  src/__tests__/App.test.tsx
      ✓ renders correctly (25 ms)
      ✓ handles click event (10 ms)

    FAIL  src/__tests__/utils.test.ts
      ✕ calculates sum correctly (5 ms)

    Tests: 2 passed, 1 failed, 3 total
    Snapshots: 0 total
    Time: 2.456 s
    """

    result = _parse_test_log(content)

    assert result.tests_passed == 2
    assert result.tests_failed == 1


def test_parse_test_log_pytest_format():
    """Test parsing pytest test output."""
    content = """
    tests/test_context_store.py::test_init_context PASSED    [ 25%]
    tests/test_context_store.py::test_get_context PASSED     [ 50%]
    tests/test_context_store.py::test_update_coordination FAILED [ 75%]
    tests/test_parser.py::test_parse_task PASSED             [100%]

    ============ 3 passed, 1 failed in 1.23s ============
    """

    result = _parse_test_log(content)

    assert result.tests_passed == 3
    assert result.tests_failed == 1


def test_parse_test_log_all_passed():
    """Test parsing test output with all tests passing."""
    content = """
    Tests: 5 passed, 5 total
    Time: 1.234 s
    """

    result = _parse_test_log(content)

    assert result.tests_passed == 5
    assert result.tests_failed is None


def test_parse_test_log_no_tests():
    """Test parsing test output with no tests."""
    content = """
    No tests found.
    """

    result = _parse_test_log(content)

    assert result.tests_passed is None or result.tests_passed == 0
    assert result.tests_failed is None or result.tests_failed == 0


# ============================================================================
# Coverage Log Parsing Tests
# ============================================================================

def test_parse_coverage_log_jest_format():
    """Test parsing Jest coverage report."""
    content = """
    -----------------|---------|----------|---------|---------|-------------------
    File             | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
    -----------------|---------|----------|---------|---------|-------------------
    All files        |   85.5  |   78.25  |   92.0  |   85.5  |
     src/App.tsx     |   90.0  |   80.0   |   100   |   90.0  | 15-20
     src/utils.ts    |   75.0  |   70.0   |   80.0  |   75.0  | 42,89-95
    -----------------|---------|----------|---------|---------|-------------------

    Lines      : 85.5% ( 342/400 )
    Statements : 85.5% ( 342/400 )
    Branches   : 78.25% ( 157/200 )
    Functions  : 92.0% ( 46/50 )
    """

    result = _parse_coverage_log(content)

    assert result.coverage is not None
    assert result.coverage.lines == 85.5
    assert result.coverage.branches == 78.25
    assert result.coverage.functions == 92.0
    assert result.coverage.statements == 85.5


def test_parse_coverage_log_pytest_format():
    """Test parsing pytest coverage report."""
    content = """
    Name                     Stmts   Miss  Cover
    --------------------------------------------
    context_store.py          400     58    86%
    parser.py                 250     30    88%
    notify.py                 100     15    85%
    --------------------------------------------
    TOTAL                     750    103    86%
    """

    result = _parse_coverage_log(content)

    assert result.coverage is not None
    assert result.coverage.lines == 86.0


def test_parse_coverage_log_no_coverage():
    """Test parsing coverage output with no coverage data."""
    content = """
    No coverage data available.
    """

    result = _parse_coverage_log(content)

    assert result.coverage is None


# ============================================================================
# parse_qa_log Dispatcher Tests
# ============================================================================

def test_parse_qa_log_dispatcher_lint():
    """Test parse_qa_log dispatcher routes to lint parser."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.log', delete=False) as f:
        f.write("Found 5 errors.")
        log_path = Path(f.name)

    try:
        result = parse_qa_log(log_path, 'lint')
        assert result.lint_errors == 5
    finally:
        log_path.unlink()


def test_parse_qa_log_dispatcher_typecheck():
    """Test parse_qa_log dispatcher routes to typecheck parser."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.log', delete=False) as f:
        f.write("error TS2322: Type error\nerror TS2339: Another error")
        log_path = Path(f.name)

    try:
        result = parse_qa_log(log_path, 'typecheck')
        assert result.type_errors == 2
    finally:
        log_path.unlink()


def test_parse_qa_log_dispatcher_test():
    """Test parse_qa_log dispatcher routes to test parser."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.log', delete=False) as f:
        f.write("Tests: 3 passed, 1 failed, 4 total")
        log_path = Path(f.name)

    try:
        result = parse_qa_log(log_path, 'test')
        assert result.tests_passed == 3
        assert result.tests_failed == 1
    finally:
        log_path.unlink()


def test_parse_qa_log_dispatcher_coverage():
    """Test parse_qa_log dispatcher routes to coverage parser."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.log', delete=False) as f:
        f.write("Lines : 85.5%\nBranches : 78.0%")
        log_path = Path(f.name)

    try:
        result = parse_qa_log(log_path, 'coverage')
        assert result.coverage is not None
        assert result.coverage.lines == 85.5
    finally:
        log_path.unlink()


def test_parse_qa_log_file_not_found():
    """Test parse_qa_log handles missing files gracefully."""
    log_path = Path("/nonexistent/file.log")
    result = parse_qa_log(log_path, 'lint')

    # Should return empty summary, not crash
    assert result.lint_errors is None


def test_parse_qa_log_unknown_command_type():
    """Test parse_qa_log handles unknown command types gracefully."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.log', delete=False) as f:
        f.write("Some log content")
        log_path = Path(f.name)

    try:
        result = parse_qa_log(log_path, 'unknown_type')
        # Should return empty summary for unknown types
        assert result.lint_errors is None
        assert result.type_errors is None
    finally:
        log_path.unlink()


def test_parse_qa_log_malformed_content():
    """Test parse_qa_log handles malformed log content gracefully."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.log', delete=False) as f:
        f.write("@#$%^&*() garbage content \x00\x01\x02")
        log_path = Path(f.name)

    try:
        result = parse_qa_log(log_path, 'lint')
        # Should not crash, returns empty summary
        assert result is not None
    finally:
        log_path.unlink()


# ============================================================================
# QA Drift Detection Tests
# ============================================================================

def test_detect_qa_drift_exit_code_regression():
    """Test drift detection identifies exit code regressions."""
    baseline = QAResults(
        recorded_at="2025-01-01T00:00:00Z",
        agent="implementer",
        results=[
            QACommandResult(
                command_id="lint",
                command="pnpm lint",
                exit_code=0,
                duration_ms=1000
            )
        ]
    )

    current = QAResults(
        recorded_at="2025-01-02T00:00:00Z",
        agent="reviewer",
        results=[
            QACommandResult(
                command_id="lint",
                command="pnpm lint",
                exit_code=1,
                duration_ms=1100
            )
        ]
    )

    drift = detect_qa_drift(baseline, current)

    assert drift["has_drift"] is True
    assert len(drift["regressions"]) == 1
    assert drift["regressions"][0]["type"] == "exit_code_regression"
    assert drift["regressions"][0]["baseline"] == 0
    assert drift["regressions"][0]["current"] == 1


def test_detect_qa_drift_lint_errors_increased():
    """Test drift detection identifies lint error increases."""
    baseline = QAResults(
        recorded_at="2025-01-01T00:00:00Z",
        agent="implementer",
        results=[
            QACommandResult(
                command_id="lint",
                command="pnpm lint",
                exit_code=0,
                duration_ms=1000,
                summary=QACommandSummary(lint_errors=2)
            )
        ]
    )

    current = QAResults(
        recorded_at="2025-01-02T00:00:00Z",
        agent="reviewer",
        results=[
            QACommandResult(
                command_id="lint",
                command="pnpm lint",
                exit_code=0,
                duration_ms=1100,
                summary=QACommandSummary(lint_errors=5)
            )
        ]
    )

    drift = detect_qa_drift(baseline, current)

    assert drift["has_drift"] is True
    assert len(drift["regressions"]) == 1
    assert drift["regressions"][0]["type"] == "lint_errors_increased"
    assert drift["regressions"][0]["baseline"] == 2
    assert drift["regressions"][0]["current"] == 5


def test_detect_qa_drift_coverage_dropped():
    """Test drift detection identifies coverage drops >2%."""
    baseline = QAResults(
        recorded_at="2025-01-01T00:00:00Z",
        agent="implementer",
        results=[
            QACommandResult(
                command_id="test",
                command="pnpm test --coverage",
                exit_code=0,
                duration_ms=5000,
                summary=QACommandSummary(
                    coverage=QACoverageSummary(lines=85.0, branches=78.0)
                )
            )
        ]
    )

    current = QAResults(
        recorded_at="2025-01-02T00:00:00Z",
        agent="reviewer",
        results=[
            QACommandResult(
                command_id="test",
                command="pnpm test --coverage",
                exit_code=0,
                duration_ms=5100,
                summary=QACommandSummary(
                    coverage=QACoverageSummary(lines=82.0, branches=75.0)
                )
            )
        ]
    )

    drift = detect_qa_drift(baseline, current)

    assert drift["has_drift"] is True
    assert len(drift["regressions"]) == 2  # lines and branches both dropped >2%
    assert any(r["type"] == "coverage_lines_dropped" for r in drift["regressions"])
    assert any(r["type"] == "coverage_branches_dropped" for r in drift["regressions"])


def test_detect_qa_drift_improvements():
    """Test drift detection identifies improvements."""
    baseline = QAResults(
        recorded_at="2025-01-01T00:00:00Z",
        agent="implementer",
        results=[
            QACommandResult(
                command_id="lint",
                command="pnpm lint",
                exit_code=1,
                duration_ms=1000,
                summary=QACommandSummary(lint_errors=5)
            )
        ]
    )

    current = QAResults(
        recorded_at="2025-01-02T00:00:00Z",
        agent="reviewer",
        results=[
            QACommandResult(
                command_id="lint",
                command="pnpm lint",
                exit_code=0,
                duration_ms=1100,
                summary=QACommandSummary(lint_errors=2)
            )
        ]
    )

    drift = detect_qa_drift(baseline, current)

    assert drift["has_drift"] is False  # Improvements don't count as drift
    assert len(drift["improvements"]) >= 2  # Exit code + lint errors improved


def test_detect_qa_drift_no_drift():
    """Test drift detection when results are identical."""
    baseline = QAResults(
        recorded_at="2025-01-01T00:00:00Z",
        agent="implementer",
        results=[
            QACommandResult(
                command_id="lint",
                command="pnpm lint",
                exit_code=0,
                duration_ms=1000,
                summary=QACommandSummary(lint_errors=2)
            )
        ]
    )

    current = QAResults(
        recorded_at="2025-01-02T00:00:00Z",
        agent="reviewer",
        results=[
            QACommandResult(
                command_id="lint",
                command="pnpm lint",
                exit_code=0,
                duration_ms=1100,
                summary=QACommandSummary(lint_errors=2)
            )
        ]
    )

    drift = detect_qa_drift(baseline, current)

    assert drift["has_drift"] is False
    assert len(drift["regressions"]) == 0


def test_detect_qa_drift_missing_command():
    """Test drift detection handles missing commands gracefully."""
    baseline = QAResults(
        recorded_at="2025-01-01T00:00:00Z",
        agent="implementer",
        results=[
            QACommandResult(
                command_id="lint",
                command="pnpm lint",
                exit_code=0,
                duration_ms=1000
            )
        ]
    )

    current = QAResults(
        recorded_at="2025-01-02T00:00:00Z",
        agent="reviewer",
        results=[
            QACommandResult(
                command_id="typecheck",  # Different command
                command="pnpm typecheck",
                exit_code=0,
                duration_ms=2000
            )
        ]
    )

    drift = detect_qa_drift(baseline, current)

    # No drift since commands don't overlap
    assert drift["has_drift"] is False


def test_detect_qa_drift_coverage_minor_change():
    """Test drift detection ignores coverage changes <2%."""
    baseline = QAResults(
        recorded_at="2025-01-01T00:00:00Z",
        agent="implementer",
        results=[
            QACommandResult(
                command_id="test",
                command="pnpm test --coverage",
                exit_code=0,
                duration_ms=5000,
                summary=QACommandSummary(
                    coverage=QACoverageSummary(lines=85.0)
                )
            )
        ]
    )

    current = QAResults(
        recorded_at="2025-01-02T00:00:00Z",
        agent="reviewer",
        results=[
            QACommandResult(
                command_id="test",
                command="pnpm test --coverage",
                exit_code=0,
                duration_ms=5100,
                summary=QACommandSummary(
                    coverage=QACoverageSummary(lines=84.0)  # Only 1% drop
                )
            )
        ]
    )

    drift = detect_qa_drift(baseline, current)

    # 1% drop should not trigger drift
    assert drift["has_drift"] is False
