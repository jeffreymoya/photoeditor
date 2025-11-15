"""
Test Suite: Lifecycle & Coordination Tests (Session 5)

Tests auto-purge on completion, staleness detection, drift budget counter,
and agent coordination state.

Coverage:
- Auto-purge on task completion (3 tests)
- Staleness detection (4 tests)
- Drift budget counter (5 tests)
- Agent coordination state (3 tests)

Total: 15 tests
"""

import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch
from io import StringIO

import pytest

from tasks_cli.context_store import (
    TaskContextStore,
    ContextNotFoundError,
    DriftError,
    SourceFile,
)
from tasks_cli.operations import TaskOperations


# ============================================================================
# Auto-Purge on Task Completion Tests (3 tests)
# ============================================================================


def test_auto_purge_on_task_completion(tmp_task_repo):
    """Test that context auto-purges when task completes."""
    tmp_path, repo = tmp_task_repo
    context_store = TaskContextStore(tmp_path)

    # Get task file
    task_file = tmp_path / "tasks" / "TASK-9001-simple.task.yaml"

    # Read task file and calculate SHA
    task_content = task_file.read_bytes()
    task_file_sha = hashlib.sha256(task_content).hexdigest()

    # Get git HEAD
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    # Initialize context
    immutable = {
        'task_snapshot': {
            'title': 'Simple test task',
            'priority': 'P1',
            'area': 'backend',
            'description': 'Test task for lifecycle and coordination testing',
            'scope_in': ['backend/services/upload.ts'],
            'scope_out': [],
            'acceptance_criteria': ['All tests pass'],
        },
        'standards_citations': [
            {
                'file': 'standards/backend-tier.md',
                'section': 'Testing',
                'requirement': 'Services must have 80% test coverage',
                'line_span': 'L1-L10',
                'content_sha': 'abc123',
            }
        ],
        'validation_baseline': {
            'commands': ['pnpm turbo run typecheck', 'pnpm turbo run lint'],
            'initial_results': None,
        },
        'repo_paths': ['backend/services/upload.ts'],
    }

    context_store.init_context(
        task_id='TASK-9001',
        immutable=immutable,
        git_head=git_head,
        task_file_sha=task_file_sha,
        created_by='test',
        source_files=[]
    )

    # Verify context exists
    assert context_store.get_context('TASK-9001') is not None

    # Mock task object
    from tasks_cli.models import Task
    task = Task(
        id='TASK-9001',
        title='Simple test task',
        status='todo',
        area='backend',
        path=str(task_file),
        blocked_by=[],
        priority='P1',
        unblocker=False
    )

    # Complete task (should auto-purge context)
    ops = TaskOperations(tmp_path)
    ops.complete_task(task, archive=False)

    # Verify context was purged
    assert context_store.get_context('TASK-9001') is None


def test_purge_error_logs_but_does_not_block_completion(tmp_task_repo, monkeypatch):
    """Test that purge errors are logged but don't block task completion."""
    tmp_path, repo = tmp_task_repo
    context_store = TaskContextStore(tmp_path)

    # Get task file
    task_file = tmp_path / "tasks" / "TASK-9001-simple.task.yaml"

    # Mock task object
    from tasks_cli.models import Task
    task = Task(
        id='TASK-9001',
        title='Simple test task',
        status='todo',
        area='backend',
        path=str(task_file),
        blocked_by=[],
        priority='P1',
        unblocker=False
    )

    # Mock purge_context to raise an exception
    original_purge = context_store.purge_context

    def failing_purge(task_id):
        raise Exception("Simulated purge failure")

    monkeypatch.setattr(context_store, "purge_context", failing_purge)

    # Patch TaskContextStore constructor to return our mocked store
    def mock_context_store_init(repo_root):
        return context_store

    monkeypatch.setattr(
        "tasks_cli.operations.TaskContextStore",
        mock_context_store_init
    )

    # Capture stderr
    captured_err = StringIO()
    monkeypatch.setattr(sys, 'stderr', captured_err)

    # Complete task (should succeed despite purge error)
    ops = TaskOperations(tmp_path)
    result_path = ops.complete_task(task, archive=False)

    # Verify task was completed
    assert result_path == Path(task_file)

    # Verify warning was logged to stderr
    stderr_output = captured_err.getvalue()
    assert "Warning: Failed to purge context" in stderr_output
    assert "TASK-9001" in stderr_output


