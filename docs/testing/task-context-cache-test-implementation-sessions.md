# Task Context Cache - Test Implementation Sessions

**Version:** 1.0
**Date:** 2025-11-15
**Related Document:** `docs/testing/task-context-cache-test-plan.md`
**Implementation:** `scripts/tasks_cli/context_store.py`

---

## Overview

This document provides a session-by-session implementation plan for the comprehensive test coverage outlined in `task-context-cache-test-plan.md`. Tests are organized into **8 sessions** optimized for parallel execution where possible.

### Timeline Summary

- **Sequential implementation:** 8 sessions (one per session)
- **Parallel implementation:** 4 sessions (with up to 4 agents)
- **Total test files:** 8 files (1 shared fixtures + 7 test suites)
- **Total tests:** ~110 tests

### Session Dependency Graph

```
Session 1 (conftest.py)
    ↓
Session 2-5 (Parallel)
    ├── Session 2: CLI Integration
    ├── Session 3: Standards & Provenance
    ├── Session 4: Serialization
    └── Session 5: Lifecycle
    ↓
Session 6-7 (Parallel)
    ├── Session 6: Robustness (Errors)
    └── Session 7: Robustness (Platform)
    ↓
Session 8: Integration
```

---

## Session 1: Shared Fixtures Setup

**Priority:** 🔴 Critical (Blocking)
**File:** `scripts/tasks_cli/tests/conftest.py`
**Duration:** 1 session
**Dependencies:** None
**Blocks:** All other sessions

### Objectives

Create reusable test fixtures that all other test suites will depend on. This session establishes the foundation for all subsequent test implementations.

### Deliverables

1. Mock task YAML files (15 fixtures)
2. Mock git repository fixtures
3. Mock standards files
4. Common helper functions
5. Shared assertion utilities

### Implementation Checklist

#### 1.1 Create Fixture Directory Structure

```bash
mkdir -p scripts/tasks_cli/tests/fixtures/{tasks,standards,qa_outputs}
```

#### 1.2 Mock Task Files (15 files)

Create all task files from test plan Section 2 (Mock Task File Library):

- [ ] `fixtures/tasks/TASK-9001-simple.task.yaml`
- [ ] `fixtures/tasks/TASK-9002-complex-multitier.task.yaml`
- [ ] `fixtures/tasks/TASK-9003-unicode-edge-case.task.yaml`
- [ ] `fixtures/tasks/TASK-9004-standards-heavy.task.yaml`
- [ ] `fixtures/tasks/TASK-9005-draft-incomplete.task.yaml`
- [ ] `fixtures/tasks/TASK-9006-blocked-task.task.yaml`
- [ ] `fixtures/tasks/TASK-9007-completed.task.yaml`
- [ ] `fixtures/tasks/TASK-9008-large-scope.task.yaml`
- [ ] `fixtures/tasks/TASK-9009-binary-files.task.yaml`
- [ ] `fixtures/tasks/TASK-9010-with-baseline.task.yaml`
- [ ] `fixtures/tasks/TASK-9011-long-text.task.yaml`
- [ ] `fixtures/tasks/TASK-9012-crlf-endings.task.yaml` (with CRLF line endings)
- [ ] `fixtures/tasks/TASK-9013-glob-patterns.task.yaml`
- [ ] `fixtures/tasks/TASK-9014-secrets-test.task.yaml`
- [ ] `fixtures/tasks/TASK-9015-special-files.task.yaml`

#### 1.3 Mock Standards Files

- [ ] `fixtures/standards/backend-tier.md`
- [ ] `fixtures/standards/typescript.md`
- [ ] `fixtures/standards/shared-contracts-tier.md`
- [ ] `fixtures/standards/cross-cutting.md`

#### 1.4 Sample QA Outputs

- [ ] `fixtures/qa_outputs/typecheck_pass.txt`
- [ ] `fixtures/qa_outputs/typecheck_fail.txt`
- [ ] `fixtures/qa_outputs/lint_pass.txt`
- [ ] `fixtures/qa_outputs/lint_errors.txt`
- [ ] `fixtures/qa_outputs/test_coverage_pass.txt`
- [ ] `fixtures/qa_outputs/test_coverage_fail.txt`

#### 1.5 Core Fixtures in conftest.py

