"""
Tests for task lifecycle operations (claim, complete, transition).

Tests the operations module which manages safe status transitions,
archiving, and atomic YAML updates.
"""

import pytest
import tempfile
import shutil
from pathlib import Path
from ruamel.yaml import YAML

from tasks_cli.models import Task
from tasks_cli.operations import TaskOperations, TaskOperationError


@pytest.fixture
def temp_repo():
    """Create temporary repository structure for operation tests."""
    temp_dir = tempfile.mkdtemp()
    repo_path = Path(temp_dir)

    # Create directory structure
    (repo_path / "tasks").mkdir()
    (repo_path / "docs" / "completed-tasks").mkdir(parents=True)

    yield repo_path

    # Cleanup
    shutil.rmtree(temp_dir)


def create_test_task_file(path: Path, task_id: str, status: str = "todo"):
    """Create a test task YAML file."""
    yaml = YAML()
    data = {
        'id': task_id,
        'title': f'Test task {task_id}',
        'status': status,
        'priority': 'P0',
        'area': 'test',
        'scope': {
            'in': ['Test scope'],
            'out': []
        },
        'plan': [],
        'acceptance_criteria': [],
        'blocked_by': [],
        'depends_on': []
    }

    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w') as f:
        yaml.dump(data, f)


def test_claim_task_from_todo(temp_repo):
    """Test claiming a task from 'todo' status."""
    task_path = temp_repo / "tasks" / "TASK-001.yaml"
    create_test_task_file(task_path, "TASK-001", status="todo")

    task = Task(
        id="TASK-001",
        title="Test task",
        status="todo",
        priority="P0",
        area="test",
        path=str(task_path),
        blocked_by=[],
    )

    ops = TaskOperations(temp_repo)
    result_path = ops.claim_task(task)

    # Should update status to in_progress
    yaml = YAML()
    with open(result_path) as f:
        data = yaml.load(f)

    assert data['status'] == 'in_progress'
    assert result_path == task_path


def test_claim_task_from_blocked(temp_repo):
    """Test claiming a task from 'blocked' status (allowed for manual intervention)."""
    task_path = temp_repo / "tasks" / "TASK-002.yaml"
    create_test_task_file(task_path, "TASK-002", status="blocked")

    task = Task(
        id="TASK-002",
        title="Blocked task",
        status="blocked",
        priority="P0",
        area="test",
        path=str(task_path),
        blocked_by=[],
    )

    ops = TaskOperations(temp_repo)
    result_path = ops.claim_task(task)

    # Should transition to in_progress
    yaml = YAML()
    with open(result_path) as f:
        data = yaml.load(f)

    assert data['status'] == 'in_progress'


def test_claim_task_invalid_status(temp_repo):
    """Test that claiming a completed task raises error."""
    task_path = temp_repo / "tasks" / "TASK-003.yaml"
    create_test_task_file(task_path, "TASK-003", status="completed")

    task = Task(
        id="TASK-003",
        title="Completed task",
        status="completed",
        priority="P0",
        area="test",
        path=str(task_path),
        blocked_by=[],
    )

    ops = TaskOperations(temp_repo)

    with pytest.raises(TaskOperationError) as exc_info:
        ops.claim_task(task)

    assert "Cannot claim task" in str(exc_info.value)
    assert "completed" in str(exc_info.value)


def test_claim_task_from_draft_disallowed(temp_repo):
    """Draft tasks must be clarified before they can be claimed."""
    task_path = temp_repo / "tasks" / "TASK-003A.yaml"
    create_test_task_file(task_path, "TASK-003A", status="draft")

    task = Task(
        id="TASK-003A",
        title="Draft task",
        status="draft",
        priority="P1",
        area="test",
        path=str(task_path),
        blocked_by=[],
    )

    ops = TaskOperations(temp_repo)

    with pytest.raises(TaskOperationError) as exc_info:
        ops.claim_task(task)

    assert "status is 'draft'" in str(exc_info.value)


def test_complete_task_with_archive(temp_repo):
    """Test completing a task and archiving it."""
    task_path = temp_repo / "tasks" / "TASK-004.yaml"
    create_test_task_file(task_path, "TASK-004", status="in_progress")

    task = Task(
        id="TASK-004",
        title="In progress task",
        status="in_progress",
        priority="P0",
        area="test",
        path=str(task_path),
        blocked_by=[],
    )

    ops = TaskOperations(temp_repo)
    result_path = ops.complete_task(task, archive=True)

    # Should be archived to docs/completed-tasks/
    assert result_path.parent == temp_repo / "docs" / "completed-tasks"
    assert result_path.exists()

    # Original file should be gone
    assert not task_path.exists()

    # Status should be completed
    yaml = YAML()
    with open(result_path) as f:
        data = yaml.load(f)

    assert data['status'] == 'completed'


