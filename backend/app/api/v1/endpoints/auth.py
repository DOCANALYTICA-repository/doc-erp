from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.config import settings
from app.services.session_service import RefreshTokenError, session_service
from app.core.rate_limit import LOGIN_RATE_LIMIT, REFRESH_RATE_LIMIT, limiter
from app.core.rbac import get_current_user, get_resolved_permissions
from app.core.capabilities import get_capabilities_map
from app.repositories.user import user_repo
from app.schemas.user import RefreshRequest, Token, UserOut, UserProfileOut
from app.models.user import User

router = APIRouter()

@router.post("/login", response_model=Token)
@limiter.limit(LOGIN_RATE_LIMIT)
def login(
    request: Request,  # required by slowapi's decorator, and must come first
    db: Session = Depends(get_db),
    form_data: OAuth2PasswordRequestForm = Depends(),
):
    """Throttled to 5 attempts a minute per client address.

    Unthrottled, an 8-character password over this endpoint is a matter of
    patience. user_repo.authenticate also runs bcrypt unconditionally, so an
    unknown email costs the same as a known one — the response time no longer
    reveals which accounts exist.
    """
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

    tokens = session_service.issue(db, user=user, user_agent=request.headers.get("user-agent"))
    return {**tokens, "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60}


@router.post("/refresh", response_model=Token)
@limiter.limit(REFRESH_RATE_LIMIT)
def refresh(
    request: Request,  # required by slowapi's decorator, and must come first
    body: RefreshRequest,
    db: Session = Depends(get_db),
):
    """Exchange a refresh token for a new pair.

    The access token now lives 30 minutes instead of 8 days, which is only
    tolerable because this endpoint exists — shortening the lifetime without a
    refresh path logs everyone out mid-task.

    Refresh tokens ROTATE: the presented one is invalidated and a new one
    issued. Re-presenting a rotated token means either a race or a theft, and
    the service revokes the whole family rather than guessing which.
    """
    try:
        tokens = session_service.rotate(
            db, token=body.refresh_token, user_agent=request.headers.get("user-agent"),
        )
    except RefreshTokenError as exc:
        # 401, so a client can distinguish "sign in again" from a 4xx it
        # should show the user as a form error.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    return {**tokens, "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60}


@router.post("/logout")
def logout(body: RefreshRequest, db: Session = Depends(get_db)):
    """End this session.

    Deliberately takes the refresh token rather than the access token: the
    access token expires on its own shortly, and it is the refresh token that
    would otherwise keep the session alive for a fortnight.

    Not authenticated — a user whose access token has already expired must
    still be able to sign out, and presenting a valid refresh token is proof
    enough to end that one session.
    """
    session_service.revoke(db, token=body.refresh_token)
    return {"status": "success"}


@router.post("/logout-all")
def logout_everywhere(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """End every session for the current user.

    The thing a JWT alone can never do, and the reason refresh tokens are
    stored server-side.
    """
    revoked = session_service.revoke_all_for_user(db, user_id=current_user.id)
    return {"status": "success", "sessions_ended": revoked}

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
