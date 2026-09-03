import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Union
from jose import jwt
import bcrypt
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
