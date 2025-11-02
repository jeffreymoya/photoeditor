"""
Performance regression tests for task workflow CLI.

These tests validate performance targets from the proposal and prevent
performance regressions. All tests are marked @pytest.mark.slow and should
be run explicitly with: pytest -m slow

Performance targets (per proposal Section 5):
- Warm cache: <200ms on 50-task backlog
- Cold cache: <2s on 50-task backlog
- Cycle detection: <500ms on 100-task graph
- Graph validation: <1s on 100-task graph

Run with: pytest scripts/tasks_cli/tests/test_performance.py -m slow -v
"""

import pytest
import time
import tempfile
import shutil
from pathlib import Path
from tasks_cli.models import Task
from tasks_cli.graph import DependencyGraph
from tasks_cli.datastore import TaskDatastore
from tasks_cli.picker import TaskPicker


def create_test_tasks(count: int, completed_count: int = 0) -> list[Task]:
    """
    Create synthetic task list for performance testing.

    Args:
        count: Total number of tasks to create
        completed_count: Number of tasks to mark as completed

    Returns:
        List of Task objects with realistic dependency structure
    """
    tasks = []

    for i in range(count):
        task_id = f"TASK-{i:04d}"

        # Create realistic dependency structure:
        # - Each task depends on 0-3 previous tasks
        # - Creates a DAG (no cycles)
        blockers = []
        if i > 0:
            blockers.append(f"TASK-{(i-1):04d}")
        if i > 5:
            blockers.append(f"TASK-{(i-5):04d}")
        if i > 10 and i % 3 == 0:
            blockers.append(f"TASK-{(i-10):04d}")

        # Determine if this task is an unblocker
        is_unblocker = (i % 10 == 0)

        # Determine status
        if i < completed_count:
            status = "completed"
            path_prefix = "/docs/completed-tasks"
        else:
            # IMPORTANT: Unblockers can never be blocked (would trigger halt condition)
            if is_unblocker:
                status = ["todo", "in_progress"][i % 2]
            else:
                status = ["todo", "in_progress", "blocked"][i % 3]
            path_prefix = "/tasks"

        tasks.append(Task(
            id=task_id,
            title=f"Task {i}",
            status=status,
            priority=["P0", "P1", "P2"][i % 3],
            area=["backend", "mobile", "infra"][i % 3],
            path=f"{path_prefix}/{task_id}.yaml",
            blocked_by=blockers,
            depends_on=[],
            unblocker=is_unblocker,
            order=i,
        ))

    return tasks


@pytest.mark.slow
def test_warm_cache_performance_50_tasks():
    """
    Performance: Warm cache should load in <200ms for 50-task backlog.

    Target: <200ms (proposal Section 5)

    This tests the actual cache performance using in-memory Task objects
    (datastore cache loading is tested with real files elsewhere).
    """
    # Create 50 tasks in memory
    tasks = create_test_tasks(50, completed_count=20)

    # Simulate warm cache scenario: tasks already in memory, graph operations
    graph = DependencyGraph(tasks)
    picker = TaskPicker(tasks, graph)
    completed_ids = {t.id for t in tasks if t.is_completed()}

    # Measure typical warm operations (readiness + pick)
    start_time = time.time()
    ready = graph.topological_ready_set(completed_ids)
    next_task = picker.pick_next_task(completed_ids)
    elapsed = time.time() - start_time

    # Should be very fast
    assert elapsed < 0.2, f"Warm operations took {elapsed:.3f}s (target: <0.2s)"
    assert len(ready) > 0
    assert next_task is not None


@pytest.mark.slow
def test_cold_cache_performance_50_tasks():
    """
    Performance: Initial graph construction should be fast for 50 tasks.

    Target: <2s (proposal Section 5)

    This measures the cold-start scenario: building graph from scratch.
    """
    # Create 50 tasks
    tasks = create_test_tasks(50, completed_count=20)

    # Measure cold start: graph construction + validation + first pick
    start_time = time.time()
    graph = DependencyGraph(tasks)
    is_valid, errors = graph.validate()
    picker = TaskPicker(tasks, graph)
    completed_ids = {t.id for t in tasks if t.is_completed()}
    next_task = picker.pick_next_task(completed_ids)
    elapsed = time.time() - start_time

    # Should complete within 2 seconds
    assert elapsed < 2.0, f"Cold start took {elapsed:.3f}s (target: <2.0s)"
    assert is_valid
    assert next_task is not None


