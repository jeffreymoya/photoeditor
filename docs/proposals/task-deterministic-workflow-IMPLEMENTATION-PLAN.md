# Deterministic Task Workflow: Implementation Plan & Session Breakdown

**Parent Proposal**: `docs/proposals/task-deterministic-task-workflow.md`
**Status**: Implementation Ready
**Created**: 2025-11-17
**Total Estimated Effort**: ~170 minutes across 5 LLM sessions
**Parallelization Potential**: 40% of tasks can run concurrently

---

## Executive Summary

This document breaks down the implementation of the Deterministic Task Authoring Workflow automation proposal into **5 concrete tasks** that can be executed across multiple LLM sessions, with clear parallelization opportunities.

### Quick Stats

| Metric | Value |
|--------|-------|
| Total Tasks | 5 |
| Total LOC Estimate | 400-600 lines |
| Sequential Path | ~170 minutes |
| With Parallelization | ~125 minutes |
| New Files Created | 4 (scaffolder.py, task-preflight.sh, + 2 test files) |
| Files Modified | 4 (\_\_main\_\_.py, linter.py, operations.py, Makefile) |
| Documentation Updates | 2 (README.md, template) |

### Key Goals

1. **Eliminate manual task creation errors** via `--new-task` CLI command
2. **Enforce draft discipline** via `--enforce-drafts` linter checks
3. **Automate validation** via `task-preflight.sh` script for CI/PR checks
4. **Auto-initialize context** when tasks transition to `todo` status

---

## Task Decomposition

### TASK-001: Core Task Scaffolding (Session 1)

**Size**: M (Medium)
**Estimated Duration**: 45 minutes
**Prerequisites**: None (foundation task)
**Parallelizable**: No (must complete first)

#### Scope

Create the task scaffolding infrastructure to enable one-command task creation from the canonical template.

#### Deliverables

1. **New Module**: `scripts/tasks_cli/scaffolder.py` (~150-200 LOC)
   - `ScaffoldConfig` dataclass (area, id, slug, title, priority, template_path)
   - `copy_template(config: ScaffoldConfig) -> Path` - Copy template to correct location
   - `replace_placeholders(task_path: Path, config: ScaffoldConfig)` - Update YAML placeholders
   - `validate_task_id(task_id: str, area: str)` - Ensure ID format and uniqueness
   - `get_task_path(area: str, task_id: str, slug: str) -> Path` - Compute canonical path

2. **CLI Integration**: Extend `scripts/tasks_cli/__main__.py` (~50-80 LOC)
   - Add `--new-task` argument group with required/optional flags
   - Add `cmd_new_task(args, repo_root: Path) -> int` function
   - Wire into main() dispatcher
   - Call `--bootstrap-evidence` after scaffold
   - Call `--lint` on newly created task

3. **Unit Tests**: `scripts/tasks_cli/tests/test_scaffolder.py` (~150-200 LOC)
   - Test template copying with various configs
   - Test placeholder replacement (ID, title, area, priority, status)
   - Test ID validation (format, uniqueness, area matching)
   - Test path generation edge cases
   - Test error handling (missing template, duplicate ID, invalid area)

#### Acceptance Criteria

- [ ] `python scripts/tasks.py --new-task --area backend --id TASK-1234 --slug "example" --title "Example Task"` creates valid task file
- [ ] Task file appears at `tasks/backend/TASK-1234-example.task.yaml`
- [ ] All template placeholders replaced correctly
- [ ] Evidence file created at `docs/evidence/tasks/TASK-1234-clarifications.md`
- [ ] New task passes `--lint` validation
- [ ] Unit tests achieve 80% line coverage, 70% branch coverage
- [ ] Duplicate ID detection prevents overwriting existing tasks
- [ ] CLI returns exit code 0 on success, non-zero on failure

#### Files Created/Modified

**Created**:
- `scripts/tasks_cli/scaffolder.py`
- `scripts/tasks_cli/tests/test_scaffolder.py`

