import os
import secrets
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

import stripe
from flask import Flask, jsonify, render_template, request

from config import PlatformConfig

app = Flask(__name__, template_folder="templates")
app.config.from_object(PlatformConfig)
STRIPE_PUBLIC_KEY = PlatformConfig.STRIPE_PUBLIC_KEY
STRIPE_WEBHOOK_SECRET = PlatformConfig.STRIPE_WEBHOOK_SECRET

# In-memory demo only: use authenticated roles, a durable database, consent records,
# private object storage, and a regulated payout partner before production.
tasks = [
    {"id": "voice-brief-01", "client_name": "Northstar Labs", "title": "Localized product phrase", "instructions": "Read the generated phrase naturally in a quiet setting.", "reward_work": 12, "status": "open", "kind": "voice", "required_submissions": 100, "submitted_count": 0, "funding_usdc": 12.00, "voucher_sponsor": "Northstar Labs", "future_contract_id": None},
    {"id": "label-brief-02", "client_name": "Northstar Labs", "title": "Classify a support message", "instructions": "Choose the category that best matches the message.", "reward_work": 6, "status": "open", "kind": "annotation", "required_submissions": 50, "submitted_count": 0, "funding_usdc": 3.00, "voucher_sponsor": "Northstar Labs", "future_contract_id": None},
]
submissions = []
ledger_entries = []
token_issuances = []
future_work_contracts = []
investor_interest_records = []
worker_accounts = {}
PROMPT_PHRASES = ["The maple train arrives at sunrise.", "Blue lanterns shine over the market.", "A quiet river follows the stone bridge."]


def now():
    return datetime.now(timezone.utc).isoformat()


def configured_multiplier() -> Decimal:
    return PlatformConfig.payout_multiplier()


def public_task(task):
    return {key: task[key] for key in ("id", "client_name", "title", "instructions", "reward_work", "status", "kind", "required_submissions", "submitted_count", "funding_usdc", "voucher_sponsor", "future_contract_id")}


def contract_volume_summary():
    contracted = sum(contract["remaining_work"] for contract in future_work_contracts if contract["status"] == "contracted")
    completed = sum(item["credit_work"] for item in ledger_entries if item["type"] == "approved_work")
    issued = sum(item["amount_wwp"] for item in token_issuances)
    return {"completed_work": completed, "future_contracted_work": contracted, "maximum_backed_wwp": completed + contracted, "issued_wwp": issued, "unissued_backing_wwp": completed + contracted - issued}


def get_worker(worker_name):
    return worker_accounts.setdefault(worker_name, {"earned_work": 0, "advance_debt_work": 0, "has_active_advance": False})


def contract_admin_authorized():
    expected_key = app.config.get("CONTRACT_ADMIN_API_KEY", "")
    supplied_key = request.headers.get("X-Contract-Admin-Key", "")
    return bool(expected_key) and secrets.compare_digest(supplied_key, expected_key)


@app.get("/")
def serve_dashboard():
    return render_template("index.html", stripe_public_key=STRIPE_PUBLIC_KEY)


@app.get("/health")
def system_health():
    return jsonify(status="ok", service="worx"), 200


@app.get("/api/tasks")
def list_tasks():
    return jsonify(data_mode="demo", tasks=[public_task(task) for task in tasks])


