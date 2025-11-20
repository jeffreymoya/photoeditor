"""
Test evidence attachment and compression functionality.

Tests EvidenceManager class extracted from TaskContextStore (S3.4).
"""

import json
import pytest
import subprocess
from pathlib import Path

from tasks_cli.context_store import TaskContextStore
from tasks_cli.context_store.evidence import (
    EvidenceManager,
    ARTIFACT_TYPES,
    TYPE_SIZE_LIMITS
)
from tasks_cli.exceptions import ValidationError, ContextNotFoundError


@pytest.fixture
def temp_repo(tmp_path):
    """Create temporary git repository."""
    repo = tmp_path / "repo"
    repo.mkdir()

    # Initialize git repo
    subprocess.run(['git', 'init'], cwd=repo, check=True, capture_output=True)
    subprocess.run(['git', 'config', 'user.name', 'Test User'], cwd=repo, check=True)
    subprocess.run(['git', 'config', 'user.email', 'test@example.com'], cwd=repo, check=True)
    subprocess.run(['git', 'config', 'commit.gpgsign', 'false'], cwd=repo, check=True)
    subprocess.run(['git', 'config', 'gpg.format', 'openpgp'], cwd=repo, check=True)

    # Create initial commit
    test_file = repo / "test.txt"
    test_file.write_text("initial content\n")
    subprocess.run(['git', 'add', '.'], cwd=repo, check=True)
    subprocess.run(['git', 'commit', '-m', 'Initial commit'], cwd=repo, check=True, capture_output=True)

    return repo


@pytest.fixture
def context_store(temp_repo):
    """Create TaskContextStore instance."""
    return TaskContextStore(temp_repo)


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
            }
        ],
        'validation_baseline': {
            'commands': ['pnpm turbo run test'],
            'initial_results': None,
        },
        'repo_paths': ['backend/src/', 'backend/tests/'],
    }


def test_evidence_manager_initialization(temp_repo):
    """Test EvidenceManager can be initialized."""
    context_root = temp_repo / '.agent-output'
    manager = EvidenceManager(temp_repo, context_root)

    assert manager.repo_root == temp_repo
    assert manager.context_root == context_root


def test_evidence_manager_get_evidence_dir(temp_repo):
    """Test _get_evidence_dir returns correct path."""
    context_root = temp_repo / '.agent-output'
    manager = EvidenceManager(temp_repo, context_root)

    evidence_dir = manager._get_evidence_dir('TASK-0001')
    expected = temp_repo / '.agent-output' / 'TASK-0001' / 'evidence'

    assert evidence_dir == expected


def test_validate_artifact_type_valid(temp_repo):
    """Test artifact type validation accepts valid types."""
    context_root = temp_repo / '.agent-output'
    manager = EvidenceManager(temp_repo, context_root)

    # Should not raise for valid type within size limit
    manager._validate_artifact_type('file', 500 * 1024)  # 500KB file


def test_validate_artifact_type_invalid(temp_repo):
    """Test artifact type validation rejects invalid types."""
    context_root = temp_repo / '.agent-output'
    manager = EvidenceManager(temp_repo, context_root)

    with pytest.raises(ValidationError, match='Invalid artifact type'):
        manager._validate_artifact_type('invalid_type', 100)


def test_validate_artifact_type_exceeds_size(temp_repo):
    """Test artifact type validation rejects oversized artifacts."""
    context_root = temp_repo / '.agent-output'
    manager = EvidenceManager(temp_repo, context_root)

    # File limit is 1MB
    with pytest.raises(ValidationError, match='exceeds limit'):
        manager._validate_artifact_type('file', 2 * 1024 * 1024)


def test_attach_evidence_file(context_store, sample_immutable_data, temp_repo):
    """Test attaching a file artifact."""
    # Initialize context
    git_head = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    ).stdout.strip()

    context_store.init_context(
        task_id='TASK-0100',
        immutable=sample_immutable_data,
        git_head=git_head,
        task_file_sha='test_sha',
    )

    # Create test artifact
    artifact_file = temp_repo / 'test_artifact.txt'
    artifact_file.write_text('test content for evidence')

    # Attach evidence
    attachment = context_store.attach_evidence(
        task_id='TASK-0100',
        artifact_type='file',
        artifact_path=artifact_file,
        description='Test file artifact'
    )

    # Verify attachment
    assert attachment.type == 'file'
    assert attachment.description == 'Test file artifact'
    assert len(attachment.id) == 16  # 16-char prefix
    assert len(attachment.sha256) == 64  # Full SHA256
    assert attachment.size > 0

    # Verify file was copied to evidence directory
    evidence_dir = temp_repo / '.agent-output' / 'TASK-0100' / 'evidence'
    assert evidence_dir.exists()
    assert (evidence_dir / 'index.json').exists()


def test_attach_evidence_with_metadata(context_store, sample_immutable_data, temp_repo):
    """Test attaching evidence with QA output metadata."""
    # Initialize context
    git_head = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    ).stdout.strip()

    context_store.init_context(
        task_id='TASK-0101',
        immutable=sample_immutable_data,
        git_head=git_head,
        task_file_sha='test_sha',
    )

    # Create QA output artifact
    qa_file = temp_repo / 'qa_output.log'
    qa_file.write_text('QA command output')

    # Attach with metadata
    attachment = context_store.attach_evidence(
        task_id='TASK-0101',
        artifact_type='qa_output',
        artifact_path=qa_file,
        description='QA validation results',
        metadata={
            'command': 'pnpm turbo run test',
            'exit_code': 0,
            'duration_ms': 1500
        }
    )

    # Verify metadata
    assert attachment.metadata is not None
    assert attachment.metadata.command == 'pnpm turbo run test'
    assert attachment.metadata.exit_code == 0
    assert attachment.metadata.duration_ms == 1500


