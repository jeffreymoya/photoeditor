# Deterministic Agent Automation Initiative

- **Author:** Solo Maintainer
- **Date:** 2025-11-02
- **Status:** Draft
- **Related Standards:** `standards/standards-governance-ssot.md`, `standards/qa-commands-ssot.md`, `standards/task-breakdown-canon.md`, `standards/global.md`
- **Related Docs:** `.claude/commands/task-runner.md`, `.claude/agents/*.md`, `docs/agents/common-validation-guidelines.md`, `docs/agents/diff-safety-checklist.md`

## 1. Problem Statement

Automation guards most validation gates, but several high-volume decisions still depend on agent judgment. Manual enforcement introduces variance (diff safety, standards citations, retry limits) and weakens the deterministic workflow described in `docs/proposals/task-workflow-python-refactor.md`. This proposal defines a phased automation plan to script those decisions while respecting existing agent role boundaries.

## 2. Objectives

1. **Increase determinism:** Convert repeatable checks into scripts so task-runner can surface binary outcomes.
2. **Reduce cognitive load:** Free implementation and review agents to focus on domain reasoning instead of checklist enforcement.
3. **Strengthen evidence trail:** Ensure every gate produces artifacts and exit codes compatible with solo-maintainer audit requirements.
4. **Stay standards-aligned:** Adopt changes through the Standards CR workflow, keeping `standards/qa-commands-ssot.md` authoritative.

### 2.1 Success Metrics

- Reduce manual overrides on validation gates from the current 38% three-week average to ≤10% by Phase 3, measured via `.agent-output/validation-summary.json`.
- Cut average task hand-off time between runner and implementer from 14 minutes to 5 minutes after Phase 4, using task-runner telemetry timestamps.
- Achieve 100% audit artifact capture (command logs + JSON reports) by Phase 5, validated through nightly checks in `scripts/ci/audit_verify.mjs`.
- Hold regression rate of blocked-but-manual-override tasks at zero for two consecutive sprints post Phase 5; any deviation triggers an exception record per `standards/standards-governance-ssot.md`.

## 3. Automation Targets

### 3.1 Diff Safety Gate

- Implement `scripts/ci/diff_safety_check.mjs` to scan the staged diff for prohibited directives (`@ts-ignore`, `eslint-disable`, skipped tests), missing exception registry references, high-risk binary additions outside `assets/`, and unreviewed migration or infrastructure manifests.
- Register as `pnpm run qa:diff-safety` in `turbo.json`; add to backend, mobile, and shared QA pipelines plus `Makefile` `qa-suite`.
- Update `.claude/agents/task-implementer.md` and `.claude/agents/implementation-reviewer.md` to call the script and block on non-zero exit status, reducing subjective diff audits while documenting override procedures for generated files.

### 3.2 Complexity Heuristic Reporter

- Add `scripts/ci/task_complexity_report.py` that ingests a task YAML and optional git diff to compute the Task Breakdown Canon signals and emit an overall `complexity-level` aligned to `standards/task-breakdown-canon.md`:
  - Cross-tier scope detection via path prefixes.
  - File fan-out >5 modules.
  - Plan step count >6.
  - Presence of both contract and infra work.
- Task-runner invokes the reporter before handing the task to `task-implementer`; if thresholds trip, it logs a deterministic “complexity-warning” record under `.agent-output/` and recommends task-splitting or additional review agents.
- Calibrate thresholds during Phase 2 using historical task telemetry; record adjustments in `docs/agents/complexity-tuning.md`.

### 3.3 Standards Citation Validator

- Create `scripts/ci/validate_task_citations.mjs` to ensure each `.task.yaml` includes required citations:
  - `standards/standards-governance-ssot.md`
  - Relevant tier docs inferred from `context.affected_packages`
  - `standards/cross-cutting.md` and `standards/typescript.md` for code tasks.
- Integrate with `pnpm run qa:static --parallel` to prevent uncited tasks from entering the workflow.
- Load required citations from `standards/qa-commands-ssot.md#required-citations` so the validator tracks the canonical list without code changes.
- Emit actionable remediation guidance when citations are missing and block on any task referencing unknown packages or tiers; log gaps to `docs/agents/exception-registry.md`.

### 3.4 Validation Harness Wrapper

- Wrap package-scoped QA commands in `scripts/ci/run_validation.mjs`:
  - Executes `lint:fix`, `qa:static`, unit tests, and optional fitness scripts in sequence (mirrors the implementer/reviewer responsibilities before validation agents pick up remaining checks).
  - Tracks retry attempts (cap at two per `docs/agents/common-validation-guidelines.md`) and captures structured JSON reports in `docs/tests/reports/{date}-{package}.json`.
  - Emits explicit PASS/FAIL/BLOCKED codes for task-runner consumption and attaches command logs to the agent summary.
