# Task CLI Typer Parity Table

This document tracks the migration of legacy argparse CLI flags to the Typer-based command interface.

**Last Updated:** 2025-11-21

## Migration Status Summary

| Status | Count |
|--------|-------|
| Migrated | 12 |
| Pending | 26 |
| N/A (Supporting args) | ~30 |

## Core Task Commands

| Legacy Flag | Typer Command | Status | Notes |
|-------------|---------------|--------|-------|
| `--list [FILTER]` | `tasks list [FILTER]` | Migrated | Wave 1 - commands/tasks.py |
| `--pick [FILTER]` | `tasks pick [FILTER]` | Migrated | Wave 2 - commands/workflow.py |
| `--validate` | `tasks validate` | Migrated | Wave 1 - commands/tasks.py |
| `--refresh-cache` | `tasks refresh-cache` | Migrated | Wave 2 - commands/graph.py |
| `--graph` | `tasks graph` | Migrated | Wave 2 - commands/graph.py |
| `--claim TASK_PATH` | `tasks claim TASK_PATH` | Migrated | Wave 2 - commands/workflow.py |
| `--complete TASK_PATH` | `tasks complete TASK_PATH` | Migrated | Wave 2 - commands/workflow.py |
| `--archive TASK_PATH` | `tasks archive TASK_PATH` | Migrated | Wave 2 - commands/workflow.py |
| `--explain TASK_ID` | `tasks explain TASK_ID` | Migrated | Wave 2 - commands/workflow.py |
| `--check-halt` | `tasks check-halt` | Migrated | Wave 2 - commands/graph.py |
| `--lint TASK_PATH` | `tasks lint TASK_PATH` | Pending | Wave 5 |
| `--bootstrap-evidence TASK_ID` | `tasks bootstrap-evidence TASK_ID` | Pending | Wave 5 |

## New Commands (Typer-only)

| Typer Command | Status | Notes |
|---------------|--------|-------|
| `tasks show TASK_ID` | Migrated | Wave 1 - new command, no legacy equivalent |
| `tasks version` | Migrated | app.py |

## Context Cache Commands (Phase 2)

| Legacy Flag | Typer Command | Status | Notes |
|-------------|---------------|--------|-------|
| `--init-context TASK_ID` | `tasks init-context TASK_ID` | Migrated | commands/init_context.py |
| `--get-context TASK_ID` | `tasks context get TASK_ID` | Migrated | commands/context.py |
| `--update-agent TASK_ID` | `tasks context update-agent TASK_ID` | Pending | Wave 5 |
| `--mark-blocked TASK_ID` | `tasks context mark-blocked TASK_ID` | Pending | Wave 5 |
| `--purge-context TASK_ID` | `tasks context purge TASK_ID` | Pending | Wave 5 |
| `--rebuild-context TASK_ID` | `tasks context rebuild TASK_ID` | Pending | Wave 5 |

## Delta Tracking Commands (Day 6)

| Legacy Flag | Typer Command | Status | Notes |
|-------------|---------------|--------|-------|
| `--snapshot-worktree TASK_ID` | `tasks worktree snapshot TASK_ID` | Pending | Wave 5 |
| `--verify-worktree TASK_ID` | `tasks worktree verify TASK_ID` | Pending | Wave 5 |
| `--get-diff TASK_ID` | `tasks worktree diff TASK_ID` | Pending | Wave 5 |
| `--record-qa TASK_ID` | `tasks qa record TASK_ID` | Pending | Wave 5 |
| `--compare-qa TASK_ID` | `tasks qa compare TASK_ID` | Pending | Wave 5 |
| `--resolve-drift TASK_ID` | `tasks qa resolve-drift TASK_ID` | Pending | Wave 5 |

## Evidence and Standards Commands (Session S13)

| Legacy Flag | Typer Command | Status | Notes |
|-------------|---------------|--------|-------|
| `--attach-evidence TASK_ID` | `tasks evidence attach TASK_ID` | Migrated | commands/evidence.py |
| `--list-evidence TASK_ID` | `tasks evidence list TASK_ID` | Migrated | commands/evidence.py |
| `--attach-standard TASK_ID` | `tasks evidence attach-standard TASK_ID` | Pending | Wave 5 |

## Exception Ledger Commands (Session S13)

| Legacy Flag | Typer Command | Status | Notes |
|-------------|---------------|--------|-------|
| `--add-exception TASK_ID` | `tasks exceptions add TASK_ID` | Migrated | commands/exceptions.py |
| `--list-exceptions` | `tasks exceptions list` | Migrated | commands/exceptions.py |
| `--resolve-exception TASK_ID` | `tasks exceptions resolve TASK_ID` | Pending | Wave 5 |
| `--cleanup-exceptions TASK_ID` | `tasks exceptions cleanup TASK_ID` | Pending | Wave 5 |

