from typing import Optional
from sqlalchemy.orm import Session
from app.core.security import get_password_hash, verify_password
from app.models.user import User
from app.repositories.base import BaseRepository

# A real bcrypt hash of a value nothing can log in with, used purely to make
# the failure path cost the same as the success path.
_DUMMY_HASH = get_password_hash("not-a-real-password-timing-equalizer")


class UserRepository(BaseRepository[User]):
    def get_by_email(self, db: Session, *, email: str) -> Optional[User]:
        return db.query(User).filter(User.email == email).first()

    def create_user(self, db: Session, *, obj_in: dict) -> User:
        # Hash password before storing
        password = obj_in.pop("password", None)
        hashed_password = get_password_hash(password) if password else ""
        obj_in["hashed_password"] = hashed_password
        
        return self.create(db, obj_in=obj_in)

    def authenticate(self, db: Session, *, email: str, password: str) -> Optional[User]:
        user = self.get_by_email(db, email=email)

        # Always run one bcrypt verification, even for an unknown address.
        #
        # Returning early skipped the hash entirely, so an unknown email
        # answered in microseconds while a known one took ~250 ms — a
        # measurable oracle that let anyone enumerate valid accounts without a
        # single successful login.
        hashed = user.hashed_password if user else _DUMMY_HASH
        password_ok = verify_password(password, hashed)

        if not user or not password_ok:
            return None
        return user

user_repo = UserRepository(User)
