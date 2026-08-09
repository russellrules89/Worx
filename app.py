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
token_sale_requests = []
investor_interest_records = []
worker_accounts = {}
PROMPT_PHRASES = ["The maple train arrives at sunrise.", "Blue lanterns shine over the market.", "A quiet river follows the stone bridge."]
SYNTHETIC_ANNOTATION_EXAMPLES = [
    ("Classify the message: ‘I cannot reset my password.’", "Account access"),
    ("Classify the message: ‘My order arrived with a broken part.’", "Damaged order"),
    ("Classify the message: ‘Where can I download my invoice?’", "Billing document"),
]


def synthetic_task_provenance(task):
    return task.get("provenance", {"source": "client-provided", "synthetic": False})


def now():
    return datetime.now(timezone.utc).isoformat()


def configured_multiplier() -> Decimal:
    return PlatformConfig.payout_multiplier()


def public_task(task):
    fields = ("id", "client_name", "title", "instructions", "reward_work", "status", "kind", "required_submissions", "submitted_count", "funding_usdc", "voucher_sponsor", "future_contract_id")
    return {**{key: task[key] for key in fields}, "provenance": synthetic_task_provenance(task)}


def contract_volume_summary():
    contracted = sum(contract["remaining_work"] for contract in future_work_contracts if contract["status"] == "contracted")
    completed = sum(item["credit_work"] for item in ledger_entries if item["type"] == "approved_work")
    issued = sum(item["amount_wwp"] for item in token_issuances)
    return {"completed_work": completed, "future_contracted_work": contracted, "maximum_backed_wwp": completed + contracted, "issued_wwp": issued, "unissued_backing_wwp": completed + contracted - issued}


def get_worker(worker_name):
    return worker_accounts.setdefault(worker_name, {"earned_work": 0, "advance_debt_work": 0, "has_active_advance": False})


def valid_wallet_address(value):
    return isinstance(value, str) and len(value) == 42 and value.startswith("0x") and all(char in "0123456789abcdefABCDEF" for char in value[2:])


def settlement_status():
    """Expose only settlement readiness; transaction signing stays in an isolated oracle."""
    configured = bool(
        PlatformConfig.TESTNET_SETTLEMENT_ENABLED
        and valid_wallet_address(PlatformConfig.ETHEREUM_CONTRACT_ADDRESS)
        and str(PlatformConfig.EVM_TESTNET_CHAIN_ID).isdigit()
        and int(PlatformConfig.EVM_TESTNET_CHAIN_ID) > 0
        and PlatformConfig.EVM_NETWORK_NAME
    )
    return {
        "enabled": configured,
        "environment": "testnet" if configured else "not_configured",
        "network": PlatformConfig.EVM_NETWORK_NAME or None,
        "chain_id": PlatformConfig.EVM_TESTNET_CHAIN_ID or None,
        "contract": PlatformConfig.ETHEREUM_CONTRACT_ADDRESS or None,
        "standard": "ERC-20",
        "cashout": {
            "available": False,
            "minimum_work": PlatformConfig.MINIMUM_CASHOUT_WORK,
            "reason": "An ERC-20 transfer is not a cash-out. A licensed redemption or off-ramp provider, KYC/AML, sanctions screening, tax handling, and reserve policy must be configured before fiat redemption is offered.",
        },
        "oracle_required": True,
    }


def token_sale_status():
    return {"enabled": False, "launch_gate_configured": PlatformConfig.TOKEN_SALE_ENABLED, "asset": "WWP", "network": "not_deployed", "purchaser_categories": ["public_sector", "private_sector"], "payment_processing": False, "note": "Sales remain disabled: setting the launch gate alone cannot enable a sale. Legal, KYC/AML, tax, custody, sanctions, jurisdictional controls, payment processing, and a deployed contract are required."}


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


@app.get("/api/worker/overview")
def worker_overview():
    """Preview-only portal summary; no work, reward, or settlement is processed."""
    return jsonify(
        data_mode="preview",
        contributions=[
            {"id": "sample-001", "type": "Audio annotation", "status": "Awaiting validation", "reward": "Not calculated"},
            {"id": "sample-002", "type": "Data annotation", "status": "Ready to contribute", "reward": "Not calculated"},
        ],
        reward_policy="Rewards are only calculated after server-side validation and remain off-chain until a configured testnet settlement process is approved.",
        settlement=settlement_status(),
    )


