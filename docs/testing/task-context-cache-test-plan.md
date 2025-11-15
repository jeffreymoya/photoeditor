# Task Context Cache - Comprehensive Test Plan

**Version:** 1.0
**Date:** 2025-11-15
**Status:** Draft
**Related Proposal:** `docs/proposals/task-context-cache.md`
**Implementation:** `scripts/tasks_cli/context_store.py`
**Existing Tests:** `scripts/tasks_cli/tests/test_context_store.py`

---

## Executive Summary

### Current Test Coverage

The task context cache implementation has **57 existing tests** (1,771 lines) with excellent coverage of core functionality:

| Category | Test Count | Coverage Status |
|----------|-----------|-----------------|
| Immutability (frozen dataclasses) | 5 | ✅ Complete |
| Serialization (to_dict/from_dict) | 3 | ✅ Complete |
| Basic operations (init/get/update/purge) | 10 | ✅ Complete |
| Secret scanning | 3 | ✅ Complete |
| Delta tracking & snapshots | 10 | ✅ Complete |
| Text normalization | 5 | ✅ Complete |
| Incremental diffs | 4 | ✅ Complete |
| Drift detection | 7 | ✅ Complete |
| Edge cases (concurrency, atomic writes) | 5 | ✅ Complete |
| **Total** | **57** | **~60% coverage** |

### Gap Analysis

This test plan identifies **18 gap areas** requiring additional test coverage:

#### 🔴 High Priority (10 gaps)
1. CLI integration tests
2. Lifecycle hooks (auto-purge on completion)
3. Staleness detection
4. Drift budget counter
5. Standards citation validation
6. Manifest & provenance tracking
7. Role-scoped exports
8. Compressed evidence artifacts
9. Canonical serialization
10. Scope glob expansion integration

#### 🟡 Medium Priority (5 gaps)
11. Error recovery scenarios
12. Working tree edge cases
13. Incremental diff edge cases
14. Concurrent access patterns
15. Cross-platform compatibility

#### 🟢 Low Priority (3 gaps)
16. Performance stress tests
17. Full workflow integration tests
18. Validation edge cases

### Test Organization

Recommended structure for comprehensive test coverage:

```
scripts/tasks_cli/tests/
  ├── test_context_store_core.py          # Basic operations (existing, retain)
  ├── test_context_store_immutability.py  # Frozen dataclasses (existing, retain)
  ├── test_context_store_delta.py         # Delta tracking (existing, retain)
  ├── test_context_store_drift.py         # Drift detection (existing, retain)
  ├── test_context_store_security.py      # Secret scanning (existing, retain)
  ├── test_context_store_normalization.py # Text normalization (existing, retain)
  ├── test_context_store_cli.py           # NEW: CLI command integration
  ├── test_context_store_lifecycle.py     # NEW: TaskOperations integration
  ├── test_context_store_provenance.py    # NEW: Standards & manifest
  ├── test_context_store_serialization.py # NEW: Role exports, compression
  ├── test_context_store_robustness.py    # NEW: Error recovery, cross-platform
  └── test_context_store_integration.py   # NEW: Full workflow, performance
```

---

## Mock Task File Library

These mock task files serve as test fixtures for various scenarios. Store in `scripts/tasks_cli/tests/fixtures/tasks/`.

### 1. Simple Task (Minimal Fields)

**File:** `fixtures/tasks/TASK-9001-simple.task.yaml`

```yaml
task_id: TASK-9001
title: Simple test task
status: todo
priority: P2
area: backend
description: A minimal task for basic testing

scope:
  in:
    - Test basic context initialization
  out:
    - Complex scenarios

plan:
  - Step 1: Initialize context
  - Step 2: Verify snapshot

acceptance_criteria:
  - criteria: Context created successfully
    standards_ref: N/A

validation:
  commands:
    - cmd: echo "test"
      description: Mock validation

deliverables:
  - description: Test output
    path: test/output.txt
```

### 2. Complex Multi-Tier Task

**File:** `fixtures/tasks/TASK-9002-complex-multitier.task.yaml`

```yaml
task_id: TASK-9002
title: Complex multi-tier refactoring
status: in_progress
priority: P0
area: backend
unblocker: true
description: |
  Comprehensive refactoring spanning backend, mobile, and shared layers.
  Tests citation extraction, multi-tier scope, and complex validation.

scope:
  in:
    - Backend handler refactoring (backend/lambdas/upload/)
    - Mobile upload screen updates (mobile/src/screens/Upload/)
    - Shared contract updates (shared/schemas/upload/)
  out:
    - Infrastructure changes
    - Database migrations

plan:
  - Step 1: Refactor backend handler to use provider pattern
  - Step 2: Update mobile UI to match new contract
  - Step 3: Version shared schema to v2
  - Step 4: Run integration tests
  - Step 5: Update standards documentation

acceptance_criteria:
  - criteria: Handler complexity ≤10
    standards_ref: standards/backend-tier.md#handler-constraints
  - criteria: No AWS SDK imports in handlers
    standards_ref: standards/cross-cutting.md#hard-fail-controls
  - criteria: Contract versioning follows /v{n} pattern
    standards_ref: standards/shared-contracts-tier.md#versioning
  - criteria: 80% line coverage for services
    standards_ref: standards/backend-tier.md#testing-requirements

validation:
  commands:
    - cmd: pnpm turbo run typecheck --filter=@photoeditor/backend
      description: Type check backend
    - cmd: pnpm turbo run lint --filter=@photoeditor/backend
      description: Lint backend
    - cmd: pnpm turbo run test --filter=@photoeditor/backend
      description: Unit tests backend
    - cmd: pnpm turbo run typecheck --filter=photoeditor-mobile
      description: Type check mobile
    - cmd: pnpm turbo run contracts:check --filter=@photoeditor/shared
      description: Validate contracts

deliverables:
  - description: Refactored upload handler
    path: backend/lambdas/upload/handler.ts
  - description: Updated upload screen
    path: mobile/src/screens/Upload/UploadScreen.tsx
  - description: Versioned upload schema
    path: shared/schemas/upload/v2.ts

blocked_by:
  - TASK-9001

notes: |
  This task demonstrates:
  - Multi-tier scope extraction
  - Standards citation parsing with line spans
  - Complex validation baseline
  - Unblocker flag handling
  - Dependency blocking
```

### 3. Task with Unicode and Special Characters

**File:** `fixtures/tasks/TASK-9003-unicode-edge-case.task.yaml`

```yaml
task_id: TASK-9003
title: "Test Unicode: 日本語, Emoji 🎨, Special <>&\""
status: draft
priority: P1
area: shared
description: |
  Edge case testing for Unicode handling in task metadata.
  Contains: Japanese characters (日本語), emoji (🎨📸), XML chars (<>&"), quotes.

scope:
  in:
    - "Files with spaces/special chars: test file.ts"
    - "Path with unicode: shared/日本語/module.ts"
  out:
    - Binary files

plan:
  - "Step 1: Test normalization of 'quoted strings'"
  - 'Step 2: Handle apostrophes in don''t and can''t'
  - "Step 3: Process <XML> & \"special\" chars"

acceptance_criteria:
  - criteria: "All unicode preserved in SHA256 checksums"
    standards_ref: docs/proposals/task-context-cache.md#text-normalization

validation:
  commands:
    - cmd: echo "test unicode: 日本語 🎨"
      description: Unicode validation

deliverables:
  - description: "File with emoji 📸.txt"
    path: "test/unicode/emoji 📸.txt"
```

### 4. Task with Extensive Standards Citations

**File:** `fixtures/tasks/TASK-9004-standards-heavy.task.yaml`

```yaml
task_id: TASK-9004
title: Standards-heavy refactoring task
status: todo
priority: P0
area: backend
description: Task requiring extensive standards validation

scope:
  in:
    - All backend services (backend/services/)
  out:
    - Mobile changes

plan:
  - Step 1: Apply TypeScript standards
  - Step 2: Enforce layering rules
  - Step 3: Add coverage

acceptance_criteria:
  - criteria: Strict TypeScript config enforced
    standards_ref: standards/typescript.md#strict-configuration
  - criteria: No circular dependencies
    standards_ref: standards/cross-cutting.md#hard-fail-controls
  - criteria: Handler complexity ≤10
    standards_ref: standards/backend-tier.md#handler-constraints:L45-L52
  - criteria: Services use neverthrow Results
    standards_ref: standards/typescript.md#error-handling:L120-L145
  - criteria: 80% line coverage, 70% branch coverage
    standards_ref: standards/backend-tier.md#testing-requirements:L200-L210
  - criteria: Zero AWS SDK imports in handlers
    standards_ref: standards/cross-cutting.md#hard-fail-controls:L30-L35
  - criteria: Provider isolation maintained
    standards_ref: standards/backend-tier.md#layering-rules:L15-L25

validation:
  commands:
    - cmd: pnpm turbo run qa:static --filter=@photoeditor/backend
      description: Static analysis
    - cmd: pnpm dlx dependency-cruiser --validate
      description: Dependency validation
    - cmd: pnpm turbo run test:coverage --filter=@photoeditor/backend
      description: Coverage check

deliverables:
  - description: Refactored services
    path: backend/services/
```

### 5. Draft Task (Incomplete)

**File:** `fixtures/tasks/TASK-9005-draft-incomplete.task.yaml`

```yaml
task_id: TASK-9005
title: Draft task with missing fields
status: draft
priority: P2
area: mobile
description: ""  # Empty description - should trigger validation warning

scope:
  in: []  # Empty scope
  out: []

plan: []  # No plan steps

acceptance_criteria: []  # No criteria

validation:
  commands: []

deliverables: []

notes: |
  This task intentionally has minimal content to test:
  - Validation warnings for empty required fields
  - Context initialization with sparse data
  - Graceful handling of missing metadata
```

### 6. Blocked Task with Dependencies

**File:** `fixtures/tasks/TASK-9006-blocked-task.task.yaml`

```yaml
task_id: TASK-9006
title: Blocked task waiting on dependencies
status: blocked
priority: P1
area: backend
description: Task blocked by multiple dependencies

scope:
  in:
    - Backend integration
  out:
    - Frontend changes

plan:
  - Step 1: Wait for TASK-9001 completion
  - Step 2: Wait for TASK-9004 completion
  - Step 3: Integrate both changes

acceptance_criteria:
  - criteria: All dependencies completed
    standards_ref: N/A

validation:
  commands:
    - cmd: echo "blocked"
      description: Placeholder

deliverables:
  - description: Integration layer
    path: backend/integration/

blocked_by:
  - TASK-9001
  - TASK-9004
  - TASK-9999  # Non-existent task (should trigger warning)
```

### 7. Completed Task (For Archive Testing)

**File:** `fixtures/tasks/TASK-9007-completed.task.yaml`

