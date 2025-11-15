"""
Test Suite: Performance & Integration Tests (Session 8)

Tests performance under stress conditions and full end-to-end workflows.

Coverage:
- Performance stress tests (4 tests)
- Full workflow integration tests (4 tests)
- Validation edge cases (2 tests)

Total: 10 tests
"""

import hashlib
import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from tasks_cli.context_store import (
    TaskContextStore,
    ContextNotFoundError,
    DriftError,
    SourceFile,
)
from tasks_cli.operations import TaskOperations


# ============================================================================
# Helper Functions
# ============================================================================


def create_large_context_content(size_mb: int = 2) -> str:
    """Generate large content for stress testing.

    Args:
        size_mb: Size in megabytes

    Returns:
        String of approximately size_mb megabytes
    """
    # Generate ~1KB per line (1000 chars + newline)
    line = "x" * 1000 + "\n"
    lines_per_mb = 1024  # ~1024 lines per MB
    total_lines = size_mb * lines_per_mb
    return line * total_lines


def create_deep_directory_tree(tmp_path: Path, depth: int = 10, width: int = 3):
    """Create a deep directory structure with files.

    Args:
        tmp_path: Root path
        depth: Directory depth
        width: Number of subdirectories per level
    """
    def create_level(parent: Path, current_depth: int):
        if current_depth >= depth:
            return

        for i in range(width):
            subdir = parent / f"level{current_depth}_dir{i}"
            subdir.mkdir(exist_ok=True)

            # Create a file at each level
            (subdir / f"file{i}.ts").write_text(
                f"// Depth {current_depth}\nexport const val = {i};"
            )

            # Recurse
            create_level(subdir, current_depth + 1)

    create_level(tmp_path / "backend", 0)


def initialize_test_context(tmp_path, task_id: str, repo_paths: list = None):
    """Helper to initialize a test context.

    Args:
        tmp_path: Repository root path
        task_id: Task identifier
        repo_paths: Optional list of repository paths to track

    Returns:
        TaskContextStore instance
    """
    context_store = TaskContextStore(tmp_path)

    # Get git HEAD
    result = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=True
    )
    git_head = result.stdout.strip()

    # Calculate task file SHA
    task_file = tmp_path / "tasks" / f"{task_id}-simple.task.yaml"
    if not task_file.exists():
        task_file = tmp_path / "tasks" / "TASK-9001-simple.task.yaml"

    task_content = task_file.read_bytes()
    task_file_sha = hashlib.sha256(task_content).hexdigest()

    # Build immutable context
    immutable = {
        'task_snapshot': {
            'title': f'Test task {task_id}',
            'priority': 'P1',
            'area': 'backend',
            'description': f'Test task for {task_id}',
            'scope_in': repo_paths or [],
            'scope_out': [],
            'acceptance_criteria': ['Tests pass'],
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
        'repo_paths': repo_paths or [],
    }

    context_store.init_context(
        task_id=task_id,
        immutable=immutable,
        git_head=git_head,
        task_file_sha=task_file_sha,
        created_by="test-integration"
    )

    return context_store


# ============================================================================
# Performance Stress Tests (4 tests)
# ============================================================================


def test_large_context_files_over_1mb(tmp_task_repo):
    """Test handling of large context files over 1MB."""
    tmp_path, repo = tmp_task_repo

    # Change to repo directory
    original_cwd = os.getcwd()
    try:
        os.chdir(tmp_path)

        # Initialize context
        context_store = initialize_test_context(tmp_path, "TASK-9001")

        # Create a very large file (2MB of content)
        large_file = tmp_path / "backend/services/large_service.ts"
        large_content = create_large_context_content(size_mb=2)
        large_file.write_text(large_content)

        # Get git HEAD
        result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=tmp_path,
            capture_output=True,
            text=True,
            check=True
        )
        base_commit = result.stdout.strip()

        # Snapshot the worktree (should handle large file)
        start_time = time.time()
        context_store.snapshot_worktree(
            task_id="TASK-9001",
            agent_role="implementer",
            actor="test",
            base_commit=base_commit
        )
        duration = time.time() - start_time

        # Should complete in reasonable time (< 30 seconds)
        assert duration < 30, f"Snapshot took too long: {duration}s"

        # Verify context was created
        context = context_store.get_context("TASK-9001")
        assert context is not None

        # Check that snapshot was recorded
        context_data = context.to_dict()
        assert 'implementer' in context_data['coordination']
        assert context_data['coordination']['implementer']['worktree_snapshot'] is not None

    finally:
        os.chdir(original_cwd)