**Modified**:
- `scripts/tasks_cli/__main__.py` (add --new-task command)

---

### TASK-002: Draft Enforcement Linter (Session 2)

**Size**: M (Medium)
**Estimated Duration**: 45 minutes
**Prerequisites**: TASK-001 (references scaffolder patterns)
**Parallelizable**: Yes (with TASK-004)

#### Scope

Extend the existing task linter to enforce draft discipline: drafts must have outstanding clarifications OR resolved evidence files before transitioning to `todo`.

#### Deliverables

1. **Linter Extension**: Modify `scripts/tasks_cli/linter.py` (~100-150 LOC)
   - Add `--enforce-drafts` flag to enable strict draft checks
   - `_check_draft_clarifications(task_data: dict) -> List[Warning]`
     - If `status: draft`, require non-empty `clarifications.outstanding` OR valid evidence file
   - `_validate_evidence_file(evidence_path: Path) -> bool`
     - Evidence file must exist
     - Must contain at least one clarification entry (not just markdown headings)
   - `_check_dependency_reciprocity(task_data: dict, all_tasks: List[Task]) -> List[Warning]`
     - If task A has `depends_on: [TASK-B]`, ensure TASK-B has `blocked_by: [TASK-A]`

2. **CLI Integration**: Extend `scripts/tasks_cli/__main__.py` (~20-30 LOC)
   - Add `--enforce-drafts` flag to `--lint` command
   - Pass flag to linter
   - Update help text

3. **Unit Tests**: `scripts/tasks_cli/tests/test_linter_drafts.py` (~120-150 LOC)
   - Test draft with outstanding clarifications (pass)
   - Test draft with resolved evidence file (pass)
   - Test draft with neither (fail)
   - Test draft with empty evidence file (fail)
   - Test dependency reciprocity (both directions)
   - Test schema version gating (skip checks for schema 1.0 tasks)

#### Acceptance Criteria

- [ ] Draft task with `clarifications.outstanding: [...]` passes lint
- [ ] Draft task with valid evidence file passes lint
- [ ] Draft task with neither fails lint when `--enforce-drafts` enabled
- [ ] Todo task without resolved clarifications fails lint
- [ ] Dependency reciprocity validated (depends_on ↔ blocked_by)
- [ ] Schema 1.0 tasks skip enforcement (graceful degradation)
- [ ] Warning messages include actionable recovery instructions
- [ ] Unit tests achieve 80% line coverage, 70% branch coverage

#### Files Created/Modified

**Created**:
- `scripts/tasks_cli/tests/test_linter_drafts.py`

**Modified**:
- `scripts/tasks_cli/linter.py` (add enforcement logic)
- `scripts/tasks_cli/__main__.py` (add --enforce-drafts flag)

---

### TASK-003: Preflight Script & CI Integration (Session 3)

**Size**: S (Small)
**Estimated Duration**: 30 minutes
**Prerequisites**: TASK-002 (uses --enforce-drafts flag)
**Parallelizable**: No (depends on Phase 2 completion)

#### Scope

Create a unified preflight validation script for CI/PR checks and integrate with GitHub Actions workflow.

#### Deliverables

1. **Preflight Script**: `scripts/task-preflight.sh` (~50-80 LOC)
   ```bash
   #!/bin/bash
   # Task Preflight Validation
   # Usage: scripts/task-preflight.sh tasks/backend/TASK-1234.task.yaml [...]

   set -euo pipefail

   # Accept one or more task paths
   TASK_PATHS=("$@")

   # Run validation pipeline
   for task in "${TASK_PATHS[@]}"; do
     echo "Validating $task..."
     scripts/validate-task-yaml "$task" || exit 1
   done

   # Check for dependency cycles/halts
   python scripts/tasks.py --check-halt || exit 1

   # Optionally export graph (for debugging)
   if [[ "${EXPORT_GRAPH:-}" == "1" ]]; then
     python scripts/tasks.py --graph > .agent-output/task-graph.dot
   fi

   echo "✅ All preflight checks passed"
   ```