```yaml
task_id: TASK-9007
title: Completed task for archive testing
status: completed
priority: P0
area: shared
description: Task that has been completed and archived

scope:
  in:
    - Shared schema updates
  out:
    - Backend changes

plan:
  - Step 1: Update schema
  - Step 2: Run validation
  - Step 3: Archive task

acceptance_criteria:
  - criteria: Schema validation passes
    standards_ref: standards/shared-contracts-tier.md

validation:
  commands:
    - cmd: pnpm turbo run contracts:check --filter=@photoeditor/shared
      description: Contract validation

deliverables:
  - description: Updated schema
    path: shared/schemas/updated.ts

completion_date: "2025-11-10T14:30:00Z"
completed_by: task-implementer-agent
```

### 8. Task with Large File Scope

**File:** `fixtures/tasks/TASK-9008-large-scope.task.yaml`

```yaml
task_id: TASK-9008
title: Task with extensive file scope
status: todo
priority: P1
area: backend
description: Task covering many files to test performance

scope:
  in:
    - "backend/lambdas/**/*.ts"
    - "backend/services/**/*.ts"
    - "backend/providers/**/*.ts"
    - "backend/libs/**/*.ts"
    - "shared/schemas/**/*.ts"
    - "shared/types/**/*.ts"
  out:
    - mobile/
    - infrastructure/

plan:
  - Step 1: Refactor all backend code
  - Step 2: Update shared types

acceptance_criteria:
  - criteria: All files pass typecheck
    standards_ref: standards/typescript.md

validation:
  commands:
    - cmd: pnpm turbo run typecheck
      description: Full typecheck

deliverables:
  - description: Refactored backend
    path: backend/
```

### 9. Task with Binary Deliverables

**File:** `fixtures/tasks/TASK-9009-binary-files.task.yaml`

```yaml
task_id: TASK-9009
title: Task involving binary files
status: todo
priority: P2
area: mobile
description: Testing binary file handling in context store

scope:
  in:
    - mobile/assets/images/*.png
    - mobile/assets/fonts/*.ttf
  out:
    - Source code changes

plan:
  - Step 1: Update image assets
  - Step 2: Add new font files

acceptance_criteria:
  - criteria: Binary files detected and checksummed
    standards_ref: N/A

validation:
  commands:
    - cmd: file mobile/assets/images/*.png
      description: Verify PNG format

deliverables:
  - description: Updated images
    path: mobile/assets/images/
  - description: New fonts
    path: mobile/assets/fonts/
```

### 10. Task with Validation Baseline

**File:** `fixtures/tasks/TASK-9010-with-baseline.task.yaml`

```yaml
task_id: TASK-9010
title: Task with pre-existing QA baseline
status: in_progress
priority: P0
area: backend
description: Task that has already run validation and has baseline results

scope:
  in:
    - backend/services/upload.ts
  out:
    - Tests

plan:
  - Step 1: Refactor upload service
  - Step 2: Validate against baseline

acceptance_criteria:
  - criteria: No new lint errors
    standards_ref: standards/typescript.md
  - criteria: Coverage maintained
    standards_ref: standards/backend-tier.md

validation:
  commands:
    - cmd: pnpm turbo run lint --filter=@photoeditor/backend
      description: Lint check
      baseline_result: |
        ✓ No lint errors
        0 warnings, 0 errors
    - cmd: pnpm turbo run test:coverage --filter=@photoeditor/backend
      description: Coverage check
      baseline_result: |
        Coverage: 85.2% lines, 75.6% branches
        All thresholds met

deliverables:
  - description: Refactored service
    path: backend/services/upload.ts
```

### 11. Task with Long Wrapped Text

**File:** `fixtures/tasks/TASK-9011-long-text.task.yaml`

```yaml
task_id: TASK-9011
title: Task with very long description for normalization testing
status: todo
priority: P1
area: shared
description: |
  This is an extremely long description that spans multiple lines and contains very long sentences that exceed the 120-character line wrapping threshold used by the text normalization algorithm in the context store implementation which should trigger the word wrapping logic while preserving the semantic meaning of the content and ensuring that bullet points and structured text remain properly formatted throughout the normalization process.

scope:
  in:
    - "This is a very long scope item that describes a complex refactoring effort spanning multiple directories and files with detailed explanation of what exactly is being changed and why it matters for the overall architecture of the system"
  out:
    - Short exclusion

plan:
  - "Step 1: This is a very long plan step that provides extensive detail about the implementation approach including specific function names, file paths, architectural considerations, and expected outcomes that will result from completing this particular step in the overall task workflow"
  - Step 2: Short step

acceptance_criteria:
  - criteria: "This is a very long acceptance criterion that describes in detail the exact conditions that must be met for this task to be considered complete including specific metrics, thresholds, and validation checks"
    standards_ref: standards/typescript.md

validation:
  commands:
    - cmd: echo "test"
      description: Test

deliverables:
  - description: Output
    path: test/
```

### 12. Task with CRLF Line Endings

**File:** `fixtures/tasks/TASK-9012-crlf-endings.task.yaml`

**Note:** This file should be created with CRLF (`\r\n`) line endings to test cross-platform normalization.

```yaml
task_id: TASK-9012
title: Task file with Windows CRLF line endings
status: todo
priority: P2
area: backend
description: |
  Testing cross-platform line ending normalization.
  File contains CRLF (\r\n) instead of LF (\n).

scope:
  in:
    - Backend services
  out:
    - Mobile changes

plan:
  - Step 1: Normalize line endings
  - Step 2: Verify SHA256 consistency

acceptance_criteria:
  - criteria: SHA256 identical across platforms
    standards_ref: docs/proposals/task-context-cache.md#text-normalization

validation:
  commands:
    - cmd: pnpm turbo run test
      description: Tests

deliverables:
  - description: Normalized files
    path: backend/
```

### 13. Task with Glob Patterns in Scope

**File:** `fixtures/tasks/TASK-9013-glob-patterns.task.yaml`

```yaml
task_id: TASK-9013
title: Task using glob patterns and macros in scope
status: todo
priority: P1
area: backend
description: Testing scope glob expansion and macro resolution

scope:
  in:
    - "{{BACKEND_HANDLERS}}"  # Macro expansion
    - "backend/services/**/*.ts"  # Recursive glob
    - "backend/providers/s3/*.ts"  # Single-level glob
    - "shared/schemas/{upload,download}/*.ts"  # Brace expansion
  out:
    - "**/*.test.ts"  # Exclude all tests
    - "**/*.spec.ts"

plan:
  - Step 1: Expand globs to concrete file list
  - Step 2: Deduplicate paths
  - Step 3: Sort deterministically

acceptance_criteria:
  - criteria: All globs resolved to concrete paths
    standards_ref: N/A

validation:
  commands:
    - cmd: echo "test"
      description: Validation

deliverables:
  - description: Refactored files
    path: backend/
```

### 14. Task with Secret Scanning Edge Cases

**File:** `fixtures/tasks/TASK-9014-secrets-test.task.yaml`

```yaml
task_id: TASK-9014
title: Task for testing secret scanning logic
status: todo
priority: P0
area: backend
description: |
  Testing secret detection in task metadata and diffs.

  WARNING: This file contains fake secrets for testing purposes only.
  DO NOT use these in actual code:
  - AWS key: AKIAIOSFODNN7EXAMPLE
  - Stripe key: STRIPE_TEST_KEY_PLACEHOLDER

scope:
  in:
    - backend/config/
  out:
    - Actual credentials

plan:
  - Step 1: Detect secrets in description
  - Step 2: Block context creation unless force=True
  - Step 3: Verify scanning works

acceptance_criteria:
  - criteria: Secrets detected and logged
    standards_ref: docs/proposals/task-context-cache.md#secret-scanning

validation:
  commands:
    - cmd: grep -i "AKIA" .
      description: Find AWS keys

deliverables:
  - description: Config files (sanitized)
    path: backend/config/
```

### 15. Task with Symlinks and Special Files

**File:** `fixtures/tasks/TASK-9015-special-files.task.yaml`

```yaml
task_id: TASK-9015
title: Task involving symlinks and special file types
status: todo
priority: P2
area: infrastructure
description: Testing handling of symlinks, device files, and other special types

scope:
  in:
    - infrastructure/symlink-dir/  # Contains symlinks
    - infrastructure/submodule/  # Git submodule
  out:
    - Regular files

plan:
  - Step 1: Detect symlinks
  - Step 2: Follow or skip based on policy
  - Step 3: Handle submodule changes

acceptance_criteria:
  - criteria: Symlinks handled gracefully
    standards_ref: N/A

validation:
  commands:
    - cmd: find . -type l
      description: List symlinks

deliverables:
  - description: Infrastructure updates
    path: infrastructure/
```

---

## Test Suite 1: CLI Integration

**Priority:** 🔴 High
**File:** `tests/test_context_store_cli.py`
**Gap ID:** GAP-CLI

### Test Scenarios

#### 1.1 `--init-context` Command

**Test:** `test_cli_init_context_success`

```python
def test_cli_init_context_success(tmp_path, mock_task_file, mock_repo):
    """Test --init-context creates context successfully."""
    result = subprocess.run(
        ["python", "-m", "tasks_cli", "--init-context", str(mock_task_file)],
        cwd=tmp_path,
        capture_output=True,
        text=True
    )

    assert result.returncode == 0
    assert "Context initialized" in result.stdout

    # Verify context directory created
    context_dir = tmp_path / "tasks/.context/TASK-9001"
    assert context_dir.exists()
    assert (context_dir / "context.json").exists()
```

**Test:** `test_cli_init_context_duplicate_error`

```python
def test_cli_init_context_duplicate_error(tmp_path, mock_task_file):
    """Test --init-context fails if context already exists."""
    # Initialize once
    subprocess.run(["python", "-m", "tasks_cli", "--init-context", str(mock_task_file)])

    # Try again
    result = subprocess.run(
        ["python", "-m", "tasks_cli", "--init-context", str(mock_task_file)],
        capture_output=True,
        text=True
    )

    assert result.returncode != 0
    assert "already exists" in result.stderr
```

**Test:** `test_cli_init_context_dirty_worktree_warning`

```python
def test_cli_init_context_dirty_worktree_warning(tmp_path, mock_task_file, mock_dirty_repo):
    """Test --init-context warns about dirty working tree."""
    result = subprocess.run(
        ["python", "-m", "tasks_cli", "--init-context", str(mock_task_file)],
        capture_output=True,
        text=True
    )

    assert result.returncode == 0
    assert "WARNING" in result.stderr
    assert "dirty working tree" in result.stderr.lower()
```

#### 1.2 `--get-context` Command

**Test:** `test_cli_get_context_json_output`