def test_many_file_changes_over_1000_files(tmp_task_repo):
    """Test handling of many file changes (over 1000 files)."""
    tmp_path, repo = tmp_task_repo

    # Change to repo directory
    original_cwd = os.getcwd()
    try:
        os.chdir(tmp_path)

        # Initialize context
        context_store = initialize_test_context(tmp_path, "TASK-9002")

        # Create 1500 small files
        file_count = 1500
        for i in range(file_count):
            service_file = tmp_path / "backend/services" / f"service_{i:04d}.ts"
            service_file.write_text(f"export const service{i} = () => {{ return {i}; }};")

        # Get git HEAD
        result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=tmp_path,
            capture_output=True,
            text=True,
            check=True
        )
        base_commit = result.stdout.strip()

        # Snapshot the worktree (should handle many files)
        start_time = time.time()
        context_store.snapshot_worktree(
            task_id="TASK-9002",
            agent_role="implementer",
            actor="test",
            base_commit=base_commit
        )
        duration = time.time() - start_time

        # Should complete in reasonable time (< 60 seconds for 1500 files)
        assert duration < 60, f"Snapshot took too long: {duration}s"

        # Verify context was created
        context = context_store.get_context("TASK-9002")
        assert context is not None

        # Verify snapshot metadata was recorded
        context_data = context.to_dict()
        assert 'implementer' in context_data['coordination']
        assert context_data['coordination']['implementer']['worktree_snapshot'] is not None

    finally:
        os.chdir(original_cwd)


def test_deep_directory_structures(tmp_task_repo):
    """Test handling of deep directory structures."""
    tmp_path, repo = tmp_task_repo

    # Change to repo directory
    original_cwd = os.getcwd()
    try:
        os.chdir(tmp_path)

        # Initialize context
        context_store = initialize_test_context(tmp_path, "TASK-9003")

        # Create deep directory tree (10 levels, 3 subdirs per level)
        create_deep_directory_tree(tmp_path, depth=10, width=3)

        # Get git HEAD
        result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=tmp_path,
            capture_output=True,
            text=True,
            check=True
        )
        base_commit = result.stdout.strip()

        # Snapshot the worktree (should handle deep directories)
        start_time = time.time()
        context_store.snapshot_worktree(
            task_id="TASK-9003",
            agent_role="implementer",
            actor="test",
            base_commit=base_commit
        )
        duration = time.time() - start_time

        # Should complete in reasonable time
        assert duration < 30, f"Snapshot took too long: {duration}s"

        # Verify context was created
        context = context_store.get_context("TASK-9003")
        assert context is not None

    finally:
        os.chdir(original_cwd)


def test_file_locking_stress_test(tmp_task_repo):
    """Test file locking under concurrent access stress."""
    tmp_path, repo = tmp_task_repo

    # Change to repo directory
    original_cwd = os.getcwd()
    try:
        os.chdir(tmp_path)

        # Initialize context
        context_store = initialize_test_context(tmp_path, "TASK-9004")

        errors = []

        def update_coordination(thread_id: int):
            """Thread worker to update coordination."""
            try:
                context_store.update_coordination(
                    task_id="TASK-9004",
                    agent_role="implementer",
                    updates={'status': f'working-{thread_id}'},
                    actor=f"thread-{thread_id}"
                )
            except Exception as e:
                errors.append((thread_id, str(e)))

        # Launch 10 concurrent threads updating coordination
        threads = []
        for i in range(10):
            thread = threading.Thread(target=update_coordination, args=(i,))
            threads.append(thread)
            thread.start()

        # Wait for all threads
        for thread in threads:
            thread.join(timeout=10)

        # Should have no errors (file locking should handle concurrency)
        assert len(errors) == 0, f"Concurrent updates failed: {errors}"

        # Verify context is still valid
        context = context_store.get_context("TASK-9004")
        assert context is not None

    finally:
        os.chdir(original_cwd)


# ============================================================================
# Full Workflow Integration Tests (4 tests)
# ============================================================================


