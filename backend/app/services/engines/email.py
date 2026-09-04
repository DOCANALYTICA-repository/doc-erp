"""Delivering notifications outside the application.

The approval workflows depend on people NOTICING. Until now nothing reached
anyone outside the app: a Faculty Coordinator learned that a plan needed him
only by opening the portal and looking — which, per the field audit, is
precisely why he never did.

Design notes worth stating, because each is a decision rather than an accident:

  * Delivery NEVER blocks or fails a request. A claim that was successfully
    submitted must not 500 because an SMTP host is slow. Failures are logged
    and swallowed at the call site.

  * With no SMTP host configured — every developer machine, and CI — the
    backend runs in `log` mode and writes what it WOULD have sent. That keeps
    the code path exercised everywhere instead of only in production, which is
    how mail code normally rots.

  * Bodies are plain text. An HTML mail pipeline is a template system, an
    inliner and a rendering matrix; the content here is three lines and a
    link, and a text/plain part is what every client renders correctly.
"""
import logging
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Iterable, Optional

from app.core.config import settings

logger = logging.getLogger("doc_portal.email")


@dataclass(frozen=True)
class OutboundEmail:
    to: str
    subject: str
    body: str
    #: Where the recipient should end up. Appended to the body as a full URL,
    #: because a relative path in an email is useless.
    link_path: Optional[str] = None


class EmailEngine:
    """Sends mail, or convincingly pretends to when unconfigured."""

    @property
    def is_configured(self) -> bool:
        return bool(settings.SMTP_HOST and settings.EMAIL_FROM)

    def _absolute(self, link_path: Optional[str]) -> Optional[str]:
        if not link_path:
            return None
        base = (settings.PUBLIC_APP_URL or "").rstrip("/")
        if not base:
            return None
        return f"{base}{link_path if link_path.startswith('/') else '/' + link_path}"

    def _render(self, message: OutboundEmail) -> str:
        parts = [message.body.strip()]
        url = self._absolute(message.link_path)
        if url:
            parts.append(f"\nOpen it here: {url}")
        parts.append(
            "\n—\nDOC Portal, Department of Commerce, CHRIST (Deemed to be University)."
            "\nYou are receiving this because it needs your action. "
            "Change what you are emailed about in Settings."
        )
        return "\n".join(parts)

    def send(self, message: OutboundEmail) -> bool:
        """Send one email. Returns whether it was actually handed off.

        Never raises: every caller is in the middle of a workflow that has
        already succeeded, and delivery is not allowed to undo that.
        """
        rendered = self._render(message)

        if not self.is_configured:
            # The log-mode path. Deliberately at INFO with the full body, so a
            # developer can read exactly what a user would have received.
            logger.info(
                "email(not sent: no SMTP configured) to=%s subject=%s\n%s",
                message.to, message.subject, rendered,
            )
            return False

        try:
            email = EmailMessage()
            email["From"] = settings.EMAIL_FROM
            email["To"] = message.to
            email["Subject"] = message.subject
            email.set_content(rendered)

            if settings.SMTP_USE_SSL:
                transport = smtplib.SMTP_SSL(
                    settings.SMTP_HOST, settings.SMTP_PORT,
                    timeout=settings.SMTP_TIMEOUT_SECONDS,
                    context=ssl.create_default_context(),
                )
            else:
                transport = smtplib.SMTP(
                    settings.SMTP_HOST, settings.SMTP_PORT,
                    timeout=settings.SMTP_TIMEOUT_SECONDS,
                )

            with transport as server:
                if settings.SMTP_USE_TLS and not settings.SMTP_USE_SSL:
                    server.starttls(context=ssl.create_default_context())
                if settings.SMTP_USERNAME:
                    server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                server.send_message(email)

            logger.info("email_sent to=%s subject=%s", message.to, message.subject)
            return True

        except Exception:
            # A failed send is a logged incident, never a failed request.
            logger.exception(
                "email_failed to=%s subject=%s", message.to, message.subject,
            )
            return False

    def send_many(self, messages: Iterable[OutboundEmail]) -> int:
        return sum(1 for message in messages if self.send(message))


email_engine = EmailEngine()