```python
def test_cli_get_context_json_output(tmp_path, initialized_context):
    """Test --get-context returns valid JSON."""
    result = subprocess.run(
        ["python", "-m", "tasks_cli", "--get-context", "TASK-9001", "--format", "json"],
        cwd=tmp_path,
        capture_output=True,
        text=True
    )

    assert result.returncode == 0
    data = json.loads(result.stdout)

    assert data["snapshot"]["task_id"] == "TASK-9001"
    assert "git_head" in data
    assert "standards_citations" in data
```

**Test:** `test_cli_get_context_not_found`

```python
def test_cli_get_context_not_found(tmp_path):
    """Test --get-context returns error for missing context."""
    result = subprocess.run(
        ["python", "-m", "tasks_cli", "--get-context", "TASK-9999"],
        capture_output=True,
        text=True
    )

    assert result.returncode != 0
    assert "not found" in result.stderr.lower()
```

#### 1.3 `--update-agent` Command

**Test:** `test_cli_update_agent_status`

```python
def test_cli_update_agent_status(tmp_path, initialized_context):
    """Test --update-agent updates coordination state."""
    result = subprocess.run([
        "python", "-m", "tasks_cli",
        "--update-agent", "TASK-9001",
        "--agent", "implementer",
        "--status", "in_progress",
        "--note", "Starting implementation"
    ], cwd=tmp_path, capture_output=True, text=True)

    assert result.returncode == 0

    # Verify update
    context = get_context("TASK-9001")
    assert context.coordination.implementer.status == "in_progress"
    assert "Starting implementation" in context.coordination.implementer.notes
```

#### 1.4 `--snapshot-worktree` Command

**Test:** `test_cli_snapshot_worktree_creates_diff`

```python
def test_cli_snapshot_worktree_creates_diff(tmp_path, initialized_context, modified_files):
    """Test --snapshot-worktree creates diff artifacts."""
    result = subprocess.run([
        "python", "-m", "tasks_cli",
        "--snapshot-worktree", "TASK-9001",
        "--agent", "implementer"
    ], cwd=tmp_path, capture_output=True, text=True)

    assert result.returncode == 0

    # Verify diff files
    context_dir = tmp_path / "tasks/.context/TASK-9001"
    assert (context_dir / "diff-implementer-cumulative.patch").exists()
    assert (context_dir / "worktree-implementer.json").exists()
```

**Test:** `test_cli_snapshot_worktree_clean_tree`

```python
def test_cli_snapshot_worktree_clean_tree(tmp_path, initialized_context):
    """Test --snapshot-worktree with no changes."""
    result = subprocess.run([
        "python", "-m", "tasks_cli",
        "--snapshot-worktree", "TASK-9001",
        "--agent", "implementer"
    ], cwd=tmp_path, capture_output=True, text=True)

    assert result.returncode == 0
    assert "No changes" in result.stdout or result.returncode == 0
```

#### 1.5 `--verify-worktree` Command

**Test:** `test_cli_verify_worktree_no_drift`

```python
def test_cli_verify_worktree_no_drift(tmp_path, initialized_context_with_snapshot):
    """Test --verify-worktree succeeds when no drift."""
    result = subprocess.run([
        "python", "-m", "tasks_cli",
        "--verify-worktree", "TASK-9001",
        "--agent", "reviewer"
    ], cwd=tmp_path, capture_output=True, text=True)

    assert result.returncode == 0
    assert "No drift detected" in result.stdout
```

**Test:** `test_cli_verify_worktree_detects_drift`

```python
def test_cli_verify_worktree_detects_drift(tmp_path, initialized_context_with_snapshot, manual_file_edit):
    """Test --verify-worktree detects manual edits."""
    result = subprocess.run([
        "python", "-m", "tasks_cli",
        "--verify-worktree", "TASK-9001",
        "--agent", "reviewer"
    ], cwd=tmp_path, capture_output=True, text=True)

    assert result.returncode != 0
    assert "drift detected" in result.stderr.lower()
    assert manual_file_edit.name in result.stderr
```

#### 1.6 `--get-diff` Command

**Test:** `test_cli_get_diff_cumulative`

```python
def test_cli_get_diff_cumulative(tmp_path, initialized_context_with_diffs):
    """Test --get-diff retrieves cumulative diff."""
    result = subprocess.run([
        "python", "-m", "tasks_cli",
        "--get-diff", "TASK-9001",
        "--agent", "implementer",
        "--type", "cumulative"
    ], cwd=tmp_path, capture_output=True, text=True)

    assert result.returncode == 0
    assert "diff --git" in result.stdout
    assert "@@" in result.stdout  # Diff hunk marker
```

**Test:** `test_cli_get_diff_incremental`

```python
def test_cli_get_diff_incremental(tmp_path, initialized_context_with_reviewer_changes):
    """Test --get-diff retrieves incremental diff (reviewer changes only)."""
    result = subprocess.run([
        "python", "-m", "tasks_cli",
        "--get-diff", "TASK-9001",
        "--agent", "reviewer",
        "--type", "incremental"
    ], cwd=tmp_path, capture_output=True, text=True)

    assert result.returncode == 0
    # Should only show reviewer's changes, not implementer's
```

#### 1.7 `--record-qa` Command

**Test:** `test_cli_record_qa_result`

```python
def test_cli_record_qa_result(tmp_path, initialized_context):
    """Test --record-qa updates validation baseline."""
    result = subprocess.run([
        "python", "-m", "tasks_cli",
        "--record-qa", "TASK-9001",
        "--agent", "validator",
        "--command", "pnpm turbo run test",
        "--result", "PASS",
        "--output", "All tests passed (42 total)"
    ], cwd=tmp_path, capture_output=True, text=True)

    assert result.returncode == 0

    context = get_context("TASK-9001")
    assert any(
        log.command == "pnpm turbo run test" and log.result == "PASS"
        for log in context.coordination.validator.qa_logs
    )
```

#### 1.8 `--purge-context` Command

**Test:** `test_cli_purge_context_success`

```python
def test_cli_purge_context_success(tmp_path, initialized_context):
    """Test --purge-context deletes context directory."""
    context_dir = tmp_path / "tasks/.context/TASK-9001"
    assert context_dir.exists()

    result = subprocess.run([
        "python", "-m", "tasks_cli",
        "--purge-context", "TASK-9001"
    ], cwd=tmp_path, capture_output=True, text=True)

    assert result.returncode == 0
    assert not context_dir.exists()
```

**Test:** `test_cli_purge_context_idempotent`

```python
def test_cli_purge_context_idempotent(tmp_path):
    """Test --purge-context is idempotent (no error if already gone)."""
    result = subprocess.run([
        "python", "-m", "tasks_cli",
        "--purge-context", "TASK-9001"
    ], cwd=tmp_path, capture_output=True, text=True)

    # Should succeed even if context doesn't exist
    assert result.returncode == 0
```

#### 1.9 Error Handling

**Test:** `test_cli_invalid_task_id_format`

```python
def test_cli_invalid_task_id_format(tmp_path):
    """Test CLI rejects malformed task IDs."""
    result = subprocess.run([
        "python", "-m", "tasks_cli",
        "--get-context", "invalid-id"
    ], capture_output=True, text=True)

    assert result.returncode != 0
    assert "invalid task id" in result.stderr.lower()
```

**Test:** `test_cli_missing_required_args`

```python
def test_cli_missing_required_args(tmp_path):
    """Test CLI reports missing required arguments."""
    result = subprocess.run([
        "python", "-m", "tasks_cli",
        "--update-agent"  # Missing task_id, agent, status
    ], capture_output=True, text=True)

    assert result.returncode != 0
    assert "required" in result.stderr.lower()
```

**Test:** `test_cli_json_output_format_all_commands`

```python
@pytest.mark.parametrize("command,args", [
    ("--get-context", ["TASK-9001"]),
    ("--get-diff", ["TASK-9001", "--agent", "implementer", "--type", "cumulative"]),
])
def test_cli_json_output_format_all_commands(tmp_path, initialized_context, command, args):
    """Test --format json works for all applicable commands."""
    result = subprocess.run([
        "python", "-m", "tasks_cli",
        command, *args, "--format", "json"
    ], cwd=tmp_path, capture_output=True, text=True)

    assert result.returncode == 0
    # Should be valid JSON
    data = json.loads(result.stdout)
    assert isinstance(data, dict)
```

---

## Test Suite 2: Lifecycle & Coordination

**Priority:** 🔴 High
**File:** `tests/test_context_store_lifecycle.py`
**Gap IDs:** GAP-LIFECYCLE, GAP-STALE, GAP-DRIFT

### Test Scenarios

#### 2.1 Auto-Purge on Task Completion (GAP-LIFECYCLE)

**Test:** `test_auto_purge_on_task_completion`

```python
def test_auto_purge_on_task_completion(tmp_path, initialized_context):
    """Test context auto-purges when task completes."""
    from tasks_cli.task_operations import TaskOperations

    context_dir = tmp_path / "tasks/.context/TASK-9001"
    assert context_dir.exists()

    # Complete task
    ops = TaskOperations(tmp_path)
    ops.complete_task("tasks/TASK-9001-simple.task.yaml")

    # Context should be purged
    assert not context_dir.exists()
```

**Test:** `test_purge_error_logs_but_does_not_block_completion`

```python
def test_purge_error_logs_but_does_not_block_completion(tmp_path, initialized_context, monkeypatch):
    """Test purge errors are non-fatal during task completion."""
    from tasks_cli.task_operations import TaskOperations

    # Make purge fail
    def mock_purge_failure(task_id):
        raise PermissionError("Cannot delete context")

    monkeypatch.setattr("tasks_cli.context_store.purge_context", mock_purge_failure)

    # Should still complete successfully
    ops = TaskOperations(tmp_path)
    ops.complete_task("tasks/TASK-9001-simple.task.yaml")

    # Task should be marked completed
    task = ops.get_task("TASK-9001")
    assert task.status == "completed"
```

**Test:** `test_purge_idempotency_across_multiple_completions`

```python
def test_purge_idempotency_across_multiple_completions(tmp_path, initialized_context):
    """Test multiple completion calls don't error on missing context."""
    from tasks_cli.task_operations import TaskOperations

    ops = TaskOperations(tmp_path)

    # Complete once
    ops.complete_task("tasks/TASK-9001-simple.task.yaml")

    # Complete again (shouldn't error)
    ops.complete_task("tasks/TASK-9001-simple.task.yaml")

    # Should succeed both times
```

#### 2.2 Staleness Detection (GAP-STALE)

**Test:** `test_staleness_warning_when_git_head_changed`

```python
def test_staleness_warning_when_git_head_changed(tmp_path, initialized_context, mock_repo, caplog):
    """Test warning logged when git HEAD has changed since context init."""
    # Make a new commit
    mock_repo.index.commit("New commit after context init")

    # Get context
    context = get_context("TASK-9001")

    # Should log warning
    assert any(
        "stale" in record.message.lower() and "git_head" in record.message.lower()
        for record in caplog.records
    )
```

