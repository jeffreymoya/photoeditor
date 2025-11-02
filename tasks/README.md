# Tasks Authoring Guide

This guide shows how to create a new machine‑readable task file using the canonical template. For how to decide and perform task breakdown, see the Task Breakdown Canon in `standards/task-breakdown-canon.md` (authoritative).

## Template Selection

All work now uses a single canonical template: `docs/templates/TASK-0000-template.task.yaml`.

- Copy that file verbatim, then replace every `REPLACE` placeholder.
- Delete comment lines once satisfied, but keep the YAML keys so automation can parse the task.
- If the scope feels broader than one independently shippable change, stop and split the requirements into multiple task files—the template is intentionally concise, so multiple tasks are preferred over an oversized document.

## Quick Start
- Choose an `area`: `backend | mobile | shared | infra | docs | ops | other`.
- Allocate a stable `id` (e.g., `TASK-0123`) and a short slug (e.g., `image-crop-bounds`).
- Copy the single template: `cp docs/templates/TASK-0000-template.task.yaml tasks/<area>/TASK-<id>-<slug>.task.yaml`
- Replace every placeholder. Keep IDs and titles stable.
- Link the relevant standards via `context.standards_tier` and `context.related_docs`.
- Add a dedicated plan stage to confirm the work complies with the cited standards and to record any gaps that require standards updates.
- Commit the task alongside the code branch that will implement it.

> **Update (2025-11-01)**: Python task CLI is now active (Week 3 cutover complete, see `docs/proposals/task-workflow-python-refactor.md`). All commands available via `scripts/pick-task` (delegates to Python) or direct Python invocation `python scripts/tasks.py`. Key improvements:
> - Inline `blocked_by` arrays parse correctly
> - Unblocker prioritization works (unblockers always first)
> - JSON output: `python scripts/tasks.py --list --format json`
> - Graph export: `python scripts/tasks.py --graph`
> - Status transitions: `--claim`, `--complete` (auto-archives to docs/completed-tasks/)

## Fields You Must Fill
Use the comments in the template as your checklist. At minimum, complete:
- `id`, `title`, `status`, `priority`, `area`
- `description` (2–6 sentences of context)
- `outcome` (verifiable end state, not steps)
- `scope.in` and `scope.out`
- `context.related_docs` with the applicable tier standards + testing standards
- `repo_paths` for touched files (approximate is fine initially)
- `environment`, `constraints`
- `plan` (ordered steps)
  - Each step must declare: `actor` (agent|human), `inputs`, `outputs`, `definition_of_done`, and an `estimate` (S|M|L). Do not include shell `commands` in plan steps; validation runs elsewhere and AC is the source of truth.
  - Cite the exact standards clause governing the step (file path + heading slug, e.g., `standards/backend-tier.md#service-layer-boundaries`) inside `details` or `definition_of_done` so the reviewer can trace intent directly to the rule.
  - Write `definition_of_done` statements as observable outcomes ("Document notes in docs/evidence/standards-review.md citing standards/backend-tier.md#service-layer-boundaries") rather than vague actions.
- `acceptance_criteria` (objective checks tied to observable signals)
- `validation` (manual checks or bespoke tooling outside the automated agent flow)
- `deliverables` and `risks`

If sequencing matters, also set `blocked_by`, `depends_on`, and `order`.

### Dependency Fields: `blocked_by` vs `depends_on`

Tasks support two types of dependencies with different semantics:

**`blocked_by` (hard execution blocker):**
- Task **CANNOT START** until all dependencies have `status: completed`
- Enforced by the Python CLI task picker (`python scripts/tasks.py --pick`)
- Use for strict sequencing (e.g., schema definition must complete before implementation)
- Example: `blocked_by: [TASK-0199]` means this task is not ready until TASK-0199 completes