@app.get("/api/worker/onboarding")
def worker_onboarding():
    return jsonify(
        data_mode="preview",
        consent={"required": True, "policy_version": PlatformConfig.CONSENT_POLICY_VERSION, "purpose": "Validate task contributions and calculate off-chain reward eligibility.", "retention": "A retention policy and storage provider must be configured before file uploads are accepted."},
        identity_verification={"enabled": False, "provider": None, "note": "No identity document or biometric data is collected until an approved provider and privacy workflow are configured."},
        uploads={"enabled": False, "note": "File uploads are disabled until private object storage, malware scanning, and retention controls are configured."},
        settlement={**settlement_status(), "note": "No wallet payout or blockchain transaction is created by this application. The oracle signs approved testnet mint batches only after deployment and authorization are configured."},
    )


@app.post("/api/assistant")
def portal_assistant():
    """Provide scoped navigation help; model access is optional and never receives contribution files."""
    payload = request.get_json(silent=True)
    message = payload.get("message", "") if isinstance(payload, dict) else ""
    if not isinstance(message, str) or not message.strip() or len(message.strip()) > 500:
        return jsonify(success=False, error="message must contain 1 to 500 characters"), 400

    settlement = settlement_status()
    gateway_key = PlatformConfig.AI_GATEWAY_API_KEY or os.environ.get("VERCEL_OIDC_TOKEN", "")
    if gateway_key and PlatformConfig.AI_GATEWAY_MODEL:
        try:
            from openai import OpenAI
            system_prompt = """You are the Worx portal guide. Help contributors navigate only this portal: tasks, consent, wallet connection, rewards, and testnet settlement. Be concise and accurate. Never ask for recovery phrases, passwords, private keys, identity documents, or contribution content. Do not promise payments or cash-out. ERC-20 transfers are not fiat cash-out; any redemption requires a compliant provider. If a feature is unavailable, state that plainly and point to the next available step."""
            context = f"Current portal state: uploads={False}; identity_verification={False}; settlement_enabled={settlement['enabled']}; network={settlement['network']}; cashout_available={settlement['cashout']['available']}."
            client = OpenAI(api_key=gateway_key, base_url="https://ai-gateway.vercel.sh/v1")
            completion = client.chat.completions.create(
                model=PlatformConfig.AI_GATEWAY_MODEL,
                messages=[{"role": "system", "content": system_prompt}, {"role": "system", "content": context}, {"role": "user", "content": message.strip()}],
                max_tokens=180,
            )
            reply = completion.choices[0].message.content
            if reply:
                return jsonify(success=True, assistant="Worx AI guide", mode="ai", reply=reply, action="help", settlement=settlement)
        except Exception:
            # Preserve basic navigation when the optional model integration is unavailable.
            pass

    text = message.lower()
    if any(term in text for term in ("wallet", "connect", "metamask")):
        reply = "Use Connect wallet in the header, then approve the connection in your wallet. Connecting a wallet does not create a payment or cash-out."
        action = "wallet"
    elif any(term in text for term in ("earn", "reward", "paid", "payment")):
        reply = "Choose a contribution, accept the current consent terms, and submit it. Rewards are recorded only after server-side review; pending work is not earned work."
        action = "tasks"
    elif any(term in text for term in ("cash", "withdraw", "redeem", "erc", "crypto", "token")):
        reply = settlement["cashout"]["reason"]
        action = "settlement"
    elif any(term in text for term in ("voice", "record", "audio")):
        reply = "Voice contributions require consent and server-side quality checks. The current preview does not accept audio uploads."
        action = "tasks"
    elif any(term in text for term in ("consent", "privacy", "data")):
        reply = "Only submit data requested by the task. Current consent is required, and uploads remain unavailable until private storage, scanning, and retention controls are configured."
        action = "consent"
    else:
        reply = "I can help you find tasks, explain consent, connect a wallet, understand rewards, or check settlement status. Try: ‘How do rewards work?’"
        action = "help"
    return jsonify(success=True, assistant="Worx guide", mode="guided", reply=reply, action=action, settlement=settlement)


