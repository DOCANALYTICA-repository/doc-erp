"""Claim-reason condensing.

WHAT WAS DELETED HERE, AND WHY
-------------------------------
This module used to contain two more methods, both with zero callers:

  * draft_meeting_minutes() returned a FIXED dict of invented minutes,
    invented decisions and an invented "Rs 15,000" allocation, assigned to
    user ids that do not exist in the seed — regardless of the transcript
    passed in. It was labelled a "local mock implementation reproducing
    high-quality summaries".

  * detect_claim_anomalies() was two if-statements behind an AI-sounding name.

The Master PRD's own rule is that AI must never modify institutional records.
Fabricated minutes presented as a record of what a committee decided would be
considerably worse than having no feature at all, and leaving the method in
the tree was a liability the moment somebody wired it up by mistake. Neither
was ever reachable, so deleting them removes no capability.

What remains is honest about itself: it is a truncator, not a summarizer.
"""
import logging

logger = logging.getLogger(__name__)

MAX_PREVIEW_WORDS = 8


class ClaimReasonPreview:
    """Shortens a long claim explanation for list and card views.

    Deliberately NOT called a summarizer: it takes the first few words and
    appends an ellipsis. It never paraphrases, never infers and never
    invents — a reviewer reading a preview is reading the student's own
    opening words, not a machine's characterisation of them.
    """

    def summarize_claim_reason(self, reason: str) -> str:
        if not reason:
            return "No explanation provided."

        words = reason.split()
        if len(words) <= MAX_PREVIEW_WORDS + 2:
            return reason
        return " ".join(words[:MAX_PREVIEW_WORDS]) + "..."


ai_engine = ClaimReasonPreview()
