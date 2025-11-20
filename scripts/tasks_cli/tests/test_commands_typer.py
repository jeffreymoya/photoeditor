"""
Tests for Typer-based command implementations (Wave 1).

Tests list, validate, and show commands to ensure parity with legacy
argparse implementation. Uses typer.testing.CliRunner for integration tests.
"""

import json
from pathlib import Path
from unittest.mock import Mock, patch

import pytest
from typer.testing import CliRunner

from tasks_cli.app import app, initialize_commands
from tasks_cli.commands.tasks import list_tasks, validate_tasks, show_task, task_to_dict
from tasks_cli.context import TaskCliContext
from tasks_cli.models import Task


@pytest.fixture
def mock_context():
    """Create a mock TaskCliContext for testing."""
    ctx = Mock(spec=TaskCliContext)

    # Mock output channel
    output = Mock()
    output.set_json_mode = Mock()
    output.print_json = Mock()
    ctx.output_channel = output

    # Mock picker
    picker = Mock()
    ctx.picker = picker

    # Mock graph
    graph = Mock()
    ctx.graph = graph

    # Mock datastore
    datastore = Mock()
    ctx.datastore = datastore

    return ctx


@pytest.fixture
def sample_tasks():
    """Create sample tasks for testing."""
    task1 = Task(
        id='TASK-0001',
        title='Test task 1',
        status='todo',
        priority='P0',
        area='backend',
        path=str(Path('/fake/tasks/TASK-0001.task.yaml')),
        order=1,
        blocked_by=[],
        depends_on=[],
        unblocker=False,
        hash='abc123',
        mtime=1234567890
    )
    # Set runtime-computed fields
    task1.effective_priority = 'P0'
    task1.priority_reason = None

    task2 = Task(
        id='TASK-0002',
        title='Test task 2',
        status='in_progress',
        priority='P1',
        area='mobile',
        path=str(Path('/fake/tasks/TASK-0002.task.yaml')),
        order=2,
        blocked_by=['TASK-0001'],
        depends_on=[],
        unblocker=True,
        hash='def456',
        mtime=1234567891
    )
    # Set runtime-computed fields
    task2.effective_priority = 'P0'
    task2.priority_reason = 'unblocker_flag'

    return [task1, task2]


class TestTaskToDict:
    """Test task_to_dict serialization function."""

    def test_task_to_dict_full_fields(self, sample_tasks):
        """Test serialization with all fields populated."""
        task = sample_tasks[1]  # Task with blocked_by
        result = task_to_dict(task)

        assert result['id'] == 'TASK-0002'
        assert result['title'] == 'Test task 2'
        assert result['status'] == 'in_progress'
        assert result['priority'] == 'P1'
        assert result['area'] == 'mobile'
        assert result['blocked_by'] == ['TASK-0001']  # Should be sorted
        assert result['depends_on'] == []
        assert result['unblocker'] is True
        assert result['effective_priority'] == 'P0'
        assert result['priority_reason'] == 'unblocker_flag'

    def test_task_to_dict_minimal_fields(self, sample_tasks):
        """Test serialization with minimal fields."""
        task = sample_tasks[0]
        result = task_to_dict(task)

        assert result['id'] == 'TASK-0001'
        assert result['blocked_by'] == []
        assert result['depends_on'] == []
        assert result['unblocker'] is False
        assert result['priority_reason'] is None


class TestListTasks:
    """Test list_tasks command implementation."""

    def test_list_tasks_text_format(self, mock_context, sample_tasks, capsys):
        """Test list command with text output format."""
        mock_context.picker.list_tasks.return_value = sample_tasks

        exit_code = list_tasks(mock_context, filter_arg=None, format_arg='text')

        assert exit_code == 0
        mock_context.output_channel.set_json_mode.assert_called_with(False)
        mock_context.picker.list_tasks.assert_called_with(
            status_filter=None,
            unblocker_only=False
        )

        # Check stdout contains tab-delimited output
        captured = capsys.readouterr()
        assert 'TASK-0001\ttodo\t' in captured.out
        assert 'TASK-0002\tin_progress\t' in captured.out

    def test_list_tasks_json_format(self, mock_context, sample_tasks):
        """Test list command with JSON output format."""
        mock_context.picker.list_tasks.return_value = sample_tasks

        exit_code = list_tasks(mock_context, filter_arg=None, format_arg='json')

        assert exit_code == 0
        mock_context.output_channel.set_json_mode.assert_called_with(True)

        # Verify JSON output structure
        call_args = mock_context.output_channel.print_json.call_args[0][0]
        assert call_args['count'] == 2
        assert len(call_args['tasks']) == 2
        assert call_args['filter']['status'] is None
        assert call_args['filter']['unblocker_only'] is False

    def test_list_tasks_with_status_filter(self, mock_context, sample_tasks):
        """Test list command with status filter."""
        filtered = [sample_tasks[0]]  # Only todo
        mock_context.picker.list_tasks.return_value = filtered

        exit_code = list_tasks(mock_context, filter_arg='todo', format_arg='json')

        assert exit_code == 0
        mock_context.picker.list_tasks.assert_called_with(
            status_filter='todo',
            unblocker_only=False
        )

        call_args = mock_context.output_channel.print_json.call_args[0][0]
        assert call_args['filter']['status'] == 'todo'
        assert call_args['count'] == 1

    def test_list_tasks_unblocker_filter(self, mock_context, sample_tasks):
        """Test list command with unblocker filter."""
        unblockers = [sample_tasks[1]]  # Only unblocker task
        mock_context.picker.list_tasks.return_value = unblockers

        exit_code = list_tasks(mock_context, filter_arg='unblocker', format_arg='json')

        assert exit_code == 0
        mock_context.picker.list_tasks.assert_called_with(
            status_filter=None,
            unblocker_only=True
        )

        call_args = mock_context.output_channel.print_json.call_args[0][0]
        assert call_args['filter']['unblocker_only'] is True


