"""
Tests for delta_tracking module.

Tests worktree snapshotting, incremental diff calculation, and drift detection.
"""

import subprocess
from pathlib import Path

import pytest

from tasks_cli.context_store.delta_tracking import (
    DeltaTracker,
    normalize_diff_for_hashing,
    calculate_scope_hash,
)
from tasks_cli.exceptions import ValidationError, DriftError


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
def delta_tracker(temp_repo):
    """Create DeltaTracker instance."""
    return DeltaTracker(temp_repo)


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
# Test DeltaTracker Basic Methods
# ============================================================================

def test_get_current_git_head(delta_tracker, temp_repo):
    """Test _get_current_git_head returns valid SHA."""
    head = delta_tracker._get_current_git_head()

    # Should be valid git SHA (40 hex chars)
    assert len(head) == 40
    assert all(c in '0123456789abcdef' for c in head)

    # Should match git rev-parse HEAD
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    )
    expected_head = result.stdout.strip()
    assert head == expected_head


def test_is_working_tree_dirty_clean(delta_tracker, temp_repo):
    """Test _is_working_tree_dirty returns False for clean tree."""
    # Working tree is clean after initial commit
    assert not delta_tracker._is_working_tree_dirty()


def test_is_working_tree_dirty_modified(delta_tracker, temp_repo):
    """Test _is_working_tree_dirty returns True for modified files."""
    test_file = temp_repo / "test.txt"
    test_file.write_text("modified content\n")

    assert delta_tracker._is_working_tree_dirty()


def test_is_working_tree_dirty_untracked(delta_tracker, temp_repo):
    """Test _is_working_tree_dirty returns True for untracked files."""
    new_file = temp_repo / "new.txt"
    new_file.write_text("new content\n")

    assert delta_tracker._is_working_tree_dirty()


def test_calculate_file_sha256(delta_tracker, temp_repo):
    """Test _calculate_file_sha256 calculates correct hash."""
    test_file = temp_repo / "test.txt"
    content = "test content\n"
    test_file.write_text(content)

    sha = delta_tracker._calculate_file_sha256(test_file)

    # Verify hash is correct
    import hashlib
    expected_sha = hashlib.sha256(content.encode()).hexdigest()
    assert sha == expected_sha


def test_get_untracked_files_in_scope(delta_tracker, temp_repo):
    """Test _get_untracked_files_in_scope filters correctly."""
    # Create in-scope and out-of-scope untracked files
    backend_dir = temp_repo / 'backend'
    backend_dir.mkdir()
    (backend_dir / 'in_scope.py').write_text('# In scope\n')

    mobile_dir = temp_repo / 'mobile'
    mobile_dir.mkdir()
    (mobile_dir / 'out_of_scope.tsx').write_text('// Out of scope\n')

    repo_paths = ['backend/']
    in_scope, out_of_scope = delta_tracker._get_untracked_files_in_scope(repo_paths)

    assert 'backend/in_scope.py' in in_scope
    assert 'mobile/out_of_scope.tsx' in out_of_scope


# ============================================================================
# Test Worktree Snapshot
# ============================================================================

def test_snapshot_worktree_raises_on_clean_tree(delta_tracker, temp_repo):
    """snapshot_worktree raises if working tree is clean."""
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    context_dir = temp_repo / '.agent-output' / 'TASK-0001'
    context_dir.mkdir(parents=True, exist_ok=True)

    # Working tree is clean (no changes)
    with pytest.raises(ValidationError, match='Working tree is clean'):
        delta_tracker.snapshot_worktree(
            base_commit=git_head,
            repo_paths=['backend/'],
            context_dir=context_dir,
            agent_role='implementer'
        )


def test_snapshot_worktree_captures_changes(delta_tracker, temp_repo):
    """snapshot_worktree captures working tree state."""
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    # Make changes to working tree
    test_file = temp_repo / 'test.txt'
    test_file.write_text('modified content\n')

    context_dir = temp_repo / '.agent-output' / 'TASK-0001'
    context_dir.mkdir(parents=True, exist_ok=True)

    # Snapshot
    snapshot = delta_tracker.snapshot_worktree(
        base_commit=git_head,
        repo_paths=['.'],  # Root scope
        context_dir=context_dir,
        agent_role='implementer'
    )

    assert snapshot.base_commit == git_head
    assert len(snapshot.files_changed) > 0
    assert snapshot.diff_sha  # Should have diff hash
    assert snapshot.scope_hash  # Should have scope hash

    # Verify diff file created
    diff_file = context_dir / 'implementer-from-base.diff'
    assert diff_file.exists()


# ============================================================================
# Test Verify Worktree State
# ============================================================================