**Test:** `test_no_staleness_warning_when_head_matches`

```python
def test_no_staleness_warning_when_head_matches(tmp_path, initialized_context, caplog):
    """Test no warning when HEAD hasn't changed."""
    context = get_context("TASK-9001")

    # Should NOT log staleness warning
    assert not any(
        "stale" in record.message.lower()
        for record in caplog.records
    )
```

**Test:** `test_no_staleness_check_outside_git_repo`

```python
def test_no_staleness_check_outside_git_repo(tmp_path, initialized_context_non_git):
    """Test staleness check skipped when not in git repo."""
    # Should not raise error
    context = get_context("TASK-9001")
    assert context is not None
```

**Test:** `test_staleness_does_not_block_operations`

```python
def test_staleness_does_not_block_operations(tmp_path, initialized_context, mock_repo):
    """Test staleness warning doesn't prevent context operations."""
    # Make context stale
    mock_repo.index.commit("New commit")

    # Should still allow updates
    update_coordination("TASK-9001", agent="implementer", status="in_progress")

    context = get_context("TASK-9001")
    assert context.coordination.implementer.status == "in_progress"
```

#### 2.3 Drift Budget Counter (GAP-DRIFT)

**Test:** `test_drift_budget_increments_on_verification_failure`

```python
def test_drift_budget_increments_on_verification_failure(tmp_path, initialized_context_with_snapshot, manual_file_edit):
    """Test drift_budget increments when drift detected."""
    # Verify worktree (should detect drift)
    try:
        verify_worktree_state("TASK-9001", agent="reviewer")
    except DriftDetectedError:
        pass

    context = get_context("TASK-9001")
    assert context.coordination.drift_budget == 1
```

**Test:** `test_drift_budget_blocks_state_changing_operations`

```python
def test_drift_budget_blocks_state_changing_operations(tmp_path, initialized_context_with_drift):
    """Test drift_budget > 0 prevents snapshot/update operations."""
    context = get_context("TASK-9001")
    assert context.coordination.drift_budget > 0

    # Should block snapshot
    with pytest.raises(DriftBudgetExceededError):
        snapshot_worktree("TASK-9001", agent="reviewer")

    # Should block updates
    with pytest.raises(DriftBudgetExceededError):
        update_coordination("TASK-9001", agent="reviewer", status="completed")
```

**Test:** `test_drift_budget_read_operations_still_allowed`

```python
def test_drift_budget_read_operations_still_allowed(tmp_path, initialized_context_with_drift):
    """Test drift_budget doesn't block read-only operations."""
    context = get_context("TASK-9001")
    assert context.coordination.drift_budget > 0

    # Should still allow reads
    context_again = get_context("TASK-9001")
    assert context_again is not None
```

**Test:** `test_resolve_drift_resets_budget`

```python
def test_resolve_drift_resets_budget(tmp_path, initialized_context_with_drift):
    """Test --resolve-drift CLI resets drift_budget."""
    result = subprocess.run([
        "python", "-m", "tasks_cli",
        "--resolve-drift", "TASK-9001",
        "--note", "Manual files committed separately"
    ], cwd=tmp_path, capture_output=True, text=True)

    assert result.returncode == 0

    context = get_context("TASK-9001")
    assert context.coordination.drift_budget == 0
    assert "Manual files committed separately" in context.coordination.operator_notes
```

**Test:** `test_drift_budget_persists_across_reads`

```python
def test_drift_budget_persists_across_reads(tmp_path, initialized_context_with_drift):
    """Test drift_budget value persists in mutable coordination state."""
    context1 = get_context("TASK-9001")
    budget_before = context1.coordination.drift_budget

    # Read again
    context2 = get_context("TASK-9001")
    assert context2.coordination.drift_budget == budget_before
```

#### 2.4 Agent Coordination State

**Test:** `test_multiple_agents_coordination_updates`

```python
def test_multiple_agents_coordination_updates(tmp_path, initialized_context):
    """Test coordination state tracks all three agents independently."""
    # Implementer starts
    update_coordination("TASK-9001", agent="implementer", status="in_progress")

    # Implementer completes
    update_coordination("TASK-9001", agent="implementer", status="completed",
                        note="Implementation done")

    # Reviewer starts
    update_coordination("TASK-9001", agent="reviewer", status="in_progress")

    context = get_context("TASK-9001")
    assert context.coordination.implementer.status == "completed"
    assert context.coordination.reviewer.status == "in_progress"
    assert context.coordination.validator.status == "pending"
```

**Test:** `test_coordination_timestamps_recorded`

```python
def test_coordination_timestamps_recorded(tmp_path, initialized_context):
    """Test coordination updates include timestamps."""
    import time

    before = time.time()
    update_coordination("TASK-9001", agent="implementer", status="in_progress")
    after = time.time()

    context = get_context("TASK-9001")
    updated_at = context.coordination.implementer.updated_at

    assert before <= updated_at <= after
```

---

## Test Suite 3: Standards & Provenance

**Priority:** 🔴 High
**File:** `tests/test_context_store_provenance.py`
**Gap IDs:** GAP-STANDARDS, GAP-MANIFEST

### Test Scenarios

#### 3.1 Standards Citation Validation (GAP-STANDARDS)

**Test:** `test_citation_content_sha_mismatch_forces_rebuild`

```python
def test_citation_content_sha_mismatch_forces_rebuild(tmp_path, initialized_context, modified_standards_file):
    """Test context rebuild triggered when citation content_sha doesn't match."""
    # Modify standards file
    standards_file = tmp_path / "standards/backend-tier.md"
    with open(standards_file, "a") as f:
        f.write("\n## New Section\nContent changed\n")

    # Try to get context
    with pytest.raises(CitationMismatchError) as exc_info:
        context = get_context("TASK-9001", validate_citations=True)

    assert "content_sha mismatch" in str(exc_info.value)
    assert "backend-tier.md" in str(exc_info.value)
```

**Test:** `test_missing_citation_file_handled_gracefully`

```python
def test_missing_citation_file_handled_gracefully(tmp_path, initialized_context):
    """Test graceful handling when cited standards file is deleted."""
    # Delete standards file
    standards_file = tmp_path / "standards/backend-tier.md"
    standards_file.unlink()

    with pytest.raises(CitationMissingError) as exc_info:
        context = get_context("TASK-9001", validate_citations=True)

    assert "not found" in str(exc_info.value)
    assert "backend-tier.md" in str(exc_info.value)
```

**Test:** `test_citation_line_span_extraction`

```python
def test_citation_line_span_extraction(tmp_path, mock_task_with_line_spans):
    """Test line span extraction from standards files."""
    # Task references: standards/backend-tier.md#handler-constraints:L45-L52

    init_context(mock_task_with_line_spans)
    context = get_context("TASK-9004")

    citation = next(
        c for c in context.standards_citations
        if "handler-constraints" in c.section
    )

    assert citation.line_start == 45
    assert citation.line_end == 52
    assert "Complexity ≤10" in citation.content  # Content from those lines
```

**Test:** `test_citation_without_line_span_uses_full_section`

```python
def test_citation_without_line_span_uses_full_section(tmp_path, mock_task_simple_ref):
    """Test citation without :L45-L52 captures entire section."""
    # Task references: standards/typescript.md#strict-configuration

    init_context(mock_task_simple_ref)
    context = get_context("TASK-9004")

    citation = next(
        c for c in context.standards_citations
        if "strict-configuration" in c.section
    )

    assert citation.line_start is None
    assert citation.line_end is None
    assert len(citation.content) > 100  # Full section content
```

**Test:** `test_task_specific_citation_overrides`

```python
def test_task_specific_citation_overrides(tmp_path, mock_task_with_overrides):
    """Test task can override default citation extraction."""
    # Task has custom citation in metadata
    init_context(mock_task_with_overrides)
    context = get_context("TASK-9004")

    # Should use task-provided citation text instead of extracting
    citation = next(
        c for c in context.standards_citations
        if c.override
    )

    assert citation.content == "Custom citation text from task"
```

**Test:** `test_citation_deduplication`

```python
def test_citation_deduplication(tmp_path, mock_task_duplicate_refs):
    """Test duplicate standards refs are deduplicated."""
    # Task references same file:section multiple times
    init_context(mock_task_duplicate_refs)
    context = get_context("TASK-9004")

    # Should only have one citation per unique file:section
    citations = [f"{c.file_path}:{c.section}" for c in context.standards_citations]
    assert len(citations) == len(set(citations))  # No duplicates
```

#### 3.2 Manifest & Provenance (GAP-MANIFEST)

**Test:** `test_get_manifest_returns_none_if_not_found`

```python
def test_get_manifest_returns_none_if_not_found(tmp_path):
    """Test get_manifest returns None when manifest doesn't exist."""
    manifest = get_manifest("TASK-9999")
    assert manifest is None
```

**Test:** `test_manifest_lists_all_source_files_with_shas`

```python
def test_manifest_lists_all_source_files_with_shas(tmp_path, initialized_context):
    """Test manifest includes all source files used to build context."""
    manifest = get_manifest("TASK-9001")

    assert manifest is not None
    assert "task_file" in manifest.sources
    assert manifest.sources["task_file"]["path"] == "tasks/TASK-9001-simple.task.yaml"
    assert "sha256" in manifest.sources["task_file"]

    # Should include standards citations
    assert len(manifest.sources["standards"]) > 0
    for std_file in manifest.sources["standards"]:
        assert "path" in std_file
        assert "sha256" in std_file
```

**Test:** `test_normalization_version_stamped_in_manifest`

```python
def test_normalization_version_stamped_in_manifest(tmp_path, initialized_context):
    """Test manifest records normalization version for regeneration."""
    manifest = get_manifest("TASK-9001")

    assert manifest.normalization_version == "1.0"  # Current version
```

**Test:** `test_manifest_regeneration_after_standards_change`

```python
def test_manifest_regeneration_after_standards_change(tmp_path, initialized_context):
    """Test context can be regenerated from manifest after standards update."""
    # Get original context
    context_before = get_context("TASK-9001")

    # Modify standards file
    standards_file = tmp_path / "standards/backend-tier.md"
    with open(standards_file, "a") as f:
        f.write("\n## Updated Section\n")

    # Regenerate context from manifest
    regenerate_context_from_manifest("TASK-9001")

    # Should have new context with updated standards
    context_after = get_context("TASK-9001")

    # Task snapshot should be identical
    assert context_before.snapshot == context_after.snapshot

    # Standards citations should be updated
    assert context_before.standards_citations != context_after.standards_citations
```

**Test:** `test_manifest_tracks_config_files`