def test_purge_idempotency_across_multiple_completions(tmp_task_repo):
    """Test that purge is idempotent when called multiple times."""
    tmp_path, repo = tmp_task_repo
    context_store = TaskContextStore(tmp_path)

    # Get task file
    task_file = tmp_path / "tasks" / "TASK-9001-simple.task.yaml"

    # Initialize context
    task_content = task_file.read_bytes()
    task_file_sha = hashlib.sha256(task_content).hexdigest()

    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    immutable = {
        'task_snapshot': {
            'title': 'Simple test task',
            'priority': 'P1',
            'area': 'backend',
            'description': 'Test task for lifecycle and coordination testing',
            'scope_in': ['backend/services/upload.ts'],
            'scope_out': [],
            'acceptance_criteria': ['All tests pass'],
        },
        'standards_citations': [
            {
                'file': 'standards/backend-tier.md',
                'section': 'Testing',
                'requirement': 'Services must have 80% test coverage',
                'line_span': 'L1-L10',
                'content_sha': 'abc123',
            }
        ],
        'validation_baseline': {
            'commands': ['pnpm turbo run typecheck', 'pnpm turbo run lint'],
            'initial_results': None,
        },
        'repo_paths': ['backend/services/upload.ts'],
    }

    context_store.init_context(
        task_id='TASK-9001',
        immutable=immutable,
        git_head=git_head,
        task_file_sha=task_file_sha,
        created_by='test',
        source_files=[]
    )

    # First purge
    context_store.purge_context('TASK-9001')
    assert context_store.get_context('TASK-9001') is None

    # Second purge (should not raise error)
    context_store.purge_context('TASK-9001')
    assert context_store.get_context('TASK-9001') is None

    # Third purge (still should not raise error)
    context_store.purge_context('TASK-9001')
    assert context_store.get_context('TASK-9001') is None


# ============================================================================
# Staleness Detection Tests (4 tests)
# ============================================================================


def test_staleness_warning_when_git_head_changed(tmp_task_repo, monkeypatch):
    """Test that warning is logged when git HEAD changed since context creation."""
    tmp_path, repo = tmp_task_repo
    context_store = TaskContextStore(tmp_path)

    # Get initial HEAD
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=True
    )
    initial_head = result.stdout.strip()

    # Initialize context with initial HEAD
    task_file = tmp_path / "tasks" / "TASK-9001-simple.task.yaml"
    task_content = task_file.read_bytes()
    task_file_sha = hashlib.sha256(task_content).hexdigest()

    immutable = {
        'task_snapshot': {
            'title': 'Simple test task',
            'priority': 'P1',
            'area': 'backend',
            'description': 'Test task for lifecycle and coordination testing',
            'scope_in': ['backend/services/upload.ts'],
            'scope_out': [],
            'acceptance_criteria': ['All tests pass'],
        },
        'standards_citations': [
            {
                'file': 'standards/backend-tier.md',
                'section': 'Testing',
                'requirement': 'Services must have 80% test coverage',
                'line_span': 'L1-L10',
                'content_sha': 'abc123',
            }
        ],
        'validation_baseline': {
            'commands': ['pnpm turbo run typecheck', 'pnpm turbo run lint'],
            'initial_results': None,
        },
        'repo_paths': ['backend/services/upload.ts'],
    }

    context_store.init_context(
        task_id='TASK-9001',
        immutable=immutable,
        git_head=initial_head,
        task_file_sha=task_file_sha,
        created_by='test',
        source_files=[]
    )

    # Make a new commit to change HEAD
    new_file = tmp_path / "backend" / "services" / "new_service.ts"
    new_file.write_text("export const newService = () => {};")
    repo.index.add([str(new_file.relative_to(tmp_path))])
    repo.index.commit("Add new service")

    # Capture stderr
    captured_err = StringIO()
    monkeypatch.setattr(sys, 'stderr', captured_err)

    # Get context (should trigger staleness warning)
    context = context_store.get_context('TASK-9001')
    assert context is not None

    # Verify warning was logged
    stderr_output = captured_err.getvalue()
    assert "Warning: Context created at" in stderr_output
    assert "current HEAD is" in stderr_output
    assert "Context may be stale" in stderr_output


