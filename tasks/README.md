# Tasks Authoring Guide

This guide shows how to create a new machine‑readable task file using the canonical template and how to decide task breakdown based on complexity.

## Template Selection

Choose a template based on task complexity to optimize token usage:

| Template | Use For | Token Budget | File |
|----------|---------|--------------|------|
| **Minimal** | Bug fixes, doc updates, single-file changes | ~200 tokens | `TASK-0000-template-minimal.yaml` |
| **Lean** | Most features, typical backend/mobile work | ~1,000 tokens | `TASK-0000-template-lean.yaml` |
| **Comprehensive** | Major refactors, API changes, infra overhauls | ~3,600 tokens | `TASK-0000-template.yaml` |

**Recommendation:** Start with **lean** template for 80% of tasks. Use minimal for trivial changes, comprehensive only for high-stakes architectural work.

## Quick Start
- Choose an `area`: `frontend | backend | shared | infra | docs | ops | other`.
- Choose a template (see table above).
- Allocate a stable `id` (e.g., `TASK-0123`) and a short slug (e.g., `image-crop-bounds`).
- Copy the template and start editing:
  - Minimal: `cp docs/templates/TASK-0000-template-minimal.yaml tasks/<area>/TASK-<id>-<slug>.task.yaml`
  - Lean: `cp docs/templates/TASK-0000-template-lean.yaml tasks/<area>/TASK-<id>-<slug>.task.yaml`
  - Comprehensive: `cp docs/templates/TASK-0000-template.yaml tasks/<area>/TASK-<id>-<slug>.task.yaml`
- Fill in all placeholders. Do not remove required sections. Keep IDs and titles stable.
- Link relevant standards via `context.standards_tier` (lean/minimal) or `context.related_docs` (comprehensive).
- Commit alongside the code branch that will implement the task.

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

## Deciding Breakdown by Complexity
Choose a complexity size, then split work accordingly. Use these heuristics to keep tasks small, testable, and independently shippable.

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
- TASK-0202 (backend): Implement service + provider; unit + reliability tests; acceptance: coverage thresholds met, mutation ≥60%.
- TASK-0203 (mobile): Wire new option to UI; contract client regen; acceptance: E2E happy path on iOS/Android.

2) Introduce S3 lifecycle policy for temp assets
- TASK-0210 (infra): Terraform lifecycle rules + tags; acceptance: `terraform validate`, `tfsec` soft‑fail reports, plan evidence artifact.

## Validation & Evidence
- Prefer the template’s `validation.commands`. Typical quick checks before PR:
  - `pnpm turbo run qa:static --parallel`
  - Area‑specific tests (see package scripts), e.g., `pnpm turbo run test:ci --filter=@photoeditor/backend`
- Attach artifacts listed under `deliverables.evidence` when applicable.

## Status Flow & Archival
- Default flow: `todo → in_progress → completed` (use `blocked` only with a concrete reason).
- On completion, move the file to `docs/completed-tasks/` (see template notes).

## Keep the Templates Authoritative
- Three templates available: minimal, lean, comprehensive (see Template Selection above)
- If you find a gap, improve the appropriate template and reference that change in your task/PR/ADR. Do not diverge per‑task.
- Lean template is recommended default; comprehensive template remains single source of truth for full schema.
