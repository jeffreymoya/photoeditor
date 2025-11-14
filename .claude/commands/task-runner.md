---
description: Execute tasks from tasks/ folder one at a time using task-implementer agent (prioritize unblocker tasks, then in_progress, then TODOs)
---

Task-runner orchestrates the solo-maintainer workflow: pick the next task, drive it through implementation, review, validation, changelog, and archival. Invoke it once per session to keep progress linear.

## Preparation
- `python scripts/tasks.py --refresh-cache`
- `python scripts/tasks.py --list --format json`
- Verify clean working tree: `git status --porcelain` (warn if dirty, but allow task to proceed per workflow flexibility)
- Halt check (repeat before every pick): `python scripts/tasks.py --check-halt --format json` — exit code `2` means stop and surface unblockers.

## Main Loop
1. Run the halt check; abort on exit code `2`.
2. Pick the next task via `--pick --format json`; claim TODO items.
3. Initialize context cache: `python scripts/tasks.py --init-context TASK-XXXX --base-commit $(git rev-parse HEAD)` (captures immutable snapshot from task YAML + standards).
4. Read the task YAML, `agent_completion_state`, task context via `--get-context TASK-XXXX --format json`, and referenced `.agent-output` artifacts.
5. Spawn **task-implementer** (unless complete):
   - After implementer completes: `python scripts/tasks.py --snapshot-worktree TASK-XXXX --agent implementer` (captures working tree state for delta tracking).
6. Verify worktree before **implementation-reviewer**: `python scripts/tasks.py --verify-worktree TASK-XXXX --expected-agent implementer` (detects drift; see Handling Drift Errors below).
7. Spawn **implementation-reviewer**:
   - After reviewer completes: `python scripts/tasks.py --snapshot-worktree TASK-XXXX --agent reviewer --previous-agent implementer` (captures reviewer's delta).
8. Verify worktree before validation: `python scripts/tasks.py --verify-worktree TASK-XXXX --expected-agent reviewer` (detects drift).
9. Identify affected packages and run the matching validation agents, following `docs/agents/common-validation-guidelines.md`.
10. Update `agent_completion_state` after every agent run.

## Handling Outcomes
- If any agent fails or blocks: leave the task blocked, preserve state, create `changelog/YYYY-MM-DD-{topic}-blocked.md`, **send failure notification** (see Notifications section), and stop.
- If all agents pass: create `changelog/YYYY-MM-DD-{topic}.md`, clear `agent_completion_state`, complete the task via the CLI (which automatically sends success notification and purges context), and commit with an appropriate conventional prefix. If hooks fail, block the task, record the output, and **send failure notification**.

## Handling Drift Errors
If `--verify-worktree` fails (detects manual edits or working tree changes between agents):
1. Block the task immediately (do not proceed to next agent).
2. Preserve all context and snapshots (do not purge).
3. Create `changelog/YYYY-MM-DD-{topic}-drift-detected.md` with:
   - Full drift report (file-by-file comparison from error output)
   - Agent that last snapshotted worktree
   - Timestamp of drift detection
4. Send failure notification with drift details.
5. Log detailed drift report to `.agent-output/TASK-XXXX-drift-report.txt`.
6. **Manual intervention required:** After fixing manual edits, operator must:
   - Re-snapshot current state: `python scripts/tasks.py --snapshot-worktree TASK-XXXX --agent <last-agent>`
   - Resolve drift: `python scripts/tasks.py --resolve-drift TASK-XXXX --agent <last-agent> --note "Describe manual fix applied"`
   - Task-runner can then resume from next agent.

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
