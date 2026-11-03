"""
Capability registry — the platform's "coming soon" / feature-flag mechanism.

This is deliberately NOT a second, parallel gating system. It extends the
same pattern rbac.py already uses to answer "is this user allowed": here we
answer "is this feature live yet". See the v1 implementation plan, section 3.

Status values:
  - "live"         -> fully available (this is also the default for any slug
                       not listed below at all — see is_live()).
  - "coming_soon"  -> visible in the UI (nav badge / greyed route / disabled
                       action) but not usable yet. Ships in a later release.

Anything NOT in this codebase's v1 scope at all (native mobile app, ERP
integrations, QR attendance, etc.) gets NO entry here and NO UI
representation — that is the "not_planned" bucket from the v1 Feature
Matrix, and it is intentionally invisible, not merely disabled.
"""

from typing import Dict, TypedDict

from fastapi import Depends, HTTPException, status

from app.core.rbac import get_current_user
from app.models.user import User


class Capability(TypedDict):
    status: str  # "live" | "coming_soon"
    label: str


# Only list features that are NOT "live" — keep this a pure exceptions list,
# matching the v1 Feature Matrix (see the plan doc, section 5).
CAPABILITIES: Dict[str, Capability] = {
    "clubs.knowledge_base_advanced": {
        "status": "coming_soon",
        "label": "Knowledge Base",
    },
    "clubs.ai_command_center": {
        "status": "coming_soon",
        "label": "AI Assistant",
    },
    "claims.student_ai_assistant": {
        "status": "coming_soon",
        "label": "Ask an Assistant",
    },
    # Clubs file yellow forms (pre-approval + claim sheet); a student filing
    # their own co-curricular claim is a later release.
    "claims.individual_co_curricular": {
        "status": "coming_soon",
        "label": "Individual yellow forms",
    },
    "faculty.offline_pwa": {
        "status": "coming_soon",
        "label": "Offline Access",
    },
    "faculty.dashboard_customization_advanced": {
        "status": "coming_soon",
        "label": "Drag-to-Reorder Widgets",
    },
}


def get_capabilities_map() -> Dict[str, str]:
    """Flat {slug: status} map, sent to the frontend via GET /auth/me."""
    return {slug: entry["status"] for slug, entry in CAPABILITIES.items()}


def is_live(slug: str) -> bool:
    entry = CAPABILITIES.get(slug)
    return entry is None or entry["status"] == "live"


class RequireCapability:
    """
    Structural twin of rbac.PermissionChecker, for endpoints that ARE
    implemented but are deliberately held back behind a "coming_soon" flag
    (e.g. a v1.1 feature soft-launched to internal testers before the UI
    exposes it). Never returns 404 for this — 404 already means "this
    specific record doesn't exist" elsewhere in this codebase; reusing it
    here would make the two indistinguishable to the frontend.
    """

    def __init__(self, slug: str):
        self.slug = slug

    def __call__(self, current_user: User = Depends(get_current_user)) -> User:
        if not is_live(self.slug):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"detail": "feature_not_enabled", "flag": self.slug},
            )
        return current_user


require_capability = RequireCapability
