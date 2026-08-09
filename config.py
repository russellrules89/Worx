import os
from decimal import Decimal, InvalidOperation

from dotenv import load_dotenv

load_dotenv()


class PlatformConfig:
    """Application configuration sourced from the environment."""

    SECRET_KEY = os.environ.get("FLASK_SECRET_KEY")
    STRIPE_PUBLIC_KEY = os.environ.get("STRIPE_PUBLIC_KEY", "")
    STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    ETHEREUM_CONTRACT_ADDRESS = os.environ.get("ETHEREUM_CONTRACT_ADDRESS", "")
    CONTRACT_ADMIN_API_KEY = os.environ.get("CONTRACT_ADMIN_API_KEY", "")
    TOKEN_SALE_ENABLED = os.environ.get("TOKEN_SALE_ENABLED", "false").lower() == "true"
    CONSENT_POLICY_VERSION = os.environ.get("CONSENT_POLICY_VERSION", "2026-08-preview")
    IDENTITY_VERIFICATION_PROVIDER = os.environ.get("IDENTITY_VERIFICATION_PROVIDER", "")
    CONTRIBUTION_UPLOADS_ENABLED = False
    TESTNET_SETTLEMENT_ENABLED = False
    EVM_TESTNET_CHAIN_ID = os.environ.get("EVM_TESTNET_CHAIN_ID", "")

    @staticmethod
    def payout_multiplier() -> Decimal:
        try:
            value = Decimal(os.environ.get("PAYOUT_MULTIPLIER", "1.10"))
        except InvalidOperation:
            return Decimal("1.10")
        return value if value >= 0 else Decimal("1.10")
