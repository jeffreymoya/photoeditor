"""
TaskContextService facade coordinating all context store modules.

This facade provides the main public API for task context management,
delegating to specialized modules for different concerns:
- ImmutableSnapshotBuilder: Snapshot creation and standards enrichment
- DeltaTracker: Worktree snapshotting and drift detection
- EvidenceManager: Artifact attachment and compression
- QABaselineManager: QA command execution and baseline comparison
- RuntimeHelper: File operations, path resolution, git operations

Extracted from context_store.py as part of modularization (S4.4).
"""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from filelock import FileLock

from ..exceptions import ContextExistsError, ContextNotFoundError, ValidationError
from ..providers import ProcessProvider, GitProvider
from .delta_tracking import DeltaTracker, normalize_diff_for_hashing, calculate_scope_hash
from .evidence import EvidenceManager
from .immutable import ImmutableSnapshotBuilder
from .models import (
    AgentCoordination,
    ContextManifest,
    EvidenceAttachment,
    FileSnapshot,
    SourceFile,
    StandardsExcerpt,
    TaskContext,
    WorktreeSnapshot,
)
from .qa import QABaselineManager
from .runtime import RuntimeHelper


class TaskContextService:
    """Facade coordinating all context store modules."""

    def __init__(
        self,
        repo_root: Path,
        process_provider: Optional[ProcessProvider] = None,
        git_provider: Optional[GitProvider] = None
    ):
        """
        Initialize task context service.

        Args:
            repo_root: Absolute path to repository root
            process_provider: Optional ProcessProvider instance (defaults to new instance)
            git_provider: Optional GitProvider instance (defaults to new instance)
        """
        self.repo_root = Path(repo_root)
        self.context_root = self.repo_root / ".agent-output"
        self.lock_file = self.context_root / ".context_store.lock"

        # Ensure context directory exists
        self.context_root.mkdir(parents=True, exist_ok=True)

        # Initialize providers
        self._process_provider = process_provider or ProcessProvider()
        self._git_provider = git_provider or GitProvider(repo_root)

        # Initialize runtime helper (S3.6)
        self._runtime = RuntimeHelper(
            repo_root=self.repo_root,
            context_root=self.context_root,
            git_provider=self._git_provider
        )

        # Initialize immutable snapshot builder (S3.2)
        self._immutable = ImmutableSnapshotBuilder(
            repo_root=self.repo_root,
            context_root=self.context_root,
            atomic_write_fn=self._runtime.atomic_write,
            get_context_dir_fn=self._runtime.get_context_dir,
            get_evidence_dir_fn=self._runtime.get_evidence_dir,
            get_manifest_file_fn=self._runtime.get_manifest_file,
            resolve_task_path_fn=self._runtime.resolve_task_path,
        )

        # Initialize delta tracking manager (S3.3)
        self._delta = DeltaTracker(
            repo_root=self.repo_root,
            git_provider=self._git_provider
        )

        # Initialize evidence manager (S3.4)
        self._evidence = EvidenceManager(
            repo_root=self.repo_root,
            context_root=self.context_root,
            process_provider=self._process_provider
        )

        # Initialize QA baseline manager (S3.5)
        self._qa = QABaselineManager(
            repo_root=self.repo_root,
            process_provider=self._process_provider
        )

    # ========================================================================
    # Context Lifecycle Methods
    # ========================================================================

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
        context_file = self._runtime.get_context_file(task_id)

        # Check if context already exists
        if context_file.exists():
            raise ContextExistsError(
                f"Context already initialized for {task_id}. "
                f"Use purge_context() first to re-initialize."
            )

        # Delegate to immutable snapshot builder (S3.2)
        context = self._immutable.init_context(
            task_id=task_id,
            immutable=immutable,
            git_head=git_head,
            task_file_sha=task_file_sha,
            created_by=created_by,
            force_secrets=force_secrets,
            source_files=source_files
        )

        # Write atomically with lock
        with FileLock(str(self.lock_file), timeout=10):
            json_content = json.dumps(context.to_dict(), indent=2, sort_keys=True, ensure_ascii=False)
            json_content += '\n'  # Trailing newline
            self._runtime.atomic_write(context_file, json_content)

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
        manifest_file = self._runtime.get_manifest_file(task_id)
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
        self._runtime.scan_for_secrets(updates, force=force_secrets)

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
            context_file = self._runtime.get_context_file(task_id)
            json_content = json.dumps(context.to_dict(), indent=2, sort_keys=True, ensure_ascii=False)
            json_content += '\n'
            self._runtime.atomic_write(context_file, json_content)

    def purge_context(self, task_id: str) -> None:
        """
        Delete context directory (idempotent).

        No error if already deleted.

        Args:
            task_id: Task identifier
        """
        context_dir = self._runtime.get_context_dir(task_id)

        if not context_dir.exists():
            return

        # Remove directory recursively
        import shutil
        shutil.rmtree(context_dir, ignore_errors=True)

    # ========================================================================
    # Delta Tracking Methods
    # ========================================================================

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

        Delegates core delta tracking to DeltaTracker (S3.3), handles incremental
        diff calculation for reviewers.

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
        # Load context to get repo_paths
        context = self.get_context(task_id)
        if context is None:
            raise ContextNotFoundError(f"No context found for {task_id}")

        context_dir = self._runtime.get_context_dir(task_id)
        context_dir.mkdir(parents=True, exist_ok=True)

        # Delegate to DeltaTracker for base snapshot generation
        snapshot = self._delta.snapshot_worktree(
            base_commit=base_commit,
            repo_paths=context.repo_paths,
            context_dir=context_dir,
            agent_role=agent_role
        )

        # Calculate incremental diff (reviewer only)
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

                    # Update snapshot with incremental diff fields
                    snapshot = WorktreeSnapshot(
                        base_commit=snapshot.base_commit,
                        snapshot_time=snapshot.snapshot_time,
                        diff_from_base=snapshot.diff_from_base,
                        diff_sha=snapshot.diff_sha,
                        status_report=snapshot.status_report,
                        files_changed=snapshot.files_changed,
                        diff_stat=snapshot.diff_stat,
                        scope_hash=snapshot.scope_hash,
                        diff_from_implementer=diff_from_implementer,
                        incremental_diff_sha=incremental_diff_sha,
                        incremental_diff_error=None,
                    )
                else:
                    # Update snapshot with error
                    snapshot = WorktreeSnapshot(
                        base_commit=snapshot.base_commit,
                        snapshot_time=snapshot.snapshot_time,
                        diff_from_base=snapshot.diff_from_base,
                        diff_sha=snapshot.diff_sha,
                        status_report=snapshot.status_report,
                        files_changed=snapshot.files_changed,
                        diff_stat=snapshot.diff_stat,
                        scope_hash=snapshot.scope_hash,
                        diff_from_implementer=None,
                        incremental_diff_sha=None,
                        incremental_diff_error=inc_error,
                    )

        # Update coordination state
        self.update_coordination(
            task_id=task_id,
            agent_role=agent_role,
            updates={'worktree_snapshot': snapshot},
            actor=actor
        )

        return snapshot

    def verify_worktree_state(
        self,
        task_id: str,
        expected_agent: str
    ) -> None:
        """
        Verify working tree matches expected state from previous agent.

        Delegates to DeltaTracker (S3.3), loads context to get snapshot and repo_paths.

        Args:
            task_id: Task identifier
            expected_agent: Agent whose snapshot to verify against

        Raises:
            DriftError: On mismatch with detailed file-by-file report
            ContextNotFoundError: If no snapshot found for expected_agent
        """
        # Load context
        context = self.get_context(task_id)
        if context is None:
            raise ContextNotFoundError(f"No context found for {task_id}")

        # Get expected snapshot
        agent_coord = getattr(context, expected_agent)
        snapshot = agent_coord.worktree_snapshot

        if snapshot is None:
            raise ContextNotFoundError(
                f"No worktree snapshot found for {expected_agent}. "
                f"Agent must call snapshot_worktree() before handoff."
            )

        # Delegate to DeltaTracker
        self._delta.verify_worktree_state(
            base_commit=snapshot.base_commit,
            diff_sha=snapshot.diff_sha,
            files_changed=snapshot.files_changed,
            scope_hash=snapshot.scope_hash,
            repo_paths=context.repo_paths
        )

    # ========================================================================
    # Evidence Management Methods
    # ========================================================================

    def attach_evidence(
        self,
        task_id: str,
        artifact_path: Path,
        artifact_type: str,
        description: str,
        agent_role: Optional[str] = None,
        compress: bool = True
    ) -> EvidenceAttachment:
        """
        Attach evidence artifact to task context.

        Delegates to EvidenceManager (S3.4).

        Args:
            task_id: Task identifier
            artifact_path: Path to artifact (file or directory)
            artifact_type: Type of artifact (see ARTIFACT_TYPES in evidence.py)
            description: Human-readable description
            agent_role: Optional agent role (implementer, reviewer, validator)
            compress: Whether to compress artifact (default: True)

        Returns:
            EvidenceAttachment metadata

        Raises:
            ValidationError: If artifact type invalid or size exceeds limit
        """
        return self._evidence.attach_evidence(
            task_id=task_id,
            artifact_path=artifact_path,
            artifact_type=artifact_type,
            description=description,
            agent_role=agent_role,
            compress=compress
        )

    def list_evidence(self, task_id: str) -> List[EvidenceAttachment]:
        """
        List all evidence attachments for task.

        Delegates to EvidenceManager (S3.4).

        Args:
            task_id: Task identifier

        Returns:
            List of EvidenceAttachment metadata
        """
        return self._evidence.list_evidence(task_id)

    # ========================================================================
    # Standards Enrichment Methods
    # ========================================================================

    def extract_standards_excerpt(
        self,
        task_id: str,
        standards_file: str,
        section_heading: str
    ) -> StandardsExcerpt:
        """
        Extract standards excerpt and cache for task.

        Delegates to ImmutableSnapshotBuilder (S3.2).

        Args:
            task_id: Task identifier
            standards_file: Path to standards file (e.g., "standards/backend-tier.md")
            section_heading: Section heading to extract

        Returns:
            StandardsExcerpt with cached content

        Raises:
            ValidationError: If file not found or section not found
        """
        return self._immutable.extract_standards_excerpt(
            task_id=task_id,
            standards_file=standards_file,
            section_heading=section_heading
        )

    def verify_excerpt_freshness(self, excerpt: StandardsExcerpt) -> bool:
        """
        Verify excerpt is still current (SHA matches).

        Delegates to ImmutableSnapshotBuilder (S3.2).

        Args:
            excerpt: StandardsExcerpt to verify

        Returns:
            True if excerpt is current, False if stale
        """
        return self._immutable.verify_excerpt_freshness(excerpt)

    def invalidate_stale_excerpts(self, task_id: str) -> List[str]:
        """
        Check all excerpts in context, return list of stale excerpt_ids.

        Delegates to ImmutableSnapshotBuilder (S3.2).

        Args:
            task_id: Task identifier

        Returns:
            List of stale excerpt IDs
        """
        return self._immutable.invalidate_stale_excerpts(task_id)

    # ========================================================================
    # Task Snapshot Methods
    # ========================================================================

    def create_task_snapshot(
        self,
        task_id: str,
        task_file_path: Optional[Path] = None
    ) -> dict:
        """
        Create immutable task snapshot from .task.yaml.

        Delegates to ImmutableSnapshotBuilder (S3.2).

        Args:
            task_id: Task identifier
            task_file_path: Optional path to task file (auto-resolved if not provided)

        Returns:
            Task snapshot dict

        Raises:
            ValidationError: If task file not found or invalid
        """
        return self._immutable.create_task_snapshot(task_id, task_file_path)

    def snapshot_checklists(self, task_id: str, tier: str) -> List[EvidenceAttachment]:
        """
        Snapshot implementation checklists and diff-safety checklist.

        Delegates to ImmutableSnapshotBuilder (S3.2).

        Args:
            task_id: Task identifier
            tier: Tier name (e.g., "backend", "mobile", "shared")

        Returns:
            List of evidence attachments for checklists
        """
        return self._immutable.snapshot_checklists(task_id, tier)

    def create_snapshot_and_embed(
        self,
        task_id: str,
        task_file_path: Path,
        completed_dir: Path
    ) -> dict:
        """
        Create snapshot, embed in completed task, and archive original.

        Delegates to ImmutableSnapshotBuilder (S3.2).

        Args:
            task_id: Task identifier
            task_file_path: Path to original task file
            completed_dir: Directory for completed tasks

        Returns:
            Task snapshot with embedded metadata
        """
        return self._immutable.create_snapshot_and_embed(
            task_id=task_id,
            task_file_path=task_file_path,
            completed_dir=completed_dir
        )

    def resolve_task_path(self, task_id: str) -> Optional[Path]:
        """
        Resolve task file path from task ID.

        Delegates to RuntimeHelper (S3.6).

        Args:
            task_id: Task identifier

        Returns:
            Path to task file, or None if not found
        """
        return self._runtime.resolve_task_path(task_id)

    # ========================================================================
    # Internal Helper Methods
    # ========================================================================

    def _load_context_file(self, task_id: str) -> Optional[TaskContext]:
        """
        Load context from file without acquiring lock.

        Internal method - callers must handle locking.

        Args:
            task_id: Task identifier

        Returns:
            TaskContext or None if not found
        """
        context_file = self._runtime.get_context_file(task_id)

        if not context_file.exists():
            return None

        with open(context_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        context = TaskContext.from_dict(data)

        # Check staleness
        self._runtime.check_staleness(context.git_head)

        return context

    def _calculate_incremental_diff(
        self,
        implementer_diff_file: Path,
        base_commit: str,
        task_id: str
    ) -> Tuple[Optional[str], Optional[str]]:
        """
        Calculate reviewer's incremental changes by reverse-applying implementer diff.

        Delegates to DeltaTracker (S3.3), but needs to load context to get repo_paths.

        Args:
            implementer_diff_file: Path to implementer's diff file
            base_commit: Base commit SHA to start from
            task_id: Task identifier to load context for scope filtering

        Returns:
            Tuple of (incremental_diff_content, error_message)
            - On success: (diff_string, None)
            - On conflict: (None, user_friendly_error)
        """
        # Load context to get repo_paths
        context = self.get_context(task_id)
        if not context:
            return (None, f"Context not found for {task_id}")

        # Delegate to DeltaTracker
        return self._delta._calculate_incremental_diff(
            implementer_diff_file=implementer_diff_file,
            base_commit=base_commit,
            repo_paths=context.repo_paths
        )