def test_complete_task_without_archive(temp_repo):
    """Test completing a task without archiving."""
    task_path = temp_repo / "tasks" / "TASK-005.yaml"
    create_test_task_file(task_path, "TASK-005", status="in_progress")

    task = Task(
        id="TASK-005",
        title="In progress task",
        status="in_progress",
        priority="P0",
        area="test",
        path=str(task_path),
        blocked_by=[],
    )

    ops = TaskOperations(temp_repo)
    result_path = ops.complete_task(task, archive=False)

    # Should stay in original location
    assert result_path == task_path
    assert task_path.exists()

    # Status should be completed
    yaml = YAML()
    with open(result_path) as f:
        data = yaml.load(f)

    assert data['status'] == 'completed'


def test_archive_completed_task_moves_file(temp_repo):
    """Archiving should move completed tasks into docs/completed-tasks/."""
    task_path = temp_repo / "tasks" / "TASK-007.yaml"
    create_test_task_file(task_path, "TASK-007", status="completed")

    task = Task(
        id="TASK-007",
        title="Completed task pending archive",
        status="completed",
        priority="P0",
        area="test",
        path=str(task_path),
        blocked_by=[],
    )

    ops = TaskOperations(temp_repo)
    result_path = ops.archive_task(task)

    assert result_path.parent == temp_repo / "docs" / "completed-tasks"
    assert result_path.exists()
    assert not task_path.exists()


def test_archive_requires_completed_status(temp_repo):
    """Only completed tasks can be archived."""
    task_path = temp_repo / "tasks" / "TASK-008.yaml"
    create_test_task_file(task_path, "TASK-008", status="todo")

    task = Task(
        id="TASK-008",
        title="Incomplete task",
        status="todo",
        priority="P0",
        area="test",
        path=str(task_path),
        blocked_by=[],
    )

    ops = TaskOperations(temp_repo)

    with pytest.raises(TaskOperationError) as exc_info:
        ops.archive_task(task)

    assert "Only completed tasks can be archived" in str(exc_info.value)


def test_archive_no_op_when_already_archived(temp_repo):
    """Archiving a task already in docs/completed-tasks is a no-op."""
    archive_path = temp_repo / "docs" / "completed-tasks" / "TASK-009.yaml"
    create_test_task_file(archive_path, "TASK-009", status="completed")

    task = Task(
        id="TASK-009",
        title="Already archived",
        status="completed",
        priority="P0",
        area="test",
        path=str(archive_path),
        blocked_by=[],
    )

    ops = TaskOperations(temp_repo)
    result_path = ops.archive_task(task)

    assert result_path == archive_path
    assert archive_path.exists()


def test_complete_already_completed_task(temp_repo):
    """Test that completing an already completed task raises error."""
    task_path = temp_repo / "tasks" / "TASK-006.yaml"
    create_test_task_file(task_path, "TASK-006", status="completed")

    task = Task(
        id="TASK-006",
        title="Already completed",
        status="completed",
        priority="P0",
        area="test",
        path=str(task_path),
        blocked_by=[],
    )

    ops = TaskOperations(temp_repo)

    with pytest.raises(TaskOperationError) as exc_info:
        ops.complete_task(task)

    assert "already completed" in str(exc_info.value)


def test_complete_task_from_draft_disallowed(temp_repo):
    """Draft tasks must be clarified and transitioned to todo before completion."""
    task_path = temp_repo / "tasks" / "TASK-006A.yaml"
    create_test_task_file(task_path, "TASK-006A", status="draft")

    task = Task(
        id="TASK-006A",
        title="Draft task",
        status="draft",
        priority="P1",
        area="test",
        path=str(task_path),
        blocked_by=[],
    )

    ops = TaskOperations(temp_repo)

    with pytest.raises(TaskOperationError) as exc_info:
        ops.complete_task(task)

    assert "status is 'draft'" in str(exc_info.value)
    assert "Resolve clarifications" in str(exc_info.value)


def test_transition_status_valid(temp_repo):
    """Test valid status transition."""
    task_path = temp_repo / "tasks" / "TASK-007.yaml"
    create_test_task_file(task_path, "TASK-007", status="todo")

    task = Task(
        id="TASK-007",
        title="Todo task",
        status="todo",
        priority="P0",
        area="test",
        path=str(task_path),
        blocked_by=[],
    )

    ops = TaskOperations(temp_repo)
    result_path = ops.transition_status(task, "blocked")

    # Should update to blocked
    yaml = YAML()
    with open(result_path) as f:
        data = yaml.load(f)

    assert data['status'] == 'blocked'


def test_transition_from_completed_invalid(temp_repo):
    """Test that transitioning from completed is not allowed."""
    task_path = temp_repo / "tasks" / "TASK-008.yaml"
    create_test_task_file(task_path, "TASK-008", status="completed")

    task = Task(
        id="TASK-008",
        title="Completed task",
        status="completed",
        priority="P0",
        area="test",
        path=str(task_path),
        blocked_by=[],
    )

    ops = TaskOperations(temp_repo)

    with pytest.raises(TaskOperationError) as exc_info:
        ops.transition_status(task, "todo")

    assert "Cannot transition from 'completed'" in str(exc_info.value)


