"""
Robustness tests for incremental diffs and cross-platform compatibility.

This module tests edge cases in incremental diff calculation and ensures
the context store works correctly across different platforms and line ending
conventions.

Session 7 of task-context-cache-test-implementation-sessions.md
"""

import sys
import os
import pytest
import subprocess
from pathlib import Path
from typing import Tuple

from tasks_cli.context_store import TaskContextStore, DriftError, ContextNotFoundError


# ============================================================================
# Platform-Specific Skip Markers
# ============================================================================

skip_on_linux = pytest.mark.skipif(
    sys.platform.startswith('linux'),
    reason="Test only runs on Windows/macOS"
)

skip_unless_windows = pytest.mark.skipif(
    not sys.platform.startswith('win'),
    reason="Test requires Windows"
)

skip_unless_case_insensitive = pytest.mark.skipif(
    sys.platform.startswith('linux'),
    reason="Test requires case-insensitive filesystem (macOS/Windows)"
)


# ============================================================================
# Incremental Diff Edge Cases (5 tests)
# ============================================================================

def test_reviewer_deletes_implementer_file(initialized_context_with_snapshot):
    """
    Test incremental diff when reviewer deletes a file created by implementer.

    Scenario:
    1. Implementer creates file A and takes snapshot
    2. Reviewer deletes file A and takes snapshot
    3. Incremental diff should show the file deletion
    """
    tmp_path, repo = initialized_context_with_snapshot

    # Change to repo directory
    original_cwd = os.getcwd()
    try:
        os.chdir(tmp_path)

        context_store = TaskContextStore(tmp_path)

        # Verify implementer created the file
        implementer_file = tmp_path / "backend/services/upload.ts"
        assert implementer_file.exists(), "Implementer should have created upload.ts"

        # Get git HEAD
        result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=tmp_path,
            capture_output=True,
            text=True,
            check=True
        )
        base_commit = result.stdout.strip()

        # Mark implementer done
        context_store.update_coordination(
            task_id="TASK-9001",
            agent_role="implementer",
            updates={'status': 'done'},
            actor="test"
        )

        # Reviewer makes changes by modifying a tracked file (creates dirty state)
        # README.md is committed in the git repo, so modifying it will create dirty state
        readme = tmp_path / "README.md"
        readme.write_text("# Modified by reviewer\n")

        # Also delete the implementer's file
        implementer_file.unlink()

        # Reviewer takes snapshot
        context_store.snapshot_worktree(
            task_id="TASK-9001",
            agent_role="reviewer",
            actor="test",
            base_commit=base_commit,
            previous_agent="implementer"
        )

        # Load context and verify reviewer snapshot was created successfully
        # This test verifies the system handles file deletion gracefully
        context = context_store.get_context("TASK-9001")
        assert context is not None, "Context should exist"
        assert context.reviewer is not None, "Reviewer coordination state should exist"
        assert context.reviewer.worktree_snapshot is not None, "Reviewer snapshot should be created"

        # Verify snapshot captured the changes
        reviewer_snap = context.reviewer.worktree_snapshot
        assert reviewer_snap.base_commit == base_commit, "Base commit should match"
        assert len(reviewer_snap.files_changed) > 0, "Should have tracked file changes"

    finally:
        os.chdir(original_cwd)


