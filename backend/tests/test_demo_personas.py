"""The dev-only persona switcher, and the four fences around it.

This endpoint hands out a real token pair for a seeded account WITHOUT a
password. That is impersonation, so the tests that matter here are the ones
asserting it stays shut — not the one asserting it works.
"""
import pytest

from app.core.config import Settings, settings

ENDPOINT = "/api/v1/auth/demo-persona"
SEEDED = "teacher.class@christuniversity.in"


@pytest.fixture
def personas_enabled(monkeypatch):
    """Turn the flag on for the duration of one test."""
    monkeypatch.setattr(settings, "ENABLE_DEMO_PERSONAS", True)
    yield


@pytest.fixture
def personas_disabled(monkeypatch):
    """Force the flag off, regardless of the developer's local .env.

    Asserted explicitly rather than trusting the ambient config: a developer
    who has turned personas on locally must not thereby switch off the tests
    that check the feature stays shut.
    """
    monkeypatch.setattr(settings, "ENABLE_DEMO_PERSONAS", False)
    yield


class TestDisabledByDefault:
    def test_flag_defaults_off(self):
        """The DECLARED default must be off.

        Read off the field definition rather than the loaded `settings`, which
        reflects whatever the local .env says.
        """
        assert Settings.model_fields["ENABLE_DEMO_PERSONAS"].default is False

    def test_returns_404_when_disabled(self, client, personas_disabled):
        """404, not 401 or 403.

        A 403 would confirm the route exists and is simply switched off, which
        tells an attacker probing production exactly what to come back for. A
        404 is indistinguishable from a route that was never deployed.
        """
        res = client.post(ENDPOINT, json={"email": SEEDED})
        assert res.status_code == 404

    def test_issues_no_token_when_disabled(self, client, personas_disabled):
        res = client.post(ENDPOINT, json={"email": SEEDED})
        assert "access_token" not in res.json()

    def test_404_body_is_byte_identical_to_a_route_that_does_not_exist(
        self, client, personas_disabled
    ):
        """The 404 must not be distinguishable from FastAPI's own.

        Found in review: this endpoint answered {"detail": "Not found"} while
        FastAPI's built-in 404 is {"detail": "Not Found"}. One byte of
        capitalisation told a caller probing production the difference between
        "this route exists but is switched off" and "this route was never
        deployed" — which is the entire distinction the 404 exists to hide.
        """
        absent = client.get("/api/v1/auth/no-such-route-at-all")
        disabled_get = client.get(ENDPOINT)
        disabled_post = client.post(ENDPOINT, json={"email": SEEDED})

        assert absent.status_code == 404
        assert disabled_get.json() == absent.json()
        assert disabled_post.json() == absent.json()


class TestNotAdvertisedInTheSchema:
    """Masking the response is pointless while the schema publishes the route.

    Found in review. `include_in_schema` was left at its default, and this app
    serves `/api/v1/openapi.json` unconditionally in every environment — so
    the route, its request model and its response model were public
    regardless of the flag, and the 404 protected nothing.

    These build a FRESH app with the module re-imported under a forced flag,
    rather than reading the ambient one. `include_in_schema` is evaluated when
    the decorator runs, i.e. at import, so a test that inspected the already
    imported app would assert whatever the developer's local `.env` happened
    to say — and would go green for the wrong reason on a machine with
    personas switched on. Same hazard the fixtures above exist to avoid.
    """

    @staticmethod
    def _schema_with_flag(monkeypatch, *, enabled: bool) -> dict:
        """Re-import the auth endpoints with the flag forced, return the schema."""
        import importlib

        from fastapi import FastAPI

        from app.core.config import settings as live_settings

        monkeypatch.setattr(live_settings, "ENABLE_DEMO_PERSONAS", enabled)

        import app.api.v1.endpoints.auth as auth_module

        reloaded = importlib.reload(auth_module)
        probe = FastAPI()
        probe.include_router(reloaded.router, prefix="/api/v1/auth")
        try:
            return probe.openapi()
        finally:
            # Leave the real module as the rest of the suite expects to find
            # it, whatever this test forced.
            importlib.reload(auth_module)

    def test_route_is_hidden_from_the_schema_when_disabled(self, monkeypatch):
        schema = self._schema_with_flag(monkeypatch, enabled=False)
        assert [p for p in schema["paths"] if "persona" in p.lower()] == []

    def test_persona_models_are_hidden_from_the_schema_when_disabled(self, monkeypatch):
        schema = self._schema_with_flag(monkeypatch, enabled=False)
        models = schema.get("components", {}).get("schemas", {})
        # DemoPersonaOut lists real names and addresses; DemoPersonaRequest
        # hands an attacker the exact body shape to send.
        assert [k for k in models if "persona" in k.lower()] == []

    def test_route_IS_in_the_schema_when_enabled(self, monkeypatch):
        """The negative test's control.

        Without this, deleting the routes entirely would make the two tests
        above pass, and they would be asserting nothing.
        """
        schema = self._schema_with_flag(monkeypatch, enabled=True)
        assert [p for p in schema["paths"] if "persona" in p.lower()] != []