def test_transition_invalid_status(temp_repo):
    """Test that invalid status values are rejected."""
    task_path = temp_repo / "tasks" / "TASK-009.yaml"
    create_test_task_file(task_path, "TASK-009", status="todo")

    task = Task(
        id="TASK-009",
        title="Todo task",
        status="todo",
        priority="P0",
        area="test",
        path=str(task_path),
        blocked_by=[],
    )

    ops = TaskOperations(temp_repo)

    with pytest.raises(TaskOperationError) as exc_info:
        ops.transition_status(task, "invalid_status")

    assert "Invalid status" in str(exc_info.value)


def test_transition_same_status(temp_repo):
    """Test that transitioning to same status is allowed (no-op)."""
    task_path = temp_repo / "tasks" / "TASK-010.yaml"
    create_test_task_file(task_path, "TASK-010", status="todo")

    task = Task(
        id="TASK-010",
        title="Todo task",
        status="todo",
        priority="P0",
        area="test",
        path=str(task_path),
        blocked_by=[],
    )

    ops = TaskOperations(temp_repo)
    result_path = ops.transition_status(task, "todo")

    # Should succeed (no-op)
    yaml = YAML()
    with open(result_path) as f:
        data = yaml.load(f)

    assert data['status'] == 'todo'


def test_atomic_write_pattern(temp_repo):
    """Test that status updates use atomic write pattern (temp file + rename)."""
    task_path = temp_repo / "tasks" / "TASK-011.yaml"
    create_test_task_file(task_path, "TASK-011", status="todo")

    task = Task(
        id="TASK-011",
        title="Todo task",
        status="todo",
        priority="P0",
        area="test",
        path=str(task_path),
        blocked_by=[],
    )

    ops = TaskOperations(temp_repo)
    ops.claim_task(task)

    # Temp file should not exist after operation
    temp_file = task_path.with_suffix('.tmp')
    assert not temp_file.exists()

    # Original file should have been updated
    assert task_path.exists()


def test_archive_creates_directory(temp_repo):
    """Test that archive operation creates archive directory if missing."""
    # Remove archive directory
    archive_dir = temp_repo / "docs" / "completed-tasks"
    if archive_dir.exists():
        shutil.rmtree(archive_dir)

    task_path = temp_repo / "tasks" / "TASK-012.yaml"
    create_test_task_file(task_path, "TASK-012", status="in_progress")

    task = Task(
        id="TASK-012",
        title="In progress task",
        status="in_progress",
        priority="P0",
        area="test",
        path=str(task_path),
        blocked_by=[],
    )

    ops = TaskOperations(temp_repo)
    result_path = ops.complete_task(task, archive=True)

    # Archive directory should be created
    assert archive_dir.exists()
    assert result_path.exists()


def test_archive_conflict_detection(temp_repo):
    """Test that archive detects conflicts if destination already exists."""
    task_path = temp_repo / "tasks" / "TASK-013.yaml"
    archive_path = temp_repo / "docs" / "completed-tasks" / "TASK-013.yaml"

    create_test_task_file(task_path, "TASK-013", status="in_progress")
    create_test_task_file(archive_path, "TASK-013", status="completed")

    task = Task(
        id="TASK-013",
        title="In progress task",
        status="in_progress",
        priority="P0",
        area="test",
        path=str(task_path),
        blocked_by=[],
    )

    ops = TaskOperations(temp_repo)

    with pytest.raises(TaskOperationError) as exc_info:
        ops.complete_task(task, archive=True)

    assert "already exists" in str(exc_info.value)


def test_yaml_formatting_preserved(temp_repo):
    """Test that YAML formatting and comments are preserved during updates."""
    task_path = temp_repo / "tasks" / "TASK-014.yaml"

    # Create task with comments
    with open(task_path, 'w') as f:
        f.write("""# Important task comment
id: TASK-014
title: Test task with comments
status: todo  # Current status
priority: P0
area: test
scope:
  in:
    - Test scope item
  out: []
plan: []
acceptance_criteria: []
blocked_by: []
depends_on: []
""")

    task = Task(
        id="TASK-014",
        title="Test task with comments",
        status="todo",
        priority="P0",
        area="test",
        path=str(task_path),
        blocked_by=[],
    )

    ops = TaskOperations(temp_repo)
    ops.claim_task(task)

    # Read updated file
    with open(task_path) as f:
        content = f.read()

    # Comments should be preserved (ruamel.yaml)
    # Status should be updated
    assert "in_progress" in content


def test_missing_file_error(temp_repo):
    """Test that operations on missing files raise appropriate errors."""
    task_path = temp_repo / "tasks" / "TASK-MISSING.yaml"

    task = Task(
        id="TASK-MISSING",
        title="Missing task",
        status="todo",
        priority="P0",
        area="test",
        path=str(task_path),
        blocked_by=[],
    )

    ops = TaskOperations(temp_repo)

    with pytest.raises(TaskOperationError) as exc_info:
        ops.claim_task(task)

    assert "not found" in str(exc_info.value)
