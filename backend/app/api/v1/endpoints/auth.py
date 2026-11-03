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
from pydantic import BaseModel

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


# FastAPI's own 404 body is exactly {"detail": "Not Found"}. Ours said
# "Not found", and that one-byte difference was an oracle: a caller probing
# /auth/demo-persona could tell "this route exists but is switched off" from
# "this route does not exist" by the capital F alone, which is precisely the
# distinction the 404 is supposed to hide.
NOT_FOUND_DETAIL = "Not Found"


class DemoPersonaOut(BaseModel):
    """One account a developer may switch into."""

    email: str
    name: str
    primary_role: str
    role_tags_str: str


@router.get(
    "/demo-persona",
    response_model=list[DemoPersonaOut],
    # Hidden from the schema unless the feature is actually on. See the note
    # on the POST below: a 404 is pointless masking while /openapi.json
    # publishes the route, its request model and its response model to anyone
    # who asks.
    include_in_schema=settings.ENABLE_DEMO_PERSONAS,
)
def list_demo_personas(db: Session = Depends(get_db)):
    """The accounts a developer may become. Development only; 404 when off.

    This exists so the client does not have to keep its own copy of the
    allow-list — the server owns it, and the UI renders whatever it is told.

    It also solves a problem the POST cannot: that endpoint answers 404 both
    when the flag is off AND when the address is not allow-listed, on purpose,
    so a caller cannot enumerate the personas from it. Which means the POST is
    useless for asking "is this feature available?". This is that question,
    asked once.

    Listing the fixtures when the flag is on is not a leak: they are seeded
    test accounts, and anything that can read this can already mint tokens for
    them.
    """
    if not settings.ENABLE_DEMO_PERSONAS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_DETAIL)

    out: list[DemoPersonaOut] = []
    for email in settings.DEMO_PERSONA_EMAILS:
        user = user_repo.get_by_email(db, email=email)
        if not user or not user.is_active:
            continue
        out.append(
            DemoPersonaOut(
                email=user.email,
                name=user.name,
                primary_role=user.primary_role,
                role_tags_str=user.role_tags_str or "",
            )
        )
    return out


class DemoPersonaRequest(BaseModel):
    """Which seeded account to become."""

    email: str


@router.post(
    "/demo-persona",
    response_model=Token,
    include_in_schema=settings.ENABLE_DEMO_PERSONAS,
)
@limiter.limit(LOGIN_RATE_LIMIT)
def demo_persona(
    request: Request,  # required by slowapi's decorator, and must come first
    body: DemoPersonaRequest,
    db: Session = Depends(get_db),
):
    """Sign in as a seeded demo account WITHOUT a password. Development only.

    This is impersonation, so it is fenced in four ways:

    1. `settings.ENABLE_DEMO_PERSONAS` defaults to False, and this returns
       **404** when it is off rather than 401 or 403, with byte-identical
       body to FastAPI's own 404 — so probing for the route learns nothing.

       Two holes in that claim were found in review and closed here. The
       detail string was "Not found" against FastAPI's "Not Found", which
       distinguished a disabled route from an absent one on capitalisation
       alone. And `include_in_schema` was left at its default, so
       `/api/v1/openapi.json` — which this app serves unconditionally, in
       every environment — published the route, its request model and its
       response model regardless of the flag. Masking the response while
       publishing the schema is not masking.

       NOTE: `include_in_schema` is evaluated at import time, so flipping the
       flag needs a restart to change what the schema shows. That is correct
       for a deploy-time flag and would be wrong for a runtime one.
    2. The target must appear in `settings.DEMO_PERSONA_EMAILS`, an explicit
       allow-list of seeded fixtures. Even with the flag wrongly enabled, this
       cannot mint a token for a real person's account.
    3. The account must still exist and be active, so a disabled fixture stays
       disabled.
    4. Rate-limited on the same budget as /login, so it is no cheaper to abuse.

    It issues a genuine token pair through `session_service.issue`, exactly as
    /login does. That is deliberate: a parallel token path would be a second
    thing to get wrong, and the resulting session must be revocable and
    refreshable like any other.
    """
    if not settings.ENABLE_DEMO_PERSONAS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_DETAIL)

    if body.email not in settings.DEMO_PERSONA_EMAILS:
        # Deliberately the same 404 as a disabled flag: a caller cannot use the
        # difference between "not allowed" and "not enabled" to enumerate which
        # accounts are demo-able.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_DETAIL)

    user = user_repo.get_by_email(db, email=body.email)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_DETAIL)

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
