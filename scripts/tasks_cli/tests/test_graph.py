"""
Test dependency graph validation and readiness checks.

Tests cycle detection, missing dependency detection, archive resolution,
and topological readiness calculation.
"""

import pytest
from pathlib import Path

from tasks_cli.models import Task
from tasks_cli.graph import DependencyGraph


@pytest.fixture
def simple_tasks():
    """Create simple task list for testing."""
    return [
        Task(
            id="TASK-0001",
            title="Task 1",
            status="completed",
            priority="P0",
            area="test",
            path="/test/TASK-0001.yaml",
            blocked_by=[],
            depends_on=[],
        ),
        Task(
            id="TASK-0002",
            title="Task 2",
            status="todo",
            priority="P0",
            area="test",
            path="/test/TASK-0002.yaml",
            blocked_by=["TASK-0001"],
            depends_on=[],
        ),
        Task(
            id="TASK-0003",
            title="Task 3",
            status="todo",
            priority="P0",
            area="test",
            path="/test/TASK-0003.yaml",
            blocked_by=["TASK-0002"],
            depends_on=[],
        ),
    ]


def test_topological_ready_set_basic(simple_tasks):
    """Test basic topological readiness check."""
    graph = DependencyGraph(simple_tasks)
    completed_ids = {"TASK-0001"}

    ready = graph.topological_ready_set(completed_ids)
    ready_ids = {t.id for t in ready}

    # TASK-0002 should be ready (TASK-0001 completed)
    # TASK-0003 should NOT be ready (TASK-0002 not completed)
    assert "TASK-0002" in ready_ids
    assert "TASK-0003" not in ready_ids


def test_topological_ready_set_transitive(simple_tasks):
    """Test transitive dependency resolution."""
    graph = DependencyGraph(simple_tasks)
    completed_ids = {"TASK-0001", "TASK-0002"}

    ready = graph.topological_ready_set(completed_ids)
    ready_ids = {t.id for t in ready}

    # TASK-0003 should now be ready (TASK-0002 completed)
    assert "TASK-0003" in ready_ids


def test_cycle_detection():
    """Test circular dependency detection."""
    tasks = [
        Task(
            id="TASK-A",
            title="Task A",
            status="todo",
            priority="P0",
            area="test",
            path="/test/A.yaml",
            blocked_by=["TASK-B"],
        ),
        Task(
            id="TASK-B",
            title="Task B",
            status="todo",
            priority="P0",
            area="test",
            path="/test/B.yaml",
            blocked_by=["TASK-C"],
        ),
        Task(
            id="TASK-C",
            title="Task C",
            status="todo",
            priority="P0",
            area="test",
            path="/test/C.yaml",
            blocked_by=["TASK-A"],
        ),
    ]

    graph = DependencyGraph(tasks)
    cycles = graph.detect_cycles()

    # Should detect A -> B -> C -> A cycle
    assert len(cycles) > 0
    # Cycle should contain all three tasks
    cycle_ids = set(cycles[0])
    assert "TASK-A" in cycle_ids
    assert "TASK-B" in cycle_ids
    assert "TASK-C" in cycle_ids


def test_no_cycles():
    """Test that acyclic graphs report no cycles."""
    tasks = [
        Task(
            id="TASK-A",
            title="Task A",
            status="todo",
            priority="P0",
            area="test",
            path="/test/A.yaml",
            blocked_by=[],
        ),
        Task(
            id="TASK-B",
            title="Task B",
            status="todo",
            priority="P0",
            area="test",
            path="/test/B.yaml",
            blocked_by=["TASK-A"],
        ),
    ]

    graph = DependencyGraph(tasks)
    cycles = graph.detect_cycles()

    assert len(cycles) == 0


def test_missing_dependencies():
    """Test detection of missing/non-existent dependencies."""
    tasks = [
        Task(
            id="TASK-A",
            title="Task A",
            status="todo",
            priority="P0",
            area="test",
            path="/test/A.yaml",
            blocked_by=["TASK-MISSING"],
            depends_on=["TASK-ALSO-MISSING"],
        ),
    ]

    graph = DependencyGraph(tasks)
    missing = graph.missing_dependencies()

    assert "TASK-A" in missing
    assert "TASK-MISSING" in missing["TASK-A"]
    assert "TASK-ALSO-MISSING" in missing["TASK-A"]


