import os
import uuid
import time
import stripe
from flask import Flask, request, jsonify, Response

app = Flask(__name__)

# =====================================================================
# SYSTEM PARAMETERS & CONFIGURATIONS FOR RUSSELL STONE
# =====================================================================
ADMIN_EMAIL = "russellrules89@gmail.com"
OWNER_ETH_ADDRESS = "0xRussellStoneVoucherPoolVault"

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "sk_live_Placeholder")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "whsec_Placeholder")
TARGET_PRICE_ID = os.environ.get("TARGET_PRICE_ID", "price_1Q_Placeholder")

# System Matrices
BASE_TOKENS_PER_HOUR = 1.0
CLIENT_BILLING_RATE_USD = 25.00
TOKEN_REVENUE_EXCHANGE_INDEX = 20.00

total_stripe_cash_collected_usd = 0.0

db_worker_ledgers = {}
db_labor_tasks_log = []
db_b2b_invoices = []
db_commodity_vouchers = []

# =====================================================================
# REQUIRED VERCEL RUNTIME ROUTING AND HEALTH ENDPOINTS
# =====================================================================

@app.route('/', methods=['GET'])
def index():
    """Serves the standard application base landing status."""
    return jsonify({
        "platform": "Labor Backed Currency Network",
        "status": "Online",
        "administrator": ADMIN_EMAIL
    }), 200

@app.route('/health', methods=['GET'])
def health_check():
    """Serves the platform live diagnostic uptime metric."""
    return jsonify({
        "status": "healthy",
        "timestamp": int(time.time()),
        "database_connectivity": True
    }), 200

@app.route('/favicon.ico', methods=['GET'])
def favicon_silencer():
    """Intercepts legacy browser favicon asset queries with a no-content payload."""
    return Response(status=204)

# =====================================================================
# PLATFORM SYSTEM CORE ENDPOINTS
# =====================================================================

@app.route('/stripe-webhook', methods=['POST'])
def stripe_webhook_listener():
    global total_stripe_cash_collected_usd
    payload = request.data
    sig_header = request.headers.get('HTTP_STRIPE_SIGNATURE')

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except (ValueError, stripe.error.SignatureVerificationError):
        return 'Signature Verification Failed', 400

    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        line_items = stripe.checkout.Session.list_line_items(session['id'], limit=1)
        if line_items['data'] and line_items['data']['price']['id'] == TARGET_PRICE_ID:
            received_cash_usd = session['amount_total'] / 100.0
            total_stripe_cash_collected_usd += received_cash_usd

            db_b2b_invoices.append({
                "invoice_id": str(uuid.uuid4())[:8],
                "client_id": session.get("client_reference_id", "STRIPE_LINK_CLIENT"),
                "amount_due_usd": received_cash_usd,
                "payment_status": "paid",
                "owner_routing_target": ADMIN_EMAIL
            })
            return jsonify(success=True), 200

    return jsonify(success=True), 200

# Expose WSGI application handler reference variable for Vercel's engine mapping
app_handler = app

if __name__ == '__main__':
    app.run(port=4242)