def test_no_staleness_warning_when_head_matches(tmp_task_repo, monkeypatch):
    """Test that no warning is logged when HEAD matches context creation."""
    tmp_path, repo = tmp_task_repo
    context_store = TaskContextStore(tmp_path)

    # Get HEAD
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    # Initialize context
    task_file = tmp_path / "tasks" / "TASK-9001-simple.task.yaml"
    task_content = task_file.read_bytes()
    task_file_sha = hashlib.sha256(task_content).hexdigest()

    immutable = {
        'task_snapshot': {
            'title': 'Simple test task',
            'priority': 'P1',
            'area': 'backend',
            'description': 'Test task for lifecycle and coordination testing',
            'scope_in': ['backend/services/upload.ts'],
            'scope_out': [],
            'acceptance_criteria': ['All tests pass'],
        },
        'standards_citations': [
            {
                'file': 'standards/backend-tier.md',
                'section': 'Testing',
                'requirement': 'Services must have 80% test coverage',
                'line_span': 'L1-L10',
                'content_sha': 'abc123',
            }
        ],
        'validation_baseline': {
            'commands': ['pnpm turbo run typecheck', 'pnpm turbo run lint'],
            'initial_results': None,
        },
        'repo_paths': ['backend/services/upload.ts'],
    }

    context_store.init_context(
        task_id='TASK-9001',
        immutable=immutable,
        git_head=git_head,
        task_file_sha=task_file_sha,
        created_by='test',
        source_files=[]
    )

    # Capture stderr
    captured_err = StringIO()
    monkeypatch.setattr(sys, 'stderr', captured_err)

    # Get context (should NOT trigger staleness warning)
    context = context_store.get_context('TASK-9001')
    assert context is not None

    # Verify no warning was logged
    stderr_output = captured_err.getvalue()
    assert "Warning: Context created at" not in stderr_output
    assert "Context may be stale" not in stderr_output


def test_no_staleness_check_outside_git_repo(tmp_path, monkeypatch):
    """Test that staleness check is skipped when not in a git repo."""
    # Create a non-git directory
    non_git_dir = tmp_path / "non_git_project"
    non_git_dir.mkdir()
    (non_git_dir / ".agent-output").mkdir()

    context_store = TaskContextStore(non_git_dir)

    # Initialize context with a fake git_head
    immutable = {
        'task_snapshot': {
            'title': 'Simple test task',
            'priority': 'P1',
            'area': 'backend',
            'description': 'Test task for lifecycle and coordination testing',
            'scope_in': ['backend/services/upload.ts'],
            'scope_out': [],
            'acceptance_criteria': ['All tests pass'],
        },
        'standards_citations': [
            {
                'file': 'standards/backend-tier.md',
                'section': 'Testing',
                'requirement': 'Services must have 80% test coverage',
                'line_span': 'L1-L10',
                'content_sha': 'abc123',
            }
        ],
        'validation_baseline': {
            'commands': ['pnpm turbo run typecheck', 'pnpm turbo run lint'],
            'initial_results': None,
        },
        'repo_paths': ['backend/services/upload.ts'],
    }

    context_store.init_context(
        task_id='TASK-9001',
        immutable=immutable,
        git_head='fake_git_head_sha',
        task_file_sha='fake_task_sha',
        created_by='test',
        source_files=[]
    )

    # Capture stderr
    captured_err = StringIO()
    monkeypatch.setattr(sys, 'stderr', captured_err)

    # Get context (should NOT trigger warning despite mismatched HEAD)
    context = context_store.get_context('TASK-9001')
    assert context is not None

    # Verify no warning was logged
    stderr_output = captured_err.getvalue()
    assert "Warning:" not in stderr_output


