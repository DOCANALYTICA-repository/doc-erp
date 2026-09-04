import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Union

import bcrypt
from jose import jwt

from app.core.config import settings

ALGORITHM = "HS256"

ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    # Standard bcrypt hashing
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def create_access_token(
    subject: Union[str, Any],
    expires_delta: Union[timedelta, None] = None,
    token_type: str = ACCESS_TOKEN_TYPE,
) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    now = datetime.now(timezone.utc)
    to_encode = {
        "exp": expire,
        "sub": str(subject),
        # iat and jti are the prerequisites for ever being able to revoke a
        # token or invalidate everything issued before a given moment. Without
        # a jti a token cannot be revoked even in principle, which is why they
        # are being added now rather than alongside the eventual refresh flow.
        "iat": now,
        "jti": uuid.uuid4().hex,
        "typ": token_type,
    }
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def create_refresh_token() -> tuple[str, str, datetime]:
    """Mint a refresh token.

    Deliberately NOT a JWT. A refresh token's whole job is to be checked
    against server-side state on every use, so a self-describing signed blob
    buys nothing and only creates the temptation to trust it without the
    lookup. It is opaque randomness, and the database stores its HASH.

    Returns (token, jti, expires_at). The token is shown to the caller once
    and never stored anywhere in recoverable form.
    """
    jti = uuid.uuid4().hex
    secret = secrets.token_urlsafe(48)
    token = f"{jti}.{secret}"
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    return token, jti, expires_at


def hash_refresh_token(token: str) -> str:
    """SHA-256, not bcrypt.

    bcrypt is deliberately slow to defend a LOW-ENTROPY secret against
    offline cracking. This token is 48 bytes of CSPRNG output, so there is
    nothing to crack; the only requirement is that a database leak does not
    hand out working sessions. A fast hash also keeps the refresh path cheap.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def split_refresh_token(token: str) -> tuple[str, str]:
    """Pull the jti out of a presented token so it can be looked up directly
    rather than by scanning every row."""
    jti, _, secret = token.partition(".")
    return jti, secret
