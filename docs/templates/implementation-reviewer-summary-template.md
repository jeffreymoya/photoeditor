# Implementation Reviewer Output Template

Use this format for `.agent-output/implementation-reviewer-summary-{TASK-ID}.md`.

```markdown
# Implementation Review Summary - {TASK-ID}

## Context
- Affected packages: {list}
- Files reviewed: {count or key paths}

## Diff Safety Gate
- Prohibited patterns (`@ts-ignore`, `eslint-disable`, `it.skip`): ✅ NONE / ❌ FOUND {and action}
- Status: PASS / BLOCKED

## Standards Alignment Check
- Cross-Cutting (Hard-Fail Controls) ✓/✗
- TypeScript ✓/✗
- Tier Standards: {list with ✓/✗}

## Edits Made
### Hard Fail Corrections
1. {file:line} Issue → Fix → Standard: "STANDARD-ID — paraphrase"

### Standards Improvements
1. {file:line} Issue → Fix → Standard: "STANDARD-ID — paraphrase"

### Deprecated Code Removed
1. {file:line} Removal → Reason

## Deferred Issues
1. {file:line} Issue | Standard | Reason | Priority

## Standards Compliance Score
- Overall: High / Medium / Low
- Hard fails: {X}/{Y} passed
- Standards: {breakdown}

## Summary for Validation Agents
- {Concise notes for downstream validation}
```