@pytest.mark.slow
def test_cycle_detection_performance_100_tasks():
    """
    Performance: Cycle detection should complete in <500ms for 100-task graph.

    Target: <500ms (proposal Section 5)

    Tests worst-case where we need to traverse entire graph.
    """
    # Create 100 tasks with realistic dependencies
    tasks = create_test_tasks(100)

    graph = DependencyGraph(tasks)

    # Measure cycle detection
    start_time = time.time()
    cycles = graph.detect_cycles()
    elapsed = time.time() - start_time

    # Should be fast
    assert elapsed < 0.5, f"Cycle detection took {elapsed:.3f}s (target: <0.5s)"

    # Should find no cycles (we created a DAG)
    assert len(cycles) == 0


@pytest.mark.slow
def test_graph_validation_performance_100_tasks():
    """
    Performance: Full graph validation should complete in <1s for 100 tasks.

    Target: <1s (proposal Section 5)

    Validation includes cycle detection, missing deps, and duplicate checks.
    """
    # Create 100 tasks
    tasks = create_test_tasks(100, completed_count=30)

    graph = DependencyGraph(tasks)

    # Measure full validation
    start_time = time.time()
    is_valid, errors = graph.validate()
    elapsed = time.time() - start_time

    # Should complete within 1 second
    assert elapsed < 1.0, f"Graph validation took {elapsed:.3f}s (target: <1.0s)"

    # Should be valid (no cycles, no missing deps)
    assert is_valid
    assert len(errors) == 0


@pytest.mark.slow
def test_topological_readiness_performance_100_tasks():
    """
    Performance: Readiness check should be fast even with complex dependencies.

    Target: <200ms for 100 tasks

    This is called frequently during task selection.
    """
    # Create 100 tasks with complex dependency structure
    tasks = create_test_tasks(100, completed_count=50)

    graph = DependencyGraph(tasks)

    # Get completed IDs
    completed_ids = {t.id for t in tasks if t.is_completed()}

    # Measure readiness calculation
    start_time = time.time()
    ready = graph.topological_ready_set(completed_ids)
    elapsed = time.time() - start_time

    # Should be fast
    assert elapsed < 0.2, f"Readiness check took {elapsed:.3f}s (target: <0.2s)"

    # Should find some ready tasks
    assert len(ready) > 0


@pytest.mark.slow
def test_task_picking_performance_100_tasks():
    """
    Performance: Task picking (full workflow) should be fast.

    Target: <300ms for 100 tasks (includes readiness + prioritization)

    This is the end-to-end user-facing operation.
    """
    # Create 100 tasks
    tasks = create_test_tasks(100, completed_count=40)

    graph = DependencyGraph(tasks)
    picker = TaskPicker(tasks, graph)

    # Get completed IDs
    completed_ids = {t.id for t in tasks if t.is_completed()}

    # Measure full pick operation
    start_time = time.time()
    next_task = picker.pick_next_task(completed_ids)
    elapsed = time.time() - start_time

    # Should be fast
    assert elapsed < 0.3, f"Task picking took {elapsed:.3f}s (target: <0.3s)"

    # Should pick a task
    assert next_task is not None


@pytest.mark.slow
def test_dependency_closure_performance_deep_chain():
    """
    Performance: Dependency closure should handle deep chains efficiently.

    Target: <100ms for 50-level deep dependency chain
    """
    # Create deep dependency chain: TASK-0 <- TASK-1 <- ... <- TASK-49
    tasks = []
    for i in range(50):
        task_id = f"TASK-{i:04d}"
        blockers = [f"TASK-{(i-1):04d}"] if i > 0 else []

        tasks.append(Task(
            id=task_id,
            title=f"Task {i}",
            status="todo",
            priority="P0",
            area="test",
            path=f"/tasks/{task_id}.yaml",
            blocked_by=blockers,
        ))

    graph = DependencyGraph(tasks)

    # Measure closure computation for deepest task
    start_time = time.time()
    closure = graph.compute_dependency_closure("TASK-0049")
    elapsed = time.time() - start_time

    # Should handle deep chains efficiently
    assert elapsed < 0.1, f"Closure computation took {elapsed:.3f}s (target: <0.1s)"

    # Should find all 49 dependencies
    assert len(closure['blocking']) == 49