```python
import pytest
import git
import tempfile
from pathlib import Path
import shutil

# ============================================================================
# Directory Structure Fixtures
# ============================================================================

@pytest.fixture
def tmp_task_repo(tmp_path):
    """Create temporary task repository with full structure."""
    # Create directory structure
    (tmp_path / "tasks").mkdir()
    (tmp_path / "tasks/.context").mkdir()
    (tmp_path / "standards").mkdir()
    (tmp_path / "backend/lambdas/upload").mkdir(parents=True)
    (tmp_path / "backend/services").mkdir(parents=True)
    (tmp_path / "backend/providers").mkdir(parents=True)
    (tmp_path / "mobile/src/screens").mkdir(parents=True)
    (tmp_path / "mobile/assets/images").mkdir(parents=True)
    (tmp_path / "shared/schemas").mkdir(parents=True)

    # Copy fixture files
    fixtures_dir = Path(__file__).parent / "fixtures"

    # Copy task files
    for task_file in (fixtures_dir / "tasks").glob("*.yaml"):
        shutil.copy(task_file, tmp_path / "tasks" / task_file.name)

    # Copy standards files
    for std_file in (fixtures_dir / "standards").glob("*.md"):
        shutil.copy(std_file, tmp_path / "standards" / std_file.name)

    # Initialize git repo
    repo = git.Repo.init(tmp_path)
    (tmp_path / "README.md").write_text("# PhotoEditor Test Repo")
    repo.index.add(["README.md"])
    repo.index.commit("Initial commit")

    return tmp_path, repo

# ============================================================================
# Git Repository State Fixtures
# ============================================================================

@pytest.fixture
def mock_repo_clean(tmp_task_repo):
    """Git repo with clean working tree."""
    tmp_path, repo = tmp_task_repo
    return tmp_path, repo

@pytest.fixture
def mock_repo_dirty(tmp_task_repo):
    """Git repo with uncommitted changes."""
    tmp_path, repo = tmp_task_repo

    # Modify file
    (tmp_path / "README.md").write_text("# PhotoEditor\n\nModified content")

    return tmp_path, repo

@pytest.fixture
def mock_repo_with_staged_changes(tmp_task_repo):
    """Git repo with staged but uncommitted changes."""
    tmp_path, repo = tmp_task_repo

    # Create and stage new file
    new_file = tmp_path / "backend/services/new_service.ts"
    new_file.write_text("export const newService = () => {};")
    repo.index.add([str(new_file.relative_to(tmp_path))])

    return tmp_path, repo

@pytest.fixture
def mock_repo_with_untracked(tmp_task_repo):
    """Git repo with untracked files."""
    tmp_path, repo = tmp_task_repo

    # Create untracked file
    untracked = tmp_path / "backend/services/untracked.ts"
    untracked.write_text("export const untracked = true;")

    return tmp_path, repo

# ============================================================================
# Context Store State Fixtures
# ============================================================================

@pytest.fixture
def initialized_context(tmp_task_repo):
    """Context initialized for TASK-9001."""
    from tasks_cli.context_store import init_context

    tmp_path, repo = tmp_task_repo
    task_file = tmp_path / "tasks/TASK-9001-simple.task.yaml"

    init_context(str(task_file))

    return tmp_path, repo

@pytest.fixture
def initialized_context_with_snapshot(initialized_context):
    """Context with implementer snapshot."""
    from tasks_cli.context_store import snapshot_worktree

    tmp_path, repo = initialized_context

    # Make changes
    service_file = tmp_path / "backend/services/upload.ts"
    service_file.write_text("export const upload = () => { return 'uploaded'; };")

    snapshot_worktree("TASK-9001", agent="implementer")

    return tmp_path, repo

@pytest.fixture
def initialized_context_with_implementer_and_reviewer(initialized_context_with_snapshot):
    """Context with both implementer and reviewer snapshots."""
    from tasks_cli.context_store import snapshot_worktree, update_coordination

    tmp_path, repo = initialized_context_with_snapshot

    # Mark implementer completed
    update_coordination("TASK-9001", agent="implementer", status="completed")

    # Reviewer makes changes
    service_file = tmp_path / "backend/services/upload.ts"
    current_content = service_file.read_text()
    service_file.write_text(current_content + "\n\n// Reviewed and approved")

    snapshot_worktree("TASK-9001", agent="reviewer")

    return tmp_path, repo

@pytest.fixture
def initialized_context_with_drift(initialized_context_with_snapshot):
    """Context with detected drift (manual file edit after snapshot)."""
    from tasks_cli.context_store import verify_worktree_state, DriftError

    tmp_path, repo = initialized_context_with_snapshot

    # Manual edit (not through context store)
    random_file = tmp_path / "backend/services/random_edit.ts"
    random_file.write_text("export const manual = true;")

    # Try to verify (will detect drift and increment drift_budget)
    try:
        verify_worktree_state("TASK-9001", agent="reviewer")
    except DriftError:
        pass  # Expected

    return tmp_path, repo

@pytest.fixture
def initialized_context_with_baseline(tmp_task_repo):
    """Context initialized with validation baseline."""
    from tasks_cli.context_store import init_context

    tmp_path, repo = tmp_task_repo
    task_file = tmp_path / "tasks/TASK-9010-with-baseline.task.yaml"

    init_context(str(task_file))

    return tmp_path, repo

# ============================================================================
# Helper Utilities
# ============================================================================

def assert_context_exists(task_id: str, tmp_path: Path):
    """Assert context directory exists for task."""
    context_dir = tmp_path / f"tasks/.context/{task_id}"
    assert context_dir.exists(), f"Context directory not found for {task_id}"
    assert (context_dir / "context.json").exists(), f"context.json not found for {task_id}"

def assert_diff_file_exists(task_id: str, agent: str, diff_type: str, tmp_path: Path):
    """Assert diff file exists."""
    context_dir = tmp_path / f"tasks/.context/{task_id}"
    diff_file = context_dir / f"diff-{agent}-{diff_type}.patch"
    assert diff_file.exists() or (diff_file.parent / f"{diff_file.name}.gz").exists(), \
        f"Diff file not found: {diff_file}"

def load_context_json(task_id: str, tmp_path: Path) -> dict:
    """Load and parse context.json."""
    import json
    context_file = tmp_path / f"tasks/.context/{task_id}/context.json"
    with open(context_file) as f:
        return json.load(f)

def create_large_file_changes(tmp_path: Path, count: int = 100):
    """Create many file changes for stress testing."""
    for i in range(count):
        file = tmp_path / f"backend/services/generated_{i}.ts"
        file.write_text(f"export const service{i} = () => {{ return {i}; }};")
```

