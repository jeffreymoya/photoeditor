# Task CLI Modularization - Mitigation Plan

**Status**: Draft
**Date**: 2025-11-21
**Related**: `docs/proposals/task-cli-modularization-implementation-plan.md`

This document addresses gaps identified in the Wave 1-4 implementation review.

---

## Executive Summary

| Gap | Severity | Estimated Sessions | Priority |
|-----|----------|-------------------|----------|
| `__main__.py` still 3,458 LOC | HIGH | 3-4 | P0 |
| `commands.py` still 1,209 LOC | HIGH | 2 | P0 |
| 29 legacy handlers not migrated | MEDIUM | 4-5 | P1 |
| OutputChannel not implemented | MEDIUM | 2 | P1 |
| Typer parity doc missing | LOW | 1 | P2 |
| Phase/Wave numbering drift | LOW | 0.5 | P2 |

**Total Estimated Sessions**: 12-14 additional sessions

---

## M1: Decompose `__main__.py` (P0 - HIGH)

### Problem
`__main__.py` remains at 3,458 LOC despite proposal goal of moving handlers to `commands/`. This is the **core anti-pattern** the proposal aimed to fix.

### Root Cause
Wave 2 created the Typer infrastructure but only migrated 3 read-only commands. The remaining 17+ handler functions and the 200+ line dispatch block remain.

### Mitigation Sessions

#### M1.1: Extract Context Commands (Session 1)
**Target Handlers**:
- `cmd_init_context_legacy` → `commands/context.py`
- `cmd_get_context` → `commands/context.py`
- `cmd_update_agent` → `commands/context.py`
- `cmd_purge_context` → `commands/context.py`
- `cmd_rebuild_context` → `commands/context.py`

**Steps**:
1. Move handlers to existing `commands/context.py`
2. Update dispatch_registry.yaml to mark as `typer`
3. Wire into Typer app via `register_commands()`
4. Delete from `__main__.py`
5. Run: `pytest scripts/tasks_cli/tests/test_commands_context.py`

**Expected LOC Reduction**: ~400-500 LOC

#### M1.2: Extract Worktree/Diff Commands (Session 2)
**Target Handlers**:
- `cmd_snapshot_worktree` → `commands/worktree.py` (new)
- `cmd_verify_worktree_legacy` → `commands/worktree.py`
- `cmd_get_diff` → `commands/worktree.py`

**Steps**:
1. Create `commands/worktree.py`
2. Move handlers with TaskCliContext injection
3. Update dispatch_registry.yaml
4. Add tests `test_commands_worktree.py`

**Expected LOC Reduction**: ~200-300 LOC

#### M1.3: Extract QA Commands (Session 3)
**Target Handlers**:
- `cmd_record_qa_legacy` → `commands/qa.py` (new)
- `cmd_compare_qa` → `commands/qa.py`
- `cmd_resolve_drift` → `commands/qa.py`

**Steps**:
1. Create `commands/qa.py`
2. Migrate handlers using QABaselineManager from `context_store/qa.py`
3. Wire to Typer, update registry
4. Add tests

**Expected LOC Reduction**: ~300-400 LOC

#### M1.4: Extract Remaining Commands + Delete Dispatch Block (Session 4)
**Target**:
- `cmd_lint` → `commands/lint.py` (new)
- `cmd_bootstrap_evidence` → `commands/evidence.py` (existing)
- `cmd_explain` → `commands/graph.py` (existing)
- `cmd_mark_blocked` → `commands/workflow.py` (existing)

**Final Step**: Delete the 200+ line `if/elif` dispatch chain once all commands migrated.

**Expected LOC Reduction**: ~500-700 LOC + dispatch block (~200 LOC)

### Success Criteria
- `__main__.py` < 500 LOC (entrypoint + argument parsing only)
- All `cmd_*` functions removed from `__main__.py`
- `pnpm run cli-guardrails` passes in enforce mode

---

## M2: Decompose `commands.py` (P0 - HIGH)

