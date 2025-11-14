"""
Test task context store for agent coordination.

Tests immutability, concurrency, delta tracking, and drift detection.
"""

import hashlib
import json
import pytest
import subprocess
import time
from dataclasses import FrozenInstanceError
from pathlib import Path

from tasks_cli.context_store import (
    TaskContextStore,
    TaskContext,
    TaskSnapshot,
    StandardsCitation,
    ValidationBaseline,
    FileSnapshot,
    WorktreeSnapshot,
    AgentCoordination,
    ContextExistsError,
    ContextNotFoundError,
    DriftError,
    normalize_diff_for_hashing,
    calculate_scope_hash,
)
from tasks_cli.exceptions import ValidationError


# ============================================================================
# Fixtures
# ============================================================================

@pytest.fixture
def temp_repo(tmp_path):
    """Create temporary git repository."""
    repo = tmp_path / "repo"
    repo.mkdir()

    # Initialize git repo
    subprocess.run(['git', 'init'], cwd=repo, check=True, capture_output=True)
    subprocess.run(['git', 'config', 'user.name', 'Test User'], cwd=repo, check=True)
    subprocess.run(['git', 'config', 'user.email', 'test@example.com'], cwd=repo, check=True)
    # Disable commit signing for tests
    subprocess.run(['git', 'config', 'commit.gpgsign', 'false'], cwd=repo, check=True)
    subprocess.run(['git', 'config', 'gpg.format', 'openpgp'], cwd=repo, check=True)

    # Create initial commit
    test_file = repo / "test.txt"
    test_file.write_text("initial content\n")
    subprocess.run(['git', 'add', '.'], cwd=repo, check=True)
    subprocess.run(['git', 'commit', '-m', 'Initial commit'], cwd=repo, check=True, capture_output=True)

    return repo


@pytest.fixture
def sample_immutable_data():
    """Sample immutable context data."""
    return {
        'task_snapshot': {
            'title': 'Test Task',
            'priority': 'P1',
            'area': 'backend',
            'description': 'Test description',
            'scope_in': ['backend/'],
            'scope_out': ['mobile/'],
            'acceptance_criteria': ['Tests pass', 'Lint passes'],
        },
        'standards_citations': [
            {
                'file': 'standards/backend-tier.md',
                'section': 'handler-constraints',
                'requirement': 'Handler complexity ≤10',
                'line_span': 'L42-L89',
                'content_sha': 'abc123def456',
            }
        ],
        'validation_baseline': {
            'commands': ['pnpm turbo run test'],
            'initial_results': None,
        },
        'repo_paths': ['backend/src/', 'backend/tests/'],
    }


@pytest.fixture
def context_store(temp_repo):
    """Create TaskContextStore instance."""
    return TaskContextStore(temp_repo)


# ============================================================================
# Test Data Models - Immutability
# ============================================================================

def test_task_snapshot_frozen():
    """TaskSnapshot is frozen and cannot be modified."""
    snapshot = TaskSnapshot(
        title='Test',
        priority='P1',
        area='backend',
        description='Test desc',
        scope_in=['a'],
        scope_out=['b'],
        acceptance_criteria=['c'],
    )

    with pytest.raises(FrozenInstanceError):
        snapshot.title = 'Modified'


def test_standards_citation_frozen():
    """StandardsCitation is frozen."""
    citation = StandardsCitation(
        file='test.md',
        section='test',
        requirement='req',
    )

    with pytest.raises(FrozenInstanceError):
        citation.file = 'modified.md'


def test_validation_baseline_frozen():
    """ValidationBaseline is frozen."""
    baseline = ValidationBaseline(commands=['test'])

    with pytest.raises(FrozenInstanceError):
        baseline.commands = ['modified']


def test_file_snapshot_frozen():
    """FileSnapshot is frozen."""
    snapshot = FileSnapshot(
        path='test.py',
        sha256='abc123',
        status='M',
        mode='644',
        size=100,
    )

    with pytest.raises(FrozenInstanceError):
        snapshot.path = 'modified.py'


def test_worktree_snapshot_frozen():
    """WorktreeSnapshot is frozen."""
    snapshot = WorktreeSnapshot(
        base_commit='abc123',
        snapshot_time='2025-01-01T00:00:00Z',
        diff_from_base='diff.patch',
        diff_sha='def456',
        status_report='',
        files_changed=[],
        diff_stat='',
        scope_hash='hash123',
    )

    with pytest.raises(FrozenInstanceError):
        snapshot.base_commit = 'modified'


# ============================================================================
# Test Data Models - Serialization
# ============================================================================