#### 1.6 Validation

- [ ] Run `pytest scripts/tasks_cli/tests/conftest.py --collect-only` (should show 0 tests but load successfully)
- [ ] Verify all 15 task YAML files are valid
- [ ] Verify all fixtures can be imported
- [ ] Run simple test to validate `tmp_task_repo` fixture creates expected structure

### Acceptance Criteria

- [ ] All 15 mock task files created and valid YAML
- [ ] All mock standards files created
- [ ] conftest.py defines 10+ reusable fixtures
- [ ] Fixtures can be imported by test files
- [ ] No errors when collecting tests

---

## Sessions 2-5: Core Test Suites (Parallel)

These four sessions can be executed in parallel by different agents.

---

## Session 2: CLI Integration Tests

**Priority:** 🔴 High
**File:** `scripts/tasks_cli/tests/test_context_store_cli.py`
**Duration:** 1 session
**Dependencies:** Session 1 (conftest.py)
**Can parallelize:** Yes (with Sessions 3, 4, 5)
**Test count:** 20 tests
**Estimated lines:** ~800

### Objectives

Test all CLI commands exposed by the tasks_cli module for context store operations.

### Test Coverage

From test plan Suite 1 (Section 3.1):

1. **`--init-context` Command** (3 tests)
   - Success case
   - Duplicate context error
   - Dirty worktree warning

2. **`--get-context` Command** (2 tests)
   - JSON output validation
   - Not found error

3. **`--update-agent` Command** (1 test)
   - Status update

4. **`--snapshot-worktree` Command** (2 tests)
   - Creates diff artifacts
   - Clean tree handling

5. **`--verify-worktree` Command** (2 tests)
   - No drift detected
   - Drift detected

6. **`--get-diff` Command** (2 tests)
   - Cumulative diff
   - Incremental diff

7. **`--record-qa` Command** (1 test)
   - QA result recording

8. **`--purge-context` Command** (2 tests)
   - Successful purge
   - Idempotent purge

9. **Error Handling** (3 tests)
   - Invalid task ID format
   - Missing required args
   - JSON output format

10. **Parametric Tests** (2 tests)
    - JSON format for all commands
    - Help text validation

### Implementation Checklist