@app.post("/api/client/tasks")
def create_client_task():
    payload = request.get_json(silent=True)
    required = ("client_name", "title", "instructions", "kind", "reward_work", "required_submissions")
    if not isinstance(payload, dict) or any(not payload.get(key) for key in required):
        return jsonify(success=False, error="client_name, title, instructions, kind, reward_work, and required_submissions are required"), 400
    if payload["kind"] not in {"voice", "annotation"}:
        return jsonify(success=False, error="kind must be voice or annotation"), 400
    try:
        reward = int(payload["reward_work"])
        quantity = int(payload["required_submissions"])
    except (TypeError, ValueError):
        return jsonify(success=False, error="reward_work and required_submissions must be whole numbers"), 400
    if not 1 <= reward <= 1000 or not 1 <= quantity <= 100000:
        return jsonify(success=False, error="reward_work or required_submissions is outside the demo limit"), 400
    future_contract_id = payload.get("future_contract_id")
    future_contract = None
    if future_contract_id:
        if not contract_admin_authorized():
            return jsonify(success=False, error="Contract administrator authorization is required to allocate contracted work"), 403
        future_contract = next((item for item in future_work_contracts if item["id"] == future_contract_id and item["status"] == "contracted"), None)
        if future_contract is None:
            return jsonify(success=False, error="future_contract_id must reference an active future work contract"), 400
        requested_work = reward * quantity
        available_work = future_contract["remaining_work"] - future_contract["allocated_work"]
        if requested_work > available_work:
            return jsonify(success=False, error="The future work contract has insufficient unallocated work volume"), 409
    # Demo accounting only: 60% corporate-voucher pool / 40% owner USDC reserve.
    funding = (Decimal(reward) * Decimal(quantity) / Decimal("100"))
    task = {"id": str(uuid4()), "client_name": payload["client_name"].strip()[:80], "title": payload["title"].strip()[:120], "instructions": payload["instructions"].strip()[:1000], "reward_work": reward, "status": "open", "kind": payload["kind"], "required_submissions": quantity, "submitted_count": 0, "funding_usdc": float(funding), "voucher_sponsor": payload["client_name"].strip()[:80], "future_contract_id": future_contract_id, "created_at": now()}
    if future_contract is not None:
        future_contract["allocated_work"] += reward * quantity
    tasks.insert(0, task)
    return jsonify(success=True, data_mode="demo", task=public_task(task), allocation={"client_contract_usdc": float(funding), "worker_voucher_pool_usdc_equivalent": float(funding * Decimal("0.60")), "owner_usdc_reserve": float(funding * Decimal("0.40")), "usdc_transfer_created": False, "voucher_issued": False}), 201


@app.post("/api/future-work-contracts")
def register_future_work_contract():
    """Registers enforceable future work capacity for the testnet backing ledger.

    Production must restrict this route to an authorized contract administrator and
    retain the signed agreement outside the public API.
    """
    if not contract_admin_authorized():
        return jsonify(success=False, error="Contract administrator authorization is required"), 403
    payload = request.get_json(silent=True)
    required = ("contract_reference", "client_name", "committed_work")
    if not isinstance(payload, dict) or any(not payload.get(key) for key in required):
        return jsonify(success=False, error="contract_reference, client_name, and committed_work are required"), 400
    try:
        committed_work = int(payload["committed_work"])
    except (TypeError, ValueError):
        return jsonify(success=False, error="committed_work must be a whole number"), 400
    if not 1 <= committed_work <= 1000000:
        return jsonify(success=False, error="committed_work is outside the demo limit"), 400
    contract_reference = str(payload["contract_reference"]).strip()
    if not 1 <= len(contract_reference) <= 120:
        return jsonify(success=False, error="contract_reference must contain 1 to 120 characters"), 400
    if any(item["contract_reference"] == contract_reference for item in future_work_contracts):
        return jsonify(success=False, error="contract_reference has already been registered"), 409
    contract = {"id": str(uuid4()), "contract_reference": contract_reference, "client_name": str(payload["client_name"]).strip()[:80], "committed_work": committed_work, "remaining_work": committed_work, "allocated_work": 0, "status": "contracted", "created_at": now(), "expires_at": payload.get("expires_at")}
    future_work_contracts.insert(0, contract)
    return jsonify(success=True, data_mode="demo", contract=contract, backing=contract_volume_summary(), note="A signed agreement, client funding verification, administrator authorization, and durable storage are required before production use."), 201


@app.post("/api/future-work-contracts/<contract_id>/cancel")
def cancel_future_work_contract(contract_id):
    if not contract_admin_authorized():
        return jsonify(success=False, error="Contract administrator authorization is required"), 403
    contract = next((item for item in future_work_contracts if item["id"] == contract_id), None)
    if contract is None:
        return jsonify(success=False, error="Future work contract not found"), 404
    if contract["status"] != "contracted":
        return jsonify(success=False, error="Only active future work contracts can be cancelled"), 409
    if contract["allocated_work"]:
        return jsonify(success=False, error="A future work contract with allocated tasks cannot be cancelled"), 409
    if token_issuances and sum(item["amount_wwp"] for item in token_issuances) > contract_volume_summary()["completed_work"]:
        return jsonify(success=False, error="Cancellation would leave issued tokens above approved-work backing"), 409
    contract["status"] = "cancelled"; contract["cancelled_at"] = now()
    return jsonify(success=True, data_mode="demo", contract=contract, backing=contract_volume_summary(), note="Cancellation removes only unfulfilled future capacity; it never changes approved-work records or past token issuance."), 200


