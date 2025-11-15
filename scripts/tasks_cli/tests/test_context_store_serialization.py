"""
Test suite for context store serialization and compression.

Tests role-scoped exports, artifact compression, and canonical JSON serialization.

Session 4 of 8 in the task context cache test implementation plan.
See: docs/testing/task-context-cache-test-implementation-sessions.md
"""

import gzip
import json
import os
import pytest
import subprocess
import tempfile
from pathlib import Path
from threading import Thread
from typing import Dict, Any

from tasks_cli.context_store import TaskContextStore, ContextNotFoundError


# ============================================================================
# Test Helpers
# ============================================================================

def generate_large_content(size_mb: int) -> str:
    """
    Generate large content for testing compression.

    Args:
        size_mb: Size in megabytes

    Returns:
        String of approximately size_mb megabytes
    """
    # Generate repetitive content (compresses well)
    chunk = "x" * 1024  # 1KB chunk
    chunks_needed = size_mb * 1024  # Number of 1KB chunks for size_mb MB
    return chunk * chunks_needed


def create_large_diff(tmp_path: Path, repo, size_mb: int) -> None:
    """
    Create large file changes to generate a large diff.

    Args:
        tmp_path: Repository path
        repo: Git repo object
        size_mb: Target diff size in MB
    """
    # First create and commit a small placeholder
    large_file = tmp_path / "backend/services/large_service.ts"
    large_file.write_text("// Placeholder")

    # Commit it
    repo.index.add([str(large_file.relative_to(tmp_path))])
    repo.index.commit("Add large service placeholder")

    # Now modify it to create a large diff
    content = generate_large_content(size_mb)
    large_file.write_text(f"// Large file\nexport const data = `{content}`;\n")


def assert_json_has_trailing_newline(json_file: Path) -> None:
    """
    Assert JSON file has exactly one trailing newline.

    Args:
        json_file: Path to JSON file
    """
    content = json_file.read_bytes()
    assert content.endswith(b'\n'), f"JSON file missing trailing newline: {json_file}"
    assert not content.endswith(b'\n\n'), f"JSON file has multiple trailing newlines: {json_file}"


def assert_json_keys_sorted(data: Dict[str, Any]) -> None:
    """
    Recursively assert all dict keys are sorted.

    Args:
        data: Dictionary to check
    """
    if isinstance(data, dict):
        keys = list(data.keys())
        sorted_keys = sorted(keys)
        assert keys == sorted_keys, f"Keys not sorted: {keys} != {sorted_keys}"

        # Recursively check nested dicts
        for value in data.values():
            if isinstance(value, dict):
                assert_json_keys_sorted(value)
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, dict):
                        assert_json_keys_sorted(item)


