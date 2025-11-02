"""
Regression tests for archive handling edge cases.

These tests prevent regressions in how completed/archived tasks are handled,
particularly around dependency resolution and readiness checks.

Key scenarios tested:
- Archive tasks satisfy blocked_by dependencies
- Missing vs archived dependency distinction
- Archive path resolution edge cases
- Mixed active/archived dependency chains
- Performance with many archived dependencies
"""

import pytest
import time
from tasks_cli.models import Task
from tasks_cli.graph import DependencyGraph


def test_archived_task_satisfies_blocker():
    """
    Regression: Archived completed tasks should satisfy blocked_by dependencies.

    Prevents: Parser ignoring archived tasks causing false "missing dependency" errors.
    """
    tasks = [
        Task(
            id="TASK-OLD",
            title="Archived completed task",
            status="completed",
            priority="P0",
            area="test",
            path="/docs/completed-tasks/TASK-OLD.yaml",  # Archive path
            blocked_by=[],
        ),
        Task(
            id="TASK-NEW",
            title="New task depending on archived task",
            status="todo",
            priority="P0",
            area="test",
            path="/tasks/TASK-NEW.yaml",
            blocked_by=["TASK-OLD"],
        ),
    ]

    graph = DependencyGraph(tasks)

    # Should NOT report TASK-OLD as missing
    missing = graph.missing_dependencies()
    assert "TASK-NEW" not in missing

    # TASK-NEW should be ready when TASK-OLD is completed
    completed_ids = {"TASK-OLD"}
    ready = graph.topological_ready_set(completed_ids)
    ready_ids = {t.id for t in ready}
    assert "TASK-NEW" in ready_ids


def test_truly_missing_vs_archived():
    """
    Regression: Distinguish between truly missing deps and archived deps.

    Prevents: Archived tasks incorrectly reported as missing.
    """
    tasks = [
        Task(
            id="TASK-ARCHIVED",
            title="Archived completed task",
            status="completed",
            priority="P0",
            area="test",
            path="/docs/completed-tasks/TASK-ARCHIVED.yaml",
            blocked_by=[],
        ),
        Task(
            id="TASK-ACTIVE",
            title="Active task with mixed dependencies",
            status="todo",
            priority="P0",
            area="test",
            path="/tasks/TASK-ACTIVE.yaml",
            blocked_by=["TASK-ARCHIVED", "TASK-MISSING"],
        ),
    ]

    graph = DependencyGraph(tasks)
    missing = graph.missing_dependencies()

    # TASK-ARCHIVED should NOT be reported as missing
    # TASK-MISSING should be reported as missing
    assert "TASK-ACTIVE" in missing
    assert "TASK-MISSING" in missing["TASK-ACTIVE"]
    assert "TASK-ARCHIVED" not in missing["TASK-ACTIVE"]


def test_mixed_active_and_archived_chain():
    """
    Regression: Chains with both active and archived tasks should resolve correctly.

    Prevents: Archive tasks breaking transitive dependency resolution.
    """
    tasks = [
        Task(
            id="TASK-ARCH-1",
            title="Archived root",
            status="completed",
            priority="P0",
            area="test",
            path="/docs/completed-tasks/TASK-ARCH-1.yaml",
            blocked_by=[],
        ),
        Task(
            id="TASK-ARCH-2",
            title="Archived middle",
            status="completed",
            priority="P0",
            area="test",
            path="/docs/completed-tasks/TASK-ARCH-2.yaml",
            blocked_by=["TASK-ARCH-1"],
        ),
        Task(
            id="TASK-ACTIVE",
            title="Active task",
            status="todo",
            priority="P0",
            area="test",
            path="/tasks/TASK-ACTIVE.yaml",
            blocked_by=["TASK-ARCH-2"],
        ),
    ]

    graph = DependencyGraph(tasks)

    # No missing dependencies
    missing = graph.missing_dependencies()
    assert len(missing) == 0

    # TASK-ACTIVE should be ready when archived tasks are completed
    completed_ids = {"TASK-ARCH-1", "TASK-ARCH-2"}
    ready = graph.topological_ready_set(completed_ids)
    ready_ids = {t.id for t in ready}
    assert "TASK-ACTIVE" in ready_ids