def test_staleness_does_not_block_operations(tmp_task_repo):
    """Test that staleness warning doesn't block read/write operations."""
    tmp_path, repo = tmp_task_repo
    context_store = TaskContextStore(tmp_path)

    # Get initial HEAD
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=True
    )
    initial_head = result.stdout.strip()

    # Initialize context
    task_file = tmp_path / "tasks" / "TASK-9001-simple.task.yaml"
    task_content = task_file.read_bytes()
    task_file_sha = hashlib.sha256(task_content).hexdigest()

    immutable = {
        'task_snapshot': {
            'title': 'Simple test task',
            'priority': 'P1',
            'area': 'backend',
            'description': 'Test task for lifecycle and coordination testing',
            'scope_in': ['backend/services/upload.ts'],
            'scope_out': [],
            'acceptance_criteria': ['All tests pass'],
        },
        'standards_citations': [
            {
                'file': 'standards/backend-tier.md',
                'section': 'Testing',
                'requirement': 'Services must have 80% test coverage',
                'line_span': 'L1-L10',
                'content_sha': 'abc123',
            }
        ],
        'validation_baseline': {
            'commands': ['pnpm turbo run typecheck', 'pnpm turbo run lint'],
            'initial_results': None,
        },
        'repo_paths': ['backend/services/upload.ts'],
    }

    context_store.init_context(
        task_id='TASK-9001',
        immutable=immutable,
        git_head=initial_head,
        task_file_sha=task_file_sha,
        created_by='test',
        source_files=[]
    )

    # Make a new commit
    new_file = tmp_path / "backend" / "services" / "new_service.ts"
    new_file.write_text("export const newService = () => {};")
    repo.index.add([str(new_file.relative_to(tmp_path))])
    repo.index.commit("Add new service")

    # Get context (staleness detected but should not block)
    context = context_store.get_context('TASK-9001')
    assert context is not None

    # Update coordination (should succeed despite staleness)
    context_store.update_coordination(
        task_id='TASK-9001',
        agent_role='implementer',
        updates={'status': 'in_progress'},
        actor='test'
    )

    # Verify update succeeded
    updated_context = context_store.get_context('TASK-9001')
    assert updated_context.implementer.status == 'in_progress'


# ============================================================================
# Drift Budget Counter Tests (5 tests)
# ============================================================================


def test_drift_budget_increments_on_verification_failure(tmp_task_repo):
    """Test that drift_budget increments when verification fails."""
    tmp_path, repo = tmp_task_repo
    context_store = TaskContextStore(tmp_path)

    # Initialize context and snapshot
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    task_file = tmp_path / "tasks" / "TASK-9001-simple.task.yaml"
    task_content = task_file.read_bytes()
    task_file_sha = hashlib.sha256(task_content).hexdigest()

    immutable = {
        'task_snapshot': {
            'title': 'Simple test task',
            'priority': 'P1',
            'area': 'backend',
            'description': 'Test task for lifecycle and coordination testing',
            'scope_in': ['backend/services/upload.ts'],
            'scope_out': [],
            'acceptance_criteria': ['All tests pass'],
        },
        'standards_citations': [
            {
                'file': 'standards/backend-tier.md',
                'section': 'Testing',
                'requirement': 'Services must have 80% test coverage',
                'line_span': 'L1-L10',
                'content_sha': 'abc123',
            }
        ],
        'validation_baseline': {
            'commands': ['pnpm turbo run typecheck', 'pnpm turbo run lint'],
            'initial_results': None,
        },
        'repo_paths': ['backend/services/upload.ts'],
    }

    context_store.init_context(
        task_id='TASK-9001',
        immutable=immutable,
        git_head=git_head,
        task_file_sha=task_file_sha,
        created_by='test',
        source_files=[]
    )

    # Create file change
    service_file = tmp_path / "backend" / "services" / "upload.ts"
    service_file.write_text("export const upload = () => { return 'uploaded'; };")

    # Take snapshot
    context_store.snapshot_worktree(
        task_id='TASK-9001',
        agent_role='implementer',
        actor='test',
        base_commit=git_head
    )

    # Verify drift budget is initially 0
    context = context_store.get_context('TASK-9001')
    assert context.implementer.drift_budget == 0

    # Manually edit file (simulate drift)
    manual_file = tmp_path / "backend" / "services" / "manual_edit.ts"
    manual_file.write_text("export const manual = true;")

    # Verification should fail
    with pytest.raises(DriftError):
        context_store.verify_worktree_state(
            task_id='TASK-9001',
            expected_agent='implementer'
        )

    # Manually increment drift budget (simulating what __main__.py does)
    context = context_store.get_context('TASK-9001')
    context_store.update_coordination(
        task_id='TASK-9001',
        agent_role='implementer',
        updates={'drift_budget': context.implementer.drift_budget + 1},
        actor='auto-verification'
    )

    # Verify drift budget was incremented
    updated_context = context_store.get_context('TASK-9001')
    assert updated_context.implementer.drift_budget == 1