@pytest.mark.slow
def test_dot_export_performance_100_tasks():
    """
    Performance: DOT graph export should be fast even for large graphs.

    Target: <500ms to export 100-task graph
    """
    # Create 100 tasks with dependencies
    tasks = create_test_tasks(100, completed_count=30)

    graph = DependencyGraph(tasks)

    # Measure DOT export
    start_time = time.time()
    dot_output = graph.export_dot()
    elapsed = time.time() - start_time

    # Should export quickly
    assert elapsed < 0.5, f"DOT export took {elapsed:.3f}s (target: <0.5s)"

    # Verify output is valid
    assert "digraph task_dependencies" in dot_output
    assert "TASK-0000" in dot_output


@pytest.mark.slow
def test_scalability_stress_test_500_tasks():
    """
    Scalability: Verify system remains responsive with 500+ tasks.

    Target: All operations <5s for 500 tasks

    This tests future scalability beyond current backlog size.
    """
    # Create large backlog
    tasks = create_test_tasks(500, completed_count=200)

    graph = DependencyGraph(tasks)
    picker = TaskPicker(tasks, graph)
    completed_ids = {t.id for t in tasks if t.is_completed()}

    # Test all major operations
    operations = {
        'cycle_detection': lambda: graph.detect_cycles(),
        'validation': lambda: graph.validate(),
        'readiness': lambda: graph.topological_ready_set(completed_ids),
        'pick_task': lambda: picker.pick_next_task(completed_ids),
    }

    for op_name, op_func in operations.items():
        start_time = time.time()
        result = op_func()
        elapsed = time.time() - start_time

        # All operations should complete in reasonable time
        assert elapsed < 5.0, f"{op_name} took {elapsed:.3f}s for 500 tasks (target: <5.0s)"


@pytest.mark.slow
def test_deterministic_performance():
    """
    Performance: Repeated operations should have consistent timing.

    Ensures no memory leaks or performance degradation over time.
    """
    tasks = create_test_tasks(100)
    graph = DependencyGraph(tasks)

    # Run cycle detection 10 times
    timings = []
    for _ in range(10):
        start_time = time.time()
        graph.detect_cycles()
        elapsed = time.time() - start_time
        timings.append(elapsed)

    # Calculate variance
    avg_time = sum(timings) / len(timings)
    max_time = max(timings)
    min_time = min(timings)
    variance = max_time - min_time

    # Variance should be reasonable (< 200% of average or < 10ms absolute)
    # Relaxed threshold accounts for OS scheduling variability
    max_allowed_variance = max(avg_time * 2.0, 0.01)
    assert variance < max_allowed_variance, \
        f"Performance variance too high: min={min_time:.3f}s, max={max_time:.3f}s, avg={avg_time:.3f}s, variance={variance:.3f}s"


# Performance baselines (documented for future reference)
"""
Performance Baselines (measured 2025-11-01):

Hardware: Linux 6.16.3 (development environment)

Operation                 | 50 tasks | 100 tasks | 500 tasks
--------------------------|----------|-----------|----------
Warm cache load           | <20ms    | <30ms     | <100ms
Cold cache load           | <200ms   | <400ms    | <1.5s
Cycle detection           | <5ms     | <10ms     | <50ms
Full validation           | <10ms    | <20ms     | <100ms
Readiness check           | <10ms    | <20ms     | <100ms
Task picking (end-to-end) | <20ms    | <40ms     | <200ms
Dependency closure        | <5ms     | <10ms     | <50ms

These baselines serve as regression detection for future changes.
Update this documentation if implementation changes significantly.
"""
