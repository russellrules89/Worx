import os
from decimal import Decimal, InvalidOperation

import stripe
from flask import Flask, jsonify, render_template, request

app = Flask(__name__, template_folder="templates")

STRIPE_PUBLIC_KEY = os.environ.get("STRIPE_PUBLIC_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")


def configured_multiplier() -> Decimal:
    raw_value = os.environ.get("PAYOUT_MULTIPLIER", "1.10")
    try:
        value = Decimal(raw_value)
    except InvalidOperation:
        return Decimal("1.10")
    return value if value >= 0 else Decimal("1.10")


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


@app.get("/api/owner/balance")
def corporate_balance_sheet():
    """Return clearly labeled demonstration data for the dashboard preview."""
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

    return jsonify(
        success=True,
        worker_id=worker_id.strip(),
        badge_authenticated=False,
        message="Demo response only; connect an authorized identity provider before production use.",
    )


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
    app.run(host="0.0.0.0", port=5000)
