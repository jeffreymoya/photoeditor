# Proposal: Task Context Cache Hardening & Evidence Bundling

**Status**: Ready – Specs Complete (pending re-pilot)
**Author**: Codex Agent
**Date**: 2025-11-15
**Last Updated**: 2025-11-20
**Related Docs**: `docs/proposals/task-context-cache.md`, `docs/proposals/task-context-cache-hardening-schemas.md`, `standards/AGENTS.md`, `standards/global.md`, `standards/testing-standards.md`, `tasks/README.md`

> **Schema canon**: All field-level requirements, error codes, and CLI contracts live in `docs/proposals/task-context-cache-hardening-schemas.md`. This proposal summarizes the intent and sequencing so implementers can read the schemas doc for exact structures.

---

## 1. Background & Problem Statement

The first cache release (November 2025) reduced redundant diffs but failed to deliver prompt-ready context. Evaluation during TASK-1001 surfaced four systemic gaps:
- **Incomplete payloads** – Acceptance criteria, plan steps, and standards text were missing or only stored as file paths, so every agent reopened `.task.yaml`, checklists, and standards files.
- **Brittle manifests** – Each `--get-context` run reparsed every task file, replaying known YAML errors, emitting noisy warnings alongside JSON, and re-triggering `EISDIR` errors when artifacts pointed to directories.
- **Missing artifacts & QA drift** – Validation logs, QA command outputs, and package metadata were not cached, forcing ~20 additional `Read()` calls per task and leaving `qa:dependencies` baselines empty.
- **Operator friction** – CLI verbs lacked guardrails (env exports, aliasing, dirty-tree checks), validation commands were untyped shell strings, and telemetry could not prove token savings.

The cache therefore failed the headline objective of front-loading immutable context for agents while keeping automation friendly.

---

## 2. Objectives

### Goals
1. Deliver a prompt-ready cache bundle that includes acceptance criteria, plan, standards excerpts, QA baselines, and summaries in one read.
2. Make cache generation deterministic: parse once, quarantine malformed tasks, and keep warnings actionable and separate from JSON output.
3. Attach typed evidence (artifacts, QA logs, validation outputs) with SHA256 hashes and stable IDs.
4. Harden operator ergonomics with structured CLI verbs, env exports, retry/timeout metadata, and validation command schemas.
5. Measure success via telemetry covering file reads, warning counts, cache freshness, and QA coverage.

### Non-Goals
- Replacing the existing `TaskDatastore` locking model.
- Changing SST/live-dev release flows.

---

## 3. Solution Overview

### 3.1 Rich Immutable Payload
Embed acceptance criteria, scope, plan checkpoints, deliverables, validation pipelines, and standards citations directly in the cache. Snapshots of `.task.yaml` and agent checklists become source data, normalized via the schemas doc (Sections 1 & 8).

### 3.2 Evidence Bundles & QA Artifacts
Add typed artifacts (`file`, `directory`, `archive`, `log`, `qa_output`, etc.) with enforced size limits, hash verification, and directory-to-archive helpers. QA commands register outputs plus parsed summaries/drift signals (schemas Sections 1-4). Artifacts live under `.agent-output/TASK-XXXX/evidence/` with index metadata referenced from the manifest.

### 3.3 Manifest Hygiene & Exception Ledger
Move to a staged parse pipeline: broken tasks are quarantined once and logged in an exception ledger, keeping cache generation idempotent. Warnings move to stderr so `--format json` output stays machine-readable. Drift verification reuses cached manifests instead of rescanning disk, and fragile artifact references are replaced with explicit files.

### 3.4 CLI Ergonomics & Validation Commands
Introduce typed validation commands (command, cwd, env, expected paths, blockers, retry policy, timeout, expected exit codes). CLI verbs such as `--init-context`, `--attach-evidence`, `--record-qa`, `--run-validation`, and metrics subcommands run through a single dispatcher with env export helpers, dirty-tree enforcement, and deterministic exit codes (schemas Sections 2, 6).

### 3.5 Telemetry & Metrics
Capture file read counts, cache hits/misses, warning totals, command executions, and prompt-size estimates per agent. Provide `scripts/tasks.py --collect-metrics`, `--generate-metrics-dashboard`, and `--compare-metrics` to track reductions across tasks (schemas Section 5 & 10). Dashboards summarize pilot vs. baseline performance.