def test_multiple_archived_blockers():
    """
    Regression: Task blocked by multiple archived tasks should be ready.

    Prevents: Multiple archived blockers causing incorrect not-ready status.
    """
    archived_tasks = [
        Task(
            id=f"TASK-ARCH-{i}",
            title=f"Archived task {i}",
            status="completed",
            priority="P0",
            area="test",
            path=f"/docs/completed-tasks/TASK-ARCH-{i}.yaml",
            blocked_by=[],
        )
        for i in range(5)
    ]

    active_task = Task(
        id="TASK-ACTIVE",
        title="Task blocked by 5 archived tasks",
        status="todo",
        priority="P0",
        area="test",
        path="/tasks/TASK-ACTIVE.yaml",
        blocked_by=[f"TASK-ARCH-{i}" for i in range(5)],
    )

    tasks = archived_tasks + [active_task]
    graph = DependencyGraph(tasks)

    # All archived tasks should be recognized
    missing = graph.missing_dependencies()
    assert "TASK-ACTIVE" not in missing

    # TASK-ACTIVE should be ready
    completed_ids = {f"TASK-ARCH-{i}" for i in range(5)}
    ready = graph.topological_ready_set(completed_ids)
    ready_ids = {t.id for t in ready}
    assert "TASK-ACTIVE" in ready_ids


def test_archived_depends_on_informational():
    """
    Regression: Archived tasks in depends_on should be tracked but not blocking.

    Prevents: depends_on with archived tasks incorrectly blocking execution.
    """
    tasks = [
        Task(
            id="TASK-ARCHIVED",
            title="Archived artifact",
            status="completed",
            priority="P0",
            area="test",
            path="/docs/completed-tasks/TASK-ARCHIVED.yaml",
            blocked_by=[],
        ),
        Task(
            id="TASK-ACTIVE",
            title="Task with archived artifact dependency",
            status="todo",
            priority="P0",
            area="test",
            path="/tasks/TASK-ACTIVE.yaml",
            blocked_by=[],
            depends_on=["TASK-ARCHIVED"],  # Informational only
        ),
    ]

    graph = DependencyGraph(tasks)

    # TASK-ARCHIVED should not be reported as missing (even in depends_on)
    missing = graph.missing_dependencies()
    assert "TASK-ACTIVE" not in missing

    # TASK-ACTIVE should be ready immediately (depends_on doesn't block)
    completed_ids = set()  # Empty - no blockers need to be completed
    ready = graph.topological_ready_set(completed_ids)
    ready_ids = {t.id for t in ready}
    assert "TASK-ACTIVE" in ready_ids


def test_archive_path_variations():
    """
    Regression: Different archive path formats should all be recognized.

    Prevents: Only exact "/docs/completed-tasks/" path working.
    """
    tasks = [
        # Various archive path formats
        Task(
            id="TASK-A1",
            title="Archived with absolute path",
            status="completed",
            priority="P0",
            area="test",
            path="/docs/completed-tasks/TASK-A1.yaml",
            blocked_by=[],
        ),
        Task(
            id="TASK-A2",
            title="Archived with relative path",
            status="completed",
            priority="P0",
            area="test",
            path="docs/completed-tasks/TASK-A2.yaml",
            blocked_by=[],
        ),
        Task(
            id="TASK-ACTIVE",
            title="Active task",
            status="todo",
            priority="P0",
            area="test",
            path="/tasks/TASK-ACTIVE.yaml",
            blocked_by=["TASK-A1", "TASK-A2"],
        ),
    ]

    graph = DependencyGraph(tasks)

    # Both archive paths should be recognized
    missing = graph.missing_dependencies()
    assert "TASK-ACTIVE" not in missing

    # Task should be ready when all archived blockers completed
    completed_ids = {"TASK-A1", "TASK-A2"}
    ready = graph.topological_ready_set(completed_ids)
    ready_ids = {t.id for t in ready}
    assert "TASK-ACTIVE" in ready_ids


def test_partial_archive_chain():
    """
    Regression: Chains with some archived, some active tasks should work correctly.

    Prevents: Mixed status chains causing readiness errors.
    """
    tasks = [
        Task(
            id="TASK-ARCH",
            title="Archived root",
            status="completed",
            priority="P0",
            area="test",
            path="/docs/completed-tasks/TASK-ARCH.yaml",
            blocked_by=[],
        ),
        Task(
            id="TASK-TODO",
            title="TODO middle task",
            status="todo",
            priority="P0",
            area="test",
            path="/tasks/TASK-TODO.yaml",
            blocked_by=["TASK-ARCH"],
        ),
        Task(
            id="TASK-FINAL",
            title="Final task",
            status="todo",
            priority="P0",
            area="test",
            path="/tasks/TASK-FINAL.yaml",
            blocked_by=["TASK-TODO"],
        ),
    ]

    graph = DependencyGraph(tasks)

    # With only archived task completed, middle should be ready
    completed_ids = {"TASK-ARCH"}
    ready = graph.topological_ready_set(completed_ids)
    ready_ids = {t.id for t in ready}
    assert "TASK-TODO" in ready_ids
    assert "TASK-FINAL" not in ready_ids  # Still blocked

    # With both completed, final should be ready
    completed_ids = {"TASK-ARCH", "TASK-TODO"}
    ready = graph.topological_ready_set(completed_ids)
    ready_ids = {t.id for t in ready}
    assert "TASK-FINAL" in ready_ids


