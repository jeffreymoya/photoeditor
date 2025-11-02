"""
Test YAML parser for inline and multi-line array handling.

Critical test: Verify that both inline ([TASK-A, TASK-B]) and multi-line
YAML arrays are parsed correctly for blocked_by and depends_on fields.
"""

import pytest
from pathlib import Path

from tasks_cli.parser import TaskParser


@pytest.fixture
def parser(tmp_path):
    """Create parser with temp directory."""
    return TaskParser(tmp_path)


@pytest.fixture
def fixtures_dir():
    """Get path to test fixtures directory."""
    return Path(__file__).parent / "fixtures"


def test_parse_inline_blocked_by(parser, fixtures_dir):
    """Test parsing inline blocked_by array: blocked_by: [TASK-A, TASK-B]"""
    task_file = fixtures_dir / "TASK-0003-inline-blockers.task.yaml"
    task = parser.parse_file(task_file)

    assert task is not None
    assert task.id == "TASK-0003"
    assert task.blocked_by == ["TASK-0001", "TASK-0002"]
    assert task.depends_on == ["TASK-0099"]


def test_parse_multiline_blocked_by(parser, fixtures_dir):
    """Test parsing multi-line blocked_by array."""
    task_file = fixtures_dir / "TASK-0004-multiline-blockers.task.yaml"
    task = parser.parse_file(task_file)

    assert task is not None
    assert task.id == "TASK-0004"
    assert task.blocked_by == ["TASK-0001", "TASK-0002"]
    assert task.depends_on == ["TASK-0099"]


def test_parse_empty_blocked_by(parser, fixtures_dir):
    """Test parsing empty blocked_by array."""
    task_file = fixtures_dir / "TASK-0001-unblocker-p2.task.yaml"
    task = parser.parse_file(task_file)

    assert task is not None
    assert task.id == "TASK-0001"
    assert task.blocked_by == []
    assert task.depends_on == []


def test_parse_unblocker_flag(parser, fixtures_dir):
    """Test parsing unblocker flag."""
    # Test unblocker=true
    task_file = fixtures_dir / "TASK-0001-unblocker-p2.task.yaml"
    task = parser.parse_file(task_file)
    assert task.unblocker is True

    # Test unblocker=false
    task_file = fixtures_dir / "TASK-0002-regular-p0.task.yaml"
    task = parser.parse_file(task_file)
    assert task.unblocker is False


def test_parse_completed_status(parser, fixtures_dir):
    """Test parsing completed status."""
    task_file = fixtures_dir / "TASK-0005-completed.task.yaml"
    task = parser.parse_file(task_file)

    assert task is not None
    assert task.id == "TASK-0005"
    assert task.status == "completed"
    assert task.is_completed()


def test_parse_calculates_hash_and_mtime(parser, fixtures_dir):
    """Test that parser calculates file hash and mtime."""
    task_file = fixtures_dir / "TASK-0001-unblocker-p2.task.yaml"
    task = parser.parse_file(task_file)

    assert task.hash != ""
    assert len(task.hash) == 64  # SHA256 hex digest
    assert task.mtime > 0


def test_get_completed_ids(parser, fixtures_dir):
    """Test extraction of completed task IDs."""
    tasks = [
        parser.parse_file(fixtures_dir / "TASK-0001-unblocker-p2.task.yaml"),
        parser.parse_file(fixtures_dir / "TASK-0002-regular-p0.task.yaml"),
        parser.parse_file(fixtures_dir / "TASK-0005-completed.task.yaml"),
    ]

    completed_ids = parser.get_completed_ids(tasks)

    assert "TASK-0005" in completed_ids
    assert "TASK-0001" not in completed_ids
    assert "TASK-0002" not in completed_ids
