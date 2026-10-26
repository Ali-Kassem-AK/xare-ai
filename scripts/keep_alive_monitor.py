#!/usr/bin/env python3
"""
Hugging Face Spaces Keep-Alive & Self-Healing Monitor
Target Spaces:
  - AliiiS/24-7_n8n (n8n automation server)
  - AliiiS/pdf-to-image-api (PDF-to-Image FastAPI microservice)
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

# Ensure UTF-8 output across Windows consoles and GitHub Actions runners
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

SLEEP_STAGES = {"SLEEPING", "PAUSED", "STOPPED", "RUNTIME_ERROR", "BUILD_ERROR"}
BUILDING_STAGES = {"BUILDING", "APP_STARTING", "STARTING", "RUNNING_BUILDING", "RUNNING_APP_STARTING"}

# Strict health definitions: endpoint, expected HTTP code, and expected body substring
HEALTH_SPECS = {
    "AliiiS/24-7_n8n": {
        "endpoint": "/healthz",
        "expected_code": 200,
        "body_validator": lambda body: '"status":"ok"' in body.replace(" ", ""),
        "description": "n8n healthz status verification",
    },
    "AliiiS/pdf-to-image-api": {
        "endpoint": "/",
        "expected_code": 200,
        "body_validator": lambda body: "Alive and awake!" in body,
        "description": "PDF API root status verification",
    },
}


def get_headers(with_auth=True, token=""):
    headers = {
        "User-Agent": "Mozilla/5.0 (HuggingFace-Space-KeepAlive/3.0)",
        "Accept": "application/json, text/html, */*",
    }
    if with_auth and token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def get_space_info(space_id, token="", timeout=30):
    url = f"https://huggingface.co/api/spaces/{space_id}"
    req = urllib.request.Request(url, headers=get_headers(with_auth=True, token=token), method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 401 or e.code == 403:
            raise PermissionError(f"Authentication failed for Space {space_id} (HTTP {e.code}) - check HF_TOKEN permissions.")
        raise


def wake_space(space_id, token="", timeout=30):
    url = f"https://huggingface.co/api/spaces/{space_id}/restart"
    req = urllib.request.Request(
        url,
        data=b"{}",
        headers={**get_headers(with_auth=True, token=token), "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status


def wait_until_running(space_id, token="", max_wait=120, poll_interval=10):
    elapsed = 0
    while elapsed < max_wait:
        time.sleep(poll_interval)
        elapsed += poll_interval
        try:
            info = get_space_info(space_id, token=token)
            stage = info.get("runtime", {}).get("stage", "UNKNOWN")
            print(f"  [WAIT] [{elapsed}s/{max_wait}s] {space_id} runtime stage: {stage}")
            if stage == "RUNNING":
                return info
        except Exception as e:
            print(f"  [WARN] Poll warning at {elapsed}s: {e}")
    return get_space_info(space_id, token=token)


def resolve_public_url(space_id, info=None):
    if info and isinstance(info, dict):
        host = info.get("host") or info.get("runtime", {}).get("host")
        if host:
            return host if host.startswith("http") else f"https://{host}"
    subdomain = space_id.replace("/", "-").replace("_", "-").lower()
    return f"https://{subdomain}.hf.space"


def check_application_health(public_url, spec, retries=3, delay=10, timeout=20):
    """
    Strict application-level health check.
    Rejects 401, 403, 404, 5xx, timeouts, and body mismatches.
    Only returns True if expected HTTP code and body validator pass.
    """
    target_url = public_url.rstrip("/") + spec["endpoint"]
    expected_code = spec["expected_code"]
    validator = spec.get("body_validator")

    last_error = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(target_url, headers=get_headers(with_auth=False), method="GET")
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                status = resp.status
                body = resp.read().decode("utf-8", errors="replace")

                if status != expected_code:
                    last_error = f"HTTP {status} (expected {expected_code})"
                elif validator and not validator(body):
                    last_error = f"HTTP {status} but body validation failed (body snippet: {body[:100]!r})"
                else:
                    return True, f"HTTP {status} (healthy)", None
        except urllib.error.HTTPError as e:
            last_error = f"HTTP {e.code} ({e.reason})"
        except urllib.error.URLError as e:
            last_error = f"Network/Transport error: {e.reason}"
        except Exception as e:
            last_error = f"Unexpected error: {e}"

        if attempt < retries:
            print(f"  [RETRY] Health attempt {attempt}/{retries} failed ({last_error}). Retrying in {delay}s...")
            time.sleep(delay)

    return False, last_error, target_url


def send_alert_webhook(webhook_url, message, details=None):
    """Optionally dispatches a webhook notification (Discord, Slack, or generic HTTP webhook)."""
    if not webhook_url:
        return False
    try:
        payload = {
            "content": f"[ALERT] HF Spaces Keep-Alive: {message}",
            "text": f"[ALERT] HF Spaces Keep-Alive: {message}",
            "details": details or {},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            webhook_url,
            data=data,
            headers={"Content-Type": "application/json", "User-Agent": "HF-KeepAlive-Alert/1.0"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status in (200, 204)
    except Exception as e:
        print(f"[WARN] Webhook delivery failed: {e}")
        return False


def run_monitor(hf_token, space_ids, webhook_url=None, max_wait=120):
    print("=" * 64)
    print("Hugging Face Spaces Self-Healing Keep-Alive Monitor v3.0")
    print(f"Timestamp (UTC): {datetime.now(timezone.utc).isoformat()}")
    print(f"HF_TOKEN Configured: {'YES' if bool(hf_token) else 'NO (CRITICAL!)'}")
    print(f"Target Spaces ({len(space_ids)}): {', '.join(space_ids)}")
    print("=" * 64 + "\n")

    if not hf_token:
        error_msg = "HF_TOKEN is empty or missing! Cannot query or wake sleeping Spaces."
        print(f"[ERROR] {error_msg}")
        send_alert_webhook(webhook_url, error_msg)
        return False, [("GLOBAL", "UNKNOWN", False, False, error_msg)]

    results = []
    failed_count = 0

    for space_id in space_ids:
        print(f"--- Processing Space: {space_id} ---")
        woken = False
        stage = "UNKNOWN"
        info = None
        spec = HEALTH_SPECS.get(
            space_id,
            {"endpoint": "/", "expected_code": 200, "body_validator": None, "description": "Default root check"},
        )

        # Step 1: Query current lifecycle stage
        try:
            info = get_space_info(space_id, token=hf_token)
            stage = info.get("runtime", {}).get("stage", "UNKNOWN")
            print(f"[INFO] Initial Lifecycle Stage: {stage}")
        except Exception as e:
            print(f"[ERROR] Failed to fetch info for {space_id}: {e}")
            results.append((space_id, "ERROR", False, False, f"API error: {e}"))
            failed_count += 1
            continue

        # Step 2: Handle sleeping or building lifecycle states
        if stage in SLEEP_STAGES:
            print(f"[RECOVER] Space {space_id} is in sleep/error state ({stage})! Issuing POST /restart...")
            try:
                wake_status = wake_space(space_id, token=hf_token)
                woken = True
                print(f"[OK] Wake-up command accepted (HTTP {wake_status}). Polling until RUNNING...")
                info = wait_until_running(space_id, token=hf_token, max_wait=max_wait)
                stage = info.get("runtime", {}).get("stage", stage)
            except Exception as e:
                print(f"[ERROR] Wake-up failed for {space_id}: {e}")
                results.append((space_id, stage, False, False, f"Wake-up failed: {e}"))
                failed_count += 1
                continue
        elif stage in BUILDING_STAGES:
            print(f"[WAIT] Space {space_id} is currently {stage}. Polling until RUNNING...")
            info = wait_until_running(space_id, token=hf_token, max_wait=max_wait)
            stage = info.get("runtime", {}).get("stage", stage)

        public_url = resolve_public_url(space_id, info)
        print(f"[INFO] Public Endpoint: {public_url}{spec['endpoint']}")

        # Step 3: Check application health
        is_healthy, health_detail, target_url = check_application_health(public_url, spec)

        # Step 4: True Self-Healing - Recover zombie RUNNING instances that fail health checks
        if not is_healthy and stage == "RUNNING":
            print(f"[WARN] Space {space_id} is reported RUNNING, but application health check failed: {health_detail}")
            print(f"[RECOVER] Initiating controlled application recovery restart...")
            try:
                wake_status = wake_space(space_id, token=hf_token)
                woken = True
                print(f"[OK] Recovery restart accepted (HTTP {wake_status}). Waiting for container reboot...")
                info = wait_until_running(space_id, token=hf_token, max_wait=max_wait)
                stage = info.get("runtime", {}).get("stage", stage)
                # Re-verify health after reboot
                is_healthy, health_detail, target_url = check_application_health(public_url, spec, retries=4, delay=15)
            except Exception as e:
                health_detail = f"Recovery restart failed: {e}"
                is_healthy = False

        if is_healthy:
            print(f"[SUCCESS] Healthy: {space_id} -- stage={stage}, recovered={woken}, check={health_detail}\n")
            results.append((space_id, stage, woken, True, health_detail))
        else:
            print(f"[FAILURE] Unhealthy: {space_id} -- stage={stage}, recovered={woken}, error={health_detail}\n")
            results.append((space_id, stage, woken, False, health_detail))
            failed_count += 1

    # Print Summary
    print("=" * 64)
    print("MONITORING SUMMARY")
    print("=" * 64)
    for space_id, stage, woken, ok, detail in results:
        icon = "[PASS]" if ok else "[FAIL]"
        rec_str = ", recovery_attempted=YES" if woken else ", recovery_attempted=NO"
        print(f"{icon} {space_id} [stage={stage}{rec_str}] -> {detail}")
    print(f"Total Spaces: {len(space_ids)} | Healthy: {len(space_ids) - failed_count} | Unhealthy: {failed_count}")
    print("=" * 64)

    if failed_count > 0:
        alert_msg = f"{failed_count} of {len(space_ids)} Spaces failed health checks!"
        send_alert_webhook(webhook_url, alert_msg, details={"results": results})
        return False, results

    return True, results


if __name__ == "__main__":
    token = os.environ.get("HF_TOKEN", "").strip()
    raw_spaces = os.environ.get("SPACE_IDS", "AliiiS/24-7_n8n,AliiiS/pdf-to-image-api")
    spaces = [s.strip() for s in raw_spaces.split(",") if s.strip()]
    webhook = os.environ.get("ALERT_WEBHOOK_URL", "").strip()

    success, _ = run_monitor(token, spaces, webhook_url=webhook)
    if not success:
        sys.exit(1)