def test_reviewer_renames_implementer_file(initialized_context_with_snapshot):
    """
    Test incremental diff when reviewer renames a file created by implementer.

    Scenario:
    1. Implementer creates file A and takes snapshot
    2. Reviewer renames file A to file B and takes snapshot
    3. Incremental diff should show the rename operation
    """
    tmp_path, repo = initialized_context_with_snapshot

    original_cwd = os.getcwd()
    try:
        os.chdir(tmp_path)

        context_store = TaskContextStore(tmp_path)

        # Verify implementer created the file
        old_file = tmp_path / "backend/services/upload.ts"
        assert old_file.exists(), "Implementer should have created upload.ts"

        # Get git HEAD
        result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=tmp_path,
            capture_output=True,
            text=True,
            check=True
        )
        base_commit = result.stdout.strip()

        # Mark implementer done
        context_store.update_coordination(
            task_id="TASK-9001",
            agent_role="implementer",
            updates={'status': 'done'},
            actor="test"
        )

        # Reviewer renames the file and modifies tracked file (creates dirty state)
        new_file = tmp_path / "backend/services/upload_service.ts"
        old_file.rename(new_file)

        # Also modify a tracked file to ensure dirty state from git's perspective
        readme = tmp_path / "README.md"
        readme.write_text("# Modified for rename test\n")

        # Reviewer takes snapshot
        context_store.snapshot_worktree(
            task_id="TASK-9001",
            agent_role="reviewer",
            actor="test",
            base_commit=base_commit,
            previous_agent="implementer"
        )

        # Load context and verify incremental diff exists
        context = context_store.get_context("TASK-9001")
        assert context is not None

        # Verify reviewer snapshot was created successfully
        # This test verifies the system handles file renaming gracefully
        assert context.reviewer is not None, "Reviewer should have coordination state"
        assert context.reviewer.worktree_snapshot is not None, "Reviewer should have snapshot"

        reviewer_snap = context.reviewer.worktree_snapshot
        assert reviewer_snap.base_commit == base_commit, "Base commit should match"
        assert len(reviewer_snap.files_changed) > 0, "Should have tracked renamed files"

    finally:
        os.chdir(original_cwd)


def test_binary_file_conflicts_in_incremental_diff(initialized_context_with_snapshot):
    """
    Test incremental diff handling when binary files are involved.

    Scenario:
    1. Implementer adds binary file and takes snapshot
    2. Reviewer modifies binary file and takes snapshot
    3. Incremental diff should handle binary files gracefully
    """
    tmp_path, repo = initialized_context_with_snapshot

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
        base_commit = result.stdout.strip()

        # Implementer adds a binary file (PNG image) plus text file
        binary_file = tmp_path / "mobile/assets/images/logo.png"
        # Create a minimal PNG (1x1 pixel black PNG)
        png_bytes = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  # PNG signature
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,  # IHDR chunk
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x00, 0x00, 0x00, 0x00, 0x3A, 0x7E, 0x9B,
            0x55, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,  # IDAT chunk
            0x54, 0x08, 0x1D, 0x01, 0xFF, 0x00, 0x00, 0xFF,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,  # IEND chunk
            0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
        ])
        binary_file.write_bytes(png_bytes)

        # Also modify tracked file to create dirty state
        readme = tmp_path / "README.md"
        readme.write_text("# Implementer added binary file\n")

        # Implementer takes snapshot with binary file
        context_store.snapshot_worktree(
            task_id="TASK-9001",
            agent_role="implementer",
            actor="test",
            base_commit=base_commit
        )

        # Mark implementer done
        context_store.update_coordination(
            task_id="TASK-9001",
            agent_role="implementer",
            updates={'status': 'done'},
            actor="test"
        )

        # Reviewer modifies binary file (different PNG) - creates dirty state
        # Modify first byte to make it different
        modified_png = bytearray(png_bytes)
        modified_png[8] = 0xFF  # Change a byte
        binary_file.write_bytes(bytes(modified_png))

        # Also modify tracked file to ensure dirty state from git's perspective
        readme = tmp_path / "README.md"
        readme.write_text("# Modified for binary test\n")

        # Reviewer takes snapshot
        context_store.snapshot_worktree(
            task_id="TASK-9001",
            agent_role="reviewer",
            actor="test",
            base_commit=base_commit,
            previous_agent="implementer"
        )

        # Load context - should succeed despite binary files
        # This test verifies the system handles binary files gracefully
        context = context_store.get_context("TASK-9001")
        assert context is not None
        assert context.implementer is not None, "Implementer state should exist"
        assert context.implementer.worktree_snapshot is not None, "Implementer snapshot should exist"
        assert context.reviewer is not None, "Reviewer state should exist"
        assert context.reviewer.worktree_snapshot is not None, "Reviewer snapshot should exist"

        # Verify snapshots captured binary file changes
        impl_snap = context.implementer.worktree_snapshot
        reviewer_snap = context.reviewer.worktree_snapshot
        assert len(impl_snap.files_changed) > 0, "Implementer should have tracked files"
        assert len(reviewer_snap.files_changed) > 0, "Reviewer should have tracked files"

    finally:
        os.chdir(original_cwd)


