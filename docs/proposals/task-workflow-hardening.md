# Task Workflow Hardening Proposal

**Status:** ✅ IMPLEMENTED (2025-11-04)
**Implementation:** See `changelog/2025-11-04-task-workflow-hardening.md` for complete details

## Summary
- Align the task authoring workflow with current guardrails so every task can drive reliable automation, evidence capture, and self-review.
- Close gaps between the canonical task template, authoring guide, and actual drafts (e.g., TASK-0901) before further work relies on inconsistent standards.

**Implementation Notes:**
- Schema version 1.1 introduced with strict validation requirements
- Template updated with validation section and corrected anchor examples
- CLI linter created (`python scripts/tasks.py --lint`)
- Evidence bootstrap command added (`python scripts/tasks.py --bootstrap-evidence`)
- All documentation updated (README, standards, examples)
- Backward compatible with schema 1.0 tasks (no migration required)

## Goals
- Guarantee each task surfaces explicit validation commands anchored in `standards/qa-commands-ssot.md`.
- Ensure evidence artefacts referenced in tasks exist at draft-exit time.
- Provide deterministic links to standards clauses so automation can trace plan steps and acceptance criteria to their governing rules.
- Eliminate template ambiguities that let plan outputs, validation, or coverage gates go unspecified.

## Current Workflow Pain Points
- **Template vs. guide drift:** `tasks/README.md` mandates a `validation` section, but `docs/templates/TASK-0000-template.task.yaml` omits it, and new drafts like `tasks/backend/TASK-0901-job-domain-purity.task.yaml` follow the template’s lead, leaving validation blank.
- **Evidence blind spot:** Tasks must declare `clarifications.evidence_path`, yet there is no guard ensuring the referenced Markdown exists (e.g., TASK-0901 points at `docs/evidence/tasks/TASK-0901-clarifications.md`, which is missing).
- **Broken standards anchors:** Plan steps cite headings such as `standards/typescript.md#neverthrow-result-pattern` that do not exist, so compliance checks cannot resolve the clause.
- **Empty plan outputs:** Template-provided `outputs: []` placeholders encourage omission of artefact expectations, derailing automation that depends on concrete deliverables.
- **Coverage ambiguity:** `AGENTS.md` elevates service coverage to ≥80% line / ≥70% branch, while `standards/testing-standards.md` still states ≥70% / ≥60%, leaving authors unsure which threshold governs acceptance criteria.

## Proposed Changes
1. **Template update**
   - Add an explicit `validation` block stub (with `static_checks`, `unit_tests`, `coverage`, `manual_checks`) to `docs/templates/TASK-0000-template.task.yaml`.
   - Replace plan `outputs: []` placeholders with concrete `REPLACE` instructions so empty arrays fail validation.
   - Swap example clause anchors for verified headings (or add named anchors in standards docs).
2. **Authoring CLI lint rules**
   - Extend `scripts/tasks.py` to fail when:
     - `clarifications.evidence_path` points to a non-existent file.
     - `validation` is missing or has empty required subsections.
     - Plan steps retain empty `outputs`.
     - Standards references in `details`/`definition_of_done` lack matching anchors (validate via heading slug extraction).
3. **Standards alignment**
   - Update `standards/testing-standards.md` to match the ≥80% / ≥70% policy cited in `AGENTS.md`, or clarify tier-specific overrides and reference them from the template comments.
4. **Migration plan**
   - Regenerate existing draft tasks with the updated template (start with TASK-0901) and create missing evidence Markdown files.
   - Document the workflow changes in `tasks/README.md` and announce via changelog entry for discoverability.

## Implementation Steps
1. Patch the template and authoring guide with the new sections and instructions.
2. Enhance `scripts/tasks.py` validation per the lint rules above and add automated tests covering failure modes.
3. Update `standards/testing-standards.md` (or companion ADR) to reconcile coverage thresholds.
4. Run the CLI against all existing tasks; remediate any reported violations and add the missing evidence files.

## Risks & Mitigations
- **Risk:** Template changes could break automation expecting the old shape.  
  **Mitigation:** Version the schema (`schema_version: "1.1"`) and update automation in lockstep.
- **Risk:** Enforcing evidence existence may block in-flight drafts.  
  **Mitigation:** Provide a bootstrap script to create empty evidence stubs when drafting.
- **Risk:** Anchor validation may flag legitimate references after standards renames.  
  **Mitigation:** Add anchors during standards edits and document the requirement in `standards/standards-governance-ssot.md`.

## Success Metrics
- 100% of tasks created post-change include populated validation commands and evidence files.
- Task CLI lint passes provide deterministic reasons when a task is incomplete.
- Reduced review churn around missing coverage, validation, or standards links during the next three task approvals.

## References
- `tasks/README.md`
- `docs/templates/TASK-0000-template.task.yaml`
- `standards/qa-commands-ssot.md`
- `AGENTS.md`
- `standards/testing-standards.md`
