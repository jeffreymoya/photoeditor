---
description: Break down proposal into sessions and execute with parallel waves and living documentation
---

You are orchestrating a multi-session implementation from a proposal document. The proposal will evolve into a living implementation log as you execute sessions.

## Arguments

- `{ARG1}` - Path to proposal document (e.g., `docs/proposals/my-feature.md`)
- `--resume` (optional) - Resume from last completed wave

## Process Overview

1. **Read Proposal** - Load the proposal document
2. **Breakdown Sessions** - Use Plan agent to analyze and create session plan
3. **Show Plan** - Display execution plan for user confirmation
4. **Execute Waves** - Run sessions in parallel waves
5. **Update Document** - Append results after each wave
6. **Handle Failures** - Document errors and enable resumption

---

## Step 1: Initialize and Check Resumption

First, check if we're resuming from a previous run by looking for state file at `.agent-output/orchestrator-state.json`.

If `--resume` flag is present and state file exists:
- Load the state (completed waves, current wave, failed sessions)
- Skip to Step 4 (Execute Waves) starting from the incomplete wave
- Show resumption status to user

If NOT resuming:
- Start fresh orchestration
- Proceed to Step 2

---

## Step 2: Breakdown Sessions

Use the **Plan agent** (Task tool with subagent_type="Plan") to analyze the proposal and break it down into executable sessions.

### Prompt for Plan Agent:

```
Analyze the following proposal document and break it down into implementation sessions suitable for parallel execution.

PROPOSAL DOCUMENT:
[Read {ARG1} and include its full contents here]

REQUIREMENTS:
1. Break the implementation into logical, independent sessions
2. Each session should:
   - Be completable in <45 minutes
   - Modify <10 files (hard limit from task-breakdown-canon.md)
   - Have a clear, testable scope
   - Include specific file paths that will be modified
3. Determine dependencies between sessions
4. Group sessions into waves where:
   - Sessions in the same wave can run in parallel (no overlapping files)
   - Sessions in later waves depend on earlier waves completing
5. Apply principles from standards/task-breakdown-canon.md:
   - Partition by tier boundaries (shared → backend → mobile → infra)
   - One outcome per session
   - Keep sessions small, testable, reversible
   - <500 LOC delta per session (hard fail threshold)

OUTPUT FORMAT (JSON):
{
  "waves": [
    [
      {
        "id": "S1",
        "title": "Brief session title",
        "scope": "What this session accomplishes",
        "files": ["path/to/file1.ts", "path/to/file2.ts"],
        "deliverables": ["Specific deliverable 1", "Specific deliverable 2"],
        "implementation": "Detailed step-by-step implementation instructions for adhoc agent",
        "validation": "Commands to run for validation (e.g., pnpm turbo run qa:static --filter=@photoeditor/backend)",
        "acceptance_criteria": ["Testable criterion 1", "Testable criterion 2"]
      }
    ],
    [
      {
        "id": "S2",
        "title": "Session depending on S1",
        "scope": "...",
        "files": ["different/file.ts"],
        "deliverables": ["..."],
        "implementation": "...",
        "validation": "...",
        "acceptance_criteria": ["..."]
      }
    ]
  ],
  "rationale": "Explanation of breakdown strategy, why sessions are grouped in waves, and parallelization decisions"
}

CRITICAL RULES:
- Sessions in the same wave MUST NOT modify overlapping files
- Sessions in the same wave MUST be independently executable
- Dependencies must be reflected in wave ordering (later waves depend on earlier)
- Each session must include complete implementation instructions
- Validation commands must be package-specific (use --filter where appropriate)
```

**Action**: Call the Plan agent with this prompt and parse the returned JSON session plan.

---

## Step 3: Show Plan and Get Confirmation

Display the execution plan in a clear, human-readable format:

```
📋 Session Breakdown for {ARG1}

[Format the plan readably, showing:]

Wave 1 (parallel - [N] sessions):
  • S1: [title]
    Files: [file list or count]
    Scope: [brief scope]

  • S2: [title]
    Files: [file list or count]
    Scope: [brief scope]

Wave 2 (parallel - [N] sessions):
  • S3: [title]
    Files: [file list or count]
    Scope: [brief scope]

[Continue for all waves...]

═══════════════════════════════════════════
Total sessions: [N]
Total waves: [M]
Estimated duration: [M * 30-40min]

RATIONALE:
[Include rationale from Plan agent explaining the breakdown]

═══════════════════════════════════════════

Continue with execution? (y/n)
```

**IMPORTANT**: Wait for explicit user confirmation before proceeding. If user:
- Says "yes" or "y" → Proceed to Step 4
- Says "no" or "n" → Stop execution
- Requests changes → Go back to Step 2 and adjust

---

## Step 4: Execute Waves

Initialize state tracking:
- Create `.agent-output/` directory if it doesn't exist
- Initialize `orchestrator-state.json` with: proposal path, wave count, completed waves = []

For each wave in the session plan (or starting from resumption point):

### 4.1 Announce Wave Start

```
🌊 Executing Wave [N] ([M] sessions in parallel)
Started: [timestamp]
```

### 4.2 Spawn Adhoc Agents in Parallel

For ALL sessions in the current wave, spawn adhoc agents **in parallel** using a SINGLE message with MULTIPLE Task tool calls.

**Important**: You must invoke all adhoc agents for the wave in one message to run them concurrently.

For each session, create an adhoc agent prompt:

```
Session {session.id}: {session.title}

SCOPE:
{session.scope}

FILES TO MODIFY:
{list session.files with bullet points}

DELIVERABLES:
{list session.deliverables}

IMPLEMENTATION INSTRUCTIONS:
{session.implementation}

ACCEPTANCE CRITERIA:
{list session.acceptance_criteria}

VALIDATION:
After implementing, run these commands to validate:
{session.validation}

IMPORTANT:
1. Follow all standards in standards/ tier files
2. Run validation commands and ensure they pass
3. If you encounter errors, document them clearly
4. Create a conventional commit when done
5. Report back:
   - Files actually modified
   - Validation results
   - Any errors or blockers encountered
   - Duration spent
```

**Spawn all sessions in wave concurrently** by making multiple Task tool calls in one message.

### 4.3 Collect Results

After all adhoc agents complete, collect results for each session:
- Success or failure status
- Files actually modified
- Duration
- Validation output
- Implementation notes
- Error details (if failed)

### 4.4 Update Proposal Document

Append a progress section to the proposal document ({ARG1}) with results from this wave.

**Format**:

````markdown
---
## 📊 Implementation Progress

### Wave [N] (Completed: [timestamp])

#### ✅ Session {id}: {title}
**Status:** Completed
**Duration:** [X] minutes
**Files Modified:**
- `path/to/file1.ts` (+[N] lines, -[M] lines)
- `path/to/file2.ts` (+[N] lines, -[M] lines)

**Implementation Notes:**
[Summary of what was done, key decisions, any notable changes]

**Validation Results:**
```
[Output from validation commands]
```

**Deliverables:**
- ✅ [Deliverable 1]
- ✅ [Deliverable 2]

---

#### ❌ Session {id}: {title}
**Status:** Failed
**Duration:** [X] minutes
**Files Modified:**
- `path/to/file.ts` (partial changes)

**Error Details:**
```
[Error message and stack trace]
```

**Root Cause Analysis:**
[Analysis of what went wrong]

**Action Required:**
[What needs to be done to unblock - may need to create an unblocker session]

**Next Steps:**
- [ ] [Specific action 1]
- [ ] [Specific action 2]

---
````

Use the Edit tool to append this content to the proposal document.

### 4.5 Update State

Update `.agent-output/orchestrator-state.json`:

```json
{
  "proposal_path": "{ARG1}",
  "total_waves": [N],
  "completed_waves": [1, 2, ...],
  "current_wave": [N+1],
  "failed_sessions": ["S3", "S5"],
  "last_updated": "[timestamp]"
}
```

### 4.6 Handle Wave Completion

If wave completed successfully (all sessions passed):
- Mark wave as complete
- Proceed to next wave
- Show progress: `✓ Wave [N] complete ([M]/[total] waves done)`

If wave had failures:
- Mark wave as complete but log failed sessions
- Show error summary
- Ask user: "Wave [N] had [M] failures. Continue to next wave, retry failed sessions, or stop?"
  - Continue → proceed to next wave
  - Retry → re-run failed sessions
  - Stop → save state and exit (allow --resume later)

### 4.7 Repeat for Next Wave

Continue to next wave until all waves complete.

---

## Step 5: Final Summary

After all waves complete, append a final summary to the proposal document:

````markdown
---
## 🎉 Implementation Complete

**Completion Time:** [timestamp]
**Total Duration:** [total time]
**Sessions Completed:** [N]/[total]
**Sessions Failed:** [M]
**Files Modified:** [count]
**Waves Executed:** [N]

**Outcomes:**
- ✅ [Major outcome 1]
- ✅ [Major outcome 2]
- ⚠️ [Known limitation or failed item]

**Validation Summary:**
- All qa:static checks: [passing/failing]
- Unit tests: [passing/failing]
- Integration tests: [status]

**Next Steps:**
[If all passed: "Ready for PR" or "Ready for testing"]
[If failures: List what needs manual attention]

---
````

Show completion message:
```
🎉 Orchestration complete!

Results documented in: {ARG1}
State saved to: .agent-output/orchestrator-state.json

Summary:
- Total sessions: [N]
- Successful: [M]
- Failed: [P]
- Duration: [total time]

[If failures exist:]
⚠️ Some sessions failed. Review the proposal document for details.
You can retry with: /orchestrate-sessions --resume
```

---

## Error Handling

### Session Failure

If a session fails:
1. Capture the error details from adhoc agent
2. Document in proposal with ❌ status
3. Mark session as failed in state
4. Continue with other sessions in wave (don't block parallel sessions)
5. At wave end, give user options (continue/retry/stop)

### Critical Failure

If orchestrator itself fails (e.g., can't parse proposal, Plan agent fails):
1. Save current state
2. Show error message
3. Provide resumption instructions
4. Exit gracefully

### Resumption

When resuming (--resume flag):
1. Load state from `.agent-output/orchestrator-state.json`
2. Skip completed waves
3. Show resumption status:
   ```
   🔄 Resuming orchestration

   Proposal: {ARG1}
   Completed waves: [1, 2]
   Resuming from: Wave 3
   Failed sessions from previous run: [S5]

   Continue? (y/n)
   ```
4. Continue execution from current wave

---

## Notes

- **Parallelism**: Sessions in the same wave run concurrently via multiple Task calls in one message
- **Document updates**: Proposal becomes living documentation of implementation progress
- **State persistence**: Enables resumption after failures without redoing work
- **Validation**: Each session validates independently before completion
- **Error documentation**: Failures captured with context for later resolution
- **Conventional commits**: Each adhoc agent creates proper commits per repo standards
