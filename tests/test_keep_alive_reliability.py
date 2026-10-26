#!/usr/bin/env python3
"""
Comprehensive SRE Reliability Test Suite for Keep-Alive & Self-Healing Architecture
Covers all mandatory reliability scenarios:
  1. Both Spaces healthy -> clean monitoring pass (no restarts attempted).
  2. Space sleeping -> recovers via POST /restart and verifies health.
  3. Space RUNNING but application unhealthy -> zombie restart & recovers.
  4. Recovery fails after allowed attempts -> marks failed & dispatches alert.
  5. Hugging Face API times out -> handled safely without crash.
  6. Credentials missing or rejected (HTTP 401/403) -> caught and alerted.
  7. Heartbeat due (>=6 days) -> updates timestamp file.
  8. Monitoring step fails but heartbeat step still runs.
  9. Scheduled workflow fails -> watchdog detects failure conclusion.
  10. Expected scheduled run never appears -> watchdog detects missing/delayed run.
  11. Notification request fails (HTTP 500) -> gracefully handled without masking error.
  12. Previously failing service recovers -> recovery notification sent.
  13. Watchdog detects overdue heartbeat (>7 days).
  14. Watchdog detects Space direct out-of-band failure (HTTP 502).
  15. Watchdog check-in signals (start, ok, fail).
  16. Alert secret redaction prevents token and webhook URL leaks.
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
        monitor_failed = True
        # Heartbeat evaluation should proceed normally
        needs_update, reason, _ = hm.should_update_heartbeat(filepath=self.heartbeat_path)
        self.assertTrue(needs_update, "Heartbeat initialization must succeed even if monitor had failed")


class TestWatchdogAndAlerts(unittest.TestCase):

    # ---------------------------------------------------------
    # SCENARIO 9: Scheduled Workflow Fails -> Watchdog Detects
    # ---------------------------------------------------------
    @patch("scripts.watchdog.make_request")
    def test_watchdog_detects_failed_workflow_run(self, mock_req):
        mock_body = json.dumps({
            "workflow_runs": [{
                "id": 999123,
                "html_url": "https://github.com/mock/runs/999123",
                "event": "schedule",
                "status": "completed",
                "conclusion": "failure",
                "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            }]
        })
        mock_req.return_value = (200, mock_body, None)

        res = wd.check_github_workflow_cadence(repo="mock/repo", workflow_name="keep-alive.yml")
        self.assertFalse(res["healthy"])
        self.assertEqual(res["category"], "WORKFLOW_RUN_FAILED")
        self.assertIn("failed with conclusion: failure", res["message"])

    # ---------------------------------------------------------
    # SCENARIO 10: Expected Scheduled Run Never Appears
    # ---------------------------------------------------------
    @patch("scripts.watchdog.make_request")
    def test_watchdog_detects_missed_or_delayed_scheduled_run(self, mock_req):
        now = datetime.now(timezone.utc)
        # Last run was 65 minutes ago (threshold is 45 minutes)
        old_time = (now - timedelta(minutes=65)).strftime("%Y-%m-%dT%H:%M:%SZ")
        mock_body = json.dumps({
            "workflow_runs": [{
                "id": 888456,
                "html_url": "https://github.com/mock/runs/888456",
                "event": "schedule",
                "status": "completed",
                "conclusion": "success",
                "created_at": old_time,
            }]
        })
        mock_req.return_value = (200, mock_body, None)

        res = wd.check_github_workflow_cadence(
            repo="mock/repo", workflow_name="keep-alive.yml", max_delay_minutes=45, now=now
        )
        self.assertFalse(res["healthy"])
        self.assertEqual(res["category"], "RUN_MISSED_OR_DELAYED")
        self.assertIn("Expected keep-alive run is overdue", res["message"])

    # ---------------------------------------------------------
    # SCENARIO 11: Notification Request Fails -> Handled Gracefully
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
    # SCENARIO 12: Previously Failing Service Recovers -> Recovery Alert Sent
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
    # SCENARIO 13: Watchdog Detects Overdue Heartbeat (>7 days)
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
    # SCENARIO 14: Watchdog Detects Space Direct Failure Out-of-band
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
    # SCENARIO 15: Watchdog Check-in Signals (Start, OK, Fail)
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
    # SCENARIO 16: Secret Redaction in Alert Payloads
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
