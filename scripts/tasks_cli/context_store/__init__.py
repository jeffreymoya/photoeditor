"""
Context store package.

Backward-compatible imports for all models and main TaskContextStore class.
"""

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

# Import main TaskContextStore class and exceptions from parent context_store.py
# Use importlib to avoid circular import issues
import importlib
import sys
from pathlib import Path

# Get parent module (tasks_cli.context_store module, not package)
_parent_module_name = __name__.rsplit('.', 1)[0]  # tasks_cli
_context_store_module_path = Path(__file__).parent.parent / 'context_store.py'

# Load context_store.py as a module
_spec = importlib.util.spec_from_file_location(
    f"{_parent_module_name}._context_store_main",
    _context_store_module_path
)
_context_store_main = importlib.util.module_from_spec(_spec)
sys.modules[f"{_parent_module_name}._context_store_main"] = _context_store_main
_spec.loader.exec_module(_context_store_main)

# Re-export main class and related items
TaskContextStore = _context_store_main.TaskContextStore
ContextExistsError = _context_store_main.ContextExistsError
ContextNotFoundError = _context_store_main.ContextNotFoundError
DriftError = _context_store_main.DriftError
normalize_multiline = _context_store_main.normalize_multiline
normalize_diff_for_hashing = _context_store_main.normalize_diff_for_hashing
calculate_scope_hash = _context_store_main.calculate_scope_hash

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
]
