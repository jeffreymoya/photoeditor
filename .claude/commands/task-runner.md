---
description: Execute tasks from tasks/ folder one at a time using task-implementer agent (prioritize unblocker tasks, then in_progress, then TODOs)
---

Task-runner orchestrates the solo-maintainer workflow: pick the next task, drive it through implementation, review, validation, changelog, and archival. Invoke it once per session to keep progress linear.

## Preparation
- `python scripts/tasks.py --refresh-cache`
- `python scripts/tasks.py --list --format json`
- Halt check (repeat before every pick): `python scripts/tasks.py --check-halt --format json` — exit code `2` means stop and surface unblockers.

## Main Loop
1. Run the halt check; abort on exit code `2`.
2. Pick the next task via `--pick --format json`; claim TODO items.
3. Read the task YAML, `agent_completion_state`, and referenced `.agent-output` artifacts.
4. Spawn **task-implementer** (unless complete), then **implementation-reviewer**.
5. Identify affected packages and run the matching validation agents, following `docs/agents/common-validation-guidelines.md`.
6. Update `agent_completion_state` after every agent run.

## Handling Outcomes
- If any agent fails or blocks: leave the task blocked, preserve state, create `changelog/YYYY-MM-DD-{topic}-blocked.md`, **send failure notification** (see Notifications section), and stop.
- If all agents pass: create `changelog/YYYY-MM-DD-{topic}.md`, clear `agent_completion_state`, complete the task via the CLI (which automatically sends success notification), and commit with an appropriate conventional prefix. If hooks fail, block the task, record the output, and **send failure notification**.

## Notifications
Send phone notifications for task outcomes (if configured):

**Success** (automatic): Task completion via `python scripts/tasks.py --complete` automatically triggers success notification with task ID and title.

**Failure**: When agents fail, validation fails, or hooks fail, manually send notification using Python:
```python
from scripts.tasks_cli.notify import get_notification_service

notifier = get_notification_service()
notifier.notify_failure(
    task_id="TASK-XXXX",
    title="Task title",
    failure_reason="Brief description (e.g., 'Validation failed', 'Implementation agent blocked')",
    validation_results="Optional summary of test failures or errors"
)
```

**Configuration**: Notifications require environment variables (see `docs/notifications-setup.md`):
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` (Telegram, recommended)
- OR `NTFY_TOPIC` (ntfy.sh fallback)

If not configured, notifications are silently skipped (no impact on task execution).

## Tracking
Maintain a tally of completed vs. outstanding tasks and list remaining blockers before exiting.

## References
- `docs/proposals/task-workflow-python-refactor.md`
- `standards/task-breakdown-canon.md`
- `docs/templates/task-implementer-summary-template.md`
- `docs/templates/implementation-reviewer-summary-template.md`
- `docs/agents/common-validation-guidelines.md`
