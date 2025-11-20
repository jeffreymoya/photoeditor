"""
Core dataclass models for task context storage.

Extracted from context_store.py for modularization (S3.1).
Contains immutable and mutable models for task context, evidence attachments,
and coordination state.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


# ============================================================================
# Schema Version Constants
# ============================================================================

MANIFEST_SCHEMA_VERSION = 1
CONTEXT_SCHEMA_VERSION = 1


# ============================================================================
# Immutable Context Models (frozen dataclasses)
# ============================================================================

@dataclass(frozen=True)
class TaskSnapshot:
    """
    Immutable snapshot of task metadata from .task.yaml

    Includes both task content (title, plan, deliverables) and optional
    file snapshot metadata (paths, hashes) for audit trail.
    """
    # Core task metadata
    title: str
    priority: str
    area: str
    description: str
    scope_in: List[str]
    scope_out: List[str]
    acceptance_criteria: List[str]

    # Plan and deliverables (GAP-1: extend payload per proposal §3.1)
    plan_steps: List[Dict[str, Any]]
    deliverables: List[str]
    validation_commands: List[Dict[str, str]]

    # Optional file snapshot metadata (for create_snapshot_and_embed)
    snapshot_path: Optional[str] = None
    snapshot_sha256: Optional[str] = None
    original_path: Optional[str] = None
    completed_path: Optional[str] = None
    created_at: Optional[str] = None

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        result = {
            'title': self.title,
            'priority': self.priority,
            'area': self.area,
            'description': self.description,
            'scope_in': list(self.scope_in),
            'scope_out': list(self.scope_out),
            'acceptance_criteria': list(self.acceptance_criteria),
            'plan_steps': list(self.plan_steps),
            'deliverables': list(self.deliverables),
            'validation_commands': list(self.validation_commands),
        }

        # Include snapshot metadata only if present
        if self.snapshot_path is not None:
            result['snapshot_path'] = self.snapshot_path
        if self.snapshot_sha256 is not None:
            result['snapshot_sha256'] = self.snapshot_sha256
        if self.original_path is not None:
            result['original_path'] = self.original_path
        if self.completed_path is not None:
            result['completed_path'] = self.completed_path
        if self.created_at is not None:
            result['created_at'] = self.created_at

        return result

    def to_legacy_dict(self) -> dict:
        """Backward-compatible dict representation (alias for to_dict)."""
        return self.to_dict()

    @classmethod
    def from_dict(cls, data: dict) -> 'TaskSnapshot':
        """Deserialize from dict."""
        return cls(
            title=data['title'],
            priority=data['priority'],
            area=data['area'],
            description=data['description'],
            scope_in=data['scope_in'],
            scope_out=data['scope_out'],
            acceptance_criteria=data['acceptance_criteria'],
            plan_steps=data.get('plan_steps', []),
            deliverables=data.get('deliverables', []),
            validation_commands=data.get('validation_commands', []),
            snapshot_path=data.get('snapshot_path'),
            snapshot_sha256=data.get('snapshot_sha256'),
            original_path=data.get('original_path'),
            completed_path=data.get('completed_path'),
            created_at=data.get('created_at'),
        )


@dataclass(frozen=True)
class StandardsCitation:
    """Reference to a standards requirement."""
    file: str                    # e.g., "standards/backend-tier.md"
    section: str                 # e.g., "handler-constraints"
    requirement: str             # ≤140 chars summary
    line_span: Optional[str] = None     # e.g., "L42-L89"
    content_sha: Optional[str] = None   # 16-char SHA prefix

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            'file': self.file,
            'section': self.section,
            'requirement': self.requirement,
            'line_span': self.line_span,
            'content_sha': self.content_sha,
        }

    def to_legacy_dict(self) -> dict:
        """Backward-compatible dict representation (alias for to_dict)."""
        return self.to_dict()

    @classmethod
    def from_dict(cls, data: dict) -> 'StandardsCitation':
        """Deserialize from dict."""
        return cls(
            file=data['file'],
            section=data['section'],
            requirement=data['requirement'],
            line_span=data.get('line_span'),
            content_sha=data.get('content_sha'),
        )


@dataclass(frozen=True)
class StandardsExcerpt:
    """
    Standards excerpt extracted from markdown file.

    Per Section 7 of task-context-cache-hardening-schemas.md.
    """
    file: str                           # e.g., "standards/backend-tier.md"
    section: str                        # e.g., "Handler Constraints"
    requirement: str                    # First sentence summary (≤140 chars)
    line_span: str                      # 1-based line span (e.g., "L42-L89") per schema §7.1
    content_sha256: str                 # Full SHA256 hash of excerpt content
    excerpt_id: str                     # 8-char SHA256 prefix
    cached_path: Optional[str] = None   # Relative path to cached excerpt file
    extracted_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            'file': self.file,
            'section': self.section,
            'requirement': self.requirement,
            'line_span': self.line_span,
            'content_sha256': self.content_sha256,
            'content_sha': self.content_sha256[:16],  # 16-char prefix for StandardsCitation compatibility
            'excerpt_id': self.excerpt_id,
            'cached_path': self.cached_path,
            'extracted_at': self.extracted_at,
        }

    def to_legacy_dict(self) -> dict:
        """Backward-compatible dict representation (alias for to_dict)."""
        return self.to_dict()

    @classmethod
    def from_dict(cls, data: dict) -> 'StandardsExcerpt':
        """Deserialize from dict."""
        return cls(
            file=data['file'],
            section=data['section'],
            requirement=data['requirement'],
            line_span=data['line_span'],
            content_sha256=data['content_sha256'],
            excerpt_id=data['excerpt_id'],
            cached_path=data.get('cached_path'),
            extracted_at=data.get('extracted_at', datetime.now(timezone.utc).isoformat()),
        )


@dataclass(frozen=True)
class QACoverageSummary:
    """Coverage metrics from test execution."""
    lines: Optional[float] = None
    branches: Optional[float] = None
    functions: Optional[float] = None
    statements: Optional[float] = None

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        result = {}
        if self.lines is not None:
            result['lines'] = self.lines
        if self.branches is not None:
            result['branches'] = self.branches
        if self.functions is not None:
            result['functions'] = self.functions
        if self.statements is not None:
            result['statements'] = self.statements
        return result

    def to_legacy_dict(self) -> dict:
        """Backward-compatible dict representation (alias for to_dict)."""
        return self.to_dict()

    @classmethod
    def from_dict(cls, data: dict) -> 'QACoverageSummary':
        """Deserialize from dict."""
        return cls(
            lines=data.get('lines'),
            branches=data.get('branches'),
            functions=data.get('functions'),
            statements=data.get('statements'),
        )


@dataclass(frozen=True)
class QACommandSummary:
    """Parsed summary from QA command output."""
    lint_errors: Optional[int] = None
    lint_warnings: Optional[int] = None
    type_errors: Optional[int] = None
    tests_passed: Optional[int] = None
    tests_failed: Optional[int] = None
    coverage: Optional[QACoverageSummary] = None

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        result = {}
        if self.lint_errors is not None:
            result['lint_errors'] = self.lint_errors
        if self.lint_warnings is not None:
            result['lint_warnings'] = self.lint_warnings
        if self.type_errors is not None:
            result['type_errors'] = self.type_errors
        if self.tests_passed is not None:
            result['tests_passed'] = self.tests_passed
        if self.tests_failed is not None:
            result['tests_failed'] = self.tests_failed
        if self.coverage is not None:
            result['coverage'] = self.coverage.to_dict()
        return result

    def to_legacy_dict(self) -> dict:
        """Backward-compatible dict representation (alias for to_dict)."""
        return self.to_dict()

    @classmethod
    def from_dict(cls, data: dict) -> 'QACommandSummary':
        """Deserialize from dict."""
        coverage = None
        if 'coverage' in data:
            coverage = QACoverageSummary.from_dict(data['coverage'])
        return cls(
            lint_errors=data.get('lint_errors'),
            lint_warnings=data.get('lint_warnings'),
            type_errors=data.get('type_errors'),
            tests_passed=data.get('tests_passed'),
            tests_failed=data.get('tests_failed'),
            coverage=coverage,
        )


@dataclass(frozen=True)
class QACommandResult:
    """
    Result from a single QA command execution.

    Per Section 4.1 of task-context-cache-hardening-schemas.md.
    """
    command_id: str
    command: str
    exit_code: int
    duration_ms: int
    log_path: Optional[str] = None
    log_sha256: Optional[str] = None
    summary: Optional[QACommandSummary] = None

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        result = {
            'command_id': self.command_id,
            'command': self.command,
            'exit_code': self.exit_code,
            'duration_ms': self.duration_ms,
        }
        if self.log_path is not None:
            result['log_path'] = self.log_path
        if self.log_sha256 is not None:
            result['log_sha256'] = self.log_sha256
        if self.summary is not None:
            result['summary'] = self.summary.to_dict()
        return result

    def to_legacy_dict(self) -> dict:
        """Backward-compatible dict representation (alias for to_dict)."""
        return self.to_dict()

    @classmethod
    def from_dict(cls, data: dict) -> 'QACommandResult':
        """Deserialize from dict."""
        summary = None
        if 'summary' in data and data['summary']:
            summary = QACommandSummary.from_dict(data['summary'])
        return cls(
            command_id=data['command_id'],
            command=data['command'],
            exit_code=data['exit_code'],
            duration_ms=data['duration_ms'],
            log_path=data.get('log_path'),
            log_sha256=data.get('log_sha256'),
            summary=summary,
        )


@dataclass(frozen=True)
class QAResults:
    """
    Complete QA results structure.

    Per Section 4.1 of task-context-cache-hardening-schemas.md.
    Stored in ValidationBaseline.initial_results.
    """
    recorded_at: str  # ISO 8601 timestamp
    agent: str  # implementer, reviewer, validator
    git_sha: Optional[str] = None
    results: List[QACommandResult] = field(default_factory=list)

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            'recorded_at': self.recorded_at,
            'agent': self.agent,
            'git_sha': self.git_sha,
            'results': [r.to_dict() for r in self.results],
        }

    def to_legacy_dict(self) -> dict:
        """Backward-compatible dict representation (alias for to_dict)."""
        return self.to_dict()

    @classmethod
    def from_dict(cls, data: dict) -> 'QAResults':
        """Deserialize from dict."""
        results = []
        if 'results' in data:
            results = [QACommandResult.from_dict(r) for r in data['results']]
        return cls(
            recorded_at=data['recorded_at'],
            agent=data['agent'],
            git_sha=data.get('git_sha'),
            results=results,
        )


@dataclass(frozen=True)
class CompressionMetadata:
    """
    Compression metadata for evidence archives.

    Per Section 1.1 of task-context-cache-hardening-schemas.md.
    Present only for type=archive evidence attachments.
    """
    format: str  # "tar.zst" or "tar.gz"
    original_size: int  # Size in bytes before compression
    index_path: str  # Path to index.json listing archive contents

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            'format': self.format,
            'original_size': self.original_size,
            'index_path': self.index_path,
        }

    def to_legacy_dict(self) -> dict:
        """Backward-compatible dict representation (alias for to_dict)."""
        return self.to_dict()

    @classmethod
    def from_dict(cls, data: dict) -> 'CompressionMetadata':
        """Deserialize from dict."""
        return cls(
            format=data['format'],
            original_size=data['original_size'],
            index_path=data['index_path'],
        )


@dataclass(frozen=True)
class ArtifactMetadata:
    """
    Type-specific metadata for evidence attachments.

    Per Section 1.1 of task-context-cache-hardening-schemas.md.
    Used primarily for qa_output type artifacts, but supports arbitrary additional
    fields for audit trails (e.g., sha256, original_path, completed_path for snapshots).
    """
    command: Optional[str] = None  # Command that generated this artifact
    exit_code: Optional[int] = None  # Command exit code
    duration_ms: Optional[int] = None  # Execution time in milliseconds
    additional_fields: Dict[str, Any] = field(default_factory=dict)  # Arbitrary metadata (e.g., audit fields)

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        result = {}
        if self.command is not None:
            result['command'] = self.command
        if self.exit_code is not None:
            result['exit_code'] = self.exit_code
        if self.duration_ms is not None:
            result['duration_ms'] = self.duration_ms
        # Merge additional fields
        result.update(self.additional_fields)
        return result

    def to_legacy_dict(self) -> dict:
        """Backward-compatible dict representation (alias for to_dict)."""
        return self.to_dict()

    @classmethod
    def from_dict(cls, data: dict) -> 'ArtifactMetadata':
        """Deserialize from dict, preserving all fields."""
        # Extract known fields
        known_fields = {'command', 'exit_code', 'duration_ms'}
        command = data.get('command')
        exit_code = data.get('exit_code')
        duration_ms = data.get('duration_ms')

        # Preserve all other fields as additional_fields
        additional = {k: v for k, v in data.items() if k not in known_fields}

        return cls(
            command=command,
            exit_code=exit_code,
            duration_ms=duration_ms,
            additional_fields=additional
        )


@dataclass(frozen=True)
class EvidenceAttachment:
    """
    Evidence attachment for task context.

    Per Section 1.1 of task-context-cache-hardening-schemas.md.
    Represents a single piece of evidence (log, artifact, screenshot, etc.)
    attached to a task during agent workflow.
    """
    id: str  # 16-char SHA256 prefix of content
    type: str  # One of ARTIFACT_TYPES
    path: str  # Relative path from repo root
    sha256: str  # Full SHA256 hash of content
    size: int  # Size in bytes
    created_at: str  # ISO 8601 timestamp
    description: Optional[str] = None  # Human-readable description (max 200 chars)
    compression: Optional[CompressionMetadata] = None  # Present only for type=archive
    metadata: Optional[ArtifactMetadata] = None  # Type-specific metadata

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        result = {
            'id': self.id,
            'type': self.type,
            'path': self.path,
            'sha256': self.sha256,
            'size': self.size,
            'created_at': self.created_at,
        }
        if self.description is not None:
            result['description'] = self.description
        if self.compression is not None:
            result['compression'] = self.compression.to_dict()
        if self.metadata is not None:
            result['metadata'] = self.metadata.to_dict()
        return result

    def to_legacy_dict(self) -> dict:
        """Backward-compatible dict representation (alias for to_dict)."""
        return self.to_dict()

    @classmethod
    def from_dict(cls, data: dict) -> 'EvidenceAttachment':
        """Deserialize from dict."""
        compression = None
        if 'compression' in data and data['compression']:
            compression = CompressionMetadata.from_dict(data['compression'])

        metadata = None
        if 'metadata' in data and data['metadata']:
            metadata = ArtifactMetadata.from_dict(data['metadata'])

        return cls(
            id=data['id'],
            type=data['type'],
            path=data['path'],
            sha256=data['sha256'],
            size=data['size'],
            created_at=data['created_at'],
            description=data.get('description'),
            compression=compression,
            metadata=metadata,
        )


@dataclass(frozen=True)
class ValidationBaseline:
    """QA commands and initial results."""
    commands: List[str]
    initial_results: Optional[Dict[str, Any]] = None

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            'commands': list(self.commands),
            'initial_results': self.initial_results,
        }

    def to_legacy_dict(self) -> dict:
        """Backward-compatible dict representation (alias for to_dict)."""
        return self.to_dict()

    @classmethod
    def from_dict(cls, data: dict) -> 'ValidationBaseline':
        """Deserialize from dict."""
        return cls(
            commands=data['commands'],
            initial_results=data.get('initial_results'),
        )

    def get_qa_results(self) -> Optional[QAResults]:
        """Get structured QA results if available."""
        if self.initial_results is None:
            return None
        try:
            return QAResults.from_dict(self.initial_results)
        except (KeyError, TypeError):
            # Fallback for legacy format
            return None

    def with_qa_results(self, qa_results: QAResults) -> 'ValidationBaseline':
        """Return new ValidationBaseline with updated QA results."""
        return ValidationBaseline(
            commands=self.commands,
            initial_results=qa_results.to_dict(),
        )


# ============================================================================
# Telemetry Models (Section 5.1: Agent metrics collection)
# ============================================================================

@dataclass(frozen=True)
class FileOperationMetrics:
    """
    File operation telemetry for agent sessions.

    Per Section 5.1 of task-context-cache-hardening-schemas.md.
    """
    read_calls: int = 0
    write_calls: int = 0
    edit_calls: int = 0
    files_read: List[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            'read_calls': self.read_calls,
            'write_calls': self.write_calls,
            'edit_calls': self.edit_calls,
            'files_read': list(self.files_read),
        }

    def to_legacy_dict(self) -> dict:
        """Backward-compatible dict representation (alias for to_dict)."""
        return self.to_dict()

    @classmethod
    def from_dict(cls, data: dict) -> 'FileOperationMetrics':
        """Deserialize from dict."""
        return cls(
            read_calls=data.get('read_calls', 0),
            write_calls=data.get('write_calls', 0),
            edit_calls=data.get('edit_calls', 0),
            files_read=data.get('files_read', []),
        )


@dataclass(frozen=True)
class CacheOperationMetrics:
    """
    Cache operation telemetry for agent sessions.

    Per Section 5.1 of task-context-cache-hardening-schemas.md.
    """
    context_reads: int = 0
    cache_hits: int = 0
    cache_misses: int = 0
    token_savings_estimate: int = 0

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            'context_reads': self.context_reads,
            'cache_hits': self.cache_hits,
            'cache_misses': self.cache_misses,
            'token_savings_estimate': self.token_savings_estimate,
        }

    def to_legacy_dict(self) -> dict:
        """Backward-compatible dict representation (alias for to_dict)."""
        return self.to_dict()

    @classmethod
    def from_dict(cls, data: dict) -> 'CacheOperationMetrics':
        """Deserialize from dict."""
        return cls(
            context_reads=data.get('context_reads', 0),
            cache_hits=data.get('cache_hits', 0),
            cache_misses=data.get('cache_misses', 0),
            token_savings_estimate=data.get('token_savings_estimate', 0),
        )


@dataclass(frozen=True)
class CommandExecution:
    """
    Single command execution record.

    Per Section 5.1 of task-context-cache-hardening-schemas.md.
    """
    command: str
    exit_code: int
    duration_ms: int

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            'command': self.command,
            'exit_code': self.exit_code,
            'duration_ms': self.duration_ms,
        }

    def to_legacy_dict(self) -> dict:
        """Backward-compatible dict representation (alias for to_dict)."""
        return self.to_dict()

    @classmethod
    def from_dict(cls, data: dict) -> 'CommandExecution':
        """Deserialize from dict."""
        return cls(
            command=data['command'],
            exit_code=data['exit_code'],
            duration_ms=data['duration_ms'],
        )


@dataclass(frozen=True)
class WarningEntry:
    """
    Warning or error logged during agent session.

    Per Section 5.1 of task-context-cache-hardening-schemas.md.
    """
    timestamp: str  # ISO 8601
    level: str      # 'warning' | 'error'
    message: str

    def __post_init__(self):
        """Validate warning level enum."""
        valid_levels = ['warning', 'error']
        if self.level not in valid_levels:
            raise ValueError(
                f"Invalid warning level: {self.level}. "
                f"Must be one of: {', '.join(valid_levels)}"
            )

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            'timestamp': self.timestamp,
            'level': self.level,
            'message': self.message,
        }

    def to_legacy_dict(self) -> dict:
        """Backward-compatible dict representation (alias for to_dict)."""
        return self.to_dict()

    @classmethod
    def from_dict(cls, data: dict) -> 'WarningEntry':
        """Deserialize from dict."""
        return cls(
            timestamp=data['timestamp'],
            level=data['level'],
            message=data['message'],
        )


@dataclass(frozen=True)
class TelemetrySnapshot:
    """
    Complete telemetry snapshot for agent session.

    Per Section 5.1 of task-context-cache-hardening-schemas.md.
    Stored in .agent-output/TASK-XXXX/telemetry-{agent}.json
    """
    task_id: str
    agent_role: str  # 'implementer' | 'reviewer' | 'validator' | 'task-runner'
    session_start: str  # ISO 8601
    session_end: str    # ISO 8601
    duration_ms: int
    metrics: dict  # Nested structure with file_operations, cache_operations, commands_executed
    warnings: List[WarningEntry] = field(default_factory=list)

    def __post_init__(self):
        """Validate agent_role enum."""
        valid_roles = ['implementer', 'reviewer', 'validator', 'task-runner']
        if self.agent_role not in valid_roles:
            raise ValueError(
                f"Invalid agent_role: {self.agent_role}. "
                f"Must be one of: {', '.join(valid_roles)}"
            )

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            'task_id': self.task_id,
            'agent_role': self.agent_role,
            'session_start': self.session_start,
            'session_end': self.session_end,
            'duration_ms': self.duration_ms,
            'metrics': self.metrics,
            'warnings': [w.to_dict() for w in self.warnings],
        }

    def to_legacy_dict(self) -> dict:
        """Backward-compatible dict representation (alias for to_dict)."""
        return self.to_dict()

    @classmethod
    def from_dict(cls, data: dict) -> 'TelemetrySnapshot':
        """Deserialize from dict."""
        warnings = []
        if 'warnings' in data:
            warnings = [WarningEntry.from_dict(w) for w in data['warnings']]

        return cls(
            task_id=data['task_id'],
            agent_role=data['agent_role'],
            session_start=data['session_start'],
            session_end=data['session_end'],
            duration_ms=data['duration_ms'],
            metrics=data['metrics'],
            warnings=warnings,
        )


# ============================================================================
# Manifest Models (GAP-4: Context provenance tracking)
# ============================================================================

@dataclass(frozen=True)
class SourceFile:
    """Record of a source file used during context initialization."""
    path: str                # Relative path from repo root
    sha256: str             # Full SHA256 of file content
    purpose: str            # Description: "task_yaml", "standards_citation", etc.

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            'path': self.path,
            'sha256': self.sha256,
            'purpose': self.purpose,
        }

    def to_legacy_dict(self) -> dict:
        """Backward-compatible dict representation (alias for to_dict)."""
        return self.to_dict()

    @classmethod
    def from_dict(cls, data: dict) -> 'SourceFile':
        """Deserialize from dict."""
        return cls(
            path=data['path'],
            sha256=data['sha256'],
            purpose=data['purpose'],
        )


@dataclass(frozen=True)
class ContextManifest:
    """
    Provenance manifest for context initialization.

    Records all source files + SHAs used to build immutable context,
    enabling regeneration after standards/task changes (GAP-4).
    """
    version: int                           # Manifest schema version (current: 1)
    created_at: str                        # ISO timestamp
    created_by: str                        # Actor who initialized
    git_head: str                          # Git HEAD SHA at init time
    task_id: str                           # Task identifier
    context_schema_version: int            # Version of context.json schema
    source_files: List[SourceFile]         # All files used (task YAML, standards, etc.)
    normalization_version: Optional[str] = None   # Version of normalize_multiline() used

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            'version': self.version,
            'created_at': self.created_at,
            'created_by': self.created_by,
            'git_head': self.git_head,
            'task_id': self.task_id,
            'context_schema_version': self.context_schema_version,
            'source_files': [sf.to_dict() for sf in self.source_files],
            'normalization_version': self.normalization_version,
        }

    def to_legacy_dict(self) -> dict:
        """Backward-compatible dict representation (alias for to_dict)."""
        return self.to_dict()

    @classmethod
    def from_dict(cls, data: dict) -> 'ContextManifest':
        """Deserialize from dict."""
        return cls(
            version=data['version'],
            created_at=data['created_at'],
            created_by=data['created_by'],
            git_head=data['git_head'],
            task_id=data['task_id'],
            context_schema_version=data['context_schema_version'],
            source_files=[SourceFile.from_dict(sf) for sf in data['source_files']],
            normalization_version=data.get('normalization_version'),
        )


# ============================================================================
# Delta Tracking Models (frozen dataclasses)
# ============================================================================

@dataclass(frozen=True)
class FileSnapshot:
    """Snapshot of a single file's state."""
    path: str
    sha256: str
    status: str      # 'M' (modified), 'A' (added), 'D' (deleted)
    mode: str        # File permissions
    size: int

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            'path': self.path,
            'sha256': self.sha256,
            'status': self.status,
            'mode': self.mode,
            'size': self.size,
        }

    def to_legacy_dict(self) -> dict:
        """Backward-compatible dict representation (alias for to_dict)."""
        return self.to_dict()

    @classmethod
    def from_dict(cls, data: dict) -> 'FileSnapshot':
        """Deserialize from dict."""
        return cls(
            path=data['path'],
            sha256=data['sha256'],
            status=data['status'],
            mode=data['mode'],
            size=data['size'],
        )


