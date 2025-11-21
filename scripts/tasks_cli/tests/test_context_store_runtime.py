"""
Tests for context_store/runtime.py module.

Covers:
- Path helpers (context dir, context file, manifest file, evidence dir)
- Atomic write (success, parent dir creation, error handling)
- File SHA256 calculation
- Secret scanning (various patterns, nested data, force bypass)
- Git operations (current head, staleness checks)
- Path normalization
- Task path resolution
"""

import hashlib
import json
import os
import subprocess
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch, call

import pytest

from tasks_cli.context_store.runtime import RuntimeHelper, SECRET_PATTERNS
from tasks_cli.exceptions import ValidationError


@pytest.fixture
def temp_repo(tmp_path):
    """Create temporary repository structure."""
    repo_root = tmp_path / "repo"
    repo_root.mkdir()

    # Create basic structure
    context_root = repo_root / ".agent-output"
    context_root.mkdir()

    # Create tasks directories
    for tier in ['mobile', 'backend', 'shared', 'infrastructure', 'ops']:
        tasks_dir = repo_root / 'tasks' / tier
        tasks_dir.mkdir(parents=True)

    # Create completed tasks directory
    completed_dir = repo_root / 'docs' / 'completed-tasks'
    completed_dir.mkdir(parents=True)

    # Create quarantine directory
    quarantine_dir = repo_root / 'docs' / 'compliance' / 'quarantine'
    quarantine_dir.mkdir(parents=True)

    return repo_root


@pytest.fixture
def mock_git_provider():
    """Create mock GitProvider."""
    return Mock()


@pytest.fixture
def helper(temp_repo, mock_git_provider):
    """Create RuntimeHelper instance with mocked GitProvider."""
    context_root = temp_repo / ".agent-output"
    return RuntimeHelper(repo_root=temp_repo, context_root=context_root, git_provider=mock_git_provider)


# ============================================================================
# Path Helpers Tests
# ============================================================================

def test_get_context_dir(helper, temp_repo):
    """Test get_context_dir returns correct path."""
    task_id = "TASK-0824"
    context_dir = helper.get_context_dir(task_id)

    assert context_dir == temp_repo / ".agent-output" / task_id
    assert isinstance(context_dir, Path)


def test_get_context_file(helper, temp_repo):
    """Test get_context_file returns correct path."""
    task_id = "TASK-0824"
    context_file = helper.get_context_file(task_id)

    assert context_file == temp_repo / ".agent-output" / task_id / "context.json"
    assert isinstance(context_file, Path)


def test_get_manifest_file(helper, temp_repo):
    """Test get_manifest_file returns correct path."""
    task_id = "TASK-0824"
    manifest_file = helper.get_manifest_file(task_id)

    assert manifest_file == temp_repo / ".agent-output" / task_id / "context.manifest"
    assert isinstance(manifest_file, Path)


def test_get_evidence_dir(helper, temp_repo):
    """Test get_evidence_dir returns correct path."""
    task_id = "TASK-0824"
    evidence_dir = helper.get_evidence_dir(task_id)

    assert evidence_dir == temp_repo / ".agent-output" / task_id / "evidence"
    assert isinstance(evidence_dir, Path)


# ============================================================================
# Atomic Write Tests
# ============================================================================

def test_atomic_write_success(helper, temp_repo):
    """Test atomic_write creates file with correct content."""
    target_path = temp_repo / ".agent-output" / "test.txt"
    content = "Hello, World!\n"

    helper.atomic_write(target_path, content)

    assert target_path.exists()
    assert target_path.read_text(encoding='utf-8') == content


def test_atomic_write_creates_parent_dir(helper, temp_repo):
    """Test atomic_write creates parent directories if needed."""
    target_path = temp_repo / ".agent-output" / "nested" / "dir" / "test.txt"
    content = "Test content\n"

    helper.atomic_write(target_path, content)

    assert target_path.exists()
    assert target_path.read_text(encoding='utf-8') == content
    assert target_path.parent.exists()