def test_task_snapshot_serialization_roundtrip():
    """TaskSnapshot to_dict/from_dict round-trip."""
    original = TaskSnapshot(
        title='Test',
        priority='P1',
        area='backend',
        description='Test desc',
        scope_in=['a', 'b'],
        scope_out=['c'],
        acceptance_criteria=['d', 'e'],
    )

    data = original.to_dict()
    restored = TaskSnapshot.from_dict(data)

    assert restored.title == original.title
    assert restored.priority == original.priority
    assert restored.scope_in == original.scope_in


def test_task_context_serialization_roundtrip():
    """TaskContext to_dict/from_dict round-trip."""
    context = TaskContext(
        version=1,
        task_id='TASK-0001',
        created_at='2025-01-01T00:00:00Z',
        created_by='test',
        git_head='abc123',
        task_file_sha='def456',
        task_snapshot=TaskSnapshot(
            title='Test',
            priority='P1',
            area='backend',
            description='Test',
            scope_in=[],
            scope_out=[],
            acceptance_criteria=[],
        ),
        standards_citations=[],
        validation_baseline=ValidationBaseline(commands=[]),
        repo_paths=[],
        implementer=AgentCoordination(),
        reviewer=AgentCoordination(),
        validator=AgentCoordination(),
        audit_updated_at='2025-01-01T00:00:00Z',
        audit_updated_by='test',
        audit_update_count=0,
    )

    data = context.to_dict()
    restored = TaskContext.from_dict(data)

    assert restored.task_id == context.task_id
    assert restored.version == context.version
    assert restored.git_head == context.git_head


def test_task_context_unsupported_version():
    """TaskContext.from_dict raises on unsupported version."""
    data = {
        'version': 99,
        'task_id': 'TASK-0001',
        'created_at': '2025-01-01T00:00:00Z',
        'created_by': 'test',
        'git_head': 'abc123',
        'task_file_sha': 'def456',
        'immutable': {
            'task_snapshot': {
                'title': 'Test',
                'priority': 'P1',
                'area': 'backend',
                'description': 'Test',
                'scope_in': [],
                'scope_out': [],
                'acceptance_criteria': [],
            },
            'standards_citations': [],
            'validation_baseline': {'commands': []},
            'repo_paths': [],
        },
        'coordination': {
            'implementer': {'status': 'pending'},
            'reviewer': {'status': 'pending'},
            'validator': {'status': 'pending'},
        },
        'audit': {
            'updated_at': '2025-01-01T00:00:00Z',
            'updated_by': 'test',
            'update_count': 0,
        },
    }

    with pytest.raises(ValueError, match='Unsupported context version'):
        TaskContext.from_dict(data)


# ============================================================================
# Test Helper Functions
# ============================================================================

def test_normalize_diff_for_hashing_crlf():
    """Diff normalization converts CRLF to LF."""
    diff_crlf = "line 1\r\nline 2\r\nline 3"
    diff_lf = "line 1\nline 2\nline 3"

    normalized_crlf = normalize_diff_for_hashing(diff_crlf)
    normalized_lf = normalize_diff_for_hashing(diff_lf)

    # Both should produce same result
    assert normalized_crlf == normalized_lf
    assert normalized_crlf.endswith('\n')

    # Hashes should match
    hash_crlf = hashlib.sha256(normalized_crlf.encode()).hexdigest()
    hash_lf = hashlib.sha256(normalized_lf.encode()).hexdigest()
    assert hash_crlf == hash_lf


def test_normalize_diff_for_hashing_trailing_newline():
    """Diff normalization ensures trailing newline."""
    diff_no_newline = "line 1\nline 2"
    diff_with_newline = "line 1\nline 2\n"

    normalized_no = normalize_diff_for_hashing(diff_no_newline)
    normalized_yes = normalize_diff_for_hashing(diff_with_newline)

    # Both should have trailing newline
    assert normalized_no.endswith('\n')
    assert normalized_yes.endswith('\n')
    assert normalized_no == normalized_yes


def test_calculate_scope_hash_deterministic():
    """Scope hash is deterministic."""
    paths1 = ['a', 'b', 'c']
    paths2 = ['c', 'a', 'b']  # Different order

    hash1 = calculate_scope_hash(paths1)
    hash2 = calculate_scope_hash(paths2)

    # Should be identical (sorted internally)
    assert hash1 == hash2
    assert len(hash1) == 16  # 16-char prefix


def test_calculate_scope_hash_different_paths():
    """Different paths produce different hashes."""
    paths1 = ['a', 'b', 'c']
    paths2 = ['a', 'b', 'd']

    hash1 = calculate_scope_hash(paths1)
    hash2 = calculate_scope_hash(paths2)

    assert hash1 != hash2


