# Tasks Guidelines for LLM Consumption

Purpose: Define a precise, machine-readable task spec so LLM agents can execute work consistently, safely, and verifiably in this repo.

Scope: Applies to all files under `tasks/`.

## What Is a Task File?
A single, self-contained specification that tells an LLM exactly what to do, why, how to validate it, and what “done” means. Task files are designed to be parsed by tools and read by humans.

## Location & Naming
- Location: `tasks/`
- One file per task.
- Recommended name: `TASK-<id>-<short-slug>.task.yaml` (stable ID avoids churn).
  - Example: `TASK-0007-image-crop-bounds.task.yaml`
- Optional subfolders by area: `tasks/<area>/TASK-0007-...` (e.g., `frontend`, `backend`, `infra`).

## Authoring Rules (LLM-Friendly)
- Be explicit and concrete; avoid ambiguity.
- Use repo-relative paths (e.g., `src/editor/crop.ts:120`).
- Include exact commands to run (lint, build, test, demo).
- Anchor implementation details to the standards that match the task’s taxonomies: cite `standards/global.md` for universal guardrails, refer to `standards/AGENTS.md` for the tier map, then add the file(s) under `standards/` that align with the declared area (e.g., `frontend-tier.md`, `backend-tier.md`, `infrastructure-tier.md`, `shared-contracts-tier.md`, or `cross-cutting.md` for docs/ops/other work). Always include `docs/testing-standards.md` so validation expectations remain explicit.
- If no existing taxonomy in `standards/` fits the task, author a change request document under `standards/` that proposes the new taxonomy with detailed rationale before finalizing the task file.
- List acceptance criteria as short, testable bullets.
- Declare constraints (sandbox, network, approvals, secrets) and assumptions.
- Keep steps ordered and scoped; note dependencies.
- Never include secrets or private URLs.
- Set an appropriate `complexity` (XS–XL) to guide batching; briefly justify if non-obvious.

## Minimal Schema (YAML)
Prefer YAML for machine readability. JSON is acceptable if needed. Markdown files are allowed only if they include YAML front matter conforming to this schema.

Required top-level keys:
- `schema_version` (string) — e.g., `"1.0"`
- `id` (string) — stable identifier, e.g., `TASK-0007`
- `title` (string) — concise task name
- `status` (enum) — `todo | in_progress | blocked | completed`
- `priority` (enum) — `P0 | P1 | P2`
- `complexity` (enum) — `XS | S | M | L | XL`
- `area` (string) — `frontend | backend | infra | docs | ops | other`
- `description` (string) — clear 2–6 sentence brief
- `outcome` (string) — what will be true when done
- `scope` (object) — `in` and `out` lists
- `context` (object) — links to issues/docs and touched files
- `environment` (object) — OS, runtimes, tools, data
- `constraints` (object) — approvals, sandbox, coding rules
- `plan` (array) — ordered steps to execute
- `acceptance_criteria` (array) — testable checks
- `validation` (object) — commands and manual checks
- `deliverables` (array) — files/changes expected
- `risks` (array) — risks and mitigations

Optional top-level keys (sequencing and ordering):
- `blocked_by` (array of strings) — task IDs that must be `completed` before this task is eligible for picking/claiming (e.g., `["TASK-0003", "TASK-0008"]`).
- `order` (integer) — manual ordering within the same `priority`; lower values are picked first.

Notes:
- The helper script `scripts/pick-task.sh` respects `blocked_by` and `order` when using `--pick` and `--claim`. It scans both `tasks/` and `docs/completed-tasks/` to resolve completed dependencies.