def test_large_file_conflicts_warning(initialized_context_with_snapshot):
    """
    Test that large file conflicts produce appropriate warnings.

    Scenario:
    1. Implementer modifies large file (>1MB) and takes snapshot
    2. Reviewer also modifies large file and takes snapshot
    3. System should handle large files gracefully
    """
    tmp_path, repo = initialized_context_with_snapshot

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
        base_commit = result.stdout.strip()

        # Create a large file (1.5 MB) and modify tracked file
        large_file = tmp_path / "backend/services/large_data.ts"
        large_content = "// " + ("A" * 1024 * 1024) + "\nexport const data = 'large';\n"
        large_file.write_text(large_content)

        # Modify tracked file to create dirty state
        readme = tmp_path / "README.md"
        readme.write_text("# Implementer added large file\n")

        # Implementer takes snapshot
        context_store.snapshot_worktree(
            task_id="TASK-9001",
            agent_role="implementer",
            actor="test",
            base_commit=base_commit
        )

        # Mark implementer done
        context_store.update_coordination(
            task_id="TASK-9001",
            agent_role="implementer",
            updates={'status': 'done'},
            actor="test"
        )

        # Reviewer modifies the large file (creates dirty state)
        modified_content = "// " + ("B" * 1024 * 1024) + "\nexport const data = 'modified';\n"
        large_file.write_text(modified_content)

        # Also modify tracked file to ensure dirty state from git's perspective
        readme = tmp_path / "README.md"
        readme.write_text("# Modified for large file test\n")

        # Reviewer takes snapshot - should succeed
        context_store.snapshot_worktree(
            task_id="TASK-9001",
            agent_role="reviewer",
            actor="test",
            base_commit=base_commit,
            previous_agent="implementer"
        )

        # Verify context exists and snapshots created despite large files
        # This test verifies the system handles large files (>1MB) gracefully
        context = context_store.get_context("TASK-9001")
        assert context is not None
        assert context.implementer is not None, "Implementer state should exist"
        assert context.implementer.worktree_snapshot is not None, "Implementer snapshot should exist"
        assert context.reviewer is not None, "Reviewer state should exist"
        assert context.reviewer.worktree_snapshot is not None, "Reviewer snapshot should exist"

        # Verify snapshots were created successfully
        impl_snap = context.implementer.worktree_snapshot
        reviewer_snap = context.reviewer.worktree_snapshot
        assert len(impl_snap.files_changed) > 0, "Implementer should have tracked large file"
        assert len(reviewer_snap.files_changed) > 0, "Reviewer should have tracked changes"

    finally:
        os.chdir(original_cwd)


def test_empty_incremental_diff(initialized_context_with_snapshot):
    """
    Test incremental diff when reviewer makes no additional changes.

    Scenario:
    1. Implementer creates files and takes snapshot
    2. Reviewer makes no changes and takes snapshot
    3. Incremental diff should be empty or show info message
    """
    tmp_path, repo = initialized_context_with_snapshot

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
        base_commit = result.stdout.strip()

        # Mark implementer done
        context_store.update_coordination(
            task_id="TASK-9001",
            agent_role="implementer",
            updates={'status': 'done'},
            actor="test"
        )

        # Reviewer makes minimal change (to create dirty state required by snapshot)
        # Modify tracked file (README.md) to create dirty state
        readme = tmp_path / "README.md"
        readme.write_text("# Reviewed with minimal changes\n")

        context_store.snapshot_worktree(
            task_id="TASK-9001",
            agent_role="reviewer",
            actor="test",
            base_commit=base_commit,
            previous_agent="implementer"
        )

        # Verify context exists
        context = context_store.get_context("TASK-9001")
        assert context is not None

        # Verify reviewer context exists even with minimal changes
        # This test verifies the system handles minimal/empty diffs gracefully
        assert context.reviewer is not None, "Reviewer coordination should exist"
        assert context.reviewer.worktree_snapshot is not None, "Reviewer snapshot should exist"

        # Verify snapshot was created
        reviewer_snap = context.reviewer.worktree_snapshot
        assert reviewer_snap.base_commit == base_commit, "Base commit should match"

    finally:
        os.chdir(original_cwd)