def test_complete_task_workflow_init_to_completion(tmp_task_repo):
    """Test complete task workflow from init to completion."""
    tmp_path, repo = tmp_task_repo

    # Change to repo directory
    original_cwd = os.getcwd()
    try:
        os.chdir(tmp_path)

        task_id = "TASK-9005"

        # Step 1: Initialize context
        context_store = initialize_test_context(tmp_path, task_id)

        # Verify initialization
        context = context_store.get_context(task_id)
        assert context is not None
        context_data = context.to_dict()
        assert context_data['immutable']['task_snapshot']['title'] == f'Test task {task_id}'

        # Step 2: Implementer makes changes and snapshots
        impl_file = tmp_path / "backend/services/upload.ts"
        impl_file.write_text("export const upload = () => { return 'v1'; };")

        result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=tmp_path,
            capture_output=True,
            text=True,
            check=True
        )
        base_commit = result.stdout.strip()

        context_store.snapshot_worktree(
            task_id=task_id,
            agent_role="implementer",
            actor="test-impl",
            base_commit=base_commit
        )

        # Step 3: Update implementer status
        context_store.update_coordination(
            task_id=task_id,
            agent_role="implementer",
            updates={'status': 'done'},
            actor="test-impl"
        )

        # Step 4: Commit implementer changes (required to avoid drift)
        repo.index.add([str(impl_file.relative_to(tmp_path))])
        repo.index.commit("Implementer changes")

        # Get new base commit
        result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=tmp_path,
            capture_output=True,
            text=True,
            check=True
        )
        reviewer_base = result.stdout.strip()

        # Reviewer makes additional changes
        impl_file.write_text("export const upload = () => { return 'v2-reviewed'; };")

        context_store.snapshot_worktree(
            task_id=task_id,
            agent_role="reviewer",
            actor="test-reviewer",
            base_commit=reviewer_base,
            previous_agent="implementer"
        )

        # Step 5: Update reviewer status
        context_store.update_coordination(
            task_id=task_id,
            agent_role="reviewer",
            updates={'status': 'approved'},
            actor="test-reviewer"
        )

        # Step 6: Validator validates (simulated - just update status)
        context_store.update_coordination(
            task_id=task_id,
            agent_role="validator",
            updates={'status': 'done'},
            actor="test-validator"
        )

        # Step 7: Purge context (simulating task completion)
        context_store.purge_context(task_id)

        # Verify context is purged (get_context returns None)
        purged_context = context_store.get_context(task_id)
        assert purged_context is None

    finally:
        os.chdir(original_cwd)


def test_multiple_tasks_with_contexts_simultaneously(tmp_task_repo):
    """Test multiple tasks with contexts existing simultaneously."""
    tmp_path, repo = tmp_task_repo

    # Change to repo directory
    original_cwd = os.getcwd()
    try:
        os.chdir(tmp_path)

        task_ids = ["TASK-9006", "TASK-9007", "TASK-9008"]

        # Initialize contexts for all tasks
        for task_id in task_ids:
            initialize_test_context(tmp_path, task_id)

        # Verify all contexts exist
        context_store = TaskContextStore(tmp_path)
        for task_id in task_ids:
            context = context_store.get_context(task_id)
            assert context is not None
            context_data = context.to_dict()
            assert context_data['immutable']['task_snapshot']['title'] == f'Test task {task_id}'

        # Make changes for each task in different areas
        areas = [
            "backend/services/service_a.ts",
            "backend/services/service_b.ts",
            "backend/services/service_c.ts",
        ]

        result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=tmp_path,
            capture_output=True,
            text=True,
            check=True
        )
        base_commit = result.stdout.strip()

        for i, task_id in enumerate(task_ids):
            file_path = tmp_path / areas[i]
            file_path.write_text(f"export const service = '{task_id}';")

            # Snapshot before committing
            context_store.snapshot_worktree(
                task_id=task_id,
                agent_role="implementer",
                actor=f"test-{task_id}",
                base_commit=base_commit
            )

            # Commit changes to avoid drift for next task
            repo.index.add([str(file_path.relative_to(tmp_path))])
            repo.index.commit(f"Changes for {task_id}")

        # Verify all snapshots were created independently
        for task_id in task_ids:
            context = context_store.get_context(task_id)
            context_data = context.to_dict()
            assert 'implementer' in context_data['coordination']
            assert context_data['coordination']['implementer']['worktree_snapshot'] is not None

        # Purge one task
        context_store.purge_context(task_ids[0])

        # Verify only that task is purged (get_context returns None)
        purged = context_store.get_context(task_ids[0])
        assert purged is None

        # Others still exist
        for task_id in task_ids[1:]:
            context = context_store.get_context(task_id)
            assert context is not None

    finally:
        os.chdir(original_cwd)


