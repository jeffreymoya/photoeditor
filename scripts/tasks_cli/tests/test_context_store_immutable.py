"""
Test ImmutableSnapshotBuilder module (S3.2).

Tests snapshot creation, standards enrichment, and manifest generation
for task context initialization.
"""

import hashlib
import json
import pytest
import subprocess
from pathlib import Path

from tasks_cli.context_store.immutable import (
    ImmutableSnapshotBuilder,
    normalize_multiline,
)
from tasks_cli.context_store import (
    TaskContext,
    TaskSnapshot,
    StandardsCitation,
    ValidationBaseline,
    EvidenceAttachment,
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
    subprocess.run(['git', 'config', 'commit.gpgsign', 'false'], cwd=repo, check=True)

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
            'plan_steps': [],
            'deliverables': [],
            'validation_commands': [],
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
def snapshot_builder(temp_repo):
    """Create ImmutableSnapshotBuilder instance."""
    context_root = temp_repo / ".agent-output"
    context_root.mkdir(parents=True, exist_ok=True)

    def atomic_write(path, content):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding='utf-8')

    def get_context_dir(task_id):
        return context_root / task_id

    def get_evidence_dir(task_id):
        return context_root / task_id / "evidence"

    def get_manifest_file(task_id):
        return context_root / task_id / "context.manifest"

    def resolve_task_path(task_id):
        # Simple resolution for tests
        return temp_repo / "tasks" / f"{task_id}.task.yaml"

    return ImmutableSnapshotBuilder(
        repo_root=temp_repo,
        context_root=context_root,
        atomic_write_fn=atomic_write,
        get_context_dir_fn=get_context_dir,
        get_evidence_dir_fn=get_evidence_dir,
        get_manifest_file_fn=get_manifest_file,
        resolve_task_path_fn=resolve_task_path,
    )


# ============================================================================
# Test Text Normalization
# ============================================================================

def test_normalize_multiline_removes_comments():
    """Test that YAML comments are stripped."""
    text = "Line 1\n# Comment\nLine 2\n"
    result = normalize_multiline(text)
    assert "# Comment" not in result
    assert "Line 1" in result
    assert "Line 2" in result


def test_normalize_multiline_removes_blank_lines():
    """Test that blank lines are removed."""
    text = "Line 1\n\n\nLine 2\n"
    result = normalize_multiline(text)
    # normalize_multiline joins lines without blank lines and may wrap them
    # Just verify blank lines are removed
    assert result.count('\n\n\n') == 0
    assert "Line 1" in result
    assert "Line 2" in result


def test_normalize_multiline_converts_line_endings():
    """Test that CRLF and CR are converted to LF."""
    text_crlf = "Line 1\r\nLine 2\r\n"
    text_cr = "Line 1\rLine 2\r"
    result_crlf = normalize_multiline(text_crlf)
    result_cr = normalize_multiline(text_cr)
    assert '\r' not in result_crlf
    assert '\r' not in result_cr
    assert result_crlf == result_cr


def test_normalize_multiline_preserves_formatting_when_requested():
    """Test that preserve_formatting flag works."""
    text = "- Bullet 1\n- Bullet 2\n"
    result = normalize_multiline(text, preserve_formatting=True)
    assert "Bullet 1" in result
    assert "Bullet 2" in result


# ============================================================================
# Test Secret Scanning
# ============================================================================

def test_scan_for_secrets_detects_aws_key(snapshot_builder):
    """Test that AWS access keys are detected."""
    data = {'key': 'AKIAIOSFODNN7EXAMPLE'}
    with pytest.raises(ValidationError, match="AWS access key"):
        snapshot_builder._scan_for_secrets(data)


def test_scan_for_secrets_detects_github_token(snapshot_builder):
    """Test that GitHub tokens are detected."""
    data = {'token': 'ghp_1234567890abcdefghijklmnopqrstuvwxyz'}
    with pytest.raises(ValidationError, match="GitHub token"):
        snapshot_builder._scan_for_secrets(data)


def test_scan_for_secrets_can_be_forced(snapshot_builder):
    """Test that force flag bypasses scanning."""
    data = {'key': 'AKIAIOSFODNN7EXAMPLE'}
    # Should not raise
    snapshot_builder._scan_for_secrets(data, force=True)


