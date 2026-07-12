"""认证服务：注册 / 登录 / 刷新 / 登出 / Token 黑名单。"""
from datetime import datetime, timezone
from typing import Optional

import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.core.redis import get_redis
from app.middleware.error_handler import AppException
from app.models.user import User
from app.schemas.auth import UserRegister, UserLogin, SmsRegisterRequest
from app.services.sms_service import sms_service
from app.utils.redis_keys import RedisKeys


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.redis = get_redis()

    # ============ 注册 ============
    async def register(self, payload: UserRegister) -> User:
        # 检查邮箱
        exists_email = await self.db.execute(
            select(User).where(User.email == payload.email)
        )
        if exists_email.scalar_one_or_none():
            raise AppException("该邮箱已被注册", 409, "EMAIL_EXISTS")

        # 检查用户名
        exists_name = await self.db.execute(
            select(User).where(User.username == payload.username)
        )
        if exists_name.scalar_one_or_none():
            raise AppException("该用户名已被占用", 409, "USERNAME_EXISTS")

        user = User(
            email=payload.email,
            username=payload.username,
            password_hash=hash_password(payload.password),
        )
        self.db.add(user)
        await self.db.flush()
        await self.db.refresh(user)
        return user

    # ============ 登录 ============
    async def login(self, payload: UserLogin) -> tuple[User, str, str, str]:
        """返回 (user, access_token, refresh_token, refresh_jti)。"""
        stmt = select(User).where(
            (User.email == payload.account) | (User.username == payload.account)
        )
        result = await self.db.execute(stmt)
        user = result.scalar_one_or_none()
        if not user or not verify_password(payload.password, user.password_hash):
            raise AppException("账号或密码错误", 401, "INVALID_CREDENTIALS")
        if not user.is_active:
            raise AppException("账号已被禁用", 403, "ACCOUNT_DISABLED")

        access_token, _ = create_access_token(
            subject=str(user.id), extra={"role": user.role, "username": user.username}
        )
        refresh_token, refresh_jti = create_refresh_token(subject=str(user.id))
        return user, access_token, refresh_token, refresh_jti

    # ============ 刷新 Token ============
    async def refresh(self, refresh_token: str) -> tuple[User, str, str, str]:
        """用 refresh token 换取新的 access + refresh token。"""
        try:
            payload = decode_token(refresh_token)
        except jwt.ExpiredSignatureError:
            raise AppException("refresh token 已过期，请重新登录", 401, "TOKEN_EXPIRED")
        except jwt.PyJWTError:
            raise AppException("无效的 refresh token", 401, "TOKEN_INVALID")

        if payload.get("type") != "refresh":
            raise AppException("token 类型错误", 401, "TOKEN_TYPE_INVALID")

        jti = payload.get("jti")
        if await self._is_blacklisted(jti):
            raise AppException("refresh token 已失效", 401, "TOKEN_REVOKED")

        user_id = payload.get("sub")
        user = await self.db.get(User, int(user_id))
        if not user or not user.is_active:
            raise AppException("用户不存在或已禁用", 401, "USER_INVALID")

        # 旧的 refresh token 加入黑名单（轮换）
        await self._blacklist_token(jti, settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400)

        access_token, _ = create_access_token(
            subject=str(user.id), extra={"role": user.role, "username": user.username}
        )
        new_refresh, new_refresh_jti = create_refresh_token(subject=str(user.id))
        return user, access_token, new_refresh, new_refresh_jti

    # ============ 登出 ============
    async def logout(self, access_token: str, refresh_token: Optional[str]) -> None:
        """将 access/refresh token 的 jti 写入黑名单。"""
        try:
            access_payload = decode_token(access_token)
            await self._blacklist_token(
                access_payload.get("jti"),
                settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            )
        except jwt.PyJWTError:
            pass  # access token 无效则忽略

        if refresh_token:
            try:
                refresh_payload = decode_token(refresh_token)
                await self._blacklist_token(
                    refresh_payload.get("jti"),
                    settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
                )
            except jwt.PyJWTError:
                pass

    # ============ 修改密码（让所有旧 token 失效需前端重新登录，此处不做全量吊销） ============
    async def change_password(
        self, user: User, old_password: str, new_password: str
    ) -> None:
        if not verify_password(old_password, user.password_hash):
            raise AppException("原密码错误", 400, "OLD_PASSWORD_WRONG")
        user.password_hash = hash_password(new_password)
        await self.db.flush()

    # ============ 手机号验证码登录 ============
    async def login_by_sms(self, phone: str, code: str) -> tuple[User, str, str, str]:
        """手机号 + 验证码登录，返回 (user, access_token, refresh_token, refresh_jti)。"""
        await sms_service.verify_code(phone, code)

        stmt = select(User).where(User.phone == phone)
        result = await self.db.execute(stmt)
        user = result.scalar_one_or_none()
        if not user:
            raise AppException("该手机号未注册", 404, "PHONE_NOT_REGISTERED")
        if not user.is_active:
            raise AppException("账号已被禁用", 403, "ACCOUNT_DISABLED")

        access_token, _ = create_access_token(
            subject=str(user.id), extra={"role": user.role, "username": user.username}
        )
        refresh_token, refresh_jti = create_refresh_token(subject=str(user.id))
        return user, access_token, refresh_token, refresh_jti

    # ============ 手机号验证码注册 ============
    async def register_by_sms(self, payload: SmsRegisterRequest) -> tuple[User, str, str, str]:
        """手机号 + 验证码注册，返回 (user, access_token, refresh_token, refresh_jti)。"""
        await sms_service.verify_code(payload.phone, code=payload.code)

        # 检查手机号
        exists_phone = await self.db.execute(
            select(User).where(User.phone == payload.phone)
        )
        if exists_phone.scalar_one_or_none():
            raise AppException("该手机号已注册", 409, "PHONE_EXISTS")

        # 检查用户名
        exists_name = await self.db.execute(
            select(User).where(User.username == payload.username)
        )
        if exists_name.scalar_one_or_none():
            raise AppException("该用户名已被占用", 409, "USERNAME_EXISTS")

        user = User(
            phone=payload.phone,
            username=payload.username,
            email=f"{payload.phone}@phone.blogshare.com",  # 手机号注册时生成占位邮箱
            password_hash=hash_password(payload.password),
        )
        self.db.add(user)
        await self.db.flush()
        await self.db.refresh(user)

        # 注册后直接生成 token，避免前端再用已消耗的验证码重复登录
        access_token, _ = create_access_token(
            subject=str(user.id), extra={"role": user.role, "username": user.username}
        )
        refresh_token, refresh_jti = create_refresh_token(subject=str(user.id))
        return user, access_token, refresh_token, refresh_jti

    # ============ Token 黑名单 ============
    async def _is_blacklisted(self, jti: str) -> bool:
        return bool(await self.redis.get(RedisKeys.token_blacklist(jti)))

    async def _blacklist_token(self, jti: Optional[str], ttl_seconds: int) -> None:
        if not jti:
            return
        # 仅在 TTL 为正时写入
        if ttl_seconds <= 0:
            return
        await self.redis.set(
            RedisKeys.token_blacklist(jti), "1", ex=int(ttl_seconds)
        )


def get_token_expiry_seconds(token_type: str) -> int:
    if token_type == "access":
        return settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    return settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400