def test_attach_evidence_qa_output_missing_metadata(context_store, sample_immutable_data, temp_repo):
    """Test qa_output requires metadata."""
    # Initialize context
    git_head = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    ).stdout.strip()

    context_store.init_context(
        task_id='TASK-0102',
        immutable=sample_immutable_data,
        git_head=git_head,
        task_file_sha='test_sha',
    )

    # Create QA output artifact
    qa_file = temp_repo / 'qa_output.log'
    qa_file.write_text('QA command output')

    # Should fail without metadata
    with pytest.raises(ValidationError, match='qa_output artifacts require metadata'):
        context_store.attach_evidence(
            task_id='TASK-0102',
            artifact_type='qa_output',
            artifact_path=qa_file,
        )


def test_attach_evidence_directory_creates_archive(context_store, sample_immutable_data, temp_repo):
    """Test attaching a directory creates an archive."""
    # Initialize context
    git_head = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    ).stdout.strip()

    context_store.init_context(
        task_id='TASK-0103',
        immutable=sample_immutable_data,
        git_head=git_head,
        task_file_sha='test_sha',
    )

    # Create test directory with files
    test_dir = temp_repo / 'test_dir'
    test_dir.mkdir()
    (test_dir / 'file1.txt').write_text('content 1')
    (test_dir / 'file2.txt').write_text('content 2')

    # Attach directory
    attachment = context_store.attach_evidence(
        task_id='TASK-0103',
        artifact_type='directory',
        artifact_path=test_dir,
        description='Test directory archive'
    )

    # Should be converted to archive type
    assert attachment.type == 'archive'
    assert attachment.compression is not None
    assert attachment.compression.format in ['tar.zst', 'tar.gz']
    assert attachment.compression.index_path is not None

    # Verify archive file exists
    evidence_dir = temp_repo / '.agent-output' / 'TASK-0103' / 'evidence'
    archive_files = list(evidence_dir.glob('test_dir-archive.tar.*'))
    assert len(archive_files) > 0


def test_list_evidence(context_store, sample_immutable_data, temp_repo):
    """Test listing evidence attachments."""
    # Initialize context
    git_head = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    ).stdout.strip()

    context_store.init_context(
        task_id='TASK-0104',
        immutable=sample_immutable_data,
        git_head=git_head,
        task_file_sha='test_sha',
    )

    # Initially empty
    evidence_list = context_store.list_evidence('TASK-0104')
    assert len(evidence_list) == 0

    # Attach some evidence
    artifact1 = temp_repo / 'artifact1.txt'
    artifact1.write_text('content 1')
    context_store.attach_evidence(
        task_id='TASK-0104',
        artifact_type='file',
        artifact_path=artifact1,
    )

    artifact2 = temp_repo / 'artifact2.log'
    artifact2.write_text('content 2')
    context_store.attach_evidence(
        task_id='TASK-0104',
        artifact_type='log',
        artifact_path=artifact2,
    )

    # List should show both
    evidence_list = context_store.list_evidence('TASK-0104')
    assert len(evidence_list) == 2


def test_list_evidence_no_context(context_store):
    """Test listing evidence for nonexistent task returns empty list."""
    evidence_list = context_store.list_evidence('TASK-9999')
    assert len(evidence_list) == 0


def test_attach_evidence_description_too_long(context_store, sample_immutable_data, temp_repo):
    """Test description length validation."""
    # Initialize context
    git_head = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        capture_output=True,
        text=True,
        check=True
    ).stdout.strip()

    context_store.init_context(
        task_id='TASK-0105',
        immutable=sample_immutable_data,
        git_head=git_head,
        task_file_sha='test_sha',
    )

    # Create artifact
    artifact = temp_repo / 'test.txt'
    artifact.write_text('content')

    # Description over 200 chars should fail
    long_description = 'x' * 201

    with pytest.raises(ValidationError, match='exceeds 200 characters'):
        context_store.attach_evidence(
            task_id='TASK-0105',
            artifact_type='file',
            artifact_path=artifact,
            description=long_description
        )


def test_attach_evidence_context_not_found(context_store, temp_repo):
    """Test attaching evidence to nonexistent context raises error."""
    # Create artifact
    artifact = temp_repo / 'test.txt'
    artifact.write_text('content')

    with pytest.raises(ContextNotFoundError):
        context_store.attach_evidence(
            task_id='TASK-9999',
            artifact_type='file',
            artifact_path=artifact,
        )


def test_artifact_types_constant():
    """Test ARTIFACT_TYPES constant is defined."""
    assert 'file' in ARTIFACT_TYPES
    assert 'directory' in ARTIFACT_TYPES
    assert 'archive' in ARTIFACT_TYPES
    assert 'log' in ARTIFACT_TYPES
    assert 'qa_output' in ARTIFACT_TYPES


def test_type_size_limits_constant():
    """Test TYPE_SIZE_LIMITS constant is defined."""
    assert TYPE_SIZE_LIMITS['file'] == 1 * 1024 * 1024
    assert TYPE_SIZE_LIMITS['archive'] == 50 * 1024 * 1024
    assert TYPE_SIZE_LIMITS['directory'] is None