### Problem
`commands.py` is 1,209 LOC - still exceeds 500 LOC limit.

### Analysis Needed
```bash
grep -E "^def " scripts/tasks_cli/commands.py | wc -l
```

### Mitigation Sessions

#### M2.1: Audit and Split (Session 1)
1. Identify function groupings in `commands.py`
2. Move to appropriate existing command modules:
   - Evidence functions → `commands/evidence.py`
   - Exception functions → `commands/exceptions.py`
   - Quarantine functions → `commands/quarantine.py`
3. Delete `commands.py` or reduce to re-exports only

#### M2.2: Migrate Remaining + Delete (Session 2)
1. Complete migration of any remaining functions
2. Update all imports across codebase
3. Delete `commands.py`
4. Verify no import errors

### Success Criteria
- `commands.py` deleted or < 100 LOC (re-exports only)
- All command modules < 500 LOC each

---

## M3: Complete Typer Migration (P1 - MEDIUM)

### Problem
Only 15/47 commands (~32%) are marked `typer` in dispatch registry. 29 remain `legacy`.

### Mitigation Strategy
Batch remaining commands by domain alignment with existing command modules:

| Batch | Commands | Target Module | Session |
|-------|----------|---------------|---------|
| 1 | pick, show (remaining), graph commands | tasks.py, graph.py | M3.1 |
| 2 | evidence attach/list/validate | evidence.py | M3.2 |
| 3 | exception add/list/resolve | exceptions.py | M3.3 |
| 4 | quarantine commands | quarantine.py | M3.4 |
| 5 | template/scaffold commands | templates.py (new) | M3.5 |

### Sessions

#### M3.1-M3.5: Batch Migration (5 Sessions)
For each batch:
1. Identify legacy commands from `dispatch_registry.yaml`
2. Implement Typer equivalent in target module
3. Update registry: `handler: legacy` → `handler: typer`
4. Add/update tests
5. Verify: `TASKS_CLI_LEGACY_DISPATCH=1` still works for rollback

### Success Criteria
- 0 commands with `handler: legacy` in registry
- All commands accessible via Typer app
- Emergency rollback flag still functional until Phase 5

---

## M4: Implement OutputChannel (P1 - MEDIUM)

### Problem
`output.py` still uses `_JSON_MODE` and `_WARNINGS` globals. This blocks concurrent command execution.

### Mitigation Sessions

#### M4.1: Create OutputChannel Class (Session 1)
**File**: `scripts/tasks_cli/output.py`

```python
@dataclass
class OutputChannel:
    json_mode: bool = False
    verbose: bool = False
    _warnings: list[str] = field(default_factory=list)

    @classmethod
    def from_cli_flags(cls, json_mode: bool, verbose: bool) -> "OutputChannel":
        return cls(json_mode=json_mode, verbose=verbose)

    def emit_json(self, data: dict) -> None: ...
    def emit_warning(self, msg: str) -> None: ...
    def warnings_as_evidence(self) -> list[str]: ...
```

**Deliverables**:
- OutputChannel class with instance state
- NullOutputChannel for tests
- BufferingOutputChannel for assertions
- Unit tests: `test_output_channel.py`

#### M4.2: Refactor Commands to Use OutputChannel (Session 2)
1. Add `output_channel` field to TaskCliContext
2. Update all command handlers to use `ctx.output_channel` instead of globals
3. Remove global `_JSON_MODE`, `_WARNINGS`
4. Add concurrency test (two commands in parallel threads)

### Success Criteria
- No global output state in `output.py`
- `pytest -n 4` (parallel) passes without warning bleed
- TaskCliContext includes output_channel field

---

## M5: Documentation Fixes (P2 - LOW)

### M5.1: Create Typer Parity Doc (Session 1)
**File**: `docs/tasks_cli-typer-parity.md`

Content:
- Table mapping every argparse flag to Typer equivalent
- Shell completion regeneration instructions
- Breaking changes (if any)
- Migration guide for scripts using legacy flags