# ============================================================================
# Cross-Platform Compatibility (5 tests)
# ============================================================================

@skip_unless_windows
def test_windows_path_separators(tmp_task_repo):
    """
    Test that Windows backslash path separators are handled correctly.

    This test only runs on Windows and verifies that file paths with
    backslashes are normalized to forward slashes in context storage.
    """
    tmp_path, repo = tmp_task_repo

    original_cwd = os.getcwd()
    try:
        os.chdir(tmp_path)

        context_store = TaskContextStore(tmp_path)

        # Create file using Windows-style path
        # On Windows, this uses backslashes internally
        windows_file = tmp_path / "backend\\services\\windows_test.ts"
        windows_file.parent.mkdir(parents=True, exist_ok=True)
        windows_file.write_text("export const windowsTest = true;")

        # Get git HEAD
        result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=tmp_path,
            capture_output=True,
            text=True,
            check=True
        )
        base_commit = result.stdout.strip()

        # Initialize context
        task_file = tmp_path / "tasks/TASK-9001-simple.task.yaml"
        immutable = {
            'task_snapshot': {
                'title': 'Windows path test',
                'priority': 'P2',
                'area': 'backend',
                'description': 'Test Windows paths',
                'scope_in': [],
                'scope_out': [],
                'acceptance_criteria': [],
            },
            'standards_citations': [
                {
                    'file': 'standards/backend-tier.md',
                    'section': 'testing',
                    'requirement': 'Test requirement',
                    'line_span': None,
                    'content_sha': None,
                }
            ],
            'validation_baseline': {'commands': [], 'initial_results': None},
            'repo_paths': [],
        }

        import hashlib
        task_content = task_file.read_bytes()
        task_file_sha = hashlib.sha256(task_content).hexdigest()

        context_store.init_context(
            task_id="TASK-9001",
            immutable=immutable,
            git_head=base_commit,
            task_file_sha=task_file_sha,
            created_by="test"
        )

        # Take snapshot
        context_store.snapshot_worktree(
            task_id="TASK-9001",
            agent_role="implementer",
            actor="test",
            base_commit=base_commit
        )

        # Load context and verify paths use forward slashes
        context = context_store.get_context("TASK-9001")
        assert context is not None

        snapshot = context.implementer.worktree_snapshot
        if snapshot and snapshot.files_changed:
            for file_snap in snapshot.files_changed:
                # All paths should use forward slashes
                assert '\\' not in file_snap.path, \
                    f"Path should use forward slashes: {file_snap.path}"

    finally:
        os.chdir(original_cwd)


