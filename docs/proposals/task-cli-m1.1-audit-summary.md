# M1.1 Audit Summary: Legacy Dispatch Dependencies

**Task**: Audit Legacy Dispatch Dependencies
**Date**: 2025-11-23
**Effort**: 2 hours
**Status**: ✅ COMPLETED

## Executive Summary

All 22 legacy command function calls in `__main__.py` have been successfully migrated to Typer. **100% Typer coverage achieved** - zero unmigrated commands found.

### Key Findings

1. **All commands have Typer equivalents**: Every legacy cmd_* function called in the dispatch chain (lines 1717-1806) has a corresponding Typer @app.command() registration.

2. **4 dead code paths identified**: The following legacy function calls will fail if invoked because the functions no longer exist:
   - `cmd_get_context` (line 1732)
   - `cmd_update_agent` (line 1735)
   - `cmd_purge_context` (line 1740)
   - `cmd_rebuild_context` (line 1743)

   These were migrated to Typer but the legacy dispatch code was not removed, creating broken code paths.

3. **2 functions still defined in __main__.py**: Only `cmd_list` and `cmd_validate` are actually implemented in __main__.py itself (lines 218-291). All other cmd_* functions are imported from the commands/ package.

4. **Legacy dispatch chain location**: Lines 1703-1818 in `__main__.py` contain the entire legacy argparse-based dispatch logic.

## Detailed Audit Results

### CSV Mapping

Created `docs/proposals/task-cli-m1.1-legacy-dispatch-audit.csv` with complete mapping:
- 22 legacy function calls documented
- All mapped to Typer equivalents
- Migration status verified
- All marked as safe to delete

### Migration Status Breakdown

| Status | Count | Commands |
|--------|-------|----------|
| ✅ **MIGRATED** | 18 | All evidence, exceptions, quarantine, validation, metrics, list, validate, init-context commands |
| ⚠️ **BROKEN** | 4 | get-context, update-agent, purge-context, rebuild-context (functions deleted but dispatch not removed) |
| **TOTAL** | 22 | 100% coverage |

### Typer Command Registrations

All commands registered in `app.py` via 12 command group modules:
- `commands/tasks.py` - list, validate, show
- `commands/context.py` - init-context, get-context, update-agent, purge-context, rebuild-context, migrate, info, validate
- `commands/workflow.py` - pick, claim, complete, archive, explain, mark-blocked
- `commands/graph.py` - graph, refresh-cache, check-halt
- `commands/evidence.py` - attach-evidence, list-evidence, attach-standard
- `commands/exceptions.py` - add-exception, list-exceptions, resolve-exception, cleanup-exceptions
- `commands/quarantine.py` - quarantine-task, list-quarantined, release-quarantine
- `commands/validation_commands.py` - run-validation
- `commands/metrics_commands.py` - collect-metrics, generate-dashboard, compare-metrics
- `commands/qa_commands.py` - record-qa, compare-qa, resolve-drift
- `commands/lint.py` - lint, bootstrap-evidence
- `commands/worktree_commands.py` - snapshot-worktree, verify-worktree, get-diff

## Acceptance Criteria Verification

- [x] **CSV mapping created**: `docs/proposals/task-cli-m1.1-legacy-dispatch-audit.csv` contains all 22 legacy functions with Typer mappings
- [x] **Zero unmigrated commands found**: All 22 commands have Typer equivalents - 100% migration complete
- [x] **Checklist of functions safe to delete**: All 22 legacy dispatch elif branches (lines 1717-1806) are safe to delete

## Functions Safe to Delete

### In __main__.py

**Legacy dispatch chain** (lines 1703-1818):
- All 22 elif branches in the legacy dispatch chain
- `cmd_list()` function definition (lines 218-260) - replaced by commands/tasks.py
- `cmd_validate()` function definition (lines 263-291) - replaced by commands/tasks.py
- All argparse argument definitions for legacy commands

**Note**: The 4 broken function calls (cmd_get_context, cmd_update_agent, cmd_purge_context, cmd_rebuild_context) were already deleted from the codebase - only the dispatch calls remain.

## Recommendation

**Proceed immediately to M1.2: Delete Legacy Dispatch Chain**

All prerequisites met:
- ✅ 100% Typer coverage verified
- ✅ All legacy functions mapped
- ✅ Zero blockers found
- ✅ CSV audit trail created

The legacy dispatch chain (lines 1703-1818) can be safely deleted in its entirety. The only code that should remain in `__main__.py` is:
1. Repository root detection
2. Context/datastore initialization
3. Typer app invocation via `app.initialize_commands()` and `app.main()`

Estimated __main__.py size after cleanup: **150-200 LOC** (from current 1,817 LOC) - achieving the 90%+ reduction target.

## Artifacts

1. **Audit CSV**: `docs/proposals/task-cli-m1.1-legacy-dispatch-audit.csv`
2. **This summary**: `docs/proposals/task-cli-m1.1-audit-summary.md`

## Next Steps

1. Review this audit with stakeholders
2. Proceed to **M1.2: Delete Legacy Dispatch Chain** (4 hour effort)
3. Target: Reduce __main__.py from 1,817 LOC to <200 LOC