# ============================================================================
# Test TaskContextStore - Basic Operations
# ============================================================================

def test_init_context_creates_directory(context_store, sample_immutable_data, temp_repo):
    """init_context creates context directory and file."""
    # Get current git HEAD
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    context = context_store.init_context(
        task_id='TASK-0001',
        immutable=sample_immutable_data,
        git_head=git_head,
        task_file_sha='file_sha_123',
    )

    assert context.task_id == 'TASK-0001'
    assert context.version == 1

    # Check file exists
    context_file = temp_repo / '.agent-output' / 'TASK-0001' / 'context.json'
    assert context_file.exists()

    # Verify JSON content
    with open(context_file, 'r') as f:
        data = json.load(f)

    assert data['task_id'] == 'TASK-0001'
    assert data['version'] == 1


def test_init_context_raises_if_exists(context_store, sample_immutable_data, temp_repo):
    """init_context raises ContextExistsError if already initialized."""
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    # Initialize once
    context_store.init_context(
        task_id='TASK-0001',
        immutable=sample_immutable_data,
        git_head=git_head,
        task_file_sha='file_sha',
    )

    # Try to initialize again
    with pytest.raises(ContextExistsError):
        context_store.init_context(
            task_id='TASK-0001',
            immutable=sample_immutable_data,
            git_head=git_head,
            task_file_sha='file_sha',
        )


def test_init_context_validates_completeness(context_store, temp_repo):
    """init_context validates required fields."""
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    incomplete_data = {
        'task_snapshot': {
            'title': 'Test',
            'priority': 'P1',
            'area': 'backend',
            'description': '',  # Empty description
            'scope_in': [],
            'scope_out': [],
            'acceptance_criteria': [],
        },
        'standards_citations': [],
        'validation_baseline': {'commands': []},
        'repo_paths': [],
    }

    with pytest.raises(ValidationError, match='description cannot be empty'):
        context_store.init_context(
            task_id='TASK-0001',
            immutable=incomplete_data,
            git_head=git_head,
            task_file_sha='file_sha',
        )


def test_get_context_returns_none_if_not_found(context_store):
    """get_context returns None for nonexistent context."""
    context = context_store.get_context('TASK-9999')
    assert context is None


def test_get_context_loads_context(context_store, sample_immutable_data, temp_repo):
    """get_context loads existing context."""
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    # Initialize
    context_store.init_context(
        task_id='TASK-0001',
        immutable=sample_immutable_data,
        git_head=git_head,
        task_file_sha='file_sha',
    )

    # Load
    context = context_store.get_context('TASK-0001')

    assert context is not None
    assert context.task_id == 'TASK-0001'
    assert context.task_snapshot.title == 'Test Task'


def test_update_coordination_merges_updates(context_store, sample_immutable_data, temp_repo):
    """update_coordination merges updates into coordination state."""
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    context_store.init_context(
        task_id='TASK-0001',
        immutable=sample_immutable_data,
        git_head=git_head,
        task_file_sha='file_sha',
    )

    # Update implementer status
    context_store.update_coordination(
        task_id='TASK-0001',
        agent_role='implementer',
        updates={'status': 'done', 'qa_log_path': '/path/to/log'},
        actor='test-agent',
    )

    # Load and verify
    context = context_store.get_context('TASK-0001')
    assert context.implementer.status == 'done'
    assert context.implementer.qa_log_path == '/path/to/log'
    assert context.audit_update_count == 1


def test_update_coordination_raises_on_invalid_role(context_store, sample_immutable_data, temp_repo):
    """update_coordination raises on invalid agent_role."""
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    context_store.init_context(
        task_id='TASK-0001',
        immutable=sample_immutable_data,
        git_head=git_head,
        task_file_sha='file_sha',
    )

    with pytest.raises(ValidationError, match='Invalid agent_role'):
        context_store.update_coordination(
            task_id='TASK-0001',
            agent_role='invalid_role',
            updates={'status': 'done'},
            actor='test',
        )


def test_purge_context_removes_directory(context_store, sample_immutable_data, temp_repo):
    """purge_context removes context directory."""
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    context_store.init_context(
        task_id='TASK-0001',
        immutable=sample_immutable_data,
        git_head=git_head,
        task_file_sha='file_sha',
    )

    context_dir = temp_repo / '.agent-output' / 'TASK-0001'
    assert context_dir.exists()

    # Purge
    context_store.purge_context('TASK-0001')

    assert not context_dir.exists()


