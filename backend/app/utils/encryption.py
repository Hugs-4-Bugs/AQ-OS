"""
AcquisitionOS — Fernet Encryption Utilities
For encrypting OAuth tokens and sensitive data at rest
"""

import base64
import logging
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings

logger = logging.getLogger(__name__)

# Lazy-initialized Fernet instance
_fernet: Optional[Fernet] = None


def _get_fernet() -> Fernet:
    """Get or create the Fernet encryption instance."""
    global _fernet
    if _fernet is None:
        if not settings.TOKEN_ENCRYPTION_KEY:
            if settings.is_production:
                raise RuntimeError("TOKEN_ENCRYPTION_KEY must be set in production")
            # Development fallback — NOT secure, only for local dev
            logger.warning("TOKEN_ENCRYPTION_KEY not set — using development key. DO NOT use in production!")
            dev_key = Fernet.generate_key()
            _fernet = Fernet(dev_key)
        else:
            key = settings.TOKEN_ENCRYPTION_KEY.encode()
            _fernet = Fernet(key)
    return _fernet


def encrypt_value(plaintext: str) -> str:
    """Encrypt a string value and return base64-encoded ciphertext."""
    try:
        fernet = _get_fernet()
        ciphertext = fernet.encrypt(plaintext.encode())
        return base64.urlsafe_b64encode(ciphertext).decode()
    except Exception as e:
        logger.error(f"Encryption error: {e}")
        raise


def decrypt_value(ciphertext: str) -> str:
    """Decrypt a base64-encoded ciphertext and return the plaintext string."""
    try:
        fernet = _get_fernet()
        decoded = base64.urlsafe_b64decode(ciphertext.encode())
        plaintext = fernet.decrypt(decoded)
        return plaintext.decode()
    except InvalidToken:
        logger.error("Decryption failed: invalid token (wrong key or corrupted data)")
        raise ValueError("Failed to decrypt: invalid encryption key or corrupted data")
    except Exception as e:
        logger.error(f"Decryption error: {e}")
        raise


def encrypt_oauth_tokens(access_token: str, refresh_token: str) -> dict:
    """Encrypt OAuth access and refresh tokens for storage.
    Returns a dict with encrypted tokens ready for DB storage.
    """
    return {
        "access_token": encrypt_value(access_token),
        "refresh_token": encrypt_value(refresh_token),
    }


def decrypt_oauth_tokens(encrypted_access: str, encrypted_refresh: str) -> dict:
    """Decrypt OAuth tokens from DB storage.
    Returns a dict with plaintext tokens for API use.
    """
    return {
        "access_token": decrypt_value(encrypted_access),
        "refresh_token": decrypt_value(encrypted_refresh),
    }
