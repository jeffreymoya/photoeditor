"""
Task CLI main entry point.

Provides command-line interface for task workflow management.
Implements backward-compatible commands from historical Bash task picker
(now scripts/pick-task delegates to this Python CLI).

Usage:
    python scripts/tasks.py --list [filter] [--format json]
    python scripts/tasks.py --pick [filter] [--format json]
    python scripts/tasks.py --validate [--format json]
    python scripts/tasks.py --check-halt [--format json]
    python scripts/tasks.py --refresh-cache
    python scripts/tasks.py --graph
    python scripts/tasks.py --explain TASK-ID [--format json]
    python scripts/tasks.py --claim TASK_PATH
    python scripts/tasks.py --complete TASK_PATH
    python scripts/tasks.py --archive TASK_PATH
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

# Import legacy command functions (re-exported through commands/ package __init__.py)
from .commands import (
    cmd_add_exception,
    cmd_attach_evidence,
    cmd_attach_standard,
    cmd_cleanup_exceptions,
    cmd_collect_metrics,
    cmd_compare_metrics,
    cmd_generate_dashboard,
    cmd_init_context,
    cmd_list_evidence,
    cmd_list_exceptions,
    cmd_list_quarantined,
    cmd_quarantine_task,
    cmd_record_qa,
    cmd_release_quarantine,
    cmd_resolve_exception,
    cmd_run_validation,
    cmd_verify_worktree,
)
from .context import TaskCliContext
from .context_store import (
    ContextExistsError,
    ContextNotFoundError,
    DriftError,
    SourceFile,
    TaskContextStore,
    normalize_multiline,
)
from .datastore import TaskDatastore
from .dispatcher import dispatch_command, should_use_legacy
from .exceptions import ValidationError, WorkflowHaltError
from .graph import DependencyGraph
from .models import Task
from .operations import TaskOperationError, TaskOperations
from .output import set_json_mode
from .picker import TaskPicker, check_halt_conditions
from .providers import GitProvider


def find_repo_root() -> Path:
    """
    Find repository root by looking for .git directory.

    Returns:
        Absolute path to repository root

    Raises:
        SystemExit: If repo root cannot be found
    """
    current = Path.cwd().resolve()

    # Walk up directory tree looking for .git
    for parent in [current] + list(current.parents):
        if (parent / ".git").exists():
            return parent

    # Fallback: assume we're in scripts/ and repo root is parent
    script_dir = Path(__file__).parent.parent.parent
    if (script_dir / ".git").exists():
        return script_dir

    print("Error: Could not find repository root (no .git directory)", file=sys.stderr)
    sys.exit(1)


def task_to_dict(task: Task) -> Dict[str, Any]:
    """
    Convert Task to JSON-serializable dict.

    Per proposal Section 3.2: includes all metadata fields with
    deterministic ordering (sorted keys).

    Phase 2: Includes effective_priority and priority_reason fields
    (always present, null when not applicable).

    Args:
        task: Task instance to serialize

    Returns:
        Dictionary with sorted keys, suitable for JSON output
    """
    return {
        'area': task.area,
        'blocked_by': sorted(task.blocked_by),  # Deterministic ordering
        'depends_on': sorted(task.depends_on),
        'effective_priority': task.effective_priority,  # Phase 2: Runtime-computed
        'hash': task.hash,
        'id': task.id,
        'mtime': task.mtime,
        'order': task.order,
        'path': str(task.path),
        'priority': task.priority,
        'priority_reason': task.priority_reason,  # Phase 2: Audit trail
        'status': task.status,
        'title': task.title,
        'unblocker': task.unblocker,
    }


def emit_draft_warnings(alerts: Dict[str, Any]) -> None:
    """
    Emit human-readable warnings for draft tasks and their downstream dependencies.

    Args:
        alerts: Draft alert metadata from TaskPicker.get_draft_alerts()
    """
    if not alerts.get('has_drafts'):
        return

    draft_meta = {draft['id']: draft for draft in alerts.get('drafts', [])}

    header = (
        f"WARNING: {alerts['draft_count']} draft task(s) require clarification "
        f"before new work is picked."
    )
    print(header, file=sys.stderr)

    # High-priority warning for draft unblockers
    draft_unblockers = alerts.get('draft_unblockers', [])
    if draft_unblockers:
        print("\n  CRITICAL: Draft unblocker tasks detected!", file=sys.stderr)
        print("  Unblockers are prioritized first but cannot be picked while in draft status:", file=sys.stderr)
        for unblocker in draft_unblockers:
            title = unblocker.get('title', '').strip()
            priority = unblocker.get('priority', 'P?')
            title_suffix = f' — {title}' if title else ''
            print(f"    - {unblocker['id']} ({priority}){title_suffix}", file=sys.stderr)
        print("  Resolve clarifications urgently to unblock workflow.\n", file=sys.stderr)

    for downstream in alerts.get('downstream', []):
        draft_id = downstream['draft_id']
        meta = draft_meta.get(draft_id, {})
        title = meta.get('title', '').strip()
        title_suffix = f' — {title}' if title else ''
        blocked_count = len(downstream.get('blocked_by', []))
        depends_count = len(downstream.get('depends_on_only', []))
        summary_parts = []
        if blocked_count:
            summary_parts.append(f"{blocked_count} downstream task(s) blocked")
        else:
            summary_parts.append("no downstream tasks blocked")
        if depends_count:
            summary_parts.append(f"{depends_count} downstream task(s) missing blocked_by")
        summary = "; ".join(summary_parts)
        print(f"  - {draft_id}{title_suffix}: {summary}", file=sys.stderr)

    missing_blocked_by = alerts.get('violations', {}).get('missing_blocked_by', [])
    if missing_blocked_by:
        print("  Tasks missing blocked_by linkage to drafts:", file=sys.stderr)
        for item in missing_blocked_by:
            print(
                f"    - {item['task_id']} (status={item['task_status']}) → draft {item['draft_id']}",
                file=sys.stderr,
            )

    needs_blocked_status = alerts.get('violations', {}).get('needs_blocked_status', [])
    if needs_blocked_status:
        print("  Tasks referencing drafts must be marked status=blocked:", file=sys.stderr)
        for item in needs_blocked_status:
            print(
                f"    - {item['task_id']} currently '{item['task_status']}' → draft {item['draft_id']}",
                file=sys.stderr,
            )

    filtered = alerts.get('filtered_out_by_picker', [])
    if filtered:
        print(
            "  The picker skipped tasks missing blocked_by linkage; update them before retrying.",
            file=sys.stderr,
        )


def output_json(data: Dict[str, Any]) -> None:
    """
    Output deterministic JSON (sorted keys, ISO-8601 timestamps).

    Per proposal Section 3.3: JSON output must emit sorted keys with
    ISO-8601 UTC timestamps to keep diff-based tooling deterministic.

    Args:
        data: Dictionary to serialize
    """
    # Add generation timestamp
    data['generated_at'] = datetime.now(timezone.utc).isoformat()

    # Output with sorted keys
    print(json.dumps(data, indent=2, sort_keys=True))


def cmd_list(args, picker: TaskPicker) -> int:
    """
    List tasks with optional filtering.

    Args:
        args: Parsed command-line arguments
        picker: TaskPicker instance

    Returns:
        Exit code (0 for success)
    """
    # Determine filter
    status_filter = None
    unblocker_only = False

    if args.filter:
        if args.filter == "unblocker":
            unblocker_only = True
        else:
            status_filter = args.filter

    # Get filtered tasks
    tasks = picker.list_tasks(
        status_filter=status_filter,
        unblocker_only=unblocker_only
    )

    # Output based on format
    if args.format == 'json':
        output_json({
            'tasks': [task_to_dict(task) for task in tasks],
            'count': len(tasks),
            'filter': {
                'status': status_filter,
                'unblocker_only': unblocker_only,
            }
        })
    else:
        # Tab-delimited format (backward compatible with Bash script)
        for task in tasks:
            print(f"{task.id}\t{task.status}\t{task.path}\t{task.title}")

    return 0


def cmd_validate(args, graph: DependencyGraph) -> int:
    """
    Validate dependency graph.

    Args:
        args: Parsed command-line arguments
        graph: DependencyGraph instance

    Returns:
        Exit code (0 if valid, 1 if errors found)
    """
    is_valid, errors = graph.validate()

    # Output based on format
    if args.format == 'json':
        output_json({
            'valid': is_valid,
            'error_count': len(errors),
            'errors': errors
        })
    else:
        if is_valid:
            print("Validation passed: No dependency errors found")
        else:
            print("Validation failed:", file=sys.stderr)
            for error in errors:
                print(f"  - {error}", file=sys.stderr)

    return 0 if is_valid else 1


def cmd_explain(args, graph: DependencyGraph, datastore: TaskDatastore) -> int:
    """
    Explain dependency chain for a specific task.

    Shows:
    - Hard blockers (blocked_by) with status
    - Artifact dependencies (depends_on) with availability
    - Transitive dependency chain
    - Readiness assessment and recommendations

    Args:
        args: Parsed command-line arguments (contains task_id)
        graph: DependencyGraph instance
        datastore: TaskDatastore instance

    Returns:
        Exit code (0 for success, 1 if task not found)
    """
    task_id = args.explain

    # Verify task exists
    if task_id not in graph.task_by_id:
        print(f"Error: Task not found: {task_id}", file=sys.stderr)
        return 1

    task = graph.task_by_id[task_id]

    # Compute dependency closure
    closure = graph.compute_dependency_closure(task_id)

    # Get completed task IDs for readiness check
    tasks = datastore.load_tasks()
    completed_ids = {t.id for t in tasks if t.is_completed()}

    # Check readiness
    is_ready = task.is_ready(completed_ids)
    blocking_count = len([dep for dep in task.blocked_by if dep not in completed_ids])

    # Output based on format
    if args.format == 'json':
        # JSON output with all dependency information
        blocker_details = []
        for dep_id in task.blocked_by:
            if dep_id in graph.task_by_id:
                dep_task = graph.task_by_id[dep_id]
                blocker_details.append({
                    'id': dep_id,
                    'status': dep_task.status,
                    'title': dep_task.title,
                    'blocking': dep_id not in completed_ids
                })
            else:
                blocker_details.append({
                    'id': dep_id,
                    'status': 'unknown',
                    'title': None,
                    'blocking': True
                })

        artifact_details = []
        for dep_id in task.depends_on:
            if dep_id in graph.task_by_id:
                dep_task = graph.task_by_id[dep_id]
                artifact_details.append({
                    'id': dep_id,
                    'status': dep_task.status,
                    'title': dep_task.title,
                    'available': dep_id in completed_ids
                })
            else:
                artifact_details.append({
                    'id': dep_id,
                    'status': 'unknown',
                    'title': None,
                    'available': False
                })

        output_json({
            'task': {
                'id': task.id,
                'title': task.title,
                'status': task.status,
                'priority': task.priority,
                'unblocker': task.unblocker
            },
            'hard_blockers': blocker_details,
            'artifact_dependencies': artifact_details,
            'transitive_closure': sorted(closure['transitive']),
            'readiness': {
                'ready': is_ready,
                'blocking_count': blocking_count,
                'recommendation': (
                    'Task is ready to start' if is_ready
                    else f'Complete {blocking_count} hard blocker(s) first'
                )
            }
        })
    else:
        # Human-readable text output
        print(f"{task.id}: {task.title}")
        print(f"  Status: {task.status}")
        print(f"  Priority: {task.priority}")
        if task.unblocker:
            print("  Unblocker: YES")
        print()

        # Hard blockers (blocked_by)
        if task.blocked_by:
            print("  Hard Blockers (blocked_by):")
            for dep_id in task.blocked_by:
                if dep_id in graph.task_by_id:
                    dep_task = graph.task_by_id[dep_id]
                    status_indicator = "[BLOCKING]" if dep_id not in completed_ids else "[COMPLETED]"
                    print(f"    ↳ {dep_id} (status: {dep_task.status}) - {dep_task.title} {status_indicator}")
                else:
                    print(f"    ↳ {dep_id} (MISSING) [BLOCKING]")
            print()
        else:
            print("  Hard Blockers (blocked_by): None")
            print()

        # Artifact dependencies (depends_on)
        if task.depends_on:
            print("  Artifact Dependencies (depends_on):")
            for dep_id in task.depends_on:
                if dep_id in graph.task_by_id:
                    dep_task = graph.task_by_id[dep_id]
                    status_indicator = "[AVAILABLE]" if dep_id in completed_ids else "[IN PROGRESS]"
                    print(f"    ↳ {dep_id} (status: {dep_task.status}) - {dep_task.title} {status_indicator}")
                else:
                    print(f"    ↳ {dep_id} (MISSING) [UNAVAILABLE]")
            print()
        else:
            print("  Artifact Dependencies (depends_on): None")
            print()

        # Transitive chain
        if closure['transitive']:
            print("  Transitive Chain:")
            # Build simple chain representation
            chain_items = sorted(closure['transitive'])
            if len(chain_items) <= 5:
                print(f"    {task.id} → {' → '.join(chain_items)}")
            else:
                # Show first few and count
                print(f"    {task.id} → {' → '.join(chain_items[:3])} → ... ({len(chain_items)} total)")
            print()

        # Readiness assessment
        print(f"  Readiness: {'READY' if is_ready else 'NOT READY'}", end='')
        if not is_ready and blocking_count > 0:
            print(f" ({blocking_count} hard blocker(s) remain)")
        else:
            print()

        if not is_ready and task.blocked_by:
            # Provide recommendation
            incomplete_blockers = [dep for dep in task.blocked_by if dep not in completed_ids]
            if incomplete_blockers:
                print(f"  Recommendation: Complete these tasks first: {', '.join(incomplete_blockers)}")

    return 0


def cmd_lint(args, repo_root: Path) -> int:
    """
    Lint a task file for schema 1.1 compliance.

    Args:
        args: Parsed command-line arguments
        repo_root: Repository root path

    Returns:
        Exit code (0 = success, 1 = violations found)
    """
    from .linter import TaskLinter, format_violations, ViolationLevel

    task_path = Path(args.task_path)

    if not task_path.exists():
        print(f"Error: Task file not found: {args.task_path}", file=sys.stderr)
        return 1

    linter = TaskLinter(repo_root)
    violations = linter.lint_file(task_path)

    if not violations:
        print(f"✅ {task_path.name} passes all schema 1.1 checks")
        return 0

    # Format and display violations
    print(f"\n📋 Lint results for {task_path.name}:")
    print(format_violations(violations, show_suggestions=True))

    # Count errors (warnings don't block)
    errors = [v for v in violations if v.level == ViolationLevel.ERROR]

    if errors:
        print(f"\n❌ {len(errors)} error(s) must be fixed before transitioning to 'todo'")
        return 1
    else:
        print("\n✅ No blocking errors (warnings should be addressed)")
        return 0


def cmd_bootstrap_evidence(args, repo_root: Path) -> int:
    """
    Create evidence file stub for a task.

    Args:
        args: Parsed command-line arguments
        repo_root: Repository root path

    Returns:
        Exit code (0 = success, 1 = error)
    """
    task_id = args.task_id

    # Validate task ID format
    if not task_id.startswith('TASK-'):
        print(f"Error: Invalid task ID format: {task_id} (expected TASK-XXXX)", file=sys.stderr)
        return 1

    # Create evidence directory if needed
    evidence_dir = repo_root / "docs" / "evidence" / "tasks"
    evidence_dir.mkdir(parents=True, exist_ok=True)

    # Evidence file path
    evidence_path = evidence_dir / f"{task_id}-clarifications.md"

    if evidence_path.exists():
        print(f"⚠️  Evidence file already exists: {evidence_path}")
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

    print(f"✅ Created evidence stub: {evidence_path}")
    print("\nNext steps:")
    print("1. Fill in REPLACE placeholders in the evidence file")
    print(f"2. Update task YAML: clarifications.evidence_path: \"docs/evidence/tasks/{task_id}-clarifications.md\"")
    print("3. Document any clarifications or standards gaps as you plan the task")

    return 0


# ============================================================================
# Context Cache Commands (Phase 2)
# ============================================================================

def _extract_glob_base(pattern: str) -> str:
    """
    Extract the stable base directory from a glob pattern.

    This is the directory prefix before any wildcards appear, which serves
    as the root scope for the pattern. Used as a fallback when no files
    match yet (bootstrapping) and as the stable scope boundary.

    Args:
        pattern: Glob pattern (e.g., "mobile/src/components/**/*.tsx")

    Returns:
        Base directory path (e.g., "mobile/src/components")

    Examples:
        "mobile/src/components/**/*.tsx" → "mobile/src/components"
        "backend/services/*/index.ts" → "backend/services"
        "shared/**" → "shared"
        "mobile/src/App.tsx" → "mobile/src" (no wildcards, use parent)
    """
    # Split on first wildcard character
    # Common wildcards: *, ?, [, {
    wildcard_chars = ['*', '?', '[', '{']
    first_wildcard_pos = len(pattern)

    for char in wildcard_chars:
        pos = pattern.find(char)
        if pos != -1 and pos < first_wildcard_pos:
            first_wildcard_pos = pos

    if first_wildcard_pos == len(pattern):
        # No wildcards - this is a literal path, use its parent directory
        base = str(Path(pattern).parent)
    else:
        # Extract prefix before wildcard
        prefix = pattern[:first_wildcard_pos]

        # Trim to last complete directory (remove incomplete path component)
        # Cases:
        # - "mobile/src/components/" → "mobile/src/components"
        # - "mobile/src/components/**" → "mobile/src/components"
        # - "backend/services/*" → "backend/services"
        # - "shared/types/?" → "shared/types"
        base = prefix.rstrip('/')

        # If nothing left after stripping, use first component
        if not base:
            base = pattern.split('/')[0].split('*')[0].split('?')[0].split('[')[0].split('{')[0]

    # Normalize: remove trailing slash, handle empty
    base = base.rstrip('/')
    return base if base else '.'


def _expand_repo_paths(repo_paths: List[str], repo_root: Path) -> List[str]:
    """
    Expand macros and globs to directory roots.

    Macros starting with ':' (e.g., ':mobile-shared-ui') are expanded using
    glob patterns defined in docs/templates/scope-globs.json. Uses stable
    glob base directories to ensure:
    1. Bootstrapping works (empty directories get base dir as fallback)
    2. Complete coverage (all levels under base are in scope, not just parents of existing files)

    Args:
        repo_paths: List of paths (may include macros)
        repo_root: Repository root directory

    Returns:
        Sorted, deduplicated list of directory paths

    Example:
        [':mobile-shared-ui', 'backend/services/'] ->
        ['mobile/src/components', 'mobile/src/hooks', 'backend/services']

    Critical fixes (2025-11-19):
    - Issue #1: Falls back to glob base when no matches (enables bootstrapping)
    - Issue #2: Uses stable glob base instead of file parents (complete coverage)
    """
    import glob

    globs_file = repo_root / 'docs/templates/scope-globs.json'

    # Graceful fallback if config missing
    if not globs_file.exists():
        return sorted(set(repo_paths))

    try:
        with open(globs_file, 'r', encoding='utf-8') as f:
            globs_config = json.load(f)
    except Exception:
        # If config is malformed, return paths as-is
        return sorted(set(repo_paths))

    expanded = []
    for path in repo_paths:
        if path.startswith(':'):
            # Macro expansion
            if path in globs_config.get('globs', {}):
                # Track all base directories for this macro (one per pattern)
                macro_bases = set()

                for pattern in globs_config['globs'][path]:
                    # FIX #2: Extract stable glob base FIRST
                    # This is the definitive scope boundary for the pattern
                    glob_base = _extract_glob_base(pattern)
                    macro_bases.add(glob_base)

                    # Expand glob pattern relative to repo root
                    full_pattern = str(repo_root / pattern)
                    matches = glob.glob(full_pattern, recursive=True)

                    # FIX #1: If no matches, use glob base as fallback (bootstrapping)
                    if not matches:
                        # Empty directory - use the stable base so future files are in scope
                        continue  # Base already added to macro_bases

                    # If we have matches, verify they're under the expected base
                    # (This is a safety check - all matches should be under glob_base)
                    for match in matches:
                        abs_path = Path(match)
                        rel_path = abs_path.relative_to(repo_root)

                        # Verify match is under glob_base (sanity check)
                        if not str(rel_path).startswith(glob_base):
                            # Unexpected - log and skip (shouldn't happen with correct globs)
                            continue

                # Add all base directories for this macro
                expanded.extend(sorted(macro_bases))
            else:
                # Unknown macro, keep as-is (will be caught by validation)
                expanded.append(path)
        else:
            # Regular path - normalize to directory
            # If it's a file path, convert to parent directory
            path_obj = Path(path)
            if '.' in path_obj.name and not path.endswith('/'):
                # Looks like a file (has extension), use parent
                expanded.append(str(path_obj.parent))
            else:
                # Directory path
                expanded.append(path.rstrip('/'))

    # Deduplicate and sort for deterministic output
    return sorted(set(expanded))


def _build_immutable_context_from_task(task_path: Path) -> dict:
    """
    Build immutable context from task YAML file.

    Extracts all necessary fields for context initialization per
    proposal Section 5.1 (Initial Capture Workflow).

    Args:
        task_path: Path to task YAML file

    Returns:
        Dictionary with task_snapshot, standards_citations, validation_baseline, repo_paths

    Raises:
        ValidationError: If required fields are missing
    """
    from ruamel.yaml import YAML

    yaml = YAML(typ='safe')

    try:
        with open(task_path, 'r', encoding='utf-8') as f:
            data = yaml.load(f)
    except Exception as e:
        raise ValidationError(f"Failed to read task file: {e}")

    if not data or not isinstance(data, dict):
        raise ValidationError("Task file is empty or invalid")

    # Extract task snapshot fields
    title = data.get('title', '')
    priority = data.get('priority', 'P1')
    area = data.get('area', '')
    description = data.get('description', '')
    outcome = data.get('outcome', '')

    # Combine description and outcome for full context
    full_description = f"{description}\n\nOutcome: {outcome}" if outcome else description

    # Extract scope
    scope = data.get('scope', {})
    scope_in = scope.get('in', []) if isinstance(scope, dict) else []
    scope_out = scope.get('out', []) if isinstance(scope, dict) else []

    # Extract acceptance criteria
    acceptance_criteria = data.get('acceptance_criteria', [])
    if not isinstance(acceptance_criteria, list):
        acceptance_criteria = []

    # Extract plan steps (per §3.1 requirement for prompt-ready context)
    plan_raw = data.get('plan', [])
    plan_steps = []
    if isinstance(plan_raw, list):
        for step in plan_raw:
            if isinstance(step, dict):
                # Normalize multiline fields within plan steps
                normalized_step = {
                    'id': step.get('id'),
                    'title': step.get('title', ''),
                    'details': normalize_multiline(str(step.get('details', '')), preserve_formatting=True) if step.get('details') else '',
                    'actor': step.get('actor'),
                    'inputs': step.get('inputs', []),
                    'outputs': step.get('outputs', []),
                    'definition_of_done': step.get('definition_of_done', []),
                    'estimate': step.get('estimate'),
                    'expected_files_touched': step.get('expected_files_touched', [])
                }
                plan_steps.append(normalized_step)

    # Extract deliverables (per §3.1 requirement)
    deliverables = data.get('deliverables', [])
    if not isinstance(deliverables, list):
        deliverables = []

    # Extract validation pipeline (per §3.1 requirement for typed commands)
    validation = data.get('validation', {})
    validation_commands = []
    if isinstance(validation, dict):
        pipeline_raw = validation.get('pipeline', validation.get('commands', []))
        if isinstance(pipeline_raw, list):
            for cmd in pipeline_raw:
                if isinstance(cmd, str):
                    # Simple string format - convert to minimal dict
                    validation_commands.append({'command': cmd})
                elif isinstance(cmd, dict):
                    # Rich schema format - preserve full structure
                    normalized_cmd = {
                        'command': cmd.get('command', ''),
                        'description': cmd.get('description'),
                        'cwd': cmd.get('cwd'),
                        'env': cmd.get('env'),
                        'expected_paths': cmd.get('expected_paths'),
                        'blockers': cmd.get('blockers'),
                        'retry': cmd.get('retry'),
                        'timeout': cmd.get('timeout'),
                        'expected_exit_codes': cmd.get('expected_exit_codes')
                    }
                    # Remove None values to keep JSON clean
                    validation_commands.append({k: v for k, v in normalized_cmd.items() if v is not None})

    # Build task snapshot (with text normalization for cross-platform determinism)
    task_snapshot = {
        'title': title,  # No normalization (single line)
        'priority': priority,
        'area': area,
        'description': normalize_multiline(full_description.strip()) if full_description.strip() else '',
        'scope_in': [normalize_multiline(str(item), preserve_formatting=True) for item in scope_in],
        'scope_out': [normalize_multiline(str(item), preserve_formatting=True) for item in scope_out],
        'acceptance_criteria': [normalize_multiline(str(item), preserve_formatting=True) for item in acceptance_criteria],
        'plan_steps': plan_steps,
        'deliverables': [str(d) for d in deliverables],
        'validation_commands': validation_commands,
    }

    # Extract repo paths from context
    context = data.get('context', {})
    repo_paths = context.get('repo_paths', []) if isinstance(context, dict) else []
    if not isinstance(repo_paths, list):
        repo_paths = []
    repo_paths = [str(p) for p in repo_paths]

    # Calculate repo root (task file is typically at repo_root/tasks/...)
    # Use find_repo_root for robustness (searches for .git)
    repo_root = find_repo_root()

    # Expand glob macros (GAP-2)
    repo_paths = _expand_repo_paths(repo_paths, repo_root)

    # Build standards citations based on area
    standards_citations = _build_standards_citations(area, priority, data)

    # Extract validation commands
    # Support both validation.pipeline (new, schema 1.1) and validation.commands (legacy)
    validation = data.get('validation', {})
    qa_commands_raw = []

    if isinstance(validation, dict):
        # Try pipeline first (schema 1.1), then fall back to commands (legacy)
        qa_commands_raw = validation.get('pipeline', validation.get('commands', []))

    if not isinstance(qa_commands_raw, list):
        qa_commands_raw = []

    # Parse commands - support both simple strings and rich dict schema
    qa_commands = []
    for idx, cmd in enumerate(qa_commands_raw):
        if isinstance(cmd, str):
            # Simple string format - backward compatible
            qa_commands.append(cmd)
        elif isinstance(cmd, dict):
            # Rich schema format - extract just the command string for now
            # Full ValidationCommand parsing will be done when executing
            if 'command' in cmd:
                qa_commands.append(cmd['command'])
            else:
                # Malformed rich schema - skip
                import sys
                print(
                    f"Warning: validation.pipeline[{idx}] missing 'command' field, skipping",
                    file=sys.stderr,
                    flush=True
                )
        else:
            # Unknown format - skip
            import sys
            print(
                f"Warning: validation.pipeline[{idx}] has invalid type {type(cmd)}, skipping",
                file=sys.stderr,
                flush=True
            )

    # Fallback to tier defaults if no commands specified
    if not qa_commands:
        qa_commands = _get_default_qa_commands(area)

    validation_baseline = {
        'commands': [str(cmd) for cmd in qa_commands],
        'initial_results': None,
    }

    return {
        'task_snapshot': task_snapshot,
        'standards_citations': standards_citations,
        'validation_baseline': validation_baseline,
        'repo_paths': repo_paths,  # Already expanded, deduped, and sorted by _expand_repo_paths
    }


def _build_standards_citations(area: str, priority: str, task_data: dict) -> list:
    """
    Build standards citations based on task area and priority.

    Per proposal Section 5.1.1 (Standards Citation Algorithm).

    Args:
        area: Task area (backend, mobile, shared, infrastructure)
        priority: Task priority (P0, P1, P2)
        task_data: Full task YAML data

    Returns:
        List of standards citation dicts

    TODO: Implement line_span and content_sha extraction (M2)
          - Extract section boundaries from standards/*.md files using regex
          - Calculate SHA256 of section content for staleness detection
          - See proposal Section 5.1.1 for detailed algorithm
    """
    citations = []

    # Global standards for all tasks
    citations.extend([
        {
            'file': 'standards/global.md',
            'section': 'evidence-requirements',
            'requirement': 'Mandatory artifacts per release: evidence bundles, test results, compliance proofs',
            'line_span': None,
            'content_sha': None,
        },
        {
            'file': 'standards/AGENTS.md',
            'section': 'agent-coordination',
            'requirement': 'Agent handoff protocols and context management',
            'line_span': None,
            'content_sha': None,
        },
    ])

    # Area-specific citations
    if area == 'backend':
        citations.extend([
            {
                'file': 'standards/backend-tier.md',
                'section': 'handler-constraints',
                'requirement': 'Handler complexity must not exceed cyclomatic complexity 10; handlers limited to 75 LOC',
                'line_span': None,
                'content_sha': None,
            },
            {
                'file': 'standards/backend-tier.md',
                'section': 'layering-rules',
                'requirement': 'Handlers → Services → Providers (one-way only); no circular dependencies',
                'line_span': None,
                'content_sha': None,
            },
            {
                'file': 'standards/cross-cutting.md',
                'section': 'hard-fail-controls',
                'requirement': 'Handlers cannot import AWS SDKs; zero cycles; complexity budgets enforced',
                'line_span': None,
                'content_sha': None,
            },
        ])
    elif area == 'mobile':
        citations.extend([
            {
                'file': 'standards/frontend-tier.md',
                'section': 'component-standards',
                'requirement': 'Component complexity and state management patterns',
                'line_span': None,
                'content_sha': None,
            },
            {
                'file': 'standards/frontend-tier.md',
                'section': 'state-management',
                'requirement': 'Redux Toolkit patterns and async handling',
                'line_span': None,
                'content_sha': None,
            },
        ])
    elif area == 'shared':
        citations.extend([
            {
                'file': 'standards/shared-contracts-tier.md',
                'section': 'contract-first',
                'requirement': 'Zod schemas at boundaries; contract-first API design',
                'line_span': None,
                'content_sha': None,
            },
            {
                'file': 'standards/shared-contracts-tier.md',
                'section': 'versioning',
                'requirement': 'Breaking changes require /v{n} versioning',
                'line_span': None,
                'content_sha': None,
            },
        ])
    elif area in ('infrastructure', 'infra'):
        citations.extend([
            {
                'file': 'standards/infrastructure-tier.md',
                'section': 'terraform-modules',
                'requirement': 'Terraform module structure and local dev platform',
                'line_span': None,
                'content_sha': None,
            },
        ])

    # TypeScript standards for code areas
    if area in ('backend', 'mobile', 'shared'):
        citations.append({
            'file': 'standards/typescript.md',
            'section': 'strict-config',
            'requirement': 'Strict tsconfig including exactOptionalPropertyTypes; Zod at boundaries; neverthrow Results',
            'line_span': None,
            'content_sha': None,
        })

    # Testing standards
    citations.append({
        'file': 'standards/testing-standards.md',
        'section': f'{area}-qa-commands',
        'requirement': f'QA commands and coverage thresholds for {area}',
        'line_span': None,
        'content_sha': None,
    })

    # Task-specific overrides from context.related_docs
    context = task_data.get('context', {})
    if isinstance(context, dict):
        related_docs = context.get('related_docs', [])
        if isinstance(related_docs, list):
            for doc in related_docs:
                doc_str = str(doc)
                if doc_str.startswith('standards/') and not any(c['file'] == doc_str for c in citations):
                    citations.append({
                        'file': doc_str,
                        'section': 'task-specific',
                        'requirement': 'Referenced in task context',
                        'line_span': None,
                        'content_sha': None,
                    })

    return citations


def _get_default_qa_commands(area: str) -> list:
    """
    Get default QA commands for an area per testing-standards.md.

    Args:
        area: Task area

    Returns:
        List of default QA command strings
    """
    if area == 'backend':
        return [
            'pnpm turbo run typecheck --filter=@photoeditor/backend',
            'pnpm turbo run lint --filter=@photoeditor/backend',
            'pnpm turbo run test --filter=@photoeditor/backend',
        ]
    elif area == 'mobile':
        return [
            'pnpm turbo run typecheck --filter=photoeditor-mobile',
            'pnpm turbo run lint --filter=photoeditor-mobile',
            'pnpm turbo run test --filter=photoeditor-mobile',
        ]
    elif area == 'shared':
        return [
            'pnpm turbo run typecheck --filter=@photoeditor/shared',
            'pnpm turbo run lint --filter=@photoeditor/shared',
            'pnpm turbo run contracts:check --filter=@photoeditor/shared',
        ]
    else:
        # Generic fallback
        return [
            'pnpm turbo run qa:static --parallel',
        ]


def _auto_verify_worktree(context_store: TaskContextStore, task_id: str, agent_role: str) -> None:
    """
    Auto-verify worktree before mutations (Issue #2).

    Per proposal Section 3.3: state-changing CLI verbs implicitly run
    verify_worktree for the previous agent and abort on drift.

    Args:
        context_store: TaskContextStore instance
        task_id: Task identifier
        agent_role: Current agent role

    Raises:
        Drift Error: On worktree drift (increments drift_budget)
        ContextNotFoundError: If no context or snapshot found
    """
    # Determine previous agent
    agent_sequence = ['implementer', 'reviewer', 'validator']
    try:
        current_idx = agent_sequence.index(agent_role)
        if current_idx > 0:
            expected_agent = agent_sequence[current_idx - 1]

            # Verify worktree matches previous agent's snapshot
            try:
                context_store.verify_worktree_state(task_id=task_id, expected_agent=expected_agent)
            except DriftError:
                # Increment drift budget for the current agent (Issue #3 fix)
                # Current agent encounters drift, so they should be blocked
                context = context_store.get_context(task_id)
                if context:
                    agent_coord = getattr(context, agent_role)
                    context_store.update_coordination(
                        task_id=task_id,
                        agent_role=agent_role,
                        updates={'drift_budget': agent_coord.drift_budget + 1},
                        actor='auto-verification'
                    )
                # Re-raise drift error to block the operation
                raise
    except ValueError:
        # Agent not in sequence, skip verification
        pass


def _check_drift_budget(context_store: TaskContextStore, task_id: str) -> None:
    """
    Check drift budget and block operations if non-zero (Issue #3).

    Per proposal Section 3.4: when drift_budget > 0, state-changing CLI verbs
    refuse to launch a new agent until operator records a resolution note.

    Args:
        context_store: TaskContextStore instance
        task_id: Task identifier

    Raises:
        ValidationError: If any agent has drift_budget > 0
    """
    context = context_store.get_context(task_id)
    if context:
        for agent_role in ['implementer', 'reviewer', 'validator']:
            agent_coord = getattr(context, agent_role)
            if agent_coord.drift_budget > 0:
                raise ValidationError(
                    f"Drift budget exceeded for {agent_role} (count: {agent_coord.drift_budget}). "
                    f"Manual intervention required. Run: python scripts/tasks.py --resolve-drift {task_id} "
                    f"--agent {agent_role} --note \"Resolution description\""
                )


def cmd_init_context_legacy(args, repo_root: Path) -> int:
    """
    Legacy: Initialize task context with immutable snapshot.
    Use cmd_init_context from commands.py instead.

    Args:
        args: Parsed command-line arguments
        repo_root: Repository root path

    Returns:
        Exit code (0 = success, 1 = error)
    """
    import hashlib

    task_id = args.init_context
    base_commit = args.base_commit
    force_secrets = args.force_secrets if hasattr(args, 'force_secrets') else False

    # Check for dirty working tree (Issue #7)
    try:
        git_provider = GitProvider(repo_root)
        status_result = git_provider.status(include_untracked=True)
        if status_result['is_dirty']:
            print("⚠️  Warning: Working tree has uncommitted changes:", file=sys.stderr)
            for file_path in status_result['files'][:5]:  # Show first 5 files
                print(f"  {file_path}", file=sys.stderr)
            if not force_secrets:
                print("\nContext initialization will proceed, but diffs may include uncommitted changes.", file=sys.stderr)
                print("Commit your changes first or use --force-secrets to bypass this warning.", file=sys.stderr)
    except Exception:
        pass  # Non-fatal, continue

    # Auto-detect base commit if not provided
    if not base_commit:
        try:
            git_provider = GitProvider(repo_root)
            base_commit = git_provider.get_current_commit()
        except Exception as e:
            print(f"Error: Unable to determine git HEAD: {e}", file=sys.stderr)
            return 1

    # Load task to get metadata
    datastore = TaskDatastore(repo_root)
    tasks = datastore.load_tasks()

    task = None
    for t in tasks:
        if t.id == task_id:
            task = t
            break

    if not task:
        print(f"Error: Task not found: {task_id}", file=sys.stderr)
        return 1

    # Build immutable context from task YAML + standards (Issue #1 fix)
    try:
        immutable = _build_immutable_context_from_task(Path(task.path))
    except ValidationError as e:
        if args.format == 'json':
            output_json({
                'success': False,
                'error': f'Failed to build context: {e}',
            })
        else:
            print(f"Error: Failed to build context: {e}", file=sys.stderr)
        return 1

    # Enrich standards citations with excerpts (Issue #2 fix - per §3.1 and §7)
    context_store = TaskContextStore(repo_root)
    enriched_citations = []
    for citation in immutable.get('standards_citations', []):
        std_file = citation.get('file')
        std_section = citation.get('section')

        if std_file and std_section:
            try:
                # Extract full excerpt with hash and line span
                excerpt = context_store.extract_standards_excerpt(
                    task_id=task_id,
                    standards_file=std_file,
                    section_heading=std_section
                )
                # Replace basic citation with enriched excerpt
                enriched_citations.append({
                    'file': excerpt.file,
                    'section': excerpt.section,
                    'requirement': excerpt.requirement,
                    'line_span': excerpt.line_span,
                    'content_sha256': excerpt.content_sha256,
                    'excerpt_id': excerpt.excerpt_id,
                    'cached_path': excerpt.cached_path,
                    'extracted_at': excerpt.extracted_at,
                })
            except (FileNotFoundError, ValueError) as e:
                # If excerpt extraction fails, keep basic citation but log warning
                import sys
                print(
                    f"Warning: Failed to extract excerpt for {std_file}#{std_section}: {e}",
                    file=sys.stderr,
                    flush=True
                )
                enriched_citations.append(citation)
        else:
            # Keep citation as-is if missing required fields
            enriched_citations.append(citation)

    # Replace citations with enriched versions
    immutable['standards_citations'] = enriched_citations

    # Calculate task file SHA
    task_content = Path(task.path).read_bytes()
    task_file_sha = hashlib.sha256(task_content).hexdigest()

    # Build source files list for manifest (GAP-4)
    source_files = []

    # Add task YAML file
    task_rel_path = Path(task.path).relative_to(repo_root)
    source_files.append(SourceFile(
        path=str(task_rel_path),
        sha256=task_file_sha,
        purpose='task_yaml'
    ))

    # Add standards files from citations
    standards_files_seen = set()
    for citation in immutable.get('standards_citations', []):
        std_file = citation.get('file')
        if std_file and std_file not in standards_files_seen:
            standards_files_seen.add(std_file)
            std_path = repo_root / std_file
            if std_path.exists():
                std_content = std_path.read_bytes()
                std_sha = hashlib.sha256(std_content).hexdigest()
                source_files.append(SourceFile(
                    path=std_file,
                    sha256=std_sha,
                    purpose='standards_citation'
                ))

    # Initialize context (context_store already created above for excerpt extraction)
    try:
        context = context_store.init_context(
            task_id=task_id,
            immutable=immutable,
            git_head=base_commit,
            task_file_sha=task_file_sha,
            created_by=args.actor if hasattr(args, 'actor') else "task-runner",
            force_secrets=force_secrets,
            source_files=source_files
        )

        if args.format == 'json':
            output_json({
                'success': True,
                'task_id': task_id,
                'base_commit': base_commit,
                'context_version': context.version,
                'manifest_created': len(source_files) > 0,
                'source_files_count': len(source_files),
            })
        else:
            print(f"✓ Initialized context for {task_id}")
            print(f"  Base commit: {base_commit[:8]}")
            print(f"  Context file: .agent-output/{task_id}/context.json")
            if source_files:
                print(f"  Manifest file: .agent-output/{task_id}/context.manifest ({len(source_files)} sources)")

        return 0

    except ContextExistsError as e:
        if args.format == 'json':
            output_json({
                'success': False,
                'error': str(e),
            })
        else:
            print(f"Error: {e}", file=sys.stderr)
        return 1

    except ValidationError as e:
        if args.format == 'json':
            output_json({
                'success': False,
                'error': str(e),
            })
        else:
            print(f"Error: {e}", file=sys.stderr)
        return 1


def cmd_get_context(args, repo_root: Path) -> int:
    """
    Read task context (immutable + coordination).

    Args:
        args: Parsed command-line arguments
        repo_root: Repository root path

    Returns:
        Exit code (0 = success, 1 = error)
    """
    task_id = args.get_context

    context_store = TaskContextStore(repo_root)
    context = context_store.get_context(task_id)

    if context is None:
        if args.format == 'json':
            output_json({
                'success': False,
                'error': f'No context found for {task_id}',
            })
        else:
            print(f"Error: No context found for {task_id}", file=sys.stderr)
        return 1

    # Check for staleness (Issue #6)
    from datetime import datetime, timezone
    created_dt = datetime.fromisoformat(context.created_at.replace('Z', '+00:00'))
    age_hours = (datetime.now(timezone.utc) - created_dt).total_seconds() / 3600
    staleness_warning = None

    if age_hours > 48:  # Warn if context is older than 48 hours
        staleness_warning = f"⚠️  Context is {age_hours:.1f} hours old. Consider rebuilding if task requirements changed."

    if args.format == 'json':
        output_json({
            'success': True,
            'context': context.to_dict(),
            'staleness_warning': staleness_warning,
            'age_hours': round(age_hours, 1),
        })
    else:
        # Pretty-print context
        print(f"Context for {context.task_id}")
        print(f"  Version: {context.version}")
        print(f"  Created: {context.created_at}")
        print(f"  Created by: {context.created_by}")
        print(f"  Git HEAD: {context.git_head[:8]}")
        print(f"  Age: {age_hours:.1f} hours")

        if staleness_warning:
            print(f"\n{staleness_warning}")

        print()
        print("Task Snapshot:")
        print(f"  Title: {context.task_snapshot.title}")
        print(f"  Priority: {context.task_snapshot.priority}")
        print(f"  Area: {context.task_snapshot.area}")
        print()
        print("Agent Coordination:")
        print(f"  Implementer: {context.implementer.status}")
        print(f"  Reviewer: {context.reviewer.status}")
        print(f"  Validator: {context.validator.status}")

    return 0


def cmd_update_agent(args, repo_root: Path) -> int:
    """
    Update coordination state for one agent.

    Args:
        args: Parsed command-line arguments
        repo_root: Repository root path

    Returns:
        Exit code (0 = success, 1 = error)
    """
    task_id = args.update_agent
    agent_role = args.agent
    force_secrets = args.force_secrets if hasattr(args, 'force_secrets') else False

    # Build updates dict from arguments
    updates = {}
    if args.status:
        updates['status'] = args.status
    if args.qa_log:
        updates['qa_log_path'] = args.qa_log
    if args.session_id:
        updates['session_id'] = args.session_id

    # Auto-populate completed_at when status changes to 'done' (Issue #8)
    if updates.get('status') == 'done' and 'completed_at' not in updates:
        from datetime import datetime, timezone
        updates['completed_at'] = datetime.now(timezone.utc).isoformat()

    if not updates:
        print("Error: No updates specified (use --status, --qa-log, or --session-id)", file=sys.stderr)
        return 1

    context_store = TaskContextStore(repo_root)

    try:
        # Check drift budget before mutations (Issue #3)
        _check_drift_budget(context_store, task_id)

        # Auto-verify worktree before mutations (Issue #2)
        _auto_verify_worktree(context_store, task_id, agent_role)

        context_store.update_coordination(
            task_id=task_id,
            agent_role=agent_role,
            updates=updates,
            actor=args.actor if hasattr(args, 'actor') else "task-runner",
            force_secrets=force_secrets
        )

        if args.format == 'json':
            output_json({
                'success': True,
                'task_id': task_id,
                'agent_role': agent_role,
                'updates': updates,
            })
        else:
            print(f"✓ Updated {agent_role} coordination for {task_id}")
            for key, value in updates.items():
                print(f"  {key}: {value}")

        return 0

    except (ContextNotFoundError, ValidationError) as e:
        if args.format == 'json':
            output_json({
                'success': False,
                'error': str(e),
            })
        else:
            print(f"Error: {e}", file=sys.stderr)
        return 1


def cmd_mark_blocked(args, repo_root: Path) -> int:
    """
    Add blocking finding to agent coordination.

    Args:
        args: Parsed command-line arguments
        repo_root: Repository root path

    Returns:
        Exit code (0 = success, 1 = error)
    """
    task_id = args.mark_blocked
    agent_role = args.agent
    finding = args.finding

    context_store = TaskContextStore(repo_root)

    try:
        # Check drift budget before mutations (Issue #3)
        _check_drift_budget(context_store, task_id)

        # Auto-verify worktree before mutations (Issue #2)
        _auto_verify_worktree(context_store, task_id, agent_role)

        # Get current context to retrieve existing findings
        context = context_store.get_context(task_id)
        if context is None:
            raise ContextNotFoundError(f"No context found for {task_id}")

        # Get current agent coordination
        agent_coord = getattr(context, agent_role)
        existing_findings = list(agent_coord.blocking_findings)
        existing_findings.append(finding)

        # Update coordination with new findings and blocked status
        context_store.update_coordination(
            task_id=task_id,
            agent_role=agent_role,
            updates={
                'blocking_findings': existing_findings,
                'status': 'blocked',
            },
            actor=args.actor if hasattr(args, 'actor') else "task-runner"
        )

        if args.format == 'json':
            output_json({
                'success': True,
                'task_id': task_id,
                'agent_role': agent_role,
                'finding': finding,
                'total_findings': len(existing_findings),
            })
        else:
            print(f"✓ Marked {agent_role} as blocked for {task_id}")
            print(f"  Finding: {finding}")
            print(f"  Total findings: {len(existing_findings)}")

        return 0

    except (ContextNotFoundError, ValidationError) as e:
        if args.format == 'json':
            output_json({
                'success': False,
                'error': str(e),
            })
        else:
            print(f"Error: {e}", file=sys.stderr)
        return 1


def cmd_purge_context(args, repo_root: Path) -> int:
    """
    Delete context directory (idempotent).

    Args:
        args: Parsed command-line arguments
        repo_root: Repository root path

    Returns:
        Exit code (0 = success)
    """
    task_id = args.purge_context

    context_store = TaskContextStore(repo_root)
    context_store.purge_context(task_id)

    if args.format == 'json':
        output_json({
            'success': True,
            'task_id': task_id,
        })
    else:
        print(f"✓ Purged context for {task_id}")

    return 0


def cmd_rebuild_context(args, repo_root: Path) -> int:
    """
    Rebuild context from manifest after standards/task changes (GAP-4/GAP-14).

    Reads the existing manifest, verifies sources, purges old context,
    and regenerates with current data.

    Args:
        args: Parsed command-line arguments
        repo_root: Repository root path

    Returns:
        Exit code (0 = success, 1 = error)
    """
    import hashlib

    task_id = args.rebuild_context
    force_secrets = args.force_secrets if hasattr(args, 'force_secrets') else False

    context_store = TaskContextStore(repo_root)

    # Check if context exists
    existing_context = context_store.get_context(task_id)
    if not existing_context:
        if args.format == 'json':
            output_json({
                'success': False,
                'error': f'No context found for {task_id}. Use --init-context first.',
            })
        else:
            print(f"Error: No context found for {task_id}", file=sys.stderr)
            print("Use --init-context to create a new context.", file=sys.stderr)
        return 1

    # Load manifest
    manifest = context_store.get_manifest(task_id)
    if not manifest:
        if args.format == 'json':
            output_json({
                'success': False,
                'error': f'No manifest found for {task_id}. Cannot rebuild without provenance info.',
            })
        else:
            print(f"Error: No manifest found for {task_id}", file=sys.stderr)
            print("Manifest is required for rebuild. Context was likely created before manifest feature.", file=sys.stderr)
        return 1

    # Load task to verify it still exists
    datastore = TaskDatastore(repo_root)
    tasks = datastore.load_tasks()

    task = None
    for t in tasks:
        if t.id == task_id:
            task = t
            break

    if not task:
        if args.format == 'json':
            output_json({
                'success': False,
                'error': f'Task {task_id} not found. Cannot rebuild context.',
            })
        else:
            print(f"Error: Task {task_id} not found.", file=sys.stderr)
        return 1

    # Verify source files still exist and warn about changes
    changes_detected = []
    for source_file in manifest.source_files:
        source_path = repo_root / source_file.path
        if not source_path.exists():
            changes_detected.append(f"Missing: {source_file.path}")
        else:
            current_sha = hashlib.sha256(source_path.read_bytes()).hexdigest()
            if current_sha != source_file.sha256:
                changes_detected.append(f"Modified: {source_file.path}")

    if changes_detected and not force_secrets:
        if args.format == 'json':
            output_json({
                'success': False,
                'error': 'Source files have changed. Review changes before rebuilding.',
                'changes': changes_detected,
            })
        else:
            print("⚠️  Warning: Source files have changed since last initialization:", file=sys.stderr)
            for change in changes_detected[:10]:  # Show first 10
                print(f"  {change}", file=sys.stderr)
            print("\nReview these changes before rebuilding.", file=sys.stderr)
            print("Use --force-secrets to proceed anyway.", file=sys.stderr)
        return 1

    # Get current git HEAD
    try:
        git_provider = GitProvider(repo_root)
        current_head = git_provider.get_current_commit()
    except Exception as e:
        if args.format == 'json':
            output_json({
                'success': False,
                'error': f'Unable to determine git HEAD: {e}',
            })
        else:
            print(f"Error: Unable to determine git HEAD: {e}", file=sys.stderr)
        return 1

    # Purge old context
    context_store.purge_context(task_id)

    # Rebuild immutable context from current task
    try:
        immutable = _build_immutable_context_from_task(Path(task.path))
    except ValidationError as e:
        if args.format == 'json':
            output_json({
                'success': False,
                'error': f'Failed to build context: {e}',
            })
        else:
            print(f"Error: Failed to build context: {e}", file=sys.stderr)
        return 1

    # Enrich standards citations with excerpts (Issue #2 fix - per §3.1 and §7)
    enriched_citations = []
    for citation in immutable.get('standards_citations', []):
        std_file = citation.get('file')
        std_section = citation.get('section')

        if std_file and std_section:
            try:
                # Extract full excerpt with hash and line span
                excerpt = context_store.extract_standards_excerpt(
                    task_id=task_id,
                    standards_file=std_file,
                    section_heading=std_section
                )
                # Replace basic citation with enriched excerpt
                enriched_citations.append({
                    'file': excerpt.file,
                    'section': excerpt.section,
                    'requirement': excerpt.requirement,
                    'line_span': excerpt.line_span,
                    'content_sha256': excerpt.content_sha256,
                    'excerpt_id': excerpt.excerpt_id,
                    'cached_path': excerpt.cached_path,
                    'extracted_at': excerpt.extracted_at,
                })
            except (FileNotFoundError, ValueError) as e:
                # If excerpt extraction fails, keep basic citation but log warning
                import sys
                print(
                    f"Warning: Failed to extract excerpt for {std_file}#{std_section}: {e}",
                    file=sys.stderr,
                    flush=True
                )
                enriched_citations.append(citation)
        else:
            # Keep citation as-is if missing required fields
            enriched_citations.append(citation)

    # Replace citations with enriched versions
    immutable['standards_citations'] = enriched_citations

    # Calculate current task file SHA
    task_content = Path(task.path).read_bytes()
    task_file_sha = hashlib.sha256(task_content).hexdigest()

    # Build fresh source files list
    source_files = []
    task_rel_path = Path(task.path).relative_to(repo_root)
    source_files.append(SourceFile(
        path=str(task_rel_path),
        sha256=task_file_sha,
        purpose='task_yaml'
    ))

    standards_files_seen = set()
    for citation in immutable.get('standards_citations', []):
        std_file = citation.get('file')
        if std_file and std_file not in standards_files_seen:
            standards_files_seen.add(std_file)
            std_path = repo_root / std_file
            if std_path.exists():
                std_content = std_path.read_bytes()
                std_sha = hashlib.sha256(std_content).hexdigest()
                source_files.append(SourceFile(
                    path=std_file,
                    sha256=std_sha,
                    purpose='standards_citation'
                ))

    # Re-initialize context
    try:
        _context = context_store.init_context(
            task_id=task_id,
            immutable=immutable,
            git_head=current_head,
            task_file_sha=task_file_sha,
            created_by=args.actor if hasattr(args, 'actor') else "task-runner",
            force_secrets=force_secrets,
            source_files=source_files
        )

        if args.format == 'json':
            output_json({
                'success': True,
                'task_id': task_id,
                'git_head': current_head,
                'changes_applied': len(changes_detected),
                'source_files_count': len(source_files),
            })
        else:
            print(f"✓ Rebuilt context for {task_id}")
            print(f"  Git HEAD: {current_head[:8]}")
            if changes_detected:
                print(f"  Changes applied: {len(changes_detected)} source files updated")
            print(f"  Context file: .agent-output/{task_id}/context.json")
            print(f"  Manifest file: .agent-output/{task_id}/context.manifest ({len(source_files)} sources)")

        return 0

    except Exception as e:
        if args.format == 'json':
            output_json({
                'success': False,
                'error': str(e),
            })
        else:
            print(f"Error: Failed to rebuild context: {e}", file=sys.stderr)
        return 1


# ============================================================================
# Delta Tracking Commands (Phase 2 Day 6)
# ============================================================================

def cmd_snapshot_worktree(args, repo_root: Path) -> int:
    """
    Snapshot working tree state at agent completion.

    Args:
        args: Parsed command-line arguments
        repo_root: Repository root path

    Returns:
        Exit code (0 = success, 1 = error)
    """

    task_id = args.snapshot_worktree
    agent_role = args.agent
    actor = args.actor if hasattr(args, 'actor') else "task-runner"
    previous_agent = args.previous_agent if hasattr(args, 'previous_agent') else None

    if not agent_role:
        print("Error: --agent is required for snapshot-worktree", file=sys.stderr)
        return 1

    # Get base commit from context
    context_store = TaskContextStore(repo_root)
    context = context_store.get_context(task_id)

    if context is None:
        if args.format == 'json':
            output_json({
                'success': False,
                'error': f'No context found for {task_id}',
            })
        else:
            print(f"Error: No context found for {task_id}", file=sys.stderr)
        return 1

    base_commit = context.git_head

    try:
        # Check drift budget before mutations (Issue #3)
        _check_drift_budget(context_store, task_id)

        # Auto-verify worktree before mutations (Issue #2)
        _auto_verify_worktree(context_store, task_id, agent_role)

        snapshot = context_store.snapshot_worktree(
            task_id=task_id,
            agent_role=agent_role,
            actor=actor,
            base_commit=base_commit,
            previous_agent=previous_agent
        )

        if args.format == 'json':
            output_json({
                'success': True,
                'task_id': task_id,
                'agent_role': agent_role,
                'snapshot': snapshot.to_dict(),
            })
        else:
            print(f"✓ Snapshotted working tree for {agent_role} on {task_id}")
            print(f"  Base commit: {snapshot.base_commit[:8]}")
            print(f"  Files changed: {len(snapshot.files_changed)}")
            print(f"  Diff saved to: {snapshot.diff_from_base}")
            print(f"  Diff stat: {snapshot.diff_stat}")

            if snapshot.incremental_diff_error:
                print("\n⚠️  Incremental diff calculation failed:")
                print(f"  {snapshot.incremental_diff_error}")

        return 0

    except (ValidationError, ContextNotFoundError) as e:
        if args.format == 'json':
            output_json({
                'success': False,
                'error': str(e),
            })
        else:
            print(f"Error: {e}", file=sys.stderr)
        return 1


def cmd_verify_worktree_legacy(args, repo_root: Path) -> int:
    """
    Legacy: Verify working tree matches expected state from previous agent.
    Use cmd_verify_worktree from commands.py instead.

    Args:
        args: Parsed command-line arguments
        repo_root: Repository root path

    Returns:
        Exit code (0 = success, 1 = error)
    """
    task_id = args.verify_worktree
    expected_agent = args.expected_agent

    if not expected_agent:
        print("Error: --expected-agent is required for verify-worktree", file=sys.stderr)
        return 1

    context_store = TaskContextStore(repo_root)

    try:
        context_store.verify_worktree_state(
            task_id=task_id,
            expected_agent=expected_agent
        )

        if args.format == 'json':
            output_json({
                'success': True,
                'task_id': task_id,
                'expected_agent': expected_agent,
                'drift_detected': False,
            })
        else:
            print(f"✓ Working tree verified against {expected_agent} snapshot for {task_id}")
            print("  No drift detected")

        return 0

    except DriftError as e:
        if args.format == 'json':
            output_json({
                'success': False,
                'drift_detected': True,
                'error': str(e),
            })
        else:
            print("❌ Drift detected:", file=sys.stderr)
            print(str(e), file=sys.stderr)
        return 1

    except ContextNotFoundError as e:
        if args.format == 'json':
            output_json({
                'success': False,
                'error': str(e),
            })
        else:
            print(f"Error: {e}", file=sys.stderr)
        return 1


def cmd_get_diff(args, repo_root: Path) -> int:
    """
    Retrieve diff file path for an agent's changes.

    Args:
        args: Parsed command-line arguments
        repo_root: Repository root path

    Returns:
        Exit code (0 = success, 1 = error)
    """
    task_id = args.get_diff
    agent_role = args.agent
    diff_type = args.diff_type if hasattr(args, 'diff_type') else 'from_base'

    if not agent_role:
        print("Error: --agent is required for get-diff", file=sys.stderr)
        return 1

    context_store = TaskContextStore(repo_root)
    context = context_store.get_context(task_id)

    if context is None:
        if args.format == 'json':
            output_json({
                'success': False,
                'error': f'No context found for {task_id}',
            })
        else:
            print(f"Error: No context found for {task_id}", file=sys.stderr)
        return 1

    # Get agent coordination
    try:
        agent_coord = getattr(context, agent_role)
        snapshot = agent_coord.worktree_snapshot

        if snapshot is None:
            raise ContextNotFoundError(f"No worktree snapshot found for {agent_role}")

        # Get diff path based on type
        if diff_type == 'from_base':
            diff_path = snapshot.diff_from_base
        elif diff_type == 'incremental':
            if agent_role != 'reviewer':
                raise ValidationError("Incremental diff only available for reviewer")
            if snapshot.diff_from_implementer is None:
                if snapshot.incremental_diff_error:
                    raise ValidationError(f"Incremental diff unavailable: {snapshot.incremental_diff_error}")
                else:
                    raise ValidationError("Incremental diff not calculated")
            diff_path = snapshot.diff_from_implementer
        else:
            raise ValidationError(f"Invalid diff type: {diff_type}")

        # Read diff content
        full_diff_path = repo_root / diff_path
        if not full_diff_path.exists():
            raise ValidationError(f"Diff file not found: {diff_path}")

        diff_content = full_diff_path.read_text(encoding='utf-8')

        if args.format == 'json':
            output_json({
                'success': True,
                'task_id': task_id,
                'agent_role': agent_role,
                'diff_type': diff_type,
                'diff_path': diff_path,
                'diff_content': diff_content,
                'diff_stat': snapshot.diff_stat,
            })
        else:
            print(f"Diff for {agent_role} ({diff_type}): {diff_path}")
            print()
            print(diff_content)

        return 0

    except (AttributeError, ContextNotFoundError, ValidationError) as e:
        if args.format == 'json':
            output_json({
                'success': False,
                'error': str(e),
            })
        else:
            print(f"Error: {e}", file=sys.stderr)
        return 1


def _parse_qa_log(qa_log_content: str, command_type: Optional[str] = None) -> dict:
    """
    Parse QA log content to extract test results.

    Per Section 4.2 of task-context-cache-hardening-schemas.md.

    Attempts to extract structured information from QA command output including:
    - Test pass/fail counts
    - Coverage percentages
    - Lint/typecheck results
    - Error messages

    Args:
        qa_log_content: Raw QA log file content
        command_type: Optional command type hint ('lint', 'typecheck', 'test', 'coverage')
                      If not provided, will attempt to auto-detect

    Returns:
        Dictionary with parsed results (compatible with QACommandSummary schema)
    """

    # Auto-detect command type if not provided
    if command_type is None:
        command_type = _detect_command_type(qa_log_content)

    # Initialize results structure
    results = {
        'lint_errors': None,
        'lint_warnings': None,
        'type_errors': None,
        'tests_passed': None,
        'tests_failed': None,
        'coverage': None,
    }

    # Parse based on command type
    if command_type == 'lint':
        results.update(_parse_lint_output(qa_log_content))
    elif command_type == 'typecheck':
        results.update(_parse_typecheck_output(qa_log_content))
    elif command_type == 'test':
        results.update(_parse_test_output(qa_log_content))
    elif command_type == 'coverage':
        results.update(_parse_coverage_output(qa_log_content))
    else:
        # Unknown type - try all parsers
        results.update(_parse_lint_output(qa_log_content))
        results.update(_parse_typecheck_output(qa_log_content))
        results.update(_parse_test_output(qa_log_content))
        results.update(_parse_coverage_output(qa_log_content))

    # Filter out None values for cleaner output
    return {k: v for k, v in results.items() if v is not None}


def _detect_command_type(log_content: str) -> Optional[str]:
    """Auto-detect command type from log content."""
    content_lower = log_content.lower()

    if 'eslint' in content_lower or 'prettier' in content_lower:
        return 'lint'
    elif 'typescript' in content_lower or 'error ts' in content_lower or 'tsc' in content_lower:
        return 'typecheck'
    elif 'jest' in content_lower or 'vitest' in content_lower:
        return 'test'
    elif 'coverage' in content_lower or 'istanbul' in content_lower:
        return 'coverage'

    return None


def _parse_lint_output(log_content: str) -> dict:
    """Parse ESLint/Prettier output."""
    import re

    results = {}

    # ESLint format: "✖ 3 problems (2 errors, 1 warning)"
    problem_match = re.search(r'✖\s+(\d+)\s+problems?\s+\((\d+)\s+errors?,\s+(\d+)\s+warnings?\)', log_content)
    if problem_match:
        results['lint_errors'] = int(problem_match.group(2))
        results['lint_warnings'] = int(problem_match.group(3))
    else:
        # Try alternate formats
        error_match = re.search(r'(\d+)\s+errors?', log_content, re.IGNORECASE)
        warning_match = re.search(r'(\d+)\s+warnings?', log_content, re.IGNORECASE)

        if error_match:
            results['lint_errors'] = int(error_match.group(1))
        elif '✓' in log_content or 'no problems' in log_content.lower():
            results['lint_errors'] = 0

        if warning_match:
            results['lint_warnings'] = int(warning_match.group(1))
        elif '✓' in log_content or 'no problems' in log_content.lower():
            results['lint_warnings'] = 0

    return results


def _parse_typecheck_output(log_content: str) -> dict:
    """Parse TypeScript compiler output."""
    import re

    results = {}

    # Count TypeScript errors: "error TS2304:"
    type_errors = len(re.findall(r'error TS\d+:', log_content))
    if type_errors > 0:
        results['type_errors'] = type_errors
    elif 'found 0 errors' in log_content.lower() or 'successfully compiled' in log_content.lower():
        results['type_errors'] = 0

    return results


def _parse_test_output(log_content: str) -> dict:
    """Parse Jest/Vitest test output."""
    import re

    results = {}

    # Jest format: "Tests: 5 passed, 5 total"
    test_match = re.search(r'Tests:\s+(\d+)\s+passed(?:,\s+(\d+)\s+failed)?.*?(\d+)\s+total', log_content, re.IGNORECASE)
    if test_match:
        results['tests_passed'] = int(test_match.group(1))
        results['tests_failed'] = int(test_match.group(2)) if test_match.group(2) else 0
    else:
        # Try alternate format: "Passed: 5, Failed: 0"
        passed_match = re.search(r'passed:\s*(\d+)', log_content, re.IGNORECASE)
        failed_match = re.search(r'failed:\s*(\d+)', log_content, re.IGNORECASE)

        if passed_match:
            results['tests_passed'] = int(passed_match.group(1))
        if failed_match:
            results['tests_failed'] = int(failed_match.group(1))

    return results


def _parse_coverage_output(log_content: str) -> dict:
    """Parse Jest/Istanbul coverage output."""
    import re

    results = {}
    coverage = {}

    # Istanbul/NYC table format:
    # All files      |   85.5  |   70.2  |   90.1  |   85.5  |
    # Columns: Statements | Branches | Functions | Lines
    coverage_match = re.search(
        r'All files\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)',
        log_content
    )

    if coverage_match:
        coverage['statements'] = float(coverage_match.group(1))
        coverage['branches'] = float(coverage_match.group(2))
        coverage['functions'] = float(coverage_match.group(3))
        coverage['lines'] = float(coverage_match.group(4))
    else:
        # Try individual metric extraction
        for metric in ['statements', 'branches', 'functions', 'lines']:
            match = re.search(rf'{metric}\s*:\s*([\d.]+)%?', log_content, re.IGNORECASE)
            if match:
                coverage[metric] = float(match.group(1))

    if coverage:
        results['coverage'] = coverage

    return results


def cmd_record_qa_legacy(args, repo_root: Path) -> int:
    """
    Legacy: Update validation baseline with QA results.
    Use cmd_record_qa from commands.py instead.

    Args:
        args: Parsed command-line arguments
        repo_root: Repository root path

    Returns:
        Exit code (0 = success, 1 = error)
    """
    task_id = args.record_qa
    agent_role = args.agent
    qa_log_path = args.qa_log_from if hasattr(args, 'qa_log_from') else None
    command_type = getattr(args, 'command_type', None)

    if not agent_role:
        print("Error: --agent is required for record-qa", file=sys.stderr)
        return 1

    if not qa_log_path:
        print("Error: --from is required for record-qa (path to QA log)", file=sys.stderr)
        return 1

    # Read QA log content
    qa_log_file = Path(qa_log_path)
    if not qa_log_file.exists():
        print(f"Error: QA log file not found: {qa_log_path}", file=sys.stderr)
        return 1

    qa_log_content = qa_log_file.read_text(encoding='utf-8')

    # Parse QA results with enhanced parser (Section 4.2)
    qa_results = _parse_qa_log(qa_log_content, command_type=command_type)

    # Calculate log file SHA256
    import hashlib
    log_sha256 = hashlib.sha256(qa_log_content.encode('utf-8')).hexdigest()

    # Get current git SHA
    try:
        git_provider = GitProvider(repo_root)
        git_sha = git_provider.get_current_commit()
    except Exception:
        git_sha = None

    # Update coordination with QA log path and results
    context_store = TaskContextStore(repo_root)

    try:
        # Check drift budget before mutations (Issue #3)
        _check_drift_budget(context_store, task_id)

        # Auto-verify worktree before mutations (Issue #2)
        _auto_verify_worktree(context_store, task_id, agent_role)

        # Build structured QA results (Section 4.1 schema)
        from datetime import datetime, timezone
        qa_results_with_metadata = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'git_sha': git_sha,
            'log_path': qa_log_path,
            'log_sha256': log_sha256,
            'command_type': command_type or _detect_command_type(qa_log_content),
            'summary': qa_results,  # Structured summary per QACommandSummary schema
        }

        # Update coordination with qa_log_path and qa_results (mutable section)
        updates = {
            'qa_log_path': qa_log_path,
            'qa_results': qa_results_with_metadata,
        }

        context_store.update_coordination(
            task_id=task_id,
            agent_role=agent_role,
            updates=updates,
            actor=args.actor if hasattr(args, 'actor') else "task-runner"
        )

        if args.format == 'json':
            output_json({
                'success': True,
                'task_id': task_id,
                'agent_role': agent_role,
                'qa_log_path': qa_log_path,
                'log_sha256': log_sha256,
                'qa_results': qa_results,
            })
        else:
            print(f"✓ Recorded QA results for {agent_role} on {task_id}")
            print(f"  QA log: {qa_log_path}")
            print(f"  Command type: {qa_results_with_metadata['command_type'] or 'auto-detected'}")

            # Display structured results
            if 'lint_errors' in qa_results:
                errors = qa_results['lint_errors']
                warnings = qa_results.get('lint_warnings', 0)
                status = '✓' if errors == 0 else '✗'
                print(f"  Lint: {status} {errors} errors, {warnings} warnings")

            if 'type_errors' in qa_results:
                errors = qa_results['type_errors']
                status = '✓' if errors == 0 else '✗'
                print(f"  Typecheck: {status} {errors} errors")

            if 'tests_passed' in qa_results and 'tests_failed' in qa_results:
                passed = qa_results['tests_passed']
                failed = qa_results['tests_failed']
                total = passed + failed
                status = '✓' if failed == 0 else '✗'
                print(f"  Tests: {status} {passed}/{total} passed")

            if 'coverage' in qa_results:
                cov = qa_results['coverage']
                if 'lines' in cov and 'branches' in cov:
                    print(f"  Coverage: {cov['lines']:.1f}% lines, {cov['branches']:.1f}% branches")

        return 0

    except (ContextNotFoundError, ValidationError, DriftError) as e:
        if args.format == 'json':
            output_json({
                'success': False,
                'error': str(e),
            })
        else:
            print(f"Error: {e}", file=sys.stderr)
        return 1


def cmd_compare_qa(args, repo_root: Path) -> int:
    """
    Compare current QA results against baseline and detect drift.

    Per Section 4.3 of task-context-cache-hardening-schemas.md.

    Args:
        args: Parsed command-line arguments
        repo_root: Repository root path

    Returns:
        Exit code (0 = no drift, 1 = drift detected or error)
    """
    from .validation import detect_qa_drift, format_drift_report
    from .context_store import QAResults

    task_id = args.compare_qa
    agent_role = args.agent
    qa_log_path = getattr(args, 'qa_log_from', None)
    command_type = getattr(args, 'command_type', None)

    if not agent_role:
        print("Error: --agent is required for compare-qa", file=sys.stderr)
        return 1

    if not qa_log_path:
        print("Error: --from is required for compare-qa (path to current QA log)", file=sys.stderr)
        return 1

    # Read current QA log
    qa_log_file = Path(qa_log_path)
    if not qa_log_file.exists():
        print(f"Error: QA log file not found: {qa_log_path}", file=sys.stderr)
        return 1

    qa_log_content = qa_log_file.read_text(encoding='utf-8')
    current_results = _parse_qa_log(qa_log_content, command_type=command_type)

    # Get baseline from context
    context_store = TaskContextStore(repo_root)

    try:
        context = context_store.get_context(task_id)
        coord = getattr(context, agent_role)

        # Check if baseline exists
        baseline_data = coord.qa_results
        if not baseline_data:
            if args.format == 'json':
                output_json({
                    'success': False,
                    'error': f'No baseline QA results found for {agent_role} on {task_id}',
                })
            else:
                print(f"Error: No baseline QA results found for {agent_role} on {task_id}", file=sys.stderr)
                print("Run --record-qa first to establish a baseline", file=sys.stderr)
            return 1

        # Build QAResults objects for comparison
        from datetime import datetime, timezone
        import hashlib

        # Baseline
        baseline_summary = baseline_data.get('summary', {})
        baseline_qa_results = QAResults(
            recorded_at=baseline_data.get('timestamp', datetime.now(timezone.utc).isoformat()),
            agent=agent_role,
            git_sha=baseline_data.get('git_sha'),
            results=[{
                'command_id': 'baseline',
                'command': baseline_data.get('log_path', ''),
                'exit_code': 0,
                'duration_ms': 0,
                'summary': baseline_summary
            }]
        )

        # Current
        _current_sha = hashlib.sha256(qa_log_content.encode('utf-8')).hexdigest()
        current_qa_results = QAResults(
            recorded_at=datetime.now(timezone.utc).isoformat(),
            agent=agent_role,
            git_sha=None,
            results=[{
                'command_id': 'baseline',
                'command': qa_log_path,
                'exit_code': 0,
                'duration_ms': 0,
                'summary': current_results
            }]
        )

        # Detect drift
        drift = detect_qa_drift(baseline_qa_results, current_qa_results)

        if args.format == 'json':
            output_json({
                'success': True,
                'task_id': task_id,
                'agent_role': agent_role,
                'has_drift': drift['has_drift'],
                'regressions': drift['regressions'],
                'improvements': drift['improvements'],
                'baseline': baseline_summary,
                'current': current_results,
            })
        else:
            print(f"QA Drift Detection for {task_id} ({agent_role})")
            print("=" * 60)
            print(f"\nBaseline: {baseline_data.get('log_path', 'unknown')}")
            print(f"Current:  {qa_log_path}\n")
            print(format_drift_report(drift))

        return 0 if not drift['has_drift'] else 1

    except ContextNotFoundError as e:
        if args.format == 'json':
            output_json({
                'success': False,
                'error': str(e),
            })
        else:
            print(f"Error: {e}", file=sys.stderr)
        return 1


def cmd_resolve_drift(args, repo_root: Path) -> int:
    """
    Reset drift budget and record resolution.

    Args:
        args: Parsed command-line arguments
        repo_root: Repository root path

    Returns:
        Exit code (0 = success, 1 = error)
    """
    task_id = args.resolve_drift
    agent_role = args.agent
    note = args.note

    if not agent_role:
        print("Error: --agent is required for resolve-drift", file=sys.stderr)
        return 1

    if not note:
        print("Error: --note is required for resolve-drift (resolution description)", file=sys.stderr)
        return 1

    context_store = TaskContextStore(repo_root)

    try:
        # Get current context
        context = context_store.get_context(task_id)
        if context is None:
            raise ContextNotFoundError(f"No context found for {task_id}")

        # Get current drift budget
        agent_coord = getattr(context, agent_role)
        current_drift = agent_coord.drift_budget

        if current_drift == 0:
            if args.format == 'json':
                output_json({
                    'success': True,
                    'task_id': task_id,
                    'agent_role': agent_role,
                    'message': 'No drift budget to resolve (already 0)',
                })
            else:
                print(f"✓ No drift budget to resolve for {agent_role} on {task_id}")
                print("  Drift budget is already 0")
            return 0

        # Reset drift budget to 0
        from datetime import datetime, timezone
        resolution_record = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'note': note,
            'previous_drift_budget': current_drift,
        }

        updates = {
            'drift_budget': 0,
        }

        context_store.update_coordination(
            task_id=task_id,
            agent_role=agent_role,
            updates=updates,
            actor=args.actor if hasattr(args, 'actor') else "operator"
        )

        if args.format == 'json':
            output_json({
                'success': True,
                'task_id': task_id,
                'agent_role': agent_role,
                'previous_drift_budget': current_drift,
                'resolution': resolution_record,
            })
        else:
            print(f"✓ Resolved drift for {agent_role} on {task_id}")
            print(f"  Previous drift budget: {current_drift}")
            print("  New drift budget: 0")
            print(f"  Resolution note: {note}")

        return 0

    except (ContextNotFoundError, ValidationError) as e:
        if args.format == 'json':
            output_json({
                'success': False,
                'error': str(e),
            })
        else:
            print(f"Error: {e}", file=sys.stderr)
        return 1


# Error message templates with recovery actions
ERROR_TEMPLATES = {
    "dirty_tree": {
        "message": "Git working tree has unexpected dirty files",
        "recovery_action": "Commit or stash changes, or use --allow-preexisting-dirty flag",
    },
    "missing_task": {
        "message": "Task file not found",
        "recovery_action": "Verify task ID and check tasks/ directory",
    },
    "invalid_env": {
        "message": "Invalid --env format",
        "recovery_action": "Use format: --env KEY=VALUE",
    },
    "validation_failed": {
        "message": "Validation command failed",
        "recovery_action": "Check logs and fix issues, or mark command as blocked",
    },
}


def format_error_with_recovery(error_key: str, details: Optional[str] = None) -> Dict[str, str]:
    """
    Format error message with recovery action.

    Args:
        error_key: Key identifying error type
        details: Optional additional error details

    Returns:
        Dictionary with 'error' and 'recovery_action' keys
    """
    template = ERROR_TEMPLATES.get(
        error_key, {"message": "Unknown error", "recovery_action": "Check logs and retry"}
    )

    message = template["message"]
    if details:
        message += f": {details}"

    return {"error": message, "recovery_action": template["recovery_action"]}


def parse_env_vars(env_list: Optional[List[str]]) -> Dict[str, str]:
    """
    Parse --env KEY=VALUE arguments into dict.

    Args:
        env_list: List of KEY=VALUE strings from --env arguments

    Returns:
        Dictionary mapping environment variable names to values

    Raises:
        ValueError: If any env string is not in KEY=VALUE format
    """
    if not env_list:
        return {}

    env_dict = {}
    for env_str in env_list:
        if '=' not in env_str:
            raise ValueError(f"Invalid --env format: {env_str} (expected KEY=VALUE)")
        key, value = env_str.split('=', 1)
        env_dict[key.strip()] = value.strip()

    return env_dict


def main():
    """Main CLI entry point."""
    # Check if this is a Typer subcommand (e.g., "context")
    # If so, dispatch to Typer app directly
    if len(sys.argv) > 1 and sys.argv[1] in ('context',):
        from .app import app, initialize_commands

        # Find repo root
        repo_root = find_repo_root()

        # Initialize Typer commands with context
        initialize_commands(repo_root)

        # Remove script name and invoke Typer app
        # sys.argv[0] = 'tasks'  # Keep original name
        typer_args = sys.argv[1:]  # Pass everything except script name

        try:
            app(typer_args, standalone_mode=False)
            return 0
        except SystemExit as e:
            return e.code if e.code is not None else 0
        except Exception as e:
            print(f"Error executing command: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc()
            return 1

    # Otherwise, use legacy argparse CLI
    parser = argparse.ArgumentParser(
        description="Task workflow CLI for PhotoEditor project",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Initialize context with custom environment
  python scripts/tasks.py --init-context TASK-0818 --env STORYBOOK_BUILD=1

  # List tasks in JSON format
  python scripts/tasks.py --list --format json | jq

  # Attach evidence with custom environment
  python scripts/tasks.py --attach-evidence TASK-0818 --type qa_output --path .agent-output/TASK-0818/qa.log

  # Check dirty tree before starting work
  python scripts/tasks.py --verify-worktree TASK-0818

  # Run validation with custom env
  python scripts/tasks.py --run-validation TASK-0818 --command-id val-001 --env NODE_ENV=test

For more information, see: docs/proposals/task-context-cache-hardening.md
        """,
    )

    # Commands (mutually exclusive)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        '--list',
        nargs='?',
        const='all',
        metavar='FILTER',
        help='List tasks (optional filter: todo, in_progress, blocked, completed, unblocker)'
    )
    group.add_argument(
        '--pick',
        nargs='?',
        const='auto',
        metavar='FILTER',
        help='Pick next task (optional filter: auto, todo, in_progress, unblocker)'
    )
    group.add_argument(
        '--validate',
        action='store_true',
        help='Validate dependency graph (cycles, missing deps)'
    )
    group.add_argument(
        '--refresh-cache',
        action='store_true',
        help='Force rebuild of task cache'
    )
    group.add_argument(
        '--graph',
        action='store_true',
        help='Export dependency graph in Graphviz DOT format'
    )
    group.add_argument(
        '--claim',
        metavar='TASK_PATH',
        help='Claim a task (transition to in_progress)'
    )
    group.add_argument(
        '--complete',
        metavar='TASK_PATH',
        help='Complete a task and archive it to docs/completed-tasks/'
    )
    group.add_argument(
        '--archive',
        metavar='TASK_PATH',
        help='Archive a completed task to docs/completed-tasks/ without changing status'
    )
    group.add_argument(
        '--explain',
        metavar='TASK_ID',
        help='Explain dependency chain for a task (shows blockers, artifacts, readiness)'
    )
    group.add_argument(
        '--check-halt',
        action='store_true',
        help='Check for workflow halt conditions (blocked unblockers)'
    )
    group.add_argument(
        '--lint',
        metavar='TASK_PATH',
        help='Lint a task file for schema 1.1 compliance (validates evidence paths, validation section, plan outputs, standards anchors)'
    )
    group.add_argument(
        '--bootstrap-evidence',
        metavar='TASK_ID',
        help='Create evidence file stub for a task (creates docs/evidence/tasks/TASK-ID-clarifications.md)'
    )

    # Context cache commands (Phase 2)
    # Note: --init-context moved to Session S15 section for enhanced implementation
    group.add_argument(
        '--get-context',
        metavar='TASK_ID',
        help='Read context (immutable + coordination); pretty-print or JSON output'
    )
    group.add_argument(
        '--update-agent',
        metavar='TASK_ID',
        help='Update coordination state for one agent (atomic)'
    )
    group.add_argument(
        '--mark-blocked',
        metavar='TASK_ID',
        help='Add blocking finding to agent coordination'
    )
    group.add_argument(
        '--purge-context',
        metavar='TASK_ID',
        help='Manual cleanup (normally auto-purged on completion)'
    )
    group.add_argument(
        '--rebuild-context',
        metavar='TASK_ID',
        help='Rebuild context from manifest after standards/task changes (GAP-4/GAP-14)'
    )

    # Delta tracking commands (Day 6)
    group.add_argument(
        '--snapshot-worktree',
        metavar='TASK_ID',
        help='Snapshot working tree state at agent completion'
    )
    # Note: --verify-worktree moved to Session S15 section for enhanced implementation
    group.add_argument(
        '--get-diff',
        metavar='TASK_ID',
        help='Retrieve diff file path for an agent\'s changes'
    )
    group.add_argument(
        '--record-qa',
        metavar='TASK_ID',
        help='Update validation baseline with QA results'
    )
    group.add_argument(
        '--compare-qa',
        metavar='TASK_ID',
        help='Compare current QA results against baseline and detect drift'
    )
    group.add_argument(
        '--resolve-drift',
        metavar='TASK_ID',
        help='Reset drift budget and record resolution (requires --agent and --note)'
    )

    # Evidence and standards commands (Session S13)
    group.add_argument(
        '--attach-evidence',
        metavar='TASK_ID',
        help='Attach evidence to task context (requires --type, --path, --description)'
    )
    group.add_argument(
        '--list-evidence',
        metavar='TASK_ID',
        help='List evidence attachments for a task'
    )
    group.add_argument(
        '--attach-standard',
        metavar='TASK_ID',
        help='Attach standards excerpt to task context (requires --file, --section)'
    )

    # Exception ledger commands (Session S13)
    group.add_argument(
        '--add-exception',
        metavar='TASK_ID',
        help='Add exception to ledger (requires --exception-type, --message)'
    )
    group.add_argument(
        '--list-exceptions',
        action='store_true',
        help='List exceptions from ledger (optional --status filter)'
    )
    group.add_argument(
        '--resolve-exception',
        metavar='TASK_ID',
        help='Resolve exception in ledger (optional --notes)'
    )
    group.add_argument(
        '--cleanup-exceptions',
        metavar='TASK_ID',
        help='Cleanup exceptions based on trigger (optional --trigger)'
    )

    # Quarantine commands (Session S13)
    group.add_argument(
        '--quarantine-task',
        metavar='TASK_ID',
        help='Quarantine a task (requires --reason, optional --error-details)'
    )
    group.add_argument(
        '--list-quarantined',
        action='store_true',
        help='List quarantined tasks (optional --status filter)'
    )
    group.add_argument(
        '--release-quarantine',
        metavar='TASK_ID',
        help='Release task from quarantine'
    )

    # Enhanced context initialization and lifecycle commands (Session S15)
    group.add_argument(
        '--init-context',
        metavar='TASK_ID',
        help='Initialize task context with all validations (quarantine, AC, snapshots)'
    )
    group.add_argument(
        '--run-validation',
        metavar='TASK_ID',
        help='Run validation command (requires --command-id, --command)'
    )
    group.add_argument(
        '--verify-worktree',
        metavar='TASK_ID',
        help='Verify working tree for drift'
    )
    group.add_argument(
        '--collect-metrics',
        metavar='TASK_ID',
        help='Collect metrics for a task (optional --baseline-path)'
    )
    group.add_argument(
        '--generate-dashboard',
        action='store_true',
        help='Generate metrics dashboard (requires --task-ids, --output-path)'
    )
    group.add_argument(
        '--compare-metrics',
        action='store_true',
        help='Compare baseline and current metrics (requires --baseline-path, --current-path)'
    )

    # Output format option (applies to list, pick, validate, explain, check-halt)
    parser.add_argument(
        '--format',
        choices=['text', 'json'],
        default='text',
        help='Output format (default: text)'
    )

    # Context cache specific arguments
    parser.add_argument(
        '--base-commit',
        metavar='SHA',
        help='Base commit SHA for context initialization (auto-detected if not provided)'
    )
    parser.add_argument(
        '--agent',
        choices=['implementer', 'reviewer', 'validator'],
        help='Agent role for coordination updates'
    )
    parser.add_argument(
        '--status',
        choices=['pending', 'in_progress', 'done', 'blocked'],
        help='Agent status for coordination updates'
    )
    parser.add_argument(
        '--qa-log',
        metavar='PATH',
        help='Path to QA log file for agent coordination'
    )
    parser.add_argument(
        '--session-id',
        metavar='ID',
        help='CLI session ID for coordination updates'
    )
    parser.add_argument(
        '--finding',
        metavar='TEXT',
        help='Blocking finding description'
    )
    parser.add_argument(
        '--note',
        metavar='TEXT',
        help='Resolution note for resolve-drift command'
    )
    parser.add_argument(
        '--actor',
        metavar='NAME',
        help='Actor performing the operation (default: task-runner)'
    )
    parser.add_argument(
        '--force-secrets',
        action='store_true',
        help='Bypass secret scanning (logs warning)'
    )
    parser.add_argument(
        '--previous-agent',
        choices=['implementer', 'reviewer', 'validator'],
        help='Previous agent role (for incremental diff calculation)'
    )
    parser.add_argument(
        '--expected-agent',
        choices=['implementer', 'reviewer', 'validator'],
        help='Expected agent whose snapshot to verify against'
    )
    parser.add_argument(
        '--diff-type',
        choices=['from_base', 'incremental'],
        default='from_base',
        help='Diff type to retrieve (default: from_base)'
    )
    parser.add_argument(
        '--from',
        dest='qa_log_from',
        metavar='PATH',
        help='Path to QA log file for record-qa command'
    )
    parser.add_argument(
        '--command-type',
        dest='command_type',
        choices=['lint', 'typecheck', 'test', 'coverage'],
        help='QA command type hint for enhanced parsing (auto-detected if not provided)'
    )

    # Ergonomic improvements (Session S14)
    parser.add_argument(
        '--env',
        action='append',
        dest='env_vars',
        metavar='KEY=VALUE',
        help='Set environment variable for command execution (can be used multiple times)'
    )
    parser.add_argument(
        '--allow-preexisting-dirty',
        action='store_true',
        help='Allow pre-existing dirty files in git working tree'
    )

    # Supporting arguments for Session S13 commands
    parser.add_argument(
        '--type',
        metavar='TYPE',
        help='Evidence type (file, qa_output, validation_log, etc.)'
    )
    parser.add_argument(
        '--path',
        metavar='PATH',
        help='File path (for attach-evidence)'
    )
    parser.add_argument(
        '--description',
        metavar='TEXT',
        help='Description for evidence attachment'
    )
    parser.add_argument(
        '--metadata',
        metavar='JSON',
        help='Metadata JSON for evidence attachment'
    )
    parser.add_argument(
        '--file',
        metavar='FILE',
        help='Standards file path (for attach-standard)'
    )
    parser.add_argument(
        '--section',
        metavar='SECTION',
        help='Section heading in standards file'
    )
    parser.add_argument(
        '--exception-type',
        metavar='TYPE',
        help='Exception type (malformed_yaml, missing_standards, etc.)'
    )
    parser.add_argument(
        '--message',
        metavar='TEXT',
        help='Exception or error message'
    )
    parser.add_argument(
        '--owner',
        metavar='OWNER',
        help='Exception owner (defaults to system)'
    )
    parser.add_argument(
        '--notes',
        metavar='TEXT',
        help='Notes for resolution'
    )
    parser.add_argument(
        '--trigger',
        metavar='TRIGGER',
        help='Cleanup trigger (task_completion, task_deletion, manual)'
    )
    parser.add_argument(
        '--reason',
        metavar='REASON',
        help='Quarantine reason (malformed_yaml, validation_failed, corrupted_context, manual)'
    )
    parser.add_argument(
        '--error-details',
        metavar='TEXT',
        help='Detailed error message for quarantine'
    )

    # Supporting arguments for Session S15 commands
    parser.add_argument(
        '--command-id',
        metavar='ID',
        help='Validation command ID'
    )
    parser.add_argument(
        '--command',
        metavar='CMD',
        help='Command to execute'
    )
    parser.add_argument(
        '--exit-code',
        type=int,
        metavar='CODE',
        help='Command exit code (for record-qa)'
    )
    parser.add_argument(
        '--log-path',
        metavar='PATH',
        help='Path to log file'
    )
    parser.add_argument(
        '--cwd',
        metavar='DIR',
        help='Working directory for command execution'
    )
    parser.add_argument(
        '--package',
        metavar='PKG',
        help='Package name for scoped validation'
    )
    parser.add_argument(
        '--expected-paths',
        nargs='+',
        metavar='PATTERN',
        help='Expected file path patterns (glob)'
    )
    parser.add_argument(
        '--blocker-id',
        metavar='TASK_ID',
        help='Task ID that blocks this validation'
    )
    parser.add_argument(
        '--timeout-ms',
        type=int,
        metavar='MS',
        help='Command timeout in milliseconds'
    )
    parser.add_argument(
        '--criticality',
        choices=['required', 'recommended', 'optional'],
        default='required',
        metavar='LEVEL',
        help='Validation criticality level (required, recommended, or optional)'
    )
    parser.add_argument(
        '--expected-exit-codes',
        nargs='+',
        type=int,
        metavar='CODE',
        help='Expected exit codes for success'
    )
    parser.add_argument(
        '--baseline-path',
        metavar='PATH',
        help='Path to baseline metrics file'
    )
    parser.add_argument(
        '--output-path',
        metavar='PATH',
        help='Output file path'
    )
    parser.add_argument(
        '--task-ids',
        nargs='+',
        metavar='TASK_ID',
        help='List of task IDs for dashboard'
    )
    parser.add_argument(
        '--current-path',
        metavar='PATH',
        help='Path to current metrics file'
    )

    args = parser.parse_args()

    # Parse environment variables
    try:
        env_vars = parse_env_vars(args.env_vars)
        args.env_dict = env_vars
    except ValueError as e:
        if args.format == 'json':
            error = format_error_with_recovery("invalid_env", str(e))
            output_json(error)
        else:
            print(f"Error: {e}", file=sys.stderr)
            error = format_error_with_recovery("invalid_env")
            print(f"Recovery: {error['recovery_action']}", file=sys.stderr)
        sys.exit(1)

    # Set JSON output mode for stream separation
    set_json_mode(args.format == 'json')

    # Find repository root
    repo_root = find_repo_root()

    # Determine which command was invoked
    command = None
    if args.list is not None:
        command = 'list'
        args.filter = args.list if args.list != 'all' else None
    elif args.validate:
        command = 'validate'
    elif args.explain:
        command = 'explain'
    elif args.lint:
        command = 'lint'
        args.task_path = args.lint
    elif args.bootstrap_evidence:
        command = 'bootstrap-evidence'
        args.task_id = args.bootstrap_evidence
    elif args.init_context:
        command = 'init-context'
        args.task_id = args.init_context
    elif args.get_context:
        command = 'get-context'
    elif args.update_agent:
        command = 'update-agent'
    elif args.mark_blocked:
        command = 'mark-blocked'
    elif args.purge_context:
        command = 'purge-context'
    elif args.rebuild_context:
        command = 'rebuild-context'
    elif args.snapshot_worktree:
        command = 'snapshot-worktree'
    elif args.verify_worktree:
        command = 'verify-worktree'
        args.task_id = args.verify_worktree
    elif args.get_diff:
        command = 'get-diff'
    elif args.record_qa:
        command = 'record-qa'
        args.task_id = args.record_qa
    elif args.compare_qa:
        command = 'compare-qa'
    elif args.resolve_drift:
        command = 'resolve-drift'
    elif args.attach_evidence:
        command = 'attach-evidence'
        args.task_id = args.attach_evidence
    elif args.list_evidence:
        command = 'list-evidence'
        args.task_id = args.list_evidence
    elif args.attach_standard:
        command = 'attach-standard'
        args.task_id = args.attach_standard
    elif args.add_exception:
        command = 'add-exception'
        args.task_id = args.add_exception
    elif args.list_exceptions:
        command = 'list-exceptions'
    elif args.resolve_exception:
        command = 'resolve-exception'
        args.task_id = args.resolve_exception
    elif args.cleanup_exceptions:
        command = 'cleanup-exceptions'
        args.task_id = args.cleanup_exceptions
    elif args.quarantine_task:
        command = 'quarantine-task'
        args.task_id = args.quarantine_task
    elif args.list_quarantined:
        command = 'list-quarantined'
    elif args.release_quarantine:
        command = 'release-quarantine'
        args.task_id = args.release_quarantine
    elif hasattr(args, 'run_validation') and args.run_validation:
        command = 'run-validation'
        args.task_id = args.run_validation
    elif hasattr(args, 'collect_metrics') and args.collect_metrics:
        command = 'collect-metrics'
        args.task_id = args.collect_metrics
    elif hasattr(args, 'generate_dashboard') and args.generate_dashboard:
        command = 'generate-dashboard'
    elif hasattr(args, 'compare_metrics') and args.compare_metrics:
        command = 'compare-metrics'

    # Check if we should use the new dispatcher (for Typer-migrated commands)
    # Wave 2 will remove legacy handlers once migration completes
    if command and not should_use_legacy(command):
        # Build context for dispatcher
        context = {
            'repo_root': repo_root,
        }
        return dispatch_command(command, args, context)

    # Legacy dispatch path (will be removed in Wave 2)
    # Initialize datastore
    datastore = TaskDatastore(repo_root)

    try:
        # Load tasks (from cache or parse)
        force_refresh = args.refresh_cache if hasattr(args, 'refresh_cache') else False
        tasks = datastore.load_tasks(force_refresh=force_refresh)

        # Initialize graph and picker
        graph = DependencyGraph(tasks)
        picker = TaskPicker(tasks, graph)

        # Dispatch to command handlers
        if args.list is not None:
            args.filter = args.list if args.list != 'all' else None
            return cmd_list(args, picker)

        elif args.validate:
            return cmd_validate(args, graph)

        elif args.explain:
            return cmd_explain(args, graph, datastore)

        elif args.lint:
            args.task_path = args.lint
            return cmd_lint(args, repo_root)

        elif args.bootstrap_evidence:
            args.task_id = args.bootstrap_evidence
            return cmd_bootstrap_evidence(args, repo_root)

        # Context cache commands
        elif args.init_context:
            args.task_id = args.init_context
            return cmd_init_context(args)

        elif args.get_context:
            return cmd_get_context(args, repo_root)

        elif args.update_agent:
            return cmd_update_agent(args, repo_root)

        elif args.mark_blocked:
            return cmd_mark_blocked(args, repo_root)

        elif args.purge_context:
            return cmd_purge_context(args, repo_root)

        elif args.rebuild_context:
            return cmd_rebuild_context(args, repo_root)

        # Delta tracking commands
        elif args.snapshot_worktree:
            return cmd_snapshot_worktree(args, repo_root)

        elif args.verify_worktree:
            args.task_id = args.verify_worktree
            return cmd_verify_worktree(args)

        elif args.get_diff:
            return cmd_get_diff(args, repo_root)

        elif args.record_qa:
            args.task_id = args.record_qa
            return cmd_record_qa(args)

        elif args.compare_qa:
            return cmd_compare_qa(args, repo_root)

        elif args.resolve_drift:
            return cmd_resolve_drift(args, repo_root)

        # Evidence and standards commands
        elif args.attach_evidence:
            args.task_id = args.attach_evidence
            return cmd_attach_evidence(args)

        elif args.list_evidence:
            args.task_id = args.list_evidence
            return cmd_list_evidence(args)

        elif args.attach_standard:
            args.task_id = args.attach_standard
            return cmd_attach_standard(args)

        # Exception ledger commands
        elif args.add_exception:
            args.task_id = args.add_exception
            return cmd_add_exception(args)

        elif args.list_exceptions:
            return cmd_list_exceptions(args)

        elif args.resolve_exception:
            args.task_id = args.resolve_exception
            return cmd_resolve_exception(args)

        elif args.cleanup_exceptions:
            args.task_id = args.cleanup_exceptions
            return cmd_cleanup_exceptions(args)

        # Quarantine commands
        elif args.quarantine_task:
            args.task_id = args.quarantine_task
            return cmd_quarantine_task(args)

        elif args.list_quarantined:
            return cmd_list_quarantined(args)

        elif args.release_quarantine:
            args.task_id = args.release_quarantine
            return cmd_release_quarantine(args)

        # Enhanced commands (Session S15)
        elif hasattr(args, 'run_validation') and args.run_validation:
            args.task_id = args.run_validation
            return cmd_run_validation(args)

        elif hasattr(args, 'collect_metrics') and args.collect_metrics:
            args.task_id = args.collect_metrics
            return cmd_collect_metrics(args)

        elif hasattr(args, 'generate_dashboard') and args.generate_dashboard:
            return cmd_generate_dashboard(args)

        elif hasattr(args, 'compare_metrics') and args.compare_metrics:
            return cmd_compare_metrics(args)

    except KeyboardInterrupt:
        print("\nInterrupted", file=sys.stderr)
        return 130

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