@app.post("/api/uploads/session")
def create_upload_session():
    return jsonify(success=False, error="Uploads are not configured. Set up private storage, scanning, retention, and consent controls before accepting files."), 503


@app.get("/api/tasks")
def list_tasks():
    return jsonify(data_mode="demo", tasks=[public_task(task) for task in tasks if task["status"] == "open"])


@app.post("/api/synthetic-tasks")
def generate_synthetic_task():
    """Generate a review-only task with explicit provenance; no model output is paid by default."""
    if not contract_admin_authorized():
        return jsonify(success=False, error="Contract administrator authorization is required"), 403
    payload = request.get_json(silent=True) or {}
    kind = payload.get("kind")
    if kind not in {"annotation", "voice"}:
        return jsonify(success=False, error="kind must be annotation or voice"), 400
    if kind == "annotation":
        prompt, expected_label = secrets.choice(SYNTHETIC_ANNOTATION_EXAMPLES)
        title = "Synthetic support-message classification"
        instructions = f"{prompt} Use the expected category schema. Reference label for reviewer: {expected_label}."
    else:
        prompt = secrets.choice(PROMPT_PHRASES)
        title = "Synthetic voice-script review"
        instructions = f"Review this synthetic voice script for clarity and safety before recording: ‘{prompt}’"
    task = {
        "id": str(uuid4()), "client_name": "Worx synthetic-data lab", "title": title,
        "instructions": instructions, "reward_work": 0, "status": "draft_review",
        "kind": kind, "required_submissions": 0, "submitted_count": 0, "funding_usdc": 0.0,
        "voucher_sponsor": None, "future_contract_id": None, "created_at": now(),
        "provenance": {"source": "template-generator", "synthetic": True, "generated_at": now(), "prompt": prompt, "human_review_required": True, "eligible_for_rewards": False},
    }
    tasks.insert(0, task)
    return jsonify(success=True, data_mode="demo", task=public_task(task), note="Generated data is draft-only. An administrator must verify quality, rights, intended use, and contracted funding before publishing a reward-eligible task."), 201


@app.post("/api/synthetic-tasks/<task_id>/publish")
def publish_synthetic_task(task_id):
    """Publish reviewed synthetic work only against an active contracted-work allocation."""
    if not contract_admin_authorized():
        return jsonify(success=False, error="Contract administrator authorization is required"), 403
    payload = request.get_json(silent=True) or {}
    task = next((item for item in tasks if item["id"] == task_id and item.get("provenance", {}).get("synthetic")), None)
    if task is None: return jsonify(success=False, error="Synthetic draft task not found"), 404
    if task["status"] != "draft_review": return jsonify(success=False, error="Only draft synthetic tasks can be published"), 409
    future_contract = next((item for item in future_work_contracts if item["id"] == payload.get("future_contract_id") and item["status"] == "contracted"), None)
    try:
        reward, quantity = int(payload.get("reward_work")), int(payload.get("required_submissions"))
    except (TypeError, ValueError):
        return jsonify(success=False, error="reward_work and required_submissions must be whole numbers"), 400
    if future_contract is None or not 1 <= reward <= 1000 or not 1 <= quantity <= 100000:
        return jsonify(success=False, error="An active future_contract_id and valid reward_work and required_submissions are required"), 400
    allocation = reward * quantity
    if allocation > future_contract["remaining_work"] - future_contract["allocated_work"]:
        return jsonify(success=False, error="The future work contract has insufficient unallocated work volume"), 409
    future_contract["allocated_work"] += allocation
    task.update({"status": "open", "reward_work": reward, "required_submissions": quantity, "funding_usdc": float(Decimal(allocation) / Decimal("100")), "voucher_sponsor": future_contract["client_name"], "future_contract_id": future_contract["id"]})
    task["provenance"].update({"human_review_required": False, "reviewed_at": now(), "eligible_for_rewards": True, "funding_reference": future_contract["contract_reference"]})
    return jsonify(success=True, data_mode="demo", task=public_task(task), note="Published only after review and contracted-work allocation. Issuance remains testnet-only and subject to approved-submission validation."), 200


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
    # Demo accounting only: prospective WWP work-payment capacity / owner USDC reserve.
    funding = (Decimal(reward) * Decimal(quantity) / Decimal("100"))
    task = {"id": str(uuid4()), "client_name": payload["client_name"].strip()[:80], "title": payload["title"].strip()[:120], "instructions": payload["instructions"].strip()[:1000], "reward_work": reward, "status": "open", "kind": payload["kind"], "required_submissions": quantity, "submitted_count": 0, "funding_usdc": float(funding), "voucher_sponsor": payload["client_name"].strip()[:80], "future_contract_id": future_contract_id, "created_at": now()}
    if future_contract is not None:
        future_contract["allocated_work"] += reward * quantity
    tasks.insert(0, task)
    return jsonify(success=True, data_mode="demo", task=public_task(task), allocation={"client_contract_usdc": float(funding), "worker_wwp_payment_capacity": reward * quantity, "owner_usdc_reserve": float(funding * Decimal("0.40")), "on_chain_payment_created": False, "token_contract_deployed": False}), 201


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
    if not contract_admin_authorized(): return jsonify(success=False, error="Contract administrator authorization is required"), 403
    return jsonify(data_mode="demo", submissions=submissions)


