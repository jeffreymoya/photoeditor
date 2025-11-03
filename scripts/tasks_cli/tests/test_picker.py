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


def test_draft_tasks_are_not_selected():
    """Draft tasks must never be selected by the picker."""
    tasks = [
        Task(
            id="TASK-DRAFT",
            title="Clarify requirement",
            status="draft",
            priority="P1",
            area="test",
            path="/test/draft.yaml",
            blocked_by=[],
        ),
        Task(
            id="TASK-TODO",
            title="Ready task",
            status="todo",
            priority="P1",
            area="test",
            path="/test/todo.yaml",
            blocked_by=[],
        ),
    ]

    graph = DependencyGraph(tasks)
    picker = TaskPicker(tasks, graph)

    result = picker.pick_next_task(completed_ids=set())
    assert result is not None
    next_task, _reason = result
    assert next_task.id == "TASK-TODO"


def test_missing_blocked_by_dependencies_filtered_and_reported():
    """
    Tasks that depend on drafts without blocked_by linkage are skipped and reported.
    """
    draft = Task(
        id="TASK-DRAFT",
        title="Clarify interface",
        status="draft",
        priority="P1",
        area="test",
        path="/test/draft.yaml",
        blocked_by=[],
    )
    missing_blocked_by = Task(
        id="TASK-MISSING",
        title="Implements downstream work",
        status="todo",
        priority="P1",
        area="test",
        path="/test/missing.yaml",
        blocked_by=[],
        depends_on=["TASK-DRAFT"],
    )
    ready_task = Task(
        id="TASK-READY",
        title="Independent work",
        status="todo",
        priority="P1",
        area="test",
        path="/test/ready.yaml",
        blocked_by=[],
    )

    tasks = [draft, missing_blocked_by, ready_task]
    graph = DependencyGraph(tasks)
    picker = TaskPicker(tasks, graph)

    result = picker.pick_next_task(completed_ids=set())
    assert result is not None
    next_task, _ = result
    assert next_task.id == "TASK-READY"

    alerts = picker.get_draft_alerts()
    assert alerts["has_drafts"] is True
    missing_linkage = alerts["violations"]["missing_blocked_by"]
    assert any(item["task_id"] == "TASK-MISSING" for item in missing_linkage)
    filtered = alerts["filtered_out_by_picker"]
    assert any(entry["task_id"] == "TASK-MISSING" for entry in filtered)


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


# ==============================================================================
# Phase 2: Priority Inheritance Tests
# ==============================================================================


def test_priority_inheritance_single_hop():
    """P2 task blocking P1 work should inherit P1 effective priority."""
    tasks = [
        Task(
            id="BLOCKER",
            title="Blocker task",
            status="todo",
            priority="P2",
            area="test",
            path="/test/blocker.yaml",
            blocked_by=[],
        ),
        Task(
            id="BLOCKED",
            title="Blocked task",
            status="blocked",
            priority="P1",
            area="test",
            path="/test/blocked.yaml",
            blocked_by=["BLOCKER"],
        ),
    ]

    graph = DependencyGraph(tasks)
    picker = TaskPicker(tasks, graph)
    picker.compute_effective_priorities()

    # BLOCKER should inherit P1 from BLOCKED
    blocker = tasks[0]
    assert blocker.effective_priority == "P1"
    assert blocker.priority_reason is not None
    assert "P1 work" in blocker.priority_reason
    assert "BLOCKED" in blocker.priority_reason


def test_priority_inheritance_prioritization():
    """Inherited priority should affect task selection."""
    tasks = [
        Task(
            id="P1-NORMAL",
            title="Normal P1 task",
            status="todo",
            priority="P1",
            area="test",
            path="/test/p1.yaml",
            blocked_by=[],
            order=100,
        ),
        Task(
            id="P2-BLOCKER",
            title="P2 task blocking P0",
            status="todo",
            priority="P2",
            area="test",
            path="/test/p2.yaml",
            blocked_by=[],
            order=50,
        ),
        Task(
            id="P0-BLOCKED",
            title="P0 blocked task",
            status="blocked",
            priority="P0",
            area="test",
            path="/test/p0.yaml",
            blocked_by=["P2-BLOCKER"],
        ),
    ]

    graph = DependencyGraph(tasks)
    picker = TaskPicker(tasks, graph)

    completed = set()
    task, reason = picker.pick_next_task(completed)

    # P2-BLOCKER should be selected (inherits P0, order=50 < 100)
    assert task.id == "P2-BLOCKER"
    assert reason == "priority_inherited"
    assert task.effective_priority == "P0"


def test_priority_inheritance_multi_hop():
    """All tasks in chain should inherit max priority."""
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
    picker = TaskPicker(tasks, graph)
    picker.compute_effective_priorities()

    # All should inherit P0 (max priority in chain)
    assert tasks[0].effective_priority == "P0"  # TASK-A inherits P0
    assert tasks[1].effective_priority == "P0"  # TASK-B inherits P0
    assert tasks[2].effective_priority == "P0"  # TASK-C keeps P0