def test_atomic_write_overwrites_existing(helper, temp_repo):
    """Test atomic_write overwrites existing file."""
    target_path = temp_repo / ".agent-output" / "test.txt"
    original_content = "Original content\n"
    new_content = "New content\n"

    # Write original
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_text(original_content, encoding='utf-8')

    # Overwrite
    helper.atomic_write(target_path, new_content)

    assert target_path.read_text(encoding='utf-8') == new_content


def test_atomic_write_cleanup_on_error(helper, temp_repo):
    """Test atomic_write cleans up temp file on error."""
    target_path = temp_repo / ".agent-output" / "test.txt"
    target_path.parent.mkdir(parents=True, exist_ok=True)

    # Mock os.replace to raise error
    with patch('os.replace', side_effect=OSError("Simulated error")):
        with pytest.raises(OSError, match="Simulated error"):
            helper.atomic_write(target_path, "content")

    # Verify no temp files left behind
    temp_files = list(target_path.parent.glob(".test.txt.tmp*"))
    assert len(temp_files) == 0


# ============================================================================
# File SHA256 Calculation Tests
# ============================================================================

def test_calculate_file_sha256_absolute_path(helper, temp_repo):
    """Test calculate_file_sha256 with absolute path."""
    test_file = temp_repo / "test.txt"
    content = "Test content for hashing\n"
    test_file.write_text(content, encoding='utf-8')

    expected_sha = hashlib.sha256(content.encode('utf-8')).hexdigest()
    actual_sha = helper.calculate_file_sha256(test_file)

    assert actual_sha == expected_sha


def test_calculate_file_sha256_relative_path(helper, temp_repo):
    """Test calculate_file_sha256 with relative path."""
    test_file = temp_repo / "test.txt"
    content = "Test content for hashing\n"
    test_file.write_text(content, encoding='utf-8')

    expected_sha = hashlib.sha256(content.encode('utf-8')).hexdigest()
    actual_sha = helper.calculate_file_sha256(Path("test.txt"))

    assert actual_sha == expected_sha


def test_calculate_file_sha256_binary_file(helper, temp_repo):
    """Test calculate_file_sha256 with binary file."""
    test_file = temp_repo / "test.bin"
    content = b'\x00\x01\x02\x03\xFF\xFE\xFD'
    test_file.write_bytes(content)

    expected_sha = hashlib.sha256(content).hexdigest()
    actual_sha = helper.calculate_file_sha256(test_file)

    assert actual_sha == expected_sha


# ============================================================================
# Secret Scanning Tests
# ============================================================================

def test_scan_for_secrets_aws_key(helper):
    """Test secret scanning detects AWS access key."""
    data = {
        'credentials': {
            'access_key': 'THIS_IS_A_DUMMY_AWS_ACCESS_KEY'
        }
    }

    with pytest.raises(ValidationError, match="AWS access key"):
        helper.scan_for_secrets(data)


def test_scan_for_secrets_stripe_key(helper):
    """Test secret scanning detects Stripe live key."""
    data = {
        'stripe': {
            'key': 'THIS_IS_A_DUMMY_STRIPE_LIVE_KEY'
        }
    }

    with pytest.raises(ValidationError, match="Stripe live key"):
        helper.scan_for_secrets(data)


def test_scan_for_secrets_jwt_token(helper):
    """Test secret scanning detects JWT token."""
    data = {
        'auth': {
            'token': 'THIS_IS_A_DUMMY_JWT_TOKEN'
        }
    }

    with pytest.raises(ValidationError, match="JWT token"):
        helper.scan_for_secrets(data)


def test_scan_for_secrets_github_token(helper):
    """Test secret scanning detects GitHub token."""
    data = {
        'github': {
            'token': 'THIS_IS_A_DUMMY_GITHUB_TOKEN'
        }
    }

    with pytest.raises(ValidationError, match="GitHub token"):
        helper.scan_for_secrets(data)


def test_scan_for_secrets_private_key(helper):
    """Test secret scanning detects private key."""
    data = {
        'key': 'THIS_IS_A_DUMMY_PRIVATE_KEY'
    }

    with pytest.raises(ValidationError, match="Private key"):
        helper.scan_for_secrets(data)