def test_archive_resolution():
    """Test that completed tasks in archives satisfy dependencies."""
    tasks = [
        Task(
            id="TASK-OLD",
            title="Old completed task",
            status="completed",
            priority="P0",
            area="test",
            path="/docs/completed-tasks/TASK-OLD.yaml",  # Archive path
            blocked_by=[],
        ),
        Task(
            id="TASK-NEW",
            title="New task blocked by archived task",
            status="todo",
            priority="P0",
            area="test",
            path="/tasks/TASK-NEW.yaml",
            blocked_by=["TASK-OLD"],  # Reference to archived task
        ),
    ]

    graph = DependencyGraph(tasks)

    # Should NOT report TASK-OLD as missing (it exists in archives)
    missing = graph.missing_dependencies()
    assert "TASK-NEW" not in missing

    # TASK-NEW should be ready when TASK-OLD is in completed set
    completed_ids = {"TASK-OLD"}
    ready = graph.topological_ready_set(completed_ids)
    ready_ids = {t.id for t in ready}
    assert "TASK-NEW" in ready_ids


def test_depends_on_not_blocking():
    """Test that depends_on does NOT block execution (informational only)."""
    tasks = [
        Task(
            id="TASK-A",
            title="Task A",
            status="todo",
            priority="P0",
            area="test",
            path="/test/A.yaml",
            blocked_by=[],
            depends_on=["TASK-B"],  # Informational dependency
        ),
        Task(
            id="TASK-B",
            title="Task B",
            status="todo",
            priority="P0",
            area="test",
            path="/test/B.yaml",
            blocked_by=[],
        ),
    ]

    graph = DependencyGraph(tasks)
    completed_ids = set()

    # TASK-A should be ready even though TASK-B (in depends_on) is not completed
    ready = graph.topological_ready_set(completed_ids)
    ready_ids = {t.id for t in ready}

    assert "TASK-A" in ready_ids  # Should be ready despite depends_on


def test_validate_all_checks():
    """Test that validate() runs all validation checks."""
    tasks = [
        Task(
            id="TASK-A",
            title="Task A",
            status="todo",
            priority="P0",
            area="test",
            path="/test/A.yaml",
            blocked_by=["TASK-B"],
        ),
        Task(
            id="TASK-B",
            title="Task B",
            status="todo",
            priority="P0",
            area="test",
            path="/test/B.yaml",
            blocked_by=["TASK-A"],  # Cycle
        ),
    ]

    graph = DependencyGraph(tasks)
    is_valid, errors = graph.validate()

    assert not is_valid
    assert len(errors) > 0
    # Should detect cycle
    assert any("Circular dependency" in err for err in errors)


def test_compute_dependency_closure_simple():
    """Test simple dependency closure with direct dependencies."""
    tasks = [
        Task(
            id="TASK-A",
            title="Task A",
            status="todo",
            priority="P0",
            area="test",
            path="/test/A.yaml",
            blocked_by=["TASK-B", "TASK-C"],
            depends_on=["TASK-D"],
        ),
        Task(
            id="TASK-B",
            title="Task B",
            status="completed",
            priority="P0",
            area="test",
            path="/test/B.yaml",
            blocked_by=[],
        ),
        Task(
            id="TASK-C",
            title="Task C",
            status="todo",
            priority="P0",
            area="test",
            path="/test/C.yaml",
            blocked_by=[],
        ),
        Task(
            id="TASK-D",
            title="Task D",
            status="completed",
            priority="P0",
            area="test",
            path="/test/D.yaml",
            depends_on=[],
        ),
    ]

    graph = DependencyGraph(tasks)
    closure = graph.compute_dependency_closure("TASK-A")

    # Should include direct blocked_by dependencies
    assert "TASK-B" in closure['blocking']
    assert "TASK-C" in closure['blocking']

    # Should include direct depends_on dependencies
    assert "TASK-D" in closure['artifacts']

    # Transitive should include all
    assert "TASK-B" in closure['transitive']
    assert "TASK-C" in closure['transitive']
    assert "TASK-D" in closure['transitive']