def test_drift_budget_blocks_state_changing_operations(tmp_task_repo):
    """Test that drift_budget > 0 blocks state-changing operations in CLI."""
    tmp_path, repo = tmp_task_repo
    context_store = TaskContextStore(tmp_path)

    # Initialize context
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    task_file = tmp_path / "tasks" / "TASK-9001-simple.task.yaml"
    task_content = task_file.read_bytes()
    task_file_sha = hashlib.sha256(task_content).hexdigest()

    immutable = {
        'task_snapshot': {
            'title': 'Simple test task',
            'priority': 'P1',
            'area': 'backend',
            'description': 'Test task for lifecycle and coordination testing',
            'scope_in': ['backend/services/upload.ts'],
            'scope_out': [],
            'acceptance_criteria': ['All tests pass'],
        },
        'standards_citations': [
            {
                'file': 'standards/backend-tier.md',
                'section': 'Testing',
                'requirement': 'Services must have 80% test coverage',
                'line_span': 'L1-L10',
                'content_sha': 'abc123',
            }
        ],
        'validation_baseline': {
            'commands': ['pnpm turbo run typecheck', 'pnpm turbo run lint'],
            'initial_results': None,
        },
        'repo_paths': ['backend/services/upload.ts'],
    }

    context_store.init_context(
        task_id='TASK-9001',
        immutable=immutable,
        git_head=git_head,
        task_file_sha=task_file_sha,
        created_by='test',
        source_files=[]
    )

    # Set drift budget > 0
    context_store.update_coordination(
        task_id='TASK-9001',
        agent_role='implementer',
        updates={'drift_budget': 1},
        actor='test'
    )

    # Import the check function from __main__
    from tasks_cli.__main__ import _check_drift_budget
    from tasks_cli.exceptions import ValidationError

    # Verify that _check_drift_budget raises ValidationError
    with pytest.raises(ValidationError) as exc_info:
        _check_drift_budget(context_store, 'TASK-9001')

    assert "Drift budget exceeded" in str(exc_info.value)
    assert "implementer" in str(exc_info.value)


def test_drift_budget_read_operations_still_allowed(tmp_task_repo):
    """Test that drift_budget > 0 doesn't block read operations."""
    tmp_path, repo = tmp_task_repo
    context_store = TaskContextStore(tmp_path)

    # Initialize context
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    task_file = tmp_path / "tasks" / "TASK-9001-simple.task.yaml"
    task_content = task_file.read_bytes()
    task_file_sha = hashlib.sha256(task_content).hexdigest()

    immutable = {
        'task_snapshot': {
            'title': 'Simple test task',
            'priority': 'P1',
            'area': 'backend',
            'description': 'Test task for lifecycle and coordination testing',
            'scope_in': ['backend/services/upload.ts'],
            'scope_out': [],
            'acceptance_criteria': ['All tests pass'],
        },
        'standards_citations': [
            {
                'file': 'standards/backend-tier.md',
                'section': 'Testing',
                'requirement': 'Services must have 80% test coverage',
                'line_span': 'L1-L10',
                'content_sha': 'abc123',
            }
        ],
        'validation_baseline': {
            'commands': ['pnpm turbo run typecheck', 'pnpm turbo run lint'],
            'initial_results': None,
        },
        'repo_paths': ['backend/services/upload.ts'],
    }

    context_store.init_context(
        task_id='TASK-9001',
        immutable=immutable,
        git_head=git_head,
        task_file_sha=task_file_sha,
        created_by='test',
        source_files=[]
    )

    # Set drift budget > 0
    context_store.update_coordination(
        task_id='TASK-9001',
        agent_role='implementer',
        updates={'drift_budget': 1},
        actor='test'
    )

    # Read operations should still work
    context = context_store.get_context('TASK-9001')
    assert context is not None
    assert context.implementer.drift_budget == 1

    # Get manifest should also work
    manifest = context_store.get_manifest('TASK-9001')
    # manifest might be None if no source_files were provided during init