**`depends_on` (informational/artifact dependency):**
- Task **NEEDS OUTPUTS** from these tasks but can start in parallel
- NOT enforced by the task picker (documentation only)
- Use for artifact tracing, context, and dependency visualization
- Helps developers understand relationships without blocking execution
- Example: `depends_on: [TASK-0150]` means this task uses S3 bucket from TASK-0150 (already completed)

**When to use which:**
- Use `blocked_by` when the task literally cannot begin until dependencies finish
- Use `depends_on` when the task needs artifacts/outputs but the blocker is already resolved or can proceed in parallel
- A task can have both (e.g., blocked by schema definition, depends on infrastructure that's already done)

**Example:**
```yaml
# TASK-0200: Implement image upload handler
blocked_by: [TASK-0199]  # Cannot start until upload schema is defined
depends_on: [TASK-0150]  # Uses S3 bucket from infra (already completed, for context)
```

See `docs/proposals/task-workflow-python-refactor.md` Section 3.5 for detailed semantics and Python CLI implementation.

### Unblocker Tasks
Set `unblocker: true` for tasks that unblock other work. The Python task picker now correctly prioritizes unblocker tasks FIRST, even over higher-priority non-unblockers (P2 unblocker selected before P0 non-unblocker). Use this flag for tasks that:
- Fix test infrastructure preventing other tests from running
- Resolve dependency/tooling blockers
- Address cross-cutting issues that impede multiple feature branches
- Clear path for other high-priority work

## Standards Alignment
- SSOT for grounding and standards changes: `standards/standards-governance-ssot.md`.
- Before drafting the plan, read the standards referenced in `context.related_docs` so the work stays grounded in approved architectural rules.
- Add a `Standards review` step in the task plan that confirms the implementation matches the cited standards and documents any gaps.
- When new behaviour is not covered by existing standards, author a change request:
  - Create a follow-up task (typically under `tasks/docs/`) using the same template to describe the required standards update.
  - Update or add files inside `standards/` as part of that change request, following the SSOT workflow.
  - Link the CR task back to the original work so auditors can trace why the standards evolved.

### Handling Blockers
- When work is impeded by an issue outside the task scope, change `status` to `blocked` and record a one-line reason in `blocked_reason` (see template updates below).
- Create a dedicated unblocker task in the appropriate `tasks/<area>/` folder. Its description must focus on clearing the blocker, and its `priority` should match or exceed the highest-priority task depending on it (default to the parent task's priority unless an escalation to P0 is warranted).
- **IMPORTANT:** Set `unblocker: true` on the new task so the Python task picker raises it ahead of ALL other work (unblockers always selected first regardless of priority).
- Add the new task's ID to the original task's `blocked_by` list so orchestration scripts understand the dependency chain.
- Treat unblocker tasks as top-of-queue items; close them promptly, then flip the original task back to `in_progress` or `todo` and continue.
 - If the blocker is "complexity/decomposition required", follow `standards/task-breakdown-canon.md` to run a Breakdown Pass and create the necessary subtasks.

## Task Breakdown
Refer to the comprehensive Task Breakdown Canon: `standards/task-breakdown-canon.md`.
It defines when to decompose work, how to create subtasks using the canonical template, how to encode dependencies via `blocked_by`/`order`, and how agents should proceed when tasks are blocked due to complexity.



## Validation & Evidence
- Automated static, unit, and contract tests run through the `.claude/` test agents. Command names are authoritative in `standards/qa-commands-ssot.md`.
- Do not list shell commands under `validation`; rely on acceptance criteria and record any human actions under `validation.manual_checks`.
- Attach artifacts listed under the task’s `artifacts` list when applicable, especially when they prove standards compliance.


## Status Flow & Archival
- Default flow: `todo → in_progress → completed` (use `blocked` only with a concrete reason).
- On completion, move the file to `docs/completed-tasks/` (see template notes).

## Keep the Template Authoritative
- Use a single canonical template: `docs/templates/TASK-0000-template.task.yaml`.
- If you find a gap, improve the canonical template and reference that change in your task/PR/ADR. Do not diverge per‑task.
