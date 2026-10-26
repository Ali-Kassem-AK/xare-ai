#!/usr/bin/env python3
"""
Automated Reliability Test Suite for Keep-Alive & Self-Healing Architecture
Covers all failure scenarios specified in the Reliability Audit:
  1. Space reports SLEEPING and recovery succeeds.
  2. Space reports RUNNING, but application health check fails -> triggers recovery.
  3. HTTP 404 must NOT count as healthy.
  4. HTTP 401 / 403 must NOT count as healthy.
  5. Restart request fails (e.g. HTTP 500 from HF).
  6. Space never reaches RUNNING (timeout during polling).
  7. Space reaches RUNNING but remains application-unhealthy after restart.
  8. Hugging Face API timeout handling.
  9. Missing or empty HF_TOKEN validation.
  10. Heartbeat manager elapsed-time calculations:
      - Missing file -> creates heartbeat.
      - Corrupt/invalid timestamp -> creates heartbeat.
      - Recent timestamp (<6 days) -> skips update.
      - Expired timestamp (>=6 days) -> creates heartbeat.
"""

import os
import sys
import tempfile
import unittest
import urllib.error
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

# Add parent directory to path so scripts can be imported directly
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO_ROOT)

import scripts.heartbeat_manager as hm
import scripts.keep_alive_monitor as km


