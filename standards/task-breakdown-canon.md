# Task Breakdown Canon

Authoritative guidance for decomposing work into independently shippable, automatable tasks. This canon is the single source of truth for when and how to break down tasks and how agents and humans should proceed when complexity or blockers are discovered.

## Scope & Audience
- Applies to all task files under `tasks/` across areas: backend, mobile, shared, infra, docs, ops.
- Used by humans and by automation (task-runner, task-implementer, implementation-reviewer).
- Complements (does not replace) `docs/templates/TASK-0000-template.task.yaml` and `standards/standards-governance-ssot.md`.

## Goals
- Keep changes small, testable, and reversible.
- Encode dependencies explicitly via `blocked_by` and optional `order`.
- Preserve architectural boundaries: shared contracts → backend → clients → infra.
- Make orchestration predictable for `.claude` agents and CI.

## Decision Algorithm (When to Break Down)
1) Read the task file and draft plan.
2) Score complexity using all signals below; if any “Too Complex” signal fires, break down:
   - Cross-tier: touches more than one tier (shared, backend, mobile, infra) → split by tier.
   - File fan-out: >5 files across different modules or layers.
   - Plan size: >6 ordered steps or multiple parallel efforts.
   - Architectural breadth: new contracts + infra + app logic in one go.
   - Risk & unknowns: ambiguous scope, research required, external dependencies.
   - Reviewer “DO NOT FIX”: issues that should be deferred (see section below).
3) If no “Too Complex” signal and scope is ≤5 related files in one tier with ≤6 steps → implement directly.

## How to Break Down
1) Partition by boundary first
   - Contracts first (shared) → backend → mobile/frontends → infra (if any).
   - Separate evidence/ops/docs if substantial.
2) Define independent subtasks
   - One outcome per subtask; avoid overlapping `scope.in`.
   - Create files under `tasks/<area>/TASK-<id>-<slug>.task.yaml` using `docs/templates/TASK-0000-template.task.yaml`.
3) Encode dependencies explicitly
   - Set `blocked_by` on downstream tasks; optionally set `order` for strict sequencing.
4) Update the original task
   - Set `status: blocked`.
   - Set `blocked_reason: "Broken down into subtasks for manageable implementation"` (or more specific reason).
   - List created subtask IDs under `blocked_by`.
5) Record a breakdown summary
   - Agents write `.agent-output/task-implementer-summary-{TASK-ID}.md` with “BROKEN DOWN INTO SUBTASKS” and the list + order of subtasks.

## YAML Snippets (Copy/Paste)
Subtask header skeleton:
```yaml
id: TASK-1234
title: "<concise outcome>"
status: todo
priority: P1
area: backend
unblocker: false         # set true if this task unblocks other work (prioritized by pick-task.sh)
blocked_by: [TASK-1233]  # upstream dependency if any
order: 1                 # optional sequence if multiple subtasks exist
```

Unblocker task skeleton (for external/out-of-scope blockers):
```yaml
id: TASK-1235
title: "Fix {specific blocker issue}"
status: todo
priority: P0             # match or exceed priority of blocked task
area: ops                # appropriate area
unblocker: true          # ensures pick-task.sh selects this first
blocked_by: []
order: null
```

Mark original as blocked:
```yaml
status: blocked
blocked_reason: "Broken down into subtasks for manageable implementation"
blocked_by: [TASK-1234, TASK-1235]
```

## Handling “Blocked due to Complex Issue”
When any task is marked `status: blocked` and `blocked_reason` indicates complexity (e.g., “requires decomposition”, “complex cross-tier change”, “research prerequisite”):
- Run a Breakdown Pass using this canon.
- Verify required subtasks exist and dependency links are set.
- If subtasks are missing, create them immediately using the template, then keep the original task blocked until all subtasks complete.

## Implementation Reviewer: “DO NOT FIX” → Defer via Subtask
When the reviewer encounters items labeled “DO NOT FIX” (out of scope or too large):
- Do not widen the current task. Instead, create dedicated follow-up task(s) per this canon.
- Reference the exact file/line and standard in the follow-up task description.
- Set priority to match the severity; add ADR/standards CR links if the fix implies a standards change.

## Examples
1) Add EXIF autorotate support
   - TASK-0201 (shared): Extend image options schema (Zod/OpenAPI). Downstream tasks depend on this ID.
   - TASK-0202 (backend): Implement provider/service. Blocked by TASK-0201.
   - TASK-0203 (mobile): Wire UI; regen client. Blocked by TASK-0201.

2) Temp asset lifecycle policy
   - TASK-0210 (infra): Terraform lifecycle rules + tags; evidence plan attached.

## Agent Responsibilities (Operationalization)
- task-implementer: perform Complexity Assessment first; if “Too Complex”, execute “How to Break Down” and stop implementation on the parent task.
- task-runner: if it detects a task blocked for complexity, verify the subtasks exist; if not, trigger a Breakdown Pass using this canon and skip validation for the blocked parent.
- implementation-reviewer: convert “DO NOT FIX” items into follow-up tasks using this canon and cite standards/ADRs in the defer notes.

## References
- Template: `docs/templates/TASK-0000-template.task.yaml`
- Standards Governance SSOT: `standards/standards-governance-ssot.md`
- Tier Standards Index: `standards/AGENTS.md`