---

## 4. Implementation Phases

| Phase | Window | Focus |
|-------|--------|-------|
| **P0 – Schema & Attachments** | Week of 2025-11-17 | Update `TaskContextStore` schema, add acceptance criteria + standards attachments, evidence helpers, `.task.yaml` snapshots, typed artifact metadata. |
| **P1 – Manifest & Warning Refactor** | Week of 2025-11-24 | One-time parse pipeline, exception ledger, `--get-context` reuse, clean stdout/stderr split. |
| **P2 – QA & Metrics Integration** | Week of 2025-12-01 | Extend `--record-qa`, auto-register logs/summaries, log file-read telemetry. |
| **P3 – CLI Ergonomics** | Week of 2025-12-08 | Env flag handling, alias verbs, dirty-tree enforcement, validation command schema wiring, docs/help updates. |
| **P4 – Rollout & Validation** | Week of 2025-12-15 | Pilot on two tasks, capture metrics vs. baseline, iterate before GA. |

Each phase links to a `tasks/*.task.yaml` record with evidence bundles, per `tasks/README.md` and `standards/AGENTS.md`.

---

## 5. Validation & Success Metrics

### Success Metrics
1. ≤5 manual `Read()` calls per agent per task (baseline: 20+).
2. ≤1 repeated warning per task after ledger quarantine.
3. 100% QA artifact coverage for required commands.
4. ≥15% reduction in implementer prompt size thanks to embedded context.
5. Zero JSON parse failures when piping any `scripts/tasks.py --format json` output through `jq`/`json.tool`.

### Validation Approach
- **Schema fidelity**: Validate all JSON schemas, error codes, and CLI contracts defined in the schemas doc (Sections 1-10) via unit tests and fixtures.
- **Integration smoke**: Run CLI smoke tests (`scripts/tasks_cli/tests/test_cli_smoke.py`) covering init → evidence → QA → purge flows.
- **Pilot**: Re-run two-task pilot (backend + mobile) after the dispatcher corrections to produce authenticated metrics. Store baseline vs. hardening outputs under `docs/evidence/metrics/` and summarize in `docs/evidence/pilot-report.md`.
- **Telemetry audit**: Use `--collect-metrics` and dashboard commands to verify counters and trend lines before GA.

---

## 6. Current Status
- Waves 1-6 implemented evidence bundling, exception ledger, validation commands, telemetry, and documentation updates. QA static checks and >200 unit tests pass.
- The first pilot (Session S16) reported 5/5 success metrics, but later integration review uncovered CLI entrypoint mismatches (parameter names, dataclass usage, dispatcher routing). Corrections landed in commit `acd1a86` and follow-ups; CLI smoke tests now pass.
- **Action required**: Re-run the two-task pilot on the corrected CLI to regenerate real metrics before declaring GA. Capture the rerun in the driving task and update pilot report + dashboard.

---

## 7. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Legacy malformed tasks block cache init | Agents cannot load context | Exception ledger + quarantine keep bad files isolated until repaired. |
| Cache growth from evidence bundles | Repo bloat | Store large artifacts as external files with hash refs; keep cache JSON under 200 KB. |
| Telemetry leaking sensitive data | Privacy concerns | Log counts/ids only; no prompt or artifact contents captured. |
| CLI complexity overwhelms solo maintainer | Adoption slows | Update `tasks/README.md`, `standards/AGENTS.md`, and agent playbooks with concise recipes + troubleshooting. |
| Pilot metrics lack credibility | GA readiness unclear | Require rerun with corrected CLI; publish logs, metrics, and command transcripts under `docs/evidence/`. |

---

## 8. References & Follow-Up
- Implementers must cite `docs/proposals/task-context-cache-hardening-schemas.md` for JSON schemas, validation algorithms, error codes, and CLI help text.
- Migration guidance: `docs/guides/task-cache-hardening-migration.md`.
- Troubleshooting: `docs/troubleshooting.md` (error codes, recovery steps).
- Evidence and metrics: `docs/evidence/metrics/` + `docs/evidence/pilot-report.md`.
- Exception ledger maintenance procedure: `tasks/README.md` hardening section.

Pending items: rerun pilot, capture evidence, and update this proposal to "Implementation Complete" once success metrics are proven on corrected CLI paths.