@app.post("/api/submissions")
def create_submission():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(success=False, error="A JSON request body is required"), 400
    task = next((item for item in tasks if item["id"] == payload.get("task_id") and item["status"] == "open"), None)
    worker_name = payload.get("worker_name")
    wallet_address = payload.get("wallet_address")
    response_text = payload.get("response_text")
    consent = payload.get("consent")
    if task is None: return jsonify(success=False, error="Choose an available task"), 400
    if not isinstance(consent, dict) or consent.get("accepted") is not True or consent.get("policy_version") != PlatformConfig.CONSENT_POLICY_VERSION:
        return jsonify(success=False, error="Current contribution consent is required"), 400
    if not isinstance(worker_name, str) or not worker_name.strip(): return jsonify(success=False, error="worker_name is required"), 400
    if wallet_address is not None and not valid_wallet_address(wallet_address): return jsonify(success=False, error="wallet_address must be a valid EVM address when provided"), 400
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
    submission = {"id": str(uuid4()), "task_id": task["id"], "task_title": task["title"], "worker_name": worker_name.strip(), "wallet_address": wallet_address, "response_text": response_text.strip(), "consent": {"policy_version": PlatformConfig.CONSENT_POLICY_VERSION, "accepted_at": now()}, "identity_verification": "not_configured", "reward_work": task["reward_work"], "multiplier": float(multiplier), "final_reward_work": final_reward, "quality": quality, "status": "pending_review", "submitted_at": now()}
    submissions.insert(0, submission); task["submitted_count"] += 1
    return jsonify(success=True, data_mode="demo", submission=submission), 201


@app.post("/api/submissions/<submission_id>/review")
def review_submission(submission_id):
    if not contract_admin_authorized(): return jsonify(success=False, error="Contract administrator authorization is required"), 403
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
            token_issuances.insert(0, {"submission_id": submission_id, "worker_name": submission["worker_name"], "wallet_address": submission["wallet_address"], "amount_wwp": reward - debt_paid, "status": "pending_testnet_oracle", "created_at": now(), "note": "No on-chain payment is made until the worker wallet, deployed contract, network, and authorized oracle are configured."})
    return jsonify(success=True, data_mode="demo", submission=submission)


@app.post("/api/workers/<worker_name>/advance")
def request_demo_advance(worker_name):
    payload = request.get_json(silent=True) or {}
    amount = payload.get("amount_work")
    if not isinstance(amount, int) or not 1 <= amount <= 500: return jsonify(success=False, error="amount_work must be a whole number from 1 to 500"), 400
    account = get_worker(worker_name); account["advance_debt_work"] += amount; account["has_active_advance"] = True
    ledger_entries.insert(0, {"id": str(uuid4()), "worker_name": worker_name, "type": "demo_advance", "credit_work": -amount, "debt_repayment_work": 0, "created_at": now()})
    return jsonify(success=True, data_mode="demo", account=account, note="No WWP payment is created or transferred."), 201