2. **Makefile Target**: Extend `Makefile` (~5-10 LOC)
   ```makefile
   .PHONY: task-preflight
   task-preflight:
       @echo "Running task preflight validation..."
       @./scripts/task-preflight.sh $(TASKS)
   ```

3. **CI Integration**: Modify `.github/workflows/*.yml` (~20-30 LOC)
   - Add job to run `make task-preflight` on PR changes to `tasks/`
   - Use `git diff --name-only` to detect changed task files
   - Fail PR if preflight check fails

4. **Documentation**: Update `tasks/README.md` (~20-30 LOC)
   - Add "Automated Validation" section
   - Document `make task-preflight` usage
   - Document CI integration behavior

#### Acceptance Criteria

- [ ] `scripts/task-preflight.sh tasks/backend/TASK-1234.yaml` exits 0 for valid task
- [ ] Script exits non-zero for invalid task (lint failure, cycle detected)
- [ ] `make task-preflight TASKS="tasks/backend/*.yaml"` validates multiple tasks
- [ ] CI workflow runs preflight on PR changes to `tasks/` directory
- [ ] CI workflow provides clear error messages on failure
- [ ] Documentation includes troubleshooting guide

#### Files Created/Modified

**Created**:
- `scripts/task-preflight.sh`

**Modified**:
- `Makefile` (add task-preflight target)
- `.github/workflows/<appropriate-workflow>.yml` (add preflight job)
- `tasks/README.md` (document preflight usage)

---

### TASK-004: Context Auto-Init Hook (Session 4)

**Size**: S (Small)
**Estimated Duration**: 30 minutes
**Prerequisites**: TASK-001 (uses context initialization patterns)
**Parallelizable**: Yes (with TASK-002)

#### Scope

Automatically initialize task context cache when a task transitions from `draft` to `todo` status.

#### Deliverables

1. **Status Transition Hook**: Modify `scripts/tasks_cli/operations.py` (~30-50 LOC)
   - Extend `transition_status()` function (currently lines 192-226)
   - Add logic after status update:
     ```python
     if new_status == 'todo':
         try:
             # Auto-initialize context for todo tasks
             from .context_store import TaskContextStore
             context_store = TaskContextStore(repo_root)
             context_store.init_context(task_id)
             logger.info(f"Auto-initialized context for {task_id}")
         except Exception as e:
             logger.warning(f"Context auto-init failed for {task_id}: {e}")
             # Non-fatal - allow transition to proceed
     ```
   - Log success/failure but don't block transition

2. **Unit Tests**: `scripts/tasks_cli/tests/test_operations_hooks.py` (~80-100 LOC)
   - Test context init on draft → todo transition
   - Test context not initialized for other transitions (todo → in_progress)
   - Test graceful degradation if context init fails
   - Test idempotency (re-initializing existing context is safe)
   - Test logging behavior

#### Acceptance Criteria

- [ ] Transitioning task from `draft` to `todo` automatically calls `--init-context`
- [ ] Context directory created at `.agent-output/TASK-XXXX/`
- [ ] Context manifest populated with task metadata
- [ ] Transition succeeds even if context init fails (non-fatal)
- [ ] No context init for transitions not involving `todo` status
- [ ] Logging clearly indicates auto-init attempt and result
- [ ] Unit tests achieve 80% line coverage, 70% branch coverage

#### Files Created/Modified

**Created**:
- `scripts/tasks_cli/tests/test_operations_hooks.py`

**Modified**:
- `scripts/tasks_cli/operations.py` (add context auto-init hook)

---

### TASK-005: Documentation & Integration Testing (Session 5)

**Size**: S (Small)
**Estimated Duration**: 20 minutes
**Prerequisites**: TASK-003, TASK-004 (documents all components)
**Parallelizable**: No (final integration task)

#### Scope

Update documentation to reflect new workflow automation and create end-to-end integration tests.

#### Deliverables