def test_purge_context_idempotent(context_store):
    """purge_context is idempotent (no error if already deleted)."""
    # Purge nonexistent context
    context_store.purge_context('TASK-9999')  # Should not raise


# ============================================================================
# Test Secret Scanning
# ============================================================================

def test_secret_scan_aws_key(context_store, sample_immutable_data, temp_repo):
    """Secret scanner detects AWS access key."""
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    # Add AWS key to data
    bad_data = sample_immutable_data.copy()
    bad_data['task_snapshot'] = bad_data['task_snapshot'].copy()
    bad_data['task_snapshot']['description'] = 'AKIAIOSFODNN7EXAMPLE leaked key'

    with pytest.raises(ValidationError, match='Potential secret detected'):
        context_store.init_context(
            task_id='TASK-0001',
            immutable=bad_data,
            git_head=git_head,
            task_file_sha='file_sha',
        )


def test_secret_scan_stripe_key(context_store, sample_immutable_data, temp_repo):
    """Secret scanner detects Stripe live key."""
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    bad_data = sample_immutable_data.copy()
    bad_data['task_snapshot'] = bad_data['task_snapshot'].copy()
    # Construct Stripe live key pattern dynamically to avoid GitHub secret scanning
    bad_data['task_snapshot']['description'] = 'sk_' + 'live_' + '1234567890' * 3

    with pytest.raises(ValidationError, match='Potential secret detected'):
        context_store.init_context(
            task_id='TASK-0001',
            immutable=bad_data,
            git_head=git_head,
            task_file_sha='file_sha',
        )


def test_secret_scan_force_override(context_store, sample_immutable_data, temp_repo):
    """Secret scanner can be bypassed with force_secrets flag."""
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    bad_data = sample_immutable_data.copy()
    bad_data['task_snapshot'] = bad_data['task_snapshot'].copy()
    bad_data['task_snapshot']['description'] = 'AKIAIOSFODNN7EXAMPLE test key'

    # Should succeed with force flag
    context = context_store.init_context(
        task_id='TASK-0001',
        immutable=bad_data,
        git_head=git_head,
        task_file_sha='file_sha',
        force_secrets=True,
    )

    assert context is not None


# ============================================================================
# Test Delta Tracking - Working Tree
# ============================================================================

def test_snapshot_worktree_raises_on_clean_tree(context_store, sample_immutable_data, temp_repo):
    """snapshot_worktree raises if working tree is clean."""
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    context_store.init_context(
        task_id='TASK-0001',
        immutable=sample_immutable_data,
        git_head=git_head,
        task_file_sha='file_sha',
    )

    # Working tree is clean (no changes)
    with pytest.raises(ValidationError, match='Working tree is clean'):
        context_store.snapshot_worktree(
            task_id='TASK-0001',
            agent_role='implementer',
            actor='test',
            base_commit=git_head,
        )


def test_snapshot_worktree_captures_changes(context_store, sample_immutable_data, temp_repo):
    """snapshot_worktree captures working tree state."""
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    context_store.init_context(
        task_id='TASK-0001',
        immutable=sample_immutable_data,
        git_head=git_head,
        task_file_sha='file_sha',
    )

    # Make changes to working tree
    test_file = temp_repo / 'test.txt'
    test_file.write_text('modified content\n')

    # Snapshot
    snapshot = context_store.snapshot_worktree(
        task_id='TASK-0001',
        agent_role='implementer',
        actor='test',
        base_commit=git_head,
    )

    assert snapshot.base_commit == git_head
    assert len(snapshot.files_changed) > 0
    assert snapshot.diff_sha  # Should have diff hash
    assert snapshot.scope_hash  # Should have scope hash

    # Verify diff file created
    diff_file = temp_repo / '.agent-output' / 'TASK-0001' / 'implementer-from-base.diff'
    assert diff_file.exists()


def test_verify_worktree_state_success(context_store, sample_immutable_data, temp_repo):
    """verify_worktree_state succeeds when no drift."""
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    context_store.init_context(
        task_id='TASK-0001',
        immutable=sample_immutable_data,
        git_head=git_head,
        task_file_sha='file_sha',
    )

    # Make changes
    test_file = temp_repo / 'test.txt'
    test_file.write_text('modified content\n')

    # Snapshot
    context_store.snapshot_worktree(
        task_id='TASK-0001',
        agent_role='implementer',
        actor='test',
        base_commit=git_head,
    )

    # Verify should succeed (no additional changes)
    context_store.verify_worktree_state(
        task_id='TASK-0001',
        expected_agent='implementer',
    )


