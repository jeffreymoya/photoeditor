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
        Check if working tree has uncommitted changes.

        Returns:
            True if working tree is dirty (has changes)
        """
        result = subprocess.run(
            ['git', 'diff-index', '--quiet', 'HEAD'],
            cwd=self.repo_root,
            capture_output=True,
            check=False  # Exit code signals dirty state
        )
        # Exit code 1 means dirty, 0 means clean
        return result.returncode != 0

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

    def _get_changed_files(self, base_commit: str) -> List[FileSnapshot]:
        """
        Get list of changed files with checksums.

        Args:
            base_commit: Base commit to diff against

        Returns:
            List of FileSnapshot objects
        """
        # Get list of changed files with status
        result = subprocess.run(
            ['git', 'diff', '--name-status', base_commit],
            cwd=self.repo_root,
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

        # 2. Generate cumulative diff from base
        diff_file = context_dir / f"{agent_role}-from-base.diff"
        result = subprocess.run(
            ['git', 'diff', base_commit],
            cwd=self.repo_root,
            capture_output=True,
            text=True,
            check=True
        )
        diff_content = result.stdout

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

        # 3. Normalize and hash diff
        normalized_diff = normalize_diff_for_hashing(diff_content)
        diff_sha = hashlib.sha256(normalized_diff.encode('utf-8')).hexdigest()

        # 4. Calculate file checksums
        files_changed = self._get_changed_files(base_commit)

        # 5. Calculate scope hash
        scope_hash = calculate_scope_hash(context.repo_paths)

        # 6. Capture git status report
        result = subprocess.run(
            ['git', 'status', '--porcelain', '-z'],
            cwd=self.repo_root,
            capture_output=True,
            text=True,
            check=True
        )
        status_report = result.stdout

        # 7. Get diff stat
        result = subprocess.run(
            ['git', 'diff', '--stat', base_commit],
            cwd=self.repo_root,
            capture_output=True,
            text=True,
            check=True
        )
        diff_stat = result.stdout.strip()

        # 8. Calculate incremental diff (reviewer only)
        diff_from_implementer = None
        incremental_diff_sha = None
        incremental_diff_error = None

        if agent_role == "reviewer" and previous_agent == "implementer":
            implementer_diff_file = context_dir / "implementer-from-base.diff"
            if implementer_diff_file.exists():
                inc_diff, inc_error = self._calculate_incremental_diff(
                    implementer_diff_file,
                    base_commit
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

        # 9. Create WorktreeSnapshot
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

        # 10. Update coordination state
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
        base_commit: str
    ) -> Tuple[Optional[str], Optional[str]]:
        """
        Calculate reviewer's incremental changes by reverse-applying implementer diff.

        Uses git's index manipulation to safely calculate the diff without modifying
        the working tree. Creates a temporary index, applies implementer's changes to
        it, then diffs working tree against this reconstructed state.

        Args:
            implementer_diff_file: Path to implementer's diff file
            base_commit: Base commit SHA to start from

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

                # 3. Diff working tree against temporary index
                # This shows what the reviewer changed on top of implementer's work
                result = subprocess.run(
                    ['git', 'diff', '--cached'],
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
        result = subprocess.run(
            ['git', 'diff', snapshot.base_commit],
            cwd=self.repo_root,
            capture_output=True,
            text=True,
            check=True
        )
        current_diff = result.stdout

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