1. **README Update**: Modify `tasks/README.md` (~50-80 LOC)
   - Add "Deterministic Task Automation" section before "Task Lifecycle"
   - Document `--new-task` command with examples
   - Document `--enforce-drafts` linter flag
   - Document `task-preflight.sh` script
   - Document context auto-init behavior
   - Add workflow diagram showing automation touch points

2. **Template Update**: Modify `docs/templates/TASK-0000-template.task.yaml` (~10-20 LOC)
   - Add quickstart comment block at top:
     ```yaml
     # Quickstart: Create a new task from this template with:
     #   python scripts/tasks.py --new-task --area <area> --id TASK-XXXX --slug "descriptive-slug" --title "Task Title"
     #
     # This will:
     #   1. Copy this template to tasks/<area>/TASK-XXXX-descriptive-slug.task.yaml
     #   2. Replace placeholders with your values
     #   3. Create evidence file at docs/evidence/tasks/TASK-XXXX-clarifications.md
     #   4. Run lint validation
     ```

3. **Integration Test**: `scripts/tasks_cli/tests/test_integration_workflow.py` (~100-150 LOC)
   - Test end-to-end workflow:
     1. Create task via `--new-task`
     2. Verify evidence file created
     3. Run `--lint` with `--enforce-drafts`
     4. Populate evidence file with clarifications
     5. Transition to `todo` status
     6. Verify context auto-initialized
     7. Run `task-preflight.sh` on created task

#### Acceptance Criteria

- [ ] `tasks/README.md` clearly documents all new commands
- [ ] Template includes quickstart snippet at top
- [ ] Integration test covers full create → validate → transition workflow
- [ ] Integration test runs in <10 seconds
- [ ] Documentation includes troubleshooting section
- [ ] All code examples in documentation are tested and valid

#### Files Created/Modified

**Created**:
- `scripts/tasks_cli/tests/test_integration_workflow.py`

**Modified**:
- `tasks/README.md` (add automation documentation)
- `docs/templates/TASK-0000-template.task.yaml` (add quickstart comments)

---

## LLM Session Planning

### Session 1: Foundation (45 min)

**Task**: TASK-001 (Core Task Scaffolding)

**Activities**:
1. Create `scaffolder.py` module with template copying logic (20 min)
2. Add `--new-task` CLI command integration (10 min)
3. Write unit tests for scaffolder (15 min)

**Validation**:
```bash
# Test basic scaffolding
python scripts/tasks.py --new-task --area backend --id TASK-9999 --slug "test" --title "Test Task"

# Verify file created
ls -la tasks/backend/TASK-9999-test.task.yaml

# Verify evidence created
ls -la docs/evidence/tasks/TASK-9999-clarifications.md

# Run tests
cd scripts/tasks_cli && python -m pytest tests/test_scaffolder.py -v
```

**Checkpoint**: Must pass before Session 2/4 can proceed in parallel

---

### Session 2: Draft Enforcement (45 min) [PARALLEL]

**Task**: TASK-002 (Draft Enforcement Linter)

**Activities**:
1. Extend linter with draft checks (20 min)
2. Add `--enforce-drafts` CLI flag (5 min)
3. Write unit tests for enforcement (20 min)

**Validation**:
```bash
# Test draft enforcement
python scripts/tasks.py --lint tasks/backend/TASK-9999-test.task.yaml --enforce-drafts

# Run tests
cd scripts/tasks_cli && python -m pytest tests/test_linter_drafts.py -v
```

**Parallelizable with**: Session 4 (no shared file modifications)

---

### Session 4: Context Auto-Init (30 min) [PARALLEL]

**Task**: TASK-004 (Context Auto-Init Hook)

**Activities**:
1. Add status transition hook in operations.py (15 min)
2. Write unit tests for hook behavior (15 min)

**Validation**:
```bash
# Test context auto-init
python scripts/tasks.py --claim tasks/backend/TASK-9999-test.task.yaml

# Verify context directory created
ls -la .agent-output/TASK-9999/

# Run tests
cd scripts/tasks_cli && python -m pytest tests/test_operations_hooks.py -v
```