# ============================================================================
# Test Context Initialization
# ============================================================================

def test_init_context_creates_valid_context(snapshot_builder, sample_immutable_data, temp_repo):
    """Test that init_context creates a valid TaskContext."""
    git_head = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        check=True,
        capture_output=True,
        text=True
    ).stdout.strip()

    context = snapshot_builder.init_context(
        task_id="TASK-0001",
        immutable=sample_immutable_data,
        git_head=git_head,
        task_file_sha="abc123",
        created_by="test-runner",
        force_secrets=False,
        source_files=None
    )

    assert context.task_id == "TASK-0001"
    assert context.git_head == git_head
    assert context.task_file_sha == "abc123"
    assert context.created_by == "test-runner"
    assert context.version == 1
    assert len(context.standards_citations) == 1
    assert context.task_snapshot.title == "Test Task"


def test_init_context_normalizes_text_fields(snapshot_builder, sample_immutable_data, temp_repo):
    """Test that init_context normalizes text fields."""
    git_head = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        check=True,
        capture_output=True,
        text=True
    ).stdout.strip()

    # Add multiline description with comments
    sample_immutable_data['task_snapshot']['description'] = "Line 1\n# Comment\nLine 2\n"

    context = snapshot_builder.init_context(
        task_id="TASK-0002",
        immutable=sample_immutable_data,
        git_head=git_head,
        task_file_sha="def456",
        created_by="test-runner",
        force_secrets=False,
        source_files=None
    )

    # Description should be normalized (no comments)
    assert "# Comment" not in context.task_snapshot.description
    assert "Line 1" in context.task_snapshot.description
    assert "Line 2" in context.task_snapshot.description


def test_init_context_rejects_empty_description(snapshot_builder, sample_immutable_data, temp_repo):
    """Test that empty description is rejected."""
    git_head = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        check=True,
        capture_output=True,
        text=True
    ).stdout.strip()

    sample_immutable_data['task_snapshot']['description'] = ''

    with pytest.raises(ValidationError, match="description cannot be empty"):
        snapshot_builder.init_context(
            task_id="TASK-0003",
            immutable=sample_immutable_data,
            git_head=git_head,
            task_file_sha="ghi789",
            created_by="test-runner",
        )


def test_init_context_rejects_empty_standards_citations(snapshot_builder, sample_immutable_data, temp_repo):
    """Test that empty standards_citations is rejected."""
    git_head = subprocess.run(
        ['git', 'rev-parse', 'HEAD'],
        cwd=temp_repo,
        check=True,
        capture_output=True,
        text=True
    ).stdout.strip()

    sample_immutable_data['standards_citations'] = []

    with pytest.raises(ValidationError, match="standards_citations cannot be empty"):
        snapshot_builder.init_context(
            task_id="TASK-0004",
            immutable=sample_immutable_data,
            git_head=git_head,
            task_file_sha="jkl012",
            created_by="test-runner",
        )


# ============================================================================
# Test Task Snapshot Creation
# ============================================================================

def test_create_task_snapshot_creates_file(snapshot_builder, temp_repo):
    """Test that create_task_snapshot creates snapshot file."""
    # Create task file
    tasks_dir = temp_repo / "tasks"
    tasks_dir.mkdir(parents=True, exist_ok=True)
    task_file = tasks_dir / "TASK-0005.task.yaml"
    task_file.write_text("title: Test Task\npriority: P1\n", encoding='utf-8')

    metadata = snapshot_builder.create_task_snapshot(
        task_id="TASK-0005",
        task_file_path=task_file
    )

    assert 'snapshot_path' in metadata
    assert 'snapshot_sha256' in metadata
    assert 'original_path' in metadata
    assert 'completed_path' in metadata

    # Verify snapshot file exists
    snapshot_path = temp_repo / metadata['snapshot_path']
    assert snapshot_path.exists()
    assert snapshot_path.read_text(encoding='utf-8') == "title: Test Task\npriority: P1\n"


