"""
Unit tests for context_store models module.

Tests serialization, deserialization, immutability, and schema versioning.
"""

import pytest
from dataclasses import FrozenInstanceError
from datetime import datetime, timezone

from scripts.tasks_cli.context_store.models import (
    MANIFEST_SCHEMA_VERSION,
    CONTEXT_SCHEMA_VERSION,
    TaskSnapshot,
    StandardsCitation,
    StandardsExcerpt,
    QACoverageSummary,
    QACommandSummary,
    QACommandResult,
    QAResults,
    CompressionMetadata,
    ArtifactMetadata,
    EvidenceAttachment,
    ValidationBaseline,
    FileOperationMetrics,
    CacheOperationMetrics,
    CommandExecution,
    WarningEntry,
    TelemetrySnapshot,
    SourceFile,
    ContextManifest,
    FileSnapshot,
    WorktreeSnapshot,
    AgentCoordination,
    TaskContext,
)


# ============================================================================
# Schema Version Tests
# ============================================================================

def test_manifest_schema_version_constant():
    """Verify MANIFEST_SCHEMA_VERSION constant exists and equals 1."""
    assert MANIFEST_SCHEMA_VERSION == 1


def test_context_schema_version_constant():
    """Verify CONTEXT_SCHEMA_VERSION constant exists and equals 1."""
    assert CONTEXT_SCHEMA_VERSION == 1


# ============================================================================
# Frozen Dataclass Tests
# ============================================================================

def test_task_snapshot_is_frozen():
    """Verify TaskSnapshot is immutable."""
    snapshot = TaskSnapshot(
        title="Test",
        priority="P1",
        area="test",
        description="Test task",
        scope_in=["a"],
        scope_out=["b"],
        acceptance_criteria=["c"],
        plan_steps=[],
        deliverables=[],
        validation_commands=[],
    )
    with pytest.raises(FrozenInstanceError):
        snapshot.title = "Changed"


def test_standards_citation_is_frozen():
    """Verify StandardsCitation is immutable."""
    citation = StandardsCitation(
        file="standards/test.md",
        section="test",
        requirement="Test requirement",
    )
    with pytest.raises(FrozenInstanceError):
        citation.file = "changed.md"


def test_qa_results_is_frozen():
    """Verify QAResults is immutable."""
    results = QAResults(
        recorded_at="2025-11-20T12:00:00Z",
        agent="implementer",
    )
    with pytest.raises(FrozenInstanceError):
        results.agent = "reviewer"


def test_worktree_snapshot_is_frozen():
    """Verify WorktreeSnapshot is immutable."""
    snapshot = WorktreeSnapshot(
        base_commit="abc123",
        snapshot_time="2025-11-20T12:00:00Z",
        diff_from_base="diff.patch",
        diff_sha="sha256hash",
        status_report="status",
        files_changed=[],
        diff_stat="1 file changed",
        scope_hash="scopehash",
    )
    with pytest.raises(FrozenInstanceError):
        snapshot.base_commit = "changed"


def test_agent_coordination_is_mutable():
    """Verify AgentCoordination is mutable (not frozen)."""
    coord = AgentCoordination(status="pending")
    # Should not raise - this dataclass is mutable
    coord.status = "in_progress"
    assert coord.status == "in_progress"


def test_task_context_is_mutable():
    """Verify TaskContext is mutable (not frozen)."""
    task_snapshot = TaskSnapshot(
        title="Test",
        priority="P1",
        area="test",
        description="Test",
        scope_in=[],
        scope_out=[],
        acceptance_criteria=[],
        plan_steps=[],
        deliverables=[],
        validation_commands=[],
    )
    validation_baseline = ValidationBaseline(commands=[])

    ctx = TaskContext(
        version=1,
        task_id="TASK-0001",
        created_at="2025-11-20T12:00:00Z",
        created_by="test",
        git_head="abc123",
        task_file_sha="sha256",
        task_snapshot=task_snapshot,
        standards_citations=[],
        validation_baseline=validation_baseline,
        repo_paths=[],
        implementer=AgentCoordination(),
        reviewer=AgentCoordination(),
        validator=AgentCoordination(),
        audit_updated_at="2025-11-20T12:00:00Z",
        audit_updated_by="test",
    )
    # Should not raise - this dataclass is mutable
    ctx.audit_update_count = 1
    assert ctx.audit_update_count == 1


