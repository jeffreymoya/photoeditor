"""
Regression tests for cycle detection edge cases.

These tests prevent regressions in cycle detection by covering edge cases
that were problematic in the historical Bash task picker implementation.

Key scenarios tested:
- Self-referential cycles (task blocks itself)
- Multi-node cycles (4+ tasks in loop)
- Multiple independent cycles in same graph
- Cycles involving unblocker tasks
- Performance on large graphs (100+ tasks)
"""

import pytest
import time
from tasks_cli.models import Task
from tasks_cli.graph import DependencyGraph


def test_self_referential_cycle():
    """
    Regression: Self-referential cycle should be detected.

    Prevents: Task referencing itself in blocked_by not being caught.
    """
    tasks = [
        Task(
            id="TASK-A",
            title="Self-blocking task",
            status="blocked",
            priority="P0",
            area="test",
            path="/test/A.yaml",
            blocked_by=["TASK-A"],  # Task blocks itself
        ),
    ]

    graph = DependencyGraph(tasks)
    cycles = graph.detect_cycles()

    # Should detect self-referential cycle
    assert len(cycles) > 0
    assert "TASK-A" in cycles[0]


def test_multi_node_cycle_4_tasks():
    """
    Regression: 4-task cycle should be detected.

    Prevents: Cycle detection only working for 3-task triangles.
    """
    tasks = [
        Task(
            id="TASK-A",
            title="Task A",
            status="blocked",
            priority="P0",
            area="test",
            path="/test/A.yaml",
            blocked_by=["TASK-B"],
        ),
        Task(
            id="TASK-B",
            title="Task B",
            status="blocked",
            priority="P0",
            area="test",
            path="/test/B.yaml",
            blocked_by=["TASK-C"],
        ),
        Task(
            id="TASK-C",
            title="Task C",
            status="blocked",
            priority="P0",
            area="test",
            path="/test/C.yaml",
            blocked_by=["TASK-D"],
        ),
        Task(
            id="TASK-D",
            title="Task D",
            status="blocked",
            priority="P0",
            area="test",
            path="/test/D.yaml",
            blocked_by=["TASK-A"],  # Cycle back to A
        ),
    ]

    graph = DependencyGraph(tasks)
    cycles = graph.detect_cycles()

    # Should detect the 4-node cycle
    assert len(cycles) > 0
    cycle_ids = set(cycles[0])
    assert len(cycle_ids) == 4
    assert all(tid in cycle_ids for tid in ["TASK-A", "TASK-B", "TASK-C", "TASK-D"])


def test_multi_node_cycle_6_tasks():
    """
    Regression: Longer cycles (6+ nodes) should be detected.

    Prevents: Cycle detection depth limitations.
    """
    tasks = [
        Task(
            id=f"TASK-{chr(65+i)}",
            title=f"Task {chr(65+i)}",
            status="blocked",
            priority="P0",
            area="test",
            path=f"/test/{chr(65+i)}.yaml",
            blocked_by=[f"TASK-{chr(65+((i+1)%6))}"],  # Cycle through A->B->...->F->A
        )
        for i in range(6)
    ]

    graph = DependencyGraph(tasks)
    cycles = graph.detect_cycles()

    # Should detect the 6-node cycle
    assert len(cycles) > 0
    cycle_ids = set(cycles[0])
    assert len(cycle_ids) == 6


