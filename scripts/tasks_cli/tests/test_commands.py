"""Tests for CLI command handlers."""

import pytest
import json
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
from tasks_cli.commands import (
    cmd_attach_evidence,
    cmd_list_evidence,
    cmd_attach_standard,
    cmd_add_exception,
    cmd_list_exceptions,
    cmd_resolve_exception,
    cmd_cleanup_exceptions,
    cmd_list_quarantined,
    cmd_release_quarantine,
    cmd_quarantine_task,
    EXIT_SUCCESS,
    EXIT_VALIDATION_ERROR,
    EXIT_IO_ERROR
)


@pytest.fixture
def mock_args():
    """Create mock args object."""
    args = Mock()
    args.task_id = "TASK-0001"
    args.format = "text"
    return args


@pytest.fixture
def mock_context_store():
    """Mock TaskContextStore."""
    with patch('tasks_cli.commands.TaskContextStore') as mock:
        yield mock


def test_cmd_attach_evidence_success(mock_args, mock_context_store):
    """Test successful evidence attachment."""
    from scripts.tasks_cli.context_store import EvidenceAttachment

    mock_args.task_id = "TASK-0001"
    mock_args.type = "file"
    mock_args.path = "test.py"
    mock_args.description = "Test file"
    mock_args.metadata = None

    # Mock context store instance
    mock_instance = Mock()
    mock_evidence = EvidenceAttachment(
        id="abc123",
        type="file",
        path="test.py",
        description="Test file",
        sha256="abc" * 16,
        size=100,
        created_at="2025-01-01T00:00:00Z"
    )
    mock_instance.attach_evidence.return_value = mock_evidence
    mock_context_store.return_value = mock_instance

    # Mock output
    with patch('tasks_cli.commands.is_json_mode', return_value=False):
        with patch('builtins.print'):
            exit_code = cmd_attach_evidence(mock_args)

    assert exit_code == EXIT_SUCCESS
    mock_instance.attach_evidence.assert_called_once()


def test_cmd_attach_evidence_invalid_metadata(mock_args, mock_context_store):
    """Test evidence attachment with invalid metadata JSON."""
    mock_args.type = "file"
    mock_args.path = "test.py"
    mock_args.description = "Test"
    mock_args.metadata = "{invalid json"

    with patch('tasks_cli.commands.print_error') as mock_print_error:
        # print_error calls sys.exit, so we need to catch it
        mock_print_error.side_effect = SystemExit(EXIT_VALIDATION_ERROR)

        with pytest.raises(SystemExit):
            cmd_attach_evidence(mock_args)


def test_cmd_attach_evidence_file_not_found(mock_args, mock_context_store):
    """Test evidence attachment when file doesn't exist."""
    mock_args.type = "file"
    mock_args.path = "nonexistent.py"
    mock_args.description = "Test"
    mock_args.metadata = None

    mock_instance = Mock()
    mock_instance.attach_evidence.side_effect = FileNotFoundError("File not found")
    mock_context_store.return_value = mock_instance

    with patch('tasks_cli.commands.print_error') as mock_print_error:
        mock_print_error.side_effect = SystemExit(EXIT_IO_ERROR)

        with pytest.raises(SystemExit):
            cmd_attach_evidence(mock_args)


def test_cmd_list_evidence_success(mock_args, mock_context_store):
    """Test listing evidence."""
    from scripts.tasks_cli.context_store import EvidenceAttachment

    mock_args.task_id = "TASK-0001"
    mock_instance = Mock()
    mock_evidence = EvidenceAttachment(
        id="abc123",
        type="file",
        path="test.py",
        description="Test",
        sha256="abc" * 16,
        size=100,
        created_at="2025-01-01T00:00:00Z"
    )
    mock_instance.list_evidence.return_value = [mock_evidence]
    mock_context_store.return_value = mock_instance

    with patch('tasks_cli.commands.is_json_mode', return_value=False):
        with patch('builtins.print'):
            exit_code = cmd_list_evidence(mock_args)

    assert exit_code == EXIT_SUCCESS


