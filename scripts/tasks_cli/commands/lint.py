"""
Typer-based lint commands (S5.4 migration).

Implements task file validation:
- lint: Lint a task file for schema 1.1 compliance

These commands delegate to TaskCliContext for business logic.
"""

import sys
from pathlib import Path
from typing import Optional

import typer

from ..context import TaskCliContext
from ..linter import TaskLinter, format_violations, ViolationLevel


def lint_task(
    ctx: TaskCliContext,
    task_path: str,
    format_arg: str = 'text'
) -> int:
    """
    Lint a task file for schema 1.1 compliance.

    Args:
        ctx: TaskCliContext with repo_root
        task_path: Path to task file
        format_arg: Output format ('text' or 'json')

    Returns:
        Exit code (0 = success, 1 = violations found)
    """
    path = Path(task_path)

    if not path.exists():
        if format_arg == 'json':
            ctx.output_channel.print_json({
                'success': False,
                'error': f'Task file not found: {task_path}',
                'path': str(task_path)
            })
        else:
            print(f"Error: Task file not found: {task_path}", file=sys.stderr)
        return 1

    linter = TaskLinter(ctx.repo_root)
    violations = linter.lint_file(path)

    if format_arg == 'json':
        ctx.output_channel.print_json({
            'success': len([v for v in violations if v.level == ViolationLevel.ERROR]) == 0,
            'path': str(path),
            'violations': [
                {
                    'level': v.level.value,
                    'code': v.code,
                    'message': v.message,
                    'field': v.field,
                    'suggestion': v.suggestion
                }
                for v in violations
            ],
            'error_count': len([v for v in violations if v.level == ViolationLevel.ERROR]),
            'warning_count': len([v for v in violations if v.level == ViolationLevel.WARNING])
        })
    else:
        if not violations:
            print(f"OK {path.name} passes all schema 1.1 checks")
            return 0

        # Format and display violations
        print(f"\nLint results for {path.name}:")
        print(format_violations(violations, show_suggestions=True))

        # Count errors (warnings don't block)
        errors = [v for v in violations if v.level == ViolationLevel.ERROR]

        if errors:
            print(f"\n{len(errors)} error(s) must be fixed before transitioning to 'todo'")
            return 1
        else:
            print("\nNo blocking errors (warnings should be addressed)")
            return 0

    # JSON mode - return based on error count
    errors = [v for v in violations if v.level == ViolationLevel.ERROR]
    return 1 if errors else 0


def bootstrap_evidence(
    ctx: TaskCliContext,
    task_id: str,
    format_arg: str = 'text'
) -> int:
    """
    Create evidence file stub for a task.

    Args:
        ctx: TaskCliContext with repo_root
        task_id: Task ID (e.g., TASK-0818)
        format_arg: Output format ('text' or 'json')

    Returns:
        Exit code (0 = success, 1 = error)
    """
    # Validate task ID format
    if not task_id.startswith('TASK-'):
        if format_arg == 'json':
            ctx.output_channel.print_json({
                'success': False,
                'error': f'Invalid task ID format: {task_id} (expected TASK-XXXX)',
                'task_id': task_id
            })
        else:
            print(f"Error: Invalid task ID format: {task_id} (expected TASK-XXXX)", file=sys.stderr)
        return 1

    # Create evidence directory if needed
    evidence_dir = ctx.repo_root / "docs" / "evidence" / "tasks"
    evidence_dir.mkdir(parents=True, exist_ok=True)

    # Evidence file path
    evidence_path = evidence_dir / f"{task_id}-clarifications.md"

    if evidence_path.exists():
        if format_arg == 'json':
            ctx.output_channel.print_json({
                'success': True,
                'already_exists': True,
                'path': str(evidence_path),
                'task_id': task_id
            })
        else:
            print(f"Evidence file already exists: {evidence_path}")
            print("   Not overwriting existing file")
        return 0

    # Create evidence stub
    template = f"""# {task_id} Clarifications & Evidence

## Purpose
This document tracks clarifications, standards alignment notes, and validation evidence for {task_id}.

## Clarifications

### Outstanding Questions
<!-- List any unresolved questions or ambiguities -->
- [Resolved] Example question that was clarified

### Resolved Items
<!-- Document resolutions with timestamps -->
- **2025-11-04**: Initial task drafted, no outstanding clarifications

## Standards Alignment

### Grounding References
<!-- Cite specific standards sections this task satisfies -->
- `standards/REPLACE-tier.md#REPLACE-section` - REPLACE: describe alignment
- `standards/testing-standards.md#coverage-expectations` - Coverage thresholds verified

### Gap Analysis
<!-- Note any standards gaps or deviations discovered -->
No gaps identified during planning.

## Implementation Notes

### Approach
<!-- Document key implementation decisions and rationale -->
TODO: Add implementation approach after plan refinement

### Standards Compliance
<!-- Evidence that implementation satisfies cited standards -->
TODO: Add compliance evidence during implementation

## Validation Evidence

### Static Analysis
<!-- Output from lint:fix and qa:static commands -->
TODO: Add static analysis results

### Test Results
<!-- Unit test and coverage reports -->
TODO: Add test results with coverage percentages

### Manual Verification
<!-- Any manual checks performed -->
TODO: Document manual verification steps if needed

## References
- Task file: `tasks/REPLACE-area/{task_id}-REPLACE-slug.task.yaml`
- Related docs: `docs/REPLACE-path`
"""

    with open(evidence_path, 'w', encoding='utf-8') as f:
        f.write(template)

    if format_arg == 'json':
        ctx.output_channel.print_json({
            'success': True,
            'created': True,
            'path': str(evidence_path),
            'task_id': task_id
        })
    else:
        print(f"Created evidence stub: {evidence_path}")
        print("\nNext steps:")
        print("1. Fill in REPLACE placeholders in the evidence file")
        print(f"2. Update task YAML: clarifications.evidence_path: \"docs/evidence/tasks/{task_id}-clarifications.md\"")
        print("3. Document any clarifications or standards gaps as you plan the task")

    return 0


# Typer registration

def register_lint_commands(app: typer.Typer, ctx: TaskCliContext) -> None:
    """
    Register Typer lint commands with the app.

    Args:
        app: Typer app instance to register commands with
        ctx: TaskCliContext to inject into commands
    """

    @app.command("lint")
    def lint_cmd(
        task_path: str = typer.Argument(
            ...,
            help="Path to task file to lint"
        ),
        format: str = typer.Option(
            'text',
            '--format',
            help="Output format: text or json"
        )
    ):
        """Lint a task file for schema 1.1 compliance."""
        exit_code = lint_task(ctx, task_path, format)
        raise typer.Exit(code=exit_code)

    @app.command("bootstrap-evidence")
    def bootstrap_evidence_cmd(
        task_id: str = typer.Argument(
            ...,
            help="Task ID (e.g., TASK-0818)"
        ),
        format: str = typer.Option(
            'text',
            '--format',
            help="Output format: text or json"
        )
    ):
        """Create evidence file stub for a task."""
        exit_code = bootstrap_evidence(ctx, task_id, format)
        raise typer.Exit(code=exit_code)
