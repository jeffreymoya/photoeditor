"""
Tests for context management commands.

Tests cover:
- migrate command (single, dry-run, force, auto)
- info command (show metadata)
- validate command (single and all)
- Error cases (missing context, invalid task ID)
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, Mock, patch

import pytest

from tasks_cli.commands.context import (
    CURRENT_CONTEXT_VERSION,
    CURRENT_MANIFEST_VERSION,
    discover_contexts,
    get_context_info,
    migrate_context,
    validate_context,
)
from tasks_cli.context_store import (
    AgentCoordination,
    ContextManifest,
    EvidenceAttachment,
    SourceFile,
    StandardsCitation,
    TaskContext,
    TaskContextStore,
    TaskSnapshot,
    ValidationBaseline,
)


# ============================================================================
# Test Fixtures
# ============================================================================


@pytest.fixture
def mock_store(tmp_path):
    """Create a mock TaskContextStore with temp directory."""
    store = Mock(spec=TaskContextStore)
    store.repo_root = tmp_path
    store.context_root = tmp_path / ".agent-output"
    store.context_root.mkdir(parents=True, exist_ok=True)

    # Mock runtime helper
    runtime_mock = Mock()
    runtime_mock.get_context_file = lambda task_id: store.context_root / task_id / "context.json"
    runtime_mock.get_context_dir = lambda task_id: store.context_root / task_id
    runtime_mock.normalize_repo_paths = lambda paths: sorted(set(
        str(Path(p).parent) if '.' in Path(p).name else p.rstrip('/')
        for p in paths
    ))
    runtime_mock.atomic_write = Mock()
    runtime_mock.calculate_file_sha256 = lambda p: "abcd1234" * 8
    store._runtime = runtime_mock

    return store


@pytest.fixture
def sample_context():
    """Create a sample TaskContext for testing."""
    return TaskContext(
        version=1,
        task_id="TASK-0001",
        created_at=datetime.now(timezone.utc).isoformat(),
        created_by="test-user",
        git_head="a" * 40,
        task_file_sha="b" * 64,
        task_snapshot=TaskSnapshot(
            title="Sample Task",
            priority="P1",
            area="mobile",
            description="Test task",
            scope_in=["mobile/src"],
            scope_out=["backend"],
            acceptance_criteria=["AC1"],
            plan_steps=[],
            deliverables=["deliverable1"],
            validation_commands=[]
        ),
        standards_citations=[],
        validation_baseline=ValidationBaseline(commands=[]),
        repo_paths=["mobile/src/App.tsx", "mobile/src/components/Foo.tsx"],
        implementer=AgentCoordination(),
        reviewer=AgentCoordination(),
        validator=AgentCoordination(),
        audit_updated_at=datetime.now(timezone.utc).isoformat(),
        audit_updated_by="test-user",
        audit_update_count=0
    )


@pytest.fixture
def sample_manifest():
    """Create a sample ContextManifest for testing."""
    return ContextManifest(
        version=1,
        created_at=datetime.now(timezone.utc).isoformat(),
        created_by="test-user",
        git_head="a" * 40,
        task_id="TASK-0001",
        context_schema_version=1,
        source_files=[
            SourceFile(
                path="tasks/mobile/TASK-0001-sample.task.yaml",
                sha256="c" * 64,
                purpose="task_yaml"
            )
        ]
    )


# ============================================================================
# Test: migrate_context
# ============================================================================


def test_migrate_context_success(mock_store, sample_context):
    """Test successful migration of a single context."""
    mock_store.get_context.return_value = sample_context

    result = migrate_context(mock_store, "TASK-0001", dry_run=False, force=False)

    assert result['success'] is True
    assert result['task_id'] == "TASK-0001"
    assert result['old_version'] == 1
    assert result['new_version'] == CURRENT_CONTEXT_VERSION
    assert len(result['changes_applied']) > 0
    assert 'Normalized repo_paths' in result['changes_applied'][0]


def test_migrate_context_not_found(mock_store):
    """Test migration with missing context."""
    mock_store.get_context.return_value = None

    result = migrate_context(mock_store, "TASK-9999", dry_run=False, force=False)

    assert result['success'] is False
    assert 'Context not found' in result['error']
    assert result['task_id'] == "TASK-9999"


def test_migrate_context_dry_run(mock_store, sample_context):
    """Test migration with dry_run flag (no changes applied)."""
    mock_store.get_context.return_value = sample_context

    result = migrate_context(mock_store, "TASK-0001", dry_run=True, force=False)

    assert result['success'] is True
    assert result['dry_run'] is True
    # Should detect changes but not apply them
    if result['changes_applied']:
        mock_store._runtime.atomic_write.assert_not_called()


def test_migrate_context_force(mock_store, sample_context):
    """Test migration with force flag (reapply even if current)."""
    # Set context to current version
    sample_context.version = CURRENT_CONTEXT_VERSION
    mock_store.get_context.return_value = sample_context

    result = migrate_context(mock_store, "TASK-0001", dry_run=False, force=True)

    assert result['success'] is True
    assert result['old_version'] == CURRENT_CONTEXT_VERSION
    assert result['new_version'] == CURRENT_CONTEXT_VERSION


def test_migrate_context_already_current(mock_store, sample_context):
    """Test migration when already at current version (no force)."""
    # Normalize paths and set to current version
    sample_context.version = CURRENT_CONTEXT_VERSION
    sample_context.repo_paths = ["mobile/src"]  # Already normalized
    mock_store.get_context.return_value = sample_context

    result = migrate_context(mock_store, "TASK-0001", dry_run=False, force=False)

    assert result['success'] is True
    assert result['message'] == 'Already at current version'
    assert len(result['changes_applied']) == 0


# ============================================================================
# Test: discover_contexts
# ============================================================================


def test_discover_contexts_empty(mock_store):
    """Test discovering contexts when none exist."""
    task_ids = discover_contexts(mock_store)
    assert task_ids == []


def test_discover_contexts_with_contexts(mock_store):
    """Test discovering multiple contexts."""
    # Create mock context directories
    for task_id in ["TASK-0001", "TASK-0002", "TASK-0003"]:
        context_dir = mock_store.context_root / task_id
        context_dir.mkdir(parents=True, exist_ok=True)
        (context_dir / "context.json").write_text("{}")

    task_ids = discover_contexts(mock_store)
    assert task_ids == ["TASK-0001", "TASK-0002", "TASK-0003"]


def test_discover_contexts_filters_non_task_dirs(mock_store):
    """Test that discover_contexts filters out non-task directories."""
    # Create valid task context
    task_dir = mock_store.context_root / "TASK-0001"
    task_dir.mkdir(parents=True, exist_ok=True)
    (task_dir / "context.json").write_text("{}")

    # Create invalid directories (should be ignored)
    (mock_store.context_root / "not-a-task").mkdir(parents=True, exist_ok=True)
    (mock_store.context_root / "README.md").write_text("test")

    task_ids = discover_contexts(mock_store)
    assert task_ids == ["TASK-0001"]


# ============================================================================
# Test: get_context_info
# ============================================================================


def test_get_context_info_success(mock_store, sample_context, sample_manifest):
    """Test getting context info with manifest."""
    mock_store.get_context.return_value = sample_context
    mock_store.get_manifest.return_value = sample_manifest
    mock_store.list_evidence.return_value = [
        EvidenceAttachment(
            id="abc12345",
            type="log",
            path=".agent-output/TASK-0001/evidence/test.log",
            sha256="d" * 64,
            size=1024,
            created_at=datetime.now(timezone.utc).isoformat()
        )
    ]

    info = get_context_info(mock_store, "TASK-0001")

    assert info['task_id'] == "TASK-0001"
    assert info['context_version'] == 1
    assert info['evidence_count'] == 1
    assert info['repo_paths_count'] == 2
    assert 'manifest_version' in info
    assert info['manifest_version'] == 1


def test_get_context_info_not_found(mock_store):
    """Test getting info for missing context."""
    mock_store.get_context.return_value = None

    info = get_context_info(mock_store, "TASK-9999")

    assert 'error' in info
    assert 'Context not found' in info['error']
    assert info['task_id'] == "TASK-9999"


def test_get_context_info_without_manifest(mock_store, sample_context):
    """Test getting info when manifest is missing."""
    mock_store.get_context.return_value = sample_context
    mock_store.get_manifest.return_value = None
    mock_store.list_evidence.return_value = []

    info = get_context_info(mock_store, "TASK-0001")

    assert info['task_id'] == "TASK-0001"
    assert 'manifest_version' not in info


# ============================================================================
# Test: validate_context
# ============================================================================


def test_validate_context_success(mock_store, sample_context):
    """Test validating a valid context."""
    sample_context.version = CURRENT_CONTEXT_VERSION
    mock_store.get_context.return_value = sample_context
    mock_store.get_manifest.return_value = None
    mock_store.list_evidence.return_value = []

    result = validate_context(mock_store, "TASK-0001")

    assert result['valid'] is True
    assert result['task_id'] == "TASK-0001"
    assert len(result['issues']) == 0


def test_validate_context_not_found(mock_store):
    """Test validating missing context."""
    mock_store.get_context.return_value = None

    result = validate_context(mock_store, "TASK-9999")

    assert result['valid'] is False
    assert result['task_id'] == "TASK-9999"
    assert 'Context file not found' in result['issues']


def test_validate_context_version_mismatch(mock_store, sample_context):
    """Test validation fails when version is outdated."""
    sample_context.version = 0  # Old version
    mock_store.get_context.return_value = sample_context
    mock_store.get_manifest.return_value = None
    mock_store.list_evidence.return_value = []

    result = validate_context(mock_store, "TASK-0001")

    assert result['valid'] is False
    assert any('version' in issue.lower() for issue in result['issues'])


def test_validate_context_missing_fields(mock_store, sample_context):
    """Test validation fails when required fields are missing."""
    sample_context.version = CURRENT_CONTEXT_VERSION
    sample_context.git_head = ""  # Missing required field
    mock_store.get_context.return_value = sample_context
    mock_store.get_manifest.return_value = None
    mock_store.list_evidence.return_value = []

    result = validate_context(mock_store, "TASK-0001")

    assert result['valid'] is False
    assert any('git_head' in issue.lower() for issue in result['issues'])


def test_validate_context_evidence_missing_file(mock_store, sample_context):
    """Test validation fails when evidence file is missing."""
    sample_context.version = CURRENT_CONTEXT_VERSION
    mock_store.get_context.return_value = sample_context
    mock_store.get_manifest.return_value = None

    # Mock evidence with non-existent file
    evidence = EvidenceAttachment(
        id="abc12345",
        type="log",
        path=".agent-output/TASK-0001/evidence/missing.log",
        sha256="d" * 64,
        size=1024,
        created_at=datetime.now(timezone.utc).isoformat()
    )
    mock_store.list_evidence.return_value = [evidence]

    result = validate_context(mock_store, "TASK-0001")

    assert result['valid'] is False
    assert any('Evidence file missing' in issue for issue in result['issues'])


def test_validate_context_evidence_sha_mismatch(mock_store, sample_context, tmp_path):
    """Test validation fails when evidence SHA doesn't match."""
    sample_context.version = CURRENT_CONTEXT_VERSION
    mock_store.get_context.return_value = sample_context
    mock_store.get_manifest.return_value = None

    # Create actual evidence file
    evidence_file = tmp_path / ".agent-output" / "TASK-0001" / "evidence" / "test.log"
    evidence_file.parent.mkdir(parents=True, exist_ok=True)
    evidence_file.write_text("test content")

    # Mock evidence with wrong SHA
    evidence = EvidenceAttachment(
        id="abc12345",
        type="log",
        path=str(evidence_file.relative_to(tmp_path)),
        sha256="wrongsha" * 8,  # Wrong SHA
        size=1024,
        created_at=datetime.now(timezone.utc).isoformat()
    )
    mock_store.list_evidence.return_value = [evidence]

    # Mock calculate_file_sha256 to return different SHA
    mock_store._runtime.calculate_file_sha256.return_value = "correctsha" * 8

    result = validate_context(mock_store, "TASK-0001")

    assert result['valid'] is False
    assert any('SHA mismatch' in issue for issue in result['issues'])


def test_validate_context_load_exception(mock_store):
    """Test validation handles context load exceptions."""
    mock_store.get_context.side_effect = Exception("Load failed")

    result = validate_context(mock_store, "TASK-0001")

    assert result['valid'] is False
    assert 'Failed to load context' in result['issues'][0]