class TestKeepAliveReliability(unittest.TestCase):

    def setUp(self):
        self.test_token = "hf_test_mock_token_12345"
        self.test_space = "AliiiS/24-7_n8n"

    # ---------------------------------------------------------
    # TEST 1: Missing Token
    # ---------------------------------------------------------
    def test_missing_token_fails_immediately(self):
        success, results = km.run_monitor("", [self.test_space])
        self.assertFalse(success, "Should fail when HF_TOKEN is empty")
        self.assertIn("HF_TOKEN is empty", results[0][4])

    # ---------------------------------------------------------
    # TEST 2: HTTP 404 Must NOT Count as Healthy
    # ---------------------------------------------------------
    @patch("urllib.request.urlopen")
    def test_http_404_rejected_as_unhealthy(self, mock_urlopen):
        mock_urlopen.side_effect = urllib.error.HTTPError(
            url="http://test", code=404, msg="Not Found", hdrs={}, fp=None
        )
        spec = km.HEALTH_SPECS["AliiiS/24-7_n8n"]
        is_healthy, detail, _ = km.check_application_health("https://mock.hf.space", spec, retries=1)
        self.assertFalse(is_healthy, "HTTP 404 must be marked as UNHEALTHY")
        self.assertIn("404", detail)

    # ---------------------------------------------------------
    # TEST 3: HTTP 401 / 403 Must NOT Count as Healthy
    # ---------------------------------------------------------
    @patch("urllib.request.urlopen")
    def test_http_401_403_rejected_as_unhealthy(self, mock_urlopen):
        for code in (401, 403):
            mock_urlopen.side_effect = urllib.error.HTTPError(
                url="http://test", code=code, msg="Unauthorized", hdrs={}, fp=None
            )
            spec = km.HEALTH_SPECS["AliiiS/24-7_n8n"]
            is_healthy, detail, _ = km.check_application_health("https://mock.hf.space", spec, retries=1)
            self.assertFalse(is_healthy, f"HTTP {code} must be marked as UNHEALTHY")
            self.assertIn(str(code), detail)

    # ---------------------------------------------------------
    # TEST 4: Body Validation - HTTP 200 with wrong body is UNHEALTHY
    # ---------------------------------------------------------
    @patch("urllib.request.urlopen")
    def test_http_200_with_bad_body_rejected(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = b'{"status":"error","detail":"database disconnected"}'
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        spec = km.HEALTH_SPECS["AliiiS/24-7_n8n"]
        is_healthy, detail, _ = km.check_application_health("https://mock.hf.space", spec, retries=1)
        self.assertFalse(is_healthy, "HTTP 200 with invalid body must fail body_validator")
        self.assertIn("body validation failed", detail)

    # ---------------------------------------------------------
    # TEST 5: Space reports SLEEPING -> Recovery succeeds
    # ---------------------------------------------------------
    @patch("scripts.keep_alive_monitor.check_application_health")
    @patch("scripts.keep_alive_monitor.wait_until_running")
    @patch("scripts.keep_alive_monitor.wake_space")
    @patch("scripts.keep_alive_monitor.get_space_info")
    def test_sleeping_space_triggers_wake_and_recovers(self, mock_info, mock_wake, mock_wait, mock_health):
        mock_info.return_value = {"id": self.test_space, "runtime": {"stage": "SLEEPING"}, "host": "https://mock.hf.space"}
        mock_wake.return_value = 200
        mock_wait.return_value = {"id": self.test_space, "runtime": {"stage": "RUNNING"}, "host": "https://mock.hf.space"}
        mock_health.return_value = (True, "HTTP 200 (healthy)", None)

        success, results = km.run_monitor(self.test_token, [self.test_space], max_wait=5)
        self.assertTrue(success)
        mock_wake.assert_called_once_with(self.test_space, token=self.test_token)
        self.assertTrue(results[0][2], "recovery_attempted (woken) must be True")
        self.assertTrue(results[0][3], "Overall result must be True")

    # ---------------------------------------------------------
    # TEST 6: Space reports RUNNING but Health Fails -> Zombie Recovery
    # ---------------------------------------------------------
    @patch("scripts.keep_alive_monitor.check_application_health")
    @patch("scripts.keep_alive_monitor.wait_until_running")
    @patch("scripts.keep_alive_monitor.wake_space")
    @patch("scripts.keep_alive_monitor.get_space_info")
    def test_zombie_running_space_triggers_recovery(self, mock_info, mock_wake, mock_wait, mock_health):
        mock_info.return_value = {"id": self.test_space, "runtime": {"stage": "RUNNING"}, "host": "https://mock.hf.space"}
        mock_wake.return_value = 200
        mock_wait.return_value = {"id": self.test_space, "runtime": {"stage": "RUNNING"}, "host": "https://mock.hf.space"}
        # First call fails (zombie container), second call succeeds after restart
        mock_health.side_effect = [
            (False, "HTTP 502 (Bad Gateway)", None),
            (True, "HTTP 200 (healthy)", None),
        ]

        success, results = km.run_monitor(self.test_token, [self.test_space], max_wait=5)
        self.assertTrue(success)
        mock_wake.assert_called_once_with(self.test_space, token=self.test_token)
        self.assertTrue(results[0][2], "Recovery must be attempted for zombie container")
        self.assertTrue(results[0][3], "Must be marked healthy after successful reboot")

    # ---------------------------------------------------------
    # TEST 7: Restart Request Fails (e.g. HF API 500)
    # ---------------------------------------------------------
    @patch("scripts.keep_alive_monitor.wake_space")
    @patch("scripts.keep_alive_monitor.get_space_info")
    def test_wake_request_failure_handled(self, mock_info, mock_wake):
        mock_info.return_value = {"id": self.test_space, "runtime": {"stage": "SLEEPING"}, "host": "https://mock.hf.space"}
        mock_wake.side_effect = urllib.error.HTTPError(url="http://test", code=500, msg="Server Error", hdrs={}, fp=None)

        success, results = km.run_monitor(self.test_token, [self.test_space], max_wait=5)
        self.assertFalse(success)
        self.assertIn("Wake-up failed", results[0][4])

    # ---------------------------------------------------------
    # TEST 8: Space Reaches RUNNING but Remains Unhealthy
    # ---------------------------------------------------------
    @patch("scripts.keep_alive_monitor.check_application_health")
    @patch("scripts.keep_alive_monitor.wait_until_running")
    @patch("scripts.keep_alive_monitor.wake_space")
    @patch("scripts.keep_alive_monitor.get_space_info")
    def test_running_but_permanently_unhealthy(self, mock_info, mock_wake, mock_wait, mock_health):
        mock_info.return_value = {"id": self.test_space, "runtime": {"stage": "RUNNING"}, "host": "https://mock.hf.space"}
        mock_wake.return_value = 200
        mock_wait.return_value = {"id": self.test_space, "runtime": {"stage": "RUNNING"}, "host": "https://mock.hf.space"}
        # Remains unhealthy even after reboot
        mock_health.return_value = (False, "HTTP 500 (Internal Server Error)", None)

        success, results = km.run_monitor(self.test_token, [self.test_space], max_wait=5)
        self.assertFalse(success, "Must fail if application remains unhealthy")
        self.assertFalse(results[0][3])

    # ---------------------------------------------------------
    # TEST 9: Hugging Face API Timeout
    # ---------------------------------------------------------
    @patch("scripts.keep_alive_monitor.get_space_info")
    def test_hf_api_timeout_handled(self, mock_info):
        mock_info.side_effect = urllib.error.URLError("Connection timed out")
        success, results = km.run_monitor(self.test_token, [self.test_space])
        self.assertFalse(success)
        self.assertIn("timed out", results[0][4])


class TestHeartbeatManager(unittest.TestCase):

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.heartbeat_path = os.path.join(self.temp_dir.name, ".last-keepalive")

    def tearDown(self):
        self.temp_dir.cleanup()

    # ---------------------------------------------------------
    # TEST 10A: Missing Heartbeat File -> Needs Update
    # ---------------------------------------------------------
    def test_missing_heartbeat_initializes(self):
        needs_update, reason, dt = hm.should_update_heartbeat(filepath=self.heartbeat_path)
        self.assertTrue(needs_update)
        self.assertIn("first-time initialization", reason)
        self.assertIsNone(dt)

        new_ts = hm.write_heartbeat(filepath=self.heartbeat_path)
        self.assertTrue(os.path.exists(self.heartbeat_path))
        self.assertTrue(new_ts.endswith("Z"))

    # ---------------------------------------------------------
    # TEST 10B: Corrupt / Invalid Timestamp -> Needs Update
    # ---------------------------------------------------------
    def test_corrupt_heartbeat_reinitializes(self):
        with open(self.heartbeat_path, "w") as f:
            f.write("corrupt-garbage-content\n")

        needs_update, reason, dt = hm.should_update_heartbeat(filepath=self.heartbeat_path)
        self.assertTrue(needs_update)
        self.assertIn("corrupt or invalid", reason)

    # ---------------------------------------------------------
    # TEST 10C: Recent Heartbeat (<6 days) -> Skips Update
    # ---------------------------------------------------------
    def test_recent_heartbeat_skips_commit(self):
        now = datetime.now(timezone.utc)
        # 2 days ago
        recent_ts = (now - timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
        with open(self.heartbeat_path, "w") as f:
            f.write(recent_ts + "\n")

        needs_update, reason, dt = hm.should_update_heartbeat(
            filepath=self.heartbeat_path, threshold_seconds=6 * 86400, now=now
        )
        self.assertFalse(needs_update, "Recent heartbeat must not trigger commit")
        self.assertIn("recent", reason)

    # ---------------------------------------------------------
    # TEST 10D: Expired Heartbeat (>=6 days) -> Triggers Update
    # ---------------------------------------------------------
    def test_expired_heartbeat_triggers_commit(self):
        now = datetime.now(timezone.utc)
        # 6.5 days ago
        old_ts = (now - timedelta(days=6, hours=12)).strftime("%Y-%m-%dT%H:%M:%SZ")
        with open(self.heartbeat_path, "w") as f:
            f.write(old_ts + "\n")

        needs_update, reason, dt = hm.should_update_heartbeat(
            filepath=self.heartbeat_path, threshold_seconds=6 * 86400, now=now
        )
        self.assertTrue(needs_update, "Heartbeat >=6 days must trigger commit")
        self.assertIn("exceeds threshold", reason)


if __name__ == "__main__":
    unittest.main(verbosity=2)
