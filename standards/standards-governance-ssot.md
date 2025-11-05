# Standards Grounding & Change Requests (SSOT)

Purpose

- This document is the single source of truth (SSOT) for how tasks and agents ground/anchor to repository standards and how standards changes are proposed, reviewed, and adopted.
- It governs Task authoring in `tasks/`, implementation and review agents in `.claude/`, and PR expectations for standards alignment.

Scope & Precedence

- Process SSOT: this file is authoritative for grounding and the change‑request (CR) workflow.
- Technical standards: the tier and language rules in `standards/` (e.g., `global.md`, `typescript.md`, `cross-cutting.md`, `backend-tier.md`, `frontend-tier.md`, `shared-contracts-tier.md`, `infrastructure-tier.md`) are authoritative for what “correct” means.
- Records of intent and approval live in task files under `tasks/` (see repository guidelines). ADRs in `adr/` record lasting architectural decisions.

Grounding/Anchoring Expectations

- Every task must explicitly cite the relevant standards sections in `context.related_docs` and plan a “Standards review” step tied to those citations.
- PRs must include a short “Standards citations” section that lists the exact files and section headings used for conformance.
- When code or docs diverge from standards, add an Exception entry (see `standards/global.md` governance notes) with an expiry ≤ 90 days and open a Standards CR (below) to remove the exception.

Authoritative Order During Work

1) This SSOT (process) → 2) Tier/Language standards (rules) → 3) ADRs (decisions) → 4) Task file (intent, scope, acceptance) → 5) PR description and evidence.

Roles & Responsibilities (Solo Maintainer Friendly)

- Task Author (you): anchors the task to standards, proposes CR when gaps are found, and ensures acceptance criteria reference standards signals.
- Task Implementer agent: enforces cited standards during edits; if a gap blocks compliant implementation, it pauses and opens a Standards CR task (docs area) instead of embedding ad‑hoc rules.
- Implementation Reviewer agent: verifies conformance against the cited standards and this SSOT; may make surgical edits to achieve compliance or BLOCK pending a Standards CR.
- Validation agents: execute tests and quality gates; they do not change standards.

How to Cite Standards (Tasks & PRs)

- Prefer file + section: e.g., `standards/typescript.md#Discriminated Unions & Exhaustiveness`.
- When a precise sentence matters, also cite a stable phrase in quotes: e.g., "Zod at boundaries".
- Include at least one tier file and any cross‑cutting or language files that apply.

Anchor Heading Requirements (Schema 1.1+)

**Effective 2025-11-04:** Task files using schema version 1.1+ must reference verifiable anchor headings.

- **Heading-to-slug conversion rules:**
  - Convert heading text to lowercase
  - Replace spaces with hyphens
  - Remove special characters (except hyphens)
  - Example: "Domain Service Layer" → `#domain-service-layer`

- **Validation requirements:**
  - Anchors cited in task `plan.details` and `definition_of_done` fields must exist in the referenced standards file
  - Use `python scripts/tasks.py --lint` to validate anchor references before transitioning tasks from `draft` to `todo`
  - Task linter warns when referenced headings cannot be resolved

- **Stability expectations:**
  - Heading anchors are considered stable API surface for standards documents
  - When renaming headings during Standards CR, preserve old anchors or update all referencing tasks
  - Document anchor changes in the Standards CR evidence

- **Example valid citations:**
  - `standards/typescript.md#analyzability` (heading exists: "Analyzability")
  - `standards/backend-tier.md#domain-service-layer` (heading exists: "Domain Service Layer")
  - `standards/testing-standards.md#coverage-expectations` (heading exists: "Coverage Expectations")

- **Example invalid citations:**
  - `standards/typescript.md#neverthrow-result-pattern` (heading does not exist)
  - `standards/backend-tier.md#service-rules` (ambiguous, multiple potential matches)

Classifying Which Standards Apply (Agents)

