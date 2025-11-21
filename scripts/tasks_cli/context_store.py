"""
Task context store for agent coordination.

COMPATIBILITY LAYER: This module now provides a thin compatibility wrapper
by re-exporting from the context_store/ package. All business logic has been
migrated to specialized modules in context_store/ package (S4.4).

See: docs/proposals/task-cli-modularization.md
"""

# Re-export all public items from context_store package
from .context_store import (
    # Models
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
    # Main class
    TaskContextStore,
    # Exceptions
    ContextExistsError,
    ContextNotFoundError,
    DriftError,
    # Utilities
    normalize_multiline,
    normalize_diff_for_hashing,
    calculate_scope_hash,
    # Managers
    QABaselineManager,
    RuntimeHelper,
    TaskContextService,
)

# Re-export evidence constants
from .context_store.evidence import ARTIFACT_TYPES, TYPE_SIZE_LIMITS

# Re-export ValidationError
from .exceptions import ValidationError

__all__ = [
    # Models
    'MANIFEST_SCHEMA_VERSION',
    'CONTEXT_SCHEMA_VERSION',
    'TaskSnapshot',
    'StandardsCitation',
    'StandardsExcerpt',
    'QACoverageSummary',
    'QACommandSummary',
    'QACommandResult',
    'QAResults',
    'CompressionMetadata',
    'ArtifactMetadata',
    'EvidenceAttachment',
    'ValidationBaseline',
    'FileOperationMetrics',
    'CacheOperationMetrics',
    'CommandExecution',
    'WarningEntry',
    'TelemetrySnapshot',
    'SourceFile',
    'ContextManifest',
    'FileSnapshot',
    'WorktreeSnapshot',
    'AgentCoordination',
    'TaskContext',
    # Main class
    'TaskContextStore',
    # Exceptions
    'ValidationError',
    'ContextExistsError',
    'ContextNotFoundError',
    'DriftError',
    # Utilities
    'normalize_multiline',
    'normalize_diff_for_hashing',
    'calculate_scope_hash',
    # Constants
    'ARTIFACT_TYPES',
    'TYPE_SIZE_LIMITS',
    # Managers
    'QABaselineManager',
    'RuntimeHelper',
    'TaskContextService',
]
