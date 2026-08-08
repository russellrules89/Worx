import unittest
from unittest.mock import patch

from app import app


class TestWorkPlatform(unittest.TestCase):
    def setUp(self):
        app.config.update(TESTING=True)
        self.client = app.test_client()

    def test_health_endpoint_response(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["status"], "ok")

    def test_owner_balance_endpoint(self):
        response = self.client.get("/api/owner/balance")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["data_mode"], "demo")
        self.assertIn("corporate_client_billing_usd", data)
        self.assertIn("distributed_worker_tokens", data)

    def test_badge_authentication_rejection(self):
        response = self.client.post("/api/badge/check", json={})
        self.assertEqual(response.status_code, 400)

    def test_webhook_is_unavailable_without_a_secret(self):
        with patch("app.STRIPE_WEBHOOK_SECRET", ""):
            response = self.client.post("/api/stripe/webhook")
        self.assertEqual(response.status_code, 503)


if __name__ == "__main__":
    unittest.main()
