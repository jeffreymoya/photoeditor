# Task Implementer Output Templates

Use these markdown scaffolds when writing to `.agent-output/`.

## Implementation Summary
```markdown
# Task Implementation Summary - {TASK-ID}

**Status:** IMPLEMENTED
**Packages Modified:** {comma-separated packages}
**Files Changed:** {count}

## Features Added
- {short bullet}

## Scope Confirmation
- Task `repo_paths` alignment: ✅ Matches diff / ❌ Updated → {describe additions/removals}
- Git diff summary: `{git diff --stat}`

## Standards Enforced
- {STANDARD-ID — brief paraphrase}

## Tests Created/Updated
**CRITICAL:** Document every test file so validation agents can target runs.
- {path} ({new/updated}: {context})

## QA Evidence
- `{command}` — PASS — log: `.agent-output/{TASK-ID}-{command}.log` (notes)

## Diff Safety Audit
- Prohibited patterns (`@ts-ignore`, `eslint-disable`, `it.skip`): ✅ PASS/❌ FAIL
- {Additional notes}

## Key Implementation Details
- {approach rationale}

## Deferred Work
- {follow-up, if any}
```

## Breakdown Summary
```markdown
# Task Breakdown Summary - {TASK-ID}

**Status:** BROKEN DOWN INTO SUBTASKS
**Reason:** {why the canon flagged this as too complex}

## Complexity Assessment
- Files to modify: {X} files across {Y} domains
- Plan steps: {Z}
- Architectural scope: {concise description}
- Decision: Too complex — created subtasks

## Subtasks Created
1. **{TASK-ID-1}**: {title} — {description}
   - Priority: P{N}
   - Scope: {what it covers}
   - File: tasks/{area}/{TASK-ID-1}-{slug}.task.yaml

{repeat as needed}

## Original Task Status
- Status set to: blocked
- Blocked reason: "Broken down into subtasks for manageable implementation"
- Blocked by: [{TASK-ID-1}, {TASK-ID-2}, ...]

## Subtask Execution Order
1. {TASK-ID-1}
2. {TASK-ID-2} ...

## Next Steps
- Task-runner will process subtasks in priority order.
- Unblock the original task when all subtasks complete.
```