# ============================================================================
# Serialization/Deserialization Tests
# ============================================================================

def test_task_snapshot_round_trip():
    """Test TaskSnapshot serialization and deserialization."""
    original = TaskSnapshot(
        title="Test Task",
        priority="P1",
        area="backend",
        description="Test description",
        scope_in=["item1", "item2"],
        scope_out=["item3"],
        acceptance_criteria=["criteria1"],
        plan_steps=[{"step": 1, "action": "Do something"}],
        deliverables=["file1.py"],
        validation_commands=[{"command": "pytest"}],
        snapshot_path=".agent-output/TASK-0001/snapshot.yaml",
        snapshot_sha256="abc123",
    )

    serialized = original.to_dict()
    deserialized = TaskSnapshot.from_dict(serialized)

    assert deserialized.title == original.title
    assert deserialized.priority == original.priority
    assert deserialized.scope_in == original.scope_in
    assert deserialized.snapshot_path == original.snapshot_path


def test_standards_citation_round_trip():
    """Test StandardsCitation serialization and deserialization."""
    original = StandardsCitation(
        file="standards/backend-tier.md",
        section="Handler Constraints",
        requirement="Handlers must have complexity ≤10",
        line_span="L42-L89",
        content_sha="abc123def456",
    )

    serialized = original.to_dict()
    deserialized = StandardsCitation.from_dict(serialized)

    assert deserialized.file == original.file
    assert deserialized.section == original.section
    assert deserialized.requirement == original.requirement
    assert deserialized.line_span == original.line_span
    assert deserialized.content_sha == original.content_sha


def test_qa_coverage_summary_round_trip():
    """Test QACoverageSummary serialization and deserialization."""
    original = QACoverageSummary(
        lines=85.5,
        branches=72.3,
        functions=90.0,
        statements=88.2,
    )

    serialized = original.to_dict()
    deserialized = QACoverageSummary.from_dict(serialized)

    assert deserialized.lines == original.lines
    assert deserialized.branches == original.branches
    assert deserialized.functions == original.functions
    assert deserialized.statements == original.statements


def test_qa_command_summary_round_trip():
    """Test QACommandSummary with nested QACoverageSummary."""
    coverage = QACoverageSummary(lines=80.0, branches=70.0)
    original = QACommandSummary(
        lint_errors=2,
        lint_warnings=5,
        type_errors=1,
        tests_passed=42,
        tests_failed=3,
        coverage=coverage,
    )

    serialized = original.to_dict()
    deserialized = QACommandSummary.from_dict(serialized)

    assert deserialized.lint_errors == original.lint_errors
    assert deserialized.coverage.lines == 80.0
    assert deserialized.coverage.branches == 70.0


def test_qa_command_result_round_trip():
    """Test QACommandResult serialization and deserialization."""
    summary = QACommandSummary(tests_passed=10, tests_failed=0)
    original = QACommandResult(
        command_id="cmd-001",
        command="pytest",
        exit_code=0,
        duration_ms=1500,
        log_path=".agent-output/TASK-0001/qa-pytest.log",
        log_sha256="sha256hash",
        summary=summary,
    )

    serialized = original.to_dict()
    deserialized = QACommandResult.from_dict(serialized)

    assert deserialized.command_id == original.command_id
    assert deserialized.command == original.command
    assert deserialized.exit_code == original.exit_code
    assert deserialized.summary.tests_passed == 10


def test_qa_results_round_trip():
    """Test QAResults with nested QACommandResult list."""
    result1 = QACommandResult(
        command_id="cmd-001",
        command="pytest",
        exit_code=0,
        duration_ms=1500,
    )
    result2 = QACommandResult(
        command_id="cmd-002",
        command="eslint",
        exit_code=0,
        duration_ms=800,
    )

    original = QAResults(
        recorded_at="2025-11-20T12:00:00Z",
        agent="implementer",
        git_sha="abc123",
        results=[result1, result2],
    )

    serialized = original.to_dict()
    deserialized = QAResults.from_dict(serialized)

    assert deserialized.agent == original.agent
    assert len(deserialized.results) == 2
    assert deserialized.results[0].command_id == "cmd-001"
    assert deserialized.results[1].command_id == "cmd-002"