def test_multiple_independent_cycles():
    """
    Regression: Multiple independent cycles should all be detected.

    Prevents: Detection stopping after first cycle found.
    """
    tasks = [
        # First cycle: A -> B -> A
        Task(
            id="TASK-A",
            title="Task A",
            status="blocked",
            priority="P0",
            area="test",
            path="/test/A.yaml",
            blocked_by=["TASK-B"],
        ),
        Task(
            id="TASK-B",
            title="Task B",
            status="blocked",
            priority="P0",
            area="test",
            path="/test/B.yaml",
            blocked_by=["TASK-A"],
        ),
        # Second cycle: C -> D -> E -> C
        Task(
            id="TASK-C",
            title="Task C",
            status="blocked",
            priority="P0",
            area="test",
            path="/test/C.yaml",
            blocked_by=["TASK-D"],
        ),
        Task(
            id="TASK-D",
            title="Task D",
            status="blocked",
            priority="P0",
            area="test",
            path="/test/D.yaml",
            blocked_by=["TASK-E"],
        ),
        Task(
            id="TASK-E",
            title="Task E",
            status="blocked",
            priority="P0",
            area="test",
            path="/test/E.yaml",
            blocked_by=["TASK-C"],
        ),
    ]

    graph = DependencyGraph(tasks)
    cycles = graph.detect_cycles()

    # Should detect both cycles
    assert len(cycles) >= 2

    # Flatten all cycle IDs
    all_cycle_ids = set()
    for cycle in cycles:
        all_cycle_ids.update(cycle)

    # All tasks should appear in some cycle
    assert "TASK-A" in all_cycle_ids
    assert "TASK-B" in all_cycle_ids
    assert "TASK-C" in all_cycle_ids
    assert "TASK-D" in all_cycle_ids
    assert "TASK-E" in all_cycle_ids


def test_cycle_with_unblocker_task():
    """
    Regression: Cycles involving unblocker tasks should still be detected.

    Prevents: Unblocker flag causing cycle detection to be skipped.
    """
    tasks = [
        Task(
            id="TASK-A",
            title="Task A",
            status="blocked",
            priority="P0",
            area="test",
            path="/test/A.yaml",
            blocked_by=["TASK-B"],
            unblocker=True,  # Unblocker task in cycle
        ),
        Task(
            id="TASK-B",
            title="Task B",
            status="blocked",
            priority="P0",
            area="test",
            path="/test/B.yaml",
            blocked_by=["TASK-A"],
        ),
    ]

    graph = DependencyGraph(tasks)
    cycles = graph.detect_cycles()

    # Should detect cycle despite unblocker flag
    assert len(cycles) > 0
    cycle_ids = set(cycles[0])
    assert "TASK-A" in cycle_ids
    assert "TASK-B" in cycle_ids


def test_depends_on_does_not_create_cycle():
    """
    Regression: depends_on edges should NOT be considered for cycle detection.

    Prevents: Informational dependencies incorrectly flagged as cycles.
    """
    tasks = [
        Task(
            id="TASK-A",
            title="Task A",
            status="todo",
            priority="P0",
            area="test",
            path="/test/A.yaml",
            blocked_by=[],
            depends_on=["TASK-B"],  # Informational only
        ),
        Task(
            id="TASK-B",
            title="Task B",
            status="todo",
            priority="P0",
            area="test",
            path="/test/B.yaml",
            blocked_by=[],
            depends_on=["TASK-A"],  # Would be cycle if considered
        ),
    ]

    graph = DependencyGraph(tasks)
    cycles = graph.detect_cycles()

    # Should NOT detect any cycles (depends_on is informational)
    assert len(cycles) == 0


