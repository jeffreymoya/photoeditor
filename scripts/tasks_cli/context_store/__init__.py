"""
Context store package.

Backward-compatible imports for all models and main TaskContextStore class.
"""

# Import all models from models.py
from .models import (
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

# Import main TaskContextStore wrapper
from .wrapper import TaskContextStore

# Import exceptions
from ..exceptions import ContextExistsError, ContextNotFoundError, DriftError

# Import utility functions
from .immutable import normalize_multiline
from .delta_tracking import normalize_diff_for_hashing, calculate_scope_hash

# Import managers for direct use
from .qa import QABaselineManager
from .runtime import RuntimeHelper
from .facade import TaskContextService

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
    # Main class and utilities
    'TaskContextStore',
    'ContextExistsError',
    'ContextNotFoundError',
    'DriftError',
    'normalize_multiline',
    'normalize_diff_for_hashing',
    'calculate_scope_hash',
    # Managers
    'QABaselineManager',
    'RuntimeHelper',
    'TaskContextService',
]
