#!/usr/bin/env python3
"""
Module limits guardrails for tasks_cli.

Static analysis checks:
1. LOC limits: Fail if any non-test module exceeds 500 LOC
2. Subprocess usage: Detect subprocess.run outside providers/ layer

Usage:
    python scripts/tasks_cli/checks/module_limits.py
    python scripts/tasks_cli/checks/module_limits.py --hard-fail
"""

import argparse
import ast
import sys
from pathlib import Path
from typing import NamedTuple


class LOCViolation(NamedTuple):
    """LOC limit violation record."""
    file_path: Path
    line_count: int
    limit: int


class SubprocessViolation(NamedTuple):
    """Subprocess usage violation record."""
    file_path: Path
    line_number: int
    function_name: str


class SubprocessVisitor(ast.NodeVisitor):
    """AST visitor to detect subprocess.run calls."""

    def __init__(self, file_path: Path):
        self.file_path = file_path
        self.violations: list[SubprocessViolation] = []
        self.current_function = "<module>"

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        """Track current function context."""
        old_function = self.current_function
        self.current_function = node.name
        self.generic_visit(node)
        self.current_function = old_function

    def visit_Call(self, node: ast.Call) -> None:
        """Detect subprocess.run calls."""
        # Check for subprocess.run (attribute access)
        if isinstance(node.func, ast.Attribute):
            if (isinstance(node.func.value, ast.Name) and
                node.func.value.id == "subprocess" and
                node.func.attr == "run"):
                self.violations.append(SubprocessViolation(
                    file_path=self.file_path,
                    line_number=node.lineno,
                    function_name=self.current_function
                ))

        self.generic_visit(node)


def scan_module_loc(base_dir: Path, limit: int = 500) -> list[LOCViolation]:
    """
    Scan all Python modules in tasks_cli for LOC violations.

    Args:
        base_dir: Root directory of tasks_cli module
        limit: Maximum allowed LOC per module

    Returns:
        List of LOC violations
    """
    violations: list[LOCViolation] = []

    # Scan all .py files in tasks_cli (excluding tests)
    for py_file in base_dir.glob("*.py"):
        # Skip test files
        if py_file.name.startswith("test_"):
            continue

        # Count lines (non-empty)
        with open(py_file, "r", encoding="utf-8") as f:
            lines = f.readlines()

        line_count = len(lines)

        if line_count > limit:
            violations.append(LOCViolation(
                file_path=py_file,
                line_count=line_count,
                limit=limit
            ))

    return violations


def scan_subprocess_usage(base_dir: Path) -> list[SubprocessViolation]:
    """
    Scan for subprocess.run usage outside providers/ layer.

    Args:
        base_dir: Root directory of tasks_cli module

    Returns:
        List of subprocess usage violations
    """
    violations: list[SubprocessViolation] = []

    # Scan all .py files in tasks_cli (excluding tests and providers)
    for py_file in base_dir.glob("*.py"):
        # Skip test files
        if py_file.name.startswith("test_"):
            continue

        # Skip if in providers/ directory (when we have one)
        if "providers" in py_file.parts:
            continue

        # Parse AST and detect subprocess.run
        try:
            with open(py_file, "r", encoding="utf-8") as f:
                tree = ast.parse(f.read(), filename=str(py_file))

            visitor = SubprocessVisitor(py_file)
            visitor.visit(tree)
            violations.extend(visitor.violations)
        except SyntaxError:
            # Skip files with syntax errors
            continue

    return violations


def format_violations(
    loc_violations: list[LOCViolation],
    subprocess_violations: list[SubprocessViolation]
) -> str:
    """Format violation reports."""
    lines = []

    if loc_violations:
        lines.append("LOC VIOLATIONS:")
        lines.append("-" * 60)
        for v in loc_violations:
            lines.append(
                f"  {v.file_path.name}: {v.line_count} LOC (limit: {v.limit})"
            )
        lines.append("")

    if subprocess_violations:
        lines.append("SUBPROCESS USAGE VIOLATIONS:")
        lines.append("-" * 60)
        for v in subprocess_violations:
            lines.append(
                f"  {v.file_path.name}:{v.line_number} "
                f"in {v.function_name}()"
            )
        lines.append("")

    return "\n".join(lines)


def main() -> int:
    """Run all module limit checks."""
    parser = argparse.ArgumentParser(
        description="Static checks for tasks_cli module limits"
    )
    parser.add_argument(
        "--hard-fail",
        action="store_true",
        help="Exit with non-zero code on violations (future use)"
    )

    args = parser.parse_args()

    # Determine base directory
    script_path = Path(__file__).resolve()
    tasks_cli_dir = script_path.parent.parent

    # Run checks
    loc_violations = scan_module_loc(tasks_cli_dir, limit=500)
    subprocess_violations = scan_subprocess_usage(tasks_cli_dir)

    # Report results
    if loc_violations or subprocess_violations:
        print("=" * 60)
        print("TASKS_CLI MODULE LIMITS GUARDRAILS")
        print("=" * 60)
        print()
        print(format_violations(loc_violations, subprocess_violations))

        if args.hard_fail:
            print("ERROR: Violations detected in --hard-fail mode")
            return 1
        else:
            print("WARNING: Violations detected (warn-only mode)")
            print("Use --hard-fail to enforce limits")
            return 0
    else:
        print("✓ All module limit checks passed")
        return 0


if __name__ == "__main__":
    sys.exit(main())