@app.get("/api/future-work-contracts")
def list_future_work_contracts():
    return jsonify(data_mode="demo", contracts=future_work_contracts, backing=contract_volume_summary())


@app.get("/api/tasks/<task_id>/prompt")
def generate_voice_prompt(task_id):
    task = next((item for item in tasks if item["id"] == task_id and item["kind"] == "voice" and item["status"] == "open"), None)
    if task is None:
        return jsonify(success=False, error="An open voice task was not found"), 404
    return jsonify(data_mode="demo", task_id=task_id, prompt=secrets.choice(PROMPT_PHRASES), expires_note="Production prompts need server-side expiry and a one-time claim." )


@app.get("/api/submissions")
def list_submissions():
    return jsonify(data_mode="demo", submissions=submissions)


@app.post("/api/submissions")
def create_submission():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(success=False, error="A JSON request body is required"), 400
    task = next((item for item in tasks if item["id"] == payload.get("task_id") and item["status"] == "open"), None)
    worker_name = payload.get("worker_name")
    response_text = payload.get("response_text")
    if task is None: return jsonify(success=False, error="Choose an available task"), 400
    if not isinstance(worker_name, str) or not worker_name.strip(): return jsonify(success=False, error="worker_name is required"), 400
    if not isinstance(response_text, str) or not response_text.strip() or len(response_text.strip()) > 2000: return jsonify(success=False, error="response_text must contain 1 to 2,000 characters"), 400
    quality = {"status": "not_required", "checks": []}
    if task["kind"] == "voice":
        duration = payload.get("duration_seconds")
        has_mobile_metadata = payload.get("has_mobile_metadata")
        estimated_snr = payload.get("estimated_snr_db")
        if not isinstance(duration, (int, float)) or not isinstance(has_mobile_metadata, bool) or not isinstance(estimated_snr, (int, float)):
            return jsonify(success=False, error="Voice demo requires duration_seconds, has_mobile_metadata, and estimated_snr_db"), 400
        passed = duration >= 1.5 and has_mobile_metadata and estimated_snr >= 15
        quality = {"status": "passed" if passed else "needs_rerecord", "checks": [{"name": "minimum duration", "passed": duration >= 1.5}, {"name": "mobile metadata", "passed": has_mobile_metadata}, {"name": "signal-to-noise estimate", "passed": estimated_snr >= 15}], "note": "Demo signals supplied by the client; no file or metadata is inspected."}
        if not passed: return jsonify(success=False, error="Demo quality gate requests a re-recording", quality=quality), 422
    account = get_worker(worker_name.strip())
    multiplier = configured_multiplier() if account["has_active_advance"] else Decimal("1.00")
    final_reward = int(Decimal(task["reward_work"]) * multiplier)
    submission = {"id": str(uuid4()), "task_id": task["id"], "task_title": task["title"], "worker_name": worker_name.strip(), "response_text": response_text.strip(), "reward_work": task["reward_work"], "multiplier": float(multiplier), "final_reward_work": final_reward, "quality": quality, "status": "pending_review", "submitted_at": now()}
    submissions.insert(0, submission); task["submitted_count"] += 1
    return jsonify(success=True, data_mode="demo", submission=submission), 201


@app.post("/api/submissions/<submission_id>/review")
def review_submission(submission_id):
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict) or payload.get("decision") not in {"approved", "needs_revision", "rejected"}: return jsonify(success=False, error="decision must be approved, needs_revision, or rejected"), 400
    submission = next((item for item in submissions if item["id"] == submission_id), None)
    if submission is None: return jsonify(success=False, error="Submission not found"), 404
    if submission["status"] != "pending_review": return jsonify(success=False, error="Only pending submissions can be reviewed"), 409
    submission["status"] = payload["decision"]; submission["reviewed_at"] = now()
    if payload["decision"] == "approved":
        account = get_worker(submission["worker_name"]); reward = submission["final_reward_work"]
        task = next(item for item in tasks if item["id"] == submission["task_id"])
        if task["future_contract_id"]:
            future_contract = next((item for item in future_work_contracts if item["id"] == task["future_contract_id"] and item["status"] == "contracted"), None)
            if future_contract is None or future_contract["allocated_work"] < reward or future_contract["remaining_work"] < reward:
                return jsonify(success=False, error="The linked future work contract cannot support this approval"), 409
            future_contract["allocated_work"] -= reward
            future_contract["remaining_work"] -= reward
        debt_paid = min(reward, account["advance_debt_work"]); account["advance_debt_work"] -= debt_paid; account["has_active_advance"] = account["advance_debt_work"] > 0; account["earned_work"] += reward - debt_paid
        ledger_entries.insert(0, {"id": str(uuid4()), "worker_name": submission["worker_name"], "submission_id": submission_id, "type": "approved_work", "credit_work": reward, "debt_repayment_work": debt_paid, "created_at": now()})
        if reward > debt_paid:
            token_issuances.insert(0, {"submission_id": submission_id, "worker_name": submission["worker_name"], "amount_wwp": reward - debt_paid, "status": "pending_testnet_oracle", "created_at": now()})
    return jsonify(success=True, data_mode="demo", submission=submission)


