# Automated Test Spec Handoff Pipeline

- **Author:** Solo Maintainer
- **Date:** 2025-11-05
- **Status:** Draft
- **Related Standards:** `standards/testing-standards.md`, `standards/agents.md`, `standards/typescript.md`, `standards/task-breakdown-canon.md`
- **Related Docs:** `.claude/agents/task-implementer.md`, `.claude/agents/qa-validator.md`, `.claude/commands/qa.md`, `docs/templates/TASK-0000-template.task.yaml`

## 1. Background & Problem Statement

Task implementers already produce `.task.yaml` records and automated QA outputs, but the QA validation itself is handled manually inside Claude. We want a repeatable pipeline where the implementer records a structured test spec, a watcher dispatches it to z.ai for elaboration, and Claude consumes the completed spec to run and close out tests. Without a formal spec schema and robust automation, the new flow risks introducing race conditions, stale specs, or silent failures that undermine the single-maintainer audit trail.

## 2. Objectives

1. **Deterministic QA handoff:** Every task that produces code must emit a machine-readable test spec immediately after implementation.
2. **Automation-friendly artifacts:** Specs should be self-describing (inputs, expected outputs, fixtures) so z.ai or another LLM can extend them without conversational context.
3. **Auditable lifecycle:** The watcher, LLM completion, and task closure must each emit evidence artifacts tied to the originating `.task.yaml`.
4. **Resilient execution:** Network failures, malformed specs, or conflicting updates should fail loudly with recovery guidance, not silently skip QA.

### 2.1 Success Metrics

- ≥95% of tasks that modify code have a spec file processed end-to-end (Pending → Processing → Completed) within 30 minutes of spec creation.
- <2% of specs require manual reprocessing due to watcher or z.ai errors, measured via pipeline status log per week.
- 100% of task closures cite the completed spec artifact and the test command output bundle in the `.task.yaml` history section.
- Mean time to failure diagnosis <5 minutes, using structured logs and alerts that include task id, spec path, and z.ai run id.

## 3. Proposed Workflow

### 3.1 Directory Layout & Naming

- `.claude/test-specs/pending/` — implementer writes `TASK-####-YYYYMMDD-test-spec.yaml` after code implementation and local verification.
- `.claude/test-specs/processing/` — watcher moves spec here while z.ai expands it; the file is locked for edits during this stage.
- `.claude/test-specs/completed/` — finalized spec plus z.ai output (`*.completed.yaml`) and execution report (`*.report.json`).
- `.claude/test-specs/rejected/` — specs that fail validation, with appended `reason` in metadata for traceability.
- Each spec header contains: `task_id`, `commit_sha`, `source_paths`, `qa_commands`, and `standards_citations` so later automation can tie it back to the `.task.yaml` and staged diff.

### 3.2 Spec Schema (Draft)

```yaml
version: 1
metadata:
  task_id: TASK-1234
  author: Solo Maintainer
  created_at: 2025-11-05T18:30:00Z
  commit_sha: abcd1234
  source_paths:
    - backend/lambdas/photos/processImage.ts
  qa_commands:
    - pnpm turbo run test --filter=@photoeditor/backend
  standards_citations:
    - standards/testing-standards.md#coverage-thresholds
    - standards/typescript.md#exhaustive-unions
scenarios:
  - name: happy-path-process-image
    inputs:
      request_payload: {...}
    setup:
      - seed database with sample photo metadata
    assertions:
      - expect result.status == "success"
      - expect storage write to S3 bucket `photoeditor-test`
    notes:
      - verify traceparent propagation per Powertools requirement
```

### 3.3 Watcher Responsibilities

1. Debounce filesystem events (≥500ms) to avoid duplicate triggers on editor save/write patterns.
2. Validate spec against JSON Schema/YAML schema before dispatch; reject with actionable errors and move to `rejected/`.
3. Move spec to `processing/` atomically (rename operation) and emit a log entry under `.agent-output/test-spec-pipeline.log`.
4. Call z.ai API with the spec payload and instructions to enrich scenarios, enumerate edge cases, and propose concrete test commands. Include exponential backoff for 429/5xx responses and circuit-breaker after 3 failures per spec.
5. Persist z.ai response as `*.completion.json` in `processing/`, then merge/enrich the spec into a `*.completed.yaml` following the schema extension guidelines.
6. Move both completed files to `completed/` upon success, along with a summary `*.report.json` capturing timings, API status, and warnings.
7. Emit exit codes and structured logs for downstream automation (Claude command) to consume.

### 3.4 Claude QA Command Integration

- Add a custom Claude command `qa:run-spec TASK-1234` that:
  - Loads matching `completed/` spec(s).
  - Executes the enumerated `qa_commands` sequentially with retry cap aligned to `docs/agents/common-validation-guidelines.md`.
  - Captures stdout/stderr per command under `.agent-output/qa/TASK-1234/`.
  - Summarizes pass/fail status and posts it back to the `.task.yaml` `qa` history.
- On success, Claude moves spec artifacts to `.claude/test-specs/archive/YYYY/MM/` and annotates the task as ready for commit/closure.
- On failure, Claude copies artifacts to `.claude/test-specs/failed/` and files/reminds follow-up actions in the task file.

## 4. Edge Case Handling

