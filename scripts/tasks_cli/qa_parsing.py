"""
QA log parsing helpers for context_store.py

Per Section 4 of task-context-cache-hardening-schemas.md
"""

import re
from pathlib import Path

from .context_store import QACommandSummary, QACoverageSummary, QAResults


def parse_qa_log(log_path: Path, command_type: str) -> QACommandSummary:
    """
    Parse QA log file into structured summary.

    Per Section 4.2 of task-context-cache-hardening-schemas.md.

    Args:
        log_path: Path to log file
        command_type: One of 'lint', 'typecheck', 'test', 'coverage'

    Returns:
        QACommandSummary with parsed metrics (empty if parse fails)
    """
    try:
        log_content = log_path.read_text(encoding='utf-8', errors='ignore')
    except (FileNotFoundError, PermissionError):
        # Return empty summary if log can't be read
        return QACommandSummary()

    try:
        if command_type == 'lint':
            return _parse_lint_log(log_content)
        elif command_type == 'typecheck':
            return _parse_typecheck_log(log_content)
        elif command_type == 'test':
            return _parse_test_log(log_content)
        elif command_type == 'coverage':
            return _parse_coverage_log(log_content)
        else:
            # Unknown command type, return empty summary
            return QACommandSummary()
    except Exception:
        # Parse failure - return empty summary gracefully
        return QACommandSummary()


def _parse_lint_log(content: str) -> QACommandSummary:
    """
    Parse ESLint/Ruff lint output.

    Extracts error and warning counts from lint tool output.

    Args:
        content: Log file content

    Returns:
        QACommandSummary with lint_errors and lint_warnings
    """
    lint_errors = 0
    lint_warnings = 0

    # ESLint format: "✖ N problems (X errors, Y warnings)"
    eslint_match = re.search(r'(\d+)\s+errors?,\s+(\d+)\s+warnings?', content)
    if eslint_match:
        lint_errors = int(eslint_match.group(1))
        lint_warnings = int(eslint_match.group(2))
    else:
        # Alternative ESLint format: count individual error/warning lines
        error_lines = re.findall(r'error\s+[A-Za-z0-9_-]+', content, re.IGNORECASE)
        warning_lines = re.findall(r'warning\s+[A-Za-z0-9_-]+', content, re.IGNORECASE)
        lint_errors = len(error_lines)
        lint_warnings = len(warning_lines)

    # Ruff format: "Found X errors"
    ruff_match = re.search(r'Found\s+(\d+)\s+errors?', content)
    if ruff_match:
        lint_errors = int(ruff_match.group(1))

    return QACommandSummary(
        lint_errors=lint_errors if lint_errors > 0 else None,
        lint_warnings=lint_warnings if lint_warnings > 0 else None
    )


def _parse_typecheck_log(content: str) -> QACommandSummary:
    """
    Parse tsc/pyright typecheck output.

    Extracts type error count from TypeScript/Python type checkers.

    Args:
        content: Log file content

    Returns:
        QACommandSummary with type_errors
    """
    type_errors = 0

    # TypeScript tsc format: "error TS1234:"
    tsc_errors = re.findall(r'error\s+TS\d+:', content)
    type_errors += len(tsc_errors)

    # Pyright format: "X errors, Y warnings"
    pyright_match = re.search(r'(\d+)\s+errors?,\s+(\d+)\s+warnings?', content)
    if pyright_match:
        type_errors += int(pyright_match.group(1))

    # Alternative: count "error:" lines
    if type_errors == 0:
        error_lines = re.findall(r'^.*error:.*$', content, re.MULTILINE)
        type_errors = len(error_lines)

    return QACommandSummary(
        type_errors=type_errors if type_errors > 0 else None
    )


def _parse_test_log(content: str) -> QACommandSummary:
    """
    Parse Jest/pytest test output.

    Extracts test pass/fail counts from test runner output.

    Args:
        content: Log file content

    Returns:
        QACommandSummary with tests_passed and tests_failed
    """
    tests_passed = 0
    tests_failed = 0

    # Jest format: "Tests: 5 passed, 2 failed, 7 total"
    jest_passed_match = re.search(r'Tests:\s+(\d+)\s+passed', content)
    jest_failed_match = re.search(r'(\d+)\s+failed', content)

    if jest_passed_match:
        tests_passed = int(jest_passed_match.group(1))
    if jest_failed_match:
        tests_failed = int(jest_failed_match.group(1))

    # Pytest format: "5 passed, 2 failed in 1.23s"
    pytest_match = re.search(r'(\d+)\s+passed(?:,\s+(\d+)\s+failed)?', content)
    if pytest_match and not jest_passed_match:
        tests_passed = int(pytest_match.group(1))
        if pytest_match.group(2):
            tests_failed = int(pytest_match.group(2))

    return QACommandSummary(
        tests_passed=tests_passed if tests_passed > 0 else None,
        tests_failed=tests_failed if tests_failed > 0 else None
    )


