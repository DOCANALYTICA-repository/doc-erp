"""Refresh tokens, and the revocation that access tokens alone cannot have.

A JWT is valid until it expires; nothing can call it back. That was tolerable
only because nothing sensitive turned on it — except the access token here
lived for EIGHT DAYS, so a leaked one was a week-long session with no way to
end it.

The pairing is the standard one, and the reason the plan refused to ship the
short lifetime without it: a 30-minute access token with no refresh path logs
everyone out mid-task.

Refresh tokens are stored server-side BY HASH, so:
  * they can be revoked (log out, log out everywhere, an admin disabling an
    account),
  * reuse of an already-rotated token is detectable, which is the signal that
    a token was stolen,
  * and the database never holds a value that would let someone impersonate a
    user if it leaked.
"""
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin


class RefreshToken(Base, TimestampMixin):
    __tablename__ = "refresh_tokens"

    #: The token's jti. Looked up directly, so it is the primary key.
    id = Column(String, primary_key=True, index=True)

    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)

    #: SHA-256 of the token itself. Never the token.
    token_hash = Column(String, nullable=False, index=True)

    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)

    #: Set when this token is exchanged, pointing at its replacement. A
    #: presented token that has already been rotated means either a race or a
    #: theft, and both are handled by revoking the whole family.
    replaced_by_id = Column(String, nullable=True)

    #: Rough provenance, for a "where you are signed in" screen later. NOT
    #: used for authorization — a user agent is trivially forged.
    user_agent = Column(String, nullable=True)

    is_revoked = Column(Boolean, default=False, nullable=False)

    user = relationship("User")
