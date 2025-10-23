#!/usr/bin/env python3
"""
Backend unit test runner for PhotoEditor
"""
import subprocess
import json
import sys
import os
from pathlib import Path
from datetime import datetime

def run_command(cmd, cwd=None):
    """Run a command and return output"""
    result = subprocess.run(
        cmd,
        shell=True,
        cwd=cwd,
        capture_output=True,
        text=True
    )
    return result.stdout, result.stderr, result.returncode

def main():
    repo_root = Path("/home/jeffreymoya/dev/photoeditor")
    backend_dir = repo_root / "backend"

    # Change to backend directory
    os.chdir(str(backend_dir))

    print("=" * 80)
    print("Running Backend Unit Tests")
    print("=" * 80)

    # Run tests with coverage
    cmd = "pnpm run test --coverage --json --outputFile=coverage-report.json"

    print(f"Command: {cmd}")
    print()

    stdout, stderr, returncode = run_command(cmd)

    # Print output
    print(stdout)
    if stderr:
        print("STDERR:", stderr)

    # Try to read coverage report
    coverage_file = backend_dir / "coverage-report.json"
    coverage_summary = {}

    if coverage_file.exists():
        try:
            with open(coverage_file) as f:
                data = json.load(f)
                # Extract summary
                if 'testResults' in data:
                    print("\n" + "=" * 80)
                    print("Test Results Summary")
                    print("=" * 80)

                    total_tests = data.get('numTotalTests', 0)
                    passed_tests = data.get('numPassedTests', 0)
                    failed_tests = data.get('numFailedTests', 0)

                    print(f"Total Tests: {total_tests}")
                    print(f"Passed: {passed_tests}")
                    print(f"Failed: {failed_tests}")

                if 'coverageSummary' in data:
                    summary = data['coverageSummary'].get('total', {})
                    print("\nCoverage Summary:")
                    print(f"Lines: {summary.get('lines', {}).get('pct', 'N/A')}%")
                    print(f"Branches: {summary.get('branches', {}).get('pct', 'N/A')}%")
                    print(f"Functions: {summary.get('functions', {}).get('pct', 'N/A')}%")
                    print(f"Statements: {summary.get('statements', {}).get('pct', 'N/A')}%")
        except Exception as e:
            print(f"Warning: Could not read coverage report: {e}")

    print("\n" + "=" * 80)
    if returncode == 0:
        print("Status: PASS")
    else:
        print("Status: FAIL")
    print("=" * 80)

    return returncode

if __name__ == "__main__":
    sys.exit(main())