def test_validate_accepts_archived_dependencies():
    """
    Regression: Validation should pass when only archived tasks are dependencies.

    Prevents: Validation incorrectly failing for archived blockers.
    """
    tasks = [
        Task(
            id="TASK-ARCHIVED",
            title="Archived task",
            status="completed",
            priority="P0",
            area="test",
            path="/docs/completed-tasks/TASK-ARCHIVED.yaml",
            blocked_by=[],
        ),
        Task(
            id="TASK-ACTIVE",
            title="Active task",
            status="todo",
            priority="P0",
            area="test",
            path="/tasks/TASK-ACTIVE.yaml",
            blocked_by=["TASK-ARCHIVED"],
        ),
    ]

    graph = DependencyGraph(tasks)
    is_valid, errors = graph.validate()

    # Should be valid (archived task satisfies dependency)
    assert is_valid
    assert len(errors) == 0


@pytest.mark.slow
def test_readiness_performance_with_50_archived_deps():
    """
    Regression: Readiness checks should be fast with many archived dependencies.

    Prevents: Performance degradation when backlog has many completed tasks.

    Target: Readiness check <100ms for 50 archived + 50 active tasks.
    """
    # Create 50 archived tasks
    archived_tasks = [
        Task(
            id=f"TASK-ARCH-{i:04d}",
            title=f"Archived task {i}",
            status="completed",
            priority="P0",
            area="test",
            path=f"/docs/completed-tasks/TASK-ARCH-{i:04d}.yaml",
            blocked_by=[],
        )
        for i in range(50)
    ]

    # Create 50 active tasks, each depending on 3-5 archived tasks
    active_tasks = []
    for i in range(50):
        # Depend on archived tasks (i, i+1, i+2) mod 50
        blockers = [
            f"TASK-ARCH-{(i + j) % 50:04d}"
            for j in range(3)
        ]
        active_tasks.append(Task(
            id=f"TASK-ACTIVE-{i:04d}",
            title=f"Active task {i}",
            status="todo",
            priority="P0",
            area="test",
            path=f"/tasks/TASK-ACTIVE-{i:04d}.yaml",
            blocked_by=blockers,
        ))

    all_tasks = archived_tasks + active_tasks
    graph = DependencyGraph(all_tasks)

    # Measure readiness check performance
    completed_ids = {f"TASK-ARCH-{i:04d}" for i in range(50)}

    start_time = time.time()
    ready = graph.topological_ready_set(completed_ids)
    elapsed = time.time() - start_time

    # Should complete quickly
    assert elapsed < 0.1, f"Readiness check took {elapsed:.3f}s (target: <0.1s)"

    # All active tasks should be ready (all blockers completed)
    ready_ids = {t.id for t in ready}
    for i in range(50):
        assert f"TASK-ACTIVE-{i:04d}" in ready_ids


@pytest.mark.slow
def test_missing_detection_performance_with_archives():
    """
    Regression: Missing dependency detection should be fast with many archives.

    Prevents: Archive scanning causing O(n²) performance issues.
    """
    # Create large set of archived and active tasks
    archived_tasks = [
        Task(
            id=f"TASK-ARCH-{i:04d}",
            title=f"Archived {i}",
            status="completed",
            priority="P0",
            area="test",
            path=f"/docs/completed-tasks/TASK-ARCH-{i:04d}.yaml",
            blocked_by=[],
        )
        for i in range(100)
    ]

    active_tasks = [
        Task(
            id=f"TASK-ACTIVE-{i:04d}",
            title=f"Active {i}",
            status="todo",
            priority="P0",
            area="test",
            path=f"/tasks/TASK-ACTIVE-{i:04d}.yaml",
            # Reference both archived and truly missing tasks
            blocked_by=[f"TASK-ARCH-{i % 100:04d}", f"TASK-MISSING-{i}"],
        )
        for i in range(50)
    ]

    all_tasks = archived_tasks + active_tasks
    graph = DependencyGraph(all_tasks)

    # Measure missing dependency detection
    start_time = time.time()
    missing = graph.missing_dependencies()
    elapsed = time.time() - start_time

    # Should complete quickly
    assert elapsed < 0.1, f"Missing detection took {elapsed:.3f}s (target: <0.1s)"

    # Should correctly identify only truly missing tasks
    for i in range(50):
        task_id = f"TASK-ACTIVE-{i:04d}"
        assert task_id in missing
        # Should report TASK-MISSING-X but NOT TASK-ARCH-X
        assert f"TASK-MISSING-{i}" in missing[task_id]
        assert f"TASK-ARCH-{i % 100:04d}" not in missing[task_id]