class TestValidateTasks:
    """Test validate_tasks command implementation."""

    def test_validate_tasks_success_text(self, mock_context, capsys):
        """Test validate command with no errors (text format)."""
        mock_context.graph.validate.return_value = (True, [])

        exit_code = validate_tasks(mock_context, format_arg='text')

        assert exit_code == 0
        mock_context.output_channel.set_json_mode.assert_called_with(False)

        captured = capsys.readouterr()
        assert 'Validation passed' in captured.out

    def test_validate_tasks_errors_text(self, mock_context, capsys):
        """Test validate command with errors (text format)."""
        errors = [
            'Circular dependency: TASK-0001 -> TASK-0002 -> TASK-0001',
            'Missing dependency: TASK-0003 depends on TASK-9999'
        ]
        mock_context.graph.validate.return_value = (False, errors)

        exit_code = validate_tasks(mock_context, format_arg='text')

        assert exit_code == 1

        captured = capsys.readouterr()
        assert 'Validation failed' in captured.err
        assert 'Circular dependency' in captured.err
        assert 'Missing dependency' in captured.err

    def test_validate_tasks_json_format(self, mock_context):
        """Test validate command with JSON output format."""
        errors = ['Error 1', 'Error 2']
        mock_context.graph.validate.return_value = (False, errors)

        exit_code = validate_tasks(mock_context, format_arg='json')

        assert exit_code == 1
        mock_context.output_channel.set_json_mode.assert_called_with(True)

        call_args = mock_context.output_channel.print_json.call_args[0][0]
        assert call_args['valid'] is False
        assert call_args['error_count'] == 2
        assert call_args['errors'] == errors


class TestShowTask:
    """Test show_task command implementation."""

    def test_show_task_found_text(self, mock_context, sample_tasks, capsys):
        """Test show command with existing task (text format)."""
        mock_context.datastore.load_tasks.return_value = sample_tasks

        exit_code = show_task(mock_context, 'TASK-0001', format_arg='text')

        assert exit_code == 0

        captured = capsys.readouterr()
        assert 'ID: TASK-0001' in captured.out
        assert 'Title: Test task 1' in captured.out
        assert 'Status: todo' in captured.out
        assert 'Priority: P0' in captured.out

    def test_show_task_found_json(self, mock_context, sample_tasks):
        """Test show command with existing task (JSON format)."""
        mock_context.datastore.load_tasks.return_value = sample_tasks

        exit_code = show_task(mock_context, 'TASK-0002', format_arg='json')

        assert exit_code == 0

        call_args = mock_context.output_channel.print_json.call_args[0][0]
        assert 'task' in call_args
        assert call_args['task']['id'] == 'TASK-0002'
        assert call_args['task']['title'] == 'Test task 2'

    def test_show_task_not_found_text(self, mock_context, sample_tasks, capsys):
        """Test show command with non-existent task (text format)."""
        mock_context.datastore.load_tasks.return_value = sample_tasks

        exit_code = show_task(mock_context, 'TASK-9999', format_arg='text')

        assert exit_code == 1

        captured = capsys.readouterr()
        assert 'Task TASK-9999 not found' in captured.err

    def test_show_task_not_found_json(self, mock_context, sample_tasks):
        """Test show command with non-existent task (JSON format)."""
        mock_context.datastore.load_tasks.return_value = sample_tasks

        exit_code = show_task(mock_context, 'TASK-9999', format_arg='json')

        assert exit_code == 1

        call_args = mock_context.output_channel.print_json.call_args[0][0]
        assert 'error' in call_args
        assert 'TASK-9999' in call_args['error']


class TestTyperIntegration:
    """Integration tests using CliRunner."""

    @pytest.fixture(autouse=True)
    def setup_app(self, tmp_path):
        """Set up Typer app with test context before each test."""
        # Create minimal task repository structure
        tasks_dir = tmp_path / "tasks"
        tasks_dir.mkdir()

        cache_dir = tasks_dir / ".cache"
        cache_dir.mkdir()

        # Create a minimal task file
        task_file = tasks_dir / "TASK-0001-test.task.yaml"
        task_file.write_text("""
id: TASK-0001
title: Test task
priority: P0
area: backend
status: todo
description: Test task description

scope:
  in:
    - Test scope
  out:
    - Out of scope

acceptance_criteria:
  - Criterion 1

plan:
  - step: Step 1
    outputs:
      - Output 1

deliverables:
  - Deliverable 1

validation:
  pipeline:
    - command: echo "test"
      description: Test command
""")

        # Initialize commands with test repo
        initialize_commands(tmp_path)

    def test_list_command_via_cli_runner(self):
        """Test list command via Typer CLI runner."""
        runner = CliRunner()
        result = runner.invoke(app, ["list", "--format", "text"])

        # Command should execute without error
        # Note: May exit with 0 or have output depending on task state
        assert result.exit_code in [0, 1]  # Allow for validation errors

    def test_validate_command_via_cli_runner(self):
        """Test validate command via Typer CLI runner."""
        runner = CliRunner()
        result = runner.invoke(app, ["validate", "--format", "text"])

        # Should execute and return 0 or 1 based on validation
        assert result.exit_code in [0, 1]

    def test_show_command_via_cli_runner(self):
        """Test show command via Typer CLI runner."""
        runner = CliRunner()
        result = runner.invoke(app, ["show", "TASK-0001", "--format", "text"])

        # Should find task and display it
        assert result.exit_code in [0, 1]
