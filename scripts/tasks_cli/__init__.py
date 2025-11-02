"""
Task CLI package for managing PhotoEditor task workflow.

Replaces historical Bash-based task picker (scripts/pick-task) with Python implementation that:
- Correctly parses inline and multi-line blocked_by/depends_on arrays
- Prioritizes unblocker tasks before higher-priority non-unblockers
- Maintains persistent cache for performance
- Provides dependency graph validation and cycle detection

See: docs/proposals/task-workflow-python-refactor.md
"""

__version__ = "0.1.0"