**Parallelizable with**: Session 2 (no shared file modifications)

---

### Session 3: Preflight & CI (30 min)

**Task**: TASK-003 (Preflight Script & CI Integration)

**Prerequisites**: Sessions 2 & 4 complete

**Activities**:
1. Create `task-preflight.sh` script (10 min)
2. Add Makefile target (5 min)
3. Update CI workflow (10 min)
4. Update documentation (5 min)

**Validation**:
```bash
# Test preflight script
./scripts/task-preflight.sh tasks/backend/TASK-9999-test.task.yaml

# Test Makefile target
make task-preflight TASKS="tasks/backend/TASK-9999-test.task.yaml"

# Verify CI workflow syntax
yamllint .github/workflows/*.yml
```

---

### Session 5: Documentation & Integration (20 min)

**Task**: TASK-005 (Documentation & Integration Testing)

**Prerequisites**: Session 3 complete

**Activities**:
1. Update `tasks/README.md` (10 min)
2. Update template with quickstart (2 min)
3. Write integration test (8 min)

**Validation**:
```bash
# Run integration test
cd scripts/tasks_cli && python -m pytest tests/test_integration_workflow.py -v

# Verify documentation completeness
grep -i "new-task" tasks/README.md
grep -i "enforce-drafts" tasks/README.md
grep -i "task-preflight" tasks/README.md
```

---

## Parallelization Matrix

### Dependency Graph

```
Session 1 (TASK-001)
       |
       ├──────────────────┐
       |                  |
       v                  v
Session 2 (TASK-002)   Session 4 (TASK-004)
  [PARALLEL]              [PARALLEL]
       |                  |
       └──────┬───────────┘
              v
       Session 3 (TASK-003)
              |
              v
       Session 5 (TASK-005)
```

### Critical Path Analysis

**Sequential Execution**: 45 + 45 + 30 + 30 + 20 = **170 minutes**

**With Parallelization**: 45 + max(45, 30) + 30 + 20 = **140 minutes**

**Time Savings**: 30 minutes (17.6% reduction)

### Parallel Execution Schedule

| Time Slot | Duration | Sessions Running | Task IDs |
|-----------|----------|------------------|----------|
| T0 - T45  | 45 min   | Session 1        | TASK-001 |
| T45 - T90 | 45 min   | Sessions 2 & 4   | TASK-002, TASK-004 |
| T90 - T120| 30 min   | Session 3        | TASK-003 |
| T120 - T140| 20 min  | Session 5        | TASK-005 |

**Peak Parallelism**: 2 concurrent sessions (T45-T90)

---

## Implementation Phases

### Phase 1: Foundation (Week 1)

**Goal**: Establish core scaffolding infrastructure

**Tasks**: TASK-001

**Deliverables**:
- ✅ Scaffolder module operational
- ✅ --new-task CLI command functional
- ✅ Unit tests passing with 80%+ coverage

**Success Criteria**:
- Manual task creation time reduced from ~15 min to ~2 min
- Zero template-related errors in newly created tasks

---

### Phase 2: Validation & Automation (Week 1, concurrent)

**Goal**: Add draft discipline and auto-initialization

**Tasks**: TASK-002, TASK-004 (parallel)

**Deliverables**:
- ✅ Draft enforcement linter operational
- ✅ Context auto-init hook functional
- ✅ Unit tests passing for both components

**Success Criteria**:
- Draft tasks cannot transition to todo without clarification resolution
- Context cache automatically initialized for 100% of todo transitions

---

### Phase 3: Integration (Week 2)

**Goal**: Wire up CI/PR automation

**Tasks**: TASK-003

**Deliverables**:
- ✅ Preflight script operational
- ✅ CI workflow integrated
- ✅ Documentation updated

**Success Criteria**:
- CI catches invalid task changes before merge
- Preflight check completes in <30 seconds