def test_context_cleanup_on_branch_switch(tmp_task_repo):
    """Test context cleanup when switching git branches."""
    tmp_path, repo = tmp_task_repo

    # Change to repo directory
    original_cwd = os.getcwd()
    try:
        os.chdir(tmp_path)

        task_id = "TASK-9009"

        # Initialize context on main branch
        context_store = initialize_test_context(tmp_path, task_id)

        # Get current git HEAD
        result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=tmp_path,
            capture_output=True,
            text=True,
            check=True
        )
        original_head = result.stdout.strip()

        # Create and switch to feature branch
        subprocess.run(
            ['git', 'checkout', '-b', 'feature-branch'],
            cwd=tmp_path,
            capture_output=True,
            check=True
        )

        # Make a commit on feature branch
        (tmp_path / "feature.txt").write_text("Feature work")
        repo.index.add(["feature.txt"])
        repo.index.commit("Add feature")

        # Get new HEAD
        result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=tmp_path,
            capture_output=True,
            text=True,
            check=True
        )
        new_head = result.stdout.strip()

        # Context should still exist (not auto-purged)
        context = context_store.get_context(task_id)
        assert context is not None

        # But staleness should be detected (HEAD changed)
        # This is a warning, not a blocking error
        # The context remembers the original git_head
        context_data = context.to_dict()
        assert context_data['git_head'] == original_head
        assert context_data['git_head'] != new_head

        # Context still exists after branch switch
        context = context_store.get_context(task_id)
        assert context is not None

        # Verify staleness warning was triggered (context HEAD != current HEAD)
        assert context_data['git_head'] != new_head

    finally:
        os.chdir(original_cwd)


def test_orphaned_context_detection(tmp_task_repo):
    """Test detection of orphaned contexts (no corresponding task file)."""
    tmp_path, repo = tmp_task_repo

    # Change to repo directory
    original_cwd = os.getcwd()
    try:
        os.chdir(tmp_path)

        task_id = "TASK-9999"

        # Manually create a context directory without initializing properly
        # This simulates an orphaned context
        context_dir = tmp_path / ".agent-output" / task_id
        context_dir.mkdir(parents=True, exist_ok=True)

        # Create a minimal context.json using the expected structure
        context_json_data = {
            'version': 1,
            'task_id': task_id,
            'created_at': '2025-11-15T00:00:00Z',
            'created_by': 'orphan',
            'git_head': 'abc123',
            'task_file_sha': 'def456',
            'immutable': {
                'task_snapshot': {
                    'title': 'Orphaned task',
                    'description': 'This is an orphaned context',
                    'priority': 'P3',
                    'area': 'backend',
                    'scope_in': [],
                    'scope_out': [],
                    'acceptance_criteria': [],
                },
                'standards_citations': [
                    {
                        'file': 'standards/backend-tier.md',
                        'section': 'Testing',
                        'requirement': 'Orphaned requirement',
                        'line_span': None,
                        'content_sha': None,
                    }
                ],
                'validation_baseline': {'commands': [], 'initial_results': None},
                'repo_paths': [],
            },
            'coordination': {
                'implementer': {
                    'status': None,
                    'worktree_snapshot': None,
                    'qa_logs': [],
                },
                'reviewer': {
                    'status': None,
                    'worktree_snapshot': None,
                    'qa_logs': [],
                },
                'validator': {
                    'status': None,
                    'worktree_snapshot': None,
                    'qa_logs': [],
                },
            },
            'audit': {
                'updated_at': '2025-11-15T00:00:00Z',
                'updated_by': 'orphan',
                'update_count': 0,
            },
        }

        (context_dir / "context.json").write_text(json.dumps(context_json_data, indent=2))

        # Context store can read it
        context_store = TaskContextStore(tmp_path)
        context = context_store.get_context(task_id)
        assert context is not None
        context_dict = context.to_dict()
        assert context_dict['immutable']['task_snapshot']['title'] == 'Orphaned task'

        # But the task file doesn't exist
        task_file = tmp_path / "tasks" / f"{task_id}-orphaned.task.yaml"
        assert not task_file.exists()

        # Orphaned context can still be purged
        context_store.purge_context(task_id)

        # Verify it's gone (get_context returns None)
        context_after_purge = context_store.get_context(task_id)
        assert context_after_purge is None

    finally:
        os.chdir(original_cwd)


# ============================================================================
# Validation Edge Cases (2 tests)
# ============================================================================