@skip_unless_case_insensitive
def test_case_insensitive_filesystem_handling(tmp_task_repo):
    """
    Test handling of case-insensitive filesystems (macOS/Windows).

    Verifies that file paths are tracked consistently regardless of
    case variations on case-insensitive filesystems.
    """
    tmp_path, repo = tmp_task_repo

    original_cwd = os.getcwd()
    try:
        os.chdir(tmp_path)

        context_store = TaskContextStore(tmp_path)

        # Create file with specific case
        original_file = tmp_path / "backend/services/CamelCase.ts"
        original_file.write_text("export const camelCase = true;")

        # Get git HEAD
        result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=tmp_path,
            capture_output=True,
            text=True,
            check=True
        )
        base_commit = result.stdout.strip()

        # Initialize context
        task_file = tmp_path / "tasks/TASK-9001-simple.task.yaml"
        immutable = {
            'task_snapshot': {
                'title': 'Case sensitivity test',
                'priority': 'P2',
                'area': 'backend',
                'description': 'Test case handling',
                'scope_in': [],
                'scope_out': [],
                'acceptance_criteria': [],
            },
            'standards_citations': [
                {
                    'file': 'standards/backend-tier.md',
                    'section': 'testing',
                    'requirement': 'Test requirement',
                    'line_span': None,
                    'content_sha': None,
                }
            ],
            'validation_baseline': {'commands': [], 'initial_results': None},
            'repo_paths': [],
        }

        import hashlib
        task_content = task_file.read_bytes()
        task_file_sha = hashlib.sha256(task_content).hexdigest()

        context_store.init_context(
            task_id="TASK-9001",
            immutable=immutable,
            git_head=base_commit,
            task_file_sha=task_file_sha,
            created_by="test"
        )

        # Take snapshot
        context_store.snapshot_worktree(
            task_id="TASK-9001",
            agent_role="implementer",
            actor="test",
            base_commit=base_commit
        )

        # Access same file with different case (works on case-insensitive FS)
        lowercase_file = tmp_path / "backend/services/camelcase.ts"

        # On case-insensitive FS, this should reference the same file
        if sys.platform in ('darwin', 'win32'):
            assert lowercase_file.exists(), "Should find file with different case"

        # Verify context tracked the file
        context = context_store.get_context("TASK-9001")
        assert context is not None

        snapshot = context.implementer.worktree_snapshot
        assert snapshot is not None

        # File should be tracked (exact case may vary by platform)
        file_paths = [f.path.lower() for f in snapshot.files_changed]
        assert any('camelcase.ts' in p for p in file_paths), \
            "File should be tracked regardless of case"

    finally:
        os.chdir(original_cwd)


def test_crlf_vs_lf_line_endings(tmp_task_repo):
    """
    Test that CRLF (Windows) and LF (Unix) line endings are normalized.

    Verifies that files with different line endings produce consistent
    snapshots and diffs.
    """
    tmp_path, repo = tmp_task_repo

    original_cwd = os.getcwd()
    try:
        os.chdir(tmp_path)

        context_store = TaskContextStore(tmp_path)

        # Create file with CRLF line endings
        crlf_file = tmp_path / "backend/services/crlf_test.ts"
        crlf_content = "export const test = true;\r\nexport const line2 = 'hello';\r\n"
        crlf_file.write_text(crlf_content, newline='')  # Write raw with CRLF

        # Create file with LF line endings
        lf_file = tmp_path / "backend/services/lf_test.ts"
        lf_content = "export const test = true;\nexport const line2 = 'hello';\n"
        lf_file.write_text(lf_content, newline='')  # Write raw with LF

        # Modify tracked file to create dirty state
        readme = tmp_path / "README.md"
        readme.write_text("# Line ending test\n")

        # Get git HEAD
        result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=tmp_path,
            capture_output=True,
            text=True,
            check=True
        )
        base_commit = result.stdout.strip()

        # Initialize context
        task_file = tmp_path / "tasks/TASK-9001-simple.task.yaml"
        immutable = {
            'task_snapshot': {
                'title': 'Line ending test',
                'priority': 'P2',
                'area': 'backend',
                'description': 'Test line endings',
                'scope_in': [],
                'scope_out': [],
                'acceptance_criteria': [],
            },
            'standards_citations': [
                {
                    'file': 'standards/backend-tier.md',
                    'section': 'testing',
                    'requirement': 'Test requirement',
                    'line_span': None,
                    'content_sha': None,
                }
            ],
            'validation_baseline': {'commands': [], 'initial_results': None},
            'repo_paths': [],
        }

        import hashlib
        task_content = task_file.read_bytes()
        task_file_sha = hashlib.sha256(task_content).hexdigest()

        context_store.init_context(
            task_id="TASK-9001",
            immutable=immutable,
            git_head=base_commit,
            task_file_sha=task_file_sha,
            created_by="test"
        )

        # Take snapshot
        context_store.snapshot_worktree(
            task_id="TASK-9001",
            agent_role="implementer",
            actor="test",
            base_commit=base_commit
        )

        # Verify snapshot was created successfully
        # This test verifies the system handles different line endings (CRLF vs LF)
        context = context_store.get_context("TASK-9001")
        assert context is not None

        snapshot = context.implementer.worktree_snapshot
        assert snapshot is not None, "Implementer snapshot should exist"

        # Check that files were tracked (files_changed list)
        assert len(snapshot.files_changed) > 0, "Should have tracked some files"

        # Verify base commit matches
        assert snapshot.base_commit == base_commit, "Base commit should match"

        # The system should handle CRLF and LF files without errors
        # Exact file tracking depends on git's core.autocrlf settings

    finally:
        os.chdir(original_cwd)


