#!/usr/bin/env python3
"""
Task workflow CLI entry point.

This script delegates to the tasks_cli package for all task management operations.
Replaces the historical Bash-based task picker (scripts/pick-task now delegates here)
with Python implementation that correctly handles inline blocked_by arrays and
unblocker-first prioritization.

See: docs/proposals/task-workflow-python-refactor.md
"""

import sys
from pathlib import Path

# Add scripts directory to Python path
script_dir = Path(__file__).parent
sys.path.insert(0, str(script_dir))

# Import and run CLI
from tasks_cli.__main__ import main

if __name__ == "__main__":
    sys.exit(main())
