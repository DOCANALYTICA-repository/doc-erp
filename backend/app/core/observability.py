"""Request correlation and a stable error shape.

main.py installed no middleware except CORS: no global exception handler, no
request id, nothing. Every unhandled 500 was a blank line in a console nobody
was watching, and the client got FastAPI's bare {"detail": "Internal Server
Error"} with nothing to quote in a bug report.
"""
import logging
import time
import uuid
from contextvars import ContextVar

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("doc_portal")

REQUEST_ID_HEADER = "X-Request-ID"
_request_id: ContextVar[str] = ContextVar("request_id", default="-")


def current_request_id() -> str:
    return _request_id.get()


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """Tag every request with an id, echo it back, and log how it went.

    The id is accepted from the client when supplied (so a browser session, a
    proxy and the API can be lined up in one trace) and generated otherwise.
    """

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get(REQUEST_ID_HEADER) or uuid.uuid4().hex[:16]
        token = _request_id.set(request_id)
        request.state.request_id = request_id
        started = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception:
            elapsed_ms = (time.perf_counter() - started) * 1000
            logger.exception(
                "request_failed id=%s %s %s after %.1fms",
                request_id, request.method, request.url.path, elapsed_ms,
            )
            raise
        finally:
            _request_id.reset(token)

        elapsed_ms = (time.perf_counter() - started) * 1000
        response.headers[REQUEST_ID_HEADER] = request_id
        logger.info(
            "request id=%s %s %s -> %s %.1fms",
            request_id, request.method, request.url.path, response.status_code, elapsed_ms,
        )
        return response


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """One stable error shape, and the id needed to find the traceback.

    The message is deliberately generic — an exception string can carry a
    connection URL, a SQL fragment or a filesystem path — but the request id is
    returned so a user can quote it and the log line can be found directly.
    """
    request_id = getattr(request.state, "request_id", current_request_id())
    logger.exception("unhandled_exception id=%s %s %s", request_id, request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Something went wrong on our side. Please try again.",
            "request_id": request_id,
        },
        headers={REQUEST_ID_HEADER: request_id},
    )
