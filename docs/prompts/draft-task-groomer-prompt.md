# Draft Task Groomer Prompt

## Goal
Guide an LLM agent through grooming PhotoEditor draft tasks until each is fully clarified, evidence-backed, and promoted to `todo` using the repository CLI.

## Required Inputs
- Repository root: `/home/jeffreymoya/dev/photoeditor`
- `docs/proposals/task-workflow-draft-status.md`
- Target task YAML under `tasks/`
- Clarification evidence under `docs/evidence/tasks/`
- `python scripts/tasks.py` CLI output (JSON + text)

## Operating Loop
1. **List Drafts**
   - Run: `python scripts/tasks.py --list draft --format json`
   - Choose the next task by priority → order → id. Stop if none remain.
2. **Inspect Task**
   - Read the task file with `sed -n '1,160p {path}'` (expand if needed).
   - Capture open questions across `acceptance_criteria`, `plan`, `standards`, `clarifications`, evidence links, and dependency fields.
3. **Elicit Clarifications**
   - Ask the user targeted questions for each gap.
   - Maintain an “Outstanding clarifications” checklist in the conversation; update it as answers arrive.
4. **Verify Edits**
   - After the user updates files, re-open the task YAML and any referenced evidence to confirm the new details.
   - Ensure `clarifications` is cleared or marked resolved, acceptance criteria and plan are concrete, standards are cited, and evidence paths exist.
5. **Check Dependencies**
   - Run `python scripts/tasks.py --explain {task_id}`.
   - Confirm downstream tasks list this draft in `blocked_by` and sit in `blocked` status when appropriate; request fixes if violations appear.
6. **Promotion Gate**
   - Once every checklist item is resolved, ask the user for a final “ready to promote” confirmation.
   - Announce the promotion intent and proceed only after approval.
7. **Promote via CLI**
   - Execute the snippet below (replace `REPLACE_WITH_TASK_ID`):
     ```python
     python - <<'PY'
     from pathlib import Path
     from scripts.tasks_cli.datastore import TaskDatastore
     from scripts.tasks_cli.operations import TaskOperations

     repo_root = Path("/home/jeffreymoya/dev/photoeditor")
     task_id = "REPLACE_WITH_TASK_ID"

     datastore = TaskDatastore(repo_root)
     tasks = datastore.load_tasks(force_refresh=True)
     task = next(t for t in tasks if t.id == task_id)
     TaskOperations(repo_root).transition_status(task, "todo")
     print(f"Promoted {task_id} to todo")
     PY
     ```
   - If the command fails, report the error, resolve issues, and retry.
8. **Refresh Queue**
   - Rerun `python scripts/tasks.py --list draft --format json` to confirm the task was removed from the draft set. Investigate any lingering entries.
9. **Repeat**
   - Loop back to step 1 for the next draft until the list is empty.

## Reporting
- Narrate the current task id, outstanding clarifications, and evidence verification at each step.
- After processing all drafts, summarize promoted tasks and flag any remaining follow-up actions for the user.

## Notes
- Never modify files without explicit user confirmation; always verify changes from disk.
- Use ASCII output and repository-relative paths in all references.
- Halt immediately and surface the error if repository validation commands fail unexpectedly.
