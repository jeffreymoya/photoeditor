"""
Notification service for task runner events.

Supports multiple notification backends:
- Telegram Bot (primary, simplest setup)
- ntfyt.sh (self-hosted ntfy fallback, access token capable)

Configuration via environment variables:
- TELEGRAM_BOT_TOKEN: Bot token from @BotFather
- TELEGRAM_CHAT_ID: Your Telegram chat ID
- NTFYT_TOPIC: Topic or channel on ntfyt.sh (optional fallback, `NTFY_TOPIC` alias supported)
- NTFYT_BASE_URL: Override ntfyt instance base URL (defaults to https://ntfyt.sh)
- NTFYT_ACCESS_TOKEN: Access token for authenticated ntfyt publishing (optional but recommended)
"""

import os
from typing import Optional
from enum import Enum

from .output import print_warning


class NotificationLevel(Enum):
    """Notification severity levels."""
    SUCCESS = "success"
    FAILURE = "failure"
    ERROR = "error"
    WARNING = "warning"


class NotificationService:
    """Unified notification service for task runner events."""

    def __init__(self):
        """Initialize notification service with environment configuration."""
        self.telegram_token = os.environ.get("TELEGRAM_BOT_TOKEN")
        self.telegram_chat_id = os.environ.get("TELEGRAM_CHAT_ID")
        self.ntfyt_topic = os.environ.get("NTFYT_TOPIC") or os.environ.get("NTFY_TOPIC")
        self.ntfyt_base_url = (
            os.environ.get("NTFYT_BASE_URL")
            or os.environ.get("NTFY_BASE_URL")
            or "https://ntfyt.sh"
        )
        self.ntfyt_access_token = (
            os.environ.get("NTFYT_ACCESS_TOKEN")
            or os.environ.get("NTFY_ACCESS_TOKEN")
        )
        self.enabled = (
            bool(self.telegram_token and self.telegram_chat_id)
            or bool(self.ntfyt_topic or self.ntfyt_access_token)
        )

    def notify_success(self, task_id: str, title: str, details: Optional[str] = None) -> bool:
        """
        Send success notification for completed task.

        Args:
            task_id: Task identifier (e.g., TASK-0123)
            title: Task title
            details: Optional additional details

        Returns:
            True if notification sent successfully, False otherwise
        """
        emoji = "✅"
        message = f"{emoji} {task_id} Complete: {title}"
        if details:
            message += f"\n{details}"
        return self._send(message, NotificationLevel.SUCCESS)

    def notify_failure(
        self,
        task_id: str,
        title: str,
        failure_reason: str,
        validation_results: Optional[str] = None
    ) -> bool:
        """
        Send failure notification for failed task.

        Args:
            task_id: Task identifier
            title: Task title
            failure_reason: Brief reason for failure
            validation_results: Optional validation output summary

        Returns:
            True if notification sent successfully, False otherwise
        """
        emoji = "❌"
        message = f"{emoji} {task_id} Failed: {title}\n{failure_reason}"
        if validation_results:
            message += f"\n\nValidation:\n{validation_results}"
        return self._send(message, NotificationLevel.FAILURE)

    def notify_error(self, task_id: str, title: str, error_message: str) -> bool:
        """
        Send error notification for task errors.

        Args:
            task_id: Task identifier
            title: Task title
            error_message: Error description

        Returns:
            True if notification sent successfully, False otherwise
        """
        emoji = "⚠️"
        message = f"{emoji} {task_id} Error: {title}\n{error_message}"
        return self._send(message, NotificationLevel.ERROR)

    def notify_warning(self, task_id: str, title: str, warning_message: str) -> bool:
        """
        Send warning notification for task warnings.

        Args:
            task_id: Task identifier
            title: Task title
            warning_message: Warning description

        Returns:
            True if notification sent successfully, False otherwise
        """
        emoji = "⚠️"
        message = f"{emoji} {task_id} Warning: {title}\n{warning_message}"
        return self._send(message, NotificationLevel.WARNING)

    def _send(self, message: str, level: NotificationLevel) -> bool:
        """
        Send notification via configured backend(s).

        Args:
            message: Notification message
            level: Notification severity level

        Returns:
            True if sent successfully, False otherwise
        """
        if not self.enabled:
            return False

        success = False

        # Try Telegram first (primary)
        if self.telegram_token and self.telegram_chat_id:
            success = self._send_telegram(message)

        # Fallback to ntfyt.sh self-hosted feed if Telegram fails or not configured
        if not success and (self.ntfyt_topic or self.ntfyt_access_token):
            success = self._send_ntfyt(message, level)

        return success

    def _send_telegram(self, message: str) -> bool:
        """
        Send notification via Telegram Bot API.

        Args:
            message: Message to send

        Returns:
            True if sent successfully, False otherwise
        """
        try:
            import requests

            url = f"https://api.telegram.org/bot{self.telegram_token}/sendMessage"
            payload = {
                "chat_id": self.telegram_chat_id,
                "text": message,
                "parse_mode": "HTML",  # Support basic formatting
                "disable_notification": False,
            }

            response = requests.post(url, json=payload, timeout=10)
            return response.status_code == 200
        except Exception as e:
            # Silent failure - don't interrupt task runner
            print_warning(f"Failed to send Telegram notification: {e}", level="warning")
            return False

    def _build_ntfyt_url(self) -> str:
        """Compose the ntfyt publishing URL from base and topic settings."""
        base = (self.ntfyt_base_url or "https://ntfyt.sh").rstrip("/")
        topic = (self.ntfyt_topic or "").strip("/")
        return f"{base}/{topic}" if topic else base

    def _send_ntfyt(self, message: str, level: NotificationLevel) -> bool:
        """
        Send notification via ntfyt.sh (self-hosted ntfy).

        Args:
            message: Message to send
            level: Notification severity level

        Returns:
            True if sent successfully, False otherwise
        """
        try:
            import requests

            url = self._build_ntfyt_url()

            # Map level to ntfyt priority headers
            priority_map = {
                NotificationLevel.SUCCESS: "3",  # Default
                NotificationLevel.FAILURE: "4",  # High
                NotificationLevel.ERROR: "5",    # Urgent
                NotificationLevel.WARNING: "3",  # Default
            }

            headers = {
                "Priority": priority_map.get(level, "3"),
                "Title": "Task Workflow",
            }
            if self.ntfyt_access_token:
                headers["Authorization"] = f"Bearer {self.ntfyt_access_token}"

            response = requests.post(url, data=message.encode("utf-8"), headers=headers, timeout=10)
            return 200 <= response.status_code < 300
        except Exception as e:
            # Silent failure - don't interrupt task runner
            print_warning(f"Failed to send ntfyt notification: {e}", level="warning")
            return False


# Global singleton instance
_notification_service: Optional[NotificationService] = None


def get_notification_service() -> NotificationService:
    """
    Get or create global notification service instance.

    Returns:
        NotificationService singleton
    """
    global _notification_service
    if _notification_service is None:
        _notification_service = NotificationService()
    return _notification_service
