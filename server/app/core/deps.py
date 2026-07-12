"""FastAPI 依赖注入：DB 会话、Redis、当前用户、角色校验。"""
import jwt
from typing import AsyncIterator, Optional

from fastapi import Depends, Header, Cookie, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis
from app.core.security import decode_token
from app.db.session import AsyncSessionLocal
from app.middleware.error_handler import AppException
from app.models.user import User
from app.services.auth_service import AuthService
from app.utils.redis_keys import RedisKeys


async def get_db() -> AsyncIterator[AsyncSession]:
    """注入异步数据库会话。"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


def get_redis_client():
    """注入 Redis 客户端。"""
    return get_redis()


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
    authorization: Optional[str] = Header(None),
) -> User:
    """从 Authorization: Bearer <token> 解析当前用户，校验 Redis 黑名单。"""
    if not authorization or not authorization.startswith("Bearer "):
        raise AppException("未提供认证凭证", 401, "UNAUTHORIZED")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = decode_token(token)
    except jwt.ExpiredSignatureError:
        raise AppException("登录已过期，请重新登录", 401, "TOKEN_EXPIRED")
    except jwt.PyJWTError:
        raise AppException("无效的认证凭证", 401, "TOKEN_INVALID")

    if payload.get("type") != "access":
        raise AppException("token 类型错误", 401, "TOKEN_TYPE_INVALID")

    jti = payload.get("jti")
    redis = get_redis()
    if await redis.get(RedisKeys.token_blacklist(jti)):
        raise AppException("登录已失效，请重新登录", 401, "TOKEN_REVOKED")

    user_id = payload.get("sub")
    user = await db.get(User, int(user_id))
    if not user or not user.is_active:
        raise AppException("用户不存在或已禁用", 401, "USER_INVALID")

    # 挂到 request.state 供后续使用
    request.state.user = user
    return user


async def get_current_user_optional(
    db: AsyncSession = Depends(get_db),
    authorization: Optional[str] = Header(None),
) -> Optional[User]:
    """可选认证：未登录返回 None，登录返回 user（用于公开页面的互动状态填充）。"""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        return await get_current_user_obj(db, authorization.removeprefix("Bearer ").strip())
    except AppException:
        return None


async def get_current_user_obj(db: AsyncSession, token: str) -> User:
    """内部辅助：根据 token 获取 user（含黑名单校验）。"""
    try:
        payload = decode_token(token)
    except jwt.ExpiredSignatureError:
        raise AppException("登录已过期，请重新登录", 401, "TOKEN_EXPIRED")
    except jwt.PyJWTError:
        raise AppException("无效的认证凭证", 401, "TOKEN_INVALID")
    if payload.get("type") != "access":
        raise AppException("token 类型错误", 401, "TOKEN_TYPE_INVALID")
    jti = payload.get("jti")
    redis = get_redis()
    if await redis.get(RedisKeys.token_blacklist(jti)):
        raise AppException("token 已失效", 401, "TOKEN_REVOKED")
    user = await db.get(User, int(payload.get("sub")))
    if not user or not user.is_active:
        raise AppException("用户无效", 401, "USER_INVALID")
    return user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    """要求当前用户为管理员。"""
    if user.role != "ADMIN":
        raise AppException("权限不足，需要管理员权限", 403, "FORBIDDEN")
    return user


async def require_super_admin(user: User = Depends(get_current_user)) -> User:
    """要求当前用户为超级管理员。"""
    if user.role != "ADMIN" or not user.is_super_admin:
        raise AppException("权限不足，需要超级管理员权限", 403, "FORBIDDEN")
    return user


def get_refresh_token_from_cookie(
    refresh_token: Optional[str] = Cookie(default=None),
) -> str:
    """从 HttpOnly Cookie 读取 refresh token。"""
    if not refresh_token:
        raise AppException("缺少 refresh token", 401, "REFRESH_TOKEN_MISSING")
    return refresh_token
