# Tasks Authoring Guide

This guide shows how to create a new machine‑readable task file using the canonical template and how to decide task breakdown based on complexity.

## Template Selection

All work now uses a single canonical template: `docs/templates/TASK-0000-template.task.yaml`.

- Copy that file verbatim, then replace every `REPLACE` placeholder.
- Delete comment lines once satisfied, but keep the YAML keys so automation can parse the task.
- If the scope feels broader than one independently shippable change, stop and split the requirements into multiple task files—the template is intentionally concise, so multiple tasks are preferred over an oversized document.

## Quick Start
- Choose an `area`: `frontend | backend | shared | infra | docs | ops | other`.
- Allocate a stable `id` (e.g., `TASK-0123`) and a short slug (e.g., `image-crop-bounds`).
- Copy the single template: `cp docs/templates/TASK-0000-template.task.yaml tasks/<area>/TASK-<id>-<slug>.task.yaml`
- Replace every placeholder. Keep IDs and titles stable.
- Link the relevant standards via `context.standards_tier` and `context.related_docs`.
- Commit the task alongside the code branch that will implement it.

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
- `acceptance_criteria` (objective checks)
- `validation` (commands + any manual checks)
- `deliverables` and `risks`

If sequencing matters, also set `blocked_by` and `order`.

### Handling Blockers
- When work is impeded by an issue outside the task scope, change `status` to `blocked` and record a one-line reason in `blocked_reason` (see template updates below).
- Create a dedicated unblocker task in the appropriate `tasks/<area>/` folder. Its description must focus on clearing the blocker, and its `priority` should match or exceed the highest-priority task depending on it (default to the parent task’s priority unless an escalation to P0 is warranted).
- Add the new task’s ID to the original task’s `blocked_by` list so orchestration scripts understand the dependency chain.
- Treat unblocker tasks as top-of-queue items; close them promptly, then flip the original task back to `in_progress` or `todo` and continue.

## Deciding Breakdown by Complexity
Choose a complexity size, then split work accordingly. Use these heuristics to keep tasks small, testable, and independently shippable. When in doubt, create multiple task files—forcing everything into a single task is an anti-pattern and makes the template’s guidance ambiguous for downstream agents.

### Complexity Levels
- `XS` — Trivial change, ≤2 files, low risk, same layer.
- `S` — Small feature/fix, 3–6 files or one module, single area.
- `M` — Medium change, cross‑module within one area, or introduces a new dependency; measurable risk.
- `L` — Multi‑area feature or refactor touching 2 tiers (e.g., shared contracts + backend), requires sequencing.
- `XL` — Epic: multi‑tier, spans multiple sessions and PRs; requires staging and explicit validation strategy.

### Split Rules
- If work crosses tiers, split by tier:
  - Shared contracts → Backend → Frontend/Mobile → Infra (if applicable).
  - Use `blocked_by` to encode the sequence (e.g., frontend blocked by backend).
- If contracts change, isolate contract updates as their own task (`shared` area) so other tasks depend on a stable spec.
- If infra changes are required (queues, buckets, IAM), create an `infra` task separate from application code.
- For `M` and above, avoid batching. Keep one task per PR where possible.
- For `XS/S` in the same area, you may batch only if `scope.in` and `context.repo_paths` of batched tasks do not overlap.
- If any coupling emerges mid‑work, stop batching and continue with a single task.

### Decision Checklist
- Does this affect more than one area/tier? If yes → split by tier.
- Are API/contract shapes changing? If yes → create a `shared` task first.
- Is there new infrastructure or security posture change? If yes → separate `infra` task.
- Is manual validation significant (UX, DX)? Consider a dedicated `docs/ops` task for evidence and playbooks.

## Example Breakdowns

1) Add server‑side image auto‑rotate (EXIF)
- TASK-0201 (shared): Extend image processing options schema; update Zod and OpenAPI; acceptance: semantic diff shows backward‑compatible addition.
- TASK-0202 (backend): Implement service + provider; unit tests updated; acceptance: coverage thresholds met.
- TASK-0203 (mobile): Wire new option to UI; contract client regen; acceptance: mobile unit tests updated with new flows.

2) Introduce S3 lifecycle policy for temp assets
- TASK-0210 (infra): Terraform lifecycle rules + tags; acceptance: `terraform validate`, `tfsec` soft‑fail reports, plan evidence artifact.

## Validation & Evidence
- Prefer the template's grouped `validation` commands. Typical quick checks before PR:
  - `pnpm turbo run qa:static --parallel`
  - Area‑specific tests (see package scripts), e.g., `pnpm turbo run test:ci --filter=@photoeditor/backend`
- Attach artifacts listed under the task’s `artifacts` list when applicable.

## Agent Orchestration Model

Tasks are executed by Claude Code agents following a structured workflow. Understanding this model helps you write agent-compatible task files.

### Agent Roles

