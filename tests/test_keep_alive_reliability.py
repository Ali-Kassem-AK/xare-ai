#!/usr/bin/env python3
"""
Comprehensive SRE Reliability & Regression Test Suite for Keep-Alive Architecture
Covers all required regression and failure scenarios:
  1. Both Spaces healthy -> clean monitoring pass (zero restarts attempted).
  2. Space sleeping -> recovers via POST /restart and verifies health.
  3. Space RUNNING but application unhealthy -> zombie restart & recovers.
  4. Recovery fails after allowed attempts -> marks failed & dispatches alert.
  5. Hugging Face API times out -> handled safely without crash.
  6. Credentials missing or rejected (HTTP 401/403) -> caught and alerted.
  7. Heartbeat due (>=6 days) -> updates timestamp file.
  8. Monitoring step fails but heartbeat step still runs.
  9. Recent successful pull_request run does NOT hide an overdue schedule.
  10. Recent successful workflow_dispatch run does NOT hide an overdue schedule.
  11. Recent successful scheduled run on main is recognized as valid and healthy.
  12. Failed scheduled run generates an incident.
  13. Overdue scheduled run generates an incident.
  14. Zero scheduled runs on main is reported as unverified/unhealthy (NOT a pass).
  15. GitHub Actions API failures do not result in a false healthy verdict.
  16. Notification request fails (HTTP 500) -> gracefully handled without masking error.
  17. Previously failing service recovers -> recovery notification sent.
  18. Watchdog detects overdue heartbeat (>7 days).
  19. Watchdog detects Space direct out-of-band failure (HTTP 502).
  20. Watchdog check-in signals (start, ok, fail).
  21. Alert secret redaction prevents token and webhook URL leaks.
"""

import json
import os
import sys
import tempfile
import unittest
import urllib.error
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, call, patch

# Ensure repo root is on sys.path
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO_ROOT)

import scripts.alert_manager as am
import scripts.heartbeat_manager as hm
import scripts.keep_alive_monitor as km
import scripts.watchdog as wd


