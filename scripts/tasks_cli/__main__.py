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
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from .datastore import TaskDatastore
from .exceptions import WorkflowHaltError
from .graph import DependencyGraph
from .models import Task
from .operations import TaskOperationError, TaskOperations
from .picker import TaskPicker, check_halt_conditions


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

    Args:
        task: Task instance to serialize

    Returns:
        Dictionary with sorted keys, suitable for JSON output
    """
    return {
        'area': task.area,
        'blocked_by': sorted(task.blocked_by),  # Deterministic ordering
        'depends_on': sorted(task.depends_on),
        'hash': task.hash,
        'id': task.id,
        'mtime': task.mtime,
        'order': task.order,
        'path': str(task.path),
        'priority': task.priority,
        'status': task.status,
        'title': task.title,
        'unblocker': task.unblocker,
    }


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


def cmd_pick(args, picker: TaskPicker, datastore: TaskDatastore) -> int:
    """
    Pick next task to work on.

    Args:
        args: Parsed command-line arguments
        picker: TaskPicker instance
        datastore: TaskDatastore instance

    Returns:
        Exit code (0 for success, 1 if no ready tasks)
    """
    # Get completed task IDs for readiness check
    tasks = datastore.load_tasks()
    completed_ids = {task.id for task in tasks if task.is_completed()}

    # Determine status filter
    status_filter = args.filter if args.filter and args.filter != "auto" else None

    # Pick next task (returns tuple of (task, reason) or None)
    result = picker.pick_next_task(completed_ids, status_filter=status_filter)

    if result:
        task, reason = result
        # Get snapshot_id for audit trail
        snapshot_id = datastore.get_snapshot_id()

        # Output based on format
        if args.format == 'json':
            output_json({
                'task': task_to_dict(task),
                'reason': reason,
                'snapshot_id': snapshot_id,
                'status': 'success'
            })
        else:
            # Just the file path (backward compatible)
            print(task.path)
        return 0
    else:
        if args.format == 'json':
            output_json({
                'task': None,
                'status': 'no_ready_tasks',
                'message': 'No ready tasks found'
            })
        else:
            print("No ready tasks found", file=sys.stderr)
        return 1


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


def cmd_check_halt(args, tasks: List[Task]) -> int:
    """
    Check for workflow halt conditions (blocked unblockers).

    Per docs/proposals/task-workflow-python-refactor.md Section 3.4,
    the workflow must halt when unblocker tasks are blocked.

    Args:
        args: Parsed command-line arguments (contains format)
        tasks: List of all tasks

    Returns:
        Exit code (0 if no halt conditions, 2 if halt detected)
    """
    try:
        # Check for halt conditions
        check_halt_conditions(tasks)

        # No halt conditions detected
        if args.format == 'json':
            output_json({
                'halt': False,
                'type': None,
                'tasks': [],
                'message': 'No halt conditions detected'
            })
        else:
            print("No halt conditions detected - workflow can proceed")

        return 0

    except WorkflowHaltError as e:
        # Halt condition detected
        if args.format == 'json':
            output_json({
                'halt': True,
                'type': e.halt_type,
                'tasks': e.task_ids,
                'message': str(e)
            })
        else:
            print(str(e), file=sys.stderr)

        # Return exit code 2 (distinct from normal errors)
        return 2


def cmd_refresh_cache(args, datastore: TaskDatastore) -> int:
    """
    Force cache rebuild.

    Args:
        args: Parsed command-line arguments
        datastore: TaskDatastore instance

    Returns:
        Exit code (0 for success)
    """
    tasks = datastore.load_tasks(force_refresh=True)
    print(f"Cache refreshed: {len(tasks)} tasks loaded")

    # Show cache info
    info = datastore.get_cache_info()
    if info.get('exists'):
        print(f"Cache generated at: {info.get('generated_at')}")
        print(f"Active tasks: {info.get('task_count', 0) - info.get('archive_count', 0)}")
        print(f"Archived tasks: {info.get('archive_count', 0)}")

    return 0


def cmd_graph(args, graph: DependencyGraph) -> int:
    """
    Export dependency graph in DOT format.

    Args:
        args: Parsed command-line arguments
        graph: DependencyGraph instance

    Returns:
        Exit code (0 for success)
    """
    # Generate DOT format
    dot_output = graph.export_dot()

    print(dot_output)
    print("\n# Render with: dot -Tpng -o tasks.png", file=sys.stderr)
    print("# Or view online: https://dreampuf.github.io/GraphvizOnline/", file=sys.stderr)

    return 0


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
            print(f"  Unblocker: YES")
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


def cmd_claim(args, datastore: TaskDatastore, repo_root: Path) -> int:
    """
    Claim a task (transition to in_progress).

    Args:
        args: Parsed command-line arguments (contains task_path)
        datastore: TaskDatastore instance
        repo_root: Repository root path

    Returns:
        Exit code (0 for success, 1 for errors)
    """
    # Find task by path
    tasks = datastore.load_tasks()
    task_path = Path(args.task_path).resolve()

    task = None
    for t in tasks:
        if Path(t.path).resolve() == task_path:
            task = t
            break

    if not task:
        print(f"Error: Task not found: {args.task_path}", file=sys.stderr)
        return 1

    # Perform claim operation
    ops = TaskOperations(repo_root)
    try:
        result_path = ops.claim_task(task)
        print(f"✓ Claimed task {task.id}")
        print(f"  Status: {task.status} → in_progress")
        print(f"  File: {result_path}")

        # Invalidate cache
        datastore.load_tasks(force_refresh=True)

        return 0

    except TaskOperationError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


def cmd_complete(args, datastore: TaskDatastore, repo_root: Path) -> int:
    """
    Complete a task and archive it.

    Args:
        args: Parsed command-line arguments (contains task_path)
        datastore: TaskDatastore instance
        repo_root: Repository root path

    Returns:
        Exit code (0 for success, 1 for errors)
    """
    # Find task by path
    tasks = datastore.load_tasks()
    task_path = Path(args.task_path).resolve()

    task = None
    for t in tasks:
        if Path(t.path).resolve() == task_path:
            task = t
            break

    if not task:
        print(f"Error: Task not found: {args.task_path}", file=sys.stderr)
        return 1

    # Perform complete operation (with archiving per user preference)
    ops = TaskOperations(repo_root)
    try:
        result_path = ops.complete_task(task, archive=True)

        print(f"✓ Completed task {task.id}")
        print(f"  Status: {task.status} → completed")
        print(f"  Archived to: {result_path}")

        # Invalidate cache
        datastore.load_tasks(force_refresh=True)

        return 0

    except TaskOperationError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Task workflow CLI for PhotoEditor project",
        formatter_class=argparse.RawDescriptionHelpFormatter,
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
        '--explain',
        metavar='TASK_ID',
        help='Explain dependency chain for a task (shows blockers, artifacts, readiness)'
    )
    group.add_argument(
        '--check-halt',
        action='store_true',
        help='Check for workflow halt conditions (blocked unblockers)'
    )

    # Output format option (applies to list, pick, validate, explain, check-halt)
    parser.add_argument(
        '--format',
        choices=['text', 'json'],
        default='text',
        help='Output format (default: text)'
    )

    args = parser.parse_args()

    # Find repository root
    repo_root = find_repo_root()

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

        elif args.pick is not None:
            args.filter = args.pick
            return cmd_pick(args, picker, datastore)

        elif args.validate:
            return cmd_validate(args, graph)

        elif args.refresh_cache:
            return cmd_refresh_cache(args, datastore)

        elif args.graph:
            return cmd_graph(args, graph)

        elif args.claim:
            args.task_path = args.claim
            return cmd_claim(args, datastore, repo_root)

        elif args.complete:
            args.task_path = args.complete
            return cmd_complete(args, datastore, repo_root)

        elif args.explain:
            return cmd_explain(args, graph, datastore)

        elif args.check_halt:
            return cmd_check_halt(args, tasks)

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
