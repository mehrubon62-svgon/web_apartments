import uuid


def test_register_and_login(client):
    email = f"u_{uuid.uuid4().hex[:8]}@example.com"
    r = client.post("/auth/register", json={"email": email, "password": "secret123", "role": "buyer"})
    assert r.status_code == 201
    assert "access_token" in r.json()

    r = client.post("/auth/login", json={"email": email, "password": "secret123"})
    assert r.status_code == 200
    assert r.json()["access_token"]


def test_login_wrong_password(client):
    email = f"u_{uuid.uuid4().hex[:8]}@example.com"
    client.post("/auth/register", json={"email": email, "password": "secret123", "role": "buyer"})
    r = client.post("/auth/login", json={"email": email, "password": "WRONG"})
    assert r.status_code == 401


def test_duplicate_email_rejected(client):
    email = f"u_{uuid.uuid4().hex[:8]}@example.com"
    client.post("/auth/register", json={"email": email, "password": "secret123", "role": "buyer"})
    r = client.post("/auth/register", json={"email": email, "password": "secret123", "role": "buyer"})
    assert r.status_code == 400


def test_me_requires_auth(client):
    assert client.get("/users/me").status_code in (401, 403)


def test_me_returns_profile(client, buyer):
    r = client.get("/users/me", headers=buyer["headers"])
    assert r.status_code == 200
    assert r.json()["email"] == buyer["email"]


def test_password_reset_flow(client):
    email = f"u_{uuid.uuid4().hex[:8]}@example.com"
    client.post("/auth/register", json={"email": email, "password": "secret123", "role": "buyer"})

    r = client.post("/auth/send-code", json={"email": email, "purpose": "reset"})
    assert r.status_code == 200
    code = r.json()["dev_code"]

    r = client.post("/auth/reset-password", json={"email": email, "code": code, "new_password": "newpass123"})
    assert r.status_code == 200

    assert client.post("/auth/login", json={"email": email, "password": "secret123"}).status_code == 401
    assert client.post("/auth/login", json={"email": email, "password": "newpass123"}).status_code == 200
