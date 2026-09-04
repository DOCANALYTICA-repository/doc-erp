"""Issue, rotate and revoke sessions."""
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.core.security import (
    create_access_token, create_refresh_token, hash_refresh_token, split_refresh_token,
)
from app.models.refresh_token import RefreshToken
from app.models.user import User

logger = logging.getLogger("doc_portal.sessions")


class RefreshTokenError(Exception):
    """The presented refresh token cannot be exchanged."""


class SessionService:
    def issue(self, db: Session, *, user: User, user_agent: Optional[str] = None) -> dict:
        """A fresh access + refresh pair."""
        token, jti, expires_at = create_refresh_token()

        db.add(RefreshToken(
            id=jti,
            user_id=user.id,
            token_hash=hash_refresh_token(token),
            expires_at=expires_at,
            user_agent=(user_agent or "")[:255] or None,
        ))
        db.commit()

        return {
            "access_token": create_access_token(subject=user.id),
            "refresh_token": token,
            "token_type": "bearer",
        }

    def rotate(self, db: Session, *, token: str, user_agent: Optional[str] = None) -> dict:
        """Exchange a refresh token for a new pair, invalidating the old one.

        Rotation on every use is what makes a stolen refresh token detectable:
        the thief and the legitimate user cannot both keep using it, so the
        second presentation of an already-rotated token is a signal. When that
        happens we revoke the WHOLE family rather than just refusing — at that
        point we do not know which of the two parties is the attacker, and the
        safe answer is that both sign in again.
        """
        jti, _ = split_refresh_token(token)
        if not jti:
            raise RefreshTokenError("Malformed refresh token")

        record = db.query(RefreshToken).filter(RefreshToken.id == jti).first()
        if record is None:
            raise RefreshTokenError("Unknown refresh token")

        # Constant-time-ish comparison of the stored hash against the presented
        # token, so a wrong secret with a right jti cannot be distinguished by
        # timing from an unknown jti.
        import hmac
        if not hmac.compare_digest(record.token_hash, hash_refresh_token(token)):
            self.revoke_all_for_user(db, user_id=record.user_id)
            logger.warning("refresh_token_secret_mismatch user=%s jti=%s", record.user_id, jti)
            raise RefreshTokenError("Invalid refresh token")

        if record.is_revoked:
            # Two very different situations, and conflating them is a bug.
            #
            #  * The token was ROTATED (replaced_by_id is set) and is being
            #    presented again. Only one party can hold the replacement, so
            #    somebody is using a copy — we cannot tell which, and the safe
            #    answer is that the whole family signs in again.
            #
            #  * The token was explicitly REVOKED by signing out. Presenting it
            #    again is a stale tab, not a theft. Refuse it and nothing more;
            #    revoking the family here would mean signing out of one device
            #    silently signed you out of all of them.
            if record.replaced_by_id:
                self.revoke_all_for_user(db, user_id=record.user_id)
                logger.warning(
                    "refresh_token_reuse_detected user=%s jti=%s replaced_by=%s",
                    record.user_id, jti, record.replaced_by_id,
                )
                raise RefreshTokenError("This session has been ended. Please sign in again.")

            raise RefreshTokenError("This session has been signed out. Please sign in again.")

        expires_at = record.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= datetime.now(timezone.utc):
            raise RefreshTokenError("Refresh token has expired")

        user = db.query(User).filter(User.id == record.user_id).first()
        if user is None or not user.is_active:
            # An account disabled mid-session stops being able to refresh,
            # which is the only reason a short access-token lifetime actually
            # buys anything.
            self.revoke_all_for_user(db, user_id=record.user_id)
            raise RefreshTokenError("Account is no longer active")

        new_token, new_jti, new_expires = create_refresh_token()

        record.is_revoked = True
        record.revoked_at = datetime.now(timezone.utc)
        record.replaced_by_id = new_jti
        db.add(record)

        db.add(RefreshToken(
            id=new_jti,
            user_id=user.id,
            token_hash=hash_refresh_token(new_token),
            expires_at=new_expires,
            user_agent=(user_agent or record.user_agent or "")[:255] or None,
        ))
        db.commit()

        return {
            "access_token": create_access_token(subject=user.id),
            "refresh_token": new_token,
            "token_type": "bearer",
        }

    def revoke(self, db: Session, *, token: str) -> bool:
        """End one session. Used by sign-out."""
        jti, _ = split_refresh_token(token)
        record = db.query(RefreshToken).filter(RefreshToken.id == jti).first()
        if record is None or record.is_revoked:
            # Signing out an already-dead session is not an error.
            return False
        record.is_revoked = True
        record.revoked_at = datetime.now(timezone.utc)
        db.add(record)
        db.commit()
        return True

    def revoke_all_for_user(self, db: Session, *, user_id: str) -> int:
        """End every session for a user — 'sign out everywhere', and the
        response to a suspected theft."""
        now = datetime.now(timezone.utc)
        count = db.query(RefreshToken).filter(
            RefreshToken.user_id == user_id,
            RefreshToken.is_revoked == False,  # noqa: E712 — SQL, not Python truthiness
        ).update({RefreshToken.is_revoked: True, RefreshToken.revoked_at: now},
                 synchronize_session=False)
        db.commit()
        return count

    def purge_expired(self, db: Session) -> int:
        """Housekeeping: expired rows are dead weight and a small liability."""
        count = db.query(RefreshToken).filter(
            RefreshToken.expires_at < datetime.now(timezone.utc)
        ).delete(synchronize_session=False)
        db.commit()
        return count


session_service = SessionService()