---

### Phase 4: Documentation (Week 2)

**Goal**: Finalize documentation and integration tests

**Tasks**: TASK-005

**Deliverables**:
- ✅ README.md fully updated
- ✅ Template includes quickstart
- ✅ Integration tests passing

**Success Criteria**:
- New contributors can create tasks without assistance
- Integration tests validate entire workflow

---

## Testing Strategy

### Unit Test Coverage Targets

Per `standards/testing-standards.md`:
- **Line Coverage**: ≥80%
- **Branch Coverage**: ≥70%

### Test Files Created

1. `test_scaffolder.py` (~150-200 LOC)
   - Template copying scenarios
   - Placeholder replacement edge cases
   - ID validation and uniqueness checks
   - Error handling paths

2. `test_linter_drafts.py` (~120-150 LOC)
   - Draft enforcement rules
   - Evidence file validation
   - Dependency reciprocity checks
   - Schema version gating

3. `test_operations_hooks.py` (~80-100 LOC)
   - Context auto-init on status transitions
   - Error handling and graceful degradation
   - Logging verification

4. `test_integration_workflow.py` (~100-150 LOC)
   - End-to-end task creation workflow
   - Multi-command orchestration
   - Real filesystem interactions (using tmpdir fixtures)

### Test Execution Commands

```bash
# Run all new tests
cd scripts/tasks_cli
python -m pytest tests/test_scaffolder.py tests/test_linter_drafts.py tests/test_operations_hooks.py tests/test_integration_workflow.py -v

# Run with coverage
python -m pytest tests/ --cov=scripts/tasks_cli --cov-report=term-missing

# Run integration tests only
python -m pytest tests/test_integration_workflow.py -v
```

### Integration Test Scenarios

1. **Happy Path**: Create task → populate evidence → transition to todo → verify context
2. **Draft Enforcement**: Create task → attempt transition without evidence → verify failure
3. **Preflight Validation**: Create invalid task → run preflight → verify CI failure
4. **Duplicate ID**: Attempt to create task with existing ID → verify error
5. **Context Auto-Init Failure**: Simulate context init error → verify non-fatal behavior

---

## Success Metrics

### Quantitative Metrics

| Metric | Baseline | Target | Measurement Method |
|--------|----------|--------|-------------------|
| **Task Creation Time** | ~15 min manual | ~2 min automated | Time from "need task" to "task ready for work" |
| **Adoption Rate** | 0% (no CLI) | >80% after 2 weeks | % of new tasks created via --new-task |
| **Draft Transition Errors** | Unknown (untracked) | <5% | % of tasks failing lint when moving draft→todo |
| **CI Failure Rate** | ~5% (manual errors) | <10% steady-state | % of PRs failing task-preflight checks |
| **Manual Evidence Repair** | ~30% (estimate) | 0% | Count of tasks requiring manual evidence file fixes |

### Qualitative Metrics

- **Developer Satisfaction**: Survey after 2-week pilot (target: >4/5 rating)
- **Documentation Clarity**: New contributors can create tasks without assistance
- **CI Feedback Quality**: Preflight failures include actionable error messages

### Measurement Windows

- **Week 1-2**: Baseline measurement (pre-rollout)
- **Week 3-4**: Pilot measurement (limited rollout)
- **Week 5+**: Steady-state measurement (full rollout)

---

## Risk Mitigation

### Risk 1: CLI Complexity Growth

**Likelihood**: Medium
**Impact**: Medium (harder to maintain, steeper learning curve)

**Mitigations**:
- Keep logic modular in separate `scaffolder.py` module
- Comprehensive unit tests (target: 80% coverage)
- Documentation includes troubleshooting guide
- Follow existing CLI patterns in `operations.py`, `context_store.py`

---

### Risk 2: Evidence Parsing False Positives

**Likelihood**: Medium
**Impact**: Medium (developers blocked by incorrect lint failures)