## Full Schema (Recommended)
```yaml
schema_version: "1.0"
id: TASK-0000
title: Short action-oriented title
status: todo  # todo | in_progress | blocked | completed
priority: P1   # P0 (urgent), P1 (soon), P2 (nice-to-have)
complexity: S   # XS (trivial) | S (small) | M (medium) | L (large) | XL (epic)
area: backend  # frontend | backend | infra | docs | ops | other

# Optional sequencing/ordering
blocked_by:
  - TASK-0003
  - TASK-0008
order: 10

# Why this task exists, the core objective, and constraints at a glance.
description: >-
  Brief but complete context (2–6 sentences): what to build/fix, why it matters,
  key constraints, and any relevant history.

# The verifiable end state expressed in outcome terms (not steps).
outcome: >-
  Users can X; tests Y pass; file Z exists; metric improves by N%.

scope:
  in:
    - What is in scope (files/features/modules)
  out:
    - What is explicitly not in scope

context:
  issues: ["#123", "#124"]
  related_docs:
    - docs/design/feature-x.md
  repo_paths:
    - src/module/a.ts: lines referenced in work
    - test/module/a.spec.ts
  dependencies:
    - type: package
      name: sharp
      version: ">=0.33 <0.34"
    - type: service
      name: localstack
      requirement: optional

environment:
  os: ubuntu-22.04
  runtimes:
    node: "18.x"
    python: "3.11"
  tools:
    - name: npm
      version: "9.x"
    - name: bash
      version: any
  data:
    - sample.jpg  # repo-relative data inputs if applicable

constraints:
  approvals_required: false
  sandbox:
    filesystem: workspace-write   # read-only | workspace-write | danger-full-access
    network: enabled              # enabled | restricted
  coding_guidelines:
    - Follow `changelog/AGENTS.md` validation style for evidence.
    - Respect existing repo conventions and file organization.
  prohibited:
    - Do not commit secrets or tokens.
    - Do not change unrelated files.

plan:
  - id: 1
    title: Analyze current code paths
    details: >-
      Read listed files, note integration points, confirm assumptions.
    commands:
      - rg -n "function crop" src
    expected_files_touched: []
  - id: 2
    title: Implement core change
    details: Apply minimal diffs aligned with style.
    commands: []
    expected_files_touched:
      - src/editor/crop.ts
  - id: 3
    title: Add/adjust tests
    details: Ensure coverage of edge cases.
    commands:
      - npm test --silent
  - id: 4
    title: Update docs
    details: Update usage or design docs as needed.
    commands: []

acceptance_criteria:
  - Unit tests cover boundary case A and pass locally.
  - Behavior persists across restarts; no regression in feature B.
  - No lint errors; CI scripts run clean locally if available.

validation:
  commands:
    - npm run lint --silent || true
    - npm test --silent
  manual_checks:
    - Open the app and verify X behavior with `sample.jpg`.
  artifacts:
    - screenshots: []

deliverables:
  - src/editor/crop.ts  # updated logic
  - test/crop.spec.ts   # added cases
  - docs/usage/cropping.md  # updated docs

risks:
  - description: Potential performance regression at high DPI
    mitigation: Add targeted tests and profile before/after.
```

## Example — Small Code Fix
```yaml
schema_version: "1.0"
id: TASK-0007
title: Fix crop bounds at high DPI
status: todo
priority: P1
complexity: S
area: frontend

description: >-
  Crop rectangle calculations drift by 1–2px at devicePixelRatio >= 2,
  causing visible misalignment. Fix math and add tests.

outcome: >-
  Crop handles align precisely at all DPIs; new tests pass.

scope:
  in:
    - src/editor/crop.ts
    - test/crop.spec.ts
  out:
    - UI styling/UX changes

context:
  issues: ["#231"]
  related_docs: ["docs/design/crop-geometry.md"]
  repo_paths:
    - src/editor/crop.ts
    - test/crop.spec.ts

environment:
  os: ubuntu-22.04
  runtimes: { node: "18.x" }
  tools: [{ name: npm, version: "9.x" }]

constraints:
  approvals_required: false
  sandbox: { filesystem: workspace-write, network: enabled }
  coding_guidelines:
    - Keep diffs minimal and focused.

plan:
  - id: 1
    title: Audit current geometry
    details: Confirm which function miscalculates at high DPI.
    commands:
      - rg -n "pixelRatio|devicePixelRatio" src/editor/crop.ts
  - id: 2
    title: Correct math and add tests
    details: Normalize coordinates by pixel ratio; cover 1x/2x/3x.
  - id: 3
    title: Run tests and lint
    commands:
      - npm test --silent
      - npm run lint --silent || true

acceptance_criteria:
  - New tests fail before fix and pass after.
  - Manual verification shows no drift at 1x/2x/3x.
  - No unrelated file changes.

validation:
  commands:
    - npm test --silent

deliverables:
  - src/editor/crop.ts
  - test/crop.spec.ts

risks:
  - description: Unexpected side effects in selection overlay
    mitigation: Constrain changes to math helpers only.
```

## Task Complexity & Batching
- Complexity communicates expected effort/scope and informs whether an agent should work on a single task or safely batch multiple tasks in parallel.
- Allowed values and batching guidance:
  - `XS` — trivial: may batch 3–5 tasks if they do not touch overlapping files and are in the same `area`.
  - `S` — small: may batch up to 2–3 tasks with disjoint file paths within the same `area`.
  - `M` — medium: prefer 1 task at a time; batching is discouraged unless clearly independent.
  - `L` — large: single task only.
  - `XL` — epic: single task only, may span multiple sessions.