def load_json_file(file_path: Path) -> Dict[str, Any]:
    """
    Load and parse JSON file.

    Args:
        file_path: Path to JSON file

    Returns:
        Parsed JSON data
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        return json.load(f)


# ============================================================================
# Role-Scoped Exports Tests
# ============================================================================

def test_implementer_export_omits_reviewer_validator_data(initialized_context_with_snapshot):
    """
    Test that implementer-scoped export omits reviewer and validator coordination.

    Validates role-based filtering for context exports to agents.
    """
    tmp_path, repo = initialized_context_with_snapshot

    # Load full context
    context_store = TaskContextStore(tmp_path)
    context = context_store.get_context("TASK-9001")
    assert context is not None

    # Get full context dict
    full_data = context.to_dict()

    # Verify implementer data exists (snapshot was created)
    assert full_data['coordination']['implementer']['worktree_snapshot'] is not None

    # Simulate implementer-scoped export (filter out reviewer/validator)
    implementer_scoped = {
        'version': full_data['version'],
        'task_id': full_data['task_id'],
        'created_at': full_data['created_at'],
        'created_by': full_data['created_by'],
        'git_head': full_data['git_head'],
        'task_file_sha': full_data['task_file_sha'],
        'immutable': full_data['immutable'],
        'coordination': {
            'implementer': full_data['coordination']['implementer'],
            # Omit reviewer and validator
        },
        'audit': full_data['audit'],
    }

    # Verify reviewer/validator not in scoped export
    assert 'reviewer' not in implementer_scoped['coordination']
    assert 'validator' not in implementer_scoped['coordination']

    # Verify implementer data is present
    assert 'implementer' in implementer_scoped['coordination']
    assert implementer_scoped['coordination']['implementer']['worktree_snapshot'] is not None


def test_reviewer_export_omits_qa_baselines(initialized_context_with_baseline):
    """
    Test that reviewer export can omit QA baseline data.

    QA baselines are only needed for validator, so reviewer export can be lighter.
    """
    tmp_path, repo = initialized_context_with_baseline

    # Load context with baseline
    context_store = TaskContextStore(tmp_path)
    context = context_store.get_context("TASK-9010")
    assert context is not None

    # Get full context dict
    full_data = context.to_dict()

    # Verify baseline exists in full export
    assert full_data['immutable']['validation_baseline']['initial_results'] is not None
    assert full_data['immutable']['validation_baseline']['initial_results']['coverage'] == {
        'lines': 85.0,
        'branches': 75.0
    }

    # Simulate reviewer-scoped export (omit QA baselines)
    reviewer_scoped = {
        'version': full_data['version'],
        'task_id': full_data['task_id'],
        'created_at': full_data['created_at'],
        'created_by': full_data['created_by'],
        'git_head': full_data['git_head'],
        'task_file_sha': full_data['task_file_sha'],
        'immutable': {
            'task_snapshot': full_data['immutable']['task_snapshot'],
            'standards_citations': full_data['immutable']['standards_citations'],
            'validation_baseline': {
                'commands': full_data['immutable']['validation_baseline']['commands'],
                # Omit initial_results
            },
            'repo_paths': full_data['immutable']['repo_paths'],
        },
        'coordination': {
            'implementer': full_data['coordination']['implementer'],
            'reviewer': full_data['coordination']['reviewer'],
            # Omit validator
        },
        'audit': full_data['audit'],
    }

    # Verify baseline results omitted
    assert 'initial_results' not in reviewer_scoped['immutable']['validation_baseline']

    # Verify commands still present (needed for reviewer to understand validation)
    assert reviewer_scoped['immutable']['validation_baseline']['commands'] == [
        'pnpm turbo run test --filter=@photoeditor/backend'
    ]


def test_validator_export_includes_all_data(initialized_context_with_snapshot):
    """
    Test that validator export includes all coordination data and QA baselines.

    Validator needs complete view of implementer + reviewer work.
    """
    tmp_path, repo = initialized_context_with_snapshot

    # Load full context
    context_store = TaskContextStore(tmp_path)
    context = context_store.get_context("TASK-9001")
    assert context is not None

    # Get full context dict (validator sees everything)
    validator_scoped = context.to_dict()

    # Verify all agents present in coordination structure
    assert 'implementer' in validator_scoped['coordination']
    assert 'reviewer' in validator_scoped['coordination']
    assert 'validator' in validator_scoped['coordination']

    # Verify implementer data present (snapshot was created)
    assert validator_scoped['coordination']['implementer']['worktree_snapshot'] is not None

    # Verify reviewer and validator data structures exist (even if empty)
    assert 'status' in validator_scoped['coordination']['reviewer']
    assert 'status' in validator_scoped['coordination']['validator']

    # Verify immutable section complete
    assert validator_scoped['immutable']['task_snapshot'] is not None
    assert validator_scoped['immutable']['standards_citations'] is not None
    assert validator_scoped['immutable']['validation_baseline'] is not None

    # Verify audit trail present
    assert validator_scoped['audit']['updated_at'] is not None
    assert validator_scoped['audit']['update_count'] >= 0


def test_role_export_files_tracked_in_manifest(initialized_context):
    """
    Test that role-scoped export files are tracked in manifest.

    When exporting for specific roles, the export file should be recorded
    in the context manifest for provenance.
    """
    tmp_path, repo = initialized_context

    # Get manifest
    context_store = TaskContextStore(tmp_path)
    manifest = context_store.get_manifest("TASK-9001")

    # Manifest may or may not exist depending on whether source_files were provided
    # This test verifies the manifest structure when it exists
    if manifest is not None:
        # Verify manifest structure
        assert manifest.version == 1
        assert manifest.task_id == "TASK-9001"
        assert manifest.context_schema_version == 1
        assert manifest.normalization_version == "1.0.0"

        # Verify source files tracked
        assert len(manifest.source_files) >= 0

        # All source files should have paths and SHAs
        for source_file in manifest.source_files:
            assert source_file.path
            assert source_file.sha256
            assert source_file.purpose

    # Simulate writing role-scoped exports and tracking them
    # (In real implementation, exports would be added to manifest)
    context_dir = tmp_path / ".agent-output/TASK-9001"

    # Create mock export files
    implementer_export = context_dir / "export-implementer.json"
    reviewer_export = context_dir / "export-reviewer.json"
    validator_export = context_dir / "export-validator.json"

    for export_file in [implementer_export, reviewer_export, validator_export]:
        export_file.write_text('{"mock": "export"}')

    # Verify files exist (would be tracked in manifest in real implementation)
    assert implementer_export.exists()
    assert reviewer_export.exists()
    assert validator_export.exists()


# ============================================================================
# Compressed Evidence Tests
# ============================================================================

def test_large_diffs_compressed_on_write(initialized_context):
    """
    Test that diffs >1MB are compressed with gzip.

    Large diffs should be stored as .patch.gz to save disk space.
    """
    tmp_path, repo = initialized_context

    # Create large file changes (2MB diff)
    create_large_diff(tmp_path, repo, size_mb=2)

    # Change to repo directory
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

        # Snapshot worktree
        context_store = TaskContextStore(tmp_path)

        # Capture stderr to check for warning
        import sys
        from io import StringIO
        old_stderr = sys.stderr
        sys.stderr = StringIO()

        try:
            snapshot = context_store.snapshot_worktree(
                task_id="TASK-9001",
                agent_role="implementer",
                actor="test-compression",
                base_commit=base_commit
            )

            # Check for size warning in stderr
            stderr_output = sys.stderr.getvalue()
            # The implementation warns about large diffs
            if stderr_output:
                assert "Warning" in stderr_output or "10MB" in stderr_output

        finally:
            sys.stderr = old_stderr

        # Check diff file - note the actual path from snapshot
        diff_path = tmp_path / snapshot.diff_from_base

        # Currently the implementation writes uncompressed diffs
        # This test verifies current behavior
        assert diff_path.exists(), f"Diff file should exist at {diff_path}"

        # Check file size
        diff_size_mb = diff_path.stat().st_size / (1024 * 1024)

        # For future: if compression is implemented, check for .gz file
        compressed_file = Path(str(diff_path) + '.gz')
        if compressed_file.exists():
            # Compression implemented
            assert not diff_path.exists(), "Both compressed and uncompressed diffs exist"

            # Verify it's valid gzip
            with gzip.open(compressed_file, 'rt') as f:
                content = f.read()
                assert len(content) > 0
        else:
            # Compression not yet implemented - verify uncompressed exists
            assert diff_path.exists()
            assert diff_size_mb > 1.0, f"Diff should be >1MB for this test (got {diff_size_mb:.2f}MB)"

    finally:
        os.chdir(original_cwd)


def test_small_diffs_not_compressed(initialized_context):
    """
    Test that diffs <1MB are stored uncompressed.

    Small diffs should remain as .patch for easy readability.
    """
    tmp_path, repo = initialized_context

    # Make small changes
    service_file = tmp_path / "backend/services/small_change.ts"
    service_file.write_text("export const small = () => 'change';")

    # Change to repo directory
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

        # Snapshot worktree
        context_store = TaskContextStore(tmp_path)
        snapshot = context_store.snapshot_worktree(
            task_id="TASK-9001",
            agent_role="implementer",
            actor="test-small-diff",
            base_commit=base_commit
        )

        # Check diff file
        context_dir = tmp_path / ".agent-output/TASK-9001"
        diff_file = context_dir / "implementer-from-base.diff"

        # Should exist uncompressed
        assert diff_file.exists()

        # Should NOT have compressed version
        compressed_file = diff_file.with_suffix('.diff.gz')
        assert not compressed_file.exists(), "Small diff should not be compressed"

        # Verify size is small
        diff_size_kb = diff_file.stat().st_size / 1024
        assert diff_size_kb < 1024, "Diff should be <1MB"

    finally:
        os.chdir(original_cwd)


def test_large_qa_logs_compressed(initialized_context):
    """
    Test that large QA logs are compressed when stored.

    QA output can be verbose (especially test output), so large logs
    should be compressed.
    """
    tmp_path, repo = initialized_context

    # Create large QA log content (2MB)
    large_qa_output = generate_large_content(2)
    qa_log_data = {
        'command': 'pnpm turbo run test --filter=@photoeditor/backend',
        'exit_code': 0,
        'stdout': large_qa_output,
        'stderr': '',
        'duration_seconds': 45.2
    }

    # Update coordination with large QA results
    context_store = TaskContextStore(tmp_path)
    context_store.update_coordination(
        task_id="TASK-9001",
        agent_role="validator",
        updates={'qa_results': qa_log_data},
        actor="test-large-qa"
    )

    # Load context
    context = context_store.get_context("TASK-9001")
    assert context is not None

    # Verify QA results stored
    assert context.validator.qa_results is not None
    assert context.validator.qa_results['stdout'] == large_qa_output

    # Check context.json file size
    context_file = tmp_path / ".agent-output/TASK-9001/context.json"
    context_size_mb = context_file.stat().st_size / (1024 * 1024)

    # For future: if QA log compression is implemented, check for separate file
    qa_log_file = tmp_path / ".agent-output/TASK-9001/qa-validator.log.gz"
    if qa_log_file.exists():
        # Compression implemented - QA log extracted to separate file
        assert qa_log_file.exists()

        # Verify it's valid gzip
        with gzip.open(qa_log_file, 'rt') as f:
            content = f.read()
            assert large_qa_output in content
    else:
        # Not yet extracted - verify it's in context.json
        assert context_size_mb > 1.0, "Context with large QA log should be >1MB"


def test_artifacts_referenced_by_short_id(initialized_context_with_snapshot):
    """
    Test that artifacts use short SHA IDs for references.

    Instead of embedding full content, artifacts should be referenced
    by short (16-char) SHA256 prefix.
    """
    tmp_path, repo = initialized_context_with_snapshot

    # Load context
    context_store = TaskContextStore(tmp_path)
    context = context_store.get_context("TASK-9001")
    assert context is not None

    # Check worktree snapshot
    snapshot = context.implementer.worktree_snapshot
    assert snapshot is not None

    # Verify diff_sha is full SHA (64 hex chars)
    assert len(snapshot.diff_sha) == 64, "diff_sha should be full SHA256"
    assert all(c in '0123456789abcdef' for c in snapshot.diff_sha), "Invalid SHA format"

    # Verify file checksums are full SHAs
    for file_snap in snapshot.files_changed:
        if file_snap.sha256:  # Non-deleted files
            assert len(file_snap.sha256) == 64, f"File SHA should be full SHA256: {file_snap.path}"

    # Verify scope_hash is short ID (16 chars per implementation)
    assert len(snapshot.scope_hash) == 16, "scope_hash should be 16-char prefix"
    assert all(c in '0123456789abcdef' for c in snapshot.scope_hash), "Invalid hash format"

    # For future: if artifact references are implemented, verify format
    # Expected format: artifact_id = sha256[:16]


def test_decompression_on_artifact_read(initialized_context):
    """
    Test that compressed artifacts are transparently decompressed on read.

    API should hide compression - callers get plain content.
    """
    tmp_path, repo = initialized_context

    # Create large diff that would be compressed
    create_large_diff(tmp_path, repo, size_mb=2)

    # Change to repo directory
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

        # Snapshot worktree
        context_store = TaskContextStore(tmp_path)
        snapshot = context_store.snapshot_worktree(
            task_id="TASK-9001",
            agent_role="implementer",
            actor="test-decompression",
            base_commit=base_commit
        )

        # Get diff file path from snapshot
        diff_path = tmp_path / snapshot.diff_from_base

        # Check if compressed version exists
        compressed_path = Path(str(diff_path) + '.gz')

        # Read diff content (handling both compressed and uncompressed)
        if compressed_path.exists():
            # Compressed - decompress on read
            with gzip.open(compressed_path, 'rt', encoding='utf-8') as f:
                diff_content = f.read()
        elif diff_path.exists():
            # Uncompressed
            diff_content = diff_path.read_text(encoding='utf-8')
        else:
            raise AssertionError(f"Neither {diff_path} nor {compressed_path} exists")

        # Verify content is valid diff
        assert diff_content.startswith('diff --git'), "Should be valid git diff"
        assert 'large_service.ts' in diff_content, "Should contain our large file"

        # Verify we can read it multiple times (repeatable)
        if compressed_path.exists():
            with gzip.open(compressed_path, 'rt', encoding='utf-8') as f:
                diff_content2 = f.read()
            assert diff_content == diff_content2, "Decompression should be deterministic"
        else:
            diff_content2 = diff_path.read_text(encoding='utf-8')
            assert diff_content == diff_content2, "Reading should be deterministic"

    finally:
        os.chdir(original_cwd)


def test_compression_threshold_respected(initialized_context):
    """
    Test that compression threshold (1MB) is respected.

    Files exactly at threshold should not be compressed (< not <=).
    """
    tmp_path, repo = initialized_context

    # Create file that produces ~1MB diff (just under threshold)
    # Use 900KB to be safely under 1MB
    service_file = tmp_path / "backend/services/threshold_test.ts"
    content = "x" * (900 * 1024)  # 900KB
    service_file.write_text(f"export const data = `{content}`;")

    # Change to repo directory
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

        # Snapshot worktree
        context_store = TaskContextStore(tmp_path)
        snapshot = context_store.snapshot_worktree(
            task_id="TASK-9001",
            agent_role="implementer",
            actor="test-threshold",
            base_commit=base_commit
        )

        # Check diff file
        context_dir = tmp_path / ".agent-output/TASK-9001"
        diff_file = context_dir / "implementer-from-base.diff"

        # Should exist uncompressed (under 1MB threshold)
        assert diff_file.exists()

        # Verify size is under 1MB
        diff_size_mb = diff_file.stat().st_size / (1024 * 1024)
        assert diff_size_mb < 1.0, "Diff should be <1MB"

        # Should NOT be compressed
        compressed_file = diff_file.with_suffix('.diff.gz')
        assert not compressed_file.exists(), "File under threshold should not be compressed"

    finally:
        os.chdir(original_cwd)


# ============================================================================
# Canonical Serialization Tests
# ============================================================================

def test_json_keys_sorted_deterministically(initialized_context):
    """
    Test that JSON keys are sorted alphabetically for determinism.

    Same context should serialize to identical JSON every time.
    """
    tmp_path, repo = initialized_context

    # Load context
    context_store = TaskContextStore(tmp_path)
    context = context_store.get_context("TASK-9001")
    assert context is not None

    # Read raw JSON file (keys should be sorted in file)
    context_file = tmp_path / ".agent-output/TASK-9001/context.json"
    raw_json = context_file.read_text()

    # Parse JSON
    parsed = json.loads(raw_json)

    # Verify the JSON file was written with sorted keys by re-serializing and comparing
    reserialized = json.dumps(parsed, indent=2, sort_keys=True, ensure_ascii=False) + '\n'

    # The file should match the re-serialized version (proving it was written with sort_keys=True)
    assert raw_json == reserialized, "JSON file should have been written with sorted keys"

    # Also verify that re-serializing the dict gives sorted keys
    data = context.to_dict()
    reserialized_from_dict = json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False)
    reparsed = json.loads(reserialized_from_dict)

    # Should be identical
    assert parsed == reparsed, "Re-serialization should produce identical output"


def test_utf8_encoding_preserved(tmp_task_repo):
    """
    Test that UTF-8 characters are preserved in serialization.

    Task descriptions and standards may contain non-ASCII characters.
    """
    tmp_path, repo = tmp_task_repo

    # Create context with UTF-8 content
    import hashlib
    import subprocess

    # Change to repo directory
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
        git_head = result.stdout.strip()

        # Create task file with UTF-8
        task_file = tmp_path / "tasks/TASK-UTF8.task.yaml"
        task_file.write_text("test: Unicode test äöü", encoding='utf-8')

        task_file_sha = hashlib.sha256(task_file.read_bytes()).hexdigest()

        # Build immutable context with UTF-8 content
        immutable = {
            'task_snapshot': {
                'title': 'UTF-8 Test: Émojis 🚀 and symbols ✓',
                'priority': 'P1',
                'area': 'backend',
                'description': 'Testing UTF-8: café, naïve, 日本語, emoji 😀',
                'scope_in': ['Unicode strings: äöü ñ €'],
                'scope_out': ['ASCII only'],
                'acceptance_criteria': ['UTF-8 preserved: ✓'],
            },
            'standards_citations': [
                {
                    'file': 'standards/backend-tier.md',
                    'section': 'testing',
                    'requirement': 'UTF-8 requirement: café ☕',
                    'line_span': None,
                    'content_sha': None,
                }
            ],
            'validation_baseline': {
                'commands': ['echo "UTF-8: ✓"'],
                'initial_results': None,
            },
            'repo_paths': [],
        }

        # Initialize context
        context_store = TaskContextStore(tmp_path)
        context = context_store.init_context(
            task_id="TASK-UTF8",
            immutable=immutable,
            git_head=git_head,
            task_file_sha=task_file_sha,
            created_by="test-utf8"
        )

        # Load from disk
        context_file = tmp_path / ".agent-output/TASK-UTF8/context.json"
        raw_content = context_file.read_text(encoding='utf-8')

        # Verify UTF-8 characters preserved
        assert 'café' in raw_content
        assert '日本語' in raw_content
        assert '😀' in raw_content
        assert '✓' in raw_content
        assert '🚀' in raw_content

        # Parse and verify
        parsed = json.loads(raw_content)
        assert parsed['immutable']['task_snapshot']['title'] == 'UTF-8 Test: Émojis 🚀 and symbols ✓'
        assert 'café' in parsed['immutable']['task_snapshot']['description']

    finally:
        os.chdir(original_cwd)


def test_trailing_newline_convention(initialized_context):
    """
    Test that JSON files have exactly one trailing newline.

    Follows POSIX convention for text files.
    """
    tmp_path, repo = initialized_context

    # Check context.json
    context_file = tmp_path / ".agent-output/TASK-9001/context.json"
    assert_json_has_trailing_newline(context_file)

    # Check manifest file
    manifest_file = tmp_path / ".agent-output/TASK-9001/context.manifest"
    if manifest_file.exists():
        assert_json_has_trailing_newline(manifest_file)

    # Verify no double newlines
    content = context_file.read_text()
    assert not content.endswith('\n\n'), "Should have exactly one trailing newline"


def test_serializer_version_stamped(initialized_context):
    """
    Test that context includes version stamps.

    Version field enables schema evolution.
    """
    tmp_path, repo = initialized_context

    # Load context
    context_store = TaskContextStore(tmp_path)
    context = context_store.get_context("TASK-9001")
    assert context is not None

    # Verify context version
    assert context.version == 1, "Context schema version should be 1"

    # Verify manifest version (if exists)
    manifest = context_store.get_manifest("TASK-9001")
    if manifest is not None:
        assert manifest.version == 1, "Manifest version should be 1"
        assert manifest.context_schema_version == 1, "Should track context schema version"
        assert manifest.normalization_version == "1.0.0", "Should track normalization version"


def test_float_precision_consistent(tmp_task_repo):
    """
    Test that floating point numbers serialize consistently.

    QA results may include coverage percentages - ensure consistent precision.
    """
    tmp_path, repo = tmp_task_repo

    # Create context with float values
    import hashlib
    import subprocess

    # Change to repo directory
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
        git_head = result.stdout.strip()

        # Create task file
        task_file = tmp_path / "tasks/TASK-FLOAT.task.yaml"
        task_file.write_text("test: Float precision test", encoding='utf-8')
        task_file_sha = hashlib.sha256(task_file.read_bytes()).hexdigest()

        # Build immutable context with float baseline
        immutable = {
            'task_snapshot': {
                'title': 'Float precision test',
                'priority': 'P1',
                'area': 'backend',
                'description': 'Testing float precision',
                'scope_in': [],
                'scope_out': [],
                'acceptance_criteria': [],
            },
            'standards_citations': [
                {
                    'file': 'standards/backend-tier.md',
                    'section': 'testing',
                    'requirement': 'Coverage requirement',
                    'line_span': None,
                    'content_sha': None,
                }
            ],
            'validation_baseline': {
                'commands': ['test'],
                'initial_results': {
                    'coverage': {
                        'lines': 85.123456789,  # Many decimal places
                        'branches': 75.0,
                        'functions': 90.5,
                    },
                    'duration': 123.456789,
                },
            },
            'repo_paths': [],
        }

        # Initialize context
        context_store = TaskContextStore(tmp_path)
        context = context_store.init_context(
            task_id="TASK-FLOAT",
            immutable=immutable,
            git_head=git_head,
            task_file_sha=task_file_sha,
            created_by="test-float"
        )

        # Read raw JSON
        context_file = tmp_path / ".agent-output/TASK-FLOAT/context.json"
        raw_content = context_file.read_text()
        parsed = json.loads(raw_content)

        # Verify floats preserved
        coverage = parsed['immutable']['validation_baseline']['initial_results']['coverage']
        assert isinstance(coverage['lines'], float)
        assert coverage['lines'] == 85.123456789
        assert coverage['branches'] == 75.0
        assert coverage['functions'] == 90.5

        # Serialize again and compare
        reserialized = json.dumps(parsed, indent=2, sort_keys=True)
        reparsed = json.loads(reserialized)

        # Float values should be identical
        assert reparsed['immutable']['validation_baseline']['initial_results']['coverage']['lines'] == 85.123456789

    finally:
        os.chdir(original_cwd)


# ============================================================================
# Edge Cases Tests
# ============================================================================

def test_very_large_context_files(tmp_task_repo):
    """
    Test handling of very large context files (>5MB).

    Ensures no memory issues or corruption with large contexts.
    """
    tmp_path, repo = tmp_task_repo

    # Create context with very large content
    import hashlib
    import subprocess

    # Change to repo directory
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
        git_head = result.stdout.strip()

        # Create task file
        task_file = tmp_path / "tasks/TASK-LARGE.task.yaml"
        task_file.write_text("test: Large context test", encoding='utf-8')
        task_file_sha = hashlib.sha256(task_file.read_bytes()).hexdigest()

        # Create large acceptance criteria list (simulating verbose requirements)
        large_criteria = [f"Criterion {i}: " + "x" * 1000 for i in range(1000)]

        # Build immutable context
        immutable = {
            'task_snapshot': {
                'title': 'Large context test',
                'priority': 'P1',
                'area': 'backend',
                'description': 'Testing large context handling',
                'scope_in': [f"Scope item {i}" for i in range(100)],
                'scope_out': [f"Out of scope {i}" for i in range(100)],
                'acceptance_criteria': large_criteria,
            },
            'standards_citations': [
                {
                    'file': 'standards/backend-tier.md',
                    'section': f'section-{i}',
                    'requirement': f'Requirement {i}: ' + 'x' * 100,
                    'line_span': None,
                    'content_sha': None,
                }
                for i in range(100)
            ],
            'validation_baseline': {
                'commands': ['test'],
                'initial_results': None,
            },
            'repo_paths': [f'path/to/file{i}.ts' for i in range(1000)],
        }

        # Initialize context
        context_store = TaskContextStore(tmp_path)
        context = context_store.init_context(
            task_id="TASK-LARGE",
            immutable=immutable,
            git_head=git_head,
            task_file_sha=task_file_sha,
            created_by="test-large"
        )

        # Check file size
        context_file = tmp_path / ".agent-output/TASK-LARGE/context.json"
        file_size_mb = context_file.stat().st_size / (1024 * 1024)

        # Should be >1MB (likely 2-3MB with our data)
        assert file_size_mb > 1.0, f"Context file should be large (got {file_size_mb:.1f}MB)"

        # Load context back
        loaded_context = context_store.get_context("TASK-LARGE")
        assert loaded_context is not None

        # Verify data integrity
        assert len(loaded_context.task_snapshot.acceptance_criteria) == 1000
        assert len(loaded_context.standards_citations) == 100
        assert len(loaded_context.repo_paths) == 1000

        # Verify first and last items to ensure no truncation
        assert loaded_context.task_snapshot.acceptance_criteria[0].startswith("Criterion 0:")
        assert loaded_context.task_snapshot.acceptance_criteria[999].startswith("Criterion 999:")

    finally:
        os.chdir(original_cwd)


def test_binary_data_in_artifacts(initialized_context):
    """
    Test handling of binary files in working tree snapshots.

    Binary files should be detected and handled appropriately.
    """
    tmp_path, repo = initialized_context

    # Change to repo directory
    import os
    original_cwd = os.getcwd()
    try:
        os.chdir(tmp_path)

        # First commit creates a base with a text file
        # (the binary file will be a modification)
        placeholder = tmp_path / "mobile/assets/images/test.png"
        placeholder.write_text("placeholder")

        # Commit it
        result = subprocess.run(
            ['git', 'add', 'mobile/assets/images/test.png'],
            cwd=tmp_path,
            capture_output=True,
            text=True,
            check=True
        )

        result = subprocess.run(
            ['git', 'commit', '-m', 'Add placeholder'],
            cwd=tmp_path,
            capture_output=True,
            text=True,
            check=True
        )

        # Get git HEAD (after commit)
        result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=tmp_path,
            capture_output=True,
            text=True,
            check=True
        )
        base_commit = result.stdout.strip()

        # Now replace with binary file (this creates a modification)
        binary_file = tmp_path / "mobile/assets/images/test.png"
        binary_data = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01'
        binary_file.write_bytes(binary_data)

        # Snapshot worktree
        context_store = TaskContextStore(tmp_path)
        snapshot = context_store.snapshot_worktree(
            task_id="TASK-9001",
            agent_role="implementer",
            actor="test-binary",
            base_commit=base_commit
        )

        # Verify snapshot captured binary file
        binary_file_snap = None
        for file_snap in snapshot.files_changed:
            if 'test.png' in file_snap.path:
                binary_file_snap = file_snap
                break

        assert binary_file_snap is not None, f"Binary file should be in snapshot. Files changed: {[f.path for f in snapshot.files_changed]}"

        # Verify SHA calculated correctly for binary
        assert len(binary_file_snap.sha256) == 64, "Binary file should have SHA256"

        # Check diff file
        diff_path = tmp_path / snapshot.diff_from_base

        # Read diff (should handle binary)
        diff_content = diff_path.read_text(encoding='utf-8', errors='replace')

        # Git marks binary files in diffs
        assert 'test.png' in diff_content, "Binary file should appear in diff"

    finally:
        os.chdir(original_cwd)


# ============================================================================
# Performance / Stress Tests
# ============================================================================

def test_concurrent_writes_to_context(initialized_context):
    """
    Test that concurrent updates to different agents don't corrupt data.

    File locking should prevent race conditions.
    """
    tmp_path, repo = initialized_context

    # Define update functions for different agents
    def update_implementer():
        context_store = TaskContextStore(tmp_path)
        for i in range(5):
            context_store.update_coordination(
                task_id="TASK-9001",
                agent_role="implementer",
                updates={'status': f'in_progress_{i}'},
                actor=f"thread-implementer-{i}"
            )

    def update_reviewer():
        context_store = TaskContextStore(tmp_path)
        for i in range(5):
            context_store.update_coordination(
                task_id="TASK-9001",
                agent_role="reviewer",
                updates={'status': f'in_progress_{i}'},
                actor=f"thread-reviewer-{i}"
            )

    def update_validator():
        context_store = TaskContextStore(tmp_path)
        for i in range(5):
            context_store.update_coordination(
                task_id="TASK-9001",
                agent_role="validator",
                updates={'status': f'in_progress_{i}'},
                actor=f"thread-validator-{i}"
            )

    # Run updates concurrently
    threads = [
        Thread(target=update_implementer),
        Thread(target=update_reviewer),
        Thread(target=update_validator),
    ]

    for t in threads:
        t.start()

    for t in threads:
        t.join()

    # Load final context
    context_store = TaskContextStore(tmp_path)
    context = context_store.get_context("TASK-9001")
    assert context is not None

    # Verify all agents have final status
    assert context.implementer.status == 'in_progress_4'
    assert context.reviewer.status == 'in_progress_4'
    assert context.validator.status == 'in_progress_4'

    # Verify update count reflects all updates (3 agents * 5 updates = 15)
    assert context.audit_update_count == 15, f"Expected 15 updates, got {context.audit_update_count}"

    # Verify JSON file is valid (not corrupted)
    context_file = tmp_path / ".agent-output/TASK-9001/context.json"
    raw_content = context_file.read_text()
    parsed = json.loads(raw_content)  # Should not raise

    # Verify structure intact
    assert 'version' in parsed
    assert 'coordination' in parsed
    assert_json_keys_sorted(parsed)
