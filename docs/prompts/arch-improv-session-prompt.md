# Arch Improvement Session Prompt

## Goal
Guide an LLM facilitator through a focused architecture improvement cycle based on `docs/architectural-improvement-plan.md`, ensuring maintainability is assessed, remediation intent is captured (without executing code changes), and `STANDARDS.md` accurately governs the target taxonomy group.

## Required Inputs
- `docs/architectural-improvement-plan.md`
- `STANDARDS.md`
- Relevant code, configuration, and tests for the selected taxonomy group
- Existing records in `docs/arch-improv/`

## Session Workflow
1. **Select Taxonomy Group**
   - Parse the first unchecked (`- [ ]`) entry in `docs/architectural-improvement-plan.md`, ordered top-to-bottom.
   - Confirm no existing report in `docs/arch-improv/` references this group.
   - Reserve the group by switching its checkbox to `- [x]` and append `(see docs/arch-improv/<slug>.md)` as a trailing note.

2. **Context Scan**
   - Identify code modules, services, and documents tied to the group.
   - Capture architectural qualities (dependencies, owners, known issues) needed for maintainability scoring and remediation planning.

3. **Maintainability Assessment (ISO/IEC 25010)**
   - Score **Modularity, Reusability, Analysability, Modifiability, Testability** on a 1–5 scale (1=critical gap, 5=exceeds target).
   - Provide concrete evidence for each score: file references, metrics, coupling analyses, or tooling output.
   - Note any deviations from existing `STANDARDS.md` controls.

4. **Improvement Strategy Decision**
   - Decide whether remediation should rely on: (a) adopting an external library/framework, (b) introducing a design pattern, or (c) a bespoke implementation.
   - Justify the recommendation using the maintainability scores, risk, and alignment with repository standards.

5. **Draft Remediation Plan (Do Not Execute)**
   - Outline the implementation approach in detail: target modules, interfaces, dependency changes, validation strategy, and rollout considerations.
   - Explain why the plan is sufficient (or unnecessary if current state is acceptable) and document measurable success criteria.
   - Explicitly confirm no code modifications were performed during the session.

6. **STANDARDS Coverage Audit**
   - Inspect `STANDARDS.md` to confirm it includes explicit guidance for the taxonomy group and the proposed remediation practices.
   - If coverage is missing, specify the clauses that must be added or amended; include wording recommendations but do not edit the file.
   - Document whether updates are required and reference the relevant sections.

7. **Create Analysis Artifact**
   - Author `docs/arch-improv/<slug>.md` using the template below, summarizing assessment findings, remediation intent, and standards alignment.
   - Replace `<slug>` with a kebab-case summary of the taxonomy group (e.g., `atomic-interface-elements`).
   - Ensure the document is self-contained and links to all cited sources.

8. **Close the Session**
   - Re-read the updated checklist entry to confirm it reflects completion.
   - Produce a short completion note ("Session complete: <group>") and stop execution.

## Analysis Template (`docs/arch-improv/<slug>.md`)
```
# <Taxonomy Group Name>

- **Source Task**: docs/architectural-improvement-plan.md
- **Checklist Entry**: replace with exact bullet text
- **Primary Owners**: optional / TBD

## Maintainability Scores (ISO/IEC 25010)
| Attribute | Score (1–5) | Evidence & References |
|-----------|-------------|------------------------|
| Modularity |  |  |
| Reusability |  |  |
| Analysability |  |  |
| Modifiability |  |  |
| Testability |  |  |

## Observations & Risks
- Summarize critical findings with file references.

## Remediation Plan (Not Executed)
- Recommended approach type (Library / Framework / Design Pattern / Custom Implementation)
- Detailed implementation outline (layers, modules, interfaces, dependencies)
- Rationale and expected impact on maintainability scores
- Validation and rollout strategy
- Confirmation: "No code changes executed during this session"

## STANDARDS Coverage Review
- Existing clauses that govern this taxonomy group (cite exact sections)
- Gaps identified and recommended wording updates (if any)
- Follow-up actions required to align standards

## Follow-up Log
- Tasks or ADRs to create
- Evidence required to close the remediation plan

## Session Closure
- Confirmation that the taxonomy group checkbox is set to `[x]`
- Date and facilitator signature/identifier
- "Session complete"
```

## Notes
- Use ASCII only; follow repo linting and formatting rules.
- Keep the analysis actionable—cite paths like `mobile/src/...` or `backend/lambdas/...` with precise line anchors when possible.
- If evidence is unavailable, log the gap explicitly and recommend instrumentation.
- Ending the session is mandatory to prevent double-booking taxonomy groups.
