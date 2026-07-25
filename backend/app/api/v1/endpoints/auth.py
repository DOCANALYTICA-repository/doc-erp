from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import create_access_token
from app.core.rbac import get_current_user, get_resolved_permissions
from app.core.capabilities import get_capabilities_map
from app.repositories.user import user_repo
from app.schemas.user import Token, UserOut, UserProfileOut
from app.models.user import User

router = APIRouter()

@router.post("/login", response_model=Token)
def login(db: Session = Depends(get_db), form_data: OAuth2PasswordRequestForm = Depends()):
    user = user_repo.authenticate(db, email=form_data.username, password=form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect email or password"
        )
    elif not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user account"
        )

    access_token = create_access_token(subject=user.id)
    return {
        "access_token": access_token,
        "token_type": "bearer"
    }

@router.get("/me", response_model=UserProfileOut)
def read_current_user(current_user: User = Depends(get_current_user)):
    """
    One round trip at session hydrate: identity + the resolved permission set
    (single source of truth — see rbac.get_resolved_permissions) + the
    platform capability map (single source of truth — see
    capabilities.get_capabilities_map). The frontend must not maintain a
    second copy of either.
    """
    base = UserOut.model_validate(current_user).model_dump()
    return UserProfileOut(
        **base,
        permissions=sorted(get_resolved_permissions(current_user)),
        capabilities=get_capabilities_map(),
    )