def test_compression_metadata_round_trip():
    """Test CompressionMetadata serialization and deserialization."""
    original = CompressionMetadata(
        format="tar.zst",
        original_size=1048576,
        index_path=".agent-output/TASK-0001/archive-index.json",
    )

    serialized = original.to_dict()
    deserialized = CompressionMetadata.from_dict(serialized)

    assert deserialized.format == original.format
    assert deserialized.original_size == original.original_size
    assert deserialized.index_path == original.index_path


def test_artifact_metadata_round_trip():
    """Test ArtifactMetadata with additional fields."""
    original = ArtifactMetadata(
        command="pytest",
        exit_code=0,
        duration_ms=2000,
        additional_fields={
            "custom_field": "value",
            "another_field": 123,
        },
    )

    serialized = original.to_dict()
    deserialized = ArtifactMetadata.from_dict(serialized)

    assert deserialized.command == original.command
    assert deserialized.exit_code == original.exit_code
    assert deserialized.additional_fields["custom_field"] == "value"
    assert deserialized.additional_fields["another_field"] == 123


def test_evidence_attachment_round_trip():
    """Test EvidenceAttachment with compression and metadata."""
    compression = CompressionMetadata(
        format="tar.gz",
        original_size=500000,
        index_path="archive-index.json",
    )
    metadata = ArtifactMetadata(
        command="pytest",
        exit_code=0,
        duration_ms=3000,
    )

    original = EvidenceAttachment(
        id="abc123def456",
        type="qa_output",
        path=".agent-output/TASK-0001/pytest.log",
        sha256="full-sha256-hash",
        size=1024,
        created_at="2025-11-20T12:00:00Z",
        description="Pytest output",
        compression=compression,
        metadata=metadata,
    )

    serialized = original.to_dict()
    deserialized = EvidenceAttachment.from_dict(serialized)

    assert deserialized.id == original.id
    assert deserialized.type == original.type
    assert deserialized.compression.format == "tar.gz"
    assert deserialized.metadata.command == "pytest"


def test_validation_baseline_round_trip():
    """Test ValidationBaseline serialization and deserialization."""
    qa_results = QAResults(
        recorded_at="2025-11-20T12:00:00Z",
        agent="implementer",
        results=[],
    )

    original = ValidationBaseline(
        commands=["pytest", "eslint"],
        initial_results=qa_results.to_dict(),
    )

    serialized = original.to_dict()
    deserialized = ValidationBaseline.from_dict(serialized)

    assert deserialized.commands == original.commands
    assert deserialized.initial_results is not None

    # Test get_qa_results() method
    qa = deserialized.get_qa_results()
    assert qa is not None
    assert qa.agent == "implementer"


def test_validation_baseline_with_qa_results():
    """Test ValidationBaseline.with_qa_results() method."""
    original = ValidationBaseline(commands=["pytest"])

    qa_results = QAResults(
        recorded_at="2025-11-20T12:00:00Z",
        agent="implementer",
        results=[],
    )

    updated = original.with_qa_results(qa_results)

    assert updated.commands == ["pytest"]
    assert updated.initial_results is not None
    assert updated.get_qa_results().agent == "implementer"


def test_file_operation_metrics_round_trip():
    """Test FileOperationMetrics serialization and deserialization."""
    original = FileOperationMetrics(
        read_calls=10,
        write_calls=5,
        edit_calls=3,
        files_read=[
            {"path": "file1.py", "size": 1024},
            {"path": "file2.py", "size": 2048},
        ],
    )

    serialized = original.to_dict()
    deserialized = FileOperationMetrics.from_dict(serialized)

    assert deserialized.read_calls == original.read_calls
    assert deserialized.write_calls == original.write_calls
    assert len(deserialized.files_read) == 2


def test_cache_operation_metrics_round_trip():
    """Test CacheOperationMetrics serialization and deserialization."""
    original = CacheOperationMetrics(
        context_reads=5,
        cache_hits=3,
        cache_misses=2,
        token_savings_estimate=10000,
    )

    serialized = original.to_dict()
    deserialized = CacheOperationMetrics.from_dict(serialized)

    assert deserialized.context_reads == original.context_reads
    assert deserialized.cache_hits == original.cache_hits
    assert deserialized.token_savings_estimate == original.token_savings_estimate


