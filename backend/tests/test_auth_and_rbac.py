from .conftest import auth_headers


def test_wrong_password_is_rejected_not_mocked(client):
    r = client.post(
        "/api/v1/auth/login",
        data={"username": "student.regular@christuniversity.in", "password": "WRONG"},
    )
    assert r.status_code == 400


def test_login_returns_permissions_and_capabilities(client):
    h = auth_headers(client, "student.regular@christuniversity.in", "student123")
    me = client.get("/api/v1/auth/me", headers=h).json()
    assert "claims:submit" in me["permissions"]
    assert "*" not in me["permissions"]
    assert me["capabilities"]["clubs.ai_command_center"] == "coming_soon"


def test_super_admin_gets_wildcard_permission(client):
    h = auth_headers(client, "admin@christuniversity.in", "admin123")
    me = client.get("/api/v1/auth/me", headers=h).json()
    assert me["permissions"] == ["*"]
