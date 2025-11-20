"""
Task context store for agent coordination.

Manages immutable task context (metadata, standards, QA baselines) and mutable
coordination state (agent status, working tree snapshots) for task handoffs.

See: docs/proposals/task-context-cache.md
"""

import hashlib
import json
import os
import re
import subprocess
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from filelock import FileLock

from .exceptions import ValidationError


# ============================================================================
# Evidence Attachment Constants (Per hardening-schemas.md Section 1)
# ============================================================================

ARTIFACT_TYPES = [
    'file',
    'directory',
    'archive',
    'log',
    'screenshot',
    'qa_output',
    'summary',
    'diff'
]

TYPE_SIZE_LIMITS = {
    'file': 1 * 1024 * 1024,           # 1 MB
    'directory': None,                  # N/A (must be converted to archive)
    'archive': 50 * 1024 * 1024,       # 50 MB
    'log': 10 * 1024 * 1024,           # 10 MB
    'screenshot': 5 * 1024 * 1024,     # 5 MB
    'qa_output': 10 * 1024 * 1024,     # 10 MB
    'summary': 500 * 1024,              # 500 KB
    'diff': 10 * 1024 * 1024,          # 10 MB
}


class ContextExistsError(Exception):
    """Raised when attempting to initialize context that already exists."""


class ContextNotFoundError(Exception):
    """Raised when context not found for task."""


class DriftError(Exception):
    """Raised when working tree drift detected."""


# ============================================================================
# Text Normalization Utilities
# ============================================================================

def normalize_multiline(text: str, preserve_formatting: bool = False) -> str:
    """
    Normalize multiline text for deterministic context snapshots.

    Ensures identical snapshots across Windows (CRLF), macOS (LF), and Linux (LF)
    by converting all line endings to POSIX LF and applying consistent formatting.

    Steps:
    1. Convert all line endings to LF (POSIX)
    2. Strip YAML comments (lines starting with #)
    3. Remove blank lines (whitespace-only)
    4. Wrap at 120 chars on word boundaries (unless preserving)
    5. Preserve bullet lists (-, *, digit.)
    6. Ensure single trailing newline

    Args:
        text: Raw text from task YAML (may contain comments, extra whitespace)
        preserve_formatting: If True, preserve bullet lists and code blocks

    Returns:
        Normalized text with consistent formatting

    Version: 1.0.0 (stamped in context.manifest)
    """
    import re
    from textwrap import fill

    # Step 1: Normalize line endings to LF
    normalized = text.replace('\r\n', '\n').replace('\r', '\n')

    # Step 2: Strip YAML comments (lines starting with #)
    lines = normalized.split('\n')
    lines = [line for line in lines if not line.strip().startswith('#')]

    # Step 3: Remove blank lines (whitespace-only lines)
    lines = [line for line in lines if line.strip()]

    # Step 4: Join and normalize whitespace
    normalized = '\n'.join(lines)

    # Step 5: Wrap at 120 chars on word boundaries (if not preserving formatting)
    if not preserve_formatting:
        # Use textwrap.fill with US locale sorting
        paragraphs = normalized.split('\n\n')
        wrapped_paragraphs = []
        for para in paragraphs:
            # Check if paragraph is a bullet list (starts with -, *, or digit.)
            if re.match(r'^\s*[-*\d]+[.)]?\s', para):
                # Preserve bullet list formatting
                wrapped_paragraphs.append(para)
            else:
                # Wrap regular paragraphs at 120 chars
                wrapped = fill(para, width=120, break_long_words=False, break_on_hyphens=False)
                wrapped_paragraphs.append(wrapped)
        normalized = '\n\n'.join(wrapped_paragraphs)

    # Step 6: Ensure single trailing newline
    normalized = normalized.rstrip('\n') + '\n'

    return normalized


# ============================================================================
# Immutable Context Models (frozen dataclasses)
# ============================================================================