- [ ] Import subprocess, json, pytest
- [ ] Create CLI command wrapper helper
- [ ] Implement test_cli_init_context_success
- [ ] Implement test_cli_init_context_duplicate_error
- [ ] Implement test_cli_init_context_dirty_worktree_warning
- [ ] Implement test_cli_get_context_json_output
- [ ] Implement test_cli_get_context_not_found
- [ ] Implement test_cli_update_agent_status
- [ ] Implement test_cli_snapshot_worktree_creates_diff
- [ ] Implement test_cli_snapshot_worktree_clean_tree
- [ ] Implement test_cli_verify_worktree_no_drift
- [ ] Implement test_cli_verify_worktree_detects_drift
- [ ] Implement test_cli_get_diff_cumulative
- [ ] Implement test_cli_get_diff_incremental
- [ ] Implement test_cli_record_qa_result
- [ ] Implement test_cli_purge_context_success
- [ ] Implement test_cli_purge_context_idempotent
- [ ] Implement test_cli_invalid_task_id_format
- [ ] Implement test_cli_missing_required_args
- [ ] Implement test_cli_json_output_format_all_commands (parametric)

### Validation Commands

```bash
# Run tests
pytest scripts/tasks_cli/tests/test_context_store_cli.py -v

# Coverage check
pytest scripts/tasks_cli/tests/test_context_store_cli.py --cov=tasks_cli.context_store --cov-report=term

# Should have 20 tests passing
```

### Acceptance Criteria

- [ ] All 20 tests implemented and passing
- [ ] CLI commands tested with both success and error cases
- [ ] JSON output validated for structure
- [ ] No flaky tests (run 3 times, all pass)

---

## Session 3: Standards & Provenance Tests

**Priority:** 🔴 High
**File:** `scripts/tasks_cli/tests/test_context_store_provenance.py`
**Duration:** 1 session
**Dependencies:** Session 1 (conftest.py)
**Can parallelize:** Yes (with Sessions 2, 4, 5)
**Test count:** 12 tests
**Estimated lines:** ~600

### Objectives

Test standards citation extraction, SHA validation, manifest generation, and provenance tracking.

### Test Coverage

From test plan Suite 3 (Section 3.3):

1. **Standards Citation Validation** (6 tests)
   - Citation content SHA mismatch forces rebuild
   - Missing citation file handled gracefully
   - Citation line span extraction
   - Citation without line span uses full section
   - Task-specific citation overrides
   - Citation deduplication

2. **Manifest & Provenance** (6 tests)
   - get_manifest returns None if not found
   - Manifest lists all source files with SHAs
   - Normalization version stamped in manifest
   - Manifest regeneration after standards change
   - Manifest tracks config files
   - Manifest derivative files SHA included

### Implementation Checklist

- [ ] Import hashlib, pytest, pathlib
- [ ] Create helper for modifying standards files
- [ ] Implement test_citation_content_sha_mismatch_forces_rebuild
- [ ] Implement test_missing_citation_file_handled_gracefully
- [ ] Implement test_citation_line_span_extraction
- [ ] Implement test_citation_without_line_span_uses_full_section
- [ ] Implement test_task_specific_citation_overrides
- [ ] Implement test_citation_deduplication
- [ ] Implement test_get_manifest_returns_none_if_not_found
- [ ] Implement test_manifest_lists_all_source_files_with_shas
- [ ] Implement test_normalization_version_stamped_in_manifest
- [ ] Implement test_manifest_regeneration_after_standards_change
- [ ] Implement test_manifest_tracks_config_files
- [ ] Implement test_manifest_derivative_files_sha_included

### Validation Commands

```bash
pytest scripts/tasks_cli/tests/test_context_store_provenance.py -v
pytest scripts/tasks_cli/tests/test_context_store_provenance.py --cov=tasks_cli.context_store --cov-report=term
```

### Acceptance Criteria

- [ ] All 12 tests implemented and passing
- [ ] SHA validation logic tested
- [ ] Manifest structure validated
- [ ] Line span extraction verified

---

## Session 4: Serialization & Compression Tests

**Priority:** 🔴 High
**File:** `scripts/tasks_cli/tests/test_context_store_serialization.py`
**Duration:** 1 session
**Dependencies:** Session 1 (conftest.py)
**Can parallelize:** Yes (with Sessions 2, 3, 5)
**Test count:** 18 tests
**Estimated lines:** ~750

### Objectives

Test role-scoped context exports, artifact compression, and canonical JSON serialization.

