#!/usr/bin/env python3
"""
Reliable Alerting & Incident Notification Module
Supports Discord, Slack, and generic JSON webhooks.
Provides structured notifications for failures, degraded states, and recoveries.
Ensures zero secret leakage (redacts tokens, auth headers, and URLs).
Guarantees failure containment (alert transport errors never crash the monitor).
"""

import json
import re
import urllib.error
import urllib.request
from datetime import datetime, timezone

# Regex patterns for sensitive credential redaction
REDACTION_PATTERNS = [
    (re.compile(r"hf_[A-Za-z0-9]{20,}", re.IGNORECASE), "[REDACTED_HF_TOKEN]"),
    (re.compile(r"ghp_[A-Za-z0-9]{20,}", re.IGNORECASE), "[REDACTED_GH_TOKEN]"),
    (re.compile(r"github_pat_[A-Za-z0-9_]{30,}", re.IGNORECASE), "[REDACTED_GH_PAT]"),
    (re.compile(r"Bearer\s+[A-Za-z0-9_\-\.]+", re.IGNORECASE), "Bearer [REDACTED_TOKEN]"),
    (re.compile(r"https?://discord\.com/api/webhooks/[^\s\"']+", re.IGNORECASE), "https://discord.com/api/webhooks/[REDACTED]"),
    (re.compile(r"https?://hooks\.slack\.com/services/[^\s\"']+", re.IGNORECASE), "https://hooks.slack.com/services/[REDACTED]"),
]


def redact_sensitive_data(text: str) -> str:
    """Sanitize strings by redacting known token and secret patterns."""
    if not isinstance(text, str):
        text = str(text)
    for pattern, replacement in REDACTION_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def build_alert_payload(
    category: str,
    severity: str,
    title: str,
    summary: str,
    service: str = "Keep-Alive System",
    details: dict = None,
    run_url: str = None,
) -> dict:
    """
    Build a standardized, multi-platform webhook payload.
    Compatible with Discord embeds, Slack attachments, and standard JSON consumers.
    """
    now_utc = datetime.now(timezone.utc).isoformat()
    clean_title = redact_sensitive_data(title)
    clean_summary = redact_sensitive_data(summary)
    clean_service = redact_sensitive_data(service)

    # Color coding: Green for resolved, Red for critical, Yellow for warning
    color_map = {
        "CRITICAL": 0xE02424,  # Red
        "WARNING": 0xF59E0B,   # Yellow
        "INFO": 0x3B82F6,      # Blue
        "RESOLVED": 0x10B981,  # Green
    }
    color = color_map.get(severity.upper(), 0x6B7280)

    fields = [
        {"name": "Service / Space", "value": clean_service, "inline": True},
        {"name": "Category", "value": category, "inline": True},
        {"name": "Severity", "value": severity.upper(), "inline": True},
        {"name": "Timestamp (UTC)", "value": now_utc, "inline": False},
    ]

    if run_url:
        fields.append({"name": "Workflow Run", "value": f"[View GitHub Actions Run]({run_url})", "inline": False})

    if details:
        sanitized_details = {}
        for k, v in details.items():
            sanitized_details[str(k)] = redact_sensitive_data(str(v))
        details_str = json.dumps(sanitized_details, indent=2)
        if len(details_str) > 1000:
            details_str = details_str[:997] + "..."
        fields.append({"name": "Diagnostics", "value": f"```{details_str}```", "inline": False})

    # Combined Discord & Slack & Generic payload
    discord_embed = {
        "title": f"[{severity.upper()}] {clean_title}",
        "description": clean_summary,
        "color": color,
        "fields": fields,
        "footer": {"text": "Xare-AI Production Keep-Alive Watchdog"},
        "timestamp": now_utc,
    }

    slack_attachment = {
        "color": f"#{color:06x}",
        "title": f"[{severity.upper()}] {clean_title}",
        "text": clean_summary,
        "fields": [{"title": f["name"], "value": f["value"], "short": f.get("inline", False)} for f in fields],
        "ts": int(datetime.now(timezone.utc).timestamp()),
    }

    return {
        "username": "Keep-Alive SRE Watchdog",
        "content": f"**[{severity.upper()}]** {clean_title}\n{clean_summary}",
        "text": f"[{severity.upper()}] {clean_title}\n{clean_summary}",
        "embeds": [discord_embed],
        "attachments": [slack_attachment],
        "category": category,
        "severity": severity,
        "timestamp": now_utc,
    }


def send_webhook_notification(webhook_url: str, payload: dict, timeout: int = 10) -> bool:
    """
    Transmit the alert payload via HTTP POST.
    Safely catches and logs errors without raising exceptions or concealing errors.
    """
    if not webhook_url or not webhook_url.strip():
        return False

    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            webhook_url.strip(),
            data=data,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "XareAI-KeepAlive-Alert/3.0",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status in (200, 204)
    except urllib.error.HTTPError as e:
        print(f"[WARN] Alert webhook HTTP error {e.code}: {e.reason}")
        return False
    except urllib.error.URLError as e:
        print(f"[WARN] Alert webhook network error: {e.reason}")
        return False
    except Exception as e:
        print(f"[WARN] Alert webhook dispatch error: {e}")
        return False


def notify_incident(
    webhook_url: str,
    category: str,
    severity: str,
    title: str,
    summary: str,
    service: str = "Keep-Alive System",
    details: dict = None,
    run_url: str = None,
) -> bool:
    """High-level incident alert helper."""
    if not webhook_url:
        return False
    payload = build_alert_payload(
        category=category,
        severity=severity,
        title=title,
        summary=summary,
        service=service,
        details=details,
        run_url=run_url,
    )
    return send_webhook_notification(webhook_url, payload)


def notify_recovery(
    webhook_url: str,
    service: str,
    summary: str,
    details: dict = None,
    run_url: str = None,
) -> bool:
    """High-level recovery / resolution helper."""
    if not webhook_url:
        return False
    payload = build_alert_payload(
        category="RECOVERY_SUCCEEDED",
        severity="RESOLVED",
        title=f"Service Recovered: {service}",
        summary=summary,
        service=service,
        details=details,
        run_url=run_url,
    )
    return send_webhook_notification(webhook_url, payload)
