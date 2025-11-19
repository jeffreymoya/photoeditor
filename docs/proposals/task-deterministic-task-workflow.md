# Proposal: Deterministic Task Authoring Workflow Automation

**Status**: Draft – Ready for review  
**Author**: Codex Agent  
**Date**: 2025-11-15  
**Related Documents**:
- `tasks/README.md`
- `docs/templates/TASK-0000-template.task.yaml`
- `scripts/tasks.py`
- `docs/proposals/task-context-cache.md`

---

## 1. Problem Statement

Task creation still relies on manual diligence even though Schema 1.1, the canonical template, and the Python task CLI exist. Frequent misses include:

| Issue | Impact |
| --- | --- |
| Template drift or missing fields | Draft tasks lack validation pipelines, plan outputs, or evidence paths, forcing reviewers to catch the gaps later. |
| Incomplete clarifications | Drafts advance to `todo` without populated `docs/evidence/tasks/<task>-clarifications.md`, so downstream agents inherit ambiguity. |
| Ad hoc linting | Authors forget to run `scripts/validate-task-yaml`, meaning schema errors surface only when the CLI rejects a claim. |
| Manual wiring for drafts | Writers must remember to create evidence files, enforce `blocked_by` links, and re-run lint after edits, which is error-prone. |

Result: the “deterministic” workflow documented in `tasks/README.md` depends on memory rather than tooling.

---

## 2. Goals

1. **Deterministic scaffolding** – Copy the canonical template, stamp IDs/paths, create evidence docs, and lint in one command.
2. **Draft enforcement** – Block `todo` transitions unless clarifications and evidence files exist and contain resolved questions.
3. **Automated preflight** – Provide a single command (and CI target) that validates template compliance, dependency links, and draft readiness before code changes begin.
4. **Context auto-initialization** – Initialize the context cache plus drift tracking as soon as a task leaves draft to ensure downstream determinism.

Non-goal: re-specifying the task template structure (that lives in `docs/templates/`).

---

## 3. Proposed Workflow Automation

### 3.1 `scripts/tasks.py --new-task`

Add a CLI command that:
1. Validates arguments (`--area`, `--id`, `--slug`, `--title`, `--priority` default P1).
2. Copies `docs/templates/TASK-0000-template.task.yaml` into `tasks/<area>/<id>-<slug>.task.yaml`, replacing placeholders (ID, title, area, priority, status).
3. Runs `--bootstrap-evidence` for the given ID and writes the evidence path into the YAML.
4. Executes `--lint <new-task-file>` so the author starts from a passing template.

### 3.2 Draft Guard (`--enforce-drafts`)

Extend the linter to fail when:
- `status: draft` but `clarifications.outstanding` is empty **and** no evidence file contains at least one entry.
- Evidence file mentioned in `clarifications.evidence_path` is missing or empty (besides headings).
- Tasks referencing drafts via `depends_on` lack the matching `blocked_by` entry.

This codifies the draft resolution checklist directly in CLI output.

### 3.3 Preflight Script

Add `scripts/task-preflight.sh` (or `make task-preflight`) that:
- Accepts one or more task paths.
- Runs `scripts/validate-task-yaml` on each.
- Calls `python scripts/tasks.py --check-halt` to ensure no draft blockers are ignored.
- Optionally exports `--graph` to `.agent-output/task-graph.dot` for auditing.

Wire this target into CI so every PR touching `tasks/` must pass preflight before merge.

### 3.4 Context Auto-Init Hook

Introduce `python scripts/tasks.py --init-context TASK-ID --agent implementer` in the “task ready” workflow:
1. When the task enters `todo`, run `--init-context` to capture immutable metadata plus standards citations.
2. Make `task-preflight` check whether context exists; if not, fail with remediation instructions.
3. Encourage agents to run `--snapshot-worktree` / `--verify-worktree` on handoff; these commands already exist, so this is process enforcement rather than new code.

---

## 4. Implementation Plan

1. **CLI Enhancements**  
   - Extend `scripts/tasks_cli/__main__.py` to register `--new-task` and `--enforce-drafts`.  
   - Implement scaffolding logic in a new module (e.g., `tasks_cli/scaffolder.py`) to keep responsibilities clean.  
   - Update `TaskLinter` to read evidence files and enforce draft rules.

2. **Preflight Command**  
   - Add `scripts/task-preflight.sh` wrapping `python scripts/tasks.py` subcommands.  
   - Create a Makefile target that delegates to the script.  

3. **Context Hook**  
   - Update `TaskOperations.transition_status` or the new preflight script to call `--init-context` automatically when status becomes `todo`.  
   - Document the required command sequence in `tasks/README.md`.

4. **Documentation & Examples**  
   - Add a “Deterministic Task Automation” section to `tasks/README.md` with example commands.  
   - Provide a quickstart snippet in `docs/templates/TASK-0000-template.task.yaml` comments referencing `--new-task`.

---

## 5. Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| CLI complexity grows | Keep new logic modular (`scaffolder.py`) and unit-tested under `scripts/tasks_cli/tests/`. |
| Evidence parsing false positives | Require minimal structure (e.g., at least one non-heading line) and allow opting out via `--force-secrets` style flag during transition period. |
| Legacy tasks break linting | Gate stricter rules behind `schema_version: "1.1"` (already standard) and skip archived tasks. |

---

## 6. Next Steps

1. Implement `--new-task`, `--enforce-drafts`, and supporting modules.
2. Create `scripts/task-preflight.sh` + Makefile target, wire into CI.
3. Update documentation to reflect the scripted workflow.
4. Pilot the new flow on the next task to validate usability, then enforce via CI once stable.

Once complete, task creation, draft validation, and context initialization will be script-driven rather than memory-driven, making the workflow deterministic end-to-end.