def test_verify_worktree_state_success(delta_tracker, temp_repo):
    """verify_worktree_state succeeds when no drift."""
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    # Make changes
    test_file = temp_repo / 'test.txt'
    test_file.write_text('modified content\n')

    context_dir = temp_repo / '.agent-output' / 'TASK-0001'
    context_dir.mkdir(parents=True, exist_ok=True)

    # Snapshot
    snapshot = delta_tracker.snapshot_worktree(
        base_commit=git_head,
        repo_paths=['.'],
        context_dir=context_dir,
        agent_role='implementer'
    )

    # Verify should succeed (no additional changes)
    delta_tracker.verify_worktree_state(
        base_commit=snapshot.base_commit,
        diff_sha=snapshot.diff_sha,
        files_changed=snapshot.files_changed,
        scope_hash=snapshot.scope_hash,
        repo_paths=['.']
    )


def test_verify_worktree_state_detects_file_modification(delta_tracker, temp_repo):
    """verify_worktree_state detects manual file modifications."""
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    # Make changes
    test_file = temp_repo / 'test.txt'
    test_file.write_text('modified content\n')

    context_dir = temp_repo / '.agent-output' / 'TASK-0001'
    context_dir.mkdir(parents=True, exist_ok=True)

    # Snapshot
    snapshot = delta_tracker.snapshot_worktree(
        base_commit=git_head,
        repo_paths=['.'],
        context_dir=context_dir,
        agent_role='implementer'
    )

    # Modify file again (drift)
    test_file.write_text('further modifications\n')

    # Verify should fail
    with pytest.raises(DriftError, match='drift detected'):
        delta_tracker.verify_worktree_state(
            base_commit=snapshot.base_commit,
            diff_sha=snapshot.diff_sha,
            files_changed=snapshot.files_changed,
            scope_hash=snapshot.scope_hash,
            repo_paths=['.']
        )


def test_verify_worktree_state_detects_commit(delta_tracker, temp_repo):
    """verify_worktree_state detects if working tree was committed."""
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    # Make changes
    test_file = temp_repo / 'test.txt'
    test_file.write_text('modified content\n')

    context_dir = temp_repo / '.agent-output' / 'TASK-0001'
    context_dir.mkdir(parents=True, exist_ok=True)

    # Snapshot
    snapshot = delta_tracker.snapshot_worktree(
        base_commit=git_head,
        repo_paths=['.'],
        context_dir=context_dir,
        agent_role='implementer'
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
        delta_tracker.verify_worktree_state(
            base_commit=snapshot.base_commit,
            diff_sha=snapshot.diff_sha,
            files_changed=snapshot.files_changed,
            scope_hash=snapshot.scope_hash,
            repo_paths=['.']
        )


# ============================================================================
# Test Incremental Diff
# ============================================================================

def test_calculate_incremental_diff_success(delta_tracker, temp_repo):
    """Test incremental diff calculation when no conflicts."""
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    context_dir = temp_repo / '.agent-output' / 'TASK-0001'
    context_dir.mkdir(parents=True, exist_ok=True)

    # Implementer makes changes to file A
    file_a = temp_repo / 'test.txt'
    file_a.write_text('implementer changes\n')

    # Snapshot implementer
    implementer_snapshot = delta_tracker.snapshot_worktree(
        base_commit=git_head,
        repo_paths=['.'],
        context_dir=context_dir,
        agent_role='implementer'
    )

    # Reviewer makes additional changes to file B
    file_b = temp_repo / 'test2.txt'
    file_b.write_text('reviewer changes\n')

    # Calculate incremental diff
    implementer_diff_file = context_dir / 'implementer-from-base.diff'
    inc_diff, inc_error = delta_tracker._calculate_incremental_diff(
        implementer_diff_file=implementer_diff_file,
        base_commit=git_head,
        repo_paths=['.']
    )

    assert inc_diff is not None
    assert inc_error is None
    assert 'test2.txt' in inc_diff


def test_calculate_incremental_diff_no_changes(delta_tracker, temp_repo):
    """Test incremental diff when reviewer makes no additional changes."""
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    context_dir = temp_repo / '.agent-output' / 'TASK-0001'
    context_dir.mkdir(parents=True, exist_ok=True)

    # Implementer makes changes
    test_file = temp_repo / 'test.txt'
    test_file.write_text('implementer changes\n')

    # Snapshot implementer
    delta_tracker.snapshot_worktree(
        base_commit=git_head,
        repo_paths=['.'],
        context_dir=context_dir,
        agent_role='implementer'
    )

    # Reviewer makes NO additional changes (same state as implementer)
    # Calculate incremental diff
    implementer_diff_file = context_dir / 'implementer-from-base.diff'
    inc_diff, inc_error = delta_tracker._calculate_incremental_diff(
        implementer_diff_file=implementer_diff_file,
        base_commit=git_head,
        repo_paths=['.']
    )

    # Should have error indicating no incremental changes
    assert inc_diff is None
    assert inc_error is not None
    assert 'No incremental changes detected' in inc_error