@dataclass(frozen=True)
class WorktreeSnapshot:
    """Complete working tree state at agent completion."""
    base_commit: str
    snapshot_time: str
    diff_from_base: str          # Path to diff file
    diff_sha: str                # SHA256 of normalized diff
    status_report: str           # Raw git status --porcelain -z
    files_changed: List[FileSnapshot]
    diff_stat: str               # git diff --stat output
    scope_hash: str              # SHA256 of repo_paths array
    # Reviewer-only fields
    diff_from_implementer: Optional[str] = None
    incremental_diff_sha: Optional[str] = None
    incremental_diff_error: Optional[str] = None

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            'base_commit': self.base_commit,
            'snapshot_time': self.snapshot_time,
            'diff_from_base': self.diff_from_base,
            'diff_sha': self.diff_sha,
            'status_report': self.status_report,
            'files_changed': [f.to_dict() for f in self.files_changed],
            'diff_stat': self.diff_stat,
            'scope_hash': self.scope_hash,
            'diff_from_implementer': self.diff_from_implementer,
            'incremental_diff_sha': self.incremental_diff_sha,
            'incremental_diff_error': self.incremental_diff_error,
        }

    def to_legacy_dict(self) -> dict:
        """Backward-compatible dict representation (alias for to_dict)."""
        return self.to_dict()

    @classmethod
    def from_dict(cls, data: dict) -> 'WorktreeSnapshot':
        """Deserialize from dict."""
        return cls(
            base_commit=data['base_commit'],
            snapshot_time=data['snapshot_time'],
            diff_from_base=data['diff_from_base'],
            diff_sha=data['diff_sha'],
            status_report=data['status_report'],
            files_changed=[FileSnapshot.from_dict(f) for f in data['files_changed']],
            diff_stat=data['diff_stat'],
            scope_hash=data['scope_hash'],
            diff_from_implementer=data.get('diff_from_implementer'),
            incremental_diff_sha=data.get('incremental_diff_sha'),
            incremental_diff_error=data.get('incremental_diff_error'),
        )


