# Task Runner Phone Notifications Setup

This guide explains how to configure phone notifications for task runner events (completions, failures, errors).

## Overview

The task runner can send notifications to your phone when:
- **Tasks complete successfully** - Automatic notification when `--complete` is called
- **Tasks fail** - Validation failures, agent errors, or blocked tasks
- **Errors occur** - Operation errors during claim, completion, or archival

Notifications are **optional** and gracefully degrade if not configured (no impact on task execution).

## Supported Services

### Option 1: Telegram Bot (Recommended - Simplest Setup)

**Pros:**
- Free forever
- 2-minute setup
- Reliable delivery
- Likely already installed
- Rich formatting support

**Setup Steps:**

1. **Create a Telegram bot**:
   - Open Telegram and message [@BotFather](https://t.me/botfather)
   - Send: `/newbot`
   - Follow prompts to choose a name and username
   - **Save the bot token** (looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

2. **Get your Chat ID**:
   - Message your new bot (find it by username in Telegram search)
   - Send any message (e.g., "hello")
   - Visit this URL in your browser (replace `<BOT_TOKEN>` with your actual token):
     ```
     https://api.telegram.org/bot<BOT_TOKEN>/getUpdates
     ```
   - Look for `"chat":{"id":123456789}` in the JSON response
   - **Save the chat ID** (the number after `"id":`)

3. **Set environment variables**:
   ```bash
   # Add to your ~/.bashrc, ~/.zshrc, or .env file
   export TELEGRAM_BOT_TOKEN="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
   export TELEGRAM_CHAT_ID="123456789"
   ```

4. **Reload your shell**:
   ```bash
   source ~/.bashrc  # or ~/.zshrc
   ```

5. **Test the notification** (optional):
   ```bash
   python3 << 'EOF'
   from scripts.tasks_cli.notify import get_notification_service

   notifier = get_notification_service()
   if notifier.enabled:
       success = notifier.notify_success("TEST-0000", "Test notification")
       print(f"Notification sent: {success}")
   else:
       print("Notifications not configured")
   EOF
   ```

**Done!** You'll now receive notifications when tasks complete or fail.

---

### Option 2: ntfyt.sh (Self-hosted + Access Token)

**Pros:**
- Dedicated PhotoEditor ntfyt instance (https://ntfyt.sh)
- Token-protected publishing (no guessing random topics)
- Same ntfy mobile apps + desktop clients work out of the box
- Simple HTTP interface; works behind firewalls

**Cons:**
- Requires installing the ntfy app (or another client) and adding a custom server
- Must keep the provided access token safe

**Setup Steps:**

1. **Install the ntfy app** (ntfyt is a self-hosted ntfy build):
   - iOS: [ntfy on App Store](https://apps.apple.com/app/ntfy/id1625396347)
   - Android: [ntfy on Play Store](https://play.google.com/store/apps/details?id=io.heckel.ntfy)

2. **Subscribe to the PhotoEditor feed**:
   - Open the ntfy app and add a subscription
   - Use `https://ntfyt.sh/<topic>` (match the topic you set in your env vars, e.g., `photoeditor-task-workflow`)
   - The access token ensures only authorized publishers can post

3. **Set environment variables** (add to `~/.bashrc`, `~/.zshrc`, or `.env`):
   ```bash
   export NTFYT_TOPIC="photoeditor-task-workflow"
   export NTFYT_BASE_URL="https://ntfyt.sh"
   # Provided key from Ops (safe to paste verbatim)
   export NTFYT_ACCESS_TOKEN="tk_khotay7w6r7kpln86ujoal4hrd23j"
   ```
   > `NTFY_TOPIC`/`NTFY_BASE_URL` aliases still work but are deprecated—prefer the `NTFYT_*` names going forward.

4. **Reload your shell**:
   ```bash
   source ~/.bashrc  # or ~/.zshrc
   ```

5. **Test the notification** (optional):
   ```bash
   python3 << 'EOF'
   from scripts.tasks_cli.notify import get_notification_service

   notifier = get_notification_service()
   if notifier.enabled:
       success = notifier.notify_success("TEST-0000", "Test notification")
       print(f"Notification sent: {success}")
   else:
       print("Notifications not configured")
   EOF
   ```

**Done!** You'll now receive notifications via ntfyt.

---

## Notification Format

### Success Notification
```
✅ TASK-0123 Complete: Implement feature X
```

### Failure Notification
```
❌ TASK-0123 Failed: Validation errors
Backend tests failed (3 failures)

Validation:
- test_auth.py::test_login FAILED
- test_api.py::test_endpoint FAILED
```

### Error Notification
```
⚠️ TASK-0123 Error: Cannot complete task
Task status is 'draft'. Resolve clarifications first.
```

### Warning Notification
```
⚠️ TASK-0123 Warning: Task has unresolved dependencies
Blocked by: TASK-0120, TASK-0121
```

---

## Configuration Reference

### Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot token from @BotFather | `123456789:ABCdef...` |
| `TELEGRAM_CHAT_ID` | No | Your Telegram chat ID | `123456789` |
| `NTFYT_TOPIC` | No | ntfyt.sh topic/channel (fallback if Telegram not set) | `photoeditor-task-workflow` |
| `NTFYT_ACCESS_TOKEN` | No | Access token for ntfyt publishing (tk_ prefixed) | `tk_khotay7w6r7kpln86ujoal4hrd23j` |
| `NTFYT_BASE_URL` | No | Base URL for your ntfyt instance | `https://ntfyt.sh` |
| `NTFY_TOPIC` | No | Deprecated topic alias maintained for backward compatibility | `photoeditor-task-workflow` |

**Priority**: If both Telegram and ntfyt are configured, Telegram is used first. If Telegram fails, ntfyt is used as fallback.

### Service Detection

The notification service automatically detects configuration on initialization:
- If `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set → Telegram enabled
- Else if `NTFYT_TOPIC` **or** `NTFYT_ACCESS_TOKEN` is set → ntfyt.sh enabled
- Else → Notifications disabled (silent no-op)

---

## Integration Points

### Automatic Notifications

**Task Completion** - Sent automatically when calling:
```bash
python scripts/tasks.py --complete tasks/backend/TASK-0123-example.task.yaml
```

The `complete_task()` operation in `scripts/tasks_cli/operations.py` automatically sends success notification.

### Manual Notifications

**Task Failures** - Send from task-runner or validation scripts:
```python
from scripts.tasks_cli.notify import get_notification_service

notifier = get_notification_service()

# Failure notification
notifier.notify_failure(
    task_id="TASK-0123",
    title="Implement authentication",
    failure_reason="Validation failed",
    validation_results="3 tests failed:\n- test_auth.py::test_login\n- test_api.py::test_endpoint"
)

# Error notification
notifier.notify_error(
    task_id="TASK-0123",
    title="Implement authentication",
    error_message="Cannot complete task: status is 'draft'"
)

# Warning notification
notifier.notify_warning(
    task_id="TASK-0123",
    title="Implement authentication",
    warning_message="Blocked by: TASK-0120, TASK-0121"
)
```

---

## Troubleshooting

### Notifications not arriving

1. **Check environment variables are set**:
   ```bash
   echo $TELEGRAM_BOT_TOKEN
   echo $TELEGRAM_CHAT_ID
   # OR
    echo $NTFYT_TOPIC
    echo $NTFYT_ACCESS_TOKEN
   ```

2. **Verify bot token and chat ID** (Telegram):
   ```bash
   curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"
   # Should return bot info without error
   ```

3. **Test notification manually**:
   ```bash
   # Telegram
   curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        -d "chat_id=${TELEGRAM_CHAT_ID}" \
        -d "text=Test notification"

   # ntfyt.sh
   curl -H "Authorization: Bearer ${NTFYT_ACCESS_TOKEN}" \
        -H "Priority: 4" \
        -d "Test notification" \
        "${NTFYT_BASE_URL:-https://ntfyt.sh}/${NTFYT_TOPIC}"
   ```

4. **Check Python requests library is installed**:
   ```bash
   python3 -c "import requests; print(requests.__version__)"
   ```

### Silent failures

Notification failures are intentionally silent (won't interrupt task execution). To debug:

1. **Check notification service status**:
   ```python
   from scripts.tasks_cli.notify import get_notification_service

   notifier = get_notification_service()
   print(f"Enabled: {notifier.enabled}")
   print(f"Telegram configured: {bool(notifier.telegram_token and notifier.telegram_chat_id)}")
   print(f"ntfyt configured: {bool(notifier.ntfyt_topic or notifier.ntfyt_access_token)}")
   ```

2. **Look for warning messages** in CLI output:
   ```
   Warning: Failed to send Telegram notification: <error details>
   ```

---

## Security Considerations

### Telegram
- **Bot tokens** are sensitive credentials - treat like passwords
- **Chat IDs** are less sensitive but shouldn't be public
- Store in environment variables or `.env` (add `.env` to `.gitignore`)
- Never commit tokens to version control

### ntfyt.sh
- **Access tokens** (`NTFYT_ACCESS_TOKEN`) are credentials—treat like passwords
- Topic names still matter (tokens may be scoped per-topic); use unique channels
- Self-hosted instance lives at https://ntfyt.sh (backed by ntfy)
- Reference ntfy documentation for API details: https://docs.ntfy.sh/

### Best Practices
- Use environment variables (not hardcoded in scripts)
- Add `.env` to `.gitignore` if using `.env` files
- Regenerate bot tokens if accidentally exposed
- Use different topics/bots for different projects

---

## Advanced: Multiple Notification Services

You can configure both Telegram AND ntfyt simultaneously for redundancy:

```bash
export TELEGRAM_BOT_TOKEN="123456789:ABCdef..."
export TELEGRAM_CHAT_ID="123456789"
export NTFYT_TOPIC="photoeditor-task-workflow"
export NTFYT_ACCESS_TOKEN="tk_khotay7w6r7kpln86ujoal4hrd23j"
export NTFYT_BASE_URL="https://ntfyt.sh"
```

Telegram will be used first. If it fails, ntfyt will be used as fallback automatically.

---

## Alternative Services (Not Implemented)

The notification service can be extended to support:
- **Pushover** ($5 one-time, very reliable)
- **Pushbullet** (free tier available)
- **Discord webhooks** (if you use Discord)
- **Slack webhooks** (for team notifications)
- **Email** (SMTP)
- **Apprise** (unified API for 100+ services)

To request support for additional services, file an issue or extend `scripts/tasks_cli/notify.py`.

---

## References

- Task Runner Command: `.claude/commands/task-runner.md`
- Notification Service Implementation: `scripts/tasks_cli/notify.py`
- Operations Integration: `scripts/tasks_cli/operations.py`
- Telegram Bot API: https://core.telegram.org/bots/api
- ntfyt/ntfy Documentation: https://docs.ntfy.sh/