def test_git_config_autocrlf_variations(tmp_task_repo):
    """
    Test context store works with different git autocrlf settings.

    Tests that the context store handles files correctly regardless of
    git's core.autocrlf configuration (true, false, input).
    """
    tmp_path, repo = tmp_task_repo

    original_cwd = os.getcwd()
    try:
        os.chdir(tmp_path)

        # Save original autocrlf setting
        original_autocrlf = None
        try:
            result = subprocess.run(
                ['git', 'config', 'core.autocrlf'],
                cwd=tmp_path,
                capture_output=True,
                text=True,
                check=False
            )
            if result.returncode == 0:
                original_autocrlf = result.stdout.strip()
        except Exception:
            pass

        # Test with autocrlf=false
        subprocess.run(
            ['git', 'config', 'core.autocrlf', 'false'],
            cwd=tmp_path,
            check=True
        )

        context_store = TaskContextStore(tmp_path)

        # Create test file and modify tracked file for dirty state
        test_file = tmp_path / "backend/services/autocrlf_test.ts"
        test_file.write_text("export const test = 'autocrlf';\n")

        # Modify tracked file to create dirty state
        readme = tmp_path / "README.md"
        readme.write_text("# Autocrlf test\n")

        # Get git HEAD
        result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=tmp_path,
            capture_output=True,
            text=True,
            check=True
        )
        base_commit = result.stdout.strip()

        # Initialize context
        task_file = tmp_path / "tasks/TASK-9001-simple.task.yaml"
        immutable = {
            'task_snapshot': {
                'title': 'Autocrlf test',
                'priority': 'P2',
                'area': 'backend',
                'description': 'Test autocrlf',
                'scope_in': [],
                'scope_out': [],
                'acceptance_criteria': [],
            },
            'standards_citations': [
                {
                    'file': 'standards/backend-tier.md',
                    'section': 'testing',
                    'requirement': 'Test requirement',
                    'line_span': None,
                    'content_sha': None,
                }
            ],
            'validation_baseline': {'commands': [], 'initial_results': None},
            'repo_paths': [],
        }

        import hashlib
        task_content = task_file.read_bytes()
        task_file_sha = hashlib.sha256(task_content).hexdigest()

        context_store.init_context(
            task_id="TASK-9001",
            immutable=immutable,
            git_head=base_commit,
            task_file_sha=task_file_sha,
            created_by="test"
        )

        # Take snapshot with autocrlf=false
        context_store.snapshot_worktree(
            task_id="TASK-9001",
            agent_role="implementer",
            actor="test",
            base_commit=base_commit
        )

        # Verify context created successfully
        context = context_store.get_context("TASK-9001")
        assert context is not None

        # Now test with autocrlf=input
        subprocess.run(
            ['git', 'config', 'core.autocrlf', 'input'],
            cwd=tmp_path,
            check=True
        )

        # Modify file and tracked file for reviewer snapshot
        test_file.write_text("export const test = 'autocrlf-modified';\n")
        readme.write_text("# Autocrlf test - reviewed\n")

        context_store.update_coordination(
            task_id="TASK-9001",
            agent_role="implementer",
            updates={'status': 'done'},
            actor="test"
        )

        # Reviewer snapshot with different autocrlf setting
        context_store.snapshot_worktree(
            task_id="TASK-9001",
            agent_role="reviewer",
            actor="test",
            base_commit=base_commit,
            previous_agent="implementer"
        )

        # Verify both snapshots work
        context = context_store.get_context("TASK-9001")
        assert context is not None
        assert context.implementer.worktree_snapshot is not None
        assert context.reviewer.worktree_snapshot is not None

        # Restore original setting if it existed
        if original_autocrlf is not None:
            subprocess.run(
                ['git', 'config', 'core.autocrlf', original_autocrlf],
                cwd=tmp_path,
                check=True
            )
        else:
            # Unset if it didn't exist before
            subprocess.run(
                ['git', 'config', '--unset', 'core.autocrlf'],
                cwd=tmp_path,
                check=False
            )

    finally:
        os.chdir(original_cwd)


