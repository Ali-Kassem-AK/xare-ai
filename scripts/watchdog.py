#!/usr/bin/env python3
"""
Independent External SRE Watchdog for AI Infrastructure
Runs externally from GitHub Actions (e.g. local daemon, remote VPS, cron, or Lambda)
to provide true decoupled out-of-band monitoring:
  1. Detects missing, delayed, or stalled GitHub Actions scheduled keep-alive runs.
  2. Detects failed or cancelled keep-alive workflow executions.
  3. Detects overdue 60-day repository inactivity heartbeat commits.
  4. Directly queries public Hugging Face Spaces health endpoints out-of-band.
  5. Integrates with dead man's switch check-in services (e.g. Healthchecks.io).
  6. Dispatches structured incident notifications via ALERT_WEBHOOK_URL.
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

# Ensure UTF-8 output
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Import alert manager
try:
    import scripts.alert_manager as am
except ImportError:
    # If running directly from scripts directory
    import alert_manager as am


DEFAULT_REPO = "Ali-Kassem-AK/xare-ai"
DEFAULT_WORKFLOW_FILE = "keep-alive.yml"
EXPECTED_INTERVAL_MINUTES = 20
DEFAULT_MAX_DELAY_MINUTES = 45  # 2 missed intervals + 5m buffer
DEFAULT_HEARTBEAT_THRESHOLD_DAYS = 7.0

# Spaces endpoints to verify directly out-of-band
SPACES_DIRECT_CHECKS = {
    "AliiiS/24-7_n8n": {
        "url": "https://aliiis-24-7-n8n.hf.space/healthz",
        "expected_code": 200,
        "validator": lambda body: '"status":"ok"' in body.replace(" ", ""),
    },
    "AliiiS/pdf-to-image-api": {
        "url": "https://aliiis-pdf-to-image-api.hf.space/",
        "expected_code": 200,
        "validator": lambda body: "Alive and awake!" in body,
    },
}


def make_request(url: str, headers: dict = None, timeout: int = 15) -> tuple:
    """Safely execute an HTTP GET request, returning (status_code, body_text, error)."""
    default_headers = {"User-Agent": "XareAI-Independent-Watchdog/3.0"}
    if headers:
        default_headers.update(headers)
    req = urllib.request.Request(url, headers=default_headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return resp.status, body, None
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if hasattr(e, "read") else ""
        return e.code, body, f"HTTPError {e.code}: {e.reason}"
    except urllib.error.URLError as e:
        return 0, "", f"URLError: {e.reason}"
    except Exception as e:
        return 0, "", f"Exception: {e}"


def check_github_workflow_cadence(
    repo: str = DEFAULT_REPO,
    workflow_name: str = DEFAULT_WORKFLOW_FILE,
    max_delay_minutes: int = DEFAULT_MAX_DELAY_MINUTES,
    gh_token: str = "",
    now: datetime = None,
) -> dict:
    """
    Query GitHub REST API to inspect recent workflow runs.
    Detects if scheduled runs are missing, overdue, or failing.
    """
    if now is None:
        now = datetime.now(timezone.utc)

    headers = {"Accept": "application/vnd.github.v3+json"}
    if gh_token:
        headers["Authorization"] = f"Bearer {gh_token}"

    url = f"https://api.github.com/repos/{repo}/actions/workflows/{workflow_name}/runs?per_page=10"
    status_code, body, err = make_request(url, headers=headers)

    if err:
        return {
            "healthy": False,
            "category": "WATCHDOG_GITHUB_API_ERROR",
            "message": f"Failed to query GitHub Actions API for {repo}: {err}",
            "latest_run": None,
        }

    try:
        data = json.loads(body)
    except json.JSONDecodeError as e:
        return {
            "healthy": False,
            "category": "WATCHDOG_GITHUB_API_ERROR",
            "message": f"Invalid JSON from GitHub Actions API: {e}",
            "latest_run": None,
        }

    runs = data.get("workflow_runs", [])
    if not runs:
        return {
            "healthy": False,
            "category": "WORKFLOW_NO_RUNS_FOUND",
            "message": f"No workflow runs found for {workflow_name} in repository {repo}.",
            "latest_run": None,
        }

    latest = runs[0]
    run_id = latest.get("id")
    run_url = latest.get("html_url")
    run_event = latest.get("event")
    run_status = latest.get("status")
    run_conclusion = latest.get("conclusion")
    created_at_str = latest.get("created_at")

    # Parse ISO timestamp
    created_at = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
    elapsed_seconds = (now - created_at).total_seconds()
    elapsed_minutes = elapsed_seconds / 60.0

    # Check 1: Did the latest run fail?
    if run_status == "completed" and run_conclusion != "success":
        return {
            "healthy": False,
            "category": "WORKFLOW_RUN_FAILED",
            "message": f"Latest workflow run #{run_id} failed with conclusion: {run_conclusion}",
            "latest_run": {
                "id": run_id,
                "url": run_url,
                "event": run_event,
                "status": run_status,
                "conclusion": run_conclusion,
                "created_at": created_at_str,
                "elapsed_minutes": round(elapsed_minutes, 1),
            },
        }

    # Check 2: Has too much time elapsed since the last scheduled/dispatched run?
    if elapsed_minutes > max_delay_minutes:
        return {
            "healthy": False,
            "category": "RUN_MISSED_OR_DELAYED",
            "message": f"Expected keep-alive run is overdue! Last run #{run_id} was {round(elapsed_minutes, 1)}m ago (threshold: {max_delay_minutes}m).",
            "latest_run": {
                "id": run_id,
                "url": run_url,
                "event": run_event,
                "status": run_status,
                "conclusion": run_conclusion,
                "created_at": created_at_str,
                "elapsed_minutes": round(elapsed_minutes, 1),
            },
        }

    return {
        "healthy": True,
        "category": "WORKFLOW_OK",
        "message": f"Latest workflow run #{run_id} ({run_event}) completed with success {round(elapsed_minutes, 1)}m ago.",
        "latest_run": {
            "id": run_id,
            "url": run_url,
            "event": run_event,
            "status": run_status,
            "conclusion": run_conclusion,
            "created_at": created_at_str,
            "elapsed_minutes": round(elapsed_minutes, 1),
        },
    }


def check_heartbeat_freshness(
    repo: str = DEFAULT_REPO,
    branch: str = "",
    max_days: float = DEFAULT_HEARTBEAT_THRESHOLD_DAYS,
    gh_token: str = "",
    now: datetime = None,
) -> dict:
    """
    Check when the .last-keepalive file was last committed.
    If older than max_days, alerts that repository 60-day inactivity threshold is approaching.
    """
    if now is None:
        now = datetime.now(timezone.utc)

    headers = {"Accept": "application/vnd.github.v3+json"}
    if gh_token:
        headers["Authorization"] = f"Bearer {gh_token}"

    url = f"https://api.github.com/repos/{repo}/commits?path=.last-keepalive&per_page=1"
    if branch:
        url += f"&sha={branch}"
    status_code, body, err = make_request(url, headers=headers)

    if err:
        return {
            "healthy": False,
            "category": "WATCHDOG_GITHUB_API_ERROR",
            "message": f"Failed to query commits for .last-keepalive: {err}",
            "last_commit": None,
        }

    try:
        commits = json.loads(body)
    except json.JSONDecodeError as e:
        return {
            "healthy": False,
            "category": "WATCHDOG_GITHUB_API_ERROR",
            "message": f"Invalid JSON querying commit history: {e}",
            "last_commit": None,
        }

    if not commits or not isinstance(commits, list):
        target_ref = branch if branch else "default branch"
        return {
            "healthy": False,
            "category": "HEARTBEAT_MISSING",
            "message": f"No commit history found for .last-keepalive on {target_ref}.",
            "last_commit": None,
        }

    last_commit = commits[0]
    commit_date_str = last_commit.get("commit", {}).get("committer", {}).get("date")
    commit_sha = last_commit.get("sha", "")[:7]

    if not commit_date_str:
        return {
            "healthy": False,
            "category": "HEARTBEAT_DATE_UNKNOWN",
            "message": "Unable to determine commit timestamp for .last-keepalive.",
            "last_commit": None,
        }

    commit_date = datetime.fromisoformat(commit_date_str.replace("Z", "+00:00"))
    elapsed_days = (now - commit_date).total_seconds() / 86400.0

    if elapsed_days > max_days:
        return {
            "healthy": False,
            "category": "HEARTBEAT_OVERDUE",
            "message": f"Keep-alive heartbeat commit is overdue ({round(elapsed_days, 1)} days old, threshold is {max_days} days)!",
            "last_commit": {
                "sha": commit_sha,
                "date": commit_date_str,
                "elapsed_days": round(elapsed_days, 2),
            },
        }

    return {
        "healthy": True,
        "category": "HEARTBEAT_OK",
        "message": f"Heartbeat commit {commit_sha} is fresh ({round(elapsed_days, 2)} days old).",
        "last_commit": {
            "sha": commit_sha,
            "date": commit_date_str,
            "elapsed_days": round(elapsed_days, 2),
        },
    }


def check_spaces_direct_health(spaces_specs: dict = None) -> dict:
    """
    Perform direct out-of-band health queries to Hugging Face Spaces public endpoints.
    Completely independent of GitHub Actions runners.
    """
    if spaces_specs is None:
        spaces_specs = SPACES_DIRECT_CHECKS

    results = {}
    all_healthy = True

    for name, spec in spaces_specs.items():
        url = spec["url"]
        expected_code = spec["expected_code"]
        validator = spec.get("validator")

        status_code, body, err = make_request(url, timeout=15)
        if err:
            results[name] = {"healthy": False, "status": status_code, "error": err}
            all_healthy = False
        elif status_code != expected_code:
            results[name] = {
                "healthy": False,
                "status": status_code,
                "error": f"HTTP {status_code} (expected {expected_code})",
            }
            all_healthy = False
        elif validator and not validator(body):
            results[name] = {
                "healthy": False,
                "status": status_code,
                "error": f"Body validation failed (snippet: {body[:80]!r})",
            }
            all_healthy = False
        else:
            results[name] = {"healthy": True, "status": status_code, "error": None}

    return {
        "healthy": all_healthy,
        "category": "SPACES_DIRECT_OK" if all_healthy else "SPACES_DIRECT_UNHEALTHY",
        "results": results,
    }


def ping_external_watchdog(checkin_url: str, status: str = "ok", message: str = None) -> bool:
    """
    Send an execution signal to an external dead-man's snitch (e.g. Healthchecks.io).
    Endpoints supported:
      - /start (signals execution began)
      - /fail (signals failure with diagnostic body)
      - root / (signals successful completion)
    """
    if not checkin_url or not checkin_url.strip():
        return False

    base_url = checkin_url.strip().rstrip("/")
    target_url = base_url
    if status == "start":
        target_url = f"{base_url}/start"
    elif status == "fail":
        target_url = f"{base_url}/fail"

    try:
        data = message.encode("utf-8") if message else None
        req = urllib.request.Request(
            target_url,
            data=data,
            headers={"User-Agent": "XareAI-KeepAlive-Checkin/3.0"},
            method="POST" if data else "GET",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status == 200
    except Exception as e:
        print(f"[WARN] External watchdog check-in ping failed ({target_url}): {e}")
        return False


def run_watchdog_audit(
    repo: str = DEFAULT_REPO,
    branch: str = "",
    workflow_name: str = DEFAULT_WORKFLOW_FILE,
    max_delay_minutes: int = DEFAULT_MAX_DELAY_MINUTES,
    gh_token: str = "",
    alert_webhook: str = "",
    checkin_url: str = "",
) -> tuple:
    """
    Execute a full audit cycle:
      1. Inspects workflow cadence and conclusion.
      2. Inspects heartbeat commit freshness.
      3. Verifies Space public health endpoints.
      4. Dispatches webhook incident alerts if anomalies are found.
      5. Pings check-in service if configured.
    """
    now = datetime.now(timezone.utc)
    print("=" * 64)
    print("Xare-AI Independent SRE Watchdog Audit")
    print(f"Timestamp (UTC): {now.isoformat()}")
    print(f"Target Repository: {repo}")
    print(f"Target Branch: {branch or 'default branch'}")
    print(f"Target Workflow: {workflow_name}")
    print(f"External Check-in Configured: {'YES' if bool(checkin_url) else 'NO (Unverified)'}")
    print(f"Alert Webhook Configured: {'YES' if bool(alert_webhook) else 'NO (Unverified)'}")
    print("=" * 64 + "\n")

    # Step 1: Workflow Cadence
    print("[1/3] Auditing GitHub Actions Keep-Alive Workflow Cadence...")
    workflow_res = check_github_workflow_cadence(
        repo=repo,
        workflow_name=workflow_name,
        max_delay_minutes=max_delay_minutes,
        gh_token=gh_token,
        now=now,
    )
    if workflow_res["healthy"]:
        print(f"  [PASS] {workflow_res['message']}")
    else:
        print(f"  [FAIL] {workflow_res['category']}: {workflow_res['message']}")

    # Step 2: Heartbeat Freshness
    print("\n[2/3] Auditing 60-Day Inactivity Prevention Heartbeat...")
    heartbeat_res = check_heartbeat_freshness(repo=repo, branch=branch, gh_token=gh_token, now=now)
    if heartbeat_res["healthy"]:
        print(f"  [PASS] {heartbeat_res['message']}")
    else:
        print(f"  [FAIL] {heartbeat_res['category']}: {heartbeat_res['message']}")

    # Step 3: Direct Out-of-band Spaces Health Check
    print("\n[3/3] Directly Auditing Hugging Face Spaces Endpoints Out-of-band...")
    spaces_res = check_spaces_direct_health()
    if spaces_res["healthy"]:
        print("  [PASS] All Spaces passed direct health checks.")
        for name, details in spaces_res["results"].items():
            print(f"    - {name}: HTTP {details['status']} (healthy)")
    else:
        print("  [FAIL] One or more Spaces failed direct health checks:")
        for name, details in spaces_res["results"].items():
            status = "HEALTHY" if details["healthy"] else "UNHEALTHY"
            print(f"    - {name}: {status} ({details['error'] or 'HTTP ' + str(details['status'])})")

    # Overall Verdict
    is_overall_healthy = workflow_res["healthy"] and heartbeat_res["healthy"] and spaces_res["healthy"]

    # Incident Alert Dispatching (if unhealthy)
    if not is_overall_healthy and alert_webhook:
        failures = []
        if not workflow_res["healthy"]:
            failures.append(f"Workflow: {workflow_res['message']}")
        if not heartbeat_res["healthy"]:
            failures.append(f"Heartbeat: {heartbeat_res['message']}")
        if not spaces_res["healthy"]:
            failures.append("Spaces: One or more Spaces unresponsive out-of-band.")

        am.notify_incident(
            webhook_url=alert_webhook,
            category="WATCHDOG_OUT_OF_BAND_ANOMALY",
            severity="CRITICAL",
            title="Keep-Alive Infrastructure Anomaly Detected",
            summary="\n".join(failures),
            service=repo,
            details={
                "workflow": workflow_res,
                "heartbeat": heartbeat_res,
                "spaces": spaces_res,
            },
            run_url=workflow_res.get("latest_run", {}).get("url") if workflow_res.get("latest_run") else None,
        )

    # Check-in Watchdog Ping
    if checkin_url:
        if is_overall_healthy:
            ping_external_watchdog(checkin_url, status="ok", message="Watchdog audit passed cleanly.")
        else:
            ping_external_watchdog(checkin_url, status="fail", message="Watchdog audit detected anomalies.")

    print("\n" + "=" * 64)
    print(f"OVERALL WATCHDOG VERDICT: {'HEALTHY [PASS]' if is_overall_healthy else 'ANOMALY DETECTED [FAIL]'}")
    print("=" * 64)

    return is_overall_healthy, {
        "workflow": workflow_res,
        "heartbeat": heartbeat_res,
        "spaces": spaces_res,
    }


def main():
    parser = argparse.ArgumentParser(description="Independent SRE Watchdog for Keep-Alive Infrastructure")
    parser.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", DEFAULT_REPO))
    parser.add_argument("--branch", default="", help="Branch to inspect (defaults to default branch or specified ref)")
    parser.add_argument("--workflow", default=DEFAULT_WORKFLOW_FILE)
    parser.add_argument("--max-delay-minutes", type=int, default=DEFAULT_MAX_DELAY_MINUTES)
    parser.add_argument("--check-now", action="store_true", help="Execute single audit pass immediately")
    parser.add_argument("--test-alert", action="store_true", help="Send a test notification to verify webhook")
    parser.add_argument("--daemon", action="store_true", help="Run indefinitely with sleep interval")
    parser.add_argument("--interval", type=int, default=1200, help="Daemon poll interval in seconds (default 20m)")
    args = parser.parse_args()

    gh_token = os.environ.get("GITHUB_TOKEN", "").strip() or os.environ.get("GH_TOKEN", "").strip()
    alert_webhook = os.environ.get("ALERT_WEBHOOK_URL", "").strip()
    checkin_url = os.environ.get("WATCHDOG_CHECKIN_URL", "").strip()

    if args.test_alert:
        if not alert_webhook:
            print("[ERROR] Cannot test alert: ALERT_WEBHOOK_URL is not configured.")
            sys.exit(1)
        print("[INFO] Sending test notification...")
        success = am.notify_incident(
            webhook_url=alert_webhook,
            category="TEST_ALERT",
            severity="INFO",
            title="Keep-Alive Watchdog Test Alert",
            summary="This is a test notification confirming your webhook integration is active.",
            service=args.repo,
        )
        print(f"[INFO] Test notification dispatch result: {'SUCCESS' if success else 'FAILED'}")
        sys.exit(0 if success else 1)

    if args.daemon:
        print(f"[INFO] Launching watchdog daemon (poll interval: {args.interval}s)...")
        while True:
            run_watchdog_audit(
                repo=args.repo,
                branch=args.branch,
                workflow_name=args.workflow,
                max_delay_minutes=args.max_delay_minutes,
                gh_token=gh_token,
                alert_webhook=alert_webhook,
                checkin_url=checkin_url,
            )
            time.sleep(args.interval)

    # Default: single check
    healthy, _ = run_watchdog_audit(
        repo=args.repo,
        branch=args.branch,
        workflow_name=args.workflow,
        max_delay_minutes=args.max_delay_minutes,
        gh_token=gh_token,
        alert_webhook=alert_webhook,
        checkin_url=checkin_url,
    )
    sys.exit(0 if healthy else 1)


if __name__ == "__main__":
    main()