def test_command_execution_round_trip():
    """Test CommandExecution serialization and deserialization."""
    original = CommandExecution(
        command="pytest",
        exit_code=0,
        duration_ms=1500,
    )

    serialized = original.to_dict()
    deserialized = CommandExecution.from_dict(serialized)

    assert deserialized.command == original.command
    assert deserialized.exit_code == original.exit_code
    assert deserialized.duration_ms == original.duration_ms


def test_warning_entry_round_trip():
    """Test WarningEntry serialization and deserialization."""
    original = WarningEntry(
        timestamp="2025-11-20T12:00:00Z",
        level="warning",
        message="Test warning message",
    )

    serialized = original.to_dict()
    deserialized = WarningEntry.from_dict(serialized)

    assert deserialized.timestamp == original.timestamp
    assert deserialized.level == original.level
    assert deserialized.message == original.message


def test_warning_entry_validates_level():
    """Test WarningEntry validates level enum."""
    # Valid levels
    WarningEntry(timestamp="2025-11-20T12:00:00Z", level="warning", message="test")
    WarningEntry(timestamp="2025-11-20T12:00:00Z", level="error", message="test")

    # Invalid level
    with pytest.raises(ValueError, match="Invalid warning level"):
        WarningEntry(timestamp="2025-11-20T12:00:00Z", level="invalid", message="test")


def test_telemetry_snapshot_round_trip():
    """Test TelemetrySnapshot serialization and deserialization."""
    warning1 = WarningEntry(
        timestamp="2025-11-20T12:00:00Z",
        level="warning",
        message="Warning 1",
    )
    warning2 = WarningEntry(
        timestamp="2025-11-20T12:05:00Z",
        level="error",
        message="Error 1",
    )

    original = TelemetrySnapshot(
        task_id="TASK-0001",
        agent_role="implementer",
        session_start="2025-11-20T12:00:00Z",
        session_end="2025-11-20T13:00:00Z",
        duration_ms=3600000,
        metrics={
            "file_operations": {"read_calls": 10},
            "cache_operations": {"cache_hits": 5},
        },
        warnings=[warning1, warning2],
    )

    serialized = original.to_dict()
    deserialized = TelemetrySnapshot.from_dict(serialized)

    assert deserialized.task_id == original.task_id
    assert deserialized.agent_role == original.agent_role
    assert len(deserialized.warnings) == 2
    assert deserialized.warnings[0].level == "warning"
    assert deserialized.warnings[1].level == "error"


def test_telemetry_snapshot_validates_agent_role():
    """Test TelemetrySnapshot validates agent_role enum."""
    # Valid roles
    for role in ['implementer', 'reviewer', 'validator', 'task-runner']:
        TelemetrySnapshot(
            task_id="TASK-0001",
            agent_role=role,
            session_start="2025-11-20T12:00:00Z",
            session_end="2025-11-20T13:00:00Z",
            duration_ms=3600000,
            metrics={},
        )

    # Invalid role
    with pytest.raises(ValueError, match="Invalid agent_role"):
        TelemetrySnapshot(
            task_id="TASK-0001",
            agent_role="invalid",
            session_start="2025-11-20T12:00:00Z",
            session_end="2025-11-20T13:00:00Z",
            duration_ms=3600000,
            metrics={},
        )


def test_source_file_round_trip():
    """Test SourceFile serialization and deserialization."""
    original = SourceFile(
        path="tasks/backend/TASK-0001.task.yaml",
        sha256="abc123def456",
        purpose="task_yaml",
    )

    serialized = original.to_dict()
    deserialized = SourceFile.from_dict(serialized)

    assert deserialized.path == original.path
    assert deserialized.sha256 == original.sha256
    assert deserialized.purpose == original.purpose


def test_context_manifest_round_trip():
    """Test ContextManifest serialization and deserialization."""
    source1 = SourceFile(
        path="tasks/backend/TASK-0001.task.yaml",
        sha256="abc123",
        purpose="task_yaml",
    )
    source2 = SourceFile(
        path="standards/backend-tier.md",
        sha256="def456",
        purpose="standards_citation",
    )

    original = ContextManifest(
        version=1,
        created_at="2025-11-20T12:00:00Z",
        created_by="test-user",
        git_head="abc123def456",
        task_id="TASK-0001",
        context_schema_version=1,
        source_files=[source1, source2],
        normalization_version="1.0.0",
    )

    serialized = original.to_dict()
    deserialized = ContextManifest.from_dict(serialized)

    assert deserialized.version == original.version
    assert deserialized.task_id == original.task_id
    assert len(deserialized.source_files) == 2
    assert deserialized.source_files[0].path == "tasks/backend/TASK-0001.task.yaml"
    assert deserialized.normalization_version == "1.0.0"


