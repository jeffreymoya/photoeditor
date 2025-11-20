import sys
import types

from tasks_cli import notify
from tasks_cli.notify import NotificationLevel


def _make_service(monkeypatch, **env):
    """Helper to build a NotificationService with isolated env vars."""
    keys = [
        "TELEGRAM_BOT_TOKEN",
        "TELEGRAM_CHAT_ID",
        "NTFYT_TOPIC",
        "NTFY_TOPIC",
        "NTFYT_BASE_URL",
        "NTFY_BASE_URL",
        "NTFYT_ACCESS_TOKEN",
        "NTFY_ACCESS_TOKEN",
    ]
    for key in keys:
        monkeypatch.delenv(key, raising=False)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setattr(notify, "_notification_service", None)
    return notify.NotificationService()


def test_ntfyt_enabled_with_topic(monkeypatch):
    service = _make_service(monkeypatch, NTFYT_TOPIC="alerts")

    assert service.enabled is True
    assert service.ntfyt_topic == "alerts"
    assert service._build_ntfyt_url() == "https://ntfyt.sh/alerts"


def test_ntfyt_send_uses_token_and_priority(monkeypatch):
    service = _make_service(
        monkeypatch,
        NTFYT_TOPIC="alerts",
        NTFYT_ACCESS_TOKEN="tk_test",
        NTFYT_BASE_URL="https://ntfyt.sh",
    )

    calls = {}

    def fake_post(url, data=None, headers=None, timeout=None):
        calls["url"] = url
        calls["data"] = data
        calls["headers"] = headers
        calls["timeout"] = timeout

        class Response:
            status_code = 200

        return Response()

    requests_stub = types.SimpleNamespace(post=fake_post)
    monkeypatch.setitem(sys.modules, "requests", requests_stub)

    sent = service._send_ntfyt("hello world", NotificationLevel.ERROR)

    assert sent is True
    assert calls["url"] == "https://ntfyt.sh/alerts"
    assert calls["data"] == b"hello world"
    assert calls["headers"]["Authorization"] == "Bearer tk_test"
    assert calls["headers"]["Priority"] == "5"
    assert calls["headers"]["Title"] == "Task Workflow"
    assert calls["timeout"] == 10


def test_ntfyt_base_url_without_topic(monkeypatch):
    service = _make_service(monkeypatch, NTFYT_BASE_URL="https://ntfyt.sh", NTFYT_ACCESS_TOKEN="tk_test")

    assert service._build_ntfyt_url() == "https://ntfyt.sh"
    assert service.enabled is True