def test_cmd_list_evidence_empty(mock_args, mock_context_store):
    """Test listing evidence when none exist."""
    mock_instance = Mock()
    mock_instance.list_evidence.return_value = []
    mock_context_store.return_value = mock_instance

    with patch('tasks_cli.commands.is_json_mode', return_value=False):
        with patch('builtins.print'):
            exit_code = cmd_list_evidence(mock_args)

    assert exit_code == EXIT_SUCCESS


def test_cmd_list_evidence_json_mode(mock_args, mock_context_store):
    """Test listing evidence in JSON mode."""
    from scripts.tasks_cli.context_store import EvidenceAttachment

    mock_args.task_id = "TASK-0001"
    mock_instance = Mock()
    mock_evidence = EvidenceAttachment(
        id="abc123",
        type="file",
        path="test.py",
        description="Test",
        sha256="abc" * 16,
        size=100,
        created_at="2025-01-01T00:00:00Z"
    )
    mock_instance.list_evidence.return_value = [mock_evidence]
    mock_context_store.return_value = mock_instance

    with patch('tasks_cli.commands.is_json_mode', return_value=True):
        with patch('tasks_cli.commands.print_success') as mock_print:
            exit_code = cmd_list_evidence(mock_args)

    assert exit_code == EXIT_SUCCESS
    mock_print.assert_called_once()
    call_args = mock_print.call_args[0][0]
    assert "evidence" in call_args
    assert "count" in call_args
    assert call_args["count"] == 1


def test_cmd_attach_standard_success(mock_args, mock_context_store):
    """Test attaching standards excerpt."""
    from scripts.tasks_cli.context_store import StandardsExcerpt

    mock_args.task_id = "TASK-0001"
    mock_args.file = "standards/backend-tier.md"
    mock_args.section = "Handler Constraints"

    mock_instance = Mock()
    mock_excerpt = StandardsExcerpt(
        excerpt_id="abc123",
        file="standards/backend-tier.md",
        section="Handler Constraints",
        requirement="Test requirement",
        line_span=(100, 150),
        content_sha256="abc" * 16
    )
    mock_instance.extract_standards_excerpt.return_value = mock_excerpt
    mock_context_store.return_value = mock_instance

    with patch('tasks_cli.commands.is_json_mode', return_value=False):
        with patch('builtins.print'):
            exit_code = cmd_attach_standard(mock_args)

    assert exit_code == EXIT_SUCCESS


def test_cmd_attach_standard_file_not_found(mock_args, mock_context_store):
    """Test attaching standards excerpt when file doesn't exist."""
    mock_args.file = "standards/nonexistent.md"
    mock_args.section = "Section"

    mock_instance = Mock()
    mock_instance.extract_standards_excerpt.side_effect = FileNotFoundError()
    mock_context_store.return_value = mock_instance

    with patch('tasks_cli.commands.print_error') as mock_print_error:
        mock_print_error.side_effect = SystemExit(EXIT_IO_ERROR)

        with pytest.raises(SystemExit):
            cmd_attach_standard(mock_args)


def test_cmd_attach_standard_section_not_found(mock_args, mock_context_store):
    """Test attaching standards excerpt when section doesn't exist."""
    mock_args.file = "standards/backend-tier.md"
    mock_args.section = "Nonexistent Section"

    mock_instance = Mock()
    mock_instance.extract_standards_excerpt.side_effect = ValueError("Section not found")
    mock_context_store.return_value = mock_instance

    with patch('tasks_cli.commands.print_error') as mock_print_error:
        mock_print_error.side_effect = SystemExit(EXIT_VALIDATION_ERROR)

        with pytest.raises(SystemExit):
            cmd_attach_standard(mock_args)


