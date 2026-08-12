import unittest
from unittest.mock import patch

from eth_account import Account
from eth_account.messages import encode_defunct

from app import PlatformConfig, app, contribution_records, tasks, future_work_contracts, investor_interest_records, ledger_entries, payout_batches, settlement_status, submissions, token_issuances, token_sale_requests, training_runs, worker_accounts


class TestWorkPlatform(unittest.TestCase):
    def setUp(self):
        app.config.update(TESTING=True, SECRET_KEY="test-session-key", CONTRACT_ADMIN_API_KEY="test-contract-admin")
        self.client = app.test_client()
        self.contract_admin_headers = {"X-Contract-Admin-Key": "test-contract-admin"}
        submissions.clear()
        contribution_records.clear()
        training_runs.clear()
        payout_batches.clear()
        ledger_entries.clear()
        token_issuances.clear()
        future_work_contracts.clear()
        token_sale_requests.clear()
        investor_interest_records.clear()
        worker_accounts.clear()
        tasks[:] = [item for item in tasks if item["id"] in {"voice-brief-01", "label-brief-02"}]

    def submit_voice(self, worker="Alex"):
        return self.client.post("/api/submissions", json={
            "task_id": "voice-brief-01", "worker_name": worker, "wallet_address": "0x0000000000000000000000000000000000000001", "response_text": "A clear demo transcript.",
            "consent": {"accepted": True, "policy_version": "2026-08-preview"},
            "duration_seconds": 2, "has_mobile_metadata": True, "estimated_snr_db": 20,
        })


    def register_contribution(self, submission_id):
        return self.client.post("/api/contributions", json={
            "submission_id": submission_id,
            "storage_reference": f"blob://private/contributions/{submission_id}",
            "content_sha256": "a" * 64,
        })

    def test_settlement_requires_valid_base_sepolia_configuration(self):
        with patch.object(PlatformConfig, "BASE_SEPOLIA_SETTLEMENT_ENABLED", True), patch.object(PlatformConfig, "ETHEREUM_CONTRACT_ADDRESS", "not-an-address"):
            self.assertFalse(settlement_status()["enabled"])
        with patch.object(PlatformConfig, "BASE_SEPOLIA_SETTLEMENT_ENABLED", True), patch.object(PlatformConfig, "ETHEREUM_CONTRACT_ADDRESS", "0x0000000000000000000000000000000000000001"):
            status = settlement_status()
            self.assertTrue(status["enabled"])
            self.assertFalse(status["cashout"]["available"])

    def test_portal_guide_answers_reward_question(self):
        response = self.client.post("/api/assistant", json={"message": "How do rewards work?"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["action"], "tasks")
        self.assertIn("server-side review", response.get_json()["reply"])

    def test_portal_guide_rejects_empty_message(self):
        self.assertEqual(self.client.post("/api/assistant", json={"message": ""}).status_code, 400)

    def test_synthetic_task_requires_admin_and_starts_as_unpaid_draft(self):
        self.assertEqual(self.client.post("/api/synthetic-tasks", json={"kind": "voice"}).status_code, 403)
        response = self.client.post("/api/synthetic-tasks", headers=self.contract_admin_headers, json={"kind": "voice"})
        self.assertEqual(response.status_code, 201)
        task = response.get_json()["task"]
        self.assertEqual(task["status"], "draft_review")
        self.assertEqual(task["reward_work"], 0)
        self.assertTrue(task["provenance"]["synthetic"])
        self.assertFalse(task["provenance"]["eligible_for_rewards"])

    def test_reviewed_synthetic_task_requires_contracted_allocation_before_publish(self):
        draft = self.client.post("/api/synthetic-tasks", headers=self.contract_admin_headers, json={"kind": "annotation"}).get_json()["task"]
        self.assertEqual(self.client.post(f"/api/synthetic-tasks/{draft['id']}/publish", headers=self.contract_admin_headers, json={"reward_work": 5, "required_submissions": 2}).status_code, 400)
        contract = self.client.post("/api/future-work-contracts", headers=self.contract_admin_headers, json={"contract_reference": "SYN-2026-01", "client_name": "Dataset Client", "committed_work": 20}).get_json()["contract"]
        response = self.client.post(f"/api/synthetic-tasks/{draft['id']}/publish", headers=self.contract_admin_headers, json={"future_contract_id": contract["id"], "reward_work": 5, "required_submissions": 2})
        self.assertEqual(response.status_code, 200)
        task = response.get_json()["task"]
        self.assertEqual(task["status"], "open")
        self.assertTrue(task["provenance"]["eligible_for_rewards"])

    def test_wallet_login_requires_a_valid_signature_and_creates_a_session(self):
        account = Account.create()
        address = account.address.lower()
        nonce_response = self.client.post("/api/auth/wallet/nonce", json={"address": address})
        self.assertEqual(nonce_response.status_code, 200)
        message = nonce_response.get_json()["message"]
        signature = Account.sign_message(encode_defunct(text=message), account.key).signature.hex()
        verified = self.client.post("/api/auth/wallet/verify", json={"address": address, "signature": signature, "challenge": nonce_response.get_json()["challenge"]})
        self.assertEqual(verified.status_code, 200)
        self.assertEqual(verified.get_json()["wallet_address"], address)
        self.assertTrue(self.client.get("/api/auth/session").get_json()["authenticated"])

    def test_wallet_login_rejects_an_invalid_signature(self):
        address = Account.create().address.lower()
        challenge = self.client.post("/api/auth/wallet/nonce", json={"address": address}).get_json()["challenge"]
        response = self.client.post("/api/auth/wallet/verify", json={"address": address, "signature": "0x" + "00" * 65, "challenge": challenge})
        self.assertEqual(response.status_code, 401)

    def test_health_endpoint_response(self):
        self.assertEqual(self.client.get("/health").get_json()["status"], "ok")

    def test_client_can_create_demo_task_with_allocation(self):
        response = self.client.post("/api/client/tasks", json={"client_name": "Client", "title": "A task", "instructions": "Label it", "kind": "annotation", "reward_work": 10, "required_submissions": 100})
        self.assertEqual(response.status_code, 201)
        self.assertFalse(response.get_json()["allocation"]["token_contract_deployed"])
        self.assertFalse(response.get_json()["allocation"]["on_chain_payment_created"])
        self.assertEqual(response.get_json()["allocation"]["worker_wwp_payment_capacity"], 1000)

    def test_investor_interest_never_accepts_an_investment(self):
        response = self.client.post("/api/investor-interest", json={"name": "Jordan", "email": "jordan@example.com"})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(investor_interest_records), 1)
        self.assertIn("No funds", response.get_json()["message"])

    def test_voice_submission_rejects_failed_demo_quality_gate(self):
        response = self.client.post("/api/submissions", json={"task_id": "voice-brief-01", "worker_name": "Alex", "response_text": "Test", "consent": {"accepted": True, "policy_version": "2026-08-preview"}, "duration_seconds": 1, "has_mobile_metadata": False, "estimated_snr_db": 10})
        self.assertEqual(response.status_code, 422)

    def test_submission_requires_current_consent(self):
        response = self.client.post("/api/submissions", json={"task_id": "label-brief-02", "worker_name": "Alex", "response_text": "Classified"})
        self.assertEqual(response.status_code, 400)

    def test_onboarding_keeps_external_integrations_disabled(self):
        data = self.client.get("/api/worker/onboarding").get_json()
        self.assertTrue(data["consent"]["required"])
        self.assertFalse(data["uploads"]["enabled"])
        self.assertFalse(data["identity_verification"]["enabled"])
        self.assertFalse(data["settlement"]["enabled"])

    def test_submission_queue_requires_contract_administrator(self):
        self.assertEqual(self.client.get("/api/submissions").status_code, 403)
        self.assertEqual(self.client.get("/api/submissions", headers=self.contract_admin_headers).status_code, 200)

    def test_review_requires_contract_administrator(self):
        created = self.submit_voice()
        submission_id = created.get_json()["submission"]["id"]
        self.assertEqual(self.client.post(f"/api/submissions/{submission_id}/review", json={"decision": "approved"}).status_code, 403)

    def test_approved_submission_creates_ledger_entry(self):
        created = self.submit_voice()
        self.assertEqual(created.status_code, 201)
        submission_id = created.get_json()["submission"]["id"]
        self.assertEqual(self.client.post(f"/api/submissions/{submission_id}/review", headers=self.contract_admin_headers, json={"decision": "approved"}).status_code, 200)
        ledger = self.client.get("/api/ledger").get_json()
        self.assertEqual(ledger["approved_wwp_payment_work"], 12)
        self.assertEqual(len(ledger["entries"]), 1)
        token = self.client.get("/api/token").get_json()
        self.assertEqual(token["network"], "not_deployed")
        self.assertEqual(token["pending_payments"][0]["amount_wwp"], 12)

    def test_token_distribution_records_public_sector_interest_without_sale(self):
        response = self.client.post("/api/token/distribution-requests", json={"purchaser_type": "public_sector", "organization_name": "City Data Office", "contact_email": "buyer@example.gov"})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.get_json()["request"]["status"], "compliance_review_required")
        self.assertFalse(response.get_json()["distribution"]["enabled"])
        self.assertEqual(len(token_sale_requests), 1)

    def test_token_distribution_rejects_unknown_purchaser_type(self):
        response = self.client.post("/api/token/distribution-requests", json={"purchaser_type": "consumer", "organization_name": "Buyer", "contact_email": "buyer@example.com"})
        self.assertEqual(response.status_code, 400)

    def test_future_contract_registration_requires_contract_admin_authorization(self):
        response = self.client.post("/api/future-work-contracts", json={"contract_reference": "MSA-2026-01", "client_name": "Northstar Labs", "committed_work": 500})
        self.assertEqual(response.status_code, 403)

    def test_future_contract_adds_unissued_backing_capacity(self):
        response = self.client.post("/api/future-work-contracts", headers=self.contract_admin_headers, json={"contract_reference": "MSA-2026-01", "client_name": "Northstar Labs", "committed_work": 500})
        self.assertEqual(response.status_code, 201)
        backing = response.get_json()["backing"]
        self.assertEqual(backing["future_contracted_work"], 500)
        self.assertEqual(backing["maximum_backed_wwp"], 500)
        self.assertEqual(backing["unissued_backing_wwp"], 500)

    def test_contracted_task_cannot_exceed_unallocated_contract_volume(self):
        contract = self.client.post("/api/future-work-contracts", headers=self.contract_admin_headers, json={"contract_reference": "MSA-2026-01", "client_name": "Northstar Labs", "committed_work": 20}).get_json()["contract"]
        payload = {"client_name": "Northstar Labs", "title": "A task", "instructions": "Label it", "kind": "annotation", "reward_work": 10, "required_submissions": 3, "future_contract_id": contract["id"]}
        self.assertEqual(self.client.post("/api/client/tasks", headers=self.contract_admin_headers, json=payload).status_code, 409)

    def test_contract_backing_moves_to_completed_work_after_approval(self):
        contract = self.client.post("/api/future-work-contracts", headers=self.contract_admin_headers, json={"contract_reference": "MSA-2026-01", "client_name": "Northstar Labs", "committed_work": 20}).get_json()["contract"]
        task = self.client.post("/api/client/tasks", headers=self.contract_admin_headers, json={"client_name": "Northstar Labs", "title": "A task", "instructions": "Label it", "kind": "annotation", "reward_work": 10, "required_submissions": 2, "future_contract_id": contract["id"]}).get_json()["task"]
        submission = self.client.post("/api/submissions", json={"task_id": task["id"], "worker_name": "Alex", "response_text": "Complete", "consent": {"accepted": True, "policy_version": "2026-08-preview"}}).get_json()["submission"]
        self.assertEqual(self.client.post(f"/api/submissions/{submission['id']}/review", headers=self.contract_admin_headers, json={"decision": "approved"}).status_code, 200)
        backing = self.client.get("/api/future-work-contracts").get_json()["backing"]
        self.assertEqual(backing["completed_work"], 10)
        self.assertEqual(backing["future_contracted_work"], 10)
        self.assertEqual(backing["maximum_backed_wwp"], 20)

    def test_future_contract_reference_cannot_be_registered_twice(self):
        payload = {"contract_reference": "MSA-2026-01", "client_name": "Northstar Labs", "committed_work": 500}
        self.assertEqual(self.client.post("/api/future-work-contracts", headers=self.contract_admin_headers, json=payload).status_code, 201)
        self.assertEqual(self.client.post("/api/future-work-contracts", headers=self.contract_admin_headers, json=payload).status_code, 409)

    def test_cancelling_future_contract_removes_only_future_capacity(self):
        created = self.client.post("/api/future-work-contracts", headers=self.contract_admin_headers, json={"contract_reference": "MSA-2026-01", "client_name": "Northstar Labs", "committed_work": 500})
        contract_id = created.get_json()["contract"]["id"]
        response = self.client.post(f"/api/future-work-contracts/{contract_id}/cancel", headers=self.contract_admin_headers)
        self.assertEqual(response.status_code, 200)
        backing = response.get_json()["backing"]
        self.assertEqual(backing["future_contracted_work"], 0)
        self.assertEqual(backing["maximum_backed_wwp"], 0)

    def test_training_manifest_requires_admin_and_only_includes_approved_consent_records(self):
        created = self.submit_voice()
        submission_id = created.get_json()["submission"]["id"]
        self.assertEqual(self.client.get("/api/training/manifest").status_code, 403)
        self.assertEqual(self.client.get("/api/training/manifest", headers=self.contract_admin_headers).get_json()["records"], [])
        self.assertEqual(self.register_contribution(submission_id).status_code, 201)
        self.assertEqual(self.client.post(f"/api/submissions/{submission_id}/review", headers=self.contract_admin_headers, json={"decision": "approved"}).status_code, 200)
        records = self.client.get("/api/training/manifest", headers=self.contract_admin_headers).get_json()["records"]
        self.assertEqual(records[0]["submission_id"], submission_id)
        self.assertEqual(records[0]["storage_reference"], f"blob://private/contributions/{submission_id}")

    def test_training_run_requires_approved_contribution_and_stays_external(self):
        self.assertEqual(self.client.post("/api/training/runs", headers=self.contract_admin_headers).status_code, 409)
        created = self.submit_voice()
        submission_id = created.get_json()["submission"]["id"]
        self.register_contribution(submission_id)
        self.client.post(f"/api/submissions/{submission_id}/review", headers=self.contract_admin_headers, json={"decision": "approved"})
        response = self.client.post("/api/training/runs", headers=self.contract_admin_headers)
        self.assertEqual(response.status_code, 201)
        run = response.get_json()["training_run"]
        self.assertEqual(run["status"], "awaiting_private_pipeline")
        self.assertIsNone(run["model_artifact"])

    def test_contribution_reference_requires_pending_consented_submission(self):
        self.assertEqual(self.client.post("/api/contributions", json={}).status_code, 409)
        submission = self.submit_voice().get_json()["submission"]
        self.assertEqual(self.register_contribution(submission["id"]).status_code, 201)
        self.assertEqual(self.register_contribution(submission["id"]).status_code, 409)

    def test_testnet_payout_batch_records_oracle_transaction_without_signing(self):
        with patch.object(PlatformConfig, "BASE_SEPOLIA_SETTLEMENT_ENABLED", True), patch.object(PlatformConfig, "ETHEREUM_CONTRACT_ADDRESS", "0x0000000000000000000000000000000000000001"):
            created = self.submit_voice()
            submission_id = created.get_json()["submission"]["id"]
            self.client.post(f"/api/submissions/{submission_id}/review", headers=self.contract_admin_headers, json={"decision": "approved"})
            batch_response = self.client.post("/api/payout-batches", headers=self.contract_admin_headers)
            self.assertEqual(batch_response.status_code, 201)
            batch_id = batch_response.get_json()["payout_batch"]["id"]
            submitted = self.client.post(f"/api/payout-batches/{batch_id}/submit", headers=self.contract_admin_headers, json={"transaction_hash": "0x" + "b" * 64})
            self.assertEqual(submitted.status_code, 200)
            self.assertEqual(submitted.get_json()["payout_batch"]["status"], "oracle_submitted")

    def test_demo_advance_is_repaid_before_earned_work(self):
        self.assertEqual(self.client.post("/api/workers/Alex/advance", json={"amount_work": 10}).status_code, 201)
        created = self.submit_voice("Alex")
        submission_id = created.get_json()["submission"]["id"]
        self.client.post(f"/api/submissions/{submission_id}/review", headers=self.contract_admin_headers, json={"decision": "approved"})
        self.assertEqual(worker_accounts["Alex"]["advance_debt_work"], 0)
        self.assertEqual(worker_accounts["Alex"]["earned_work"], 3)
        self.assertEqual(token_issuances[0]["amount_wwp"], 3)

    def test_worker_overview_is_preview_only(self):
        response = self.client.get("/api/worker/overview")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["data_mode"], "preview")
        self.assertFalse(data["settlement"]["enabled"])

    def test_webhook_is_unavailable_without_a_secret(self):
        with patch("app.STRIPE_WEBHOOK_SECRET", ""):
            self.assertEqual(self.client.post("/api/stripe/webhook").status_code, 503)


if __name__ == "__main__":
    unittest.main()
