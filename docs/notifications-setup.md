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

### Option 2: ntfy.sh (Alternative - No Registration)

**Pros:**
- No bot setup required
- Free public instance or self-host
- Simple HTTP API
- Works on any device

**Cons:**
- Requires installing separate ntfy app
- Topic names are security-by-obscurity (use random string)

**Setup Steps:**

1. **Install ntfy app**:
   - iOS: [ntfy on App Store](https://apps.apple.com/app/ntfy/id1625396347)
   - Android: [ntfy on Play Store](https://play.google.com/store/apps/details?id=io.heckel.ntfy)

2. **Choose a secret topic name**:
   - Use a random, unique string (e.g., `photoeditor-jeffreymoya-k8s92jd`)
   - Topic names are public URLs, so make them hard to guess

3. **Subscribe in the ntfy app**:
   - Open ntfy app
   - Tap "+" to add subscription
   - Enter your topic name
   - Tap "Subscribe"

4. **Set environment variable**:
   ```bash
   # Add to your ~/.bashrc, ~/.zshrc, or .env file
   export NTFY_TOPIC="photoeditor-jeffreymoya-k8s92jd"
   ```

5. **Reload your shell**:
   ```bash
   source ~/.bashrc  # or ~/.zshrc
   ```

6. **Test the notification** (optional):
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

**Done!** You'll now receive notifications via ntfy.

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
| `NTFY_TOPIC` | No | ntfy.sh topic name (fallback if Telegram not set) | `myproject-secret-k8s92jd` |

**Priority**: If both Telegram and ntfy are configured, Telegram is used first. If Telegram fails, ntfy is used as fallback.

### Service Detection

The notification service automatically detects configuration on initialization:
- If `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set → Telegram enabled
- Else if `NTFY_TOPIC` is set → ntfy.sh enabled
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
   echo $NTFY_TOPIC
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

   # ntfy.sh
   curl -d "Test notification" "https://ntfy.sh/${NTFY_TOPIC}"
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
   print(f"ntfy configured: {bool(notifier.ntfy_topic)}")
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

### ntfy.sh
- **Topic names** should be random/secret (security by obscurity)
- Anyone who knows the topic can see notifications
- Consider self-hosting ntfy for sensitive projects
- Public instance: https://docs.ntfy.sh/

### Best Practices
- Use environment variables (not hardcoded in scripts)
- Add `.env` to `.gitignore` if using `.env` files
- Regenerate bot tokens if accidentally exposed
- Use different topics/bots for different projects

---

## Advanced: Multiple Notification Services

You can configure both Telegram AND ntfy simultaneously for redundancy:

```bash
export TELEGRAM_BOT_TOKEN="123456789:ABCdef..."
export TELEGRAM_CHAT_ID="123456789"
export NTFY_TOPIC="photoeditor-backup-k8s92jd"
```

Telegram will be used first. If it fails, ntfy will be used as fallback automatically.

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
- ntfy Documentation: https://docs.ntfy.sh/
