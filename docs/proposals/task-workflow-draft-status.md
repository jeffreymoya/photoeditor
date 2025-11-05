# Proposal: Draft Task Status Workflow Extension

- **Author:** Solo Maintainer (Jeffrey Moya)
- **Date:** 2025-11-02
- **Status:** Draft
- **Related Standards:** `standards/task-breakdown-canon.md`, `standards/standards-governance-ssot.md`, `standards/AGENTS.md`, `standards/typescript.md`
- **Related Docs:** `tasks/README.md`, `docs/templates/TASK-0000-template.task.yaml`, `docs/proposals/task-workflow-python-refactor.md`, `.claude/commands/task-runner.md`

## 1. Problem Statement

The current task lifecycle assumes requirements are sufficiently clear at creation time to begin planning (`todo -> in_progress -> completed`, with `blocked` as an exception state). In practice, many tasks surface ambiguous acceptance criteria, cross-tier unknowns, or missing standards citations. Those ambiguities leak into active work, forcing mid-implementation clarifications, churn in `blocked` status, and unclear audit trails that violate `tasks/README.md` and `standards/task-breakdown-canon.md` expectations around deterministic solo workflow. We need an explicit pre-flight state to capture and resolve ambiguity before tasks enter the executable queue.

## 2. Objectives

1. **Protect execution focus:** Ensure only well-scoped tasks reach `todo`, reducing blocked churn caused by missing inputs.
2. **Document ambiguity resolution:** Capture clarifications as evidence artifacts tied to tasks per `standards/standards-governance-ssot.md`.
3. **Maintain deterministic automation:** Extend the Python task CLI so draft work is visible for grooming but excluded from agent-driven picking.
4. **Align with standards:** Update the template and Task Breakdown Canon so ambiguity handling is codified, auditable, and repeatable.

### 2.1 Success Metrics

- At least 90% of tasks entering `todo` include complete `acceptance_criteria` and `plan` citations without follow-up edits due to ambiguity.
- Fewer than 5% of tasks transition from `todo` back to `blocked` for clarification-related reasons over a rolling four-week window.
- All `draft` tasks include a linked clarification artifact (`docs/evidence/tasks/{task-id}-clarifications.md`) before transitioning to `todo`.

## 3. Proposed Workflow Changes

### 3.1 Status Lifecycle

```
draft -> todo -> in_progress -> completed
             \
              -> blocked <-> todo / in_progress
```

- **draft** (new default): Use when requirements, standards citations, or scope remain ambiguous. Tasks created without complete acceptance criteria MUST enter `draft`.
- **Transition rules:**
  - `draft -> todo`: Author updates the task with clarified scope, cites governing standards, and records the resolution artifact path.
  - `draft -> blocked`: Reserved for upstream dependencies (for example, waiting on a product brief) where the task cannot progress until another task completes.
  - `draft` tasks that serve as dependencies MUST be listed under `blocked_by` for downstream tasks, which stay `blocked` until clarifications land.
  - Claiming remains limited to `todo` and `blocked` (per existing CLI semantics).

### 3.2 Author Responsibilities

- Record open questions under a new `clarifications` note inside the task description or `constraints` block until resolved.
- Create or link supporting evidence files in `docs/evidence/tasks/` documenting clarifications and decisions.
- If ambiguity stems from missing upstream work, open a dedicated unblocker task marked `unblocker: true` per `standards/task-breakdown-canon.md` and keep the original task in `draft` until cleared.

### 3.3 Automation Visibility

- `draft` tasks appear in `python scripts/tasks.py --list --filter draft` for grooming but are excluded from `--pick` output to keep execution deterministic.
- `python scripts/tasks.py --pick` emits a warning summary when drafts exist, including downstream tasks that remain blocked until clarifications are resolved.
- Task runner agents surface aging `draft` tasks (configurable SLA, default 48 hours) as maintenance alerts.

## 4. Template and Documentation Updates

- Update `docs/templates/TASK-0000-template.task.yaml` to set `status: draft` by default and add guidance about clarifications, evidence paths, and transition requirements.
- Amend `tasks/README.md` “Status Flow & Archival” section to document the new lifecycle and include a “Draft Resolution Checklist” covering acceptance criteria, standards citations, scope, and validation planning.
- Extend `standards/task-breakdown-canon.md` with an ambiguity guard clause: ambiguous signals mandate `draft` until resolved.
- Add instructions in `tasks/AGENTS.md` and `.claude/commands/task-runner.md` so agents log ambiguity evidence and refuse to claim `draft` tasks.

## 5. CLI and Tooling Impact

