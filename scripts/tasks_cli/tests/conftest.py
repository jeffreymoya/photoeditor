"""
Shared pytest fixtures and utilities for task context store tests.

This module provides reusable fixtures for testing the context store implementation,
including mock repositories, task files, standards files, and helper functions.
"""

import pytest
import git
import tempfile
from pathlib import Path
import shutil
import json
from typing import Tuple, Dict, Any


# ============================================================================
# Directory Structure Fixtures
# ============================================================================

@pytest.fixture
def tmp_task_repo(tmp_path):
    """Create temporary task repository with full structure.

    Returns:
        Tuple[Path, git.Repo]: Tuple of (repo_path, git_repo)
    """
    # Create directory structure
    (tmp_path / "tasks").mkdir()
    (tmp_path / "tasks/.context").mkdir()
    (tmp_path / "standards").mkdir()
    (tmp_path / "backend/lambdas/upload").mkdir(parents=True)
    (tmp_path / "backend/services").mkdir(parents=True)
    (tmp_path / "backend/providers").mkdir(parents=True)
    (tmp_path / "mobile/src/screens").mkdir(parents=True)
    (tmp_path / "mobile/assets/images").mkdir(parents=True)
    (tmp_path / "shared/schemas").mkdir(parents=True)

    # Initialize git repo FIRST
    repo = git.Repo.init(tmp_path)

    # Configure git user for commits
    with repo.config_writer() as config:
        config.set_value("user", "name", "Test User")
        config.set_value("user", "email", "test@example.com")

    # Create initial commit
    (tmp_path / "README.md").write_text("# PhotoEditor Test Repo")
    repo.index.add(["README.md"])
    repo.index.commit("Initial commit")

    # Copy fixture files
    fixtures_dir = Path(__file__).parent / "fixtures"

    # Copy task files
    task_files = []
    for task_file in (fixtures_dir / "tasks").glob("*.yaml"):
        dest = tmp_path / "tasks" / task_file.name
        shutil.copy(task_file, dest)
        task_files.append(str(dest.relative_to(tmp_path)))

    # Copy standards files
    std_files = []
    for std_file in (fixtures_dir / "standards").glob("*.md"):
        dest = tmp_path / "standards" / std_file.name
        shutil.copy(std_file, dest)
        std_files.append(str(dest.relative_to(tmp_path)))

    # Commit the fixture files so they're tracked
    if task_files or std_files:
        repo.index.add(task_files + std_files)
        repo.index.commit("Add test fixtures")

    return tmp_path, repo


# ============================================================================
# Git Repository State Fixtures
# ============================================================================

@pytest.fixture
def mock_repo_clean(tmp_task_repo):
    """Git repo with clean working tree.

    Returns:
        Tuple[Path, git.Repo]: Tuple of (repo_path, git_repo)
    """
    tmp_path, repo = tmp_task_repo
    return tmp_path, repo


@pytest.fixture
def mock_repo_dirty(tmp_task_repo):
    """Git repo with uncommitted changes.

    Returns:
        Tuple[Path, git.Repo]: Tuple of (repo_path, git_repo)
    """
    tmp_path, repo = tmp_task_repo

    # Modify file
    (tmp_path / "README.md").write_text("# PhotoEditor\n\nModified content")

    return tmp_path, repo


@pytest.fixture
def mock_repo_with_staged_changes(tmp_task_repo):
    """Git repo with staged but uncommitted changes.

    Returns:
        Tuple[Path, git.Repo]: Tuple of (repo_path, git_repo)
    """
    tmp_path, repo = tmp_task_repo

    # Create and stage new file
    new_file = tmp_path / "backend/services/new_service.ts"
    new_file.write_text("export const newService = () => {};")
    repo.index.add([str(new_file.relative_to(tmp_path))])

    return tmp_path, repo


