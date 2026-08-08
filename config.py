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

    @staticmethod
    def payout_multiplier() -> Decimal:
        try:
            value = Decimal(os.environ.get("PAYOUT_MULTIPLIER", "1.10"))
        except InvalidOperation:
            return Decimal("1.10")
        return value if value >= 0 else Decimal("1.10")
