from backend.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from backend.config import settings
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from jose import jwt


class TestPasswordHashing:
    def test_hash_and_verify(self):
        h = hash_password("test123")
        assert h != "test123"
        assert verify_password("test123", h) is True

    def test_wrong_password_fails(self):
        h = hash_password("correct")
        assert verify_password("wrong", h) is False


class TestJWT:
    def test_create_and_decode(self):
        token = create_access_token({"sub": "zoro", "uid": "abc-123"})
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        assert payload["sub"] == "zoro"
        assert payload["uid"] == "abc-123"
        assert "exp" in payload

    def test_expired_token_raises(self):
        from datetime import datetime, timedelta, timezone

        from jose import jwt as _jwt

        expired = _jwt.encode(
            {
                "sub": "zoro",
                "uid": "abc",
                "exp": datetime.now(timezone.utc) - timedelta(hours=1),
            },
            settings.jwt_secret,
            algorithm=settings.jwt_algorithm,
        )
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=expired)
        try:
            get_current_user(creds)
            assert False, "Should have raised"
        except HTTPException as e:
            assert e.status_code == 401
            assert "expired" in e.detail.lower()


class TestLoginEndpoint:
    def test_login_success(self, client, httpx_mock, user_id):
        httpx_mock.add_response(
            url=f"{settings.supabase_url}/rest/v1/users?username=eq.zoro&limit=1",
            json=[
                {
                    "id": user_id,
                    "username": "zoro",
                    "password_hash": hash_password("6646"),
                }
            ],
        )
        resp = client.post("/auth/login", json={"username": "zoro", "password": "6646"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["token_type"] == "bearer"
        assert data["username"] == "zoro"
        assert len(data["access_token"]) > 0

    def test_login_wrong_password(self, client, httpx_mock):
        httpx_mock.add_response(
            url=f"{settings.supabase_url}/rest/v1/users?username=eq.zoro&limit=1",
            json=[
                {
                    "id": "abc",
                    "username": "zoro",
                    "password_hash": hash_password("correct"),
                }
            ],
        )
        resp = client.post("/auth/login", json={"username": "zoro", "password": "wrong"})
        assert resp.status_code == 401

    def test_login_user_not_found(self, client, httpx_mock):
        httpx_mock.add_response(
            url=f"{settings.supabase_url}/rest/v1/users?username=eq.ghost&limit=1",
            json=[],
        )
        resp = client.post("/auth/login", json={"username": "ghost", "password": "x"})
        assert resp.status_code == 401


class TestSignupEndpoint:
    def test_signup_success(self, client, httpx_mock, user_id):
        # 1. Mock select check for existing username -> should return empty list
        httpx_mock.add_response(
            method="GET",
            url=f"{settings.supabase_url}/rest/v1/users?username=eq.newguy&limit=1",
            json=[],
        )
        # 2. Mock insert of new user -> representation
        httpx_mock.add_response(
            method="POST",
            url=f"{settings.supabase_url}/rest/v1/users",
            json=[{
                "id": user_id,
                "username": "newguy",
                "password_hash": "somehashedpassword",
            }],
        )

        resp = client.post("/auth/signup", json={"username": "newguy", "password": "securepassword"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["token_type"] == "bearer"
        assert data["username"] == "newguy"
        assert len(data["access_token"]) > 0

    def test_signup_existing_user(self, client, httpx_mock):
        # Mock select check -> user exists
        httpx_mock.add_response(
            method="GET",
            url=f"{settings.supabase_url}/rest/v1/users?username=eq.existingguy&limit=1",
            json=[{
                "id": "existing-id",
                "username": "existingguy",
                "password_hash": "somehashedpassword",
            }],
        )

        resp = client.post("/auth/signup", json={"username": "existingguy", "password": "securepassword"})
        assert resp.status_code == 400
        assert "already registered" in resp.json()["detail"].lower()

