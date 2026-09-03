"""The shared rate limiter.

Lives in its own module rather than in main.py because the endpoint modules
need to decorate with it, and main.py imports those — importing it from main
would be a cycle.
"""
import os

from slowapi import Limiter
from slowapi.util import get_remote_address

# Disabled under pytest: a 5/minute login cap would make the suite's ~40
# auth_headers() calls fail in a way that has nothing to do with what is
# being tested. The limit itself is covered directly in test_auth_throttle.py,
# which re-enables it.
_TESTING = "PYTEST_CURRENT_TEST" in os.environ or os.environ.get("DISABLE_RATE_LIMIT") == "1"

limiter = Limiter(key_func=get_remote_address, enabled=not _TESTING)

LOGIN_RATE_LIMIT = "5/minute"