- Primary reference: `standards/AGENTS.md` (Quick Reference) lists tiers and links to the detailed standards.
- Path-based mapping used by agents and tasks:
  - `backend/**` → `standards/backend-tier.md`
  - `mobile/**` → `standards/frontend-tier.md`
  - `shared/**` → `standards/shared-contracts-tier.md`
  - `infrastructure/**` or `infra/sst/**` → `standards/infrastructure-tier.md`
  - Always include `standards/cross-cutting.md` and `standards/typescript.md` for any code change.
  - Docs/process updates → `standards/global.md` plus this SSOT; add or link ADRs when policy-level rules change.

- Agent application:
  - Task Implementer: derive applicable tiers from the task’s `context.affected_packages` and the git diff; cite those files plus cross‑cutting and TypeScript.
  - Implementation Reviewer: confirm/adjust the classification; BLOCK if a change implies a new or altered rule without a Standards CR task.
  - Validation agents: select suites by `affected_packages`; they validate gates but do not redefine standards.

- Multi-area changes must cite each relevant tier standard and state sequencing (e.g., shared → backend → mobile → infra) in the task plan.

Standards Change Requests (CR) — When to Use

Open a Standards CR when any of the following are true:
- A rule is missing, ambiguous, or routinely waived.
- A change introduces a new pattern, tool, or cross‑cutting policy.
- A change weakens or strengthens an existing fitness gate or alters acceptance evidence.
- A temporary Exception needs a path to removal.

Standards CR Workflow (Authoritative)

1) Create a task under `tasks/docs/` using the canonical template.
   - Title starts with “Standards CR: …”.
   - `area: docs` and `standards_tier` set to the most affected tier (or `cross-cutting`).
   - In `context.related_docs`, include: this SSOT, the files being changed, any affected ADRs.
   - Acceptance must include: updated standards files merged, citations updated in the driving task/PR, and (if applicable) a new/updated ADR.
2) Author the change as a focused PR that only edits standards and related ADRs/templates.
   - Update examples, reviewer checklists, and any referenced commands.
   - If the change affects automation (dep rules, QA pipeline), update `turbo.json` or scripts in a follow‑up PR referenced by the CR.
3) Evidence & Review (solo maintainer discipline):
   - Add a “Standards CR” section in the PR with rationale, impact, risk/rollback, and a verification plan.
   - Link the CR task and any related Exception entries; set expiry for any interim exceptions.
4) Adoption:
   - Merge only after the driving implementation is either updated to conform or explicitly blocked pending the new standard.
   - Update the driving task and PR to cite the new/changed sections.

Change Types & Requirements

- Editorial/clarification: wording only, no rule change → task + PR citing SSOT; no ADR needed.
- Normative update: adds/changes rules or gates → CR task + PR + link or create ADR; require rollback notes.
- Policy addition/removal that affects risk/security/cost → CR task + ADR + explicit Exception handling if transitional.

Implementer Agent — Required Behavior

- Before edits: read the driving task’s `context.related_docs` and this SSOT.
- If you can implement within current standards, proceed and cite the standards in your summary.
- If compliant implementation is blocked by missing/ambiguous rules, STOP and create a “Standards CR” task (docs area) instead of introducing local conventions. Record the block and link the new task ID in your summary.

Implementation Reviewer Agent — Required Behavior

- Verify that the implementation cites standards and aligns to them. Use this SSOT’s order of precedence.
- If violations are fixable with surgical edits, apply them and record the exact standards sections you enforced.
- If violations imply a rule change, BLOCK and require a Standards CR. Do not accept ad‑hoc rules without a CR task.

PR Checklist (Paste in PRs that change code or standards)

- Standards citations: file + section for each applicable rule.
- Exceptions: link registry entries with expiry dates (if any).
- Evidence: latest static analysis output attached (unless docs‑only PR); see `standards/qa-commands-ssot.md` for the canonical commands.
- ADR: linked or newly added when the change is architectural or policy‑level.
- Tasks: driving task linked; Standards CR task linked when applicable.

Definition of Done — Standards CR

- CR task in `tasks/docs/` is completed.
- Standards files updated and merged; examples and reviewer checklists kept in sync.
- Any transitional Exception created with explicit expiry.
- Driving task/PR updated to cite the new/changed standards.

Notes

- The repo operates with a solo‑maintainer discipline. Treat the CR task + PR narrative as the approval trail. Keep diffs small, isolate standards changes, and update templates/checklists when rules move.
