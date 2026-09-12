"""
AcquisitionOS — Backend Configuration
Production-grade settings with environment validation
"""

import os
import sys
from typing import Optional


class Settings:
    """Application settings loaded from environment variables with validation."""

    # ── Core ──────────────────────────────────────────────────
    APP_SECRET_KEY: str = os.getenv("APP_SECRET_KEY", "")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "")
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000")
    ALLOWED_ORIGINS: str = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT == "development"

    # ── Database ──────────────────────────────────────────────
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://postgres:password@localhost:5432/acquisitionos"
    )
    DATABASE_URL_SYNC: str = os.getenv(
        "DATABASE_URL_SYNC",
        "postgresql://postgres:password@localhost:5432/acquisitionos"
    )
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "")

    # ── Redis ─────────────────────────────────────────────────
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    REDIS_PASSWORD: Optional[str] = os.getenv("REDIS_PASSWORD", None)

    # ── AI Services ───────────────────────────────────────────
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")

    # ── Payments — Razorpay ───────────────────────────────────
    RAZORPAY_KEY_ID: str = os.getenv("RAZORPAY_KEY_ID", "")
    RAZORPAY_KEY_SECRET: str = os.getenv("RAZORPAY_KEY_SECRET", "")
    RAZORPAY_WEBHOOK_SECRET: str = os.getenv("RAZORPAY_WEBHOOK_SECRET", "")

    # ── Payments — Stripe ─────────────────────────────────────
    STRIPE_SECRET_KEY: str = os.getenv("STRIPE_SECRET_KEY", "")
    STRIPE_WEBHOOK_SECRET: str = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    STRIPE_PUBLISHABLE_KEY: str = os.getenv("STRIPE_PUBLISHABLE_KEY", "")

    # ── Google OAuth — Social Login ───────────────────────────
    GOOGLE_LOGIN_CLIENT_ID: str = os.getenv("GOOGLE_LOGIN_CLIENT_ID", "")
    GOOGLE_LOGIN_CLIENT_SECRET: str = os.getenv("GOOGLE_LOGIN_CLIENT_SECRET", "")
    GOOGLE_LOGIN_REDIRECT_URI: str = os.getenv(
        "GOOGLE_LOGIN_REDIRECT_URI",
        "http://localhost:8000/api/auth/google/callback"
    )

    # ── Google OAuth — Gmail Integration ──────────────────────
    GOOGLE_GMAIL_CLIENT_ID: str = os.getenv("GOOGLE_GMAIL_CLIENT_ID", "")
    GOOGLE_GMAIL_CLIENT_SECRET: str = os.getenv("GOOGLE_GMAIL_CLIENT_SECRET", "")
    GOOGLE_GMAIL_REDIRECT_URI: str = os.getenv(
        "GOOGLE_GMAIL_REDIRECT_URI",
        "http://localhost:8000/api/integrations/gmail/callback"
    )
    GMAIL_PUBSUB_TOPIC: str = os.getenv("GMAIL_PUBSUB_TOPIC", "")
    GMAIL_PUBSUB_SUBSCRIPTION: str = os.getenv("GMAIL_PUBSUB_SUBSCRIPTION", "")

    # ── Telegram ──────────────────────────────────────────────
    TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_BOT_USERNAME: str = os.getenv("TELEGRAM_BOT_USERNAME", "")

    # ── WhatsApp — Twilio ─────────────────────────────────────
    TWILIO_ACCOUNT_SID: str = os.getenv("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN: str = os.getenv("TWILIO_AUTH_TOKEN", "")
    TWILIO_WHATSAPP_NUMBER: str = os.getenv("TWILIO_WHATSAPP_NUMBER", "whatsapp:+14155238886")

    # ── WhatsApp — Meta ───────────────────────────────────────
    META_WHATSAPP_TOKEN: str = os.getenv("META_WHATSAPP_TOKEN", "")
    META_WHATSAPP_PHONE_ID: str = os.getenv("META_WHATSAPP_PHONE_ID", "")
    META_WEBHOOK_VERIFY_TOKEN: str = os.getenv("META_WEBHOOK_VERIFY_TOKEN", "")
    META_APP_SECRET: str = os.getenv("META_APP_SECRET", "")

    # ── SMTP ──────────────────────────────────────────────────
    SMTP_HOST: str = os.getenv("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM_NAME: str = os.getenv("SMTP_FROM_NAME", "AcquisitionOS")
    SMTP_FROM_EMAIL: str = os.getenv("SMTP_FROM_EMAIL", "noreply@acquisitionos.com")

    # ── Scraping ──────────────────────────────────────────────
    SERPAPI_KEY: str = os.getenv("SERPAPI_KEY", "")
    BRIGHTDATA_USERNAME: str = os.getenv("BRIGHTDATA_USERNAME", "")
    BRIGHTDATA_PASSWORD: str = os.getenv("BRIGHTDATA_PASSWORD", "")

    # ── Storage ───────────────────────────────────────────────
    AWS_ACCESS_KEY_ID: str = os.getenv("AWS_ACCESS_KEY_ID", "")
    AWS_SECRET_ACCESS_KEY: str = os.getenv("AWS_SECRET_ACCESS_KEY", "")
    AWS_S3_BUCKET: str = os.getenv("AWS_S3_BUCKET", "acquisitionos-assets")
    AWS_REGION: str = os.getenv("AWS_REGION", "ap-south-1")
    CLOUDFLARE_R2_ENDPOINT: str = os.getenv("CLOUDFLARE_R2_ENDPOINT", "")

    # ── Security ──────────────────────────────────────────────
    TOKEN_ENCRYPTION_KEY: str = os.getenv("TOKEN_ENCRYPTION_KEY", "")

    # ── Sentry ────────────────────────────────────────────────
    SENTRY_DSN: str = os.getenv("SENTRY_DSN", "")
    SENTRY_TRACES_SAMPLE_RATE: float = float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1"))

    # ── Celery ────────────────────────────────────────────────
    CELERY_BROKER_URL: str = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/1")
    CELERY_RESULT_BACKEND: str = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/2")
    FLOWER_PORT: int = int(os.getenv("FLOWER_PORT", "5555"))
    FLOWER_BASIC_AUTH: str = os.getenv("FLOWER_BASIC_AUTH", "admin:password")

    # ── Admin ─────────────────────────────────────────────────
    ADMIN_EMAIL: str = os.getenv("ADMIN_EMAIL", "")
    ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "")

    # ── Feature Flags ─────────────────────────────────────────
    ENABLE_MAGIC_LINK: bool = os.getenv("ENABLE_MAGIC_LINK", "true").lower() == "true"
    ENABLE_OTP_LOGIN: bool = os.getenv("ENABLE_OTP_LOGIN", "true").lower() == "true"
    ENABLE_GOOGLE_OAUTH: bool = os.getenv("ENABLE_GOOGLE_OAUTH", "false").lower() == "true"
    ENABLE_TELEGRAM: bool = os.getenv("ENABLE_TELEGRAM", "false").lower() == "true"
    ENABLE_WHATSAPP: bool = os.getenv("ENABLE_WHATSAPP", "false").lower() == "true"
    ENABLE_GMAIL_INTEGRATION: bool = os.getenv("ENABLE_GMAIL_INTEGRATION", "false").lower() == "true"
    ENABLE_COMPETITOR_INTELLIGENCE: bool = os.getenv("ENABLE_COMPETITOR_INTELLIGENCE", "true").lower() == "true"

    # ── Plan Defaults ─────────────────────────────────────────
    PLAN_CREDITS = {"free": 50, "pro": 500, "elite": 2000}
    TRIAL_DAYS: int = 14
    GST_RATE: float = 0.18

    # ── Rate Limiting ─────────────────────────────────────────
    RATE_LIMIT_AUTH: str = "5/minute"
    RATE_LIMIT_AI: str = "30/minute"
    RATE_LIMIT_SCRAPING: str = "10/minute"
    RATE_LIMIT_GENERAL: str = "200/minute"

    # ── JWT ───────────────────────────────────────────────────
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ── Login Security ────────────────────────────────────────
    MAX_LOGIN_ATTEMPTS: int = 5
    LOGIN_LOCKOUT_MINUTES: int = 15

    def validate_critical_env(self) -> list[str]:
        """Validate that critical environment variables are set.
        Returns a list of missing variable names.
        In development mode, only warn instead of failing.
        """
        critical_vars = {
            "APP_SECRET_KEY": self.APP_SECRET_KEY,
            "JWT_SECRET": self.JWT_SECRET,
        }

        missing = [name for name, value in critical_vars.items() if not value]

        if missing and self.is_production:
            print(f"ERROR: Missing critical environment variables: {', '.join(missing)}")
            print("Application cannot start in production without these variables.")
            sys.exit(1)
        elif missing:
            for var in missing:
                print(f"WARNING: {var} is not set. Using insecure defaults for development.")

        return missing


# Singleton settings instance
settings = Settings()

# Validate on import
settings.validate_critical_env()