def test_file_snapshot_round_trip():
    """Test FileSnapshot serialization and deserialization."""
    original = FileSnapshot(
        path="src/file.py",
        sha256="abc123",
        status="M",
        mode="100644",
        size=1024,
    )

    serialized = original.to_dict()
    deserialized = FileSnapshot.from_dict(serialized)

    assert deserialized.path == original.path
    assert deserialized.sha256 == original.sha256
    assert deserialized.status == original.status
    assert deserialized.mode == original.mode
    assert deserialized.size == original.size


def test_worktree_snapshot_round_trip():
    """Test WorktreeSnapshot serialization and deserialization."""
    file1 = FileSnapshot(
        path="src/file1.py",
        sha256="abc123",
        status="M",
        mode="100644",
        size=1024,
    )
    file2 = FileSnapshot(
        path="src/file2.py",
        sha256="def456",
        status="A",
        mode="100644",
        size=2048,
    )

    original = WorktreeSnapshot(
        base_commit="abc123def456",
        snapshot_time="2025-11-20T12:00:00Z",
        diff_from_base=".agent-output/TASK-0001/diff-base.patch",
        diff_sha="sha256hash",
        status_report="M src/file1.py\nA src/file2.py",
        files_changed=[file1, file2],
        diff_stat="2 files changed, 50 insertions(+), 10 deletions(-)",
        scope_hash="scopehash123",
        diff_from_implementer=".agent-output/TASK-0001/diff-impl.patch",
        incremental_diff_sha="incr-sha",
    )

    serialized = original.to_dict()
    deserialized = WorktreeSnapshot.from_dict(serialized)

    assert deserialized.base_commit == original.base_commit
    assert len(deserialized.files_changed) == 2
    assert deserialized.files_changed[0].path == "src/file1.py"
    assert deserialized.diff_from_implementer is not None
    assert deserialized.incremental_diff_sha == "incr-sha"


def test_agent_coordination_round_trip():
    """Test AgentCoordination serialization and deserialization."""
    worktree = WorktreeSnapshot(
        base_commit="abc123",
        snapshot_time="2025-11-20T12:00:00Z",
        diff_from_base="diff.patch",
        diff_sha="sha256",
        status_report="status",
        files_changed=[],
        diff_stat="stat",
        scope_hash="scope",
    )

    original = AgentCoordination(
        status="done",
        completed_at="2025-11-20T12:00:00Z",
        qa_log_path=".agent-output/TASK-0001/qa.log",
        session_id="session-123",
        blocking_findings=["finding1", "finding2"],
        worktree_snapshot=worktree,
        drift_budget=2,
        qa_results={"agent": "implementer"},
    )

    serialized = original.to_dict()
    deserialized = AgentCoordination.from_dict(serialized)

    assert deserialized.status == original.status
    assert deserialized.completed_at == original.completed_at
    assert len(deserialized.blocking_findings) == 2
    assert deserialized.worktree_snapshot is not None
    assert deserialized.drift_budget == 2


def test_task_context_round_trip():
    """Test TaskContext serialization and deserialization."""
    task_snapshot = TaskSnapshot(
        title="Test Task",
        priority="P1",
        area="backend",
        description="Test",
        scope_in=["a"],
        scope_out=["b"],
        acceptance_criteria=["c"],
        plan_steps=[],
        deliverables=[],
        validation_commands=[],
    )

    citation = StandardsCitation(
        file="standards/test.md",
        section="test",
        requirement="Test requirement",
    )

    validation_baseline = ValidationBaseline(
        commands=["pytest"],
    )

    original = TaskContext(
        version=1,
        task_id="TASK-0001",
        created_at="2025-11-20T12:00:00Z",
        created_by="test-user",
        git_head="abc123",
        task_file_sha="sha256",
        task_snapshot=task_snapshot,
        standards_citations=[citation],
        validation_baseline=validation_baseline,
        repo_paths=["src/", "tests/"],
        implementer=AgentCoordination(status="done"),
        reviewer=AgentCoordination(status="pending"),
        validator=AgentCoordination(status="pending"),
        audit_updated_at="2025-11-20T12:00:00Z",
        audit_updated_by="test-user",
        audit_update_count=1,
    )

    serialized = original.to_dict()
    deserialized = TaskContext.from_dict(serialized)

    assert deserialized.version == original.version
    assert deserialized.task_id == original.task_id
    assert deserialized.task_snapshot.title == "Test Task"
    assert len(deserialized.standards_citations) == 1
    assert deserialized.implementer.status == "done"
    assert deserialized.audit_update_count == 1