def _parse_coverage_log(content: str) -> QACommandSummary:
    """
    Parse Jest/pytest coverage report.

    Extracts lines/branches coverage percentages.

    Args:
        content: Log file content

    Returns:
        QACommandSummary with coverage metrics
    """
    coverage_metrics = {}

    # Jest coverage format: "Lines      : 85.5% ( 342/400 )"
    for metric in ['lines', 'branches', 'functions', 'statements']:
        pattern = rf'{metric}\s*:\s*([\d.]+)%'
        match = re.search(pattern, content, re.IGNORECASE)
        if match:
            coverage_metrics[metric] = float(match.group(1))

    # Pytest coverage format: "TOTAL    400    342    85%"
    # Look for lines coverage if not found above
    if 'lines' not in coverage_metrics:
        total_match = re.search(r'TOTAL\s+\d+\s+\d+\s+([\d.]+)%', content)
        if total_match:
            coverage_metrics['lines'] = float(total_match.group(1))

    if coverage_metrics:
        coverage_summary = QACoverageSummary(
            lines=coverage_metrics.get('lines'),
            branches=coverage_metrics.get('branches'),
            functions=coverage_metrics.get('functions'),
            statements=coverage_metrics.get('statements')
        )
        return QACommandSummary(coverage=coverage_summary)
    else:
        return QACommandSummary()


def detect_qa_drift(baseline: QAResults, current: QAResults) -> dict:
    """
    Compare current QA results to baseline.

    Per Section 4.3 of task-context-cache-hardening-schemas.md.

    Detects regressions:
    - Exit code changes (0 → non-zero)
    - Lint error increases
    - Type error increases
    - Test failures introduced
    - Coverage decreases (>2% drop)

    Args:
        baseline: Baseline QA results
        current: Current QA results

    Returns:
        {
            "has_drift": bool,
            "regressions": [{"command_id": str, "type": str, "baseline": Any, "current": Any}],
            "improvements": [...]
        }
    """
    regressions = []
    improvements = []

    # Build command_id -> result maps
    baseline_results = {r.command_id: r for r in baseline.results}
    current_results = {r.command_id: r for r in current.results}

    for cmd_id, current_result in current_results.items():
        baseline_result = baseline_results.get(cmd_id)
        if not baseline_result:
            continue

        # Compare exit codes
        if baseline_result.exit_code == 0 and current_result.exit_code != 0:
            regressions.append({
                "command_id": cmd_id,
                "type": "exit_code_regression",
                "baseline": 0,
                "current": current_result.exit_code
            })
        elif baseline_result.exit_code != 0 and current_result.exit_code == 0:
            improvements.append({
                "command_id": cmd_id,
                "type": "exit_code_improvement",
                "baseline": baseline_result.exit_code,
                "current": 0
            })

        # Compare summaries if both present
        if not baseline_result.summary or not current_result.summary:
            continue

        baseline_summary = baseline_result.summary
        current_summary = current_result.summary

        # Check for new lint errors
        if baseline_summary.lint_errors is not None and current_summary.lint_errors is not None:
            if baseline_summary.lint_errors < current_summary.lint_errors:
                regressions.append({
                    "command_id": cmd_id,
                    "type": "lint_errors_increased",
                    "baseline": baseline_summary.lint_errors,
                    "current": current_summary.lint_errors
                })
            elif baseline_summary.lint_errors > current_summary.lint_errors:
                improvements.append({
                    "command_id": cmd_id,
                    "type": "lint_errors_decreased",
                    "baseline": baseline_summary.lint_errors,
                    "current": current_summary.lint_errors
                })

        # Check for new type errors
        if baseline_summary.type_errors is not None and current_summary.type_errors is not None:
            if baseline_summary.type_errors < current_summary.type_errors:
                regressions.append({
                    "command_id": cmd_id,
                    "type": "type_errors_increased",
                    "baseline": baseline_summary.type_errors,
                    "current": current_summary.type_errors
                })
            elif baseline_summary.type_errors > current_summary.type_errors:
                improvements.append({
                    "command_id": cmd_id,
                    "type": "type_errors_decreased",
                    "baseline": baseline_summary.type_errors,
                    "current": current_summary.type_errors
                })

        # Check for test failures
        if baseline_summary.tests_failed is not None and current_summary.tests_failed is not None:
            if baseline_summary.tests_failed < current_summary.tests_failed:
                regressions.append({
                    "command_id": cmd_id,
                    "type": "test_failures_increased",
                    "baseline": baseline_summary.tests_failed,
                    "current": current_summary.tests_failed
                })
            elif baseline_summary.tests_failed > current_summary.tests_failed:
                improvements.append({
                    "command_id": cmd_id,
                    "type": "test_failures_decreased",
                    "baseline": baseline_summary.tests_failed,
                    "current": current_summary.tests_failed
                })

        # Check coverage regression (>2% drop is significant)
        if baseline_summary.coverage and current_summary.coverage:
            for metric in ['lines', 'branches']:
                baseline_val = getattr(baseline_summary.coverage, metric, None)
                current_val = getattr(current_summary.coverage, metric, None)

                if baseline_val is not None and current_val is not None:
                    if current_val < baseline_val - 2.0:  # >2% drop
                        regressions.append({
                            "command_id": cmd_id,
                            "type": f"coverage_{metric}_dropped",
                            "baseline": baseline_val,
                            "current": current_val
                        })
                    elif current_val > baseline_val + 2.0:  # >2% improvement
                        improvements.append({
                            "command_id": cmd_id,
                            "type": f"coverage_{metric}_improved",
                            "baseline": baseline_val,
                            "current": current_val
                        })

    return {
        "has_drift": len(regressions) > 0,
        "regressions": regressions,
        "improvements": improvements
    }