def test_no_inheritance_same_priority():
    """Task blocking same-priority work shouldn't inherit."""
    tasks = [
        Task(
            id="TASK-A",
            title="Task A",
            status="todo",
            priority="P1",
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
    picker = TaskPicker(tasks, graph)
    picker.compute_effective_priorities()

    # TASK-A should not inherit (same priority)
    assert tasks[0].effective_priority == "P1"
    assert tasks[0].priority_reason is None


def test_no_inheritance_lower_priority():
    """Task blocking lower-priority work shouldn't inherit."""
    tasks = [
        Task(
            id="TASK-A",
            title="Task A",
            status="todo",
            priority="P0",
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
    picker = TaskPicker(tasks, graph)
    picker.compute_effective_priorities()

    # TASK-A should not inherit (has higher priority already)
    assert tasks[0].effective_priority == "P0"
    assert tasks[0].priority_reason is None


def test_manual_unblocker_still_overrides():
    """Manual unblocker flag should still take precedence."""
    tasks = [
        Task(
            id="MANUAL",
            title="Manual unblocker",
            status="todo",
            priority="P2",
            area="test",
            path="/test/manual.yaml",
            unblocker=True,
            blocked_by=[],
        ),
        Task(
            id="INHERITED",
            title="Inherited P0",
            status="todo",
            priority="P2",
            area="test",
            path="/test/inherited.yaml",
            blocked_by=[],
        ),
        Task(
            id="P0-WORK",
            title="P0 work",
            status="blocked",
            priority="P0",
            area="test",
            path="/test/p0.yaml",
            blocked_by=["INHERITED"],
        ),
    ]

    graph = DependencyGraph(tasks)
    picker = TaskPicker(tasks, graph)

    completed = set()
    task, reason = picker.pick_next_task(completed)

    # MANUAL should be selected (manual flag wins)
    assert task.id == "MANUAL"
    assert reason == "unblocker"


def test_e2e_real_world_scenario():
    """
    Real-world scenario from proposal:
    - TASK-0827 (P1, no blocks) vs TASK-0832 (P2, blocks TASK-0830 P1)
    - Expected: TASK-0832 selected first (inherits P1, order=5 < 9999)
    """
    tasks = [
        Task(
            id="TASK-0827",
            title="Environment registry evidence",
            status="todo",
            priority="P1",
            area="infra",
            path="/tasks/TASK-0827.yaml",
            blocked_by=[],
            order=9999,
        ),
        Task(
            id="TASK-0832",
            title="Backfill screens coverage",
            status="todo",
            priority="P2",
            area="mobile",
            path="/tasks/TASK-0832.yaml",
            blocked_by=[],
            order=5,
        ),
        Task(
            id="TASK-0830",
            title="Test coverage evidence",
            status="blocked",
            priority="P1",
            area="mobile",
            path="/tasks/TASK-0830.yaml",
            blocked_by=["TASK-0832", "TASK-0831", "TASK-0825"],
            order=6,
        ),
    ]

    graph = DependencyGraph(tasks)
    picker = TaskPicker(tasks, graph)

    # Simulate TASK-0831 and TASK-0825 completed
    completed = {"TASK-0831", "TASK-0825"}
    task, reason = picker.pick_next_task(completed)

    # TASK-0832 should be selected (inherits P1, better order)
    assert task.id == "TASK-0832"
    assert reason == "priority_inherited"
    assert task.effective_priority == "P1"
    assert "TASK-0830" in task.priority_reason


def test_e2e_diamond_priority_max():
    """Diamond structure with mixed priorities - verify max propagation."""
    tasks = [
        Task(
            id="ROOT",
            title="Root",
            status="todo",
            priority="P2",
            area="test",
            path="/test/root.yaml",
            blocked_by=[],
        ),
        Task(
            id="LEFT",
            title="Left branch",
            status="blocked",
            priority="P1",
            area="test",
            path="/test/left.yaml",
            blocked_by=["ROOT"],
        ),
        Task(
            id="RIGHT",
            title="Right branch",
            status="blocked",
            priority="P0",
            area="test",
            path="/test/right.yaml",
            blocked_by=["ROOT"],
        ),
        Task(
            id="LEAF",
            title="Leaf",
            status="blocked",
            priority="P0",
            area="test",
            path="/test/leaf.yaml",
            blocked_by=["LEFT", "RIGHT"],
        ),
    ]

    graph = DependencyGraph(tasks)
    picker = TaskPicker(tasks, graph)
    picker.compute_effective_priorities()

    # ROOT should inherit P0 (max of LEFT=P1, RIGHT=P0, LEAF=P0)
    root = tasks[0]
    assert root.effective_priority == "P0"
    assert "P0 work" in root.priority_reason


def test_priority_inheritance_with_draft_tasks():
    """Draft tasks should not affect priority propagation."""
    tasks = [
        Task(
            id="DRAFT-BLOCKER",
            title="Draft blocker",
            status="draft",
            priority="P0",
            area="test",
            path="/test/draft.yaml",
            blocked_by=[],
        ),
        Task(
            id="TODO-TASK",
            title="Todo task",
            status="todo",
            priority="P2",
            area="test",
            path="/test/todo.yaml",
            blocked_by=[],
        ),
        Task(
            id="BLOCKED-BY-DRAFT",
            title="Blocked by draft",
            status="blocked",
            priority="P1",
            area="test",
            path="/test/blocked.yaml",
            blocked_by=["DRAFT-BLOCKER"],
        ),
    ]

    graph = DependencyGraph(tasks)
    picker = TaskPicker(tasks, graph)

    completed = set()
    task, reason = picker.pick_next_task(completed)

    # TODO-TASK should be selected (draft not in ready set)
    # Priority propagation still works, draft just won't be selected
    assert task.id == "TODO-TASK"
    assert reason == "highest_priority"
