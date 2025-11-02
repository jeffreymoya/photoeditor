"""
Test task prioritization and selection logic.

CRITICAL TEST: Verify that unblocker tasks are prioritized BEFORE
higher-priority non-unblockers (fixes Bash script bug).
"""

import pytest

from tasks_cli.models import Task
from tasks_cli.graph import DependencyGraph
from tasks_cli.picker import TaskPicker


@pytest.fixture
def mixed_priority_tasks():
    """Tasks with different priorities and unblocker flags."""
    return [
        Task(
            id="TASK-P0-REGULAR",
            title="P0 regular task",
            status="todo",
            priority="P0",
            area="test",
            path="/test/p0.yaml",
            unblocker=False,
            blocked_by=[],
        ),
        Task(
            id="TASK-P2-UNBLOCKER",
            title="P2 unblocker task",
            status="todo",
            priority="P2",
            area="test",
            path="/test/p2.yaml",
            unblocker=True,
            blocked_by=[],
        ),
        Task(
            id="TASK-P1-REGULAR",
            title="P1 regular task",
            status="todo",
            priority="P1",
            area="test",
            path="/test/p1.yaml",
            unblocker=False,
            blocked_by=[],
        ),
    ]


def test_unblocker_first_priority(mixed_priority_tasks):
    """
    CRITICAL: P2 unblocker should be picked BEFORE P0 non-unblocker.

    This is the key bug fix - Bash script sorts by priority first,
    Python CLI sorts by unblocker first.
    """
    graph = DependencyGraph(mixed_priority_tasks)
    picker = TaskPicker(mixed_priority_tasks, graph)

    result = picker.pick_next_task(completed_ids=set())
    assert result is not None
    next_task, reason = result

    # Should pick P2 unblocker, NOT P0 regular
    assert next_task.id == "TASK-P2-UNBLOCKER"
    assert next_task.unblocker is True
    assert next_task.priority == "P2"
    assert reason == "unblocker"


def test_priority_order_within_non_unblockers(mixed_priority_tasks):
    """Test that priority ordering works within non-unblocker tasks."""
    # Remove unblocker task to test priority ordering
    non_unblocker_tasks = [
        t for t in mixed_priority_tasks if not t.unblocker
    ]

    graph = DependencyGraph(non_unblocker_tasks)
    picker = TaskPicker(non_unblocker_tasks, graph)

    result = picker.pick_next_task(completed_ids=set())
    assert result is not None
    next_task, reason = result

    # Should pick P0 over P1 when no unblockers present
    assert next_task.id == "TASK-P0-REGULAR"
    assert next_task.priority == "P0"
    assert reason == "highest_priority"


def test_status_ordering():
    """Test status ordering: blocked -> in_progress -> todo."""
    tasks = [
        Task(
            id="TASK-TODO",
            title="Todo task",
            status="todo",
            priority="P0",
            area="test",
            path="/test/todo.yaml",
            blocked_by=[],
        ),
        Task(
            id="TASK-IN-PROGRESS",
            title="In progress task",
            status="in_progress",
            priority="P0",
            area="test",
            path="/test/in_progress.yaml",
            blocked_by=[],
        ),
        Task(
            id="TASK-BLOCKED",
            title="Blocked task",
            status="blocked",
            priority="P0",
            area="test",
            path="/test/blocked.yaml",
            blocked_by=[],  # Empty blocked_by, but status is blocked
        ),
    ]

    graph = DependencyGraph(tasks)
    picker = TaskPicker(tasks, graph)

    result = picker.pick_next_task(completed_ids=set())
    assert result is not None
    next_task, reason = result

    # Should pick blocked task first (for manual intervention)
    assert next_task.id == "TASK-BLOCKED"
    assert reason == "blocked_manual_intervention"