- **Malformed YAML / schema mismatch:** Validation fails, spec renamed with `.invalid` suffix, entry added to `rejected/` along with a generated remediation stub inserted into the `.task.yaml` comments.
- **Duplicate task ids:** Watcher detects existing pending/processing/completed spec with same `task_id`; rejects new spec unless `version` increments with explicit `supersedes` metadata.
- **Simultaneous edits:** Renames to `processing/` performed by watcher; implementer receives FS error if trying to edit file mid-run, preserving pipeline determinism.
- **z.ai timeouts or rate limits:** Retry with exponential backoff; after third failure, move spec to `rejected/` with `status: needs-manual-run`. Provide CLI command `pnpm spec-pipeline retry TASK-1234` for manual requeue.
- **Partial z.ai responses:** schema validator rejects incomplete output; watcher retains original spec in `processing/` and opens an exception record referencing `standards/testing-standards.md#automation-failures`.
- **Watcher crash/restart:** State persisted in `.agent-output/test-spec-state.json` with `task_id`, `spec_path`, `stage`, `lock_version`; on reboot, watcher resumes incomplete jobs or alerts via CLI.
- **Spec updated post-completion:** Any write to `completed/` triggers audit log entry and requires bumping `version`; watcher enforces read-only by default (set FS permissions or pre-commit hook).
- **Task hotfix after closure:** New spec must include `supersedes` pointer to prior spec, ensuring history continuity.

## 5. Robustness & Observability

- Implement structured logging (JSON) with fields: `timestamp`, `task_id`, `event`, `status`, `elapsed_ms`, `zai_request_id`, `error_code`.
- Add healthcheck CLI `pnpm spec-pipeline status` reporting watcher uptime, queue counts, last error, and z.ai latency percentiles.
- Capture metrics snapshot after each run (`metrics.ndjson`) for future dashboarding (OSS tools or simple `jq` reports).
- Provide automated alert (e.g., terminal notification or email) when backlog older than 30 minutes exists or consecutive failures exceed threshold.
- Document manual restart and emergency override in `docs/agents/task-implementer.md` and add `make spec-watcher` target to bootstrap process.
- Secrets for z.ai API stored in AWS SSM `photoeditor/spec-pipeline/zai_api_key`; watcher reads them via existing secrets loader to maintain compliance.

## 6. Implementation Phases

| Phase | Scope | Deliverables |
| --- | --- | --- |
| Phase 0 | Standards & Schema | Draft schema + documentation, update `docs/templates/TASK-0000-template.task.yaml` to mandate spec section, add references in `standards/testing-standards.md` |
| Phase 1 | Watcher MVP | chokidar-based watcher with schema validation, pending → processing → completed flow, manual CLI to dispatch without z.ai |
| Phase 2 | z.ai Integration | API client with retries/backoff, response merging, error surface, secrets management |
| Phase 3 | Claude Command | `qa:run-spec` command, QA artifact bundling, `.task.yaml` updates, exception handling |
| Phase 4 | Hardening | State persistence, healthcheck CLI, alerting, archive rotation, documentation updates |

Advancing phases requires `pnpm turbo run qa:static --parallel` success plus a recorded dry-run in `tasks/docs/` referencing this proposal.

## 7. Standards & Governance Impact

- Update `standards/testing-standards.md` to define mandatory test spec creation, acceptance criteria for automation outputs, and failure handling escalation paths.
- Amend `standards/agents.md` and the task implementer agent prompt to include spec authoring responsibilities and manual override instructions.
- Add a clause in `standards/task-breakdown-canon.md` clarifying when tasks that only touch documentation are exempt.
- Create or update an ADR if the pipeline significantly alters QA responsibilities (`adr/` entry referencing this proposal and task id).

## 8. Risks & Mitigations

- **External dependency outage (z.ai):** Provide fallback CLI to run `spec-pipeline process --local` that mirrors z.ai behavior with Claude; document activation in `.task.yaml` and exception registry. Maintain rolling 24h retry queue.
- **Spec drift vs implementation:** Require commit hook to confirm spec `commit_sha` matches `HEAD` at creation time; Claude command re-verifies before running tests.
- **Automation noise:** Pilot with warning-only mode; store precision/recall stats in `docs/agents/spec-pipeline-metrics.md` to justify enforcement.
- **Security of shared context:** Redact secrets via regex list before sending to z.ai; log truncated payload hash instead of raw body.
- **Single-point failure watcher:** Run watcher via `pm2` or systemd unit with restart policy and heartbeat check; document manual takeover steps.

## 9. Open Questions

1. Do we need per-package overrides (e.g., mobile vs backend) for the default `qa_commands` or should the spec list them explicitly?
2. How should we handle specs for multi-commit tasks—one spec per commit or per final diff?
3. Should the watcher escalate to manual review after N consecutive z.ai failures, and what constitutes acceptable SLAs for the queue backlog?
4. Can the completed spec double as documentation for release notes, or should we keep them separate to avoid scope creep?

## 10. Immediate Next Actions

1. Stand up a task (`tasks/docs/TASK-####.task.yaml`) referencing this proposal, capturing standards citations and initial schema draft work.
2. Draft the YAML schema + JSON Schema validation document under `docs/templates/test-spec-schema/` and circulate for review.
3. Implement watcher Phase 1 with unit tests covering directory moves, duplicate detection, and failure logging.
4. Schedule a retro after the first three pilot tasks to tune the pipeline and decide on moving to Phase 2.