@app.post("/api/workers/<worker_name>/advance")
def request_demo_advance(worker_name):
    payload = request.get_json(silent=True) or {}
    amount = payload.get("amount_work")
    if not isinstance(amount, int) or not 1 <= amount <= 500: return jsonify(success=False, error="amount_work must be a whole number from 1 to 500"), 400
    account = get_worker(worker_name); account["advance_debt_work"] += amount; account["has_active_advance"] = True
    ledger_entries.insert(0, {"id": str(uuid4()), "worker_name": worker_name, "type": "demo_advance", "credit_work": -amount, "debt_repayment_work": 0, "created_at": now()})
    return jsonify(success=True, data_mode="demo", account=account, note="No voucher is created or issued."), 201


@app.get("/api/ledger")
def worker_ledger():
    approved = sum(item["credit_work"] for item in ledger_entries if item["type"] == "approved_work")
    pending = sum(item["final_reward_work"] for item in submissions if item["status"] == "pending_review")
    return jsonify(data_mode="demo", approved_voucher_credits=approved, pending_voucher_credits=pending, estimated_voucher_value_usdc=float(Decimal(approved) / Decimal("100")), entries=ledger_entries, note="Demo ledger only. This application does not transfer USDC or issue corporate vouchers.")


@app.post("/api/investor-interest")
def register_investor_interest():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(success=False, error="A JSON request body is required"), 400
    name = payload.get("name")
    email = payload.get("email")
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80:
        return jsonify(success=False, error="name must contain 1 to 80 characters"), 400
    if not isinstance(email, str) or len(email.strip()) > 254 or "@" not in email:
        return jsonify(success=False, error="a valid email address is required"), 400
    investor_interest_records.append({"id": str(uuid4()), "name": name.strip(), "email": email.strip().lower(), "status": "interest_registered", "created_at": now()})
    return jsonify(success=True, data_mode="demo", message="Interest registered. No funds, tokens, ownership rights, or investment commitments were accepted."), 201


@app.get("/api/token")
def work_proof_token():
    return jsonify(data_mode="demo", network="not_deployed", standard="ERC-20", name="Worx Work Proof", symbol="WWP", decimals=0, issuance_basis="one WWP per approved work credit; aggregate supply must not exceed approved work plus active contracted future work", issuance=token_issuances, backing=contract_volume_summary(), note="Testnet prototype only. No token contract is deployed, minted, transferable, or redeemable by this application.")


@app.get("/api/owner/balance")
def corporate_balance_sheet():
    funding = sum(Decimal(str(item["funding_usdc"])) for item in tasks)
    return jsonify(data_mode="demo", client_contract_value_usdc=float(funding), worker_voucher_pool_usdc_equivalent=float(funding * Decimal("0.60")), owner_usdc_reserve=float(funding * Decimal("0.40")), usdc_transfers_received=False)


@app.post("/api/stripe/webhook")
def intake_stripe_events():
    if not STRIPE_WEBHOOK_SECRET: return jsonify(error="Stripe webhook is not configured"), 503
    signature = request.headers.get("Stripe-Signature")
    if not signature: return jsonify(error="Missing Stripe-Signature header"), 400
    try: stripe.Webhook.construct_event(request.get_data(), signature, STRIPE_WEBHOOK_SECRET)
    except (ValueError, stripe.error.SignatureVerificationError): return jsonify(error="Invalid Stripe webhook signature"), 400
    return jsonify(received=True), 200


if __name__ == "__main__": app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")))