```python
def test_manifest_tracks_config_files(tmp_path, initialized_context):
    """Test manifest includes macro config and other dependencies."""
    manifest = get_manifest("TASK-9001")

    # Should include scope macro config if used
    if manifest.sources.get("scope_macros"):
        assert "path" in manifest.sources["scope_macros"]
        assert "sha256" in manifest.sources["scope_macros"]
```

**Test:** `test_manifest_derivative_files_sha_included`

```python
def test_manifest_derivative_files_sha_included(tmp_path, initialized_context_with_exports):
    """Test manifest includes SHAs of role-scoped export files."""
    manifest = get_manifest("TASK-9001")

    assert "exports" in manifest.derivatives
    assert "context-implementer.json" in manifest.derivatives["exports"]
    assert "sha256" in manifest.derivatives["exports"]["context-implementer.json"]
```

---

## Test Suite 4: Role-Scoped Exports & Compression

**Priority:** 🔴 High
**File:** `tests/test_context_store_serialization.py`
**Gap IDs:** GAP-ROLES, GAP-COMPRESSION, GAP-SERIALIZATION

### Test Scenarios

#### 4.1 Role-Scoped Exports (GAP-ROLES)

**Test:** `test_implementer_export_omits_reviewer_validator_data`

```python
def test_implementer_export_omits_reviewer_validator_data(tmp_path, initialized_context):
    """Test context-implementer.json excludes reviewer/validator data."""
    export_role_context("TASK-9001", role="implementer")

    export_file = tmp_path / "tasks/.context/TASK-9001/context-implementer.json"
    assert export_file.exists()

    with open(export_file) as f:
        data = json.load(f)

    # Should have snapshot and implementer coordination
    assert "snapshot" in data
    assert "coordination" in data
    assert data["coordination"]["implementer"]["status"] is not None

    # Should NOT have reviewer/validator data
    assert "reviewer" not in data["coordination"] or data["coordination"]["reviewer"] == {}
    assert "validator" not in data["coordination"] or data["coordination"]["validator"] == {}

    # Should NOT have QA baseline
    assert "validation_baseline" not in data
```

**Test:** `test_reviewer_export_omits_qa_baselines`

```python
def test_reviewer_export_omits_qa_baselines(tmp_path, initialized_context_with_baseline):
    """Test context-reviewer.json omits validation baseline data."""
    export_role_context("TASK-9001", role="reviewer")

    export_file = tmp_path / "tasks/.context/TASK-9001/context-reviewer.json"
    with open(export_file) as f:
        data = json.load(f)

    # Should have snapshot, implementer, and reviewer coordination
    assert "snapshot" in data
    assert "coordination" in data
    assert data["coordination"]["implementer"]["status"] is not None
    assert data["coordination"]["reviewer"]["status"] is not None

    # Should NOT have detailed QA baseline
    assert "validation_baseline" not in data or data["validation_baseline"] == {}
```

**Test:** `test_validator_export_includes_all_data`

```python
def test_validator_export_includes_all_data(tmp_path, initialized_context_with_baseline):
    """Test context-validator.json includes complete validation data."""
    export_role_context("TASK-9001", role="validator")

    export_file = tmp_path / "tasks/.context/TASK-9001/context-validator.json"
    with open(export_file) as f:
        data = json.load(f)

    # Should have everything
    assert "snapshot" in data
    assert "coordination" in data
    assert "validation_baseline" in data
    assert len(data["validation_baseline"]["commands"]) > 0
    assert "standards_citations" in data
```

**Test:** `test_role_export_files_tracked_in_manifest`

```python
def test_role_export_files_tracked_in_manifest(tmp_path, initialized_context):
    """Test role export files are tracked in manifest as derivatives."""
    export_role_context("TASK-9001", role="implementer")
    export_role_context("TASK-9001", role="reviewer")
    export_role_context("TASK-9001", role="validator")

    manifest = get_manifest("TASK-9001")

    assert "context-implementer.json" in manifest.derivatives["exports"]
    assert "context-reviewer.json" in manifest.derivatives["exports"]
    assert "context-validator.json" in manifest.derivatives["exports"]
```

#### 4.2 Compressed Evidence (GAP-COMPRESSION)

**Test:** `test_large_diffs_compressed_on_write`

```python
def test_large_diffs_compressed_on_write(tmp_path, initialized_context, large_file_changes):
    """Test diff artifacts >1MB are gzipped."""
    snapshot_worktree("TASK-9001", agent="implementer")

    diff_file = tmp_path / "tasks/.context/TASK-9001/diff-implementer-cumulative.patch.gz"
    assert diff_file.exists()

    # Should be gzipped
    with gzip.open(diff_file, "rt") as f:
        content = f.read()

    assert "diff --git" in content
```

**Test:** `test_small_diffs_not_compressed`

```python
def test_small_diffs_not_compressed(tmp_path, initialized_context, small_file_change):
    """Test diff artifacts <1MB stored uncompressed."""
    snapshot_worktree("TASK-9001", agent="implementer")

    diff_file = tmp_path / "tasks/.context/TASK-9001/diff-implementer-cumulative.patch"
    assert diff_file.exists()

    # Should be plain text
    with open(diff_file) as f:
        content = f.read()

    assert "diff --git" in content
```

**Test:** `test_large_qa_logs_compressed`

```python
def test_large_qa_logs_compressed(tmp_path, initialized_context):
    """Test QA command output >100KB is compressed."""
    # Record large QA output
    large_output = "x" * (200 * 1024)  # 200KB
    record_qa_result("TASK-9001", agent="validator",
                     command="pnpm test", result="PASS", output=large_output)

    context = get_context("TASK-9001")
    qa_log = context.coordination.validator.qa_logs[0]

    # Output should reference compressed artifact
    assert qa_log.output_ref.startswith("artifact://")
    assert qa_log.output_ref.endswith(".gz")

    # Can decompress
    artifact_id = qa_log.output_ref.replace("artifact://", "")
    decompressed = get_artifact("TASK-9001", artifact_id)
    assert decompressed == large_output
```

**Test:** `test_artifacts_referenced_by_short_id`

```python
def test_artifacts_referenced_by_short_id(tmp_path, initialized_context_with_artifacts):
    """Test artifacts use short SHA IDs in references."""
    context = get_context("TASK-9001")

    # Check artifact references
    for qa_log in context.coordination.validator.qa_logs:
        if qa_log.output_ref:
            assert qa_log.output_ref.startswith("artifact://")
            artifact_id = qa_log.output_ref.replace("artifact://", "")
            # Should be short hash (8-12 chars) + optional .gz extension
            assert len(artifact_id.replace(".gz", "")) <= 12
```

**Test:** `test_decompression_on_artifact_read`

```python
def test_decompression_on_artifact_read(tmp_path, initialized_context_with_compressed_artifact):
    """Test artifacts automatically decompressed on read."""
    artifact_id = "abc123.gz"

    content = get_artifact("TASK-9001", artifact_id)

    # Should be decompressed
    assert isinstance(content, str)
    assert len(content) > 0
```

#### 4.3 Canonical Serialization (GAP-SERIALIZATION)

**Test:** `test_json_keys_sorted_deterministically`

```python
def test_json_keys_sorted_deterministically(tmp_path, initialized_context):
    """Test JSON keys are always sorted for deterministic SHAs."""
    context_file = tmp_path / "tasks/.context/TASK-9001/context.json"

    with open(context_file) as f:
        content = f.read()

    # Parse and verify keys are sorted
    data = json.loads(content)
    keys = list(data.keys())
    assert keys == sorted(keys)

    # Nested objects should also have sorted keys
    if "coordination" in data:
        coord_keys = list(data["coordination"].keys())
        assert coord_keys == sorted(coord_keys)
```

**Test:** `test_utf8_encoding_preserved`

```python
def test_utf8_encoding_preserved(tmp_path, mock_task_unicode):
    """Test UTF-8 characters preserved in JSON serialization."""
    init_context(mock_task_unicode)

    context_file = tmp_path / "tasks/.context/TASK-9003/context.json"
    with open(context_file, encoding="utf-8") as f:
        data = json.load(f)

    # Should preserve Unicode
    assert "日本語" in data["snapshot"]["title"]
    assert "🎨" in data["snapshot"]["title"]
```

**Test:** `test_trailing_newline_convention`

```python
def test_trailing_newline_convention(tmp_path, initialized_context):
    """Test JSON files end with single newline."""
    context_file = tmp_path / "tasks/.context/TASK-9001/context.json"

    with open(context_file, "rb") as f:
        content = f.read()

    # Should end with \n
    assert content.endswith(b"\n")
    # Should NOT end with multiple newlines
    assert not content.endswith(b"\n\n")
```

**Test:** `test_serializer_version_stamped`

```python
def test_serializer_version_stamped(tmp_path, initialized_context):
    """Test serializer version recorded in manifest."""
    manifest = get_manifest("TASK-9001")

    assert "serializer_version" in manifest.metadata
    assert manifest.metadata["serializer_version"] == "1.0"
```

**Test:** `test_float_precision_consistent`

```python
def test_float_precision_consistent(tmp_path, initialized_context):
    """Test floating point numbers serialized with consistent precision."""
    # Add timestamp
    update_coordination("TASK-9001", agent="implementer", status="in_progress")

    context_file = tmp_path / "tasks/.context/TASK-9001/context.json"
    with open(context_file) as f:
        content = f.read()

    # Timestamps should have consistent decimal places (none for Unix epoch)
    import re
    timestamps = re.findall(r'"updated_at":\s*(\d+\.?\d*)', content)
    for ts in timestamps:
        if "." in ts:
            decimals = len(ts.split(".")[1])
            assert decimals <= 3  # Max 3 decimal places
```

---

## Test Suite 5: Robustness & Error Recovery

**Priority:** 🟡 Medium
**File:** `tests/test_context_store_robustness.py`
**Gaps:** Error Recovery, Working Tree Edge Cases, Cross-Platform

### Test Scenarios

#### 5.1 Error Recovery

**Test:** `test_lock_timeout_retry_behavior`

```python
def test_lock_timeout_retry_behavior(tmp_path, initialized_context, mock_lock_contention):
    """Test file lock acquisition retries on timeout."""
    import threading
    import time

    # Hold lock in another thread
    lock_file = tmp_path / "tasks/.context/TASK-9001/.context.lock"

    def hold_lock():
        with FileLock(lock_file, timeout=5):
            time.sleep(2)

    thread = threading.Thread(target=hold_lock)
    thread.start()

    time.sleep(0.5)  # Ensure lock is held

    # Should retry and eventually succeed
    start = time.time()
    update_coordination("TASK-9001", agent="implementer", status="in_progress")
    elapsed = time.time() - start

    assert elapsed >= 2  # Had to wait for lock
    thread.join()
```

**Test:** `test_stale_lockfile_cleanup`

