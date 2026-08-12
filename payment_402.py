"""Fail-closed 402 payment challenge helpers for approved Worx data packets."""
import base64
import hashlib
import json
import os
from urllib.error import URLError, HTTPError
from urllib.request import Request, urlopen

PRODUCTS = {
    "workforce-quality-summary-v1": {
        "id": "workforce-quality-summary-v1",
        "name": "Workforce quality summary",
        "price_atomic": "100000",  # 0.10 USDC on Base (6 decimals)
        "currency": "USDC",
        "network": "base",
        "terms_version": "2026-08-data-access-v1",
        "packet": {
            "schema": "worx.data-packet.v1",
            "scope": "aggregated-quality-metrics",
            "raw_contributions_included": False,
            "personal_data_included": False,
        },
    }
}


def challenge(product, resource):
    return {
        "protocol": "worx-402-v1",
        "provider": os.environ.get("PAYMENT_402_PROVIDER", "skyfire-compatible"),
        "resource": resource,
        "productId": product["id"],
        "amountAtomic": product["price_atomic"],
        "currency": product["currency"],
        "network": product["network"],
        "termsVersion": product["terms_version"],
        "paymentProofHeader": "Payment-Proof",
    }


def challenge_header(value):
    return base64.urlsafe_b64encode(json.dumps(value, separators=(",", ":")).encode()).decode().rstrip("=")


def parse_proof(value):
    if not value:
        return None
    try:
        padded = value + "=" * (-len(value) % 4)
        proof = json.loads(base64.urlsafe_b64decode(padded.encode()))
    except (ValueError, TypeError, json.JSONDecodeError):
        return None
    required = ("paymentId", "payer", "amountAtomic", "currency", "network", "termsVersion")
    if not isinstance(proof, dict) or any(not isinstance(proof.get(key), str) or not proof[key] for key in required):
        return None
    if not proof["amountAtomic"].isdigit() or proof["currency"] != "USDC" or proof["network"] != "base":
        return None
    return {key: proof[key] for key in required}


def proof_hash(proof):
    return hashlib.sha256(json.dumps({key: proof[key] for key in ("paymentId", "payer", "amountAtomic", "currency", "network", "termsVersion")}, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def verify(proof, payment_challenge):
    """Verify a payment with the configured settlement provider; never trust a client proof alone."""
    endpoint = os.environ.get("PAYMENT_402_VERIFIER_URL")
    api_key = os.environ.get("PAYMENT_402_VERIFIER_API_KEY")
    if not endpoint or not api_key:
        return None
    payload = json.dumps({"protocol": "worx-402-v1", "proof": proof, "challenge": payment_challenge}).encode()
    request = Request(endpoint, data=payload, headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}, method="POST")
    try:
        with urlopen(request, timeout=5) as response:
            if response.status != 200:
                return None
            result = json.loads(response.read().decode())
    except (URLError, HTTPError, TimeoutError, ValueError, json.JSONDecodeError):
        return None
    if result.get("settled") is True and result.get("paymentId") == proof["paymentId"] and result.get("payer") == proof["payer"]:
        return result
    return None
