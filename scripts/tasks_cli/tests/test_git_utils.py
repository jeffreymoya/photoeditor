"""Tests for git utilities."""

import subprocess
from pathlib import Path

import pytest

from scripts.tasks_cli.git_utils import (
    check_dirty_tree,
    get_current_branch,
    get_current_commit,
    is_git_repo,
)


@pytest.fixture
def git_repo(tmp_path):
    """Create a temporary git repository."""
    repo = tmp_path / "repo"
    repo.mkdir()

    # Initialize git repo
    subprocess.run(["git", "init"], cwd=repo, check=True, capture_output=True)
    subprocess.run(
        ["git", "config", "user.email", "test@example.com"],
        cwd=repo,
        check=True,
        capture_output=True,
    )
    subprocess.run(
        ["git", "config", "user.name", "Test User"],
        cwd=repo,
        check=True,
        capture_output=True,
    )

    # Create initial commit
    (repo / "README.md").write_text("# Test")
    subprocess.run(["git", "add", "."], cwd=repo, check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", "Initial commit"],
        cwd=repo,
        check=True,
        capture_output=True,
    )

    return repo


def test_check_dirty_tree_clean(git_repo):
    """Test checking clean working tree."""
    is_clean, dirty_files = check_dirty_tree(git_repo)

    assert is_clean is True
    assert dirty_files == []


def test_check_dirty_tree_modified(git_repo):
    """Test checking dirty tree with modified file."""
    # Modify file
    (git_repo / "README.md").write_text("# Modified")

    is_clean, dirty_files = check_dirty_tree(git_repo)

    assert is_clean is False
    assert "README.md" in dirty_files


def test_check_dirty_tree_untracked(git_repo):
    """Test checking dirty tree with untracked file."""
    # Add untracked file
    (git_repo / "new_file.txt").write_text("New")

    is_clean, dirty_files = check_dirty_tree(git_repo)

    assert is_clean is False
    assert "new_file.txt" in dirty_files


def test_check_dirty_tree_allow_preexisting(git_repo):
    """Test allowing pre-existing dirty files (untracked)."""
    # Add untracked file
    (git_repo / "untracked.txt").write_text("Untracked")

    is_clean, dirty_files = check_dirty_tree(git_repo, allow_preexisting=True)

    # Untracked files should be ignored with allow_preexisting
    assert is_clean is True
    assert dirty_files == []


def test_check_dirty_tree_expected_files(git_repo):
    """Test checking with expected file patterns."""
    # Modify files
    (git_repo / "README.md").write_text("# Modified")
    (git_repo / "scripts/test.py").parent.mkdir(parents=True, exist_ok=True)
    (git_repo / "scripts/test.py").write_text("print('test')")

    subprocess.run(["git", "add", "."], cwd=git_repo, check=True, capture_output=True)

    # Only scripts/ is expected
    is_clean, unexpected = check_dirty_tree(git_repo, expected_files=["scripts/"])

    assert is_clean is False
    assert "README.md" in unexpected
    assert not any("scripts/" in f for f in unexpected)


def test_check_dirty_tree_expected_files_clean(git_repo):
    """Test checking when all dirty files are expected."""
    # Modify expected file
    (git_repo / "scripts/test.py").parent.mkdir(parents=True, exist_ok=True)
    (git_repo / "scripts/test.py").write_text("print('test')")

    subprocess.run(["git", "add", "."], cwd=git_repo, check=True, capture_output=True)

    is_clean, unexpected = check_dirty_tree(git_repo, expected_files=["scripts/"])

    assert is_clean is True
    assert unexpected == []


def test_get_current_commit(git_repo):
    """Test getting current commit SHA."""
    commit_sha = get_current_commit(git_repo)

    assert commit_sha is not None
    assert len(commit_sha) == 40  # Full SHA
    assert all(c in '0123456789abcdef' for c in commit_sha)


def test_get_current_branch(git_repo):
    """Test getting current branch name."""
    branch = get_current_branch(git_repo)

    # Default branch could be 'master' or 'main'
    assert branch in ["master", "main"]


def test_get_current_branch_after_checkout(git_repo):
    """Test getting branch after creating and checking out new branch."""
    # Create and checkout new branch
    subprocess.run(
        ["git", "checkout", "-b", "feature-test"],
        cwd=git_repo,
        check=True,
        capture_output=True,
    )

    branch = get_current_branch(git_repo)

    assert branch == "feature-test"


def test_is_git_repo_true(git_repo):
    """Test checking if path is in git repo."""
    assert is_git_repo(git_repo) is True


def test_is_git_repo_false(tmp_path):
    """Test checking non-git directory."""
    non_repo = tmp_path / "not-a-repo"
    non_repo.mkdir()

    assert is_git_repo(non_repo) is False


def test_is_git_repo_subdirectory(git_repo):
    """Test checking subdirectory of git repo."""
    subdir = git_repo / "subdir"
    subdir.mkdir()

    assert is_git_repo(subdir) is True


def test_check_dirty_tree_not_git_repo(tmp_path):
    """Test checking dirty tree in non-git directory."""
    non_repo = tmp_path / "not-a-repo"
    non_repo.mkdir()

    with pytest.raises(RuntimeError, match="git status failed"):
        check_dirty_tree(non_repo)


def test_get_current_commit_not_git_repo(tmp_path):
    """Test getting commit in non-git directory."""
    non_repo = tmp_path / "not-a-repo"
    non_repo.mkdir()

    with pytest.raises(RuntimeError, match="git rev-parse failed"):
        get_current_commit(non_repo)