@pytest.fixture
def mock_repo_with_untracked(tmp_task_repo):
    """Git repo with untracked files.

    Returns:
        Tuple[Path, git.Repo]: Tuple of (repo_path, git_repo)
    """
    tmp_path, repo = tmp_task_repo

    # Create untracked file
    untracked = tmp_path / "backend/services/untracked.ts"
    untracked.write_text("export const untracked = true;")

    return tmp_path, repo


# ============================================================================
# Context Store State Fixtures
# ============================================================================

@pytest.fixture
def initialized_context(tmp_task_repo):
    """Context initialized for TASK-9001.

    Returns:
        Tuple[Path, git.Repo]: Tuple of (repo_path, git_repo)
    """
    from tasks_cli.context_store import TaskContextStore
    import hashlib
    import subprocess

    tmp_path, repo = tmp_task_repo
    task_file = tmp_path / "tasks/TASK-9001-simple.task.yaml"

    # Change to repo directory for context initialization
    import os
    original_cwd = os.getcwd()
    try:
        os.chdir(tmp_path)

        # Get current git HEAD
        result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=tmp_path,
            capture_output=True,
            text=True,
            check=True
        )
        git_head = result.stdout.strip()

        # Calculate task file SHA
        task_content = task_file.read_bytes()
        task_file_sha = hashlib.sha256(task_content).hexdigest()

        # Build minimal immutable context
        immutable = {
            'task_snapshot': {
                'title': 'Simple test task',
                'priority': 'P2',
                'area': 'backend',
                'description': 'A minimal task for basic testing',
                'scope_in': ['Test basic context initialization'],
                'scope_out': ['Complex scenarios'],
                'acceptance_criteria': ['Context created successfully'],
            },
            'standards_citations': [
                {
                    'file': 'standards/backend-tier.md',
                    'section': 'testing',
                    'requirement': 'Test coverage requirement',
                    'line_span': None,
                    'content_sha': None,
                }
            ],
            'validation_baseline': {
                'commands': ['echo "test"'],
                'initial_results': None,
            },
            'repo_paths': [],
        }

        # Initialize context
        context_store = TaskContextStore(tmp_path)
        context_store.init_context(
            task_id="TASK-9001",
            immutable=immutable,
            git_head=git_head,
            task_file_sha=task_file_sha,
            created_by="test-fixture"
        )
    finally:
        os.chdir(original_cwd)

    return tmp_path, repo


@pytest.fixture
def initialized_context_with_snapshot(initialized_context):
    """Context with implementer snapshot.

    Returns:
        Tuple[Path, git.Repo]: Tuple of (repo_path, git_repo)
    """
    from tasks_cli.context_store import TaskContextStore
    import subprocess

    tmp_path, repo = initialized_context

    # Make changes
    service_file = tmp_path / "backend/services/upload.ts"
    service_file.write_text("export const upload = () => { return 'uploaded'; };")

    # Change to repo directory for snapshot
    import os
    original_cwd = os.getcwd()
    try:
        os.chdir(tmp_path)

        # Get git HEAD
        result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=tmp_path,
            capture_output=True,
            text=True,
            check=True
        )
        base_commit = result.stdout.strip()

        context_store = TaskContextStore(tmp_path)
        context_store.snapshot_worktree(
            task_id="TASK-9001",
            agent_role="implementer",
            actor="test-fixture",
            base_commit=base_commit
        )
    finally:
        os.chdir(original_cwd)

    return tmp_path, repo