### Test Coverage

From test plan Suite 4 (Section 3.4):

1. **Role-Scoped Exports** (4 tests)
   - Implementer export omits reviewer/validator data
   - Reviewer export omits QA baselines
   - Validator export includes all data
   - Role export files tracked in manifest

2. **Compressed Evidence** (6 tests)
   - Large diffs compressed on write
   - Small diffs not compressed
   - Large QA logs compressed
   - Artifacts referenced by short ID
   - Decompression on artifact read
   - Compression threshold (1MB) respected

3. **Canonical Serialization** (5 tests)
   - JSON keys sorted deterministically
   - UTF-8 encoding preserved
   - Trailing newline convention
   - Serializer version stamped
   - Float precision consistent

4. **Edge Cases** (3 tests)
   - Very large context files (>5MB)
   - Binary data in artifacts
   - Concurrent writes to different exports

### Implementation Checklist

- [ ] Import gzip, json, pytest
- [ ] Create helper for generating large content
- [ ] Implement test_implementer_export_omits_reviewer_validator_data
- [ ] Implement test_reviewer_export_omits_qa_baselines
- [ ] Implement test_validator_export_includes_all_data
- [ ] Implement test_role_export_files_tracked_in_manifest
- [ ] Implement test_large_diffs_compressed_on_write
- [ ] Implement test_small_diffs_not_compressed
- [ ] Implement test_large_qa_logs_compressed
- [ ] Implement test_artifacts_referenced_by_short_id
- [ ] Implement test_decompression_on_artifact_read
- [ ] Implement test_json_keys_sorted_deterministically
- [ ] Implement test_utf8_encoding_preserved
- [ ] Implement test_trailing_newline_convention
- [ ] Implement test_serializer_version_stamped
- [ ] Implement test_float_precision_consistent
- [ ] Implement test_compression_threshold_respected
- [ ] Implement test_very_large_context_files
- [ ] Implement test_binary_data_in_artifacts

### Validation Commands

```bash
pytest scripts/tasks_cli/tests/test_context_store_serialization.py -v
pytest scripts/tasks_cli/tests/test_context_store_serialization.py --cov=tasks_cli.context_store --cov-report=term
```

### Acceptance Criteria

- [ ] All 18 tests implemented and passing
- [ ] Compression logic verified for >1MB files
- [ ] Role filtering validated
- [ ] JSON determinism confirmed

---

## Session 5: Lifecycle & Coordination Tests

**Priority:** 🔴 High
**File:** `scripts/tasks_cli/tests/test_context_store_lifecycle.py`
**Duration:** 1 session
**Dependencies:** Session 1 (conftest.py)
**Can parallelize:** Yes (with Sessions 2, 3, 4)
**Test count:** 15 tests
**Estimated lines:** ~700

### Objectives

Test auto-purge on task completion, staleness detection, drift budget counter, and agent coordination state.

### Test Coverage

From test plan Suite 2 (Section 3.2):

1. **Auto-Purge on Task Completion** (3 tests)
   - Context auto-purges when task completes
   - Purge errors logged but don't block completion
   - Purge idempotency across multiple completions

2. **Staleness Detection** (4 tests)
   - Warning logged when git HEAD changed
   - No warning when HEAD matches
   - No staleness check outside git repo
   - Staleness doesn't block operations

3. **Drift Budget Counter** (5 tests)
   - Drift budget increments on verification failure
   - Drift budget blocks state-changing operations
   - Drift budget allows read operations
   - Resolve-drift resets budget
   - Drift budget persists across reads

4. **Agent Coordination State** (3 tests)
   - Multiple agents coordination updates
   - Coordination timestamps recorded
   - QA logs accumulate correctly

### Implementation Checklist

- [ ] Import time, pytest, monkeypatch
- [ ] Mock TaskOperations for completion tests
- [ ] Implement test_auto_purge_on_task_completion
- [ ] Implement test_purge_error_logs_but_does_not_block_completion
- [ ] Implement test_purge_idempotency_across_multiple_completions
- [ ] Implement test_staleness_warning_when_git_head_changed
- [ ] Implement test_no_staleness_warning_when_head_matches
- [ ] Implement test_no_staleness_check_outside_git_repo
- [ ] Implement test_staleness_does_not_block_operations
- [ ] Implement test_drift_budget_increments_on_verification_failure
- [ ] Implement test_drift_budget_blocks_state_changing_operations
- [ ] Implement test_drift_budget_read_operations_still_allowed
- [ ] Implement test_resolve_drift_resets_budget
- [ ] Implement test_drift_budget_persists_across_reads
- [ ] Implement test_multiple_agents_coordination_updates
- [ ] Implement test_coordination_timestamps_recorded