```python
def test_stale_lockfile_cleanup(tmp_path, initialized_context):
    """Test stale lockfiles from crashes are cleaned up."""
    lock_file = tmp_path / "tasks/.context/TASK-9001/.context.lock"

    # Create stale lock (>1 hour old)
    lock_file.touch()
    os.utime(lock_file, (time.time() - 7200, time.time() - 7200))

    # Should clean up stale lock and proceed
    update_coordination("TASK-9001", agent="implementer", status="in_progress")

    # Operation should succeed
    context = get_context("TASK-9001")
    assert context.coordination.implementer.status == "in_progress"
```

**Test:** `test_corrupted_json_recovery`

```python
def test_corrupted_json_recovery(tmp_path, initialized_context):
    """Test graceful handling of corrupted context.json."""
    context_file = tmp_path / "tasks/.context/TASK-9001/context.json"

    # Corrupt the file
    with open(context_file, "w") as f:
        f.write("{ corrupted json ")

    with pytest.raises(ContextCorruptedError) as exc_info:
        get_context("TASK-9001")

    assert "corrupted" in str(exc_info.value).lower()
    assert "TASK-9001" in str(exc_info.value)
```

**Test:** `test_missing_context_directory_auto_created`

```python
def test_missing_context_directory_auto_created(tmp_path):
    """Test .context directory created if missing."""
    context_root = tmp_path / "tasks/.context"
    assert not context_root.exists()

    # Should create directory
    init_context("tasks/TASK-9001-simple.task.yaml")

    assert context_root.exists()
    assert (context_root / "TASK-9001").exists()
```

**Test:** `test_permission_error_on_write`

```python
def test_permission_error_on_write(tmp_path, initialized_context, monkeypatch):
    """Test permission errors are surfaced clearly."""
    context_file = tmp_path / "tasks/.context/TASK-9001/context.json"

    # Make file read-only
    os.chmod(context_file, 0o444)

    with pytest.raises(PermissionError):
        update_coordination("TASK-9001", agent="implementer", status="in_progress")

    # Cleanup
    os.chmod(context_file, 0o644)
```

**Test:** `test_disk_full_error_handling`

```python
def test_disk_full_error_handling(tmp_path, initialized_context, monkeypatch):
    """Test graceful handling when disk is full."""
    def mock_write_fail(*args, **kwargs):
        raise OSError(28, "No space left on device")

    monkeypatch.setattr("builtins.open", mock_write_fail)

    with pytest.raises(OSError) as exc_info:
        update_coordination("TASK-9001", agent="implementer", status="in_progress")

    assert "space" in str(exc_info.value).lower()
```

#### 5.2 Working Tree Edge Cases

**Test:** `test_dirty_working_tree_at_init_warning`

```python
def test_dirty_working_tree_at_init_warning(tmp_path, mock_dirty_repo, caplog):
    """Test warning logged when initializing with dirty tree."""
    init_context("tasks/TASK-9001-simple.task.yaml")

    assert any(
        "dirty" in record.message.lower() and "working tree" in record.message.lower()
        for record in caplog.records
    )
```

**Test:** `test_untracked_files_included_in_snapshot`

```python
def test_untracked_files_included_in_snapshot(tmp_path, initialized_context, mock_repo):
    """Test untracked files are captured in worktree snapshot."""
    # Add untracked file
    new_file = tmp_path / "backend/services/new_service.ts"
    new_file.parent.mkdir(parents=True, exist_ok=True)
    new_file.write_text("export const newService = () => {};")

    snapshot_worktree("TASK-9001", agent="implementer")

    context = get_context("TASK-9001")
    snapshot = context.coordination.implementer.worktree_snapshot

    # Should include untracked file
    assert any(
        fs.path == "backend/services/new_service.ts" and fs.status == "untracked"
        for fs in snapshot.files
    )
```

**Test:** `test_staged_changes_included_in_base_commit`

```python
def test_staged_changes_included_in_base_commit(tmp_path, initialized_context, mock_repo):
    """Test staged changes are included in base commit diff."""
    # Stage changes
    file_to_modify = tmp_path / "backend/services/upload.ts"
    file_to_modify.write_text("// Modified\nexport const upload = () => {};")
    mock_repo.index.add([str(file_to_modify)])

    snapshot_worktree("TASK-9001", agent="implementer")

    # Should capture staged changes
    diff_file = tmp_path / "tasks/.context/TASK-9001/diff-implementer-cumulative.patch"
    with open(diff_file) as f:
        diff = f.read()

    assert "upload.ts" in diff
```

**Test:** `test_submodule_changes_detected`

```python
def test_submodule_changes_detected(tmp_path, initialized_context_with_submodule):
    """Test git submodule changes are captured."""
    # Update submodule
    # (Mocked setup would modify submodule)

    snapshot_worktree("TASK-9001", agent="implementer")

    context = get_context("TASK-9001")
    status = context.coordination.implementer.worktree_snapshot.git_status

    # Should show submodule in status
    assert "submodule" in status.lower()
```

**Test:** `test_symlink_changes_handled`

```python
def test_symlink_changes_handled(tmp_path, initialized_context):
    """Test symlink creation/modification doesn't break snapshot."""
    # Create symlink
    target = tmp_path / "backend/services/upload.ts"
    link = tmp_path / "backend/services/upload_link.ts"
    link.symlink_to(target)

    # Should not error
    snapshot_worktree("TASK-9001", agent="implementer")

    context = get_context("TASK-9001")
    assert context.coordination.implementer.worktree_snapshot is not None
```

#### 5.3 Incremental Diff Edge Cases

**Test:** `test_reviewer_deletes_implementer_file`

```python
def test_reviewer_deletes_implementer_file(tmp_path, initialized_context_with_implementer_snapshot):
    """Test incremental diff when reviewer deletes file added by implementer."""
    # Implementer added file
    new_file = tmp_path / "backend/services/new.ts"

    # Reviewer deletes it
    new_file.unlink()

    snapshot_worktree("TASK-9001", agent="reviewer")

    # Should show deletion in incremental diff
    incremental_diff = get_incremental_diff("TASK-9001", agent="reviewer")
    assert "deleted file" in incremental_diff.lower()
    assert "new.ts" in incremental_diff
```

**Test:** `test_reviewer_renames_implementer_file`

```python
def test_reviewer_renames_implementer_file(tmp_path, initialized_context_with_implementer_snapshot, mock_repo):
    """Test incremental diff when reviewer renames file."""
    old_path = tmp_path / "backend/services/upload.ts"
    new_path = tmp_path / "backend/services/upload_service.ts"

    # Rename
    old_path.rename(new_path)
    mock_repo.index.add([str(new_path)])
    mock_repo.index.remove([str(old_path)])

    snapshot_worktree("TASK-9001", agent="reviewer")

    # Should detect rename
    incremental_diff = get_incremental_diff("TASK-9001", agent="reviewer")
    assert "rename" in incremental_diff.lower() or ("upload.ts" in incremental_diff and "upload_service.ts" in incremental_diff)
```

**Test:** `test_binary_file_conflicts_in_incremental_diff`

```python
def test_binary_file_conflicts_in_incremental_diff(tmp_path, initialized_context_with_implementer_snapshot):
    """Test incremental diff handles binary file changes."""
    # Implementer added image
    img_file = tmp_path / "mobile/assets/icon.png"
    img_file.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)

    snapshot_worktree("TASK-9001", agent="implementer")

    # Reviewer modifies image
    img_file.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\xFF" * 100)

    snapshot_worktree("TASK-9001", agent="reviewer")

    # Should note binary change
    incremental_diff = get_incremental_diff("TASK-9001", agent="reviewer")
    assert "binary" in incremental_diff.lower() or "icon.png" in incremental_diff
```

**Test:** `test_large_file_conflicts_warning`

```python
def test_large_file_conflicts_warning(tmp_path, initialized_context_with_implementer_snapshot, caplog):
    """Test warning when incremental diff involves large files >10MB."""
    # Create large file
    large_file = tmp_path / "backend/data/large.json"
    large_file.parent.mkdir(parents=True, exist_ok=True)
    large_file.write_text("x" * (11 * 1024 * 1024))  # 11MB

    snapshot_worktree("TASK-9001", agent="reviewer")

    # Should log warning
    assert any(
        "large" in record.message.lower() and "10" in record.message
        for record in caplog.records
    )
```

**Test:** `test_empty_incremental_diff`

```python
def test_empty_incremental_diff(tmp_path, initialized_context_with_implementer_snapshot):
    """Test incremental diff when reviewer makes no changes."""
    # No changes by reviewer
    snapshot_worktree("TASK-9001", agent="reviewer")

    incremental_diff = get_incremental_diff("TASK-9001", agent="reviewer")

    # Should be empty or indicate no changes
    assert incremental_diff == "" or "no changes" in incremental_diff.lower()
```

#### 5.4 Concurrent Access

**Test:** `test_multiple_processes_updating_different_agents`

```python
def test_multiple_processes_updating_different_agents(tmp_path, initialized_context):
    """Test concurrent updates to different agents don't conflict."""
    import multiprocessing

    def update_agent(agent_name):
        update_coordination("TASK-9001", agent=agent_name, status="in_progress")

    # Update three agents in parallel
    processes = [
        multiprocessing.Process(target=update_agent, args=("implementer",)),
        multiprocessing.Process(target=update_agent, args=("reviewer",)),
        multiprocessing.Process(target=update_agent, args=("validator",))
    ]

    for p in processes:
        p.start()
    for p in processes:
        p.join()

    # All updates should succeed
    context = get_context("TASK-9001")
    assert context.coordination.implementer.status == "in_progress"
    assert context.coordination.reviewer.status == "in_progress"
    assert context.coordination.validator.status == "in_progress"
```

**Test:** `test_lock_contention_scenarios`

```python
def test_lock_contention_scenarios(tmp_path, initialized_context):
    """Test lock acquisition under contention."""
    import threading

    results = []

    def concurrent_update(agent_idx):
        try:
            update_coordination("TASK-9001", agent="implementer",
                                note=f"Update {agent_idx}")
            results.append(True)
        except Exception as e:
            results.append(False)

    # 10 concurrent updates
    threads = [threading.Thread(target=concurrent_update, args=(i,)) for i in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    # All should eventually succeed
    assert all(results)
```

**Test:** `test_atomic_write_race_conditions`

```python
def test_atomic_write_race_conditions(tmp_path, initialized_context):
    """Test atomic writes prevent race conditions."""
    import threading

    def rapid_update():
        for i in range(5):
            update_coordination("TASK-9001", agent="implementer", note=f"Note {i}")

    # Multiple threads rapidly updating
    threads = [threading.Thread(target=rapid_update) for _ in range(3)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    # Context should be valid (not corrupted)
    context = get_context("TASK-9001")
    assert context is not None
```

#### 5.5 Cross-Platform Compatibility

**Test:** `test_windows_path_separators`

