from .conftest import auth_headers


def test_directory_requires_auth(client):
    r = client.get("/api/v1/users/directory")
    assert r.status_code == 401


def test_directory_lists_only_faculty(client):
    h = auth_headers(client, "student.regular@christuniversity.in", "123")
    r = client.get("/api/v1/users/directory", headers=h)
    assert r.status_code == 200
    names = {f["name"] for f in r.json()}
    assert "Prof. Sarah Abraham" in names
    assert "Vikram Aditya" not in names  # a student, must not appear


def test_directory_search_by_designation(client):
    h = auth_headers(client, "student.regular@christuniversity.in", "123")
    r = client.get("/api/v1/users/directory?q=HOD", headers=h)
    assert r.status_code == 200
    assert any("Kishor" in f["name"] for f in r.json())