def test_cmd_add_exception_success(mock_args):
    """Test adding exception to ledger."""
    mock_args.exception_type = "malformed_yaml"
    mock_args.message = "Parse error"
    mock_args.owner = "maintainer"

    with patch('tasks_cli.commands.add_exception') as mock_add:
        with patch('tasks_cli.commands.is_json_mode', return_value=False):
            with patch('builtins.print'):
                exit_code = cmd_add_exception(mock_args)

    assert exit_code == EXIT_SUCCESS
    mock_add.assert_called_once()


def test_cmd_add_exception_json_mode(mock_args):
    """Test adding exception in JSON mode."""
    mock_args.exception_type = "malformed_yaml"
    mock_args.message = "Parse error"
    mock_args.owner = "maintainer"

    with patch('tasks_cli.commands.add_exception'):
        with patch('tasks_cli.commands.is_json_mode', return_value=True):
            with patch('tasks_cli.commands.print_success') as mock_print:
                exit_code = cmd_add_exception(mock_args)

    assert exit_code == EXIT_SUCCESS
    mock_print.assert_called_once()


def test_cmd_list_exceptions_success(mock_args):
    """Test listing exceptions."""
    mock_args.status = None

    from tasks_cli.models import ExceptionLedgerEntry, RemediationStatus

    exc = ExceptionLedgerEntry(
        task_id="TASK-0001",
        exception_type="malformed_yaml",
        detected_at="2025-11-18T10:00:00Z",
        remediation=RemediationStatus(
            owner="system",
            status="open",
            deadline="2025-12-18"
        ),
        parse_error="Invalid YAML"
    )

    with patch('tasks_cli.commands.list_exceptions', return_value=[exc]):
        with patch('tasks_cli.commands.is_json_mode', return_value=False):
            with patch('builtins.print'):
                exit_code = cmd_list_exceptions(mock_args)

    assert exit_code == EXIT_SUCCESS


def test_cmd_list_exceptions_with_filter(mock_args):
    """Test listing exceptions with status filter."""
    mock_args.status = "open"

    from tasks_cli.models import ExceptionLedgerEntry, RemediationStatus

    exc = ExceptionLedgerEntry(
        task_id="TASK-0001",
        exception_type="malformed_yaml",
        detected_at="2025-11-18T10:00:00Z",
        remediation=RemediationStatus(
            owner="system",
            status="open",
            deadline="2025-12-18"
        )
    )

    with patch('tasks_cli.commands.list_exceptions', return_value=[exc]):
        with patch('tasks_cli.commands.is_json_mode', return_value=False):
            with patch('builtins.print'):
                exit_code = cmd_list_exceptions(mock_args)

    assert exit_code == EXIT_SUCCESS


def test_cmd_resolve_exception_success(mock_args):
    """Test resolving exception."""
    mock_args.notes = "Fixed YAML"

    with patch('tasks_cli.commands.resolve_exception') as mock_resolve:
        with patch('tasks_cli.commands.is_json_mode', return_value=False):
            with patch('builtins.print'):
                exit_code = cmd_resolve_exception(mock_args)

    assert exit_code == EXIT_SUCCESS
    mock_resolve.assert_called_once_with(task_id="TASK-0001", notes="Fixed YAML")


def test_cmd_resolve_exception_not_found(mock_args):
    """Test resolving exception that doesn't exist."""
    mock_args.notes = "Fixed"

    with patch('tasks_cli.commands.resolve_exception') as mock_resolve:
        mock_resolve.side_effect = ValueError("Task not found")

        with patch('tasks_cli.commands.print_error') as mock_print_error:
            mock_print_error.side_effect = SystemExit(EXIT_VALIDATION_ERROR)

            with pytest.raises(SystemExit):
                cmd_resolve_exception(mock_args)


