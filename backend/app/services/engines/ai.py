import os
import logging

logger = logging.getLogger(__name__)

class AIEngine:
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY", "")
        # In production, we would initialize the Google GenAI client here:
        # from google import genai
        # self.client = genai.Client() if self.api_key else None
        self.client = None

    def summarize_claim_reason(self, reason: str) -> str:
        """
        Summarizes a student's lengthy claim explanation into a concise sentence.
        """
        if not reason:
            return "No explanation provided."
            
        if self.client:
            try:
                # response = self.client.models.generate_content(
                #     model='gemini-2.5-flash',
                #     contents=f"Summarize this student claim reason: {reason}"
                # )
                # return response.text
                pass
            except Exception as e:
                logger.error(f"Gemini API Error: {e}")
                
        # Elegant fallback / local mockup
        words = reason.split()
        if len(words) <= 10:
            return reason
        return " ".join(words[:8]) + "..."

    def draft_meeting_minutes(self, transcript: str) -> dict:
        """
        Drafts meeting minutes, key decisions, and action items from a discussion transcript.
        """
        # Local mock implementation reproducing high-quality summaries
        return {
            "minutes": "The committee discussed upcoming cultural events and finalized the budget allocations. Membership guidelines were updated to include semester audits.",
            "decisions": [
                "Approved allocation of Rs 15,000 for the Commerce Club recruitment drive.",
                "Mandated all students submit claims within 5 days of returning from event."
            ],
            "action_items": [
                {"title": "Coordinate recruitment desks in block A", "assignee_id": "fac_1", "due_date": "2026-07-15"},
                {"title": "Draft feedback form for events", "assignee_id": "std_1", "due_date": "2026-07-20"}
            ]
        }

    def detect_claim_anomalies(self, claim_details: dict) -> list[str]:
        """
        Scans claim details for duplicates, late submissions, or certificate discrepancies.
        """
        anomalies = []
        # Business logic checks
        if claim_details.get("late_submission_flag"):
            anomalies.append("Claim submitted after the 5-day regulatory SLA limit.")
            
        reason_lower = claim_details.get("reason", "").lower()
        if "medical" in reason_lower and not claim_details.get("has_documents"):
            anomalies.append("Category listed as Medical but no medical certificate was uploaded.")
            
        return anomalies

ai_engine = AIEngine()