```python
@pytest.mark.skipif(sys.platform != "win32", reason="Windows-specific test")
def test_windows_path_separators(tmp_path, initialized_context):
    """Test Windows backslash path separators normalized."""
    # Windows paths should be normalized to forward slashes
    context = get_context("TASK-9001")

    for file_snapshot in context.coordination.implementer.worktree_snapshot.files:
        assert "\\" not in file_snapshot.path
        assert "/" in file_snapshot.path or file_snapshot.path == ""
```

**Test:** `test_case_insensitive_filesystem_handling`

```python
@pytest.mark.skipif(sys.platform == "linux", reason="Case-sensitive FS test")
def test_case_insensitive_filesystem_handling(tmp_path, initialized_context):
    """Test handling of case-insensitive filesystems (macOS, Windows)."""
    # Create file with different case
    file1 = tmp_path / "backend/services/Upload.ts"
    file1.write_text("export const upload = () => {};")

    snapshot_worktree("TASK-9001", agent="implementer")

    # Rename to different case
    file2 = tmp_path / "backend/services/upload.ts"
    file1.rename(file2)

    # Should detect as change (or same file depending on OS)
    snapshot_worktree("TASK-9001", agent="reviewer")
```

**Test:** `test_crlf_vs_lf_line_endings`

```python
def test_crlf_vs_lf_line_endings(tmp_path, initialized_context):
    """Test CRLF line endings normalized to LF."""
    # Create file with CRLF
    file = tmp_path / "backend/services/upload.ts"
    file.write_bytes(b"export const upload = () => {};\r\n")

    snapshot_worktree("TASK-9001", agent="implementer")

    # Change to LF
    file.write_bytes(b"export const upload = () => {};\n")

    # Should have same SHA after normalization
    snapshot_worktree("TASK-9001", agent="reviewer")

    # (Verify normalization logic)
```

**Test:** `test_git_config_autocrlf_variations`

```python
def test_git_config_autocrlf_variations(tmp_path, initialized_context, mock_repo):
    """Test different git core.autocrlf settings don't affect SHAs."""
    # Test with autocrlf=false
    mock_repo.config_writer().set_value("core", "autocrlf", "false").release()
    snapshot_worktree("TASK-9001", agent="implementer")
    sha_false = get_context("TASK-9001").coordination.implementer.worktree_snapshot.scope_hash

    # Test with autocrlf=true
    mock_repo.config_writer().set_value("core", "autocrlf", "true").release()
    snapshot_worktree("TASK-9002", agent="implementer")
    sha_true = get_context("TASK-9002").coordination.implementer.worktree_snapshot.scope_hash

    # Should produce same hash due to normalization
    assert sha_false == sha_true
```

---

## Test Suite 6: Performance & Integration

**Priority:** 🟢 Low
**File:** `tests/test_context_store_integration.py`
**Gaps:** Performance, Full Workflow Integration

### Test Scenarios

#### 6.1 Performance Stress Tests

**Test:** `test_large_context_files_over_1mb`

```python
def test_large_context_files_over_1mb(tmp_path, mock_task_large_scope):
    """Test context initialization with >1MB context data."""
    # Task with 1000+ file scope
    init_context(mock_task_large_scope)

    context_file = tmp_path / "tasks/.context/TASK-9008/context.json"
    size_mb = context_file.stat().st_size / (1024 * 1024)

    assert size_mb > 1.0

    # Should still load successfully
    context = get_context("TASK-9008")
    assert context is not None
```

**Test:** `test_many_file_changes_over_1000_files`

```python
def test_many_file_changes_over_1000_files(tmp_path, initialized_context):
    """Test snapshot with >1000 changed files."""
    # Create 1500 files
    for i in range(1500):
        file = tmp_path / f"backend/test/file_{i}.ts"
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(f"export const file{i} = {i};")

    # Should complete in reasonable time
    import time
    start = time.time()
    snapshot_worktree("TASK-9001", agent="implementer")
    elapsed = time.time() - start

    assert elapsed < 30  # Should complete within 30 seconds
```

**Test:** `test_deep_directory_structures`

```python
def test_deep_directory_structures(tmp_path, initialized_context):
    """Test snapshot with deeply nested directories."""
    # Create 20-level deep structure
    path = tmp_path / "backend"
    for i in range(20):
        path = path / f"level_{i}"
    path.mkdir(parents=True, exist_ok=True)
    (path / "deep_file.ts").write_text("export const deep = true;")

    # Should handle gracefully
    snapshot_worktree("TASK-9001", agent="implementer")

    context = get_context("TASK-9001")
    assert any("deep_file.ts" in fs.path for fs in context.coordination.implementer.worktree_snapshot.files)
```

**Test:** `test_file_locking_stress_test`

```python
def test_file_locking_stress_test(tmp_path, initialized_context):
    """Test file locking under high contention."""
    import threading

    def rapid_updates():
        for _ in range(50):
            update_coordination("TASK-9001", agent="implementer", status="in_progress")

    # 10 threads, 50 updates each = 500 total
    threads = [threading.Thread(target=rapid_updates) for _ in range(10)]

    start = time.time()
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    elapsed = time.time() - start

    # Should complete in reasonable time
    assert elapsed < 60

    # Context should be valid
    context = get_context("TASK-9001")
    assert context is not None
```

#### 6.2 Full Workflow Integration Tests

**Test:** `test_complete_task_workflow_init_to_completion`

```python
def test_complete_task_workflow_init_to_completion(tmp_path, mock_repo):
    """Test full workflow: init → implementer → reviewer → validator → complete."""
    # 1. Initialize context
    init_context("tasks/TASK-9001-simple.task.yaml")

    # 2. Implementer starts
    update_coordination("TASK-9001", agent="implementer", status="in_progress")

    # Make changes
    file = tmp_path / "backend/services/upload.ts"
    file.write_text("export const upload = () => {};")

    # Snapshot implementer work
    snapshot_worktree("TASK-9001", agent="implementer")
    update_coordination("TASK-9001", agent="implementer", status="completed")

    # 3. Reviewer starts
    update_coordination("TASK-9001", agent="reviewer", status="in_progress")

    # Verify no drift
    verify_worktree_state("TASK-9001", agent="reviewer")

    # Make additional changes
    file.write_text("export const upload = () => { /* reviewed */ };")

    # Snapshot reviewer work
    snapshot_worktree("TASK-9001", agent="reviewer")
    update_coordination("TASK-9001", agent="reviewer", status="completed")

    # 4. Validator starts
    update_coordination("TASK-9001", agent="validator", status="in_progress")

    # Record QA
    record_qa_result("TASK-9001", agent="validator",
                     command="pnpm test", result="PASS", output="All tests passed")

    update_coordination("TASK-9001", agent="validator", status="completed")

    # 5. Complete task (should purge context)
    from tasks_cli.task_operations import TaskOperations
    ops = TaskOperations(tmp_path)
    ops.complete_task("tasks/TASK-9001-simple.task.yaml")

    # Context should be gone
    assert not (tmp_path / "tasks/.context/TASK-9001").exists()
```

**Test:** `test_multiple_tasks_with_contexts_simultaneously`

```python
def test_multiple_tasks_with_contexts_simultaneously(tmp_path):
    """Test multiple tasks can have active contexts concurrently."""
    # Initialize 5 tasks
    for i in range(1, 6):
        init_context(f"tasks/TASK-900{i}-*.task.yaml")

    # All contexts should exist
    for i in range(1, 6):
        assert (tmp_path / f"tasks/.context/TASK-900{i}").exists()

    # Update different agents
    update_coordination("TASK-9001", agent="implementer", status="in_progress")
    update_coordination("TASK-9002", agent="reviewer", status="in_progress")
    update_coordination("TASK-9003", agent="validator", status="in_progress")

    # All should be independent
    ctx1 = get_context("TASK-9001")
    ctx2 = get_context("TASK-9002")
    ctx3 = get_context("TASK-9003")

    assert ctx1.coordination.implementer.status == "in_progress"
    assert ctx2.coordination.reviewer.status == "in_progress"
    assert ctx3.coordination.validator.status == "in_progress"
```

**Test:** `test_context_cleanup_on_branch_switch`

```python
def test_context_cleanup_on_branch_switch(tmp_path, mock_repo, initialized_context):
    """Test context remains valid after branch switch."""
    # Create context on main branch
    init_context("tasks/TASK-9001-simple.task.yaml")

    # Switch to feature branch
    mock_repo.create_head("feature/test-branch")
    mock_repo.heads["feature/test-branch"].checkout()

    # Context should still be accessible (tied to task, not branch)
    context = get_context("TASK-9001")
    assert context is not None
```

**Test:** `test_orphaned_context_detection`

```python
def test_orphaned_context_detection(tmp_path):
    """Test detection of orphaned contexts (task file deleted)."""
    # Initialize context
    init_context("tasks/TASK-9001-simple.task.yaml")

    # Delete task file
    (tmp_path / "tasks/TASK-9001-simple.task.yaml").unlink()

    # Context is orphaned
    orphans = find_orphaned_contexts()

    assert "TASK-9001" in orphans
```

#### 6.3 Validation Edge Cases

**Test:** `test_empty_task_fields_beyond_description`

```python
def test_empty_task_fields_beyond_description(tmp_path, mock_task_empty_fields):
    """Test context handles tasks with many empty fields."""
    # Task has empty plan, scope, etc.
    init_context(mock_task_empty_fields)

    context = get_context("TASK-9005")

    # Should have empty arrays/objects
    assert context.snapshot.plan == []
    assert context.snapshot.scope_in == []
    assert context.snapshot.acceptance_criteria == []
```

**Test:** `test_very_long_field_values_over_2kb`

```python
def test_very_long_field_values_over_2kb(tmp_path, mock_task_long_text):
    """Test context handles very long field values."""
    # Task has 5KB description
    init_context(mock_task_long_text)

    context = get_context("TASK-9011")

    # Should preserve full text
    assert len(context.snapshot.description) > 2000
```

**Test:** `test_unicode_characters_in_paths`

```python
def test_unicode_characters_in_paths(tmp_path, initialized_context):
    """Test snapshot handles Unicode in file paths."""
    # Create file with Unicode path
    file = tmp_path / "shared/日本語/module.ts"
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text("export const test = true;")

    snapshot_worktree("TASK-9001", agent="implementer")

    context = get_context("TASK-9001")
    assert any("日本語" in fs.path for fs in context.coordination.implementer.worktree_snapshot.files)
```

**Test:** `test_special_characters_in_task_ids`

```python
def test_special_characters_in_task_ids(tmp_path):
    """Test task IDs with special characters rejected."""
    with pytest.raises(ValueError):
        init_context("tasks/TASK-<>9001-invalid.task.yaml")
```

---

## Test Data & Fixtures

### Mock Standards Files

**File:** `fixtures/standards/backend-tier.md`