def test_scan_for_secrets_nested_data(helper):
    """Test secret scanning in deeply nested structures."""
    data = {
        'level1': {
            'level2': {
                'level3': {
                    'credentials': 'THIS_IS_A_DUMMY_AWS_ACCESS_KEY'
                }
            }
        }
    }

    with pytest.raises(ValidationError, match="AWS access key"):
        helper.scan_for_secrets(data)


def test_scan_for_secrets_list_data(helper):
    """Test secret scanning in list structures."""
    data = {
        'items': [
            {'name': 'item1'},
            {'name': 'item2', 'key': 'THIS_IS_A_DUMMY_AWS_ACCESS_KEY'},
            {'name': 'item3'}
        ]
    }

    with pytest.raises(ValidationError, match="AWS access key"):
        helper.scan_for_secrets(data)


def test_scan_for_secrets_force_bypass(helper):
    """Test secret scanning can be bypassed with force=True."""
    data = {
        'credentials': {
            'access_key': 'AKIAIOSFODNN7EXAMPLE'
        }
    }

    # Should not raise with force=True
    helper.scan_for_secrets(data, force=True)


def test_scan_for_secrets_clean_data(helper):
    """Test secret scanning passes clean data."""
    data = {
        'config': {
            'api_url': 'https://api.example.com',
            'timeout': 30,
            'retries': 3
        }
    }

    # Should not raise
    helper.scan_for_secrets(data)


# ============================================================================
# Git Operations Tests
# ============================================================================

def test_get_current_git_head_success(helper, mock_git_provider):
    """Test get_current_git_head returns commit SHA."""
    mock_git_provider.get_current_commit.return_value = 'abc123def456789012345678901234567890abcd'

    git_head = helper.get_current_git_head()

    assert git_head == 'abc123def456789012345678901234567890abcd'
    mock_git_provider.get_current_commit.assert_called_once()


def test_get_current_git_head_failure(helper, mock_git_provider):
    """Test get_current_git_head raises on git command failure."""
    from tasks_cli.providers import CommandFailed
    mock_git_provider.get_current_commit.side_effect = CommandFailed(
        ['git', 'rev-parse', 'HEAD'],
        128
    )

    with pytest.raises(CommandFailed):
        helper.get_current_git_head()


def test_check_staleness_matching_heads(helper, mock_git_provider, capsys):
    """Test check_staleness with matching git heads (no warning)."""
    mock_git_provider.get_current_commit.return_value = 'abc123def456789012345678901234567890abcd'

    helper.check_staleness('abc123def456789012345678901234567890abcd')

    captured = capsys.readouterr()
    assert 'Warning' not in captured.err


def test_check_staleness_mismatched_heads(helper, mock_git_provider, capsys):
    """Test check_staleness with mismatched git heads (warning)."""
    mock_git_provider.get_current_commit.return_value = 'def456abc123789012345678901234567890abcd'

    helper.check_staleness('abc123def456789012345678901234567890abcd')

    captured = capsys.readouterr()
    assert 'Warning' in captured.err
    assert 'abc123de' in captured.err
    assert 'def456ab' in captured.err
    assert 'stale' in captured.err


def test_check_staleness_git_failure(helper, mock_git_provider, capsys):
    """Test check_staleness handles git command failure gracefully."""
    from tasks_cli.providers import CommandFailed
    mock_git_provider.get_current_commit.side_effect = CommandFailed(
        ['git', 'rev-parse', 'HEAD'],
        128
    )

    # Should not raise, just silently handle error
    helper.check_staleness('abc123def456789012345678901234567890abcd')

    captured = capsys.readouterr()
    # No warning emitted on git failure
    assert captured.err == ''


# ============================================================================
# Path Normalization Tests
# ============================================================================

def test_normalize_repo_paths_file_paths(helper):
    """Test normalize_repo_paths converts file paths to directory paths."""
    paths = [
        'mobile/src/App.tsx',
        'backend/services/auth.ts',
        'shared/schemas/user.ts'
    ]

    normalized = helper.normalize_repo_paths(paths)

    assert normalized == [
        'backend/services',
        'mobile/src',
        'shared/schemas'
    ]