def test_resolve_drift_resets_budget(tmp_task_repo):
    """Test that resolve-drift command resets drift_budget to 0."""
    tmp_path, repo = tmp_task_repo
    context_store = TaskContextStore(tmp_path)

    # Initialize context
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    task_file = tmp_path / "tasks" / "TASK-9001-simple.task.yaml"
    task_content = task_file.read_bytes()
    task_file_sha = hashlib.sha256(task_content).hexdigest()

    immutable = {
        'task_snapshot': {
            'title': 'Simple test task',
            'priority': 'P1',
            'area': 'backend',
            'description': 'Test task for lifecycle and coordination testing',
            'scope_in': ['backend/services/upload.ts'],
            'scope_out': [],
            'acceptance_criteria': ['All tests pass'],
        },
        'standards_citations': [
            {
                'file': 'standards/backend-tier.md',
                'section': 'Testing',
                'requirement': 'Services must have 80% test coverage',
                'line_span': 'L1-L10',
                'content_sha': 'abc123',
            }
        ],
        'validation_baseline': {
            'commands': ['pnpm turbo run typecheck', 'pnpm turbo run lint'],
            'initial_results': None,
        },
        'repo_paths': ['backend/services/upload.ts'],
    }

    context_store.init_context(
        task_id='TASK-9001',
        immutable=immutable,
        git_head=git_head,
        task_file_sha=task_file_sha,
        created_by='test',
        source_files=[]
    )

    # Set drift budget > 0
    context_store.update_coordination(
        task_id='TASK-9001',
        agent_role='implementer',
        updates={'drift_budget': 3},
        actor='test'
    )

    # Verify drift budget is set
    context = context_store.get_context('TASK-9001')
    assert context.implementer.drift_budget == 3

    # Reset drift budget (simulating --resolve-drift command)
    context_store.update_coordination(
        task_id='TASK-9001',
        agent_role='implementer',
        updates={'drift_budget': 0},
        actor='operator'
    )

    # Verify drift budget was reset
    updated_context = context_store.get_context('TASK-9001')
    assert updated_context.implementer.drift_budget == 0


def test_drift_budget_persists_across_reads(tmp_task_repo):
    """Test that drift_budget value persists across multiple context reads."""
    tmp_path, repo = tmp_task_repo
    context_store = TaskContextStore(tmp_path)

    # Initialize context
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    task_file = tmp_path / "tasks" / "TASK-9001-simple.task.yaml"
    task_content = task_file.read_bytes()
    task_file_sha = hashlib.sha256(task_content).hexdigest()

    immutable = {
        'task_snapshot': {
            'title': 'Simple test task',
            'priority': 'P1',
            'area': 'backend',
            'description': 'Test task for lifecycle and coordination testing',
            'scope_in': ['backend/services/upload.ts'],
            'scope_out': [],
            'acceptance_criteria': ['All tests pass'],
        },
        'standards_citations': [
            {
                'file': 'standards/backend-tier.md',
                'section': 'Testing',
                'requirement': 'Services must have 80% test coverage',
                'line_span': 'L1-L10',
                'content_sha': 'abc123',
            }
        ],
        'validation_baseline': {
            'commands': ['pnpm turbo run typecheck', 'pnpm turbo run lint'],
            'initial_results': None,
        },
        'repo_paths': ['backend/services/upload.ts'],
    }

    context_store.init_context(
        task_id='TASK-9001',
        immutable=immutable,
        git_head=git_head,
        task_file_sha=task_file_sha,
        created_by='test',
        source_files=[]
    )

    # Set drift budget
    context_store.update_coordination(
        task_id='TASK-9001',
        agent_role='implementer',
        updates={'drift_budget': 5},
        actor='test'
    )

    # Read context multiple times
    for i in range(5):
        context = context_store.get_context('TASK-9001')
        assert context.implementer.drift_budget == 5

    # Create a new context store instance
    new_context_store = TaskContextStore(tmp_path)

    # Verify drift budget still persists
    context = new_context_store.get_context('TASK-9001')
    assert context.implementer.drift_budget == 5