def test_order_field_tiebreaker():
    """Test that order field breaks ties within same priority/status."""
    tasks = [
        Task(
            id="TASK-ORDER-10",
            title="Order 10",
            status="todo",
            priority="P0",
            area="test",
            path="/test/order10.yaml",
            order=10,
            blocked_by=[],
        ),
        Task(
            id="TASK-ORDER-5",
            title="Order 5",
            status="todo",
            priority="P0",
            area="test",
            path="/test/order5.yaml",
            order=5,
            blocked_by=[],
        ),
        Task(
            id="TASK-ORDER-NULL",
            title="Order null",
            status="todo",
            priority="P0",
            area="test",
            path="/test/order_null.yaml",
            order=None,
            blocked_by=[],
        ),
    ]

    graph = DependencyGraph(tasks)
    picker = TaskPicker(tasks, graph)

    result = picker.pick_next_task(completed_ids=set())
    assert result is not None
    next_task, reason = result

    # Should pick order=5 (lowest)
    assert next_task.id == "TASK-ORDER-5"


def test_id_tiebreaker():
    """Test that task ID breaks final ties (lexicographic)."""
    tasks = [
        Task(
            id="TASK-Z",
            title="Task Z",
            status="todo",
            priority="P0",
            area="test",
            path="/test/z.yaml",
            blocked_by=[],
        ),
        Task(
            id="TASK-A",
            title="Task A",
            status="todo",
            priority="P0",
            area="test",
            path="/test/a.yaml",
            blocked_by=[],
        ),
    ]

    graph = DependencyGraph(tasks)
    picker = TaskPicker(tasks, graph)

    result = picker.pick_next_task(completed_ids=set())
    assert result is not None
    next_task, reason = result

    # Should pick TASK-A (lexicographically first)
    assert next_task.id == "TASK-A"


def test_pick_respects_dependencies():
    """Test that picker only returns ready tasks (dependencies satisfied)."""
    tasks = [
        Task(
            id="TASK-BLOCKER",
            title="Blocker",
            status="todo",
            priority="P0",
            area="test",
            path="/test/blocker.yaml",
            blocked_by=[],
        ),
        Task(
            id="TASK-BLOCKED",
            title="Blocked",
            status="todo",
            priority="P0",
            area="test",
            path="/test/blocked.yaml",
            blocked_by=["TASK-BLOCKER"],
        ),
    ]

    graph = DependencyGraph(tasks)
    picker = TaskPicker(tasks, graph)

    # TASK-BLOCKER not completed - should pick it first
    result = picker.pick_next_task(completed_ids=set())
    assert result is not None
    next_task, reason = result
    assert next_task.id == "TASK-BLOCKER"

    # Once TASK-BLOCKER completed, should pick TASK-BLOCKED
    result = picker.pick_next_task(completed_ids={"TASK-BLOCKER"})
    assert result is not None
    next_task, reason = result
    assert next_task.id == "TASK-BLOCKED"


def test_list_tasks_with_filters():
    """Test task listing with status and unblocker filters."""
    tasks = [
        Task(
            id="TASK-TODO",
            title="Todo",
            status="todo",
            priority="P0",
            area="test",
            path="/test/todo.yaml",
            unblocker=False,
        ),
        Task(
            id="TASK-IN-PROGRESS",
            title="In Progress",
            status="in_progress",
            priority="P0",
            area="test",
            path="/test/in_progress.yaml",
            unblocker=False,
        ),
        Task(
            id="TASK-UNBLOCKER",
            title="Unblocker",
            status="todo",
            priority="P0",
            area="test",
            path="/test/unblocker.yaml",
            unblocker=True,
        ),
    ]

    graph = DependencyGraph(tasks)
    picker = TaskPicker(tasks, graph)

    # Filter by status
    todo_tasks = picker.list_tasks(status_filter="todo")
    todo_ids = {t.id for t in todo_tasks}
    assert "TASK-TODO" in todo_ids
    assert "TASK-UNBLOCKER" in todo_ids
    assert "TASK-IN-PROGRESS" not in todo_ids

    # Filter by unblocker flag
    unblocker_tasks = picker.list_tasks(unblocker_only=True)
    unblocker_ids = {t.id for t in unblocker_tasks}
    assert "TASK-UNBLOCKER" in unblocker_ids
    assert "TASK-TODO" not in unblocker_ids