@dataclass(frozen=True)
class TaskSnapshot:
    """Immutable snapshot of task metadata from .task.yaml"""
    title: str
    priority: str
    area: str
    description: str
    scope_in: List[str]
    scope_out: List[str]
    acceptance_criteria: List[str]

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            'title': self.title,
            'priority': self.priority,
            'area': self.area,
            'description': self.description,
            'scope_in': list(self.scope_in),
            'scope_out': list(self.scope_out),
            'acceptance_criteria': list(self.acceptance_criteria),
        }

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
    line_span: Tuple[int, int]         # (start_line, end_line) for content body
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
            'line_span': list(self.line_span),
            'content_sha256': self.content_sha256,
            'excerpt_id': self.excerpt_id,
            'cached_path': self.cached_path,
            'extracted_at': self.extracted_at,
        }

    @classmethod
    def from_dict(cls, data: dict) -> 'StandardsExcerpt':
        """Deserialize from dict."""
        return cls(
            file=data['file'],
            section=data['section'],
            requirement=data['requirement'],
            line_span=tuple(data['line_span']),
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
    Used primarily for qa_output type artifacts.
    """
    command: Optional[str] = None  # Command that generated this artifact
    exit_code: Optional[int] = None  # Command exit code
    duration_ms: Optional[int] = None  # Execution time in milliseconds

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        result = {}
        if self.command is not None:
            result['command'] = self.command
        if self.exit_code is not None:
            result['exit_code'] = self.exit_code
        if self.duration_ms is not None:
            result['duration_ms'] = self.duration_ms
        return result

    @classmethod
    def from_dict(cls, data: dict) -> 'ArtifactMetadata':
        """Deserialize from dict."""
        return cls(
            command=data.get('command'),
            exit_code=data.get('exit_code'),
            duration_ms=data.get('duration_ms'),
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


# ============================================================================
# Helper Functions
# ============================================================================

def normalize_diff_for_hashing(diff_content: str) -> str:
    """
    Normalize git diff output to POSIX LF-only format for deterministic hashing.

    Ensures identical SHA256 across Windows (CRLF), macOS (LF), and Linux (LF).

    Args:
        diff_content: Raw diff content from git

    Returns:
        Normalized diff with LF line endings and trailing newline
    """
    # Convert all line endings to LF
    normalized = diff_content.replace('\r\n', '\n').replace('\r', '\n')

    # Ensure trailing newline (git diff convention)
    if normalized and not normalized.endswith('\n'):
        normalized += '\n'

    return normalized


def calculate_scope_hash(repo_paths: List[str]) -> str:
    """
    Calculate deterministic hash of task scope to detect missing/renamed files.

    Hashes paths only (not file contents) for lightweight structural checks.

    Args:
        repo_paths: List of file/directory paths from immutable context

    Returns:
        SHA256 hash (16-char prefix) of concatenated paths
    """
    # Ensure paths are sorted for determinism
    sorted_paths = sorted(repo_paths)

    # Concatenate with newline separator (POSIX convention)
    concatenated = "\n".join(sorted_paths) + "\n"

    # Hash the paths themselves (not file contents for performance)
    scope_hash = hashlib.sha256(concatenated.encode('utf-8')).hexdigest()[:16]

    return scope_hash


# ============================================================================
# TaskContextStore Class
# ============================================================================

class TaskContextStore:
    """Manages persistent context cache for agent coordination."""

    # Secret scanning patterns
    SECRET_PATTERNS = [
        (r'AKIA[0-9A-Z]{16}', 'AWS access key'),
        (r'sk_live_[a-zA-Z0-9]{24,}', 'Stripe live key'),
        (r'eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.', 'JWT token'),
        (r'gh[pousr]_[a-zA-Z0-9]{36,}', 'GitHub token'),
        (r'glpat-[a-zA-Z0-9_-]{20,}', 'GitLab token'),
        (r'-----BEGIN (RSA|DSA|EC|OPENSSH|) ?PRIVATE KEY-----', 'Private key'),
    ]

    def __init__(self, repo_root: Path):
        """
        Initialize context store.

        Args:
            repo_root: Absolute path to repository root
        """
        self.repo_root = Path(repo_root)
        self.context_root = self.repo_root / ".agent-output"
        self.lock_file = self.context_root / ".context_store.lock"

        # Ensure context directory exists
        self.context_root.mkdir(parents=True, exist_ok=True)

    def _get_context_dir(self, task_id: str) -> Path:
        """Get context directory path for task."""
        return self.context_root / task_id

    def _get_context_file(self, task_id: str) -> Path:
        """Get context.json file path for task."""
        return self._get_context_dir(task_id) / "context.json"

    def _get_manifest_file(self, task_id: str) -> Path:
        """Get context.manifest file path for task (GAP-4)."""
        return self._get_context_dir(task_id) / "context.manifest"

    def _calculate_file_sha256(self, file_path: Path) -> str:
        """
        Calculate SHA256 hash of file contents.

        Args:
            file_path: Path to file (absolute or relative to repo_root)

        Returns:
            Full SHA256 hex digest
        """
        if not file_path.is_absolute():
            file_path = self.repo_root / file_path

        sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            while chunk := f.read(8192):
                sha256.update(chunk)
        return sha256.hexdigest()

    def _atomic_write(self, path: Path, content: str) -> None:
        """
        Write content atomically via temp file + os.replace().

        Args:
            path: Target file path
            content: Content to write
        """
        # Ensure parent directory exists
        path.parent.mkdir(parents=True, exist_ok=True)

        # Write to temp file in same directory
        fd, temp_path = tempfile.mkstemp(
            dir=path.parent,
            prefix=f".{path.name}.tmp",
            text=True
        )

        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                f.write(content)

            # Atomic replace
            os.replace(temp_path, path)
        except Exception:
            # Clean up temp file on error
            try:
                os.unlink(temp_path)
            except FileNotFoundError:
                pass
            raise

    def _scan_for_secrets(self, data: dict, force: bool = False) -> None:
        """
        Recursively scan dict for secret patterns.

        Args:
            data: Dictionary to scan
            force: Bypass secret detection (logs warning)

        Raises:
            ValidationError: On secret match (unless force=True)
        """
        if force:
            return

        def scan_value(value: Any) -> Optional[str]:
            """Scan a single value, return pattern name if matched."""
            if isinstance(value, str):
                for pattern, name in self.SECRET_PATTERNS:
                    if re.search(pattern, value):
                        return name
            elif isinstance(value, dict):
                for v in value.values():
                    result = scan_value(v)
                    if result:
                        return result
            elif isinstance(value, (list, tuple)):
                for item in value:
                    result = scan_value(item)
                    if result:
                        return result
            return None

        matched_pattern = scan_value(data)
        if matched_pattern:
            raise ValidationError(
                f"Potential secret detected (pattern: {matched_pattern}). "
                "Use --force-secrets to bypass."
            )

    def _get_current_git_head(self) -> str:
        """Get current git HEAD SHA."""
        result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=self.repo_root,
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout.strip()

    def _check_staleness(self, context: TaskContext) -> None:
        """
        Compare context.git_head to current HEAD.

        Logs warning if mismatched (not an error).

        Args:
            context: Task context to check
        """
        try:
            current_head = self._get_current_git_head()
            if current_head != context.git_head:
                print(
                    f"Warning: Context created at {context.git_head[:8]}, "
                    f"current HEAD is {current_head[:8]}. Context may be stale.",
                    file=__import__('sys').stderr
                )
        except subprocess.CalledProcessError:
            # Not a git repo or other error - ignore
            pass

    def init_context(
        self,
        task_id: str,
        immutable: dict,
        git_head: str,
        task_file_sha: str,
        created_by: str = "task-runner",
        force_secrets: bool = False,
        source_files: Optional[List[SourceFile]] = None
    ) -> TaskContext:
        """
        Initialize context with immutable snapshot.

        Args:
            task_id: Task identifier (e.g., "TASK-0824")
            immutable: Immutable context data (task_snapshot, standards_citations, etc.)
            git_head: Git HEAD SHA at context creation
            task_file_sha: SHA of task YAML content
            created_by: Actor initializing context
            force_secrets: Bypass secret scanning
            source_files: Source files used during initialization (for manifest, GAP-4)

        Returns:
            Initialized TaskContext

        Raises:
            ContextExistsError: If context already initialized
            ValidationError: If immutable data contains secrets or invalid data
        """
        context_file = self._get_context_file(task_id)

        # Check if context already exists
        if context_file.exists():
            raise ContextExistsError(
                f"Context already initialized for {task_id}. "
                f"Use purge_context() first to re-initialize."
            )

        # Validate immutable data
        self._scan_for_secrets(immutable, force=force_secrets)

        # Validate completeness
        required_fields = ['task_snapshot', 'standards_citations', 'validation_baseline', 'repo_paths']
        for field_name in required_fields:
            if field_name not in immutable:
                raise ValidationError(f"Missing required field in immutable data: {field_name}")

        task_snapshot_data = immutable['task_snapshot']
        if not task_snapshot_data.get('description'):
            raise ValidationError("task_snapshot.description cannot be empty")

        # Validate standards_citations not empty (GAP-7: Quality gate per proposal Section 5.3)
        standards_citations_data = immutable.get('standards_citations', [])
        if not standards_citations_data:
            raise ValidationError(
                "standards_citations cannot be empty. Task must reference at least one standard."
            )

        # Apply text normalization to task_snapshot fields (GAP-1: ensure deterministic snapshots)
        normalized_snapshot_data = {
            'title': task_snapshot_data['title'],  # No normalization (single line)
            'priority': task_snapshot_data['priority'],
            'area': task_snapshot_data['area'],
            'description': normalize_multiline(task_snapshot_data['description']) if task_snapshot_data.get('description') else '',
            'scope_in': [normalize_multiline(str(item), preserve_formatting=True) for item in task_snapshot_data.get('scope_in', [])],
            'scope_out': [normalize_multiline(str(item), preserve_formatting=True) for item in task_snapshot_data.get('scope_out', [])],
            'acceptance_criteria': [normalize_multiline(str(item), preserve_formatting=True) for item in task_snapshot_data.get('acceptance_criteria', [])],
        }

        # Create TaskContext
        now = datetime.now(timezone.utc).isoformat()

        context = TaskContext(
            version=1,
            task_id=task_id,
            created_at=now,
            created_by=created_by,
            git_head=git_head,
            task_file_sha=task_file_sha,
            task_snapshot=TaskSnapshot.from_dict(normalized_snapshot_data),
            standards_citations=[
                StandardsCitation.from_dict(c)
                for c in immutable['standards_citations']
            ],
            validation_baseline=ValidationBaseline.from_dict(immutable['validation_baseline']),
            repo_paths=sorted(immutable['repo_paths']),
            implementer=AgentCoordination(),
            reviewer=AgentCoordination(),
            validator=AgentCoordination(),
            audit_updated_at=now,
            audit_updated_by=created_by,
            audit_update_count=0,
        )

        # Write atomically with lock
        with FileLock(str(self.lock_file), timeout=10):
            json_content = json.dumps(context.to_dict(), indent=2, sort_keys=True, ensure_ascii=False)
            json_content += '\n'  # Trailing newline
            self._atomic_write(context_file, json_content)

            # Write manifest if source_files provided (GAP-4)
            if source_files is not None:
                manifest = ContextManifest(
                    version=1,
                    created_at=now,
                    created_by=created_by,
                    git_head=git_head,
                    task_id=task_id,
                    context_schema_version=context.version,
                    source_files=source_files,
                    normalization_version='1.0.0',  # Text normalization applied (GAP-1 complete)
                )
                manifest_file = self._get_manifest_file(task_id)
                manifest_content = json.dumps(manifest.to_dict(), indent=2, sort_keys=True, ensure_ascii=False)
                manifest_content += '\n'
                self._atomic_write(manifest_file, manifest_content)

        return context

    def _normalize_repo_paths_for_migration(self, paths: List[str]) -> List[str]:
        """
        Normalize legacy file paths to directory paths for backward compatibility.

        FIX #3 (2025-11-19): Pre-hardening contexts stored individual file paths
        (e.g., "mobile/src/components/Foo.tsx"). Post-hardening code expects
        directory prefixes (e.g., "mobile/src/components"). This migration step
        collapses file paths to their parent directories so existing tasks don't
        break when the new code runs.

        Args:
            paths: List of paths (may be files or directories from legacy contexts)

        Returns:
            Normalized list of directory paths

        Examples:
            ["mobile/src/App.tsx", "backend/services/"] →
            ["mobile/src", "backend/services"]
        """
        normalized = set()

        for path_str in paths:
            path_obj = Path(path_str)

            # Check if this looks like a file path (has extension in the last component)
            # This heuristic handles most cases: .ts, .tsx, .py, .yaml, etc.
            if '.' in path_obj.name and not path_str.endswith('/'):
                # File path - use parent directory
                parent = str(path_obj.parent)
                # Handle edge case: root files like ".env", "Makefile", etc. → "."
                if parent == '.':
                    normalized.add('.')
                else:
                    normalized.add(parent)
            else:
                # Already a directory path - normalize (remove trailing slash)
                normalized.add(path_str.rstrip('/'))

        return sorted(normalized)

    def _load_context_file(self, task_id: str) -> Optional[TaskContext]:
        """
        Load context from file without acquiring lock.

        Internal method - callers must handle locking.

        Args:
            task_id: Task identifier

        Returns:
            TaskContext or None if not found
        """
        context_file = self._get_context_file(task_id)

        if not context_file.exists():
            return None

        with open(context_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        context = TaskContext.from_dict(data)

        # FIX #3: Migrate legacy file paths to directory paths (2025-11-19)
        # Pre-hardening contexts contain individual file paths; normalize them
        # to directory prefixes so _get_untracked_files_in_scope works correctly
        if context.repo_paths:
            original_count = len(context.repo_paths)
            context.repo_paths = self._normalize_repo_paths_for_migration(context.repo_paths)
            normalized_count = len(context.repo_paths)

            # Log migration if paths changed (debug aid)
            if original_count != normalized_count:
                # Collapsed some file paths to common parent directories
                pass  # Silent migration - no warnings needed

        # Check staleness
        self._check_staleness(context)

        return context

    def get_context(self, task_id: str) -> Optional[TaskContext]:
        """
        Read task context (immutable + coordination).

        Returns None if not found.
        Logs warning if git HEAD mismatched.

        Args:
            task_id: Task identifier

        Returns:
            TaskContext or None if not found
        """
        # Read with lock
        with FileLock(str(self.lock_file), timeout=10):
            return self._load_context_file(task_id)

    def get_manifest(self, task_id: str) -> Optional[ContextManifest]:
        """
        Read context manifest (provenance tracking, GAP-4).

        Returns None if not found.

        Args:
            task_id: Task identifier

        Returns:
            ContextManifest or None if not found
        """
        manifest_file = self._get_manifest_file(task_id)
        if not manifest_file.exists():
            return None

        with open(manifest_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        return ContextManifest.from_dict(data)

    def update_coordination(
        self,
        task_id: str,
        agent_role: str,
        updates: dict,
        actor: str,
        force_secrets: bool = False
    ) -> None:
        """
        Update coordination state for one agent (atomic).

        Args:
            task_id: Task identifier
            agent_role: "implementer" | "reviewer" | "validator"
            updates: Updates to merge into AgentCoordination
            actor: Actor performing update
            force_secrets: Bypass secret scanning

        Raises:
            ValidationError: If updates contain secrets or invalid data
            ContextNotFoundError: If context doesn't exist
        """
        if agent_role not in ('implementer', 'reviewer', 'validator'):
            raise ValidationError(f"Invalid agent_role: {agent_role}")

        # Validate updates
        self._scan_for_secrets(updates, force=force_secrets)

        # Load existing context with lock
        with FileLock(str(self.lock_file), timeout=10):
            context = self._load_context_file(task_id)
            if context is None:
                raise ContextNotFoundError(f"No context found for {task_id}")

            # Get agent coordination (mutable)
            agent_coord = getattr(context, agent_role)

            # Merge updates
            for key, value in updates.items():
                if hasattr(agent_coord, key):
                    setattr(agent_coord, key, value)
                else:
                    raise ValidationError(f"Invalid coordination field: {key}")

            # Update audit trail
            context.audit_updated_at = datetime.now(timezone.utc).isoformat()
            context.audit_updated_by = actor
            context.audit_update_count += 1

            # Write atomically
            context_file = self._get_context_file(task_id)
            json_content = json.dumps(context.to_dict(), indent=2, sort_keys=True, ensure_ascii=False)
            json_content += '\n'
            self._atomic_write(context_file, json_content)

    def purge_context(self, task_id: str) -> None:
        """
        Delete context directory (idempotent).

        No error if already deleted.

        Args:
            task_id: Task identifier
        """
        context_dir = self._get_context_dir(task_id)

        if not context_dir.exists():
            return

        # Remove directory recursively
        import shutil
        shutil.rmtree(context_dir, ignore_errors=True)

    # ========================================================================
    # Delta Tracking Methods
    # ========================================================================

    def _is_working_tree_dirty(self) -> bool:
        """
        Check if working tree has uncommitted changes or untracked files.

        Returns:
            True if working tree is dirty (has changes or untracked files)
        """
        # Check for modified/staged files
        result = subprocess.run(
            ['git', 'diff-index', '--quiet', 'HEAD'],
            cwd=self.repo_root,
            capture_output=True,
            check=False  # Exit code signals dirty state
        )
        if result.returncode != 0:
            return True  # Has modified files

        # Also check for untracked files (excluding .agent-output)
        result = subprocess.run(
            ['git', 'ls-files', '--others', '--exclude-standard'],
            cwd=self.repo_root,
            capture_output=True,
            text=True,
            check=True
        )
        untracked = result.stdout.strip()
        if untracked:
            # Filter out .agent-output directory
            untracked_files = [f for f in untracked.split('\n') if f and not f.startswith('.agent-output/')]
            return len(untracked_files) > 0

        return False

    def _calculate_file_checksum(self, file_path: Path) -> str:
        """
        Calculate SHA256 checksum of file.

        Args:
            file_path: Path to file

        Returns:
            SHA256 hex digest
        """
        sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                sha256.update(chunk)
        return sha256.hexdigest()

    def _get_untracked_files_in_scope(
        self,
        repo_paths: List[str]
    ) -> Tuple[List[str], List[str]]:
        """
        Get untracked files filtered to task scope.

        Args:
            repo_paths: List of paths defining task scope (from context)

        Returns:
            Tuple of (in_scope_files, out_of_scope_files)
            - in_scope_files: Untracked files matching repo_paths prefixes
            - out_of_scope_files: Untracked files outside declared scope
        """
        # Get all untracked files (respecting .gitignore)
        result = subprocess.run(
            ['git', 'ls-files', '--others', '--exclude-standard'],
            cwd=self.repo_root,
            capture_output=True,
            text=True,
            check=True
        )

        all_untracked = [
            line.strip()
            for line in result.stdout.strip().split('\n')
            if line.strip()
        ]

        # Filter to task scope
        in_scope = []
        out_of_scope = []

        for untracked_path in all_untracked:
            # Check if untracked file matches any repo_paths prefix
            matches_scope = False
            for scope_path in repo_paths:
                # Normalize scope_path to not have trailing slash for consistent matching
                normalized_scope = scope_path.rstrip('/')

                # Special case: '.' means root directory (matches all files)
                if normalized_scope == '.':
                    matches_scope = True
                    break

                # Handle both file and directory scopes
                # e.g., "backend" should match "backend/foo.ts"
                # e.g., "mobile/src/App.tsx" should match exactly
                if untracked_path == normalized_scope or untracked_path.startswith(normalized_scope + '/'):
                    matches_scope = True
                    break

            if matches_scope:
                in_scope.append(untracked_path)
            else:
                out_of_scope.append(untracked_path)

        return (in_scope, out_of_scope)

    def _get_changed_files(
        self,
        base_commit: str,
        env: Optional[Dict[str, str]] = None
    ) -> List[FileSnapshot]:
        """
        Get list of changed files with checksums.

        Args:
            base_commit: Base commit to diff against
            env: Optional environment dict (e.g., for GIT_INDEX_FILE)

        Returns:
            List of FileSnapshot objects
        """
        # Get list of changed files with status
        result = subprocess.run(
            ['git', 'diff', '--name-status', base_commit],
            cwd=self.repo_root,
            env=env,
            capture_output=True,
            text=True,
            check=True
        )

        files_changed = []
        for line in result.stdout.strip().split('\n'):
            if not line:
                continue

            parts = line.split('\t', 1)
            if len(parts) != 2:
                continue

            status = parts[0]
            path = parts[1]

            # For deleted files, we can't calculate checksum
            if status == 'D':
                files_changed.append(FileSnapshot(
                    path=path,
                    sha256='',
                    status=status,
                    mode='',
                    size=0
                ))
                continue

            # Calculate checksum for existing files
            file_path = self.repo_root / path
            if file_path.exists() and file_path.is_file():
                sha256 = self._calculate_file_checksum(file_path)
                stat = file_path.stat()
                mode = oct(stat.st_mode)[-3:]
                size = stat.st_size

                files_changed.append(FileSnapshot(
                    path=path,
                    sha256=sha256,
                    status=status,
                    mode=mode,
                    size=size
                ))

        return files_changed

    def _compare_file_checksums(
        self,
        expected_files: List[FileSnapshot]
    ) -> str:
        """
        Compare current file checksums with expected.

        Args:
            expected_files: Expected file snapshots

        Returns:
            Detailed drift report (empty string if no drift)
        """
        drift_details = []

        for expected in expected_files:
            file_path = self.repo_root / expected.path

            # Check if deleted file
            if expected.status == 'D':
                if file_path.exists():
                    drift_details.append(
                        f"  {expected.path}:\n"
                        f"    Expected: deleted\n"
                        f"    Current: exists"
                    )
                continue

            # Check if file exists
            if not file_path.exists():
                drift_details.append(
                    f"  {expected.path}:\n"
                    f"    Expected: exists\n"
                    f"    Current: deleted"
                )
                continue

            # Compare checksum
            if file_path.is_file():
                current_sha = self._calculate_file_checksum(file_path)
                if current_sha != expected.sha256:
                    drift_details.append(
                        f"  {expected.path}:\n"
                        f"    Expected SHA: {expected.sha256[:16]}...\n"
                        f"    Current SHA:  {current_sha[:16]}..."
                    )

        return '\n'.join(drift_details)

    def snapshot_worktree(
        self,
        task_id: str,
        agent_role: str,
        actor: str,
        base_commit: str,
        previous_agent: Optional[str] = None
    ) -> WorktreeSnapshot:
        """
        Snapshot working tree state at agent completion.

        Args:
            task_id: Task identifier
            agent_role: "implementer" | "reviewer" | "validator"
            actor: Actor performing snapshot
            base_commit: Base commit to diff against
            previous_agent: Previous agent role (for incremental diff)

        Returns:
            WorktreeSnapshot

        Raises:
            ValidationError: If working tree is clean (unexpected)
            ContextNotFoundError: If context doesn't exist
        """
        # 1. Verify working tree is dirty
        if not self._is_working_tree_dirty():
            raise ValidationError(
                "Working tree is clean (no uncommitted changes). "
                "Expected dirty state for delta tracking."
            )

        # Load context to get repo_paths
        context = self.get_context(task_id)
        if context is None:
            raise ContextNotFoundError(f"No context found for {task_id}")

        context_dir = self._get_context_dir(task_id)
        context_dir.mkdir(parents=True, exist_ok=True)

        # 2. Filter untracked files to task scope
        in_scope_untracked, out_of_scope_untracked = self._get_untracked_files_in_scope(
            context.repo_paths
        )

        # Warn if untracked files exist outside declared scope
        if out_of_scope_untracked:
            import sys
            print(
                f"⚠️  Warning: {len(out_of_scope_untracked)} untracked file(s) "
                f"outside task scope (will be ignored):\n  "
                + "\n  ".join(out_of_scope_untracked[:5])
                + (f"\n  ... and {len(out_of_scope_untracked) - 5} more"
                   if len(out_of_scope_untracked) > 5 else ""),
                file=sys.stderr
            )

        # 3. Generate diff using temporary index to avoid polluting real index
        # This mirrors the pattern from _calculate_incremental_diff()
        with tempfile.NamedTemporaryFile(mode='w', suffix='.index', delete=False) as tmp_index:
            tmp_index_path = tmp_index.name

        try:
            # Set up environment to use temporary index
            env = os.environ.copy()
            env['GIT_INDEX_FILE'] = tmp_index_path

            # Read current HEAD into temporary index
            subprocess.run(
                ['git', 'read-tree', 'HEAD'],
                cwd=self.repo_root,
                env=env,
                capture_output=True,
                text=True,
                check=True
            )

            # Stage in-scope untracked files in temporary index only
            # Exclude only generated .agent-output diffs, not all .diff files
            if in_scope_untracked:
                # Build pathspec: exclude .agent-output directory and its diffs
                pathspec = ['--'] + in_scope_untracked + [':!.agent-output/**']
                subprocess.run(
                    ['git', 'add', '-N'] + pathspec,
                    cwd=self.repo_root,
                    env=env,
                    capture_output=True,
                    text=True,
                    check=False  # Ignore errors if files already tracked
                )

            # Generate cumulative diff from base using temporary index
            diff_file = context_dir / f"{agent_role}-from-base.diff"
            result = subprocess.run(
                ['git', 'diff', base_commit],
                cwd=self.repo_root,
                env=env,
                capture_output=True,
                text=True,
                check=True
            )
            diff_content = result.stdout

            # 5. Calculate file checksums using temporary index
            files_changed = self._get_changed_files(base_commit, env=env)

            # 8. Get diff stat using temporary index
            result_stat = subprocess.run(
                ['git', 'diff', '--stat', base_commit],
                cwd=self.repo_root,
                env=env,
                capture_output=True,
                text=True,
                check=True
            )
            diff_stat = result_stat.stdout.strip()

        finally:
            # Clean up temporary index file
            if os.path.exists(tmp_index_path):
                os.unlink(tmp_index_path)

        # Save diff file
        diff_file.write_text(diff_content, encoding='utf-8')

        # Check diff size and warn if > 10MB (proposal Section 3.6)
        diff_size_mb = diff_file.stat().st_size / (1024 * 1024)
        if diff_size_mb > 10:
            import sys
            print(
                f"⚠️  Warning: Diff size {diff_size_mb:.1f}MB exceeds 10MB threshold. "
                f"Review for unintended binary files.",
                file=sys.stderr
            )

        # 4. Normalize and hash diff
        normalized_diff = normalize_diff_for_hashing(diff_content)
        diff_sha = hashlib.sha256(normalized_diff.encode('utf-8')).hexdigest()

        # 6. Calculate scope hash
        scope_hash = calculate_scope_hash(context.repo_paths)

        # 7. Capture git status report
        result = subprocess.run(
            ['git', 'status', '--porcelain', '-z'],
            cwd=self.repo_root,
            capture_output=True,
            text=True,
            check=True
        )
        status_report = result.stdout

        # 9. Calculate incremental diff (reviewer only)
        diff_from_implementer = None
        incremental_diff_sha = None
        incremental_diff_error = None

        if agent_role == "reviewer" and previous_agent == "implementer":
            implementer_diff_file = context_dir / "implementer-from-base.diff"
            if implementer_diff_file.exists():
                inc_diff, inc_error = self._calculate_incremental_diff(
                    implementer_diff_file,
                    base_commit,
                    task_id
                )
                if inc_diff:
                    # Save incremental diff
                    inc_diff_file = context_dir / "reviewer-incremental.diff"
                    inc_diff_file.write_text(inc_diff, encoding='utf-8')
                    diff_from_implementer = str(inc_diff_file.relative_to(self.repo_root))

                    # Hash incremental diff
                    normalized_inc = normalize_diff_for_hashing(inc_diff)
                    incremental_diff_sha = hashlib.sha256(
                        normalized_inc.encode('utf-8')
                    ).hexdigest()
                else:
                    incremental_diff_error = inc_error

        # 10. Create WorktreeSnapshot
        snapshot = WorktreeSnapshot(
            base_commit=base_commit,
            snapshot_time=datetime.now(timezone.utc).isoformat(),
            diff_from_base=str(diff_file.relative_to(self.repo_root)),
            diff_sha=diff_sha,
            status_report=status_report,
            files_changed=files_changed,
            diff_stat=diff_stat,
            scope_hash=scope_hash,
            diff_from_implementer=diff_from_implementer,
            incremental_diff_sha=incremental_diff_sha,
            incremental_diff_error=incremental_diff_error,
        )

        # 11. Update coordination state
        self.update_coordination(
            task_id=task_id,
            agent_role=agent_role,
            updates={'worktree_snapshot': snapshot},
            actor=actor
        )

        return snapshot

    def _calculate_incremental_diff(
        self,
        implementer_diff_file: Path,
        base_commit: str,
        task_id: str
    ) -> Tuple[Optional[str], Optional[str]]:
        """
        Calculate reviewer's incremental changes by reverse-applying implementer diff.

        Uses git's index manipulation to safely calculate the diff without modifying
        the working tree. Creates a temporary index, applies implementer's changes to
        it, then diffs working tree against this reconstructed state.

        Args:
            implementer_diff_file: Path to implementer's diff file
            base_commit: Base commit SHA to start from
            task_id: Task identifier to load context for scope filtering

        Returns:
            Tuple of (incremental_diff_content, error_message)
            - On success: (diff_string, None)
            - On conflict: (None, user_friendly_error)
        """
        import tempfile
        import os

        try:
            # Create a temporary index file
            with tempfile.NamedTemporaryFile(mode='w', suffix='.index', delete=False) as tmp_index:
                tmp_index_path = tmp_index.name

            try:
                # Set up environment to use temporary index
                env = os.environ.copy()
                env['GIT_INDEX_FILE'] = tmp_index_path

                # 1. Read base tree into temporary index
                subprocess.run(
                    ['git', 'read-tree', base_commit],
                    cwd=self.repo_root,
                    env=env,
                    capture_output=True,
                    text=True,
                    check=True
                )

                # 2. Apply implementer's diff to the temporary index
                # Use --cached to apply only to index, not working tree
                result = subprocess.run(
                    ['git', 'apply', '--cached', str(implementer_diff_file)],
                    cwd=self.repo_root,
                    env=env,
                    capture_output=True,
                    text=True,
                    check=False  # Don't raise on conflict
                )

                if result.returncode != 0:
                    # Could not apply implementer's diff (likely due to conflicts)
                    conflict_details = result.stderr

                    error_msg = (
                        f"Cannot calculate incremental diff: implementer's changes "
                        f"could not be cleanly applied to base commit.\n\n"
                        f"This can happen when:\n"
                        f"- Both agents modified the same lines in a file\n"
                        f"- The base commit has changed since implementer started\n"
                        f"- File modes or paths changed\n\n"
                        f"Mitigation: Review the cumulative diff instead "
                        f"(--get-diff TASK --agent reviewer --type from_base)\n\n"
                        f"Git apply error:\n{conflict_details}"
                    )

                    return (None, error_msg)

                # 2.5. Add in-scope untracked files to the temporary index as intent-to-add
                # This ensures new files created by reviewer are included in the diff
                # Only exclude .agent-output directory (not all .diff files)
                context = self.get_context(task_id)
                if context:
                    in_scope_untracked, _ = self._get_untracked_files_in_scope(context.repo_paths)

                    if in_scope_untracked:
                        pathspec = ['--'] + in_scope_untracked + [':!.agent-output/**']
                        subprocess.run(
                            ['git', 'add', '-N'] + pathspec,
                            cwd=self.repo_root,
                            env=env,
                            capture_output=True,
                            text=True,
                            check=False  # Ignore errors if files already tracked
                        )

                # 3. Diff working tree against temporary index
                # This shows what the reviewer changed on top of implementer's work
                result = subprocess.run(
                    ['git', 'diff'],
                    cwd=self.repo_root,
                    env=env,
                    capture_output=True,
                    text=True,
                    check=True
                )

                incremental_diff = result.stdout

                # If diff is empty, reviewer made no additional changes
                if not incremental_diff.strip():
                    return (
                        None,
                        "No incremental changes detected. Reviewer's state matches "
                        "implementer's changes exactly."
                    )

                return (incremental_diff, None)

            finally:
                # Clean up temporary index file
                if os.path.exists(tmp_index_path):
                    os.unlink(tmp_index_path)

        except subprocess.CalledProcessError as e:
            # Unexpected git error
            error_msg = (
                f"Git error while calculating incremental diff:\n{e.stderr}\n\n"
                f"Mitigation: Review the cumulative diff instead "
                f"(--get-diff TASK --agent reviewer --type from_base)"
            )

            return (None, error_msg)
        except Exception as e:
            # Unexpected Python error
            error_msg = (
                f"Unexpected error calculating incremental diff: {str(e)}\n\n"
                f"Mitigation: Review the cumulative diff instead "
                f"(--get-diff TASK --agent reviewer --type from_base)"
            )

            return (None, error_msg)

    def verify_worktree_state(
        self,
        task_id: str,
        expected_agent: str
    ) -> None:
        """
        Verify working tree matches expected state from previous agent.

        Args:
            task_id: Task identifier
            expected_agent: Agent whose snapshot to verify against

        Raises:
            DriftError: On mismatch with detailed file-by-file report
            ContextNotFoundError: If no snapshot found for expected_agent
        """
        # 1. Load context
        context = self.get_context(task_id)
        if context is None:
            raise ContextNotFoundError(f"No context found for {task_id}")

        # 2. Get expected snapshot
        agent_coord = getattr(context, expected_agent)
        snapshot = agent_coord.worktree_snapshot

        if snapshot is None:
            raise ContextNotFoundError(
                f"No worktree snapshot found for {expected_agent}. "
                f"Agent must call snapshot_worktree() before handoff."
            )

        # 3. Verify base commit unchanged
        try:
            current_head = self._get_current_git_head()
        except subprocess.CalledProcessError as exc:
            raise DriftError("Unable to determine current git HEAD") from exc

        if current_head != snapshot.base_commit:
            raise DriftError(
                f"Base commit changed (rebase/merge detected):\n"
                f"  Expected: {snapshot.base_commit[:8]}\n"
                f"  Current:  {current_head[:8]}\n\n"
                f"Cannot verify deltas - base commit must remain unchanged."
            )

        # 4. Verify working tree still dirty
        if not self._is_working_tree_dirty():
            raise DriftError(
                "Working tree is clean (no uncommitted changes).\n"
                "Expected dirty state based on snapshot.\n\n"
                "Working tree may have been committed prematurely, "
                "invalidating delta tracking."
            )

        # 5. Calculate current diff and compare SHA
        # Use temporary index to include in-scope untracked files (mirrors snapshot_worktree)
        in_scope_untracked, _ = self._get_untracked_files_in_scope(context.repo_paths)

        with tempfile.NamedTemporaryFile(mode='w', suffix='.index', delete=False) as tmp_index:
            tmp_index_path = tmp_index.name

        try:
            # Set up environment to use temporary index
            env = os.environ.copy()
            env['GIT_INDEX_FILE'] = tmp_index_path

            # Read current HEAD into temporary index
            subprocess.run(
                ['git', 'read-tree', 'HEAD'],
                cwd=self.repo_root,
                env=env,
                capture_output=True,
                text=True,
                check=True
            )

            # Stage in-scope untracked files in temporary index only
            if in_scope_untracked:
                pathspec = ['--'] + in_scope_untracked + [':!.agent-output/**']
                subprocess.run(
                    ['git', 'add', '-N'] + pathspec,
                    cwd=self.repo_root,
                    env=env,
                    capture_output=True,
                    text=True,
                    check=False  # Ignore errors if files already tracked
                )

            # Generate diff from base using temporary index
            result = subprocess.run(
                ['git', 'diff', snapshot.base_commit],
                cwd=self.repo_root,
                env=env,
                capture_output=True,
                text=True,
                check=True
            )
            current_diff = result.stdout
        finally:
            # Clean up temporary index
            if os.path.exists(tmp_index_path):
                os.unlink(tmp_index_path)

        current_diff_normalized = normalize_diff_for_hashing(current_diff)
        current_diff_sha = hashlib.sha256(
            current_diff_normalized.encode('utf-8')
        ).hexdigest()

        if current_diff_sha != snapshot.diff_sha:
            # Detailed file-by-file comparison
            drift_details = self._compare_file_checksums(snapshot.files_changed)

            raise DriftError(
                f"Working tree drift detected after {expected_agent} finished:\n"
                f"{drift_details}\n\n"
                f"Files were modified outside the agent workflow.\n"
                f"Cannot validate - working tree state is inconsistent."
            )

        # 6. Verify scope hash unchanged
        current_scope_hash = calculate_scope_hash(context.repo_paths)
        if current_scope_hash != snapshot.scope_hash:
            raise DriftError(
                f"Task scope changed (file renamed/deleted):\n"
                f"  Expected scope hash: {snapshot.scope_hash}\n"
                f"  Current scope hash:  {current_scope_hash}\n\n"
                f"Files in task scope may have been renamed or deleted."
            )

        # All checks passed - no drift detected

    # ========================================================================
    # Evidence Directory Methods
    # ========================================================================

    def _get_evidence_dir(self, task_id: str) -> Path:
        """
        Get evidence directory path for task.

        Args:
            task_id: Task identifier

        Returns:
            Path to .agent-output/TASK-XXXX/evidence/
        """
        context_dir = self._get_context_dir(task_id)
        return context_dir / 'evidence'

    def _validate_artifact_type(self, artifact_type: str, size_bytes: int) -> None:
        """
        Validate artifact type against size limits.

        Args:
            artifact_type: One of ARTIFACT_TYPES
            size_bytes: Size of artifact in bytes

        Raises:
            ValidationError: If type invalid or size exceeds limit
        """
        if artifact_type not in ARTIFACT_TYPES:
            raise ValidationError(
                f"Invalid artifact type: {artifact_type}. "
                f"Must be one of: {', '.join(ARTIFACT_TYPES)}"
            )

        # Check size limit
        size_limit = TYPE_SIZE_LIMITS.get(artifact_type)
        if size_limit is not None and size_bytes > size_limit:
            size_mb = size_bytes / (1024 * 1024)
            limit_mb = size_limit / (1024 * 1024)
            raise ValidationError(
                f"Artifact size {size_mb:.2f}MB exceeds limit for type '{artifact_type}' "
                f"({limit_mb:.2f}MB)"
            )

    def _create_directory_archive(
        self,
        dir_path: Path,
        output_path: Path,
        task_id: str
    ) -> 'CompressionMetadata':
        """
        Create deterministic archive from directory.

        Implements tar.zst compression with index.json manifest per
        Section 1.3 of task-context-cache-hardening-schemas.md.

        Args:
            dir_path: Directory to archive
            output_path: Target archive path (will have .tar.zst extension)
            task_id: Task identifier for logging

        Returns:
            CompressionMetadata with format, original_size, index_path

        Raises:
            ValidationError: If directory doesn't exist or archive creation fails
        """
        if not dir_path.exists() or not dir_path.is_dir():
            raise ValidationError(f"Directory not found or not a directory: {dir_path}")

        # 1. Create index of contents
        index = {
            "created_at": datetime.now(timezone.utc).isoformat(),
            "root": str(dir_path.relative_to(self.repo_root)),
            "files": []
        }

        original_size = 0
        for file_path in sorted(dir_path.rglob("*")):
            if file_path.is_file():
                rel_path = file_path.relative_to(dir_path)
                file_size = file_path.stat().st_size
                original_size += file_size

                sha256 = hashlib.sha256()
                with open(file_path, 'rb') as f:
                    while chunk := f.read(8192):
                        sha256.update(chunk)

                index["files"].append({
                    "path": str(rel_path),
                    "size": file_size,
                    "sha256": sha256.hexdigest()
                })

        # 2. Save index
        index_path = output_path.with_suffix('.index.json')
        index_content = json.dumps(index, indent=2, sort_keys=True, ensure_ascii=False)
        index_content += '\n'
        self._atomic_write(index_path, index_content)

        # 3. Create archive (prefer tar.zst, fallback to tar.gz)
        compression_format = "tar.zst"
        archive_path = output_path.with_suffix('.tar.zst')

        try:
            # Try tar.zst first (best compression)
            subprocess.run([
                'tar',
                '--zstd',
                '--create',
                '--file', str(archive_path),
                '--directory', str(dir_path.parent),
                dir_path.name
            ], check=True, capture_output=True, text=True)
        except (subprocess.CalledProcessError, FileNotFoundError):
            # Fallback to tar.gz if zstd not available
            import sys
            print(
                "Warning: zstd compression not available, falling back to gzip. "
                "Install zstd for better compression.",
                file=sys.stderr
            )
            compression_format = "tar.gz"
            archive_path = output_path.with_suffix('.tar.gz')

            try:
                subprocess.run([
                    'tar',
                    '--gzip',
                    '--create',
                    '--file', str(archive_path),
                    '--directory', str(dir_path.parent),
                    dir_path.name
                ], check=True, capture_output=True, text=True)
            except subprocess.CalledProcessError as tar_error:
                raise ValidationError(
                    f"Failed to create archive: {tar_error.stderr}"
                ) from tar_error

        # 4. Return metadata
        return CompressionMetadata(
            format=compression_format,
            original_size=original_size,
            index_path=str(index_path.relative_to(self.repo_root))
        )

    def attach_evidence(
        self,
        task_id: str,
        artifact_type: str,
        artifact_path: Path,
        description: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> 'EvidenceAttachment':
        """
        Attach evidence artifact to task context.

        Args:
            task_id: Task identifier
            artifact_type: One of ARTIFACT_TYPES
            artifact_path: Path to artifact (absolute or relative to repo_root)
            description: Human-readable description (max 200 chars)
            metadata: Type-specific metadata (e.g., command, exit_code for qa_output)

        Returns:
            EvidenceAttachment with ID, SHA256, and metadata

        Raises:
            ValidationError: If type invalid, size exceeds limits, or path invalid
            ContextNotFoundError: If context doesn't exist for task
        """
        # Verify context exists
        context = self.get_context(task_id)
        if context is None:
            raise ContextNotFoundError(f"No context found for {task_id}")

        # Resolve artifact path
        if not artifact_path.is_absolute():
            artifact_path = self.repo_root / artifact_path

        if not artifact_path.exists():
            raise ValidationError(f"Artifact path does not exist: {artifact_path}")

        # Handle directory type by converting to archive
        compression = None
        if artifact_path.is_dir():
            if artifact_type != 'directory':
                raise ValidationError(
                    f"Path is a directory but type is '{artifact_type}'. "
                    "Use type='directory' for directory artifacts."
                )

            # Create archive in evidence directory
            evidence_dir = self._get_evidence_dir(task_id)
            evidence_dir.mkdir(parents=True, exist_ok=True)

            archive_base = evidence_dir / f"{artifact_path.name}-archive"
            compression = self._create_directory_archive(
                artifact_path,
                archive_base,
                task_id
            )

            # Update artifact_path to point to archive
            if compression.format == "tar.zst":
                artifact_path = archive_base.with_suffix('.tar.zst')
            else:
                artifact_path = archive_base.with_suffix('.tar.gz')

            # Update type to archive
            artifact_type = 'archive'

        # Calculate size and hash
        artifact_bytes = artifact_path.read_bytes()
        size_bytes = len(artifact_bytes)
        sha256_hash = hashlib.sha256(artifact_bytes).hexdigest()

        # Validate type and size
        self._validate_artifact_type(artifact_type, size_bytes)

        # Validate description length
        if description and len(description) > 200:
            raise ValidationError(
                f"Description exceeds 200 characters: {len(description)}"
            )

        # Create evidence ID (16-char SHA256 prefix)
        evidence_id = sha256_hash[:16]

        # Parse metadata if provided
        artifact_metadata = None
        if metadata:
            artifact_metadata = ArtifactMetadata.from_dict(metadata)

        # Create EvidenceAttachment
        attachment = EvidenceAttachment(
            id=evidence_id,
            type=artifact_type,
            path=str(artifact_path.relative_to(self.repo_root)),
            sha256=sha256_hash,
            size=size_bytes,
            created_at=datetime.now(timezone.utc).isoformat(),
            description=description,
            compression=compression,
            metadata=artifact_metadata
        )

        # Update evidence index
        evidence_dir = self._get_evidence_dir(task_id)
        evidence_dir.mkdir(parents=True, exist_ok=True)

        index_path = evidence_dir / 'index.json'

        # Read existing index or create new
        if index_path.exists():
            with open(index_path, 'r', encoding='utf-8') as f:
                index = json.load(f)
        else:
            index = {
                "version": 1,
                "evidence": []
            }

        # Add attachment (replace if ID exists)
        existing_idx = next(
            (i for i, e in enumerate(index["evidence"]) if e["id"] == evidence_id),
            None
        )
        if existing_idx is not None:
            index["evidence"][existing_idx] = attachment.to_dict()
        else:
            index["evidence"].append(attachment.to_dict())

        # Write index atomically
        index_content = json.dumps(index, indent=2, sort_keys=True, ensure_ascii=False)
        index_content += '\n'
        self._atomic_write(index_path, index_content)

        return attachment

    def list_evidence(self, task_id: str) -> List['EvidenceAttachment']:
        """
        List all evidence attachments for task.

        Args:
            task_id: Task identifier

        Returns:
            List of EvidenceAttachment objects (empty if no evidence)
        """
        evidence_dir = self._get_evidence_dir(task_id)
        index_path = evidence_dir / 'index.json'

        if not index_path.exists():
            return []

        with open(index_path, 'r', encoding='utf-8') as f:
            index = json.load(f)

        return [
            EvidenceAttachment.from_dict(e)
            for e in index.get("evidence", [])
        ]

    # ========================================================================
    # Standards Excerpt Methods (Section 7: Standards Excerpt Hashing)
    # ========================================================================

    def _find_section_boundaries(self, content: str, heading: str) -> Optional[Tuple[int, int]]:
        """
        Find section boundaries in markdown content.

        Implements Section 7.1 of task-context-cache-hardening-schemas.md.

        Args:
            content: Full markdown file content
            heading: Section heading to find (e.g., "Handler Constraints")

        Returns:
            Tuple of (start_line, end_line) for section content (excluding heading),
            or None if section not found.

        Algorithm:
            1. Find heading line matching the normalized heading text
            2. Section starts at heading line + 1 (exclude heading itself)
            3. Section ends at next same-level or higher-level heading (exclusive)
            4. If no subsequent heading, section extends to EOF
        """
        lines = content.split('\n')

        section_start = None
        section_end = None
        current_level = None

        # Normalize heading for comparison
        normalized_target = heading.lower().replace(' ', '-').replace('&', 'and')

        for i, line in enumerate(lines):
            # Match markdown headings (# through ######)
            heading_match = re.match(r'^(#{1,6})\s+(.+)$', line)
            if not heading_match:
                continue

            level = len(heading_match.group(1))
            heading_text = heading_match.group(2).strip()

            # Normalize current heading
            normalized_current = heading_text.lower().replace(' ', '-').replace('&', 'and')

            if normalized_current == normalized_target and section_start is None:
                # Found target heading
                section_start = i + 1  # Start after heading line
                current_level = level
            elif section_start is not None and level <= current_level:
                # Found next heading at same or higher level
                section_end = i
                break

        if section_start is None:
            return None

        if section_end is None:
            section_end = len(lines)

        return (section_start, section_end)

    def _compute_excerpt_hash(self, content: str) -> str:
        """
        Compute deterministic SHA256 hash of excerpt content.

        Implements Section 7.1 of task-context-cache-hardening-schemas.md.

        Args:
            content: Excerpt content to hash

        Returns:
            SHA256 hex digest (64 chars)

        Algorithm:
            1. Strip trailing whitespace from each line
            2. Collapse multiple consecutive blank lines to single blank line
            3. Compute SHA256 of UTF-8 encoded result
        """
        lines = content.split('\n')

        # Strip trailing whitespace from each line
        lines = [line.rstrip() for line in lines]

        # Collapse multiple blank lines to single blank line
        normalized_lines = []
        prev_blank = False
        for line in lines:
            is_blank = len(line.strip()) == 0
            if is_blank and prev_blank:
                continue  # Skip consecutive blank lines
            normalized_lines.append(line)
            prev_blank = is_blank

        # Join and ensure trailing newline
        normalized = '\n'.join(normalized_lines)
        if normalized and not normalized.endswith('\n'):
            normalized += '\n'

        # Compute SHA256
        return hashlib.sha256(normalized.encode('utf-8')).hexdigest()

    def _cache_excerpt(self, task_id: str, excerpt: StandardsExcerpt, content: str) -> Path:
        """
        Cache excerpt to evidence/standards/ directory.

        Args:
            task_id: Task identifier
            excerpt: StandardsExcerpt metadata
            content: Excerpt content to cache

        Returns:
            Path to cached excerpt file
        """
        # Create standards evidence directory
        standards_dir = self._get_evidence_dir(task_id) / 'standards'
        standards_dir.mkdir(parents=True, exist_ok=True)

        # Create excerpt filename
        excerpt_filename = f'{excerpt.excerpt_id}.md'
        excerpt_path = standards_dir / excerpt_filename

        # Write excerpt content
        excerpt_path.write_text(content, encoding='utf-8')

        # Update index
        index_path = standards_dir / 'index.json'
        if index_path.exists():
            with open(index_path, 'r', encoding='utf-8') as f:
                index = json.load(f)
        else:
            index = {'excerpts': []}

        # Add or update excerpt in index
        excerpt_dict = excerpt.to_dict()
        excerpt_dict['cached_path'] = str(excerpt_path.relative_to(self.repo_root))

        existing_idx = next(
            (i for i, e in enumerate(index['excerpts']) if e['excerpt_id'] == excerpt.excerpt_id),
            None
        )
        if existing_idx is not None:
            index['excerpts'][existing_idx] = excerpt_dict
        else:
            index['excerpts'].append(excerpt_dict)

        # Write index atomically
        index_content = json.dumps(index, indent=2, sort_keys=True, ensure_ascii=False)
        index_content += '\n'
        self._atomic_write(index_path, index_content)

        return excerpt_path

    def extract_standards_excerpt(self, task_id: str, standards_file: str, section_heading: str) -> StandardsExcerpt:
        """
        Extract standards section with deterministic hashing.

        Implements Section 7.1 of task-context-cache-hardening-schemas.md.

        Args:
            task_id: Task identifier (for caching)
            standards_file: Path to standards file relative to repo root (e.g., "standards/backend-tier.md")
            section_heading: Section heading text (e.g., "Handler Constraints")

        Returns:
            StandardsExcerpt with metadata and cached path

        Raises:
            FileNotFoundError: If standards file doesn't exist
            ValueError: If section not found in file
        """
        file_path = self.repo_root / standards_file
        if not file_path.exists():
            raise FileNotFoundError(f"Standards file not found: {file_path}")

        content = file_path.read_text(encoding='utf-8')

        # Find section boundaries
        boundaries = self._find_section_boundaries(content, section_heading)
        if boundaries is None:
            raise ValueError(f"Section '{section_heading}' not found in {standards_file}")

        section_start, section_end = boundaries

        # Extract section content (excluding heading)
        lines = content.split('\n')
        section_lines = lines[section_start:section_end]

        # Track actual content boundaries (after trimming blank lines)
        content_start = section_start
        content_end = section_end

        # Remove blank lines at start
        while section_lines and not section_lines[0].strip():
            section_lines.pop(0)
            content_start += 1

        # Remove blank lines at end
        while section_lines and not section_lines[-1].strip():
            section_lines.pop()
            content_end -= 1

        # Join section content
        excerpt_content = '\n'.join(section_lines)
        if excerpt_content and not excerpt_content.endswith('\n'):
            excerpt_content += '\n'

        # Compute deterministic hash
        content_sha256 = self._compute_excerpt_hash(excerpt_content)
        excerpt_id = content_sha256[:8]

        # Extract first sentence as requirement summary
        if excerpt_content:
            first_paragraph = excerpt_content.split('\n\n')[0]
            sentences = first_paragraph.split('. ')
            first_sentence = (sentences[0] + '.') if sentences else ''
            requirement = first_sentence[:140]  # Truncate to 140 chars
        else:
            requirement = ''

        # Create excerpt object
        excerpt = StandardsExcerpt(
            file=standards_file,
            section=section_heading,
            requirement=requirement,
            line_span=(content_start, content_end),
            content_sha256=content_sha256,
            excerpt_id=excerpt_id,
        )

        # Cache excerpt
        cached_path = self._cache_excerpt(task_id, excerpt, excerpt_content)

        # Return excerpt with cached path
        return StandardsExcerpt(
            file=excerpt.file,
            section=excerpt.section,
            requirement=excerpt.requirement,
            line_span=excerpt.line_span,
            content_sha256=excerpt.content_sha256,
            excerpt_id=excerpt.excerpt_id,
            cached_path=str(cached_path.relative_to(self.repo_root)),
            extracted_at=excerpt.extracted_at,
        )

    def verify_excerpt_freshness(self, excerpt: StandardsExcerpt) -> bool:
        """
        Verify cached excerpt matches current standards file.

        Implements Section 7.3 of task-context-cache-hardening-schemas.md.

        Args:
            excerpt: StandardsExcerpt to verify

        Returns:
            True if excerpt is fresh (SHA matches current file), False if stale
        """
        try:
            # Re-extract current excerpt (using a dummy task ID since we're just checking hash)
            current_file = self.repo_root / excerpt.file
            if not current_file.exists():
                return False

            content = current_file.read_text(encoding='utf-8')
            boundaries = self._find_section_boundaries(content, excerpt.section)

            if boundaries is None:
                return False

            section_start, section_end = boundaries
            lines = content.split('\n')
            section_lines = lines[section_start:section_end]

            # Remove blank lines
            while section_lines and not section_lines[0].strip():
                section_lines.pop(0)
            while section_lines and not section_lines[-1].strip():
                section_lines.pop()

            # Compute current hash
            excerpt_content = '\n'.join(section_lines)
            if excerpt_content and not excerpt_content.endswith('\n'):
                excerpt_content += '\n'

            current_sha256 = self._compute_excerpt_hash(excerpt_content)

            # Compare with cached hash
            return current_sha256 == excerpt.content_sha256

        except (FileNotFoundError, ValueError, KeyError):
            # If file missing or section not found, excerpt is stale
            return False

    def invalidate_stale_excerpts(self, task_id: str) -> List[str]:
        """
        Check all excerpts for staleness and remove stale ones.

        Implements Section 7.3 of task-context-cache-hardening-schemas.md.

        Args:
            task_id: Task identifier

        Returns:
            List of invalidated excerpt IDs
        """
        standards_dir = self._get_evidence_dir(task_id) / 'standards'
        index_path = standards_dir / 'index.json'

        if not index_path.exists():
            return []

        with open(index_path, 'r', encoding='utf-8') as f:
            index = json.load(f)

        stale_ids = []

        for excerpt_dict in index.get('excerpts', []):
            excerpt = StandardsExcerpt.from_dict(excerpt_dict)

            if not self.verify_excerpt_freshness(excerpt):
                stale_ids.append(excerpt.excerpt_id)

                # Remove cached excerpt file
                if excerpt.cached_path:
                    excerpt_path = self.repo_root / excerpt.cached_path
                    if excerpt_path.exists():
                        excerpt_path.unlink()

        # Update index to remove stale entries
        index['excerpts'] = [
            e for e in index.get('excerpts', [])
            if e['excerpt_id'] not in stale_ids
        ]

        # Write updated index atomically
        index_content = json.dumps(index, indent=2, sort_keys=True, ensure_ascii=False)
        index_content += '\n'
        self._atomic_write(index_path, index_content)

        return stale_ids

    # ========================================================================
    # Task Snapshot Methods (Section 3.1: Immutable payload expansion)
    # ========================================================================

    def resolve_task_path(self, task_id: str) -> Optional[Path]:
        """
        Resolve task file path, checking multiple locations.

        Checks in order:
        1. Active tasks: tasks/{tier}/TASK-XXXX-....yaml
        2. Completed tasks: docs/completed-tasks/TASK-XXXX-....yaml
        3. Quarantined tasks: docs/compliance/quarantine/TASK-XXXX.quarantine.json

        Args:
            task_id: Task identifier (e.g., "TASK-0824")

        Returns:
            Resolved Path to task file, or None if not found
        """
        # Try active tasks in each tier
        for tier in ['mobile', 'backend', 'shared', 'infrastructure', 'ops']:
            tasks_dir = self.repo_root / 'tasks' / tier
            if tasks_dir.exists():
                for task_file in tasks_dir.glob(f'{task_id}-*.task.yaml'):
                    return task_file

        # Try completed tasks
        completed_dir = self.repo_root / 'docs' / 'completed-tasks'
        if completed_dir.exists():
            for task_file in completed_dir.glob(f'{task_id}-*.task.yaml'):
                return task_file

        # Try quarantine
        quarantine_dir = self.repo_root / 'docs' / 'compliance' / 'quarantine'
        if quarantine_dir.exists():
            quarantine_file = quarantine_dir / f'{task_id}.quarantine.json'
            if quarantine_file.exists():
                return quarantine_file

        return None

    def create_task_snapshot(self, task_id: str, task_file_path: Optional[Path] = None) -> dict:
        """
        Create task snapshot by copying .task.yaml to .agent-output.

        Implements Section 3.1 of task-context-cache-hardening.md.

        Args:
            task_id: Task identifier (e.g., "TASK-0824")
            task_file_path: Optional path to task file (auto-resolved if not provided)

        Returns:
            Snapshot metadata dict with paths, SHA256, and timestamp

        Raises:
            FileNotFoundError: If task file not found
            ValidationError: If task file cannot be read
        """
        # Resolve task file path
        if task_file_path is None:
            task_file_path = self.resolve_task_path(task_id)
            if task_file_path is None:
                raise FileNotFoundError(f"Task file not found for {task_id}")

        if not task_file_path.exists():
            raise FileNotFoundError(f"Task file does not exist: {task_file_path}")

        # Read task file content
        try:
            task_content = task_file_path.read_text(encoding='utf-8')
        except Exception as exc:
            raise ValidationError(f"Failed to read task file: {exc}") from exc

        # Compute SHA256 hash
        snapshot_sha256 = hashlib.sha256(task_content.encode('utf-8')).hexdigest()

        # Determine paths
        context_dir = self._get_context_dir(task_id)
        context_dir.mkdir(parents=True, exist_ok=True)

        snapshot_path = context_dir / 'task-snapshot.yaml'

        # Write snapshot atomically
        self._atomic_write(snapshot_path, task_content)

        # Determine original and completed paths
        original_path = str(task_file_path.relative_to(self.repo_root))

        # Future completed path
        if 'completed-tasks' in original_path:
            completed_path = original_path
        else:
            completed_path = f"docs/completed-tasks/{task_file_path.name}"

        # Create metadata
        metadata = {
            'snapshot_path': str(snapshot_path.relative_to(self.repo_root)),
            'snapshot_sha256': snapshot_sha256,
            'original_path': original_path,
            'completed_path': completed_path,
            'created_at': datetime.now(timezone.utc).isoformat()
        }

        return metadata

    def embed_acceptance_criteria(
        self,
        task_data: dict,
        context: TaskContext
    ) -> None:
        """
        Embed acceptance criteria, scope, plan, and deliverables into context.

        Modifies context.task_snapshot in-place to include:
        - acceptance_criteria: List[str]
        - scope.in/out: List[str]
        - plan: List[str] (from plan.steps)
        - deliverables: List[str]

        Args:
            task_data: Parsed task YAML dict
            context: TaskContext to modify

        Note:
            This is a temporary helper for gradual migration. New code should
            use the enhanced TaskSnapshot model with these fields.
        """
        # Extract data from task YAML
        acceptance_criteria = task_data.get('acceptance_criteria', [])
        scope_in = task_data.get('scope', {}).get('in', [])
        scope_out = task_data.get('scope', {}).get('out', [])

        # Extract plan steps
        plan_steps = []
        plan_data = task_data.get('plan', {})
        if isinstance(plan_data, dict):
            steps = plan_data.get('steps', [])
            for step in steps:
                if isinstance(step, dict):
                    step_text = step.get('step', '')
                    if step_text:
                        plan_steps.append(step_text)
                elif isinstance(step, str):
                    plan_steps.append(step)

        deliverables = task_data.get('deliverables', [])

        # Store in context (we'll need to extend TaskSnapshot to include these fields)
        # For now, we can store them in a temporary location or extend the model

        # Note: The current TaskSnapshot model doesn't have these fields yet.
        # This method is a placeholder for when we update the model.
        # In the meantime, we can attach this as evidence or store in metadata.

    def snapshot_checklists(self, task_id: str, tier: str) -> List[EvidenceAttachment]:
        """
        Snapshot checklists from docs/agents/ as evidence attachments.

        Implements Section 3.1 of task-context-cache-hardening.md.

        Default checklists:
        - docs/agents/implementation-preflight.md
        - docs/agents/diff-safety-checklist.md
        - docs/agents/{tier}-implementation-checklist.md (if exists)

        Args:
            task_id: Task identifier
            tier: Task tier (mobile, backend, shared, infrastructure)

        Returns:
            List of EvidenceAttachment objects for snapshotted checklists

        Note:
            This method can be called independently or as part of init_context.
            It will create evidence directory structure if needed.
        """
        attachments = []

        # Default checklists
        default_checklists = [
            'docs/agents/implementation-preflight.md',
            'docs/agents/diff-safety-checklist.md'
        ]

        # Tier-specific checklist (if exists)
        tier_checklist = f'docs/agents/{tier}-implementation-checklist.md'
        tier_checklist_path = self.repo_root / tier_checklist
        if tier_checklist_path.exists():
            default_checklists.append(tier_checklist)

        # Ensure evidence directory exists
        evidence_dir = self._get_evidence_dir(task_id)
        evidence_dir.mkdir(parents=True, exist_ok=True)

        # Snapshot each checklist by creating evidence attachments directly
        for checklist_rel_path in default_checklists:
            checklist_path = self.repo_root / checklist_rel_path

            if not checklist_path.exists():
                continue

            try:
                # Read checklist content
                checklist_bytes = checklist_path.read_bytes()
                size_bytes = len(checklist_bytes)

                # Validate size (file type has 1MB limit)
                if size_bytes > 1 * 1024 * 1024:
                    continue  # Skip large files

                # Calculate SHA256 hash
                sha256_hash = hashlib.sha256(checklist_bytes).hexdigest()
                evidence_id = sha256_hash[:16]

                # Create EvidenceAttachment
                attachment = EvidenceAttachment(
                    id=evidence_id,
                    type='file',
                    path=checklist_rel_path,
                    sha256=sha256_hash,
                    size=size_bytes,
                    created_at=datetime.now(timezone.utc).isoformat(),
                    description=f"Checklist snapshot: {checklist_path.name}"
                )

                # Update evidence index
                index_path = evidence_dir / 'index.json'

                # Read existing index or create new
                if index_path.exists():
                    with open(index_path, 'r', encoding='utf-8') as f:
                        index = json.load(f)
                else:
                    index = {
                        "version": 1,
                        "evidence": []
                    }

                # Add attachment (replace if ID exists)
                existing_idx = next(
                    (i for i, e in enumerate(index["evidence"]) if e["id"] == evidence_id),
                    None
                )
                if existing_idx is not None:
                    index["evidence"][existing_idx] = attachment.to_dict()
                else:
                    index["evidence"].append(attachment.to_dict())

                # Write index atomically
                index_content = json.dumps(index, indent=2, sort_keys=True, ensure_ascii=False)
                index_content += '\n'
                self._atomic_write(index_path, index_content)

                attachments.append(attachment)

            except Exception:
                # Skip if processing fails (read error, etc.)
                continue

        return attachments

    def create_snapshot_and_embed(
        self,
        task_id: str,
        task_path: Path,
        task_data: Dict[str, Any],
        tier: str,
        context: 'TaskContext'
    ) -> Dict[str, Any]:
        """
        Create task snapshot and embed data into context (convenience wrapper).

        Combines create_task_snapshot, embed_acceptance_criteria, and
        snapshot_checklists into a single operation.

        Args:
            task_id: Task identifier
            task_path: Path to task file
            task_data: Parsed task YAML
            tier: Task tier
            context: TaskContext to modify

        Returns:
            Snapshot metadata dict
        """
        # Create snapshot
        snapshot_meta = self.create_task_snapshot(
            task_id=task_id,
            task_file_path=task_path
        )

        # Embed acceptance criteria into context
        self.embed_acceptance_criteria(task_data, context)

        # Snapshot checklists
        checklist_attachments = self.snapshot_checklists(
            task_id=task_id,
            tier=tier
        )

        # Attach snapshot file as evidence
        snapshot_path = self.repo_root / snapshot_meta['snapshot_path']
        snapshot_evidence = self.attach_evidence(
            task_id=task_id,
            artifact_type="file",
            artifact_path=snapshot_path,
            description=f"Task snapshot for {task_id}",
            metadata={
                "sha256": snapshot_meta["snapshot_sha256"],
                "original_path": snapshot_meta["original_path"],
                "completed_path": snapshot_meta["completed_path"]
            }
        )

        # Store snapshot metadata in context.task_snapshot
        if not hasattr(context, 'task_snapshot') or context.task_snapshot is None:
            context.task_snapshot = TaskSnapshot(
                snapshot_path=snapshot_meta['snapshot_path'],
                snapshot_sha256=snapshot_meta['snapshot_sha256'],
                original_path=snapshot_meta['original_path'],
                completed_path=snapshot_meta['completed_path'],
                created_at=snapshot_meta['created_at'],
                acceptance_criteria=[],
                scope_in=[],
                scope_out=[],
                plan_steps=[],
                deliverables=[]
            )

        # Return enhanced metadata
        return {
            **snapshot_meta,
            "evidence_id": snapshot_evidence.id,
            "checklist_evidence_ids": [att.id for att in checklist_attachments]
        }
