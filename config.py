import os
from decimal import Decimal, InvalidOperation

from dotenv import load_dotenv

load_dotenv()


class PlatformConfig:
    """Application configuration sourced from the environment."""

    SECRET_KEY = os.environ.get("FLASK_SECRET_KEY")
    PERMANENT_SESSION_LIFETIME = 60 * 60 * 8
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = True
    STRIPE_PUBLIC_KEY = os.environ.get("STRIPE_PUBLIC_KEY", "")
    STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    # Base Sepolia is the only supported settlement network in this release.
    TOKEN_CONTRACT_ADDRESS = os.environ.get("TOKEN_CONTRACT_ADDRESS", "")
    # Legacy alias retained only while existing deployments are migrated.
    ETHEREUM_CONTRACT_ADDRESS = TOKEN_CONTRACT_ADDRESS or os.environ.get("ETHEREUM_CONTRACT_ADDRESS", "")
    CONTRACT_ADMIN_API_KEY = os.environ.get("CONTRACT_ADMIN_API_KEY", "")
    TOKEN_SALE_ENABLED = os.environ.get("TOKEN_SALE_ENABLED", "false").lower() == "true"
    CONSENT_POLICY_VERSION = os.environ.get("CONSENT_POLICY_VERSION", "2026-08-preview")
    IDENTITY_VERIFICATION_PROVIDER = os.environ.get("IDENTITY_VERIFICATION_PROVIDER", "")
    CONTRIBUTION_UPLOADS_ENABLED = False
    # Settlement is opt-in and Base Sepolia-only. Enabling it requires a deployed
    # contract plus an authenticated oracle service outside this app.
    BASE_SEPOLIA_SETTLEMENT_ENABLED = os.environ.get("BASE_SEPOLIA_SETTLEMENT_ENABLED", os.environ.get("TESTNET_SETTLEMENT_ENABLED", "false")).lower() == "true"
    BASE_SEPOLIA_CHAIN_ID = "84532"
    BASE_SEPOLIA_NETWORK_NAME = "base-sepolia"
    MINIMUM_CASHOUT_WORK = os.environ.get("MINIMUM_CASHOUT_WORK", "100")
    AI_GATEWAY_API_KEY = os.environ.get("AI_GATEWAY_API_KEY", "")
    AI_GATEWAY_MODEL = os.environ.get("AI_GATEWAY_MODEL", "")

    @staticmethod
    def payout_multiplier() -> Decimal:
        try:
            value = Decimal(os.environ.get("PAYOUT_MULTIPLIER", "1.10"))
        except InvalidOperation:
            return Decimal("1.10")
        return value if value >= 0 else Decimal("1.10")
