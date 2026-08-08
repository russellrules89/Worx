import unittest
from unittest.mock import patch

from app import app, submissions


class TestWorkPlatform(unittest.TestCase):
    def setUp(self):
        app.config.update(TESTING=True)
        self.client = app.test_client()
        submissions.clear()

    def test_health_endpoint_response(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["status"], "ok")

    def test_task_list_is_demo_data(self):
        response = self.client.get("/api/tasks")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["data_mode"], "demo")
        self.assertGreater(len(response.get_json()["tasks"]), 0)

    def test_submission_requires_worker_and_response(self):
        response = self.client.post("/api/submissions", json={"task_id": "voice-brief-01"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("worker_name", response.get_json()["error"])

    def test_submission_can_be_reviewed_and_credited(self):
        created = self.client.post("/api/submissions", json={
            "task_id": "voice-brief-01", "worker_name": "Alex", "response_text": "A clear demo transcript."
        })
        self.assertEqual(created.status_code, 201)
        submission_id = created.get_json()["submission"]["id"]
        reviewed = self.client.post(f"/api/submissions/{submission_id}/review", json={"decision": "approved"})
        self.assertEqual(reviewed.status_code, 200)
        ledger = self.client.get("/api/ledger").get_json()
        self.assertEqual(ledger["approved_work"], 12)
        self.assertEqual(ledger["pending_work"], 0)

    def test_badge_authentication_rejection(self):
        response = self.client.post("/api/badge/check", json={})
        self.assertEqual(response.status_code, 400)

    def test_webhook_is_unavailable_without_a_secret(self):
        with patch("app.STRIPE_WEBHOOK_SECRET", ""):
            response = self.client.post("/api/stripe/webhook")
        self.assertEqual(response.status_code, 503)


if __name__ == "__main__":
    unittest.main()