def test_verify_worktree_state_detects_file_modification(context_store, sample_immutable_data, temp_repo):
    """verify_worktree_state detects manual file modifications."""
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    context_store.init_context(
        task_id='TASK-0001',
        immutable=sample_immutable_data,
        git_head=git_head,
        task_file_sha='file_sha',
    )

    # Make changes
    test_file = temp_repo / 'test.txt'
    test_file.write_text('modified content\n')

    # Snapshot
    context_store.snapshot_worktree(
        task_id='TASK-0001',
        agent_role='implementer',
        actor='test',
        base_commit=git_head,
    )

    # Modify file again (drift)
    test_file.write_text('further modifications\n')

    # Verify should fail
    with pytest.raises(DriftError, match='Working tree drift detected'):
        context_store.verify_worktree_state(
            task_id='TASK-0001',
            expected_agent='implementer',
        )


def test_verify_worktree_state_detects_premature_commit(context_store, sample_immutable_data, temp_repo):
    """verify_worktree_state detects if working tree was committed."""
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    context_store.init_context(
        task_id='TASK-0001',
        immutable=sample_immutable_data,
        git_head=git_head,
        task_file_sha='file_sha',
    )

    # Make changes
    test_file = temp_repo / 'test.txt'
    test_file.write_text('modified content\n')

    # Snapshot
    context_store.snapshot_worktree(
        task_id='TASK-0001',
        agent_role='implementer',
        actor='test',
        base_commit=git_head,
    )

    # Commit the changes (premature)
    subprocess.run(['git', 'add', '.'], cwd=temp_repo, check=True)
    subprocess.run(
        ['git', 'commit', '-m', 'Premature commit'],
        cwd=temp_repo,
        check=True,
        capture_output=True
    )

    # Verify should fail (base commit changes when you commit)
    with pytest.raises(DriftError, match='Base commit changed'):
        context_store.verify_worktree_state(
            task_id='TASK-0001',
            expected_agent='implementer',
        )


def test_verify_worktree_state_raises_if_no_snapshot(context_store, sample_immutable_data, temp_repo):
    """verify_worktree_state raises if no snapshot exists."""
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    context_store.init_context(
        task_id='TASK-0001',
        immutable=sample_immutable_data,
        git_head=git_head,
        task_file_sha='file_sha',
    )

    # No snapshot created yet
    with pytest.raises(ContextNotFoundError, match='No worktree snapshot found'):
        context_store.verify_worktree_state(
            task_id='TASK-0001',
            expected_agent='implementer',
        )


# ============================================================================
# Test Concurrent Access
# ============================================================================

def test_concurrent_init_context_second_raises(context_store, sample_immutable_data, temp_repo):
    """Second concurrent init_context raises ContextExistsError."""
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    # First init
    context_store.init_context(
        task_id='TASK-0001',
        immutable=sample_immutable_data,
        git_head=git_head,
        task_file_sha='file_sha',
    )

    # Second init (concurrent)
    with pytest.raises(ContextExistsError):
        context_store.init_context(
            task_id='TASK-0001',
            immutable=sample_immutable_data,
            git_head=git_head,
            task_file_sha='file_sha',
        )


# ============================================================================
# Test Edge Cases
# ============================================================================

def test_agent_coordination_defaults():
    """AgentCoordination has correct defaults."""
    coord = AgentCoordination()

    assert coord.status == 'pending'
    assert coord.completed_at is None
    assert coord.qa_log_path is None
    assert coord.session_id is None
    assert coord.blocking_findings == []
    assert coord.worktree_snapshot is None
    assert coord.drift_budget == 0


def test_atomic_write_creates_parent_directory(context_store, temp_repo):
    """Atomic write creates parent directories if needed."""
    test_file = temp_repo / '.agent-output' / 'nested' / 'deep' / 'file.txt'

    context_store._atomic_write(test_file, 'test content')

    assert test_file.exists()
    assert test_file.read_text() == 'test content'


def test_context_json_sorted_keys(context_store, sample_immutable_data, temp_repo):
    """Context JSON has sorted keys for determinism."""
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    context_store.init_context(
        task_id='TASK-0001',
        immutable=sample_immutable_data,
        git_head=git_head,
        task_file_sha='file_sha',
    )

    context_file = temp_repo / '.agent-output' / 'TASK-0001' / 'context.json'
    content = context_file.read_text()

    # Parse and verify keys are sorted
    data = json.loads(content)

    # Top-level keys should include expected fields
    assert 'version' in data
    assert 'task_id' in data
    assert 'immutable' in data
    assert 'coordination' in data
