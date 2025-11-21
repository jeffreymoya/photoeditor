# Task CLI Typer Parity Table

This document tracks the migration of legacy argparse CLI flags to the Typer-based command interface.

**Last Updated:** 2025-11-21 (Wave 9, Session S9.1 - Complete)

## Migration Status Summary

| Status | Count |
|--------|-------|
| Migrated | 38 |
| Pending | 0 |

**All commands have been migrated to Typer.**

---

## Core Task Commands

| Legacy Flag | Typer Command | Module | Status |
|-------------|---------------|--------|--------|
| `--list [FILTER]` | `list [FILTER]` | commands/tasks.py | Migrated |
| `--pick [FILTER]` | `pick [FILTER]` | commands/tasks.py | Migrated |
| `--validate` | `validate` | commands/tasks.py | Migrated |
| `--refresh-cache` | `refresh-cache` | commands/tasks.py | Migrated |
| `--graph` | `graph` | commands/graph.py | Migrated |
| `--claim TASK_PATH` | `claim TASK_PATH` | commands/workflow.py | Migrated |
| `--complete TASK_PATH` | `complete TASK_PATH` | commands/workflow.py | Migrated |
| `--archive TASK_PATH` | `archive TASK_PATH` | commands/workflow.py | Migrated |
| `--explain TASK_ID` | `explain TASK_ID` | commands/workflow.py | Migrated |
| `--check-halt` | `check-halt` | commands/workflow.py | Migrated |
| `--lint TASK_PATH` | `lint TASK_PATH` | commands/lint.py | Migrated |
| `--bootstrap-evidence TASK_ID` | `bootstrap-evidence TASK_ID` | commands/lint.py | Migrated |

## Context Cache Commands

| Legacy Flag | Typer Command | Module | Status |
|-------------|---------------|--------|--------|
| `--init-context TASK_ID` | `init-context TASK_ID` | commands/context.py | Migrated |
| `--get-context TASK_ID` | `get-context TASK_ID` | commands/context.py | Migrated |
| `--update-agent TASK_ID` | `update-agent TASK_ID` | commands/context.py | Migrated |
| `--mark-blocked TASK_ID` | `mark-blocked TASK_ID` | commands/workflow.py | Migrated |
| `--purge-context TASK_ID` | `purge-context TASK_ID` | commands/context.py | Migrated |
| `--rebuild-context TASK_ID` | `rebuild-context TASK_ID` | commands/context.py | Migrated |

## Delta Tracking Commands

| Legacy Flag | Typer Command | Module | Status |
|-------------|---------------|--------|--------|
| `--snapshot-worktree TASK_ID` | `snapshot-worktree TASK_ID` | commands/worktree_commands.py | Migrated |
| `--verify-worktree TASK_ID` | `verify-worktree TASK_ID` | commands/worktree_commands.py | Migrated |
| `--get-diff TASK_ID` | `get-diff TASK_ID` | commands/worktree_commands.py | Migrated |
| `--record-qa TASK_ID` | `record-qa TASK_ID` | commands/qa_commands.py | Migrated |
| `--compare-qa TASK_ID` | `compare-qa TASK_ID` | commands/qa_commands.py | Migrated |
| `--resolve-drift TASK_ID` | `resolve-drift TASK_ID` | commands/qa_commands.py | Migrated |

## Evidence Commands

| Legacy Flag | Typer Command | Module | Status |
|-------------|---------------|--------|--------|
| `--attach-evidence TASK_ID` | `attach-evidence TASK_ID` | commands/evidence.py | Migrated |
| `--list-evidence TASK_ID` | `list-evidence TASK_ID` | commands/evidence.py | Migrated |
| `--attach-standard TASK_ID` | `attach-standard TASK_ID` | commands/evidence.py | Migrated |

## Exception Commands

| Legacy Flag | Typer Command | Module | Status |
|-------------|---------------|--------|--------|
| `--add-exception TASK_ID` | `add-exception TASK_ID` | commands/exceptions.py | Migrated |
| `--list-exceptions` | `list-exceptions` | commands/exceptions.py | Migrated |
| `--resolve-exception TASK_ID` | `resolve-exception TASK_ID` | commands/exceptions.py | Migrated |
| `--cleanup-exceptions TASK_ID` | `cleanup-exceptions TASK_ID` | commands/exceptions.py | Migrated |

## Quarantine Commands

| Legacy Flag | Typer Command | Module | Status |
|-------------|---------------|--------|--------|
| `--quarantine-task TASK_ID` | `quarantine-task TASK_ID` | commands/quarantine.py | Migrated |
| `--list-quarantined` | `list-quarantined` | commands/quarantine.py | Migrated |
| `--release-quarantine TASK_ID` | `release-quarantine TASK_ID` | commands/quarantine.py | Migrated |

## Validation & Metrics Commands

| Legacy Flag | Typer Command | Module | Status |
|-------------|---------------|--------|--------|
| `--run-validation TASK_ID` | `run-validation TASK_ID` | commands/validation_commands.py | Migrated |
| `--collect-metrics TASK_ID` | `collect-metrics TASK_ID` | commands/metrics_commands.py | Migrated |
| `--generate-dashboard` | `generate-dashboard` | commands/metrics_commands.py | Migrated |
| `--compare-metrics` | `compare-metrics` | commands/metrics_commands.py | Migrated |

---

## Common Options

| Option | Description | Applicable Commands |
|--------|-------------|---------------------|
| `--format {text,json}` | Output format (default: text) | list, pick, validate, explain, check-halt |
| `--agent {implementer,reviewer,validator}` | Agent role | update-agent, snapshot-worktree, resolve-drift |
| `--status {pending,in_progress,done,blocked}` | Agent status | update-agent |
| `--base-commit SHA` | Base commit for context | init-context |
| `--session-id ID` | CLI session ID | update-agent |
| `--finding TEXT` | Blocking finding | mark-blocked |
| `--note TEXT` | Resolution note | resolve-drift |
| `--force-secrets` | Bypass secret scanning | init-context |

---

## Shell Completion

```bash
# Install completion (requires add_completion=True in app.py)
python -m scripts.tasks_cli --install-completion bash
python -m scripts.tasks_cli --install-completion zsh
python -m scripts.tasks_cli --install-completion fish
```

---

## Breaking Changes

**None.** Full backwards compatibility maintained. Both syntaxes work:

```bash
# Legacy (argparse style)
python scripts/tasks.py --list --format json

# Typer style (preferred)
python scripts/tasks.py list --format json
```

---

## Deprecation Notice

The legacy dispatch path (`TASKS_CLI_LEGACY_DISPATCH=1`) will be removed in Wave 9.2 (Session S9.2).

---

## Verification

```bash
# Verify all commands accessible
python scripts/tasks.py --help

# Smoke test
python scripts/tasks.py list
python scripts/tasks.py pick --format json
```