def test_compute_dependency_closure_transitive():
    """Test transitive dependency closure (multi-level)."""
    tasks = [
        Task(
            id="TASK-A",
            title="Task A",
            status="todo",
            priority="P0",
            area="test",
            path="/test/A.yaml",
            blocked_by=["TASK-B"],
            depends_on=[],
        ),
        Task(
            id="TASK-B",
            title="Task B",
            status="todo",
            priority="P0",
            area="test",
            path="/test/B.yaml",
            blocked_by=["TASK-C"],
            depends_on=[],
        ),
        Task(
            id="TASK-C",
            title="Task C",
            status="todo",
            priority="P0",
            area="test",
            path="/test/C.yaml",
            blocked_by=["TASK-D"],
            depends_on=[],
        ),
        Task(
            id="TASK-D",
            title="Task D",
            status="completed",
            priority="P0",
            area="test",
            path="/test/D.yaml",
            blocked_by=[],
        ),
    ]

    graph = DependencyGraph(tasks)
    closure = graph.compute_dependency_closure("TASK-A")

    # Should include entire transitive chain
    assert "TASK-B" in closure['blocking']
    assert "TASK-C" in closure['blocking']
    assert "TASK-D" in closure['blocking']

    # All should be in transitive closure
    assert len(closure['transitive']) == 3
    assert "TASK-B" in closure['transitive']
    assert "TASK-C" in closure['transitive']
    assert "TASK-D" in closure['transitive']


def test_compute_dependency_closure_empty():
    """Test dependency closure for task with no dependencies."""
    tasks = [
        Task(
            id="TASK-A",
            title="Task A",
            status="todo",
            priority="P0",
            area="test",
            path="/test/A.yaml",
            blocked_by=[],
            depends_on=[],
        ),
    ]

    graph = DependencyGraph(tasks)
    closure = graph.compute_dependency_closure("TASK-A")

    # All closures should be empty
    assert len(closure['blocking']) == 0
    assert len(closure['artifacts']) == 0
    assert len(closure['transitive']) == 0


def test_compute_dependency_closure_mixed():
    """Test closure with both blocked_by and depends_on at different levels."""
    tasks = [
        Task(
            id="TASK-A",
            title="Task A",
            status="todo",
            priority="P0",
            area="test",
            path="/test/A.yaml",
            blocked_by=["TASK-B"],
            depends_on=["TASK-C"],
        ),
        Task(
            id="TASK-B",
            title="Task B (blocker)",
            status="todo",
            priority="P0",
            area="test",
            path="/test/B.yaml",
            blocked_by=["TASK-D"],
            depends_on=[],
        ),
        Task(
            id="TASK-C",
            title="Task C (artifact)",
            status="completed",
            priority="P0",
            area="test",
            path="/test/C.yaml",
            blocked_by=[],
            depends_on=["TASK-E"],
        ),
        Task(
            id="TASK-D",
            title="Task D",
            status="completed",
            priority="P0",
            area="test",
            path="/test/D.yaml",
            blocked_by=[],
        ),
        Task(
            id="TASK-E",
            title="Task E",
            status="completed",
            priority="P0",
            area="test",
            path="/test/E.yaml",
            depends_on=[],
        ),
    ]

    graph = DependencyGraph(tasks)
    closure = graph.compute_dependency_closure("TASK-A")

    # Blocking: B and its blocker D
    assert "TASK-B" in closure['blocking']
    assert "TASK-D" in closure['blocking']

    # Artifacts: C and its artifact E
    assert "TASK-C" in closure['artifacts']
    assert "TASK-E" in closure['artifacts']

    # Transitive should include all
    assert len(closure['transitive']) == 4
    assert "TASK-B" in closure['transitive']
    assert "TASK-C" in closure['transitive']
    assert "TASK-D" in closure['transitive']
    assert "TASK-E" in closure['transitive']


def test_compute_dependency_closure_nonexistent_task():
    """Test closure for nonexistent task returns empty sets."""
    tasks = [
        Task(
            id="TASK-A",
            title="Task A",
            status="todo",
            priority="P0",
            area="test",
            path="/test/A.yaml",
            blocked_by=[],
        ),
    ]

    graph = DependencyGraph(tasks)
    closure = graph.compute_dependency_closure("TASK-MISSING")

    # Should return empty closure for nonexistent task
    assert len(closure['blocking']) == 0
    assert len(closure['artifacts']) == 0
    assert len(closure['transitive']) == 0


# ==============================================================================
# Phase 2: Transitive Priority Propagation Tests
# ==============================================================================


def test_find_transitively_blocked_single_hop():
    """Test finding tasks blocked by a single-level dependency."""
    tasks = [
        Task(
            id="TASK-A",
            title="Task A",
            status="todo",
            priority="P2",
            area="test",
            path="/test/a.yaml",
            blocked_by=[],
        ),
        Task(
            id="TASK-B",
            title="Task B",
            status="blocked",
            priority="P1",
            area="test",
            path="/test/b.yaml",
            blocked_by=["TASK-A"],
        ),
    ]

    graph = DependencyGraph(tasks)
    blocked = graph.find_transitively_blocked("TASK-A")

    # TASK-A directly blocks TASK-B
    assert len(blocked) == 1
    assert blocked[0].id == "TASK-B"