```markdown
# Backend Tier Standards

## Handler Constraints

Handlers must maintain low complexity:
- Cyclomatic complexity ≤10 (hard fail at >10)
- Lines of code ≤75
- No AWS SDK imports (use providers)

## Layering Rules

```
Handlers → Services → Providers
```

One-way dependency flow only.

## Testing Requirements

- Services: 80% line coverage, 70% branch coverage
- Handlers: Complexity checks only
```

**File:** `fixtures/standards/typescript.md`

```markdown
# TypeScript Standards

## Strict Configuration

Enable all strict flags:
- `strict: true`
- `exactOptionalPropertyTypes: true`
- `noUncheckedIndexedAccess: true`

## Error Handling

Use neverthrow Results for control flow:
```typescript
import { Result, ok, err } from 'neverthrow';

function upload(): Result<string, Error> {
  return ok("success");
}
```
```

### Mock Git Repository States

**Fixture:** `mock_repo_clean`

```python
@pytest.fixture
def mock_repo_clean(tmp_path):
    """Git repo with clean working tree."""
    repo = git.Repo.init(tmp_path)

    # Initial commit
    (tmp_path / "README.md").write_text("# Project")
    repo.index.add(["README.md"])
    repo.index.commit("Initial commit")

    return repo
```

**Fixture:** `mock_repo_dirty`

```python
@pytest.fixture
def mock_repo_dirty(tmp_path, mock_repo_clean):
    """Git repo with uncommitted changes."""
    repo = mock_repo_clean

    # Modify file
    (tmp_path / "README.md").write_text("# Project\n\nModified")

    return repo
```

**Fixture:** `mock_repo_with_staged_changes`

```python
@pytest.fixture
def mock_repo_with_staged_changes(tmp_path, mock_repo_clean):
    """Git repo with staged changes."""
    repo = mock_repo_clean

    # Stage new file
    (tmp_path / "new_file.ts").write_text("export const test = true;")
    repo.index.add(["new_file.ts"])

    return repo
```

### Sample QA Command Outputs

**Fixture:** `sample_typecheck_pass`

```
$ pnpm turbo run typecheck --filter=@photoeditor/backend

@photoeditor/backend:typecheck: cache miss, executing
@photoeditor/backend:typecheck:
@photoeditor/backend:typecheck: > @photoeditor/backend@1.0.0 typecheck
@photoeditor/backend:typecheck: > tsc --noEmit
@photoeditor/backend:typecheck:

 Tasks:    1 successful, 1 total
Cached:    0 cached, 1 total
  Time:    2.456s
```

**Fixture:** `sample_lint_errors`

```
$ pnpm turbo run lint --filter=@photoeditor/backend

@photoeditor/backend:lint: cache miss, executing
@photoeditor/backend:lint:
@photoeditor/backend:lint: > @photoeditor/backend@1.0.0 lint
@photoeditor/backend:lint: > eslint . --ext .ts
@photoeditor/backend:lint:
@photoeditor/backend:lint: /backend/lambdas/upload/handler.ts
@photoeditor/backend:lint:   12:5  error  'aws-sdk' should not be imported  no-restricted-imports
@photoeditor/backend:lint:   45:10 warning Unused variable 'result'      @typescript-eslint/no-unused-vars
@photoeditor/backend:lint:
@photoeditor/backend:lint: ✖ 2 problems (1 error, 1 warning)

ERROR run failed: command exited (1)
```

### Expected JSON Schemas

**Schema:** Context JSON structure

```json
{
  "snapshot": {
    "task_id": "string",
    "title": "string",
    "priority": "P0|P1|P2",
    "area": "backend|mobile|shared|infrastructure",
    "description": "string",
    "scope_in": ["string"],
    "scope_out": ["string"],
    "plan": ["string"],
    "acceptance_criteria": [
      {
        "criteria": "string",
        "standards_ref": "string"
      }
    ]
  },
  "git_head": "string (SHA)",
  "git_base_commit": "string (SHA)",
  "standards_citations": [
    {
      "file_path": "string",
      "section": "string",
      "line_start": "number|null",
      "line_end": "number|null",
      "content": "string",
      "content_sha": "string (SHA256)"
    }
  ],
  "validation_baseline": {
    "commands": [
      {
        "command": "string",
        "description": "string",
        "baseline_result": "string|null"
      }
    ]
  },
  "coordination": {
    "implementer": {
      "status": "pending|in_progress|completed",
      "notes": "string",
      "updated_at": "number (Unix epoch)",
      "worktree_snapshot": "WorktreeSnapshot|null"
    },
    "reviewer": { /* same structure */ },
    "validator": {
      /* same structure */
      "qa_logs": [
        {
          "command": "string",
          "result": "PASS|FAIL|WARN",
          "output": "string|artifact://ID",
          "timestamp": "number"
        }
      ]
    },
    "drift_budget": "number",
    "operator_notes": "string"
  }
}
```

---

## Implementation Roadmap

### Phase 1: High-Priority Gaps (Weeks 1-2)

**Week 1:**
1. ✅ CLI Integration Tests (Suite 1)
   - Implement all 20 CLI command tests
   - Test error handling and JSON output
   - Validate command-line argument parsing

2. ✅ Lifecycle Hooks (Suite 2, part 1)
   - Auto-purge on task completion
   - Purge error handling
   - Idempotency tests

**Week 2:**
3. ✅ Drift Budget & Staleness (Suite 2, part 2)
   - Drift budget counter logic
   - Staleness detection warnings
   - Resolve-drift CLI

4. ✅ Standards Citations (Suite 3, part 1)
   - SHA mismatch detection
   - Line span extraction
   - Citation validation

### Phase 2: Provenance & Serialization (Weeks 3-4)

**Week 3:**
5. ✅ Manifest & Provenance (Suite 3, part 2)
   - Manifest generation
   - Regeneration from manifest
   - Source file tracking

6. ✅ Role-Scoped Exports (Suite 4, part 1)
   - Implementer/reviewer/validator exports
   - Data filtering logic
   - Manifest tracking

**Week 4:**
7. ✅ Compression & Serialization (Suite 4, part 2)
   - Large artifact compression
   - Canonical JSON serialization
   - Deterministic output

### Phase 3: Robustness (Weeks 5-6)

**Week 5:**
8. ✅ Error Recovery (Suite 5, part 1)
   - Lock timeout/retry logic
   - Corrupted data handling
   - Permission errors

9. ✅ Working Tree Edge Cases (Suite 5, part 2)
   - Untracked files, symlinks
   - Submodule changes
   - Staged changes

**Week 6:**
10. ✅ Incremental Diff Edge Cases (Suite 5, part 3)
    - File deletion/rename by reviewer
    - Binary file conflicts
    - Large file warnings

11. ✅ Cross-Platform Compatibility (Suite 5, part 4)
    - Windows path separators
    - CRLF normalization
    - Case-insensitive filesystems

### Phase 4: Performance & Integration (Week 7)

**Week 7:**
12. ✅ Performance Tests (Suite 6, part 1)
    - Large context files
    - Many file changes
    - Deep directory structures

13. ✅ Full Workflow Integration (Suite 6, part 2)
    - End-to-end task workflow
    - Multiple concurrent tasks
    - Orphaned context detection

---

## Test Execution Guide

### Running Tests

```bash
# Run all context store tests
pytest scripts/tasks_cli/tests/test_context_store*.py -v

# Run specific suite
pytest scripts/tasks_cli/tests/test_context_store_cli.py -v

# Run with coverage
pytest scripts/tasks_cli/tests/test_context_store*.py --cov=tasks_cli.context_store --cov-report=html

# Run only high-priority tests
pytest scripts/tasks_cli/tests/test_context_store_cli.py \
       scripts/tasks_cli/tests/test_context_store_lifecycle.py \
       scripts/tasks_cli/tests/test_context_store_provenance.py -v

# Run performance tests (skip in CI)
pytest scripts/tasks_cli/tests/test_context_store_integration.py -v -m performance
```

### Test Dependencies

```bash
# Install test dependencies
pip install pytest pytest-cov pytest-mock GitPython filelock
```

### Test File Organization

When implementing, split the existing monolithic test file:

```bash
# 1. Create new test modules
touch scripts/tasks_cli/tests/test_context_store_cli.py
touch scripts/tasks_cli/tests/test_context_store_lifecycle.py
touch scripts/tasks_cli/tests/test_context_store_provenance.py
touch scripts/tasks_cli/tests/test_context_store_serialization.py
touch scripts/tasks_cli/tests/test_context_store_robustness.py
touch scripts/tasks_cli/tests/test_context_store_integration.py

# 2. Move relevant tests to each module
# 3. Retain original test_context_store.py with core tests
# 4. Run full suite to ensure no regressions
```

---

## Success Criteria

### Test Coverage Goals

- **Overall coverage:** 90%+ lines, 85%+ branches
- **CLI integration:** 100% command coverage
- **Error paths:** 80%+ coverage of error handling
- **Cross-platform:** All tests pass on Linux, macOS, Windows

### Quality Metrics

- All tests documented with clear docstrings
- Each test follows Arrange-Act-Assert pattern
- Fixtures shared via conftest.py
- No flaky tests (100% deterministic)
- Test execution time <5 minutes for full suite

### Documentation

- Test plan reviewed and approved ✅
- All test scenarios documented ✅
- Mock data fixtures documented ✅
- Implementation roadmap finalized ✅

---

## Appendix: Test Fixture Helpers

### Common Fixture Patterns

```python
# conftest.py

@pytest.fixture
def tmp_task_repo(tmp_path):
    """Create temporary task repository with structure."""
    (tmp_path / "tasks").mkdir()
    (tmp_path / "tasks/.context").mkdir()
    (tmp_path / "standards").mkdir()
    (tmp_path / "backend/services").mkdir(parents=True)
    (tmp_path / "mobile/src").mkdir(parents=True)
    (tmp_path / "shared/schemas").mkdir(parents=True)

    # Git init
    repo = git.Repo.init(tmp_path)
    (tmp_path / "README.md").write_text("# Test")
    repo.index.add(["README.md"])
    repo.index.commit("Initial commit")

    return tmp_path, repo

@pytest.fixture
def initialized_context(tmp_task_repo):
    """Context initialized for TASK-9001."""
    tmp_path, repo = tmp_task_repo

    # Create task file
    task_file = tmp_path / "tasks/TASK-9001-simple.task.yaml"
    # ... write task YAML ...

    init_context(task_file)
    return tmp_path, repo

@pytest.fixture
def initialized_context_with_snapshot(initialized_context):
    """Context with implementer snapshot."""
    tmp_path, repo = initialized_context

    # Make changes
    file = tmp_path / "backend/services/upload.ts"
    file.write_text("export const upload = () => {};")

    snapshot_worktree("TASK-9001", agent="implementer")
    return tmp_path, repo
```

---

**End of Test Plan**