### Validation Commands

```bash
pytest scripts/tasks_cli/tests/test_context_store_lifecycle.py -v
pytest scripts/tasks_cli/tests/test_context_store_lifecycle.py --cov=tasks_cli.context_store --cov-report=term
```

### Acceptance Criteria

- [ ] All 15 tests implemented and passing
- [ ] Auto-purge logic tested with TaskOperations
- [ ] Drift budget state transitions verified
- [ ] Staleness warnings validated

---

## Sessions 6-7: Robustness Tests (Parallel)

These two sessions split the robustness test suite and can be executed in parallel.

---

## Session 6: Robustness - Error Recovery & Working Tree

**Priority:** 🟡 Medium
**File:** `scripts/tasks_cli/tests/test_context_store_robustness_errors.py`
**Duration:** 1 session
**Dependencies:** Sessions 1-5
**Can parallelize:** Yes (with Session 7)
**Test count:** 15 tests
**Estimated lines:** ~650

### Objectives

Test error recovery scenarios, lock handling, and working tree edge cases.

### Test Coverage

From test plan Suite 5, sections 5.1 and 5.2:

1. **Error Recovery** (6 tests)
   - Lock timeout retry behavior
   - Stale lockfile cleanup
   - Corrupted JSON recovery
   - Missing context directory auto-created
   - Permission error on write
   - Disk full error handling

2. **Working Tree Edge Cases** (5 tests)
   - Dirty working tree at init warning
   - Untracked files included in snapshot
   - Staged changes included in base commit
   - Submodule changes detected
   - Symlink changes handled

3. **Concurrent Access** (4 tests)
   - Multiple processes updating different agents
   - Lock contention scenarios
   - Atomic write race conditions
   - Lock timeout edge cases

### Implementation Checklist

- [ ] Import threading, multiprocessing, pytest
- [ ] Mock file lock failures
- [ ] Implement test_lock_timeout_retry_behavior
- [ ] Implement test_stale_lockfile_cleanup
- [ ] Implement test_corrupted_json_recovery
- [ ] Implement test_missing_context_directory_auto_created
- [ ] Implement test_permission_error_on_write
- [ ] Implement test_disk_full_error_handling
- [ ] Implement test_dirty_working_tree_at_init_warning
- [ ] Implement test_untracked_files_included_in_snapshot
- [ ] Implement test_staged_changes_included_in_base_commit
- [ ] Implement test_submodule_changes_detected
- [ ] Implement test_symlink_changes_handled
- [ ] Implement test_multiple_processes_updating_different_agents
- [ ] Implement test_lock_contention_scenarios
- [ ] Implement test_atomic_write_race_conditions

### Validation Commands

```bash
pytest scripts/tasks_cli/tests/test_context_store_robustness_errors.py -v
pytest scripts/tasks_cli/tests/test_context_store_robustness_errors.py --cov=tasks_cli.context_store --cov-report=term
```

### Acceptance Criteria

- [ ] All 15 tests implemented and passing
- [ ] Error handling tested with monkeypatch
- [ ] Lock contention simulated with threading
- [ ] Git state edge cases validated

---

## Session 7: Robustness - Incremental Diffs & Cross-Platform

**Priority:** 🟡 Medium
**File:** `scripts/tasks_cli/tests/test_context_store_robustness_platform.py`
**Duration:** 1 session
**Dependencies:** Sessions 1-5
**Can parallelize:** Yes (with Session 6)
**Test count:** 10 tests
**Estimated lines:** ~450

### Objectives

Test incremental diff edge cases and cross-platform compatibility.

### Test Coverage

From test plan Suite 5, sections 5.3 and 5.5:

1. **Incremental Diff Edge Cases** (5 tests)
   - Reviewer deletes implementer file
   - Reviewer renames implementer file
   - Binary file conflicts in incremental diff
   - Large file conflicts warning
   - Empty incremental diff

2. **Cross-Platform Compatibility** (5 tests)
   - Windows path separators (skip on Linux)
   - Case-insensitive filesystem handling (skip on Linux)
   - CRLF vs LF line endings
   - Git config autocrlf variations
   - Unicode in file paths

