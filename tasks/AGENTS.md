# Tasks Guidelines for LLM Consumption

Purpose: provide a lightweight pointer so every agent uses the exact same task schema without copying it into multiple docs.

Scope: applies to everything under `tasks/`.

## Canonical Template (Do Not Inline)
- The single source of truth for task structure, required fields, and examples is `docs/templates/TASK-0000-template.task.yaml`.
- Always copy that file verbatim when starting a new task, then fill in the placeholders. Never rebuild the schema from memory or copy fragments from older tasks.
- There are no alternate templates. If the scope exceeds what fits cleanly in one task, split the work into multiple task files instead of stretching the template.
- If you need the schema in another format, update the template file first and reference it from there. Keeping this document light ensures the template stays authoritative.

For step‑by‑step authoring guidance, see `tasks/README.md`.

## How to Work With the Template
- Before authoring a task, open the template and review its comments; they describe every section, required standards citations, and validation expectations.
- Populate each field directly in the new task file. Remove any comment lines you have satisfied to keep the task concise.
- When the repo standards evolve, update the template and link the change to the driving task/ADR so every future task inherits the revision automatically.
- If you discover a need the template cannot express, propose improvements to the template (and supporting standards) instead of diverging inside an individual task file.
- If the work feels like an epic after you draft the plan, pause and break it down into smaller tasks—the orchestrator expects each task to be independently completable.

## Authoring Reminders
- Cite the relevant standards files listed in the template so validation inputs remain explicit.
- Keep acceptance criteria testable and connect them to the QA commands defined in the template.
- Declare environment, constraints, and validation exactly as modeled in the template so automation can parse them reliably.
- Archive completed tasks to `docs/completed-tasks/` once `status: completed` as described in the template comments.
- If an out-of-scope blocker appears, flip `status` to `blocked`, fill `blocked_reason`, and immediately author a separate unblocker task with matching or higher priority; list that task under `blocked_by` so orchestration scripts schedule it first.

By keeping this document focused and pointing straight at the template, we avoid drift and guarantee every task follows the sanctioned format.

## Agent Execution Model (For LLM Consumption)

Tasks are executed by a multi-agent orchestration system with clear separation of concerns:

**Orchestrator:**
- `task-runner` (slash command) - Picks tasks, spawns agents, aggregates results, creates changelog, commits changes

**Implementation:**
- `task-picker` - Claims task, implements plan, writes work summary to `.agent-output/`

**Validation (spawned in sequence):**
- `test-static-fitness` - Runs qa:static, qa:dependencies, domain purity, traceparent drill
- `test-unit-backend` - Runs backend unit tests
- `test-unit-mobile` - Runs mobile unit tests (if affected)
- `test-unit-shared` - Runs shared unit tests (if affected)
- `test-contract` - Validates API contracts (if shared affected)

### Workflow

```
task-runner (orchestrator)
  ↓
  1. Pick task via scripts/pick-task.sh
  2. Spawn task-picker → writes .agent-output/task-picker-summary-{TASK-ID}.md
  3. Detect affected packages from git diff
  4. Spawn test-static-fitness → writes docs/tests/reports/YYYY-MM-DD-static-fitness.md
     - If BLOCKED: Stop, create changelog, report to user
  5. Spawn test-unit-* agents in parallel (based on affected_packages)
     → each writes docs/tests/reports/YYYY-MM-DD-unit-{package}.md
     - If any BLOCKED/FAIL: Stop, create changelog, report to user
  6. Spawn test-contract (if shared affected)
     → writes docs/tests/reports/YYYY-MM-DD-contract.md
     - If BLOCKED/FAIL: Stop, create changelog, report to user
  7. All passed:
     a. Aggregate work summary + test reports
     b. Create changelog/YYYY-MM-DD-{topic}.md
     c. Archive task to docs/completed-tasks/
     d. Git commit
     e. If pre-commit fails: Append to changelog, stop loop
  8. Loop to next task
```

### Task File Requirements for Agent Compatibility

1. **Declare affected packages:**
   ```yaml
   context:
     affected_packages: [backend, shared]  # Guides test agent spawning
   ```

2. **Group validation commands by test type:**
   ```yaml
   validation:
     static_checks:        # test-static-fitness
       - pnpm turbo run qa:static --filter=@photoeditor/backend
     unit_tests:           # test-unit-{package} agents
       backend: [...]
       shared: [...]
     contract_tests:       # test-contract agent
       - pnpm turbo run test:contract --filter=@photoeditor/backend
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

### File Handoff Contract

Each agent produces predictable outputs that the orchestrator aggregates:

**task-picker output:**
```markdown
# .agent-output/task-picker-summary-{TASK-ID}.md
**Packages Modified:** backend, shared
**Files Changed:** 15
**Features Added:** [list]
**Bugs Fixed:** [list]
**Standards Enforced:** backend-tier.md, typescript.md
**Tests Created/Updated:** [list]
```

**test agent output:**
```markdown
# docs/tests/reports/YYYY-MM-DD-{agent-type}.md
**Status:** PASS | FAIL | BLOCKED
**Summary:** Brief description
**Issues Fixed:** 3
**Issues Deferred:** 2
**Blocking Reason:** (if BLOCKED)
```

**task-runner output:**
Reads all agent outputs → creates final changelog:
```markdown
# changelog/YYYY-MM-DD-{topic}.md
[Aggregates task-picker summary + all test reports]
```

### Agent Communication Constraints

- Agents communicate via **file-based handoffs** (not JSON returns)
- Each agent writes to predictable paths
- Orchestrator reads files and parses simple status from final messages
- Agents cannot communicate with each other (star topology only: orchestrator ↔ agents)
- Agent invocations are stateless (no multi-turn agent conversations)