def test_mixed_cycle_and_acyclic():
    """
    Regression: Cycles should be detected even when mixed with acyclic tasks.

    Prevents: Acyclic tasks causing cycle detection to fail.
    """
    tasks = [
        # Acyclic chain: Z -> Y
        Task(
            id="TASK-Z",
            title="Task Z",
            status="todo",
            priority="P0",
            area="test",
            path="/test/Z.yaml",
            blocked_by=["TASK-Y"],
        ),
        Task(
            id="TASK-Y",
            title="Task Y",
            status="completed",
            priority="P0",
            area="test",
            path="/test/Y.yaml",
            blocked_by=[],
        ),
        # Cycle: A -> B -> C -> A
        Task(
            id="TASK-A",
            title="Task A",
            status="blocked",
            priority="P0",
            area="test",
            path="/test/A.yaml",
            blocked_by=["TASK-B"],
        ),
        Task(
            id="TASK-B",
            title="Task B",
            status="blocked",
            priority="P0",
            area="test",
            path="/test/B.yaml",
            blocked_by=["TASK-C"],
        ),
        Task(
            id="TASK-C",
            title="Task C",
            status="blocked",
            priority="P0",
            area="test",
            path="/test/C.yaml",
            blocked_by=["TASK-A"],
        ),
    ]

    graph = DependencyGraph(tasks)
    cycles = graph.detect_cycles()

    # Should detect only the cycle, not the acyclic tasks
    assert len(cycles) > 0
    cycle_ids = set(cycles[0])
    assert "TASK-A" in cycle_ids
    assert "TASK-B" in cycle_ids
    assert "TASK-C" in cycle_ids
    # Acyclic tasks should NOT be in cycle
    assert "TASK-Z" not in cycle_ids
    assert "TASK-Y" not in cycle_ids


@pytest.mark.slow
def test_cycle_detection_performance_100_tasks():
    """
    Regression: Cycle detection should complete in <500ms for 100-task graph.

    Prevents: Performance degradation on larger backlogs.

    Target: <500ms for 100 tasks (per proposal Section 5)
    """
    # Create 100 tasks with complex dependencies but no cycles
    tasks = []
    for i in range(100):
        task_id = f"TASK-{i:04d}"
        # Each task depends on previous 2 tasks (if they exist)
        blockers = []
        if i > 0:
            blockers.append(f"TASK-{(i-1):04d}")
        if i > 1:
            blockers.append(f"TASK-{(i-2):04d}")

        tasks.append(Task(
            id=task_id,
            title=f"Task {i}",
            status="todo" if i < 90 else "completed",
            priority=["P0", "P1", "P2"][i % 3],
            area="test",
            path=f"/test/{task_id}.yaml",
            blocked_by=blockers,
        ))

    graph = DependencyGraph(tasks)

    # Measure cycle detection time
    start_time = time.time()
    cycles = graph.detect_cycles()
    elapsed = time.time() - start_time

    # Should complete quickly (no cycles to find)
    assert elapsed < 0.5, f"Cycle detection took {elapsed:.3f}s (target: <0.5s)"
    assert len(cycles) == 0


@pytest.mark.slow
def test_cycle_detection_with_cycle_in_large_graph():
    """
    Regression: Cycle detection should find cycles quickly in large graphs.

    Prevents: Performance issues when cycles exist in large backlogs.
    """
    # Create 100 tasks with a hidden cycle in the middle
    tasks = []
    for i in range(100):
        task_id = f"TASK-{i:04d}"

        # Normal dependencies except for the cycle
        if i == 50:
            # Start of cycle: 50 -> 51 -> 52 -> 50
            blockers = ["TASK-0051"]
        elif i == 51:
            blockers = ["TASK-0052"]
        elif i == 52:
            blockers = ["TASK-0050"]
        else:
            # Normal sequential dependencies
            blockers = [f"TASK-{(i-1):04d}"] if i > 0 and i < 50 else []

        tasks.append(Task(
            id=task_id,
            title=f"Task {i}",
            status="todo",
            priority="P0",
            area="test",
            path=f"/test/{task_id}.yaml",
            blocked_by=blockers,
        ))

    graph = DependencyGraph(tasks)

    # Measure cycle detection time
    start_time = time.time()
    cycles = graph.detect_cycles()
    elapsed = time.time() - start_time

    # Should find cycle quickly
    assert elapsed < 0.5, f"Cycle detection took {elapsed:.3f}s (target: <0.5s)"
    assert len(cycles) > 0

    # Should detect the specific cycle
    cycle_ids = set(cycles[0])
    assert "TASK-0050" in cycle_ids
    assert "TASK-0051" in cycle_ids
    assert "TASK-0052" in cycle_ids