| Agent | Responsibility | Output |
|-------|---------------|--------|
| task-runner | Orchestrate workflow, spawn agents, create changelog, commit | `changelog/YYYY-MM-DD-{topic}.md` |
| task-picker | Claim task, implement plan, write tests | `.agent-output/task-picker-summary-{TASK-ID}.md` |
| test-static-fitness | Run qa:static, fitness functions | `docs/tests/reports/YYYY-MM-DD-static-fitness.md` |
| test-unit-backend | Run backend unit tests | `docs/tests/reports/YYYY-MM-DD-unit-backend.md` |
| test-unit-mobile | Run mobile unit tests | `docs/tests/reports/YYYY-MM-DD-unit-mobile.md` |
| test-unit-shared | Run shared unit tests | `docs/tests/reports/YYYY-MM-DD-unit-shared.md` |
| test-contract | Validate API contracts | `docs/tests/reports/YYYY-MM-DD-contract.md` |

### Task File Requirements for Agent Compatibility

1. **Declare affected packages:**
   ```yaml
   context:
     affected_packages: [backend, shared]  # Guides test agent spawning
   ```

2. **Group validation commands by test type:**
   ```yaml
   validation:
     static_checks:      # test-static-fitness
       - pnpm turbo run qa:static --filter=@photoeditor/backend
       - npx dependency-cruiser --validate .dependency-cruiser.json src/

     unit_tests:         # test-unit-{package} agents
       backend:
         - pnpm turbo run test --filter=@photoeditor/backend
       shared:
         - pnpm turbo run test --filter=@photoeditor/shared

     contract_tests:     # test-contract agent
       - pnpm turbo run test:contract --filter=@photoeditor/backend
       - pnpm turbo run contracts:check --filter=@photoeditor/shared
   ```

3. **Use correct package manager syntax:**
   - Always: `pnpm turbo run {script} --filter=@photoeditor/{package}`
   - Backend: `--filter=@photoeditor/backend`
   - Mobile: `--filter=photoeditor-mobile`
   - Shared: `--filter=@photoeditor/shared`

4. **Cite tier standards:**
   ```yaml
   context:
     standards_tier: backend  # Auto-includes global.md, AGENTS.md, testing-standards.md
   ```

### Agent Workflow Diagram

```
┌─────────────┐
│ task-runner │ Orchestrator picks task, spawns agents
└──────┬──────┘
       │
       ├─────> task-picker (implements plan)
       │       └─> writes: .agent-output/task-picker-summary-{ID}.md
       │
       ├─────> test-static-fitness (runs qa:static, fitness functions)
       │       └─> writes: docs/tests/reports/YYYY-MM-DD-static-fitness.md
       │           └─> If BLOCKED: task-runner stops, creates changelog, reports
       │
       ├─────> test-unit-backend, test-unit-mobile, test-unit-shared (parallel)
       │       └─> each writes: docs/tests/reports/YYYY-MM-DD-unit-{package}.md
       │           └─> If any BLOCKED/FAIL: task-runner stops, creates changelog, reports
       │
       ├─────> test-contract (if shared affected)
       │       └─> writes: docs/tests/reports/YYYY-MM-DD-contract.md
       │           └─> If BLOCKED/FAIL: task-runner stops, creates changelog, reports
       │
       └─────> All PASS:
               1. Aggregate work summary + test reports
               2. Create changelog/YYYY-MM-DD-{topic}.md
               3. Archive task to docs/completed-tasks/
               4. Git commit
               5. If pre-commit fails: update changelog, stop loop
```

### File Handoff Contract

Each agent produces predictable outputs:

**task-picker:**
```markdown
# .agent-output/task-picker-summary-TASK-0123.md
**Packages Modified:** backend, shared
**Files Changed:** 15
**Features Added:** [list]
**Standards Enforced:** backend-tier.md, typescript.md
**Tests Created/Updated:** [list]
```

**test agents:**
```markdown
# docs/tests/reports/2025-10-23-unit-backend.md
**Status:** PASS | FAIL | BLOCKED
**Summary:** Brief description
**Issues Fixed:** 3
**Issues Deferred:** 2
**Blocking Reason:** (if BLOCKED)
```

**task-runner:**
Reads all agent outputs → creates final changelog.

### Important Notes

- Test agents have limited scope: they fix test infrastructure issues only (timeouts, selectors, imports)
- Test agents defer application bugs as P0/P1 issues for manual fixing
- Fitness function agents validate architectural constraints and code quality metrics
- Always read validation reports—don't assume PASS means no action needed (may have deferred issues)
- **Key principle:** Run fitness functions scoped to your edits during implementation, not just pre-PR

## Status Flow & Archival
- Default flow: `todo → in_progress → completed` (use `blocked` only with a concrete reason).
- On completion, move the file to `docs/completed-tasks/` (see template notes).

## Keep the Templates Authoritative
- Three templates available: minimal, lean, comprehensive (see Template Selection above)
- If you find a gap, improve the appropriate template and reference that change in your task/PR/ADR. Do not diverge per‑task.
- Lean template is recommended default; comprehensive template remains single source of truth for full schema.
