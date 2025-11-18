"""Git utilities for CLI operations."""

import subprocess
from pathlib import Path
from typing import List, Optional, Tuple


def check_dirty_tree(
    repo_root: Path,
    allow_preexisting: bool = False,
    expected_files: Optional[List[str]] = None,
) -> Tuple[bool, List[str]]:
    """
    Check if git working tree is dirty.

    Args:
        repo_root: Repository root path
        allow_preexisting: If True, allow pre-existing dirty files
        expected_files: List of file patterns expected to be modified

    Returns:
        Tuple of (is_clean, dirty_files)
        - is_clean: True if tree is clean or only expected files are dirty
        - dirty_files: List of dirty file paths
    """
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=repo_root,
            capture_output=True,
            text=True,
            timeout=5,
        )

        if result.returncode != 0:
            raise RuntimeError(f"git status failed: {result.stderr}")

        dirty_files = []
        for line in result.stdout.strip().split('\n'):
            if not line:
                continue

            # Parse git status porcelain format
            # Format: XY filename (with space separator)
            # X = index status, Y = worktree status
            status = line[:2]
            # Skip the two status chars and the space
            filename = line[2:].strip()

            # Skip untracked files if allow_preexisting
            if allow_preexisting and status.strip() == '??':
                continue

            dirty_files.append(filename)

        # If expected_files provided, filter to unexpected changes
        if expected_files is not None:
            unexpected = [
                f
                for f in dirty_files
                if not any(f.startswith(pattern) for pattern in expected_files)
            ]
            is_clean = len(unexpected) == 0
            return is_clean, unexpected

        is_clean = len(dirty_files) == 0
        return is_clean, dirty_files

    except subprocess.TimeoutExpired:
        raise RuntimeError("git status command timed out")
    except FileNotFoundError:
        raise RuntimeError("git command not found")


def get_current_commit(repo_root: Path) -> str:
    """
    Get current commit SHA.

    Args:
        repo_root: Repository root path

    Returns:
        Current commit SHA (full 40-char hash)
    """
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=repo_root,
            capture_output=True,
            text=True,
            timeout=5,
        )

        if result.returncode != 0:
            raise RuntimeError(f"git rev-parse failed: {result.stderr}")

        return result.stdout.strip()

    except subprocess.TimeoutExpired:
        raise RuntimeError("git rev-parse command timed out")
    except FileNotFoundError:
        raise RuntimeError("git command not found")


def get_current_branch(repo_root: Path) -> Optional[str]:
    """
    Get current branch name.

    Args:
        repo_root: Repository root path

    Returns:
        Branch name or None if detached HEAD
    """
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=repo_root,
            capture_output=True,
            text=True,
            timeout=5,
        )

        if result.returncode != 0:
            return None

        branch = result.stdout.strip()

        # "HEAD" means detached HEAD state
        if branch == "HEAD":
            return None

        return branch

    except (subprocess.TimeoutExpired, FileNotFoundError):
        return None


def is_git_repo(path: Path) -> bool:
    """
    Check if path is inside a git repository.

    Args:
        path: Path to check

    Returns:
        True if inside a git repo
    """
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--git-dir"],
            cwd=path,
            capture_output=True,
            text=True,
            timeout=5,
        )

        return result.returncode == 0

    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False