def test_task_context_version_validation():
    """Test TaskContext rejects unsupported versions."""
    data = {
        'version': 99,  # Unsupported version
        'task_id': 'TASK-0001',
        'created_at': '2025-11-20T12:00:00Z',
        'created_by': 'test',
        'git_head': 'abc123',
        'task_file_sha': 'sha256',
        'immutable': {
            'task_snapshot': {},
            'standards_citations': [],
            'validation_baseline': {'commands': []},
            'repo_paths': [],
        },
        'coordination': {
            'implementer': {},
            'reviewer': {},
            'validator': {},
        },
        'audit': {
            'updated_at': '2025-11-20T12:00:00Z',
            'updated_by': 'test',
            'update_count': 0,
        },
    }

    with pytest.raises(ValueError, match="Unsupported context version: 99"):
        TaskContext.from_dict(data)


def test_standards_excerpt_round_trip():
    """Test StandardsExcerpt serialization and deserialization."""
    now = datetime.now(timezone.utc).isoformat()

    original = StandardsExcerpt(
        file="standards/backend-tier.md",
        section="Handler Constraints",
        requirement="Handlers must have complexity ≤10",
        line_span="L42-L89",
        content_sha256="full-sha256-hash-64-chars-long-abcdef1234567890abcdef1234567890",
        excerpt_id="abc12345",
        cached_path=".agent-output/.excerpts/abc12345.md",
        extracted_at=now,
    )

    serialized = original.to_dict()
    deserialized = StandardsExcerpt.from_dict(serialized)

    assert deserialized.file == original.file
    assert deserialized.section == original.section
    assert deserialized.requirement == original.requirement
    assert deserialized.line_span == original.line_span
    assert deserialized.content_sha256 == original.content_sha256
    assert deserialized.excerpt_id == original.excerpt_id
    assert deserialized.cached_path == original.cached_path
    assert deserialized.extracted_at == now

    # Verify 16-char prefix is included in serialized dict
    assert serialized['content_sha'] == original.content_sha256[:16]


# ============================================================================
# Field Type Tests
# ============================================================================

def test_task_snapshot_field_types():
    """Verify TaskSnapshot field types are correct."""
    snapshot = TaskSnapshot(
        title="Test",
        priority="P1",
        area="backend",
        description="Test",
        scope_in=["a"],
        scope_out=["b"],
        acceptance_criteria=["c"],
        plan_steps=[{"step": 1}],
        deliverables=["file.py"],
        validation_commands=[{"cmd": "pytest"}],
    )

    assert isinstance(snapshot.title, str)
    assert isinstance(snapshot.priority, str)
    assert isinstance(snapshot.scope_in, list)
    assert isinstance(snapshot.plan_steps, list)


def test_qa_command_result_field_types():
    """Verify QACommandResult field types are correct."""
    result = QACommandResult(
        command_id="cmd-001",
        command="pytest",
        exit_code=0,
        duration_ms=1500,
    )

    assert isinstance(result.command_id, str)
    assert isinstance(result.command, str)
    assert isinstance(result.exit_code, int)
    assert isinstance(result.duration_ms, int)


def test_telemetry_snapshot_field_types():
    """Verify TelemetrySnapshot field types are correct."""
    telemetry = TelemetrySnapshot(
        task_id="TASK-0001",
        agent_role="implementer",
        session_start="2025-11-20T12:00:00Z",
        session_end="2025-11-20T13:00:00Z",
        duration_ms=3600000,
        metrics={},
    )

    assert isinstance(telemetry.task_id, str)
    assert isinstance(telemetry.agent_role, str)
    assert isinstance(telemetry.duration_ms, int)
    assert isinstance(telemetry.metrics, dict)
    assert isinstance(telemetry.warnings, list)