**Mitigations**:
- Require minimal evidence file structure (at least 1 entry)
- Allow opt-out via `--no-enforce-drafts` flag
- Clear error messages with recovery instructions
- Pilot on 3-5 tasks before full rollout

---

### Risk 3: Legacy Tasks Break Linting

**Likelihood**: High (many tasks predate Schema 1.1)
**Impact**: High (CI failures block all PRs)

**Mitigations**:
- Gate enforcement behind `schema_version: "1.1"` check
- Skip archived tasks in `docs/completed-tasks/`
- Incremental rollout: warning-only mode first, then enforcement
- Exception handling for tasks without schema_version field

---

### Risk 4: Template Drift

**Likelihood**: Medium
**Impact**: Medium (new tasks created with stale structure)

**Mitigations**:
- Single canonical template in version control
- Template includes schema version field
- Scaffolder validates template before copying
- CI checks ensure template stays valid

---

### Risk 5: CI Integration Failures

**Likelihood**: Medium
**Impact**: High (blocks all PRs, developer frustration)

**Mitigations**:
- Incremental rollout: pilot on select PRs first
- Preflight script has fast-fail behavior (<30s timeout)
- CI job provides clear error output with actionable messages
- Escape hatch: `[skip task-preflight]` commit message flag

---

## Rollout Plan

### Phase 0: Pre-Rollout (Week 0)

- [ ] Review implementation plan with maintainer
- [ ] Create 5 implementation tasks in `tasks/` directory
- [ ] Set up feature branch for development

### Phase 1: Foundation (Week 1, Days 1-2)

- [ ] Implement TASK-001 (scaffolder)
- [ ] Run unit tests, verify 80%+ coverage
- [ ] Manual smoke test: create 3 test tasks

### Phase 2: Parallel Development (Week 1, Days 3-4)

- [ ] Implement TASK-002 (draft enforcement) in parallel with TASK-004 (auto-init)
- [ ] Run unit tests for both, verify coverage
- [ ] Manual smoke test: enforce-drafts on 5 existing tasks

### Phase 3: Integration (Week 1, Days 5-7)

- [ ] Implement TASK-003 (preflight script)
- [ ] Add CI workflow (warning-only mode initially)
- [ ] Test CI on feature branch PRs

### Phase 4: Documentation (Week 2, Days 1-2)

- [ ] Implement TASK-005 (docs + integration tests)
- [ ] Run integration test suite
- [ ] Update agent prompts to reference new commands

### Phase 5: Pilot (Week 2, Days 3-5)

- [ ] Enable enforcement on 3-5 new tasks
- [ ] Collect feedback from task authors
- [ ] Measure adoption rate, error rate
- [ ] Iterate on error messages based on feedback

### Phase 6: Full Rollout (Week 3)

- [ ] Enable CI enforcement (error mode, not warning-only)
- [ ] Announce new workflow to team (if applicable)
- [ ] Monitor metrics for 2 weeks
- [ ] Iterate based on steady-state data

---

## Appendix A: Command Reference

### New CLI Commands

```bash
# Create a new task from template
python scripts/tasks.py --new-task \
  --area backend \
  --id TASK-1234 \
  --slug "descriptive-slug" \
  --title "Task Title" \
  --priority P1  # optional, defaults to P1

# Run linter with draft enforcement
python scripts/tasks.py --lint tasks/backend/TASK-1234.yaml --enforce-drafts

# Run preflight validation (for CI)
./scripts/task-preflight.sh tasks/backend/TASK-1234.yaml

# Makefile shortcut for preflight
make task-preflight TASKS="tasks/backend/*.yaml"
```

### Context Auto-Init (Automatic)

```bash
# When you claim a task, context is auto-initialized
python scripts/tasks.py --claim tasks/backend/TASK-1234.yaml

# Verify context was created
ls -la .agent-output/TASK-1234/
```

---

## Appendix B: File Structure Summary

### New Files Created

