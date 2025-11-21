"""
Evidence attachment and compression management for task context store.

Handles artifact attachment, validation, compression, and indexing.
Extracted from context_store.py as part of modularization (S3.4).
"""

import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from tasks_cli.exceptions import ValidationError
from tasks_cli.providers import ProcessProvider

# ============================================================================
# Constants
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


# ============================================================================
# Evidence Manager
# ============================================================================

class EvidenceManager:
    """
    Manages evidence attachment, compression, and artifact indexing.

    Responsible for:
    - Validating artifact types and size limits
    - Creating archives from directories
    - Attaching evidence to task contexts
    - Listing evidence attachments
    """

    def __init__(self, repo_root: Path, context_root: Path, process_provider=None):
        """
        Initialize evidence manager.

        Args:
            repo_root: Repository root directory
            context_root: Context store root (.agent-output/)
            process_provider: Optional ProcessProvider instance (defaults to new instance)
        """
        self.repo_root = repo_root
        self.context_root = context_root
        self._process_provider = process_provider or ProcessProvider()

    def _get_evidence_dir(self, task_id: str) -> Path:
        """
        Get evidence directory path for task.

        Args:
            task_id: Task identifier

        Returns:
            Path to .agent-output/TASK-XXXX/evidence/
        """
        context_dir = self.context_root / task_id
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

    def _validate_artifact_metadata(self, artifact_type: str, metadata: Optional[Dict[str, Any]]) -> None:
        """
        Validate type-specific metadata requirements.

        Per schema Section 1.2 (task-context-cache-hardening-schemas.md):
        - qa_output: requires command, exit_code, duration_ms
        - log: requires command, exit_code (if from command)
        - Other types: no required metadata

        Note: Archive compression is validated separately via _validate_compression.

        Args:
            artifact_type: One of ARTIFACT_TYPES
            metadata: Type-specific metadata dict

        Raises:
            ValidationError: If required metadata missing
        """
        if artifact_type == 'qa_output':
            if not metadata:
                raise ValidationError(
                    "qa_output artifacts require metadata with command, exit_code, duration_ms"
                )
            required_fields = ['command', 'exit_code', 'duration_ms']
            missing = [f for f in required_fields if f not in metadata]
            if missing:
                raise ValidationError(
                    f"qa_output metadata missing required fields: {', '.join(missing)}"
                )

    def _validate_compression(self, artifact_type: str, compression: Optional[Any]) -> None:
        """
        Validate compression field for archive artifacts.

        Per schema Section 1.2 (task-context-cache-hardening-schemas.md):
        - archive: requires compression with format and index_path

        Raises:
            ValidationError: If compression requirements not met
        """
        if artifact_type == 'archive':
            if not compression:
                raise ValidationError(
                    "archive artifacts require compression field with format and index_path"
                )
            # Check if compression has required attributes
            if not hasattr(compression, 'format') or not hasattr(compression, 'index_path'):
                raise ValidationError(
                    "archive compression must have format and index_path attributes"
                )
            if not compression.format or not compression.index_path:
                raise ValidationError(
                    "archive compression format and index_path cannot be empty"
                )

    def _create_directory_archive(
        self,
        dir_path: Path,
        output_path: Path,
        task_id: str,
        atomic_write_func
    ) -> 'CompressionMetadata':
        """
        Create deterministic archive from directory.

        Implements tar.zst compression with index.json manifest per
        Section 1.3 of task-context-cache-hardening-schemas.md.

        Args:
            dir_path: Directory to archive
            output_path: Target archive path (will have .tar.zst extension)
            task_id: Task identifier for logging
            atomic_write_func: Callable for atomic file writes

        Returns:
            CompressionMetadata with format, original_size, index_path

        Raises:
            ValidationError: If directory doesn't exist or archive creation fails
        """
        # Import CompressionMetadata here to avoid circular import
        from tasks_cli.context_store import CompressionMetadata

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
        atomic_write_func(index_path, index_content)

        # 3. Create archive (prefer tar.zst, fallback to tar.gz)
        compression_format = "tar.zst"
        archive_path = output_path.with_suffix('.tar.zst')

        try:
            # Try tar.zst first (best compression)
            self._process_provider.run(
                ['tar', '--zstd', '--create', '--file', str(archive_path),
                 '--directory', str(dir_path.parent), dir_path.name],
                timeout=300,  # 5 minutes for large directories
                check=True
            )
        except Exception:
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
                self._process_provider.run(
                    ['tar', '--gzip', '--create', '--file', str(archive_path),
                     '--directory', str(dir_path.parent), dir_path.name],
                    timeout=300,  # 5 minutes for large directories
                    check=True
                )
            except Exception as tar_error:
                raise ValidationError(
                    f"Failed to create archive: {str(tar_error)}"
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
        metadata: Optional[Dict[str, Any]] = None,
        atomic_write_func=None
    ) -> 'EvidenceAttachment':
        """
        Attach evidence artifact to task context.

        Args:
            task_id: Task identifier
            artifact_type: One of ARTIFACT_TYPES
            artifact_path: Path to artifact (absolute or relative to repo_root)
            description: Human-readable description (max 200 chars)
            metadata: Type-specific metadata (e.g., command, exit_code for qa_output)
            atomic_write_func: Callable for atomic file writes

        Returns:
            EvidenceAttachment with ID, SHA256, and metadata

        Raises:
            ValidationError: If type invalid, size exceeds limits, or path invalid
        """
        # Import here to avoid circular dependency
        from tasks_cli.context_store import EvidenceAttachment, ArtifactMetadata

        # Resolve artifact path
        if not artifact_path.is_absolute():
            artifact_path = self.repo_root / artifact_path

        if not artifact_path.exists():
            raise ValidationError(f"Artifact path does not exist: {artifact_path}")

        # Prepare evidence directory
        evidence_dir = self._get_evidence_dir(task_id)
        evidence_dir.mkdir(parents=True, exist_ok=True)

        # Handle directory type by converting to archive
        compression = None
        artifact_bytes = None  # Will be set for regular files, recalculated for archives
        sha256_hash = None

        if artifact_path.is_dir():
            if artifact_type != 'directory':
                raise ValidationError(
                    f"Path is a directory but type is '{artifact_type}'. "
                    "Use type='directory' for directory artifacts."
                )

            # Create archive in evidence directory
            archive_base = evidence_dir / f"{artifact_path.name}-archive"
            compression = self._create_directory_archive(
                artifact_path,
                archive_base,
                task_id,
                atomic_write_func
            )

            # Update artifact_path to point to archive
            if compression.format == "tar.zst":
                artifact_path = archive_base.with_suffix('.tar.zst')
            else:
                artifact_path = archive_base.with_suffix('.tar.gz')

            # Update type to archive
            artifact_type = 'archive'
        else:
            # Copy file to evidence directory (per Section 3.2 requirement)
            # Use SHA256 hash as filename to avoid collisions and ensure stability

            # Read file and compute hash first
            artifact_bytes = artifact_path.read_bytes()
            sha256_hash = hashlib.sha256(artifact_bytes).hexdigest()

            # Determine target filename with original extension
            file_extension = artifact_path.suffix
            target_filename = f"{sha256_hash[:16]}{file_extension}"
            target_path = evidence_dir / target_filename

            # Copy file to evidence directory if not already there
            if not target_path.exists():
                shutil.copy2(artifact_path, target_path)

            # Update artifact_path to point to evidence copy
            artifact_path = target_path

        # Calculate size and hash (reuse for regular files, compute for archives)
        if artifact_bytes is None:
            artifact_bytes = artifact_path.read_bytes()
        size_bytes = len(artifact_bytes)

        if sha256_hash is None:
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

        # Parse and validate metadata (GAP-3: enforce type-specific requirements)
        artifact_metadata = None
        if metadata:
            artifact_metadata = ArtifactMetadata.from_dict(metadata)

        # Validate type-specific metadata requirements per schema
        self._validate_artifact_metadata(artifact_type, metadata)

        # Validate compression for archive artifacts per schema Table 1.2
        self._validate_compression(artifact_type, compression)

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
        atomic_write_func(index_path, index_content)

        return attachment

    def list_evidence(self, task_id: str) -> List['EvidenceAttachment']:
        """
        List all evidence attachments for task.

        Args:
            task_id: Task identifier

        Returns:
            List of EvidenceAttachment objects (empty if no evidence)
        """
        # Import here to avoid circular dependency
        from tasks_cli.context_store import EvidenceAttachment

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
