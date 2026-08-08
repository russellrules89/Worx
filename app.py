import os
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

# Deliberately in-memory demo data. Production needs authenticated users and durable storage.
tasks = [
    {
        "id": "voice-brief-01",
        "title": "Read a product phrase naturally",
        "instructions": "Record one clear sentence in a quiet setting.",
        "reward_work": 12,
        "status": "open",
        "kind": "voice",
    },
    {
        "id": "label-brief-02",
        "title": "Classify a support message",
        "instructions": "Choose the category that best matches the message.",
        "reward_work": 6,
        "status": "open",
        "kind": "annotation",
    },
]
submissions = []


def configured_multiplier() -> Decimal:
    return PlatformConfig.payout_multiplier()


def public_task(task):
    return {key: task[key] for key in ("id", "title", "instructions", "reward_work", "status", "kind")}


@app.get("/")
def serve_dashboard():
    return render_template("index.html", stripe_public_key=STRIPE_PUBLIC_KEY)


@app.get("/health")
def system_health():
    return jsonify(status="ok", service="worx"), 200


@app.get("/favicon.ico")
@app.get("/favicon.png")
def favicon():
    return "", 204


@app.get("/api/tasks")
def list_tasks():
    return jsonify(data_mode="demo", tasks=[public_task(task) for task in tasks])


@app.get("/api/submissions")
def list_submissions():
    return jsonify(data_mode="demo", submissions=submissions)


@app.post("/api/submissions")
def create_submission():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(success=False, error="A JSON request body is required"), 400

    task_id = payload.get("task_id")
    worker_name = payload.get("worker_name")
    response_text = payload.get("response_text")
    task = next((item for item in tasks if item["id"] == task_id and item["status"] == "open"), None)

    if task is None:
        return jsonify(success=False, error="Choose an available task"), 400
    if not isinstance(worker_name, str) or not worker_name.strip():
        return jsonify(success=False, error="worker_name is required"), 400
    if not isinstance(response_text, str) or not response_text.strip():
        return jsonify(success=False, error="response_text is required"), 400
    if len(response_text.strip()) > 2000:
        return jsonify(success=False, error="response_text must be 2,000 characters or fewer"), 400

    submission = {
        "id": str(uuid4()),
        "task_id": task["id"],
        "task_title": task["title"],
        "worker_name": worker_name.strip(),
        "response_text": response_text.strip(),
        "reward_work": task["reward_work"],
        "status": "pending_review",
        "submitted_at": datetime.now(timezone.utc).isoformat(),
    }
    submissions.insert(0, submission)
    return jsonify(success=True, data_mode="demo", submission=submission), 201


@app.post("/api/submissions/<submission_id>/review")
def review_submission(submission_id):
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict) or payload.get("decision") not in {"approved", "needs_revision"}:
        return jsonify(success=False, error="decision must be approved or needs_revision"), 400

    submission = next((item for item in submissions if item["id"] == submission_id), None)
    if submission is None:
        return jsonify(success=False, error="Submission not found"), 404
    if submission["status"] != "pending_review":
        return jsonify(success=False, error="Only pending submissions can be reviewed"), 409

    submission["status"] = payload["decision"]
    submission["reviewed_at"] = datetime.now(timezone.utc).isoformat()
    return jsonify(success=True, data_mode="demo", submission=submission)


@app.get("/api/ledger")
def worker_ledger():
    approved_work = sum(item["reward_work"] for item in submissions if item["status"] == "approved")
    pending_work = sum(item["reward_work"] for item in submissions if item["status"] == "pending_review")
    return jsonify(
        data_mode="demo",
        approved_work=approved_work,
        pending_work=pending_work,
        estimated_voucher_value_usd=float(Decimal(approved_work) * configured_multiplier()),
        note="Demo ledger only. This application does not issue tokens, vouchers, or payments.",
    )


@app.get("/api/owner/balance")
def corporate_balance_sheet():
    corporate_billing = Decimal("142000.00")
    worker_tokens = Decimal("96500.00")
    liability = worker_tokens * configured_multiplier()
    return jsonify(
        data_mode="demo",
        corporate_client_billing_usd=float(corporate_billing),
        distributed_worker_tokens=float(worker_tokens),
        voucher_redemption_liability_usd=float(liability),
        net_platform_reserve_balance=float(corporate_billing - liability),
    )


@app.post("/api/badge/check")
def perform_badge_check():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(success=False, error="A JSON request body is required"), 400
    worker_id = payload.get("worker_id")
    if not isinstance(worker_id, str) or not worker_id.strip():
        return jsonify(success=False, error="worker_id is required"), 400
    return jsonify(success=True, worker_id=worker_id.strip(), badge_authenticated=False,
                   message="Demo response only; connect an authorized identity provider before production use.")


@app.post("/api/stripe/webhook")
def intake_stripe_events():
    if not STRIPE_WEBHOOK_SECRET:
        return jsonify(error="Stripe webhook is not configured"), 503
    signature = request.headers.get("Stripe-Signature")
    if not signature:
        return jsonify(error="Missing Stripe-Signature header"), 400
    try:
        stripe.Webhook.construct_event(request.get_data(), signature, STRIPE_WEBHOOK_SECRET)
    except (ValueError, stripe.error.SignatureVerificationError):
        return jsonify(error="Invalid Stripe webhook signature"), 400
    return jsonify(received=True), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")))
