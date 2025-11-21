"""
TaskContextStore compatibility wrapper.

This module provides a backward-compatible wrapper around TaskContextService facade.
All business logic has been migrated to specialized modules (S4.4).
"""

from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from ..exceptions import ValidationError, ContextNotFoundError
from .facade import TaskContextService
from .models import (
    TaskContext,
    ContextManifest,
    WorktreeSnapshot,
    EvidenceAttachment,
    StandardsExcerpt,
    SourceFile,
    FileSnapshot,
)


class TaskContextStore:
    """
    Manages persistent context cache for agent coordination.

    COMPATIBILITY LAYER: This class now delegates all operations to the
    TaskContextService facade. All business logic has been migrated to
    specialized modules (S4.4).
    """

    # Secret scanning patterns (for backward compatibility)
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

        # Initialize facade (delegates to specialized modules)
        self._facade = TaskContextService(repo_root=self.repo_root)

        # Expose internal managers for backward compatibility
        self._runtime = self._facade._runtime
        self._snapshot_builder = self._facade._immutable

    # ========================================================================
    # Context Lifecycle Methods (delegate to facade)
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
        """Initialize context with immutable snapshot."""
        return self._facade.init_context(
            task_id=task_id,
            immutable=immutable,
            git_head=git_head,
            task_file_sha=task_file_sha,
            created_by=created_by,
            force_secrets=force_secrets,
            source_files=source_files
        )

    def get_context(self, task_id: str) -> Optional[TaskContext]:
        """Read task context (immutable + coordination)."""
        return self._facade.get_context(task_id)

    def get_manifest(self, task_id: str) -> Optional[ContextManifest]:
        """Read context manifest (provenance tracking, GAP-4)."""
        return self._facade.get_manifest(task_id)

    def update_coordination(
        self,
        task_id: str,
        agent_role: str,
        updates: dict,
        actor: str,
        force_secrets: bool = False
    ) -> None:
        """Update coordination state for one agent (atomic)."""
        return self._facade.update_coordination(
            task_id=task_id,
            agent_role=agent_role,
            updates=updates,
            actor=actor,
            force_secrets=force_secrets
        )

    def purge_context(self, task_id: str) -> None:
        """Delete context directory (idempotent)."""
        return self._facade.purge_context(task_id)

    # ========================================================================
    # Delta Tracking Methods (delegate to facade)
    # ========================================================================

    def snapshot_worktree(
        self,
        task_id: str,
        agent_role: str,
        actor: str,
        base_commit: str,
        previous_agent: Optional[str] = None
    ) -> WorktreeSnapshot:
        """Snapshot working tree state at agent completion."""
        return self._facade.snapshot_worktree(
            task_id=task_id,
            agent_role=agent_role,
            actor=actor,
            base_commit=base_commit,
            previous_agent=previous_agent
        )

    def verify_worktree_state(
        self,
        task_id: str,
        expected_agent: str
    ) -> None:
        """Verify working tree matches expected state from previous agent."""
        return self._facade.verify_worktree_state(
            task_id=task_id,
            expected_agent=expected_agent
        )

    # ========================================================================
    # Evidence Management Methods (delegate to facade)
    # ========================================================================

    def attach_evidence(
        self,
        task_id: str,
        artifact_type: str,
        artifact_path: Path,
        description: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> EvidenceAttachment:
        """
        Attach evidence artifact to task context.

        NOTE: Signature changed in facade to match EvidenceManager.
        This wrapper adapts the old signature for backward compatibility.
        """
        # Verify context exists
        context = self.get_context(task_id)
        if context is None:
            raise ContextNotFoundError(f"No context found for {task_id}")

        # Delegate to facade's evidence manager
        return self._facade._evidence.attach_evidence(
            task_id=task_id,
            artifact_type=artifact_type,
            artifact_path=artifact_path,
            description=description,
            metadata=metadata,
            atomic_write_func=self._runtime.atomic_write
        )

    def list_evidence(self, task_id: str) -> List[EvidenceAttachment]:
        """List all evidence attachments for task."""
        return self._facade.list_evidence(task_id)

    # ========================================================================
    # Standards Enrichment Methods (delegate to facade)
    # ========================================================================

    def extract_standards_excerpt(
        self,
        task_id: str,
        standards_file: str,
        section_heading: str
    ) -> StandardsExcerpt:
        """Extract standards excerpt and cache for task."""
        return self._facade.extract_standards_excerpt(
            task_id=task_id,
            standards_file=standards_file,
            section_heading=section_heading
        )

    def verify_excerpt_freshness(self, excerpt: StandardsExcerpt) -> bool:
        """Verify excerpt is still current (SHA matches)."""
        return self._facade.verify_excerpt_freshness(excerpt)

    def invalidate_stale_excerpts(self, task_id: str) -> List[str]:
        """Check all excerpts in context, return list of stale excerpt_ids."""
        return self._facade.invalidate_stale_excerpts(task_id)

    # ========================================================================
    # Task Snapshot Methods (delegate to facade)
    # ========================================================================

    def resolve_task_path(self, task_id: str) -> Optional[Path]:
        """Resolve task file path from task ID."""
        return self._facade.resolve_task_path(task_id)

    def create_task_snapshot(
        self,
        task_id: str,
        task_file_path: Optional[Path] = None
    ) -> dict:
        """Create immutable task snapshot from .task.yaml."""
        return self._facade.create_task_snapshot(task_id, task_file_path)

    def snapshot_checklists(self, task_id: str, tier: str) -> List[EvidenceAttachment]:
        """Snapshot implementation checklists and diff-safety checklist."""
        return self._facade.snapshot_checklists(task_id, tier)

    def create_snapshot_and_embed(
        self,
        task_id: str,
        task_path: Path,
        task_data: Dict[str, Any],
        tier: str,
        context: TaskContext
    ) -> Dict[str, Any]:
        """
        Create task snapshot and embed data into context (convenience wrapper).

        NOTE: Signature changed in facade. This wrapper adapts for backward compatibility.
        """
        # Delegate to immutable snapshot builder
        return self._snapshot_builder.create_snapshot_and_embed(
            task_id=task_id,
            task_path=task_path,
            task_data=task_data,
            tier=tier,
            context=context,
            attach_evidence_fn=self.attach_evidence
        )

    def embed_acceptance_criteria(
        self,
        task_data: dict,
        context: TaskContext
    ) -> None:
        """Embed acceptance criteria, scope, plan, and deliverables into context."""
        # Delegate to immutable snapshot builder
        return self._snapshot_builder.embed_acceptance_criteria(task_data, context)

    # ========================================================================
    # Deprecated Helper Methods (delegate to runtime)
    # ========================================================================

    def _get_context_dir(self, task_id: str) -> Path:
        """DEPRECATED: Use self._runtime.get_context_dir() directly."""
        return self._runtime.get_context_dir(task_id)

    def _get_context_file(self, task_id: str) -> Path:
        """DEPRECATED: Use self._runtime.get_context_file() directly."""
        return self._runtime.get_context_file(task_id)

    def _get_manifest_file(self, task_id: str) -> Path:
        """DEPRECATED: Use self._runtime.get_manifest_file() directly."""
        return self._runtime.get_manifest_file(task_id)

    def _get_evidence_dir(self, task_id: str) -> Path:
        """DEPRECATED: Use self._runtime.get_evidence_dir() directly."""
        return self._runtime.get_evidence_dir(task_id)

    def _calculate_file_sha256(self, file_path: Path) -> str:
        """DEPRECATED: Use self._runtime.calculate_file_sha256() directly."""
        return self._runtime.calculate_file_sha256(file_path)

    def _atomic_write(self, path: Path, content: str) -> None:
        """DEPRECATED: Use self._runtime.atomic_write() directly."""
        return self._runtime.atomic_write(path, content)

    def _scan_for_secrets(self, data: dict, force: bool = False) -> None:
        """DEPRECATED: Use self._runtime.scan_for_secrets() directly."""
        return self._runtime.scan_for_secrets(data, force)

    def _get_current_git_head(self) -> str:
        """DEPRECATED: Use self._runtime.get_current_git_head() directly."""
        return self._runtime.get_current_git_head()

    def _check_staleness(self, context: TaskContext) -> None:
        """DEPRECATED: Use self._runtime.check_staleness() directly."""
        return self._runtime.check_staleness(context.git_head)

    def _normalize_repo_paths_for_migration(self, paths: List[str]) -> List[str]:
        """DEPRECATED: Use self._runtime.normalize_repo_paths() directly."""
        return self._runtime.normalize_repo_paths(paths)

    def _find_section_boundaries(self, content: str, heading: str) -> Optional[Tuple[int, int]]:
        """DEPRECATED: Use self._snapshot_builder._find_section_boundaries() directly."""
        return self._snapshot_builder._find_section_boundaries(content, heading)

    # ========================================================================
    # Delta Tracking Helpers (delegate to DeltaTracker via facade)
    # ========================================================================

    def _is_working_tree_dirty(self) -> bool:
        """DEPRECATED: Use facade._delta._is_working_tree_dirty() directly."""
        return self._facade._delta._is_working_tree_dirty()

    def _calculate_file_checksum(self, file_path: Path) -> str:
        """DEPRECATED: Use facade._delta._calculate_file_checksum() directly."""
        return self._facade._delta._calculate_file_checksum(file_path)

    def _get_untracked_files_in_scope(
        self,
        repo_paths: List[str]
    ) -> Tuple[List[str], List[str]]:
        """DEPRECATED: Use facade._delta._get_untracked_files_in_scope() directly."""
        return self._facade._delta._get_untracked_files_in_scope(repo_paths)

    def _get_changed_files(
        self,
        base_commit: str,
        env: Optional[Dict[str, str]] = None
    ) -> List[FileSnapshot]:
        """DEPRECATED: Use facade._delta._get_changed_files() directly."""
        return self._facade._delta._get_changed_files(base_commit, env=env)

    def _compare_file_checksums(
        self,
        expected_files: List[FileSnapshot]
    ) -> str:
        """DEPRECATED: Use facade._delta._compare_file_checksums() directly."""
        return self._facade._delta._compare_file_checksums(expected_files)

    def _load_context_file(self, task_id: str) -> Optional[TaskContext]:
        """DEPRECATED: Use facade._load_context_file() directly."""
        return self._facade._load_context_file(task_id)

    def _calculate_incremental_diff(
        self,
        implementer_diff_file: Path,
        base_commit: str,
        task_id: str
    ) -> Tuple[Optional[str], Optional[str]]:
        """DEPRECATED: Use facade._calculate_incremental_diff() directly."""
        return self._facade._calculate_incremental_diff(
            implementer_diff_file,
            base_commit,
            task_id
        )