### Implementation Checklist

- [ ] Import sys, os, pytest
- [ ] Create platform-specific skip markers
- [ ] Implement test_reviewer_deletes_implementer_file
- [ ] Implement test_reviewer_renames_implementer_file
- [ ] Implement test_binary_file_conflicts_in_incremental_diff
- [ ] Implement test_large_file_conflicts_warning
- [ ] Implement test_empty_incremental_diff
- [ ] Implement test_windows_path_separators (Windows only)
- [ ] Implement test_case_insensitive_filesystem_handling (macOS/Windows)
- [ ] Implement test_crlf_vs_lf_line_endings
- [ ] Implement test_git_config_autocrlf_variations
- [ ] Implement test_unicode_in_file_paths

### Validation Commands

```bash
pytest scripts/tasks_cli/tests/test_context_store_robustness_platform.py -v
pytest scripts/tasks_cli/tests/test_context_store_robustness_platform.py --cov=tasks_cli.context_store --cov-report=term
```

### Acceptance Criteria

- [ ] All 10 tests implemented and passing
- [ ] Platform-specific tests properly skipped
- [ ] Line ending normalization verified
- [ ] Incremental diff edge cases covered

---

## Session 8: Performance & Integration Tests

**Priority:** 🟢 Low
**File:** `scripts/tasks_cli/tests/test_context_store_integration.py`
**Duration:** 1 session
**Dependencies:** Sessions 1-7 (all previous sessions)
**Can parallelize:** No (must be last)
**Test count:** 10 tests
**Estimated lines:** ~550

### Objectives

Test performance under stress conditions and full end-to-end workflows.

### Test Coverage

From test plan Suite 6 (Section 3.6):

1. **Performance Stress Tests** (4 tests)
   - Large context files over 1MB
   - Many file changes over 1000 files
   - Deep directory structures
   - File locking stress test

2. **Full Workflow Integration Tests** (4 tests)
   - Complete task workflow init to completion
   - Multiple tasks with contexts simultaneously
   - Context cleanup on branch switch
   - Orphaned context detection

3. **Validation Edge Cases** (2 tests)
   - Empty task fields beyond description
   - Very long field values over 2KB

### Implementation Checklist

- [ ] Import time, pytest
- [ ] Create large file generator helper
- [ ] Implement test_large_context_files_over_1mb
- [ ] Implement test_many_file_changes_over_1000_files
- [ ] Implement test_deep_directory_structures
- [ ] Implement test_file_locking_stress_test
- [ ] Implement test_complete_task_workflow_init_to_completion
- [ ] Implement test_multiple_tasks_with_contexts_simultaneously
- [ ] Implement test_context_cleanup_on_branch_switch
- [ ] Implement test_orphaned_context_detection
- [ ] Implement test_empty_task_fields_beyond_description
- [ ] Implement test_very_long_field_values_over_2kb

### Validation Commands

```bash
pytest scripts/tasks_cli/tests/test_context_store_integration.py -v
pytest scripts/tasks_cli/tests/test_context_store_integration.py --cov=tasks_cli.context_store --cov-report=term

# Performance benchmark (optional)
pytest scripts/tasks_cli/tests/test_context_store_integration.py -v --benchmark
```

### Acceptance Criteria

- [ ] All 10 tests implemented and passing
- [ ] Performance tests complete within reasonable time (<60s each)
- [ ] Full workflow test covers all agent handoffs
- [ ] No memory leaks or resource exhaustion

---

## Final Validation: Full Test Suite

After all 8 sessions are complete, run the full test suite to ensure integration.

### Commands

```bash
# Run all context store tests
pytest scripts/tasks_cli/tests/test_context_store*.py -v

# Coverage report
pytest scripts/tasks_cli/tests/test_context_store*.py \
  --cov=tasks_cli.context_store \
  --cov-report=html \
  --cov-report=term

# Generate coverage badge
pytest scripts/tasks_cli/tests/test_context_store*.py \
  --cov=tasks_cli.context_store \
  --cov-report=term \
  --cov-fail-under=90
```

### Expected Results

- **Total tests:** ~110 tests
- **Test files:** 7 test modules + 1 conftest
- **Line coverage:** ≥90%
- **Branch coverage:** ≥85%
- **Execution time:** <5 minutes for full suite
- **Flaky tests:** 0 (all deterministic)

### Success Criteria

