#!/usr/bin/env python3
"""
Module limits guardrails for tasks_cli.

Static analysis checks:
1. LOC limits: Fail if any non-test module exceeds 500 LOC
2. Subprocess usage: Detect subprocess.run outside providers/ layer

Provider Policy (S4.4):
- subprocess.run usage is ONLY permitted in providers/ layer
- Test files are exempted (can mock subprocess for testing)
- Enforcement via --enforce-providers flag (warn-only by default)
- Transition: warn-only until Wave 4 migration completes (S4.3)
- After S4.3, all subprocess calls must be in providers/

Usage:
    python scripts/tasks_cli/checks/module_limits.py
    python scripts/tasks_cli/checks/module_limits.py --hard-fail
    python scripts/tasks_cli/checks/module_limits.py --enforce-providers
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

    # Scan all .py files in tasks_cli recursively (excluding tests)
    for py_file in base_dir.rglob("*.py"):
        # Skip test files
        if "tests" in py_file.parts or py_file.name.startswith("test_"):
            continue

        # models.py files exempted: pure dataclasses/schemas, no logic
        if py_file.name == "models.py":
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


def scan_subprocess_usage(base_dir: Path, enforce_providers: bool = False) -> list[SubprocessViolation]:
    """
    Scan for subprocess.run usage outside providers/ layer.

    Args:
        base_dir: Root directory of tasks_cli module
        enforce_providers: If True, fail on subprocess.run outside providers/

    Returns:
        List of subprocess violations
    """
    violations: list[SubprocessViolation] = []
    providers_dir = base_dir / 'providers'

    # Scan all .py files recursively in tasks_cli
    for py_file in base_dir.rglob('*.py'):
        # Skip test files - they can mock subprocess
        if 'tests' in py_file.parts or py_file.name.startswith('test_'):
            continue

        # Parse AST and detect subprocess.run
        try:
            with open(py_file, 'r', encoding='utf-8') as f:
                tree = ast.parse(f.read(), filename=str(py_file))

            visitor = SubprocessVisitor(py_file)
            visitor.visit(tree)

            # Filter violations based on enforce mode
            if enforce_providers:
                # Only violations outside providers/ are reported
                for v in visitor.violations:
                    # Check if file is under providers/ directory
                    try:
                        py_file.relative_to(providers_dir)
                        # File is in providers/, skip this violation
                    except ValueError:
                        # File is NOT in providers/, add violation
                        violations.append(v)
            else:
                # Warn-only: report all
                violations.extend(visitor.violations)

        except SyntaxError:
            # Skip files with syntax errors
            continue

    return violations


def format_violations(
    loc_violations: list[LOCViolation],
    subprocess_violations: list[SubprocessViolation],
    enforce_providers: bool = False
) -> str:
    """Format violation reports.

    Args:
        loc_violations: LOC limit violations
        subprocess_violations: Subprocess usage violations
        enforce_providers: Whether provider policy is being enforced

    Returns:
        Formatted violation report
    """
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
        if enforce_providers:
            lines.append("SUBPROCESS POLICY VIOLATIONS:")
            lines.append("-" * 60)
            lines.append("POLICY: subprocess.run usage ONLY permitted in providers/")
            lines.append("")
            for v in subprocess_violations:
                lines.append(
                    f"  VIOLATION: {v.file_path.name}:{v.line_number} "
                    f"in {v.function_name}() - must be in providers/"
                )
        else:
            lines.append("SUBPROCESS USAGE (informational):")
            lines.append("-" * 60)
            lines.append("Found subprocess.run usage (will be enforced in Phase 3+)")
            lines.append("")
            for v in subprocess_violations:
                lines.append(
                    f"  INFO: {v.file_path.name}:{v.line_number} "
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
        help="Exit with non-zero code on LOC violations"
    )
    parser.add_argument(
        "--fail-on-loc",
        action="store_true",
        help="Alias for --hard-fail: exit non-zero on LOC violations"
    )
    parser.add_argument(
        "--enforce-providers",
        action="store_true",
        help="Fail if subprocess.run found outside providers/"
    )

    args = parser.parse_args()

    # Determine base directory
    script_path = Path(__file__).resolve()
    tasks_cli_dir = script_path.parent.parent

    # Run checks
    loc_violations = scan_module_loc(tasks_cli_dir, limit=500)
    subprocess_violations = scan_subprocess_usage(tasks_cli_dir, args.enforce_providers)

    # Report results
    if loc_violations or subprocess_violations:
        print("=" * 60)
        print("TASKS_CLI MODULE LIMITS GUARDRAILS")
        print("=" * 60)
        print()
        print(format_violations(loc_violations, subprocess_violations, args.enforce_providers))

        # Exit with failure based on enforcement flags
        loc_fail = loc_violations and (args.hard_fail or args.fail_on_loc)
        provider_fail = subprocess_violations and args.enforce_providers
        if loc_fail or provider_fail:
            print("ERROR: Violations detected in enforcement mode")
            return 1
        else:
            print("WARNING: Violations detected (warn-only mode)")
            print("Use --hard-fail or --enforce-providers to enforce limits")
            return 0
    else:
        print("✓ All module limit checks passed")
        return 0


if __name__ == "__main__":
    sys.exit(main())
