from typing import List, Set
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import get_db
from app.core.security import ALGORITHM
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")

# Role/Role Tag to Permission Mapping Registry
ROLE_PERMISSIONS = {
    # Primary Roles
    "public": {
        "public:view"
    },
    "student": {
        "public:view",
        "claims:submit",
        "claims:view_own",
        "clubs:view",
        "events:register",
        "tasks:view_own"
    },
    "faculty": {
        "public:view",
        "claims:view_own",
        "clubs:view",
        "faculty:dashboard",
        "notes:manage",
        "documents:manage",
        "meetings:manage",
        "tasks:manage",
        "directory:view",
        "reports:view",
        "claims:review_faculty"  # Subject Faculty baseline
    },
    "super_admin": {
        "*"  # Access to everything
    },
    
    # Role Tags (Extending baseline permissions)
    "Club President": {
        "clubs:manage_members",
        "events:create",
        "budget:manage",
        "reimbursement:request",
        "sponsorship:manage"
    },
    "Vice President": {
        "clubs:manage_members",
        "events:create",
        "budget:manage",
        "reimbursement:request"
    },
    "Core Member": {
        "events:create",
        "reimbursement:request"
    },
    "Class Teacher": {
        "claims:review_class_teacher"
    },
    "Club Faculty Coordinator": {
        "clubs:approve_plan",
        "events:approve",
        "budget:manage",
        "reimbursement:approve",
        "claims:review_faculty_coordinator"  # Initial reviewer for club-submitted claims
    },
    "Course Coordinator": {
        "claims:approve_coordinator"
    },
    "HOD": {
        "claims:approve_coordinator",
        "clubs:approve_plan",
        "events:approve",
        "rbac:assign_roles"
    }
}

def get_current_user(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return user

def get_resolved_permissions(user: User) -> Set[str]:
    """
    Single source of truth for what a user is allowed to do. Used by
    PermissionChecker below AND by GET /auth/me (see auth.py), so the
    frontend never has to maintain its own copy of ROLE_PERMISSIONS again.
    """
    if user.primary_role == "super_admin":
        return {"*"}

    permissions: Set[str] = set()
    permissions.update(ROLE_PERMISSIONS.get(user.primary_role, set()))
    for tag in user.role_tags_list:
        permissions.update(ROLE_PERMISSIONS.get(tag, set()))
    return permissions


class PermissionChecker:
    def __init__(self, required_permissions: List[str]):
        self.required_permissions = required_permissions

    def __call__(self, current_user: User = Depends(get_current_user)) -> User:
        user_permissions = get_resolved_permissions(current_user)

        if "*" in user_permissions:
            return current_user

        for perm in self.required_permissions:
            if perm not in user_permissions:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Not enough permissions. Missing: {perm}"
                )

        return current_user