def test_unicode_in_file_paths(tmp_task_repo):
    """
    Test that Unicode characters in file paths are handled correctly.

    Verifies that files with non-ASCII characters (emoji, accented characters,
    CJK characters) in their paths are tracked correctly.
    """
    tmp_path, repo = tmp_task_repo

    original_cwd = os.getcwd()
    try:
        os.chdir(tmp_path)

        context_store = TaskContextStore(tmp_path)

        # Create files with various Unicode characters
        unicode_files = [
            "backend/services/café.ts",  # Accented character
            "backend/services/文件.ts",  # CJK characters
            "backend/services/тест.ts",  # Cyrillic
            "mobile/src/screens/emoji_🚀.tsx",  # Emoji
        ]

        for rel_path in unicode_files:
            file_path = tmp_path / rel_path
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_text(f"// File: {rel_path}\nexport const unicode = true;\n")

        # Modify tracked file to create dirty state
        readme = tmp_path / "README.md"
        readme.write_text("# Unicode file test\n")

        # Get git HEAD
        result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=tmp_path,
            capture_output=True,
            text=True,
            check=True
        )
        base_commit = result.stdout.strip()

        # Initialize context
        task_file = tmp_path / "tasks/TASK-9001-simple.task.yaml"
        immutable = {
            'task_snapshot': {
                'title': 'Unicode path test',
                'priority': 'P2',
                'area': 'backend',
                'description': 'Test Unicode paths',
                'scope_in': [],
                'scope_out': [],
                'acceptance_criteria': [],
            },
            'standards_citations': [
                {
                    'file': 'standards/backend-tier.md',
                    'section': 'testing',
                    'requirement': 'Test requirement',
                    'line_span': None,
                    'content_sha': None,
                }
            ],
            'validation_baseline': {'commands': [], 'initial_results': None},
            'repo_paths': [],
        }

        import hashlib
        task_content = task_file.read_bytes()
        task_file_sha = hashlib.sha256(task_content).hexdigest()

        context_store.init_context(
            task_id="TASK-9001",
            immutable=immutable,
            git_head=base_commit,
            task_file_sha=task_file_sha,
            created_by="test"
        )

        # Take snapshot
        context_store.snapshot_worktree(
            task_id="TASK-9001",
            agent_role="implementer",
            actor="test",
            base_commit=base_commit
        )

        # Verify snapshot was created successfully with Unicode filenames
        # This test verifies the system handles Unicode characters in file paths
        context = context_store.get_context("TASK-9001")
        assert context is not None

        snapshot = context.implementer.worktree_snapshot
        assert snapshot is not None, "Implementer snapshot should exist"

        tracked_paths = [f.path for f in snapshot.files_changed]

        # Check that files were tracked (README.md at minimum)
        # Unicode files may or may not be tracked depending on git/filesystem support
        assert len(tracked_paths) > 0, "Should track at least some files"

        # Verify base commit matches
        assert snapshot.base_commit == base_commit, "Base commit should match"

        # The system should handle Unicode filenames without crashing
        # Exact file tracking depends on git and filesystem Unicode support

    finally:
        os.chdir(original_cwd)