- Performs a pre-flight dirty worktree check, stores transient artifacts in `.agent-output/tmp`, and redacts secrets using `REDACT_PATTERNS` from `standards/global.md` before persisting logs.

### 3.5 Task-Runner Preflight Audit

- Extend `scripts/tasks_cli` with a preflight hook that calls the diff safety, complexity, and citation scripts before picking the next task.
- Cache the last successful run per task in `.agent-output/preflight-cache.json` and skip reruns when the diff and task metadata are unchanged.
- Provide an explicit `--override-preflight` flag documented in `docs/agents/task-runner.md` that requires an exception record for use.
- Halt immediately on non-zero exits, surfacing precise remediation messages instead of human interpretation.

### 3.6 Runtime & Dependency Baseline

- Adopt `.tool-versions` entries for Node 20 LTS and Python 3.11 to align all automation scripts; lock supporting packages in `pnpm-lock.yaml` and `poetry.lock`.
- Distribute scripts via `pnpm run` aliases and a `scripts/requirements.txt` extras group to keep installation deterministic across local and CI environments.
- Add smoke tests under `scripts/tests/runtime-smoke.test.ts` to verify tool availability before automation runs.

## 4. Implementation Plan

| Phase | Scope | Deliverables |
| --- | --- | --- |
| Phase 1 | Diff safety + Standards CR | Script, turbo integration, prompt updates, Standards CR covering new QA gate, rollback checklist |
| Phase 2 | Complexity report + task-runner wiring | Reporter script, task-runner logging, calibration playbook in CLAUDE.md, historical telemetry review |
| Phase 3 | Citation validator | Script, CI integration, failure messaging, standards update, SSOT sync automation |
| Phase 4 | Validation harness | Wrapper script, report format, validation agent prompt updates, dry-run evidence pack |
| Phase 5 | Preflight audit | Task-runner changes, consolidated logging, retrospective adjustments, emergency override protocol |

Each phase produces a task file under `tasks/docs/` or `tasks/backend/` with explicit Standards citations and evidence attachments. Promotion to the next phase requires (1) meeting the Success Metrics relevant to the phase, (2) a clean run of `pnpm turbo run qa:static --parallel` under the new automation, and (3) a documented rollback path stored in `docs/proposals/deterministic-agent-automation-retro.md`.

## 5. Standards & Governance Impact

- Requires a Standards CR to amend `standards/qa-commands-ssot.md` (adding new commands) and potentially `standards/global.md` (evidence expectations).
- Agent prompt edits must cite the updated standards and reference the automation scripts in their workflow sections.
- No policy deviations anticipated; exceptions would be recorded per `standards/standards-governance-ssot.md`.

## 6. Risks & Mitigations

- **False positives blocking progress:** Mitigate with a two-week dry-run logging warnings only, track hit-rate vs manual overrides, and require sign-off from the standards steward before flipping to hard fails.
- **Script drift vs standards:** Tie each script release to a task citing the governing standards; add unit tests in `scripts/tasks_cli/tests/` for deterministic behavior and schedule quarterly SSOT sync reviews.
- **Maintenance overhead:** Document commands in `CLAUDE.md`, ensure `Makefile` shortcuts stay aligned, and add owners plus expiry dates to `docs/agents/exception-registry.md`.
- **Runtime variance and OS parity:** Pin Node and Python runtimes via `.tool-versions`, supply hermetic `pnpm` and `pipx` lockfiles, and test scripts in CI against macOS and Linux runners.
- **Sensitive log exposure:** Apply the harness redaction patterns to all JSON artifacts and add a scheduled scrubber that verifies no secrets leak into `docs/tests/reports/`.

## 7. Open Questions

1. Should diff safety scan generated files (risk of noise) or limit to tracked source?
2. How should we version evidence reports from the validation harness (per package vs per task)?
3. Do infrastructure tasks require additional automation beyond current scope (e.g., Terraform policy checks)?

## 8. Next Actions

1. Author a Standards CR task defining the diff safety gate and citation validator requirements, including runtime/toolchain assumptions.
2. Prototype the diff safety and complexity scripts against the last three task diffs to tune heuristics and close open questions on generated file scope and evidence versioning.
3. Update the task template in `docs/templates/TASK-0000-template.task.yaml` to reference the new automation artifacts and exception-record workflow before enforcement.