1. **Status enum extension:** Add `draft` to `TaskStatus` in `scripts/tasks_cli/constants.py`, assign a rank below `todo`, and update sort keys in `picker.py` along with graph rendering colors.
2. **Parser and validation:** No schema changes required; YAML already supports the new literal. Update transition validation to allow `draft` origins in `operations.py`.
3. **Task picker:** Exclude `draft` from readiness calculations so `--pick` never returns ambiguous work; add `--filter draft` support, include `draft` nodes in DOT exports with a distinct color (for example, light blue), and display warnings when drafts exist or when downstream tasks have not been marked `blocked`.
4. **Agent prompts:** Update automation docs so implementer and reviewer agents bail if they encounter a `draft` task and instead log a triage note.
5. **Testing:** Add unit coverage under `backend/tests/unit/tasks_cli/` validating status ordering, pick exclusions, and DOT color mapping for `draft`.

## 6. Implementation Plan

| Phase | Scope | Deliverables |
| --- | --- | --- |
| Phase 1 | Documentation updates | Revised template, README, Task Breakdown Canon, agent prompts; recorded in a `tasks/docs/` task citing standards |
| Phase 2 | CLI support | Code changes in `scripts/tasks_cli/`, new unit tests, updated DOT styling, refreshed QA snapshot |
| Phase 3 | Evidence workflow | `docs/evidence/tasks/` naming convention, task-runner alerting, SLA configuration documented in `.claude/commands/task-runner.md` |
| Phase 4 | Adoption sweep | One-time task reclassification to `draft` where applicable, report stored in `docs/ops/task-draft-sweep-{date}.md`, follow-up unblocker tasks as needed |

Each phase will ship under a dedicated task referencing this proposal, with `pnpm turbo run qa:static --parallel` evidence attached per repository standards.

## 7. Risks and Mitigations

- **Stagnant drafts:** Mitigate with SLA alerts and require explicit exception records in `docs/agents/exception-registry.md` for drafts exceeding SLA.
- **Workflow confusion:** Provide quick-reference tables in `tasks/README.md` and add a `Makefile` shortcut (for example, `make tasks-list-draft`) pointing to the CLI filter.
- **Automation drift:** Ensure CLI, docs, and agent prompts update in the same task bundle; add regression tests asserting draft exclusion from `--pick`.
- **Evidence overhead:** Supply a Markdown template for clarification notes and allow linking to ADRs when ambiguity results in architectural decisions.

## 8. Open Questions

1. **Resolved (2025-11-02):** Draft tasks DO block downstream dependencies. Downstream tasks MUST include the draft task in `blocked_by`, remain in `blocked` status with a descriptive `blocked_reason`, and may not transition to `todo` until clarifications are captured in `docs/evidence/tasks/{task-id}-clarifications.md`. The CLI surfaces warnings when this guardrail is violated.
2. What SLA duration best balances thorough clarification with momentum (24 hours versus 48 hours versus priority-based scaling)?
3. Do we need automated reminders (for example, scheduled GitHub Action) if `draft` tasks exceed SLA, or is local CLI alerting sufficient?

## 9. Next Actions

1. Author a `tasks/docs/` task to execute Phase 1 documentation updates referencing this proposal.
2. Draft a companion standards change request if ambiguity handling introduces new governance rules.
3. Prototype CLI changes on a feature branch, run `pnpm turbo run qa:static --parallel`, and attach results to the Phase 2 task.
4. Update automation (CLI + task-runner) to emit draft warnings and dependency blocking checks, then record evidence in `docs/evidence/tasks/`.

## 10. Implementation Traceability

- `docs/templates/TASK-0000-template.task.yaml` — default task status set to `draft` and new `clarifications` block for evidencing ambiguity resolution.
- `tasks/README.md` — added draft resolution checklist, dependency guardrail, and workflow notes matching the proposal.
- `standards/task-breakdown-canon.md` — codified draft ambiguity guardrail in the breakdown canon.
- `scripts/tasks_cli/constants.py` — extended `TaskStatus` enum and ranking to include `draft`.
- `scripts/tasks_cli/operations.py` — prevented claiming draft tasks and restricted allowed transitions.
- `scripts/tasks_cli/picker.py` — filtered draft tasks from selection, enforced dependency linkage, and exposed draft alerts.
- `scripts/tasks_cli/__main__.py` — surfaced draft warnings in CLI output and attached alert metadata to JSON responses.
- `scripts/tasks_cli/tests/test_picker.py`, `scripts/tasks_cli/tests/test_operations.py` — regression coverage for draft filtering and claim validation.
