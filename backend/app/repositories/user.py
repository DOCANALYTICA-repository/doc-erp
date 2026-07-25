from typing import Optional
from sqlalchemy.orm import Session
from app.core.security import get_password_hash, verify_password
from app.models.user import User
from app.repositories.base import BaseRepository

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
        if not user:
            return None
        if not verify_password(password, user.hashed_password):
            return None
        return user

user_repo = UserRepository(User)