def test_cmd_cleanup_exceptions_success(mock_args):
    """Test cleanup exceptions."""
    mock_args.trigger = "task_completion"

    with patch('tasks_cli.commands.cleanup_exception') as mock_cleanup:
        with patch('tasks_cli.commands.is_json_mode', return_value=False):
            with patch('builtins.print'):
                exit_code = cmd_cleanup_exceptions(mock_args)

    assert exit_code == EXIT_SUCCESS
    mock_cleanup.assert_called_once_with(task_id="TASK-0001", trigger="task_completion")


def test_cmd_cleanup_exceptions_default_trigger(mock_args):
    """Test cleanup exceptions with default trigger."""
    # No trigger attribute
    if hasattr(mock_args, 'trigger'):
        delattr(mock_args, 'trigger')

    with patch('tasks_cli.commands.cleanup_exception') as mock_cleanup:
        with patch('tasks_cli.commands.is_json_mode', return_value=False):
            with patch('builtins.print'):
                exit_code = cmd_cleanup_exceptions(mock_args)

    assert exit_code == EXIT_SUCCESS
    mock_cleanup.assert_called_once_with(task_id="TASK-0001", trigger="manual")


def test_cmd_list_quarantined_success(mock_args):
    """Test listing quarantined tasks."""
    mock_args.status = None

    from tasks_cli.models import QuarantineEntry

    quarantined = [
        QuarantineEntry(
            task_id="TASK-0001",
            reason="malformed_yaml",
            original_path="tasks/TASK-0001.task.yaml",
            error_details="Cannot parse",
            quarantined_at="2025-11-18T10:00:00Z",
            auto_repair_attempted=False,
            repair_status="pending"
        )
    ]

    with patch('tasks_cli.commands.list_quarantined', return_value=quarantined):
        with patch('tasks_cli.commands.is_json_mode', return_value=False):
            with patch('builtins.print'):
                exit_code = cmd_list_quarantined(mock_args)

    assert exit_code == EXIT_SUCCESS


def test_cmd_list_quarantined_json_mode(mock_args):
    """Test listing quarantined tasks in JSON mode."""
    mock_args.status = None

    from tasks_cli.models import QuarantineEntry

    quarantined = [
        QuarantineEntry(
            task_id="TASK-0001",
            reason="malformed_yaml",
            original_path="tasks/TASK-0001.task.yaml",
            error_details="Cannot parse",
            quarantined_at="2025-11-18T10:00:00Z",
            auto_repair_attempted=False,
            repair_status="pending"
        )
    ]

    with patch('tasks_cli.commands.list_quarantined', return_value=quarantined):
        with patch('tasks_cli.commands.is_json_mode', return_value=True):
            with patch('tasks_cli.commands.print_success') as mock_print:
                exit_code = cmd_list_quarantined(mock_args)

    assert exit_code == EXIT_SUCCESS
    mock_print.assert_called_once()
    call_args = mock_print.call_args[0][0]
    assert "quarantined" in call_args
    assert "count" in call_args


def test_cmd_release_quarantine_success(mock_args):
    """Test releasing task from quarantine."""
    with patch('tasks_cli.commands.release_from_quarantine') as mock_release:
        with patch('tasks_cli.commands.is_json_mode', return_value=False):
            with patch('builtins.print'):
                exit_code = cmd_release_quarantine(mock_args)

    assert exit_code == EXIT_SUCCESS
    mock_release.assert_called_once_with(task_id="TASK-0001")


def test_cmd_release_quarantine_not_found(mock_args):
    """Test releasing task that isn't quarantined."""
    with patch('tasks_cli.commands.release_from_quarantine') as mock_release:
        mock_release.side_effect = FileNotFoundError("Not quarantined")

        with patch('tasks_cli.commands.print_error') as mock_print_error:
            mock_print_error.side_effect = SystemExit(EXIT_IO_ERROR)

            with pytest.raises(SystemExit):
                cmd_release_quarantine(mock_args)