# ============================================================================
# Coordination State Models (mutable)
# ============================================================================

@dataclass
class AgentCoordination:
    """Mutable coordination state for one agent."""
    status: str = "pending"  # "pending" | "in_progress" | "done" | "blocked"
    completed_at: Optional[str] = None
    qa_log_path: Optional[str] = None
    session_id: Optional[str] = None
    blocking_findings: List[str] = field(default_factory=list)
    worktree_snapshot: Optional[WorktreeSnapshot] = None
    drift_budget: int = 0        # Incremented on failed verification
    qa_results: Optional[Dict[str, Any]] = None  # Parsed QA log results

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            'status': self.status,
            'completed_at': self.completed_at,
            'qa_log_path': self.qa_log_path,
            'session_id': self.session_id,
            'blocking_findings': list(self.blocking_findings),
            'worktree_snapshot': self.worktree_snapshot.to_dict() if self.worktree_snapshot else None,
            'drift_budget': self.drift_budget,
            'qa_results': self.qa_results,
        }

    def to_legacy_dict(self) -> dict:
        """Backward-compatible dict representation (alias for to_dict)."""
        return self.to_dict()

    @classmethod
    def from_dict(cls, data: dict) -> 'AgentCoordination':
        """Deserialize from dict."""
        worktree = data.get('worktree_snapshot')
        return cls(
            status=data.get('status', 'pending'),
            completed_at=data.get('completed_at'),
            qa_log_path=data.get('qa_log_path'),
            session_id=data.get('session_id'),
            blocking_findings=data.get('blocking_findings', []),
            worktree_snapshot=WorktreeSnapshot.from_dict(worktree) if worktree else None,
            drift_budget=data.get('drift_budget', 0),
            qa_results=data.get('qa_results'),
        )