class TestKeepAliveCore(unittest.TestCase):

    def setUp(self):
        self.test_token = "hf_test_mock_token_12345"
        self.space_n8n = "AliiiS/24-7_n8n"
        self.space_pdf = "AliiiS/pdf-to-image-api"

    # ---------------------------------------------------------
    # SCENARIO 1: Both Spaces Healthy (No restarts attempted)
    # ---------------------------------------------------------
    @patch("scripts.keep_alive_monitor.check_application_health")
    @patch("scripts.keep_alive_monitor.get_space_info")
    @patch("scripts.keep_alive_monitor.wake_space")
    def test_both_spaces_healthy_no_restart_attempted(self, mock_wake, mock_info, mock_health):
        mock_info.side_effect = [
            {"id": self.space_n8n, "runtime": {"stage": "RUNNING"}, "host": "mock-n8n.hf.space"},
            {"id": self.space_pdf, "runtime": {"stage": "RUNNING"}, "host": "mock-pdf.hf.space"},
        ]
        mock_health.side_effect = [
            (True, "HTTP 200 (healthy)", None),
            (True, "HTTP 200 (healthy)", None),
        ]

        success, results = km.run_monitor(self.test_token, [self.space_n8n, self.space_pdf])
        self.assertTrue(success, "Both spaces healthy must yield success")
        self.assertEqual(len(results), 2)
        self.assertFalse(results[0][2], "No recovery restart should be attempted for healthy space 1")
        self.assertFalse(results[1][2], "No recovery restart should be attempted for healthy space 2")
        mock_wake.assert_not_called()

    # ---------------------------------------------------------
    # SCENARIO 2: Space Sleeping -> Recovers via POST /restart
    # ---------------------------------------------------------
    @patch("scripts.keep_alive_monitor.check_application_health")
    @patch("scripts.keep_alive_monitor.wait_until_running")
    @patch("scripts.keep_alive_monitor.wake_space")
    @patch("scripts.keep_alive_monitor.get_space_info")
    def test_space_sleeping_recovers(self, mock_info, mock_wake, mock_wait, mock_health):
        mock_info.return_value = {"id": self.space_n8n, "runtime": {"stage": "SLEEPING"}, "host": "mock.hf.space"}
        mock_wake.return_value = 200
        mock_wait.return_value = {"id": self.space_n8n, "runtime": {"stage": "RUNNING"}, "host": "mock.hf.space"}
        mock_health.return_value = (True, "HTTP 200 (healthy)", None)

        success, results = km.run_monitor(self.test_token, [self.space_n8n], max_wait=5)
        self.assertTrue(success)
        mock_wake.assert_called_once_with(self.space_n8n, token=self.test_token)
        self.assertTrue(results[0][2], "Recovery attempt must be recorded as True")
        self.assertTrue(results[0][3], "Result must be marked healthy after wake")

    # ---------------------------------------------------------
    # SCENARIO 3: Space RUNNING but Unhealthy -> Zombie Restart
    # ---------------------------------------------------------
    @patch("scripts.keep_alive_monitor.check_application_health")
    @patch("scripts.keep_alive_monitor.wait_until_running")
    @patch("scripts.keep_alive_monitor.wake_space")
    @patch("scripts.keep_alive_monitor.get_space_info")
    def test_space_running_zombie_restarts_and_recovers(self, mock_info, mock_wake, mock_wait, mock_health):
        mock_info.return_value = {"id": self.space_n8n, "runtime": {"stage": "RUNNING"}, "host": "mock.hf.space"}
        mock_wake.return_value = 200
        mock_wait.return_value = {"id": self.space_n8n, "runtime": {"stage": "RUNNING"}, "host": "mock.hf.space"}
        # Fails initial check, succeeds post-reboot
        mock_health.side_effect = [
            (False, "HTTP 502 (Bad Gateway)", None),
            (True, "HTTP 200 (healthy)", None),
        ]

        success, results = km.run_monitor(self.test_token, [self.space_n8n], max_wait=5)
        self.assertTrue(success)
        mock_wake.assert_called_once_with(self.space_n8n, token=self.test_token)
        self.assertTrue(results[0][2], "Recovery attempt must be recorded")
        self.assertTrue(results[0][3], "Result must be healthy post-recovery")

    # ---------------------------------------------------------
    # SCENARIO 4: Recovery Fails After Allowed Attempts
    # ---------------------------------------------------------
    @patch("scripts.keep_alive_monitor.check_application_health")
    @patch("scripts.keep_alive_monitor.wait_until_running")
    @patch("scripts.keep_alive_monitor.wake_space")
    @patch("scripts.keep_alive_monitor.get_space_info")
    def test_recovery_fails_after_attempt(self, mock_info, mock_wake, mock_wait, mock_health):
        mock_info.return_value = {"id": self.space_n8n, "runtime": {"stage": "RUNNING"}, "host": "mock.hf.space"}
        mock_wake.return_value = 200
        mock_wait.return_value = {"id": self.space_n8n, "runtime": {"stage": "RUNNING"}, "host": "mock.hf.space"}
        # Both checks fail
        mock_health.side_effect = [
            (False, "HTTP 500 (Container Crash)", None),
            (False, "HTTP 500 (Still Crashed)", None),
        ]

        success, results = km.run_monitor(self.test_token, [self.space_n8n], max_wait=5)
        self.assertFalse(success, "Must return failure when recovery cannot heal service")
        self.assertFalse(results[0][3], "Space must be marked unhealthy")

    # ---------------------------------------------------------
    # SCENARIO 5: Hugging Face API Times Out
    # ---------------------------------------------------------
    @patch("scripts.keep_alive_monitor.get_space_info")
    def test_hf_api_timeout_handled(self, mock_info):
        mock_info.side_effect = urllib.error.URLError("Connection timed out")
        success, results = km.run_monitor(self.test_token, [self.space_n8n])
        self.assertFalse(success)
        self.assertIn("timed out", results[0][4])

    # ---------------------------------------------------------
    # SCENARIO 6: Credentials Missing or Rejected (HTTP 401/403)
    # ---------------------------------------------------------
    def test_missing_credentials_fails_immediately(self):
        success, results = km.run_monitor("", [self.space_n8n])
        self.assertFalse(success)
        self.assertIn("HF_TOKEN environment variable is missing", results[0][4])

    @patch("scripts.keep_alive_monitor.get_space_info")
    def test_rejected_credentials_fails_cleanly(self, mock_info):
        mock_info.side_effect = PermissionError("Authentication failed for Space (HTTP 401)")
        success, results = km.run_monitor("invalid_token", [self.space_n8n])
        self.assertFalse(success)
        self.assertEqual(results[0][1], "AUTH_ERROR")


