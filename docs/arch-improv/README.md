# Architecture Improvement Reports

Use `docs/arch-improv-session-prompt.md` to run each improvement session. Every taxonomy group from `docs/architectural-improvement-plan.md` must have a dedicated report stored here that captures assessments, remediation intent, and standards alignment—no code changes are performed during the session.

## File Naming
- `docs/arch-improv/<kebab-case-group>.md`
- Example: `docs/arch-improv/atomic-interface-elements.md`

## Required Contents
- ISO/IEC 25010 maintainability scores with evidence
- Detailed remediation plan with approach classification and rationale, explicitly noting that no implementation occurred
- Verification that `STANDARDS.md` already covers the taxonomy group or documentation of recommended updates
- Follow-up actions (tasks, ADRs, evidence) needed to execute the plan outside the session
- Closure note confirming the original checklist item is marked complete

## Workflow Summary
1. Follow the session prompt step-by-step.
2. Analyze and propose remediation without modifying the codebase.
3. Identify whether `STANDARDS.md` requires new or updated clauses and document the recommendation.
4. Produce the report in this directory and link to it from `docs/architectural-improvement-plan.md`.
5. Conclude the session with a completion note to avoid duplicate work.

Keep this directory limited to finalized session artifacts and supporting evidence referenced by those reports.
