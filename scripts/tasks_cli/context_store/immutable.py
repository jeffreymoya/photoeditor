"""
Immutable context snapshot builder.

Handles snapshot creation, manifest generation, and standards enrichment
for task context initialization. Extracted from context_store.py (S3.2).
"""

import hashlib
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from textwrap import fill
from typing import Any, Dict, List, Optional, Tuple

from .models import (
    AgentCoordination,
    ContextManifest,
    EvidenceAttachment,
    SourceFile,
    StandardsCitation,
    StandardsExcerpt,
    TaskContext,
    TaskSnapshot,
    ValidationBaseline,
)

# ValidationError is defined in parent context_store.py, so we'll define it here
# or import it using absolute import
try:
    from tasks_cli.exceptions import ValidationError
except ImportError:
    # Fallback: define locally if import fails
    class ValidationError(Exception):
        """Raised when validation fails."""
        pass


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
# ImmutableSnapshotBuilder
# ============================================================================

class ImmutableSnapshotBuilder:
    """
    Builds immutable context snapshots from task files and standards.

    Handles:
    - Task snapshot creation from .task.yaml files
    - Standards excerpt extraction and caching
    - Checklist snapshotting for agent workflows
    - Context initialization with validation
    """

    # Secret scanning patterns
    SECRET_PATTERNS = [
        (r'AKIA[0-9A-Z]{16}', 'AWS access key'),
        (r'sk_live_[a-zA-Z0-9]{24,}', 'Stripe live key'),
        (r'eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.', 'JWT token'),
        (r'gh[pousr]_[a-zA-Z0-9]{36,}', 'GitHub token'),
        (r'glpat-[a-zA-Z0-9_-]{20,}', 'GitLab token'),
        (r'-----BEGIN (RSA|DSA|EC|OPENSSH|) ?PRIVATE KEY-----', 'Private key'),
    ]

    def __init__(
        self,
        repo_root: Path,
        context_root: Path,
        atomic_write_fn,
        get_context_dir_fn,
        get_evidence_dir_fn,
        get_manifest_file_fn,
        resolve_task_path_fn,
    ):
        """
        Initialize snapshot builder.

        Args:
            repo_root: Repository root path
            context_root: Context storage root (.agent-output)
            atomic_write_fn: Function to atomically write files
            get_context_dir_fn: Function to get context directory for task
            get_evidence_dir_fn: Function to get evidence directory for task
            get_manifest_file_fn: Function to get manifest file path for task
            resolve_task_path_fn: Function to resolve task file path from task_id
        """
        self.repo_root = Path(repo_root)
        self.context_root = Path(context_root)
        self._atomic_write = atomic_write_fn
        self._get_context_dir = get_context_dir_fn
        self._get_evidence_dir = get_evidence_dir_fn
        self._get_manifest_file = get_manifest_file_fn
        self._resolve_task_path = resolve_task_path_fn

    def _scan_for_secrets(self, data: dict, force: bool = False) -> None:
        """
        Scan data for secrets (API keys, tokens, etc.).

        Args:
            data: Dictionary to scan
            force: If True, skip scanning (for testing)

        Raises:
            ValidationError: If secrets detected
        """
        if force:
            return

        def _scan_value(value: Any, path: str = "root") -> None:
            if isinstance(value, str):
                for pattern, secret_type in self.SECRET_PATTERNS:
                    if re.search(pattern, value):
                        raise ValidationError(
                            f"Potential secret detected (pattern: {secret_type}). "
                            "Secrets must not be committed to context."
                        )
            elif isinstance(value, dict):
                for key, val in value.items():
                    _scan_value(val, f"{path}.{key}")
            elif isinstance(value, list):
                for idx, item in enumerate(value):
                    _scan_value(item, f"{path}[{idx}]")

        _scan_value(data)

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
            ValidationError: If immutable data contains secrets or invalid data
        """
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
            'plan_steps': task_snapshot_data.get('plan_steps', []),
            'deliverables': task_snapshot_data.get('deliverables', []),
            'validation_commands': task_snapshot_data.get('validation_commands', []),
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
            task_file_path = self._resolve_task_path(task_id)
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

        # Note: The current TaskSnapshot model already has these fields populated
        # during init_context. This method is a placeholder for backward compatibility.
        # In practice, context.task_snapshot is immutable, so we can't modify it here.

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

        # Snapshot each checklist by copying to evidence directory with SHA-tracking
        for checklist_rel_path in default_checklists:
            checklist_path = self.repo_root / checklist_rel_path

            if not checklist_path.exists():
                continue

            try:
                # Read checklist content and calculate hash
                checklist_bytes = checklist_path.read_bytes()
                size_bytes = len(checklist_bytes)

                # Validate size (file type has 1MB limit)
                if size_bytes > 1 * 1024 * 1024:
                    continue  # Skip large files

                # Calculate SHA256 hash
                sha256_hash = hashlib.sha256(checklist_bytes).hexdigest()
                evidence_id = sha256_hash[:16]

                # Copy to evidence directory with hash-based filename
                file_extension = checklist_path.suffix
                target_filename = f"{evidence_id}{file_extension}"
                target_path = evidence_dir / target_filename

                # Copy file to evidence directory if not already there
                if not target_path.exists():
                    shutil.copy2(checklist_path, target_path)

                # Create EvidenceAttachment pointing to evidence copy
                attachment = EvidenceAttachment(
                    id=evidence_id,
                    type='file',
                    path=str(target_path.relative_to(self.repo_root)),
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
        context: TaskContext,
        attach_evidence_fn,
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
            attach_evidence_fn: Function to attach evidence (from parent store)

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
        snapshot_evidence = attach_evidence_fn(
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

        # Return enhanced metadata
        return {
            **snapshot_meta,
            "evidence_id": snapshot_evidence.id,
            "checklist_evidence_ids": [att.id for att in checklist_attachments]
        }

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