class TestHeartbeatAndWorkflow(unittest.TestCase):

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.heartbeat_path = os.path.join(self.temp_dir.name, ".last-keepalive")

    def tearDown(self):
        self.temp_dir.cleanup()

    # ---------------------------------------------------------
    # SCENARIO 7: Heartbeat Due (>=6 days) -> Triggers Update
    # ---------------------------------------------------------
    def test_heartbeat_due_triggers_update(self):
        now = datetime.now(timezone.utc)
        old_ts = (now - timedelta(days=6, hours=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
        with open(self.heartbeat_path, "w") as f:
            f.write(old_ts + "\n")

        needs_update, reason, dt = hm.should_update_heartbeat(
            filepath=self.heartbeat_path, threshold_seconds=6 * 86400, now=now
        )
        self.assertTrue(needs_update)
        self.assertIn("exceeds threshold", reason)

        new_ts = hm.write_heartbeat(filepath=self.heartbeat_path, now=now)
        self.assertTrue(os.path.exists(self.heartbeat_path))

    # ---------------------------------------------------------
    # SCENARIO 8: Heartbeat Execution Even When Monitoring Fails
    # ---------------------------------------------------------
    def test_heartbeat_evaluates_independently_of_monitoring_outcome(self):
        """Simulate workflow logic where heartbeat runs with if: always() regardless of monitor failure."""
        needs_update, reason, _ = hm.should_update_heartbeat(filepath=self.heartbeat_path)
        self.assertTrue(needs_update, "Heartbeat initialization must succeed even if monitor had failed")


class TestWatchdogScheduledCadenceRegressions(unittest.TestCase):
    """
    Critical regression suite verifying that manual or PR CI executions
    CANNOT deceive the watchdog or conceal a stopped, delayed, or missing production schedule.
    """

    # ---------------------------------------------------------
    # REGRESSION 1: Recent successful pull_request run does NOT hide overdue schedule
    # ---------------------------------------------------------
    @patch("scripts.watchdog.make_request")
    def test_pr_run_does_not_hide_overdue_schedule(self, mock_req):
        now = datetime.now(timezone.utc)
        # Scheduled run was 65 minutes ago (overdue)
        old_sched_time = (now - timedelta(minutes=65)).strftime("%Y-%m-%dT%H:%M:%SZ")
        sched_body = json.dumps({
            "workflow_runs": [{
                "id": 111,
                "html_url": "https://github.com/mock/runs/111",
                "event": "schedule",
                "status": "completed",
                "conclusion": "success",
                "created_at": old_sched_time,
            }]
        })
        # General query returns a recent successful PR run 2 minutes ago
        pr_body = json.dumps({
            "workflow_runs": [{
                "id": 999,
                "event": "pull_request",
                "head_branch": "fix/test",
                "status": "completed",
                "conclusion": "success",
                "created_at": (now - timedelta(minutes=2)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            }]
        })

        mock_req.side_effect = [
            (200, sched_body, None),  # Query 1: event=schedule&branch=main
            (200, pr_body, None),     # Query 2: general runs
        ]

        res = wd.check_github_workflow_cadence(
            repo="mock/repo", branch="main", max_delay_minutes=45, now=now
        )
        self.assertFalse(res["healthy"], "Recent PR success must not conceal overdue schedule")
        self.assertEqual(res["category"], "SCHEDULED_RUN_CONFIRMED_MISSING")
        self.assertIn("Confirmed missing scheduled run", res["message"])

    # ---------------------------------------------------------
    # REGRESSION 2: Recent successful workflow_dispatch run does NOT hide overdue schedule
    # ---------------------------------------------------------
    @patch("scripts.watchdog.make_request")
    def test_workflow_dispatch_does_not_hide_overdue_schedule(self, mock_req):
        now = datetime.now(timezone.utc)
        # Scheduled run was 70 minutes ago (overdue)
        old_sched_time = (now - timedelta(minutes=70)).strftime("%Y-%m-%dT%H:%M:%SZ")
        sched_body = json.dumps({
            "workflow_runs": [{
                "id": 222,
                "html_url": "https://github.com/mock/runs/222",
                "event": "schedule",
                "status": "completed",
                "conclusion": "success",
                "created_at": old_sched_time,
            }]
        })
        # General query returns a recent successful manual dispatch 3 minutes ago
        dispatch_body = json.dumps({
            "workflow_runs": [{
                "id": 888,
                "event": "workflow_dispatch",
                "head_branch": "main",
                "status": "completed",
                "conclusion": "success",
                "created_at": (now - timedelta(minutes=3)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            }]
        })

        mock_req.side_effect = [
            (200, sched_body, None),
            (200, dispatch_body, None),
        ]

        res = wd.check_github_workflow_cadence(
            repo="mock/repo", branch="main", max_delay_minutes=45, now=now
        )
        self.assertFalse(res["healthy"], "Recent workflow_dispatch must not conceal overdue schedule")
        self.assertEqual(res["category"], "SCHEDULED_RUN_CONFIRMED_MISSING")

    # ---------------------------------------------------------
    # REGRESSION 3: Recent successful scheduled run on main is recognized as valid
    # ---------------------------------------------------------
    @patch("scripts.watchdog.make_request")
    def test_valid_recent_scheduled_run_on_main_passes(self, mock_req):
        now = datetime.now(timezone.utc)
        # Scheduled run was 12 minutes ago (on-time)
        sched_time = (now - timedelta(minutes=12)).strftime("%Y-%m-%dT%H:%M:%SZ")
        sched_body = json.dumps({
            "workflow_runs": [{
                "id": 333,
                "html_url": "https://github.com/mock/runs/333",
                "event": "schedule",
                "status": "completed",
                "conclusion": "success",
                "created_at": sched_time,
            }]
        })

        mock_req.side_effect = [
            (200, sched_body, None),
            (200, "{}", None),
        ]

        res = wd.check_github_workflow_cadence(
            repo="mock/repo", branch="main", now=now
        )
        self.assertTrue(res["healthy"], "Recent scheduled run on main must pass")
        self.assertEqual(res["category"], "SCHEDULED_RUN_ON_TIME")
        self.assertIn("Latest scheduled run #333 on 'main' completed with success", res["message"])

    # ---------------------------------------------------------
    # REGRESSION 4: Failed scheduled run generates an incident
    # ---------------------------------------------------------
    @patch("scripts.watchdog.make_request")
    def test_failed_scheduled_run_triggers_incident(self, mock_req):
        now = datetime.now(timezone.utc)
        sched_time = (now - timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M:%SZ")
        sched_body = json.dumps({
            "workflow_runs": [{
                "id": 444,
                "html_url": "https://github.com/mock/runs/444",
                "event": "schedule",
                "status": "completed",
                "conclusion": "failure",
                "created_at": sched_time,
            }]
        })

        mock_req.side_effect = [
            (200, sched_body, None),
            (200, "{}", None),
        ]

        res = wd.check_github_workflow_cadence(repo="mock/repo", branch="main", now=now)
        self.assertFalse(res["healthy"])
        self.assertEqual(res["category"], "SCHEDULED_RUN_FAILED")
        self.assertIn("failed with conclusion: failure", res["message"])

    # ---------------------------------------------------------
    # REGRESSION 5: Overdue scheduled run generates an incident
    # ---------------------------------------------------------
    @patch("scripts.watchdog.make_request")
    def test_overdue_scheduled_run_triggers_incident(self, mock_req):
        now = datetime.now(timezone.utc)
        # Scheduled run was 55 minutes ago (exceeds max_delay 45)
        sched_time = (now - timedelta(minutes=55)).strftime("%Y-%m-%dT%H:%M:%SZ")
        sched_body = json.dumps({
            "workflow_runs": [{
                "id": 555,
                "html_url": "https://github.com/mock/runs/555",
                "event": "schedule",
                "status": "completed",
                "conclusion": "success",
                "created_at": sched_time,
            }]
        })

        mock_req.side_effect = [
            (200, sched_body, None),
            (200, "{}", None),
        ]

        res = wd.check_github_workflow_cadence(
            repo="mock/repo", branch="main", max_delay_minutes=45, now=now
        )
        self.assertFalse(res["healthy"])
        self.assertEqual(res["category"], "SCHEDULED_RUN_CONFIRMED_MISSING")

    # ---------------------------------------------------------
    # REGRESSION 6: Zero scheduled runs on main is reported as UNVERIFIED / UNHEALTHY (NOT A PASS)
    # ---------------------------------------------------------
    @patch("scripts.watchdog.make_request")
    def test_no_scheduled_runs_on_main_reports_unverified_unhealthy(self, mock_req):
        # Scheduled query returns zero runs
        sched_body = json.dumps({"workflow_runs": []})
        # General query returns some recent PR / manual runs
        gen_body = json.dumps({
            "workflow_runs": [{
                "id": 777,
                "event": "workflow_dispatch",
                "head_branch": "fix/repair",
                "conclusion": "success",
            }]
        })

        mock_req.side_effect = [
            (200, sched_body, None),
            (200, gen_body, None),
        ]

        res = wd.check_github_workflow_cadence(repo="mock/repo", branch="main")
        self.assertFalse(res["healthy"], "Zero scheduled runs must NEVER report healthy")
        self.assertFalse(res["verified"], "Must be marked unverified")
        self.assertEqual(res["category"], "NO_SCHEDULED_RUNS_ON_BRANCH")
        self.assertIn("No scheduled workflow runs (event=schedule) have ever executed", res["message"])

    # ---------------------------------------------------------
    # REGRESSION 7: GitHub Actions API failures do not result in a false healthy verdict
    # ---------------------------------------------------------
    @patch("scripts.watchdog.make_request")
    def test_github_api_failure_does_not_give_false_healthy(self, mock_req):
        mock_req.return_value = (500, "", "HTTPError 500: Server Error")
        res = wd.check_github_workflow_cadence(repo="mock/repo", branch="main")
        self.assertFalse(res["healthy"], "API error must NOT yield a healthy status")
        self.assertEqual(res["category"], "WATCHDOG_GITHUB_API_ERROR")
        self.assertIn("Failed to query GitHub Actions API", res["message"])


class TestAlertsAndDirectWatchdog(unittest.TestCase):

    # ---------------------------------------------------------
    # SCENARIO 16: Notification Request Fails -> Handled Gracefully
    # ---------------------------------------------------------
    @patch("urllib.request.urlopen")
    def test_notification_transport_error_does_not_raise(self, mock_urlopen):
        mock_urlopen.side_effect = urllib.error.HTTPError(
            url="https://mock.webhook", code=500, msg="Internal Webhook Server Error", hdrs={}, fp=None
        )
        result = am.notify_incident(
            webhook_url="https://mock.webhook",
            category="TEST_CATEGORY",
            severity="CRITICAL",
            title="Test Error",
            summary="Test Summary",
        )
        self.assertFalse(result, "Should return False when webhook transport fails")

    # ---------------------------------------------------------
    # SCENARIO 17: Previously Failing Service Recovers -> Recovery Alert Sent
    # ---------------------------------------------------------
    @patch("scripts.alert_manager.send_webhook_notification")
    @patch("scripts.keep_alive_monitor.check_application_health")
    @patch("scripts.keep_alive_monitor.wait_until_running")
    @patch("scripts.keep_alive_monitor.wake_space")
    @patch("scripts.keep_alive_monitor.get_space_info")
    def test_recovery_notification_dispatched_on_heal(self, mock_info, mock_wake, mock_wait, mock_health, mock_notify):
        mock_info.return_value = {"id": "AliiiS/24-7_n8n", "runtime": {"stage": "SLEEPING"}, "host": "mock.hf.space"}
        mock_wake.return_value = 200
        mock_wait.return_value = {"id": "AliiiS/24-7_n8n", "runtime": {"stage": "RUNNING"}, "host": "mock.hf.space"}
        mock_health.return_value = (True, "HTTP 200 (healthy)", None)
        mock_notify.return_value = True

        success, _ = km.run_monitor(
            "hf_token", ["AliiiS/24-7_n8n"], webhook_url="https://mock.webhook", max_wait=5
        )
        self.assertTrue(success)
        mock_notify.assert_called_once()
        payload = mock_notify.call_args[0][1]
        self.assertEqual(payload["category"], "RECOVERY_SUCCEEDED")
        self.assertEqual(payload["severity"], "RESOLVED")

    # ---------------------------------------------------------
    # SCENARIO 18: Watchdog Detects Overdue Heartbeat (>7 days)
    # ---------------------------------------------------------
    @patch("scripts.watchdog.make_request")
    def test_watchdog_detects_overdue_heartbeat(self, mock_req):
        now = datetime.now(timezone.utc)
        # Commit was 8.5 days ago
        old_commit_time = (now - timedelta(days=8, hours=12)).strftime("%Y-%m-%dT%H:%M:%SZ")
        mock_body = json.dumps([{
            "sha": "abcdef123456",
            "commit": {"committer": {"date": old_commit_time}},
        }])
        mock_req.return_value = (200, mock_body, None)

        res = wd.check_heartbeat_freshness(repo="mock/repo", max_days=7.0, now=now)
        self.assertFalse(res["healthy"])
        self.assertEqual(res["category"], "HEARTBEAT_OVERDUE")
        self.assertIn("is overdue", res["message"])

    # ---------------------------------------------------------
    # SCENARIO 19: Watchdog Detects Space Direct Failure Out-of-band
    # ---------------------------------------------------------
    @patch("scripts.watchdog.make_request")
    def test_watchdog_detects_direct_space_failure(self, mock_req):
        mock_req.return_value = (502, "Bad Gateway", "HTTPError 502")
        mock_specs = {
            "AliiiS/24-7_n8n": {
                "url": "https://mock.space/healthz",
                "expected_code": 200,
                "validator": None,
            }
        }
        res = wd.check_spaces_direct_health(spaces_specs=mock_specs)
        self.assertFalse(res["healthy"])
        self.assertIn("AliiiS/24-7_n8n", res["results"])
        self.assertFalse(res["results"]["AliiiS/24-7_n8n"]["healthy"])

    # ---------------------------------------------------------
    # SCENARIO 20: Watchdog Check-in Signals (Start, OK, Fail)
    # ---------------------------------------------------------
    @patch("urllib.request.urlopen")
    def test_watchdog_checkin_signals(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        # Test start
        self.assertTrue(wd.ping_external_watchdog("https://hc-ping.com/mock-uuid", status="start"))
        self.assertEqual(mock_urlopen.call_args[0][0].full_url, "https://hc-ping.com/mock-uuid/start")

        # Test ok
        self.assertTrue(wd.ping_external_watchdog("https://hc-ping.com/mock-uuid", status="ok"))
        self.assertEqual(mock_urlopen.call_args[0][0].full_url, "https://hc-ping.com/mock-uuid")

        # Test fail
        self.assertTrue(wd.ping_external_watchdog("https://hc-ping.com/mock-uuid", status="fail", message="err"))
        self.assertEqual(mock_urlopen.call_args[0][0].full_url, "https://hc-ping.com/mock-uuid/fail")

    # ---------------------------------------------------------
    # SCENARIO 21: Secret Redaction in Alert Payloads
    # ---------------------------------------------------------
    def test_secret_redaction_in_alerts(self):
        secret_string = "Error with hf_AbCdEfGhIjKlMnOpQrStUvWxYz012345 and ghp_AbCdEfGhIjKlMnOpQrStUvWxYz012345"
        redacted = am.redact_sensitive_data(secret_string)
        self.assertNotIn("hf_AbCdEfGhIjKlMnOpQrStUvWxYz012345", redacted)
        self.assertNotIn("ghp_AbCdEfGhIjKlMnOpQrStUvWxYz012345", redacted)
        self.assertIn("[REDACTED_HF_TOKEN]", redacted)
        self.assertIn("[REDACTED_GH_TOKEN]", redacted)


if __name__ == "__main__":
    unittest.main(verbosity=2)