def test_cmd_quarantine_task_success(mock_args):
    """Test quarantining a task."""
    mock_args.reason = "malformed_yaml"
    mock_args.error_details = "Parse error details"

    with patch('tasks_cli.commands.Path') as mock_path:
        mock_path.cwd.return_value = Path("/repo")

        with patch('tasks_cli.commands.quarantine_task') as mock_quarantine:
            mock_quarantine.return_value = Path("/repo/docs/compliance/quarantine/TASK-0001.quarantine.json")

            with patch('tasks_cli.commands.is_json_mode', return_value=False):
                with patch('builtins.print'):
                    exit_code = cmd_quarantine_task(mock_args)

    assert exit_code == EXIT_SUCCESS


def test_cmd_quarantine_task_validation_error(mock_args):
    """Test quarantining with invalid input."""
    mock_args.reason = "invalid_reason"
    mock_args.error_details = None

    with patch('tasks_cli.commands.Path') as mock_path:
        mock_path.cwd.return_value = Path("/repo")

        with patch('tasks_cli.commands.quarantine_task') as mock_quarantine:
            mock_quarantine.side_effect = ValueError("Invalid reason")

            with patch('tasks_cli.commands.print_error') as mock_print_error:
                mock_print_error.side_effect = SystemExit(EXIT_VALIDATION_ERROR)

                with pytest.raises(SystemExit):
                    cmd_quarantine_task(mock_args)


def test_cmd_attach_evidence_with_metadata(mock_args, mock_context_store):
    """Test evidence attachment with metadata."""
    from scripts.tasks_cli.context_store import EvidenceAttachment

    mock_args.task_id = "TASK-0001"
    mock_args.type = "qa_output"
    mock_args.path = "qa.log"
    mock_args.description = "QA output"
    mock_args.metadata = '{"command": "pnpm test", "exit_code": 0}'

    mock_instance = Mock()
    mock_evidence = EvidenceAttachment(
        id="abc123",
        type="qa_output",
        path="qa.log",
        description="QA output",
        sha256="abc" * 16,
        size=100,
        created_at="2025-01-01T00:00:00Z"
    )
    mock_instance.attach_evidence.return_value = mock_evidence
    mock_context_store.return_value = mock_instance

    with patch('tasks_cli.commands.is_json_mode', return_value=False):
        with patch('builtins.print'):
            exit_code = cmd_attach_evidence(mock_args)

    assert exit_code == EXIT_SUCCESS
    # Verify metadata was parsed and passed
    call_args = mock_instance.attach_evidence.call_args
    assert call_args[1]['metadata'] == {"command": "pnpm test", "exit_code": 0}


def test_error_recovery_actions():
    """Test that error responses include recovery actions."""
    mock_args = Mock()
    mock_args.task_id = "TASK-001"
    mock_args.type = "file"
    mock_args.path = "missing.txt"
    mock_args.description = "Test"
    mock_args.metadata = None

    with patch('tasks_cli.commands.TaskContextStore') as mock_store:
        mock_instance = Mock()
        mock_instance.attach_evidence.side_effect = FileNotFoundError("File not found")
        mock_store.return_value = mock_instance

        with patch('tasks_cli.commands.print_error') as mock_print_error:
            mock_print_error.side_effect = SystemExit(EXIT_IO_ERROR)

            with pytest.raises(SystemExit):
                cmd_attach_evidence(mock_args)

            # Verify error structure includes recovery action
            error_dict = mock_print_error.call_args[0][0]
            assert "recovery_action" in error_dict
            assert error_dict["recovery_action"] == "Verify file path exists"


# ============================================================================
# Regression Tests for Code Review Fixes
# ============================================================================
#
# Note: Issue #2 (cmd_record_qa duration_ms metadata) is verified by code
# inspection at scripts/tasks_cli/commands.py:1080-1084. The fix adds
# duration_ms to the metadata dict passed to attach_evidence.
#
# Issue #3 and #4 regression tests are in test_metrics.py
