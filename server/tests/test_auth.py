"""认证路由测试。

覆盖：注册 / 登录 / 获取用户 / 登出 / 修改密码 / 刷新 token
"""
import pytest
from httpx import AsyncClient

API_PREFIX = "/api/v1/auth"


# ═══════════════════════════════════════════════
# 注册
# ═══════════════════════════════════════════════

class TestRegister:
    """POST /api/v1/auth/register"""

    async def test_register_success(self, async_client: AsyncClient):
        """正常注册 → 201 + UserOut"""
        resp = await async_client.post(f"{API_PREFIX}/register", json={
            "username": "newuser",
            "email": "newuser@example.com",
            "password": "password123",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["username"] == "newuser"
        assert data["email"] == "newuser@example.com"
        assert "id" in data

    async def test_register_dup_email(self, async_client: AsyncClient, test_user):
        """重复邮箱 → 409 EMAIL_EXISTS"""
        resp = await async_client.post(f"{API_PREFIX}/register", json={
            "username": "another",
            "email": "testuser@example.com",  # test_user 的邮箱
            "password": "password123",
        })
        assert resp.status_code == 409
        assert resp.json()["code"] == "EMAIL_EXISTS"

    async def test_register_dup_username(self, async_client: AsyncClient, test_user):
        """重复用户名 → 409 USERNAME_EXISTS"""
        resp = await async_client.post(f"{API_PREFIX}/register", json={
            "username": "testuser",
            "email": "another@example.com",
            "password": "password123",
        })
        assert resp.status_code == 409
        assert resp.json()["code"] == "USERNAME_EXISTS"

    async def test_register_invalid_email(self, async_client: AsyncClient):
        """非法邮箱格式 → 422"""
        resp = await async_client.post(f"{API_PREFIX}/register", json={
            "username": "newuser",
            "email": "not-an-email",
            "password": "password123",
        })
        assert resp.status_code == 422

    async def test_register_short_password(self, async_client: AsyncClient):
        """密码 < 6 位 → 422"""
        resp = await async_client.post(f"{API_PREFIX}/register", json={
            "username": "newuser",
            "email": "newuser@example.com",
            "password": "12345",
        })
        assert resp.status_code == 422


# ═══════════════════════════════════════════════
# 登录
# ═══════════════════════════════════════════════

class TestLogin:
    """POST /api/v1/auth/login"""

    async def test_login_by_email(self, async_client: AsyncClient, test_user):
        """用邮箱登录 → 200 + TokenResponse + HttpOnly Cookie"""
        resp = await async_client.post(f"{API_PREFIX}/login", json={
            "account": "testuser@example.com",
            "password": "testpass123",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["expires_in"] > 0
        # 检查 refresh_token cookie
        assert "refresh_token" in resp.cookies

    async def test_login_by_username(self, async_client: AsyncClient, test_user):
        """用用户名登录 → 200"""
        resp = await async_client.post(f"{API_PREFIX}/login", json={
            "account": "testuser",
            "password": "testpass123",
        })
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    async def test_login_wrong_password(self, async_client: AsyncClient, test_user):
        """密码错误 → 401 INVALID_CREDENTIALS"""
        resp = await async_client.post(f"{API_PREFIX}/login", json={
            "account": "testuser@example.com",
            "password": "wrongpass",
        })
        assert resp.status_code == 401
        assert resp.json()["code"] == "INVALID_CREDENTIALS"

    async def test_login_nonexistent(self, async_client: AsyncClient):
        """账号不存在 → 401 INVALID_CREDENTIALS"""
        resp = await async_client.post(f"{API_PREFIX}/login", json={
            "account": "nobody@example.com",
            "password": "password123",
        })
        assert resp.status_code == 401

    async def test_login_disabled_user(self, async_client: AsyncClient, db_session):
        """已禁用用户 → 403 ACCOUNT_DISABLED"""
        from app.models.user import User
        from app.core.security import hash_password

        user = User(
            email="disabled@example.com",
            username="disableduser",
            password_hash=hash_password("pass123"),
            role="USER",
            is_active=False,
        )
        db_session.add(user)
        await db_session.flush()

        resp = await async_client.post(f"{API_PREFIX}/login", json={
            "account": "disabled@example.com",
            "password": "pass123",
        })
        assert resp.status_code == 403
        assert resp.json()["code"] == "ACCOUNT_DISABLED"


# ═══════════════════════════════════════════════
# 获取当前用户
# ═══════════════════════════════════════════════

class TestMe:
    """GET /api/v1/auth/me"""

    async def test_me_success(self, async_client: AsyncClient, auth_headers):
        """正常获取用户信息 → 200"""
        resp = await async_client.get(f"{API_PREFIX}/me", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["username"] == "testuser"
        assert data["email"] == "testuser@example.com"

    async def test_me_no_token(self, async_client: AsyncClient):
        """未携带 token → 401"""
        resp = await async_client.get(f"{API_PREFIX}/me")
        assert resp.status_code == 401

    async def test_me_expired_token(self, async_client: AsyncClient):
        """过期 token → 401 TOKEN_EXPIRED"""
        import jwt
        from app.core.config import settings

        expired = jwt.encode(
            {"sub": "1", "type": "access", "exp": 0, "iat": 0, "jti": "test"},
            settings.JWT_SECRET_KEY,
            algorithm=settings.JWT_ALGORITHM,
        )
        resp = await async_client.get(
            f"{API_PREFIX}/me",
            headers={"Authorization": f"Bearer {expired}"},
        )
        assert resp.status_code == 401
        assert resp.json()["code"] == "TOKEN_EXPIRED"


# ═══════════════════════════════════════════════
# 登出
# ═══════════════════════════════════════════════

class TestLogout:
    """POST /api/v1/auth/logout"""

    async def test_logout_success(self, async_client: AsyncClient, test_user):
        """正常登出 → 200 + Cookie 清除"""
        # 先登录拿到 refresh_token cookie
        login_resp = await async_client.post(f"{API_PREFIX}/login", json={
            "account": "testuser@example.com",
            "password": "testpass123",
        })
        refresh_cookie = login_resp.cookies.get("refresh_token")

        # 用 cookie + auth header 登出
        async_client.cookies.set("refresh_token", refresh_cookie)
        resp = await async_client.post(
            f"{API_PREFIX}/logout",
            headers={"Authorization": f"Bearer {login_resp.json()['access_token']}"},
        )
        assert resp.status_code == 200
        set_cookie = resp.headers.get("set-cookie", "")
        assert "refresh_token=" in set_cookie

    async def test_logout_twice(self, async_client: AsyncClient, test_user):
        """重复登出不应报错（幂等）"""
        # 先登录
        login_resp = await async_client.post(f"{API_PREFIX}/login", json={
            "account": "testuser@example.com",
            "password": "testpass123",
        })
        token = login_resp.json()["access_token"]
        refresh_cookie = login_resp.cookies.get("refresh_token")

        async_client.cookies.set("refresh_token", refresh_cookie)
        resp1 = await async_client.post(
            f"{API_PREFIX}/logout",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp1.status_code == 200

        # 第二次登出（cookie 已清，但 access token 仍有效）
        resp2 = await async_client.post(
            f"{API_PREFIX}/logout",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp2.status_code == 200


# ═══════════════════════════════════════════════
# 修改密码
# ═══════════════════════════════════════════════

class TestChangePassword:
    """PUT /api/v1/auth/me/password"""

    async def test_change_password_success(self, async_client: AsyncClient, auth_headers):
        """正常修改 → 200"""
        resp = await async_client.put(f"{API_PREFIX}/me/password", json={
            "old_password": "testpass123",
            "new_password": "newpass123",
        }, headers=auth_headers)
        assert resp.status_code == 200

    async def test_change_password_wrong_old(self, async_client: AsyncClient, auth_headers):
        """原密码错误 → 400 OLD_PASSWORD_WRONG"""
        resp = await async_client.put(f"{API_PREFIX}/me/password", json={
            "old_password": "wrongpass",
            "new_password": "newpass123",
        }, headers=auth_headers)
        assert resp.status_code == 400
        assert resp.json()["code"] == "OLD_PASSWORD_WRONG"


# ═══════════════════════════════════════════════
# 刷新 token
# ═══════════════════════════════════════════════

class TestRefresh:
    """POST /api/v1/auth/refresh"""

    async def test_refresh_success(self, async_client: AsyncClient, test_user):
        """用 refresh cookie 刷新 → 200"""
        # 先登录拿到 refresh_token cookie
        login_resp = await async_client.post(f"{API_PREFIX}/login", json={
            "account": "testuser@example.com",
            "password": "testpass123",
        })
        refresh_cookie = login_resp.cookies.get("refresh_token")
        assert refresh_cookie is not None

        # 用 cookie 刷新 token
        async_client.cookies.set("refresh_token", refresh_cookie)
        resp = await async_client.post(f"{API_PREFIX}/refresh")
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    async def test_refresh_no_cookie(self, async_client: AsyncClient):
        """无 cookie → 401 REFRESH_TOKEN_MISSING"""
        resp = await async_client.post(f"{API_PREFIX}/refresh")
        assert resp.status_code == 401
