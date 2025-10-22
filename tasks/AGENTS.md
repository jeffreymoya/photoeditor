# Tasks Guidelines for LLM Consumption

Purpose: provide a lightweight pointer so every agent uses the exact same task schema without copying it into multiple docs.

Scope: applies to everything under `tasks/`.

## Canonical Template (Do Not Inline)
- The single source of truth for task structure, required fields, and examples is `docs/templates/TASK-0000-template.task.yaml`.
- Always copy that file verbatim when starting a new task, then fill in the placeholders. Never rebuild the schema from memory or copy fragments from older tasks.
- If you need the schema in another format, update the template file first and reference it from there. Keeping this document light ensures the template stays authoritative.

For step‑by‑step authoring guidance, see `tasks/README.md`.

## How to Work With the Template
- Before authoring a task, open the template and review its comments; they describe every section, required standards citations, and validation expectations.
- Populate each field directly in the new task file. Remove any comment lines you have satisfied to keep the task concise.
- When the repo standards evolve, update the template and link the change to the driving task/ADR so every future task inherits the revision automatically.
- If you discover a need the template cannot express, propose improvements to the template (and supporting standards) instead of diverging inside an individual task file.

## Authoring Reminders
- Cite the relevant standards files listed in the template so validation inputs remain explicit.
- Keep acceptance criteria testable and connect them to the QA commands defined in the template.
- Declare environment, constraints, and validation exactly as modeled in the template so automation can parse them reliably.
- Archive completed tasks to `docs/completed-tasks/` once `status: completed` as described in the template comments.

By keeping this document focused and pointing straight at the template, we avoid drift and guarantee every task follows the sanctioned format.
