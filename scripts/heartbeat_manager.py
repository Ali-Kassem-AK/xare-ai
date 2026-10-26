#!/usr/bin/env python3
"""
Heartbeat Manager for GitHub Actions Inactivity Prevention
Guarantees a periodic repository commit approximately every 6 days
to keep GitHub scheduled cron workflows from being auto-disabled after 60 days.
"""

import os
import sys
from datetime import datetime, timezone

# Ensure UTF-8 output across Windows consoles and GitHub Actions runners
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

HEARTBEAT_FILE = ".last-keepalive"
# 6 days in seconds (518,400s). This provides a 1-day safety buffer before a full 7-day cycle,
# guaranteeing that any scheduled run firing on or after day 6 refreshes the heartbeat.
DEFAULT_THRESHOLD_SECONDS = 6 * 24 * 3600


def parse_timestamp(ts_string):
    """Safely parse an ISO 8601 UTC timestamp string."""
    if not ts_string or not isinstance(ts_string, str):
        return None
    ts_clean = ts_string.strip()
    try:
        if ts_clean.endswith("Z"):
            ts_clean = ts_clean[:-1] + "+00:00"
        dt = datetime.fromisoformat(ts_clean)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def should_update_heartbeat(filepath=HEARTBEAT_FILE, threshold_seconds=DEFAULT_THRESHOLD_SECONDS, now=None):
    """
    Evaluates whether the heartbeat file needs to be updated.
    Returns:
      (needs_update: bool, reason: str, last_dt: datetime or None)
    """
    current_time = now or datetime.now(timezone.utc)

    if not os.path.exists(filepath):
        return True, "Heartbeat file does not exist (first-time initialization)", None

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read().strip()
    except Exception as e:
        return True, f"Failed reading heartbeat file ({e})", None

    last_dt = parse_timestamp(content)
    if last_dt is None:
        return True, f"Heartbeat file contains corrupt or invalid timestamp: '{content[:50]}'", None

    elapsed_seconds = (current_time - last_dt).total_seconds()
    if elapsed_seconds < 0:
        return True, f"Heartbeat timestamp is in the future ({elapsed_seconds}s)", last_dt

    if elapsed_seconds >= threshold_seconds:
        days = round(elapsed_seconds / 86400, 2)
        return True, f"Elapsed time ({days} days / {int(elapsed_seconds)}s) exceeds threshold ({round(threshold_seconds/86400, 1)} days)", last_dt

    remaining_days = round((threshold_seconds - elapsed_seconds) / 86400, 2)
    return False, f"Heartbeat is recent ({round(elapsed_seconds/86400, 2)} days old, next update in ~{remaining_days} days)", last_dt


def write_heartbeat(filepath=HEARTBEAT_FILE, now=None):
    """Writes the current UTC timestamp to the heartbeat file."""
    current_time = now or datetime.now(timezone.utc)
    iso_ts = current_time.strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(iso_ts + "\n")
    return iso_ts


def main():
    filepath = sys.argv[1] if len(sys.argv) > 1 else HEARTBEAT_FILE
    needs_update, reason, last_dt = should_update_heartbeat(filepath=filepath)

    print(f"[INFO] Heartbeat Check: {reason}")
    if needs_update:
        new_ts = write_heartbeat(filepath=filepath)
        print(f"[OK] Updated {filepath} with new timestamp: {new_ts}")
        github_output = os.environ.get("GITHUB_OUTPUT")
        if github_output and os.path.exists(github_output):
            with open(github_output, "a", encoding="utf-8") as f:
                f.write("heartbeat_updated=true\n")
        sys.exit(0)
    else:
        print("[OK] No heartbeat commit needed for this run.")
        github_output = os.environ.get("GITHUB_OUTPUT")
        if github_output and os.path.exists(github_output):
            with open(github_output, "a", encoding="utf-8") as f:
                f.write("heartbeat_updated=false\n")
        sys.exit(0)


if __name__ == "__main__":
    main()