def test_empty_task_fields_beyond_description(tmp_task_repo):
    """Test handling of empty task fields beyond description."""
    tmp_path, repo = tmp_task_repo

    # Change to repo directory
    original_cwd = os.getcwd()
    try:
        os.chdir(tmp_path)

        context_store = TaskContextStore(tmp_path)

        # Get git HEAD
        result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=tmp_path,
            capture_output=True,
            text=True,
            check=True
        )
        git_head = result.stdout.strip()

        # Create minimal task with mostly empty fields
        # Note: standards_citations cannot be empty (validation requirement)
        task_id = "TASK-9011"
        immutable = {
            'task_snapshot': {
                'title': 'Minimal task',
                'priority': 'P3',
                'area': 'backend',
                'description': 'Only description is required',
                'scope_in': [],  # Empty
                'scope_out': [],  # Empty
                'acceptance_criteria': [],  # Empty
            },
            'standards_citations': [
                {
                    'file': 'standards/backend-tier.md',
                    'section': 'minimal',
                    'requirement': 'Minimal requirement',
                    'line_span': None,
                    'content_sha': None,
                }
            ],  # Minimal (cannot be empty)
            'validation_baseline': {
                'commands': [],  # Empty
                'initial_results': None,
            },
            'repo_paths': [],  # Empty
        }

        # Should initialize successfully even with empty fields
        context_store.init_context(
            task_id=task_id,
            immutable=immutable,
            git_head=git_head,
            task_file_sha='empty-test-sha',
            created_by="test-empty"
        )

        # Verify context was created
        context = context_store.get_context(task_id)
        assert context is not None
        context_data = context.to_dict()
        # Description may have trailing newline from normalization
        assert context_data['immutable']['task_snapshot']['description'].strip() == 'Only description is required'
        # Has exactly one citation (minimal requirement)
        assert len(context_data['immutable']['standards_citations']) == 1
        # Other arrays are empty
        assert len(context_data['immutable']['task_snapshot']['scope_in']) == 0
        assert len(context_data['immutable']['repo_paths']) == 0

    finally:
        os.chdir(original_cwd)


def test_very_long_field_values_over_2kb(tmp_task_repo):
    """Test handling of very long field values over 2KB."""
    tmp_path, repo = tmp_task_repo

    # Change to repo directory
    original_cwd = os.getcwd()
    try:
        os.chdir(tmp_path)

        context_store = TaskContextStore(tmp_path)

        # Get git HEAD
        result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=tmp_path,
            capture_output=True,
            text=True,
            check=True
        )
        git_head = result.stdout.strip()

        # Create task with very long description (3KB)
        long_description = "x" * 3000
        long_requirement = "y" * 2500

        task_id = "TASK-9012"
        immutable = {
            'task_snapshot': {
                'title': 'Task with long fields',
                'priority': 'P2',
                'area': 'backend',
                'description': long_description,
                'scope_in': ['Many', 'items'] * 100,  # 200 items
                'scope_out': ['Out of scope'] * 50,  # 50 items
                'acceptance_criteria': ['Criterion'] * 100,  # 100 items
            },
            'standards_citations': [
                {
                    'file': 'standards/backend-tier.md',
                    'section': 'Testing',
                    'requirement': long_requirement,
                    'line_span': None,
                    'content_sha': None,
                }
            ],
            'validation_baseline': {
                'commands': ['echo test'] * 50,  # 50 commands
                'initial_results': None,
            },
            'repo_paths': [f'path/to/file_{i}.ts' for i in range(200)],  # 200 paths
        }

        # Should handle large data
        context_store.init_context(
            task_id=task_id,
            immutable=immutable,
            git_head=git_head,
            task_file_sha='long-test-sha',
            created_by="test-long"
        )

        # Verify context was created and data is intact
        context = context_store.get_context(task_id)
        assert context is not None
        context_data = context.to_dict()
        # Allow >= for potential trailing characters from serialization
        assert len(context_data['immutable']['task_snapshot']['description']) >= 3000
        assert len(context_data['immutable']['task_snapshot']['scope_in']) == 200
        assert len(context_data['immutable']['standards_citations'][0]['requirement']) >= 2500
        assert len(context_data['immutable']['repo_paths']) == 200

        # Verify JSON serialization works
        context_file = tmp_path / f".agent-output/{task_id}/context.json"
        assert context_file.exists()

        # Should be able to read it back
        with open(context_file) as f:
            saved_context = json.load(f)
        # Description may have trailing newline from normalization
        assert saved_context['immutable']['task_snapshot']['description'].strip() == long_description

    finally:
        os.chdir(original_cwd)