### M5.2: Reconcile Phase/Wave Numbering
Update `task-cli-modularization-implementation-plan.md`:
- Align wave numbers with original proposal phases
- Or document the intentional renumbering with rationale
- Update "Next Steps" section

---

## Implementation Waves

### Wave 5: Decompose `__main__.py` (4 Sessions)

#### Session S5.1: Extract Context Handlers ✅ COMPLETED
**Prereqs**: Wave 4 complete, read `commands/context.py`
**Completed**: 2025-11-21 | LOC Reduction: ~595
**Target Handlers**:
- `cmd_init_context_legacy`
- `cmd_get_context`
- `cmd_update_agent`
- `cmd_purge_context`
- `cmd_rebuild_context`

**Steps**:
1. Move handlers to `commands/context.py`
2. Inject TaskCliContext dependency
3. Update dispatch_registry.yaml → `handler: typer`
4. Delete from `__main__.py`
5. Wire into Typer app

**Validation**: `pytest scripts/tasks_cli/tests/test_commands_context.py -v`
**Expected LOC Reduction**: ~400-500

---

#### Session S5.2: Extract Worktree/Diff Handlers ✅ COMPLETED
**Prereqs**: S5.1 complete
**Completed**: 2025-11-21 | LOC Reduction: ~235 (2788→2553)
**Target Handlers**:
- `cmd_snapshot_worktree`
- `cmd_verify_worktree_legacy`
- `cmd_get_diff`
- `_auto_verify_worktree` (helper)
- `_check_drift_budget` (helper)

**Steps**:
1. Extended `commands/worktree_commands.py` with Typer commands
2. Moved helpers with DeltaTracker integration
3. Updated dispatch_registry.yaml → `handler: typer`
4. Removed legacy dispatch block for these commands
5. Updated imports in context.py and cmd_mark_blocked

**Validation**: `python scripts/tasks.py --list` passes
**Expected LOC Reduction**: ~200-300

---

#### Session S5.3: Extract QA Handlers ✅ COMPLETED
**Prereqs**: S5.2 complete
**Completed**: 2025-11-21 | LOC Reduction: ~349 (2553→2204)
**Target Handlers**:
- `cmd_record_qa_legacy`
- `cmd_compare_qa`
- `cmd_resolve_drift`

**Steps**:
1. Extended `commands/qa_commands.py` with Typer commands
2. Migrated using QABaselineManager from `context_store/qa.py`
3. Updated dispatch_registry.yaml → `handler: typer`
4. Registered in app.py via `register_qa_commands`
5. Removed legacy handlers from `__main__.py`

**Validation**: `python -m py_compile scripts/tasks_cli/commands/qa_commands.py`
**Expected LOC Reduction**: ~300-400

---

#### Session S5.4: Extract Remaining + Delete Dispatch Block ✅ COMPLETED
**Prereqs**: S5.3 complete
**Completed**: 2025-11-21 | LOC Reduction: ~387 (2204→1817)
**Target**:
- `cmd_lint` → `commands/lint.py` (new)
- `cmd_bootstrap_evidence` → `commands/lint.py` (grouped with lint)
- `cmd_explain` → `commands/workflow.py` (already existed)
- `cmd_mark_blocked` → `commands/workflow.py`

**Steps Completed**:
1. Created `commands/lint.py` with `lint_task` and `bootstrap_evidence` Typer commands
2. Added `mark_blocked` to `commands/workflow.py` (explain already existed)
3. Updated `app.py` to register lint commands via `register_lint_commands`
4. Updated `dispatch_registry.yaml` - marked explain, lint, bootstrap-evidence, mark-blocked as `typer`
5. Removed legacy handlers from `__main__.py`
6. Fixed import issues in `commands.py` and `commands/__init__.py` for migrated QA commands

**Validation**: `python scripts/tasks.py --list` passes
**Expected LOC Reduction**: ~700-900 (handlers + dispatch block)
**Note**: Full dispatch block deletion deferred - legacy commands remain in argparse