def test_normalize_repo_paths_directory_paths(helper):
    """Test normalize_repo_paths preserves directory paths."""
    paths = [
        'mobile/src',
        'backend/services/',
        'shared/schemas'
    ]

    normalized = helper.normalize_repo_paths(paths)

    assert normalized == [
        'backend/services',
        'mobile/src',
        'shared/schemas'
    ]


def test_normalize_repo_paths_mixed(helper):
    """Test normalize_repo_paths handles mixed file and directory paths."""
    paths = [
        'mobile/src/App.tsx',
        'mobile/src/components/',
        'backend/services/auth.ts',
        'backend/handlers'
    ]

    normalized = helper.normalize_repo_paths(paths)

    assert normalized == [
        'backend/handlers',
        'backend/services',
        'mobile/src',
        'mobile/src/components'
    ]


def test_normalize_repo_paths_root_files(helper):
    """Test normalize_repo_paths handles root-level files."""
    paths = [
        '.env',
        'tsconfig.json'
    ]

    normalized = helper.normalize_repo_paths(paths)

    # Root files with extensions normalize to "."
    assert normalized == ['.']


def test_normalize_repo_paths_deduplication(helper):
    """Test normalize_repo_paths deduplicates paths."""
    paths = [
        'mobile/src/App.tsx',
        'mobile/src/index.tsx',
        'mobile/src/utils.ts'
    ]

    normalized = helper.normalize_repo_paths(paths)

    # All three files in same directory -> single entry
    assert normalized == ['mobile/src']


def test_normalize_repo_paths_empty(helper):
    """Test normalize_repo_paths with empty list."""
    normalized = helper.normalize_repo_paths([])

    assert normalized == []


# ============================================================================
# Task Path Resolution Tests
# ============================================================================

def test_resolve_task_path_active_task(helper, temp_repo):
    """Test resolve_task_path finds active task."""
    task_id = "TASK-0824"
    task_file = temp_repo / 'tasks' / 'backend' / f'{task_id}-test-task.task.yaml'
    task_file.write_text("# Test task\n", encoding='utf-8')

    resolved = helper.resolve_task_path(task_id)

    assert resolved == task_file


def test_resolve_task_path_completed_task(helper, temp_repo):
    """Test resolve_task_path finds completed task."""
    task_id = "TASK-0100"
    task_file = temp_repo / 'docs' / 'completed-tasks' / f'{task_id}-completed-task.task.yaml'
    task_file.write_text("# Completed task\n", encoding='utf-8')

    resolved = helper.resolve_task_path(task_id)

    assert resolved == task_file


def test_resolve_task_path_quarantined_task(helper, temp_repo):
    """Test resolve_task_path finds quarantined task."""
    task_id = "TASK-0999"
    task_file = temp_repo / 'docs' / 'compliance' / 'quarantine' / f'{task_id}.quarantine.json'
    task_file.write_text('{"reason": "quarantined"}\n', encoding='utf-8')

    resolved = helper.resolve_task_path(task_id)

    assert resolved == task_file


def test_resolve_task_path_priority_order(helper, temp_repo):
    """Test resolve_task_path prioritizes active over completed."""
    task_id = "TASK-0500"

    # Create both active and completed versions
    active_file = temp_repo / 'tasks' / 'mobile' / f'{task_id}-active.task.yaml'
    active_file.write_text("# Active task\n", encoding='utf-8')

    completed_file = temp_repo / 'docs' / 'completed-tasks' / f'{task_id}-completed.task.yaml'
    completed_file.write_text("# Completed task\n", encoding='utf-8')

    resolved = helper.resolve_task_path(task_id)

    # Should find active first
    assert resolved == active_file


def test_resolve_task_path_not_found(helper, temp_repo):
    """Test resolve_task_path returns None for missing task."""
    task_id = "TASK-9999"

    resolved = helper.resolve_task_path(task_id)

    assert resolved is None


def test_resolve_task_path_multiple_tiers(helper, temp_repo):
    """Test resolve_task_path searches all tiers."""
    task_id = "TASK-0600"

    # Create task in 'shared' tier
    task_file = temp_repo / 'tasks' / 'shared' / f'{task_id}-shared-task.task.yaml'
    task_file.write_text("# Shared task\n", encoding='utf-8')

    resolved = helper.resolve_task_path(task_id)

    assert resolved == task_file