@pytest.fixture
def initialized_context_with_implementer_and_reviewer(initialized_context_with_snapshot):
    """Context with both implementer and reviewer snapshots.

    Returns:
        Tuple[Path, git.Repo]: Tuple of (repo_path, git_repo)
    """
    from tasks_cli.context_store import TaskContextStore
    import subprocess

    tmp_path, repo = initialized_context_with_snapshot

    # Change to repo directory
    import os
    original_cwd = os.getcwd()
    try:
        os.chdir(tmp_path)

        context_store = TaskContextStore(tmp_path)

        # Mark implementer completed
        context_store.update_coordination(
            task_id="TASK-9001",
            agent_role="implementer",
            updates={'status': 'done'},
            actor="test-fixture"
        )

        # Reviewer makes additional changes (create a new file to ensure dirty state)
        reviewer_file = tmp_path / "backend/services/review_comments.ts"
        reviewer_file.write_text("export const reviewComments = 'Looks good!';")

        # Also modify the existing file
        service_file = tmp_path / "backend/services/upload.ts"
        current_content = service_file.read_text()
        service_file.write_text(current_content + "\n\n// Reviewed and approved")

        # Get git HEAD
        result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=tmp_path,
            capture_output=True,
            text=True,
            check=True
        )
        base_commit = result.stdout.strip()

        context_store.snapshot_worktree(
            task_id="TASK-9001",
            agent_role="reviewer",
            actor="test-fixture",
            base_commit=base_commit,
            previous_agent="implementer"
        )
    finally:
        os.chdir(original_cwd)

    return tmp_path, repo


@pytest.fixture
def initialized_context_with_drift(initialized_context_with_snapshot):
    """Context with detected drift (manual file edit after snapshot).

    Returns:
        Tuple[Path, git.Repo]: Tuple of (repo_path, git_repo)
    """
    from tasks_cli.context_store import TaskContextStore, DriftError

    tmp_path, repo = initialized_context_with_snapshot

    # Manual edit (not through context store)
    random_file = tmp_path / "backend/services/random_edit.ts"
    random_file.write_text("export const manual = true;")

    # Change to repo directory
    import os
    original_cwd = os.getcwd()
    try:
        os.chdir(tmp_path)

        context_store = TaskContextStore(tmp_path)

        # Try to verify (will detect drift and increment drift_budget)
        try:
            context_store.verify_worktree_state(
                task_id="TASK-9001",
                expected_agent="implementer"
            )
        except DriftError:
            pass  # Expected
    finally:
        os.chdir(original_cwd)

    return tmp_path, repo


@pytest.fixture
def initialized_context_with_baseline(tmp_task_repo):
    """Context initialized with validation baseline.

    Returns:
        Tuple[Path, git.Repo]: Tuple of (repo_path, git_repo)
    """
    from tasks_cli.context_store import TaskContextStore
    import hashlib
    import subprocess

    tmp_path, repo = tmp_task_repo
    task_file = tmp_path / "tasks/TASK-9010-with-baseline.task.yaml"

    # Change to repo directory
    import os
    original_cwd = os.getcwd()
    try:
        os.chdir(tmp_path)

        # Get current git HEAD
        result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=tmp_path,
            capture_output=True,
            text=True,
            check=True
        )
        git_head = result.stdout.strip()

        # Calculate task file SHA
        task_content = task_file.read_bytes()
        task_file_sha = hashlib.sha256(task_content).hexdigest()

        # Build minimal immutable context with baseline
        immutable = {
            'task_snapshot': {
                'title': 'Task with validation baseline',
                'priority': 'P1',
                'area': 'backend',
                'description': 'Task with QA baseline',
                'scope_in': [],
                'scope_out': [],
                'acceptance_criteria': [],
            },
            'standards_citations': [
                {
                    'file': 'standards/backend-tier.md',
                    'section': 'testing',
                    'requirement': 'Test coverage requirement',
                    'line_span': None,
                    'content_sha': None,
                }
            ],
            'validation_baseline': {
                'commands': ['pnpm turbo run test --filter=@photoeditor/backend'],
                'initial_results': {
                    'passed': True,
                    'coverage': {'lines': 85.0, 'branches': 75.0}
                },
            },
            'repo_paths': [],
        }

        # Initialize context
        context_store = TaskContextStore(tmp_path)
        context_store.init_context(
            task_id="TASK-9010",
            immutable=immutable,
            git_head=git_head,
            task_file_sha=task_file_sha,
            created_by="test-fixture"
        )
    finally:
        os.chdir(original_cwd)

    return tmp_path, repo