def test_find_transitively_blocked_multi_hop():
    """Test finding tasks blocked by multi-level transitive dependencies."""
    tasks = [
        Task(
            id="TASK-A",
            title="Task A",
            status="todo",
            priority="P2",
            area="test",
            path="/test/a.yaml",
            blocked_by=[],
        ),
        Task(
            id="TASK-B",
            title="Task B",
            status="blocked",
            priority="P1",
            area="test",
            path="/test/b.yaml",
            blocked_by=["TASK-A"],
        ),
        Task(
            id="TASK-C",
            title="Task C",
            status="blocked",
            priority="P0",
            area="test",
            path="/test/c.yaml",
            blocked_by=["TASK-B"],
        ),
    ]

    graph = DependencyGraph(tasks)
    blocked = graph.find_transitively_blocked("TASK-A")

    # TASK-A blocks TASK-B, which blocks TASK-C (transitive)
    assert len(blocked) == 2
    blocked_ids = {task.id for task in blocked}
    assert "TASK-B" in blocked_ids
    assert "TASK-C" in blocked_ids


def test_find_transitively_blocked_diamond():
    """Test diamond dependency structure (no duplicate results)."""
    tasks = [
        Task(
            id="TASK-A",
            title="Task A",
            status="todo",
            priority="P2",
            area="test",
            path="/test/a.yaml",
            blocked_by=[],
        ),
        Task(
            id="TASK-B",
            title="Task B",
            status="blocked",
            priority="P1",
            area="test",
            path="/test/b.yaml",
            blocked_by=["TASK-A"],
        ),
        Task(
            id="TASK-C",
            title="Task C",
            status="blocked",
            priority="P0",
            area="test",
            path="/test/c.yaml",
            blocked_by=["TASK-A"],
        ),
        Task(
            id="TASK-D",
            title="Task D",
            status="blocked",
            priority="P0",
            area="test",
            path="/test/d.yaml",
            blocked_by=["TASK-B", "TASK-C"],
        ),
    ]

    graph = DependencyGraph(tasks)
    blocked = graph.find_transitively_blocked("TASK-A")

    # TASK-A blocks B and C, both block D (diamond)
    # Should get all three, no duplicates
    assert len(blocked) == 3
    blocked_ids = {task.id for task in blocked}
    assert "TASK-B" in blocked_ids
    assert "TASK-C" in blocked_ids
    assert "TASK-D" in blocked_ids


def test_find_transitively_blocked_empty():
    """Test task that blocks nothing returns empty list."""
    tasks = [
        Task(
            id="TASK-A",
            title="Task A",
            status="todo",
            priority="P2",
            area="test",
            path="/test/a.yaml",
            blocked_by=[],
        ),
        Task(
            id="TASK-B",
            title="Task B",
            status="todo",
            priority="P1",
            area="test",
            path="/test/b.yaml",
            blocked_by=[],
        ),
    ]

    graph = DependencyGraph(tasks)
    blocked = graph.find_transitively_blocked("TASK-A")

    # TASK-A blocks nothing
    assert len(blocked) == 0


def test_reverse_adjacency_list_construction():
    """Test reverse blocked_by graph is built correctly."""
    tasks = [
        Task(
            id="TASK-A",
            title="Task A",
            status="todo",
            priority="P2",
            area="test",
            path="/test/a.yaml",
            blocked_by=[],
        ),
        Task(
            id="TASK-B",
            title="Task B",
            status="blocked",
            priority="P1",
            area="test",
            path="/test/b.yaml",
            blocked_by=["TASK-A"],
        ),
        Task(
            id="TASK-C",
            title="Task C",
            status="blocked",
            priority="P0",
            area="test",
            path="/test/c.yaml",
            blocked_by=["TASK-A", "TASK-B"],
        ),
    ]

    graph = DependencyGraph(tasks)

    # TASK-A blocks both B and C
    assert "TASK-A" in graph.reverse_blocked_by
    assert set(graph.reverse_blocked_by["TASK-A"]) == {"TASK-B", "TASK-C"}

    # TASK-B blocks only C
    assert "TASK-B" in graph.reverse_blocked_by
    assert graph.reverse_blocked_by["TASK-B"] == ["TASK-C"]

    # TASK-C blocks nothing, should not be in reverse map
    assert "TASK-C" not in graph.reverse_blocked_by