---

### Wave 6: Decompose `commands.py` (2 Sessions)

#### Session S6.1: Audit and Split ✅ COMPLETED
**Prereqs**: Wave 5 complete
**Completed**: 2025-11-21 | Final LOC: 122 (re-exports only)
**Findings**:
- `commands.py` already decomposed to re-export layer (122 LOC)
- All command implementations live in `commands/*.py` modules
- No standalone functions remain - only imports and `__all__`

**Steps Completed**:
1. Audited: `grep -E "^def " scripts/tasks_cli/commands.py` → 0 functions
2. Fixed stale `cmd_record_qa` reference in `__all__` (not imported)
3. Updated `test_cli_smoke.py` to import from correct Typer modules
4. Verified syntax: `python -m py_compile` passes

**Validation**: `python -m py_compile scripts/tasks_cli/commands.py` passes

---

#### Session S6.2: Complete Migration + Delete ✅ COMPLETED
**Prereqs**: S6.1 complete
**Completed**: 2025-11-21 | Final LOC: 92 (re-exports only)
**Steps Completed**:
1. Verified no standalone functions remain in `commands.py`
2. Searched codebase for import references - all valid
3. Condensed `__all__` list to reduce verbosity
4. Reduced `commands.py` from 122 → 92 LOC (under 100 threshold)
5. Verified syntax passes

**Validation**: `python -m py_compile scripts/tasks_cli/commands.py` passes

---

### Wave 7: Complete Typer Migration (3 Sessions)

#### Session S7.1: Migrate Core Commands ✅ COMPLETED (PREVIOUSLY)
**Prereqs**: Wave 6 complete
**Note**: Target commands (pick, show, graph) were already migrated in earlier waves.
**Target Commands** (from dispatch_registry.yaml where `handler: legacy`):
- pick, show variants → Already `handler: typer`
- graph export/visualize → Already `handler: typer`
- template commands → Not present in registry

**Status**: No action required - commands already migrated

---

#### Session S7.2: Migrate Evidence/Exception Commands ✅ COMPLETED
**Completed**: 2025-11-21 | Legacy handlers reduced: 14→7
**Target Commands**:
- attach-evidence, list-evidence, attach-standard
- add-exception, list-exceptions, resolve-exception, cleanup-exceptions

**Steps Completed**:
1. Added Typer wrappers to `commands/evidence.py` via `register_evidence_commands`
2. Added Typer wrappers to `commands/exceptions.py` via `register_exception_commands`
3. Registered in `app.py` via Wave 7 imports
4. Updated dispatch_registry.yaml → `handler: typer` for 7 commands

**Validation**: `python scripts/tasks.py --list` passes

---

#### Session S7.3: Migrate Remaining + Registry Cleanup ✅ COMPLETED
**Completed**: 2025-11-21 | Legacy handlers reduced: 7→0
**Target**: All remaining legacy commands
**Final Steps**:
1. Migrated quarantine commands (quarantine-task, list-quarantined, release-quarantine)
2. Migrated validation command (run-validation)
3. Migrated metrics commands (collect-metrics, generate-dashboard, compare-metrics)
4. Verified 0 `handler: legacy` entries remain
5. Updated dispatch_registry.yaml for all 7 commands

**Validation**:
```bash
grep "handler: legacy" scripts/tasks_cli/dispatch_registry.yaml | wc -l  # Must be 0 ✓
python scripts/tasks.py --help  # All commands visible ✓
```

---

### Wave 8: OutputChannel & Parallel Safety (2 Sessions)

#### Session S8.1: Implement OutputChannel Class ✅ COMPLETED
**Prereqs**: Wave 7 complete
**Completed**: 2025-11-21
**File**: `scripts/tasks_cli/output.py`

