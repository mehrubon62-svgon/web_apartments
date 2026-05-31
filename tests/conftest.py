"""Pytest fixtures.

Tests run against an isolated SQLite database (separate file), created fresh per
session, so they never touch the real Postgres DB. The app's get_db dependency
is overridden to use this test database.
"""
import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Point the app at a throwaway SQLite DB BEFORE importing app modules.
os.environ["DATABASE_URL"] = "sqlite:///./test_nestora.db"
# Disable real email sending in tests so verification codes are returned inline.
os.environ["SMTP_USER"] = ""
os.environ["SMTP_PASSWORD"] = ""

import models  # noqa: E402
from models import Base, get_db  # noqa: E402
import main  # noqa: E402

# Dedicated test engine/session
test_engine = create_engine(
    "sqlite:///./test_nestora.db", connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def _override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="session", autouse=True)
def _setup_database():
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    main.app.dependency_overrides[get_db] = _override_get_db
    yield
    Base.metadata.drop_all(bind=test_engine)
    try:
        os.remove("./test_nestora.db")
    except OSError:
        pass


@pytest.fixture()
def client():
    return TestClient(main.app)


def _register(client, role="buyer"):
    tag = uuid.uuid4().hex[:8]
    email = f"{role}_{tag}@example.com"
    resp = client.post(
        "/auth/register",
        json={"email": email, "password": "secret123", "role": role},
    )
    assert resp.status_code == 201, resp.text
    return email, resp.json()["access_token"]


@pytest.fixture()
def buyer(client):
    email, token = _register(client, "buyer")
    return {"email": email, "token": token, "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture()
def seller(client):
    email, token = _register(client, "seller")
    return {"email": email, "token": token, "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture()
def listing(client, seller):
    """A sale listing owned by `seller`."""
    resp = client.post(
        "/properties",
        headers=seller["headers"],
        json={
            "title": "Test Apartment", "type": "apartment", "deal_type": "sale",
            "price": 250000, "area": 55, "rooms": 2,
            "lat": 37.77, "lng": -122.41, "media": [],
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()