## Quarantine Commands (Session S13)

| Legacy Flag | Typer Command | Status | Notes |
|-------------|---------------|--------|-------|
| `--quarantine-task TASK_ID` | `tasks quarantine add TASK_ID` | Migrated | commands/quarantine.py |
| `--list-quarantined` | `tasks quarantine list` | Migrated | commands/quarantine.py |
| `--release-quarantine TASK_ID` | `tasks quarantine release TASK_ID` | Pending | Wave 5 |

## Validation Commands (Session S15)

| Legacy Flag | Typer Command | Status | Notes |
|-------------|---------------|--------|-------|
| `--run-validation TASK_ID` | `tasks validation run TASK_ID` | Migrated | commands/validation_commands.py |
| `--collect-metrics TASK_ID` | `tasks metrics collect TASK_ID` | Migrated | commands/metrics_commands.py |
| `--generate-dashboard` | `tasks metrics dashboard` | Pending | Wave 5 |
| `--compare-metrics` | `tasks metrics compare` | Pending | Wave 5 |

## Supporting Arguments

These arguments modify command behavior and are implemented as Typer options:

| Argument | Applicable Commands | Status |
|----------|---------------------|--------|
| `--format {text,json}` | list, pick, validate, explain, check-halt | Migrated |
| `--base-commit SHA` | init-context | Migrated |
| `--agent {implementer,reviewer,validator}` | update-agent, snapshot-worktree, resolve-drift | Pending |
| `--status {pending,in_progress,done,blocked}` | update-agent | Pending |
| `--session-id ID` | update-agent | Pending |
| `--finding TEXT` | mark-blocked | Pending |
| `--note TEXT` | resolve-drift | Pending |
| `--type TYPE` | attach-evidence | Migrated |
| `--path PATH` | attach-evidence | Migrated |
| `--description TEXT` | attach-evidence | Migrated |
| `--metadata JSON` | attach-evidence | Pending |
| `--file FILE` | attach-standard | Pending |
| `--section SECTION` | attach-standard | Pending |
| `--exception-type TYPE` | add-exception | Migrated |
| `--message TEXT` | add-exception | Migrated |
| `--owner OWNER` | add-exception | Pending |
| `--notes TEXT` | resolve-exception | Pending |
| `--trigger TRIGGER` | cleanup-exceptions | Pending |
| `--reason REASON` | quarantine-task | Migrated |
| `--error-details TEXT` | quarantine-task | Pending |
| `--command-id ID` | run-validation | Migrated |
| `--command CMD` | run-validation | Migrated |
| `--exit-code CODE` | record-qa | Pending |
| `--log-path PATH` | Various | Pending |
| `--cwd DIR` | run-validation | Pending |
| `--package PKG` | run-validation | Pending |
| `--env KEY=VALUE` | run-validation | Pending |
| `--allow-preexisting-dirty` | init-context, verify-worktree | Pending |

## Migration Waves

### Wave 1 (Complete)
- `list`, `validate`, `show` - Read-only query commands

### Wave 2 (Complete)
- `pick`, `claim`, `complete`, `archive`, `explain`, `graph`, `refresh-cache`, `check-halt` - Workflow and graph commands

### Wave 3 (Complete)
- Context management commands (`init-context`, `get-context`)
- Evidence commands (`attach-evidence`, `list-evidence`)
- Exception commands (`add-exception`, `list-exceptions`)
- Quarantine commands (`quarantine-task`, `list-quarantined`)
- Validation commands (`run-validation`)
- Metrics commands (`collect-metrics`)

### Wave 5 (Planned)
- Remaining context commands (`update-agent`, `mark-blocked`, `purge-context`, `rebuild-context`)
- Remaining delta tracking commands
- Remaining evidence/exception/quarantine commands
- `lint`, `bootstrap-evidence`

## Testing Parity

To verify parity between legacy and Typer implementations:

```bash
# Compare JSON output
python scripts/tasks.py pick --format json  # Uses Typer
TASKS_CLI_LEGACY_DISPATCH=1 python scripts/tasks.py --pick --format json  # Uses legacy
diff <(cmd1) <(cmd2)  # Output should match
```

## Notes

1. **Dual-dispatch registry**: Both legacy (`--flag`) and Typer (`command`) syntax are supported during transition
2. **JSON output**: All commands support `--format json` for machine-readable output
3. **Exit codes**: Preserved between legacy and Typer implementations
4. **Environment variable**: `TASKS_CLI_LEGACY_DISPATCH=1` forces legacy argparse path
