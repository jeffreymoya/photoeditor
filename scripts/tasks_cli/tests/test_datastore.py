"""
Test persistent datastore and cache management.

Tests cache invalidation, atomic writes, and file tracking.
"""

import pytest
import json
import time
from pathlib import Path

from tasks_cli.datastore import TaskDatastore
from tasks_cli.constants import CACHE_VERSION


@pytest.fixture
def temp_repo(tmp_path):
    """Create temporary repo structure."""
    # Create tasks directory
    tasks_dir = tmp_path / "tasks"
    tasks_dir.mkdir()

    # Create sample task file
    task_file = tasks_dir / "TASK-0001.task.yaml"
    task_file.write_text("""id: TASK-0001
title: Test task
status: todo
priority: P0
area: test
blocked_by: []
depends_on: []
""")

    return tmp_path


def test_cache_creation(temp_repo):
    """Test that cache is created on first load."""
    datastore = TaskDatastore(temp_repo)

    # Load tasks - should create cache
    tasks = datastore.load_tasks()

    assert len(tasks) == 1
    assert tasks[0].id == "TASK-0001"

    # Verify cache file exists
    cache_file = temp_repo / "tasks" / ".cache" / "tasks_index.json"
    assert cache_file.exists()

    # Verify cache content
    with open(cache_file, 'r') as f:
        cache = json.load(f)

    assert cache['version'] == CACHE_VERSION
    assert 'TASK-0001' in cache['tasks']


def test_cache_invalidation_on_file_change(temp_repo):
    """Test that cache is invalidated when file mtime changes."""
    datastore = TaskDatastore(temp_repo)

    # Load tasks - creates cache
    tasks1 = datastore.load_tasks()
    assert len(tasks1) == 1
    original_mtime = tasks1[0].mtime

    # Modify task file
    time.sleep(0.01)  # Ensure different mtime
    task_file = temp_repo / "tasks" / "TASK-0001.task.yaml"
    task_file.write_text("""id: TASK-0001
title: Modified task
status: in_progress
priority: P0
area: test
blocked_by: []
depends_on: []
""")

    # Load tasks again - should detect change and rebuild cache
    tasks2 = datastore.load_tasks()
    assert len(tasks2) == 1
    assert tasks2[0].title == "Modified task"
    assert tasks2[0].status == "in_progress"
    assert tasks2[0].mtime != original_mtime


def test_force_refresh(temp_repo):
    """Test force refresh flag."""
    datastore = TaskDatastore(temp_repo)

    # Load tasks normally
    tasks1 = datastore.load_tasks()
    cache_info1 = datastore.get_cache_info()
    generated_at1 = cache_info1['generated_at']

    time.sleep(0.01)

    # Force refresh even if cache valid
    tasks2 = datastore.load_tasks(force_refresh=True)
    cache_info2 = datastore.get_cache_info()
    generated_at2 = cache_info2['generated_at']

    # Cache should be regenerated
    assert generated_at2 != generated_at1


def test_cache_info(temp_repo):
    """Test cache info retrieval."""
    datastore = TaskDatastore(temp_repo)

    # Before loading
    info = datastore.get_cache_info()
    assert info['exists'] is False

    # After loading
    datastore.load_tasks()
    info = datastore.get_cache_info()
    assert info['exists'] is True
    assert info['version'] == CACHE_VERSION
    assert info['task_count'] == 1
    assert 'generated_at' in info


def test_archive_tracking(temp_repo):
    """Test that archived tasks are tracked separately."""
    # Create archive directory with completed task
    archive_dir = temp_repo / "docs" / "completed-tasks"
    archive_dir.mkdir(parents=True)

    archive_file = archive_dir / "TASK-0099.task.yaml"
    archive_file.write_text("""id: TASK-0099
title: Archived task
status: completed
priority: P0
area: test
blocked_by: []
depends_on: []
""")

    datastore = TaskDatastore(temp_repo)
    tasks = datastore.load_tasks()

    # Should load both active and archived tasks
    task_ids = {t.id for t in tasks}
    assert "TASK-0001" in task_ids
    assert "TASK-0099" in task_ids

    # Check cache tracks archives
    info = datastore.get_cache_info()
    assert info['archive_count'] == 1