- [ ] All 110+ tests passing
- [ ] Coverage thresholds met
- [ ] No skipped tests (except platform-specific)
- [ ] No warnings or deprecations
- [ ] Documentation updated with test results

---

## Parallel Execution Strategy

### Option 1: Sequential (8 sessions)

```
Week 1: Session 1 → Session 2 → Session 3
Week 2: Session 4 → Session 5 → Session 6
Week 3: Session 7 → Session 8 → Final validation
```

**Timeline:** ~3 weeks

### Option 2: Parallel with 2 Agents

```
Session 1 (Agent A)
  ↓
Session 2 (Agent A) || Session 3 (Agent B)
  ↓
Session 4 (Agent A) || Session 5 (Agent B)
  ↓
Session 6 (Agent A) || Session 7 (Agent B)
  ↓
Session 8 (Agent A)
```

**Timeline:** ~6 sessions (~1.5 weeks)

### Option 3: Parallel with 4 Agents (Recommended)

```
Session 1 (Agent A)
  ↓
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ Session 2   │ Session 3   │ Session 4   │ Session 5   │
│ (Agent A)   │ (Agent B)   │ (Agent C)   │ (Agent D)   │
└─────────────┴─────────────┴─────────────┴─────────────┘
  ↓
┌─────────────┬─────────────┐
│ Session 6   │ Session 7   │
│ (Agent A)   │ (Agent B)   │
└─────────────┴─────────────┘
  ↓
Session 8 (Agent A)
```

**Timeline:** 4 sessions (~1 week with daily sessions)

---

## Session Dependencies Matrix

| Session | Depends On | Blocks | Parallel With |
|---------|-----------|--------|---------------|
| 1: Fixtures | - | All | - |
| 2: CLI | 1 | - | 3, 4, 5 |
| 3: Standards | 1 | - | 2, 4, 5 |
| 4: Serialization | 1 | - | 2, 3, 5 |
| 5: Lifecycle | 1 | - | 2, 3, 4 |
| 6: Robustness (Errors) | 1-5 | - | 7 |
| 7: Robustness (Platform) | 1-5 | - | 6 |
| 8: Integration | 1-7 | - | - |

---

## Troubleshooting Guide

### Common Issues

**Issue:** Fixtures not found
```bash
# Solution: Ensure conftest.py is in correct location
ls scripts/tasks_cli/tests/conftest.py
```

**Issue:** Git operations fail
```bash
# Solution: Ensure GitPython is installed
pip install GitPython
```

**Issue:** Tests pass locally but fail in CI
```bash
# Solution: Check for platform-specific assumptions
pytest -v --collect-only | grep "SKIPPED"
```

**Issue:** Coverage below threshold
```bash
# Solution: Identify uncovered lines
pytest --cov=tasks_cli.context_store --cov-report=term-missing
```

**Issue:** Flaky tests
```bash
# Solution: Run tests multiple times to identify
pytest -v --count=10 test_name
```

---

## Appendix: Quick Reference

### Test File Locations

```
scripts/tasks_cli/tests/
├── conftest.py                              # Session 1
├── fixtures/
│   ├── tasks/*.yaml                         # Session 1
│   ├── standards/*.md                       # Session 1
│   └── qa_outputs/*.txt                     # Session 1
├── test_context_store_cli.py                # Session 2
├── test_context_store_provenance.py         # Session 3
├── test_context_store_serialization.py      # Session 4
├── test_context_store_lifecycle.py          # Session 5
├── test_context_store_robustness_errors.py  # Session 6
├── test_context_store_robustness_platform.py# Session 7
└── test_context_store_integration.py        # Session 8
```

### Test Count Summary

| Session | File | Tests | Priority |
|---------|------|-------|----------|
| 1 | conftest.py | 0 (fixtures only) | 🔴 Critical |
| 2 | test_context_store_cli.py | 20 | 🔴 High |
| 3 | test_context_store_provenance.py | 12 | 🔴 High |
| 4 | test_context_store_serialization.py | 18 | 🔴 High |
| 5 | test_context_store_lifecycle.py | 15 | 🔴 High |
| 6 | test_context_store_robustness_errors.py | 15 | 🟡 Medium |
| 7 | test_context_store_robustness_platform.py | 10 | 🟡 Medium |
| 8 | test_context_store_integration.py | 10 | 🟢 Low |
| **Total** | **8 files** | **~110** | - |

---

**End of Implementation Sessions Guide**
