# Tasks Guidelines for LLM Consumption

Purpose: provide a lightweight pointer so every agent uses the exact same task schema without copying it into multiple docs.

Scope: applies to everything under `tasks/`.

> IMPORTANT
> - Governance SSOT: `standards/standards-governance-ssot.md` — follow for grounding and standards change requests.
> - Task Breakdown Canon: `standards/task-breakdown-canon.md` — follow for decomposition when tasks are complex or blocked.

## Canonical Template (Do Not Inline)
- The single source of truth for task structure, required fields, and examples is `docs/templates/TASK-0000-template.task.yaml`.
- Always copy that file verbatim when starting a new task, then fill in the placeholders. Never rebuild the schema from memory or copy fragments from older tasks.
- There are no alternate templates. If the scope exceeds what fits cleanly in one task, split the work into multiple task files instead of stretching the template.
- For detailed authoring guidance (field descriptions, standards alignment) follow `tasks/README.md`. For breakdown rules, follow `standards/task-breakdown-canon.md`. Command names are canonicalized in `standards/qa-commands-ssot.md`—do not inline command matrices in tasks.

For step‑by‑step authoring guidance, see `tasks/README.md`.

Plan steps must specify `actor` (agent|human), `inputs`, `outputs`, `definition_of_done`, and an `estimate` (S|M|L). Do not include shell `commands` in plan steps; acceptance criteria and the validation pipeline govern checks. Anchor each step to the governing rule by citing the exact standards file and heading slug inside the step (e.g., `standards/backend-tier.md#service-layer-boundaries`) so downstream agents understand which clause is being enforced.

## How to Work With the Template
- Review the template comments to understand required sections, then rely on `tasks/README.md` for the authoritative checklist and breakdown heuristics.
- Populate each field directly in the new task file. Remove any satisfied comment lines to keep the task concise.
- When the repo standards evolve, update the template and link the change to the driving task/ADR so every future task inherits the revision automatically.
- If you discover a need the template cannot express, propose improvements to the template (and supporting standards) instead of diverging inside an individual task file.
- If the work feels like an epic after you draft the plan, pause and break it down into smaller tasks—the orchestrator expects each task to be independently completable.

## Authoring Reminders
- Cite the relevant standards files listed in the template so validation inputs remain explicit.
- Keep acceptance criteria testable and connect them to the QA commands defined in the template.
- Declare environment, constraints, and validation exactly as modeled in the template so automation can parse them reliably.
- Archive completed tasks to `docs/completed-tasks/` once `status: completed` as described in the template comments.
- If an out-of-scope blocker appears, flip `status` to `blocked`, fill `blocked_reason`, and immediately author a separate unblocker task with matching or higher priority and **set `unblocker: true`** to prioritize it; list that task under `blocked_by` so orchestration scripts schedule it first.

By keeping this document focused and pointing straight at the template, we avoid drift and guarantee every task follows the sanctioned format.


### Task File Requirements for Agent Compatibility

1. **Declare affected packages:**
   ```yaml
   context:
     affected_packages: [backend, shared]  # Guides test agent spawning
   ```

2. **Cite tier standards:**
   ```yaml
   context:
    standards_tier: backend  # Auto-includes global.md, AGENTS.md, testing-standards.md; commands in qa-commands-ssot.md
   ```

### Agent Communication Constraints

- Agents communicate via **file-based handoffs** (not JSON returns)
- Each agent writes to predictable paths
- Orchestrator reads files and parses simple status from final messages
- Agents cannot communicate with each other (star topology only: orchestrator ↔ agents)
- Agent invocations are stateless (no multi-turn agent conversations)