class TestAllowList:
    def test_rejects_an_account_not_on_the_list(self, client, personas_enabled):
        """The super_admin is a real, seeded, privileged account — and is
        deliberately NOT on the allow-list. Even with the flag on, this must
        not mint a token for it."""
        res = client.post(ENDPOINT, json={"email": "admin@christuniversity.in"})
        assert res.status_code == 404
        assert "access_token" not in res.json()

    def test_rejects_an_unknown_address(self, client, personas_enabled):
        res = client.post(ENDPOINT, json={"email": "attacker@example.com"})
        assert res.status_code == 404

    def test_not_allowed_looks_the_same_as_not_enabled(
        self, client, personas_enabled, monkeypatch
    ):
        """A caller cannot tell "not allow-listed" from "feature off".

        If the two differed, probing this endpoint with a list of addresses
        would reveal exactly which accounts are impersonatable.
        """
        not_allowed = client.post(ENDPOINT, json={"email": "admin@christuniversity.in"})

        monkeypatch.setattr(settings, "ENABLE_DEMO_PERSONAS", False)
        feature_off = client.post(ENDPOINT, json={"email": SEEDED})

        assert not_allowed.status_code == feature_off.status_code == 404
        assert not_allowed.json() == feature_off.json()

    def test_allow_list_holds_only_seeded_fixtures(self):
        """A real person's address appearing here would be a security bug."""
        for email in settings.DEMO_PERSONA_EMAILS:
            assert email.endswith("@christuniversity.in")
        assert "admin@christuniversity.in" not in settings.DEMO_PERSONA_EMAILS


class TestEnabled:
    def test_issues_a_usable_token_pair(self, client, personas_enabled):
        res = client.post(ENDPOINT, json={"email": SEEDED})
        assert res.status_code == 200

        body = res.json()
        assert body["access_token"]
        # A refresh token too: the session must behave like any other, which
        # means being refreshable and revocable rather than a special case.
        assert body["refresh_token"]
        assert body["expires_in"] > 0

    def test_the_token_authenticates_as_that_person(self, client, personas_enabled):
        token = client.post(ENDPOINT, json={"email": SEEDED}).json()["access_token"]
        me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        assert me.json()["email"] == SEEDED

    def test_the_session_can_be_revoked_like_any_other(self, client, personas_enabled):
        """Proof it went through the normal session path rather than a parallel
        one — a token that cannot be logged out is a token that never expires
        in practice."""
        body = client.post(ENDPOINT, json={"email": SEEDED}).json()
        res = client.post("/api/v1/auth/logout", json={"refresh_token": body["refresh_token"]})
        assert res.status_code == 200


class TestDiscovery:
    """`GET /auth/demo-persona` — how the UI decides whether to render at all."""

    def test_404_when_disabled(self, client, personas_disabled):
        assert client.get(ENDPOINT).status_code == 404

    def test_lists_the_allow_listed_accounts_when_enabled(self, client, personas_enabled):
        res = client.get(ENDPOINT)
        assert res.status_code == 200

        emails = [p["email"] for p in res.json()]
        assert SEEDED in emails
        # The privileged account is not offered, even here.
        assert "admin@christuniversity.in" not in emails

    def test_carries_enough_to_label_each_option(self, client, personas_enabled):
        """The client renders whatever this returns, so it must be readable
        without a second lookup."""
        for persona in client.get(ENDPOINT).json():
            assert persona["name"]
            assert persona["primary_role"]

    def test_matches_the_configured_allow_list(self, client, personas_enabled):
        """Server owns the list; the UI keeps no copy of its own."""
        emails = {p["email"] for p in client.get(ENDPOINT).json()}
        assert emails <= set(settings.DEMO_PERSONA_EMAILS)