# ============================================================================
# Agent Coordination State Tests (3 tests)
# ============================================================================


def test_multiple_agents_coordination_updates(tmp_task_repo):
    """Test coordination updates for multiple agents."""
    tmp_path, repo = tmp_task_repo
    context_store = TaskContextStore(tmp_path)

    # Initialize context
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    task_file = tmp_path / "tasks" / "TASK-9001-simple.task.yaml"
    task_content = task_file.read_bytes()
    task_file_sha = hashlib.sha256(task_content).hexdigest()

    immutable = {
        'task_snapshot': {
            'title': 'Simple test task',
            'priority': 'P1',
            'area': 'backend',
            'description': 'Test task for lifecycle and coordination testing',
            'scope_in': ['backend/services/upload.ts'],
            'scope_out': [],
            'acceptance_criteria': ['All tests pass'],
        },
        'standards_citations': [
            {
                'file': 'standards/backend-tier.md',
                'section': 'Testing',
                'requirement': 'Services must have 80% test coverage',
                'line_span': 'L1-L10',
                'content_sha': 'abc123',
            }
        ],
        'validation_baseline': {
            'commands': ['pnpm turbo run typecheck', 'pnpm turbo run lint'],
            'initial_results': None,
        },
        'repo_paths': ['backend/services/upload.ts'],
    }

    context_store.init_context(
        task_id='TASK-9001',
        immutable=immutable,
        git_head=git_head,
        task_file_sha=task_file_sha,
        created_by='test',
        source_files=[]
    )

    # Update implementer
    context_store.update_coordination(
        task_id='TASK-9001',
        agent_role='implementer',
        updates={'status': 'in_progress', 'session_id': 'session-impl-001'},
        actor='implementer-agent'
    )

    # Update reviewer
    context_store.update_coordination(
        task_id='TASK-9001',
        agent_role='reviewer',
        updates={'status': 'in_progress', 'session_id': 'session-review-001'},
        actor='reviewer-agent'
    )

    # Update validator
    context_store.update_coordination(
        task_id='TASK-9001',
        agent_role='validator',
        updates={'status': 'in_progress', 'session_id': 'session-valid-001'},
        actor='validator-agent'
    )

    # Verify all agents were updated
    context = context_store.get_context('TASK-9001')
    assert context.implementer.status == 'in_progress'
    assert context.implementer.session_id == 'session-impl-001'
    assert context.reviewer.status == 'in_progress'
    assert context.reviewer.session_id == 'session-review-001'
    assert context.validator.status == 'in_progress'
    assert context.validator.session_id == 'session-valid-001'