```
scripts/
├── tasks_cli/
│   ├── scaffolder.py                    # [TASK-001] Template scaffolding
│   └── tests/
│       ├── test_scaffolder.py           # [TASK-001] Scaffolder tests
│       ├── test_linter_drafts.py        # [TASK-002] Draft enforcement tests
│       ├── test_operations_hooks.py     # [TASK-004] Auto-init tests
│       └── test_integration_workflow.py # [TASK-005] End-to-end tests
└── task-preflight.sh                    # [TASK-003] Preflight validation script
```

### Files Modified

```
scripts/tasks_cli/
├── __main__.py           # Add --new-task, --enforce-drafts CLI commands
├── linter.py             # Add draft enforcement logic
└── operations.py         # Add context auto-init hook

Makefile                  # Add task-preflight target

.github/workflows/
└── <workflow>.yml        # Add task-preflight CI job

tasks/
└── README.md             # Document new automation workflow

docs/templates/
└── TASK-0000-template.task.yaml  # Add quickstart comments
```

---

## Appendix C: Error Codes & Exit Codes

### Scaffolder Exit Codes

| Code | Meaning | Recovery Action |
|------|---------|----------------|
| 0 | Success | N/A |
| 1 | Invalid arguments | Check --help for required flags |
| 2 | Duplicate task ID | Choose unique ID or check existing tasks |
| 3 | Template not found | Verify template exists at docs/templates/ |
| 4 | Evidence creation failed | Check write permissions on docs/evidence/ |
| 5 | Lint validation failed | Review lint output, fix YAML errors |

### Linter Exit Codes (Draft Enforcement)

| Code | Meaning | Recovery Action |
|------|---------|----------------|
| 0 | All checks passed | N/A |
| 10 | Draft missing clarifications | Add outstanding clarifications OR resolve evidence file |
| 11 | Evidence file missing | Create evidence file at clarifications.evidence_path |
| 12 | Evidence file empty | Add at least one clarification entry |
| 13 | Dependency reciprocity broken | Ensure depends_on ↔ blocked_by are symmetric |

### Preflight Script Exit Codes

| Code | Meaning | Recovery Action |
|------|---------|----------------|
| 0 | All checks passed | N/A |
| 1 | Lint validation failed | Fix YAML errors in task file |
| 2 | Cycle detected | Review --graph output, remove circular dependencies |
| 3 | Multiple task failures | Review individual task errors above |

---

## Appendix D: Migration Considerations

### Existing Tasks (Pre-Schema 1.1)

**Strategy**: Graceful degradation

- Draft enforcement is **gated behind `schema_version: "1.1"`**
- Tasks without `schema_version` field are **skipped** during enforcement
- Archived tasks in `docs/completed-tasks/` are **excluded** from all checks

### Incremental Adoption

**Option 1: Opt-In (Recommended for Pilot)**
- Add `--enforce-drafts` flag to lint command
- Developers explicitly enable enforcement per task
- Collect feedback during 2-week pilot

**Option 2: Opt-Out (For Full Rollout)**
- Enable enforcement by default for Schema 1.1 tasks
- Add `--no-enforce-drafts` escape hatch for exceptions
- Monitor error rate, iterate on rules

### Template Migration

**Current Template**: `docs/templates/TASK-0000-template.task.yaml` (169 lines)

**Changes Required**:
- Add quickstart comment block (10 lines)
- No schema changes needed (template already Schema 1.1)

**Migration Risk**: Low (additive changes only)

---

## Next Steps

1. **Review this plan** with maintainer/stakeholders
2. **Create 5 implementation tasks** using the `--new-task` command (once implemented) or manually
3. **Start with TASK-001** (Foundation) to establish scaffolding infrastructure
4. **Execute Sessions 2 & 4 in parallel** to save ~30 minutes
5. **Complete integration** (Session 3) once parallel work is done
6. **Finalize documentation** (Session 5) and prepare for rollout

---

**Document Version**: 1.0
**Last Updated**: 2025-11-17
**Next Review**: After Phase 1 completion (Foundation)