- Safe batching rules (when batching is permitted by `complexity`):
  - Only batch tasks from the same `area` to reduce context switching.
  - Ensure `context.repo_paths` and `scope.in` sets are disjoint across batched tasks.
  - Keep separate plans, acceptance criteria, and changelog entries per task.
  - If any conflict or unexpected coupling is discovered, immediately stop batching and continue with a single task.
  - Prefer completing all steps of one task before committing changes that affect another batched task.


## Authoring Checklist
- Title and outcome clearly state the goal.
- Scope lists both what is in and out.
- Paths and commands are repo-relative and runnable.
- Acceptance criteria are verifiable within this repo.
- Plan steps are ordered and minimal.
- Validation commands are accurate for the project.
- Deliverables enumerate files to change/create.
- Risks include at least one mitigation.
- `complexity` is set and aligns with intended batching behavior.
- After each working session, add/update a `changelog/` entry (see Session Logging).
- **When adding new fitness functions**: Update `scripts/qa/qa-suite.sh` to ensure the check propagates to local hooks and CI automatically (see QA Suite Integration below).

## LLM Execution Notes
- Prefer reading referenced files before editing.
- Use small, focused patches; avoid unrelated changes.
- Run the provided validation commands locally if permitted.
- Reflect evidence (commands run and results) in the PR or changelog if applicable.
- If constraints block execution (e.g., network restricted), note it and proceed with best offline validation.

## Session Logging (Required)
- After every working session — regardless of whether the task is completed — create or update a `changelog/` entry following `changelog/AGENTS.md`.
- File naming: `changelog/YYYY-MM-DD-short-topic.md` (append to the same day’s file if continuing work).
- Content should include at minimum:
  - Header: date/time (UTC), agent, branch, context.
  - Summary: what progressed and why.
  - Changes Made: grouped by file paths.
  - Validation: commands run and key results; any manual checks.
  - Pending/TODOs: prioritized, with acceptance criteria and blockers.
  - Next Steps: concrete actions.
- Keep the entry concise and scannable as per `changelog/AGENTS.md`.

## Archiving Completed Tasks
- Archive location: `docs/completed-tasks/`
- When a task reaches `status: completed`, move the task file from `tasks/` to `docs/completed-tasks/` (preserving the filename).
- Discovery tools should ignore `docs/completed-tasks/` when scanning for new work.
- Recommended utility: `scripts/pick-task.sh`
  - `scripts/pick-task.sh --list` — list tasks (id, status, path, title)
  - `scripts/pick-task.sh --pick [todo|in_progress]` — print path of the single highest-priority task (default: `todo`) without changing status
  - `scripts/pick-task.sh --claim [TASK_FILE]` — set `status: in_progress`
  - `scripts/pick-task.sh --complete [TASK_FILE]` — set `status: completed` and archive to `docs/completed-tasks/`

## QA Suite Integration

When adding new fitness functions or quality checks, follow this pattern to ensure consistency across local development and CI:

### Adding a New Fitness Check

1. **Update the QA Suite Script**: Add the check to `scripts/qa/qa-suite.sh` in the appropriate stage (QA-A through QA-E)
2. **Add Skip Control**: Support skipping the check via environment variable (e.g., `SKIP_MYCHECK=1`) for local workflows
3. **Document the Check**: Update `docs/testing-standards.md` under the relevant test type section
4. **Update Task Files**: Add acceptance criteria referencing the new check to relevant tasks
5. **Test Locally**: Run `make qa-suite` to verify the check works and fails appropriately

### QA Suite Stages

- **QA-A**: Static Safety Nets (typecheck, lint)
- **QA-B**: Contract Drift Detection (schema validation)
- **QA-C**: Core Flow Contracts (unit, contract tests)
- **QA-D**: Infrastructure & Security (terraform, security audit)
- **QA-E**: Build Verification (lambda builds, tooling)

### Why This Matters

The centralized QA suite ensures:
- Developers run the same checks locally as CI
- Husky hooks use identical validation logic
- New checks automatically propagate to all entry points
- Skip controls provide flexibility without breaking consistency

See `docs/testing-standards.md` for complete QA suite documentation.

## Relation to Other Guidelines
- Validation style can mirror `changelog/AGENTS.md` (concise evidence, grouped by file).
- If other `AGENTS.md` files exist deeper in the tree, they take precedence for files in their scope.

## Maintenance
- Increment `schema_version` only for breaking schema changes.
- Keep examples up to date with repo tooling.
- Consider adding a `tasks/README.md` for cataloging active tasks if volume grows.