# ============================================================================
# Top-Level Context Model
# ============================================================================

@dataclass
class TaskContext:
    """Complete task context with immutable + mutable sections."""
    version: int
    task_id: str
    created_at: str
    created_by: str
    git_head: str
    task_file_sha: str

    # Immutable section
    task_snapshot: TaskSnapshot
    standards_citations: List[StandardsCitation]
    validation_baseline: ValidationBaseline
    repo_paths: List[str]

    # Mutable coordination
    implementer: AgentCoordination
    reviewer: AgentCoordination
    validator: AgentCoordination

    # Audit trail
    audit_updated_at: str
    audit_updated_by: str
    audit_update_count: int = 0

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict with sorted keys."""
        return {
            'version': self.version,
            'task_id': self.task_id,
            'created_at': self.created_at,
            'created_by': self.created_by,
            'git_head': self.git_head,
            'task_file_sha': self.task_file_sha,
            'immutable': {
                'task_snapshot': self.task_snapshot.to_dict(),
                'standards_citations': [c.to_dict() for c in self.standards_citations],
                'validation_baseline': self.validation_baseline.to_dict(),
                'repo_paths': sorted(self.repo_paths),
            },
            'coordination': {
                'implementer': self.implementer.to_dict(),
                'reviewer': self.reviewer.to_dict(),
                'validator': self.validator.to_dict(),
            },
            'audit': {
                'updated_at': self.audit_updated_at,
                'updated_by': self.audit_updated_by,
                'update_count': self.audit_update_count,
            },
        }

    def to_legacy_dict(self) -> dict:
        """Backward-compatible dict representation (alias for to_dict)."""
        return self.to_dict()

    @classmethod
    def from_dict(cls, data: dict) -> 'TaskContext':
        """Deserialize from dict with version handling."""
        version = data.get('version', 1)
        if version != 1:
            raise ValueError(f"Unsupported context version: {version}")

        immutable = data['immutable']
        coordination = data['coordination']
        audit = data['audit']

        return cls(
            version=version,
            task_id=data['task_id'],
            created_at=data['created_at'],
            created_by=data['created_by'],
            git_head=data['git_head'],
            task_file_sha=data['task_file_sha'],
            task_snapshot=TaskSnapshot.from_dict(immutable['task_snapshot']),
            standards_citations=[StandardsCitation.from_dict(c) for c in immutable['standards_citations']],
            validation_baseline=ValidationBaseline.from_dict(immutable['validation_baseline']),
            repo_paths=immutable['repo_paths'],
            implementer=AgentCoordination.from_dict(coordination['implementer']),
            reviewer=AgentCoordination.from_dict(coordination['reviewer']),
            validator=AgentCoordination.from_dict(coordination['validator']),
            audit_updated_at=audit['updated_at'],
            audit_updated_by=audit['updated_by'],
            audit_update_count=audit['update_count'],
        )