def test_create_task_snapshot_computes_correct_sha(snapshot_builder, temp_repo):
    """Test that snapshot SHA256 matches file content."""
    tasks_dir = temp_repo / "tasks"
    tasks_dir.mkdir(parents=True, exist_ok=True)
    task_file = tasks_dir / "TASK-0006.task.yaml"
    content = "title: Another Task\npriority: P2\n"
    task_file.write_text(content, encoding='utf-8')

    metadata = snapshot_builder.create_task_snapshot(
        task_id="TASK-0006",
        task_file_path=task_file
    )

    expected_sha = hashlib.sha256(content.encode('utf-8')).hexdigest()
    assert metadata['snapshot_sha256'] == expected_sha


def test_create_task_snapshot_raises_on_missing_file(snapshot_builder, temp_repo):
    """Test that missing task file raises FileNotFoundError."""
    nonexistent_file = temp_repo / "nonexistent.task.yaml"

    with pytest.raises(FileNotFoundError, match="does not exist"):
        snapshot_builder.create_task_snapshot(
            task_id="TASK-0007",
            task_file_path=nonexistent_file
        )


# ============================================================================
# Test Section Boundaries
# ============================================================================

def test_find_section_boundaries_finds_section(snapshot_builder):
    """Test that section boundaries are correctly identified."""
    content = """# Title

## Section One
Content of section one

## Section Two
Content of section two

## Section Three
Content of section three
"""
    result = snapshot_builder._find_section_boundaries(content, "Section Two")
    assert result is not None
    start, end = result
    lines = content.split('\n')
    section_content = '\n'.join(lines[start:end])
    assert "Content of section two" in section_content
    assert "Section Two" not in section_content  # Heading is excluded
    assert "Section Three" not in section_content  # Next heading is excluded


def test_find_section_boundaries_returns_none_for_missing_section(snapshot_builder):
    """Test that missing section returns None."""
    content = "## Section One\nContent\n"
    result = snapshot_builder._find_section_boundaries(content, "Nonexistent Section")
    assert result is None


def test_find_section_boundaries_handles_nested_headings(snapshot_builder):
    """Test that nested headings are handled correctly."""
    content = """## Main Section
Main content

### Subsection
Subsection content

## Next Main Section
Next content
"""
    result = snapshot_builder._find_section_boundaries(content, "Main Section")
    assert result is not None
    start, end = result
    lines = content.split('\n')
    section_content = '\n'.join(lines[start:end])
    # Should include subsection since it's nested
    assert "Subsection content" in section_content
    # Should exclude next main section
    assert "Next content" not in section_content


# ============================================================================
# Test Checklist Snapshotting
# ============================================================================

def test_snapshot_checklists_copies_files(snapshot_builder, temp_repo):
    """Test that snapshot_checklists copies checklist files."""
    # Create mock checklist files
    docs_agents = temp_repo / "docs" / "agents"
    docs_agents.mkdir(parents=True, exist_ok=True)

    preflight = docs_agents / "implementation-preflight.md"
    preflight.write_text("# Preflight Checklist\n", encoding='utf-8')

    diff_safety = docs_agents / "diff-safety-checklist.md"
    diff_safety.write_text("# Diff Safety\n", encoding='utf-8')

    attachments = snapshot_builder.snapshot_checklists(
        task_id="TASK-0008",
        tier="backend"
    )

    # Should have 2 attachments (preflight + diff_safety, no tier-specific)
    assert len(attachments) == 2

    # Verify attachments have correct structure
    for att in attachments:
        assert att.type == 'file'
        assert att.sha256
        assert att.size > 0
        assert att.description.startswith("Checklist snapshot:")


def test_snapshot_checklists_includes_tier_specific(snapshot_builder, temp_repo):
    """Test that tier-specific checklist is included if it exists."""
    docs_agents = temp_repo / "docs" / "agents"
    docs_agents.mkdir(parents=True, exist_ok=True)

    preflight = docs_agents / "implementation-preflight.md"
    preflight.write_text("# Preflight\n", encoding='utf-8')

    diff_safety = docs_agents / "diff-safety-checklist.md"
    diff_safety.write_text("# Diff\n", encoding='utf-8')

    tier_checklist = docs_agents / "backend-implementation-checklist.md"
    tier_checklist.write_text("# Backend Specific\n", encoding='utf-8')

    attachments = snapshot_builder.snapshot_checklists(
        task_id="TASK-0009",
        tier="backend"
    )

    # Should have 3 attachments now
    assert len(attachments) == 3