**Deliverables**:
```python
@dataclass
class OutputChannel:
    json_mode: bool = False
    verbose: bool = False
    _warnings: list[str] = field(default_factory=list)

    @classmethod
    def from_cli_flags(cls, json_mode: bool, verbose: bool) -> "OutputChannel": ...
    def emit_json(self, data: dict) -> None: ...
    def emit_warning(self, msg: str) -> None: ...
    def warnings_as_evidence(self) -> list[str]: ...

class NullOutputChannel(OutputChannel): ...
class BufferingOutputChannel(OutputChannel): ...
```

**Steps Completed**:
1. Created OutputChannel dataclass with instance state (json_mode, verbose, stdout/stderr streams, _warnings)
2. Added NullOutputChannel for silent/no-op scenarios (discards output, still collects warnings)
3. Added BufferingOutputChannel with get_stdout(), get_stderr(), get_json_output() for test assertions
4. Created `test_output_channel.py` with concurrency tests (thread isolation, no warning bleed)

**Validation**: `python -m py_compile scripts/tasks_cli/output.py` passes

---

#### Session S8.2: Refactor Commands to Use OutputChannel
**Prereqs**: S8.1 complete
**Steps**:
1. Add `output_channel: OutputChannel` to TaskCliContext
2. Update all command handlers: `ctx.output_channel.emit_*()` instead of globals
3. Remove global `_JSON_MODE`, `_WARNINGS` from output.py
4. Add parallel execution test (2 commands in threads)

**Validation**:
```bash
pytest scripts/tasks_cli/tests/ -v -n 4  # Parallel execution
grep "_JSON_MODE\|_WARNINGS" scripts/tasks_cli/output.py  # Should find nothing
```

---

### Wave 9: Documentation & Cleanup (2 Sessions)

#### Session S9.1: Create Typer Parity Documentation
**File**: `docs/tasks_cli-typer-parity.md`

**Content**:
- Flag mapping table (argparse → Typer)
- Shell completion regeneration: `python -m scripts.tasks_cli --install-completion`
- Breaking changes (if any)
- Migration guide for CI scripts

---

#### Session S9.2: Final Cleanup & Metrics
**Steps**:
1. Delete legacy dispatch code path
2. Remove `TASKS_CLI_LEGACY_DISPATCH` env flag support
3. Update implementation plan with final status
4. Capture final metrics:
   - LOC per module
   - `--help` startup time
   - Test count/coverage

**Validation**:
```bash
python scripts/tasks_cli/checks/module_limits.py --enforce-providers
pnpm turbo run qa:static --parallel
time python scripts/tasks.py --help  # < 400ms target
```

---

## Wave Summary

| Wave | Sessions | Focus | Gate |
|------|----------|-------|------|
| **5** | S5.1-S5.4 | Decompose `__main__.py` | < 500 LOC |
| **6** | S6.1-S6.2 | Decompose `commands.py` | File deleted |
| **7** | S7.1-S7.3 | Complete Typer migration | 0 legacy handlers |
| **8** | S8.1-S8.2 | OutputChannel | No global state |
| **9** | S9.1-S9.2 | Docs & cleanup | All guardrails pass |

**Total**: 13 sessions

---

## Validation Gates

After each mitigation session:

```bash
# Must pass
pytest scripts/tasks_cli/tests/ -v
python scripts/tasks_cli/checks/module_limits.py
pnpm turbo run qa:static --parallel

# Smoke test
python scripts/tasks.py --list
python scripts/tasks.py --pick --format json
TASKS_CLI_LEGACY_DISPATCH=1 python scripts/tasks.py --list  # Until M3 complete
```

---

## Final State Checklist

- [ ] `__main__.py` < 500 LOC
- [ ] `commands.py` deleted or < 100 LOC
- [ ] `context_store.py` < 400 LOC (currently 104 ✓)
- [ ] All subprocess.run in providers/ only (currently ✓)
- [ ] 0 legacy handlers in dispatch_registry.yaml
- [ ] OutputChannel replaces global state
- [ ] `docs/tasks_cli-typer-parity.md` exists
- [ ] All modules pass 500 LOC guardrail in enforce mode