# ============================================================================
# Helper Utilities
# ============================================================================

def assert_context_exists(task_id: str, tmp_path: Path):
    """Assert context directory exists for task.

    Args:
        task_id: Task ID (e.g., "TASK-9001")
        tmp_path: Path to repository root

    Raises:
        AssertionError: If context directory or context.json not found
    """
    context_dir = tmp_path / f"tasks/.context/{task_id}"
    assert context_dir.exists(), f"Context directory not found for {task_id}"
    assert (context_dir / "context.json").exists(), f"context.json not found for {task_id}"


def assert_diff_file_exists(task_id: str, agent: str, diff_type: str, tmp_path: Path):
    """Assert diff file exists (either plain or compressed).

    Args:
        task_id: Task ID
        agent: Agent name (implementer, reviewer, validator)
        diff_type: Diff type (cumulative, incremental)
        tmp_path: Path to repository root

    Raises:
        AssertionError: If diff file not found
    """
    context_dir = tmp_path / f"tasks/.context/{task_id}"
    diff_file = context_dir / f"diff-{agent}-{diff_type}.patch"
    compressed = context_dir / f"{diff_file.name}.gz"

    assert diff_file.exists() or compressed.exists(), \
        f"Diff file not found: {diff_file} (checked both plain and .gz)"


def load_context_json(task_id: str, tmp_path: Path) -> Dict[str, Any]:
    """Load and parse context.json.

    Args:
        task_id: Task ID
        tmp_path: Path to repository root

    Returns:
        Dict containing parsed context.json

    Raises:
        FileNotFoundError: If context.json not found
        json.JSONDecodeError: If context.json is invalid JSON
    """
    context_file = tmp_path / f"tasks/.context/{task_id}/context.json"
    with open(context_file) as f:
        return json.load(f)


def create_large_file_changes(tmp_path: Path, count: int = 100):
    """Create many file changes for stress testing.

    Args:
        tmp_path: Path to repository root
        count: Number of files to create (default: 100)
    """
    for i in range(count):
        file = tmp_path / f"backend/services/generated_{i}.ts"
        file.write_text(f"export const service{i} = () => {{ return {i}; }};")


def get_fixture_path(fixture_name: str) -> Path:
    """Get path to a fixture file.

    Args:
        fixture_name: Relative path within fixtures directory

    Returns:
        Absolute path to fixture file
    """
    return Path(__file__).parent / "fixtures" / fixture_name


def read_qa_output(qa_file: str) -> str:
    """Read sample QA output file.

    Args:
        qa_file: Filename in qa_outputs directory

    Returns:
        Contents of QA output file
    """
    qa_path = get_fixture_path(f"qa_outputs/{qa_file}")
    return qa_path.read_text()


def create_mock_standards_change(tmp_path: Path, standards_file: str, new_content: str):
    """Modify a standards file to test SHA mismatch detection.

    Args:
        tmp_path: Path to repository root
        standards_file: Relative path to standards file (e.g., "backend-tier.md")
        new_content: New content to write
    """
    std_file = tmp_path / "standards" / standards_file
    std_file.write_text(new_content)


# ============================================================================
# Parametrized Test Data
# ============================================================================

@pytest.fixture(params=["TASK-9001", "TASK-9002", "TASK-9003"])
def task_id_variants(request):
    """Parametrized fixture providing multiple task IDs for testing.

    Returns:
        str: Task ID
    """
    return request.param


@pytest.fixture(params=["implementer", "reviewer", "validator"])
def agent_variants(request):
    """Parametrized fixture providing all agent types.

    Returns:
        str: Agent name
    """
    return request.param


@pytest.fixture(params=["cumulative", "incremental"])
def diff_type_variants(request):
    """Parametrized fixture providing diff types.

    Returns:
        str: Diff type
    """
    return request.param