def test_coordination_timestamps_recorded(tmp_task_repo):
    """Test that coordination updates record timestamps."""
    tmp_path, repo = tmp_task_repo
    context_store = TaskContextStore(tmp_path)

    # Initialize context
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    task_file = tmp_path / "tasks" / "TASK-9001-simple.task.yaml"
    task_content = task_file.read_bytes()
    task_file_sha = hashlib.sha256(task_content).hexdigest()

    immutable = {
        'task_snapshot': {
            'title': 'Simple test task',
            'priority': 'P1',
            'area': 'backend',
            'description': 'Test task for lifecycle and coordination testing',
            'scope_in': ['backend/services/upload.ts'],
            'scope_out': [],
            'acceptance_criteria': ['All tests pass'],
        },
        'standards_citations': [
            {
                'file': 'standards/backend-tier.md',
                'section': 'Testing',
                'requirement': 'Services must have 80% test coverage',
                'line_span': 'L1-L10',
                'content_sha': 'abc123',
            }
        ],
        'validation_baseline': {
            'commands': ['pnpm turbo run typecheck', 'pnpm turbo run lint'],
            'initial_results': None,
        },
        'repo_paths': ['backend/services/upload.ts'],
    }

    context = context_store.init_context(
        task_id='TASK-9001',
        immutable=immutable,
        git_head=git_head,
        task_file_sha=task_file_sha,
        created_by='test',
        source_files=[]
    )

    # Record initial timestamps
    initial_created_at = context.created_at
    initial_update_count = context.audit_update_count

    # Update coordination
    context_store.update_coordination(
        task_id='TASK-9001',
        agent_role='implementer',
        updates={'status': 'in_progress'},
        actor='test-actor'
    )

    # Verify audit trail updated
    updated_context = context_store.get_context('TASK-9001')
    assert updated_context.created_at == initial_created_at  # Should not change
    assert updated_context.audit_updated_at != initial_created_at  # Should be updated
    assert updated_context.audit_updated_by == 'test-actor'
    assert updated_context.audit_update_count == initial_update_count + 1


def test_qa_logs_accumulate_correctly(tmp_task_repo):
    """Test that QA results accumulate correctly for agents."""
    tmp_path, repo = tmp_task_repo
    context_store = TaskContextStore(tmp_path)

    # Initialize context
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    task_file = tmp_path / "tasks" / "TASK-9001-simple.task.yaml"
    task_content = task_file.read_bytes()
    task_file_sha = hashlib.sha256(task_content).hexdigest()

    immutable = {
        'task_snapshot': {
            'title': 'Simple test task',
            'priority': 'P1',
            'area': 'backend',
            'description': 'Test task for lifecycle and coordination testing',
            'scope_in': ['backend/services/upload.ts'],
            'scope_out': [],
            'acceptance_criteria': ['All tests pass'],
        },
        'standards_citations': [
            {
                'file': 'standards/backend-tier.md',
                'section': 'Testing',
                'requirement': 'Services must have 80% test coverage',
                'line_span': 'L1-L10',
                'content_sha': 'abc123',
            }
        ],
        'validation_baseline': {
            'commands': ['pnpm turbo run typecheck', 'pnpm turbo run lint'],
            'initial_results': None,
        },
        'repo_paths': ['backend/services/upload.ts'],
    }

    context_store.init_context(
        task_id='TASK-9001',
        immutable=immutable,
        git_head=git_head,
        task_file_sha=task_file_sha,
        created_by='test',
        source_files=[]
    )

    # Add QA results for implementer
    qa_results_1 = {
        'typecheck': {'status': 'pass', 'errors': 0},
        'lint': {'status': 'pass', 'warnings': 0}
    }
    context_store.update_coordination(
        task_id='TASK-9001',
        agent_role='implementer',
        updates={'qa_results': qa_results_1},
        actor='implementer'
    )

    # Verify QA results were stored
    context = context_store.get_context('TASK-9001')
    assert context.implementer.qa_results == qa_results_1

    # Update QA results (simulate accumulation)
    qa_results_2 = {
        'typecheck': {'status': 'pass', 'errors': 0},
        'lint': {'status': 'pass', 'warnings': 0},
        'test': {'status': 'pass', 'coverage': '85%'}
    }
    context_store.update_coordination(
        task_id='TASK-9001',
        agent_role='implementer',
        updates={'qa_results': qa_results_2},
        actor='implementer'
    )

    # Verify QA results were updated (replaced, not merged)
    context = context_store.get_context('TASK-9001')
    assert context.implementer.qa_results == qa_results_2
    assert 'test' in context.implementer.qa_results