@app.get("/api/ledger")
def worker_ledger():
    approved = sum(item["credit_work"] for item in ledger_entries if item["type"] == "approved_work")
    pending = sum(item["final_reward_work"] for item in submissions if item["status"] == "pending_review")
    return jsonify(data_mode="demo", approved_wwp_payment_work=approved, pending_wwp_payment_work=pending, estimated_work_value_usdc=float(Decimal(approved) / Decimal("100")), entries=ledger_entries, settlement=settlement_status(), note="The ledger is the source of truth for approved contributions. A separately authenticated oracle may mint one unique ERC-20 proof per approved submission after testnet settlement is configured.")


@app.get("/api/token/distribution")
def token_distribution():
    return jsonify(data_mode="demo", **token_sale_status())


@app.post("/api/token/distribution-requests")
def create_token_distribution_request():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(success=False, error="A JSON request body is required"), 400
    purchaser_type = payload.get("purchaser_type")
    organization_name = payload.get("organization_name")
    contact_email = payload.get("contact_email")
    if purchaser_type not in {"public_sector", "private_sector"}:
        return jsonify(success=False, error="purchaser_type must be public_sector or private_sector"), 400
    if not isinstance(organization_name, str) or not 1 <= len(organization_name.strip()) <= 120:
        return jsonify(success=False, error="organization_name must contain 1 to 120 characters"), 400
    if not isinstance(contact_email, str) or len(contact_email.strip()) > 254 or "@" not in contact_email:
        return jsonify(success=False, error="a valid contact_email is required"), 400
    request_record = {"id": str(uuid4()), "purchaser_type": purchaser_type, "organization_name": organization_name.strip(), "contact_email": contact_email.strip().lower(), "status": "compliance_review_required", "created_at": now()}
    token_sale_requests.insert(0, request_record)
    return jsonify(success=True, data_mode="demo", request=request_record, distribution=token_sale_status(), message="Interest recorded. No token sale, purchase agreement, payment collection, transfer, or allocation was created."), 201


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
    settlement = settlement_status()
    return jsonify(data_mode="demo", network=settlement["network"] or "not_deployed", chain_id=settlement["chain_id"], contract=settlement["contract"], standard="ERC-20", name="Worx Work Proof", symbol="WWP", decimals=0, payment_basis="one WWP per approved work unit after debt repayment; aggregate supply must not exceed approved work plus active contracted future work", pending_payments=token_issuances, backing=contract_volume_summary(), settlement=settlement, rewards={"model": "optional externally funded staking rewards", "guaranteed_interest": False, "contract_deployed": settlement["enabled"]}, distribution=token_sale_status(), note="Testnet prototype only. The app records approved work and queues unique oracle mint proofs; it never holds a private key or creates a cash-out path.")


@app.get("/api/owner/balance")
def corporate_balance_sheet():
    funding = sum(Decimal(str(item["funding_usdc"])) for item in tasks)
    return jsonify(data_mode="demo", client_contract_value_usdc=float(funding), worker_wwp_payment_capacity=sum(item["reward_work"] * item["required_submissions"] for item in tasks), owner_usdc_reserve=float(funding * Decimal("0.40")), usdc_transfers_received=False)


@app.post("/api/stripe/webhook")
def intake_stripe_events():
    if not STRIPE_WEBHOOK_SECRET: return jsonify(error="Stripe webhook is not configured"), 503
    signature = request.headers.get("Stripe-Signature")
    if not signature: return jsonify(error="Missing Stripe-Signature header"), 400
    try: stripe.Webhook.construct_event(request.get_data(), signature, STRIPE_WEBHOOK_SECRET)
    except (ValueError, stripe.error.SignatureVerificationError): return jsonify(error="Invalid Stripe webhook signature"), 400
    return jsonify(received=True), 200


if __name__ == "__main__": app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")))
