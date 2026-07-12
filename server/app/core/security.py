"""安全工具：JWT 双 Token 生成/验证 + 密码哈希 + Redis 黑名单校验。

注意：本文件为骨架，详细实现在「后端核心 API」阶段完成。
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ============ 密码哈希 ============
def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ============ JWT ============
def _create_token(
    subject: str,
    expires_delta: timedelta,
    token_type: str,
    extra: Optional[dict] = None,
) -> tuple[str, str]:
    """创建 JWT，返回 (token, jti)。"""
    jti = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "jti": jti,
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
    }
    if extra:
        payload.update(extra)
    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return token, jti


def create_access_token(subject: str, extra: Optional[dict] = None) -> tuple[str, str]:
    return _create_token(
        subject,
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        "access",
        extra,
    )


def create_refresh_token(subject: str, extra: Optional[dict] = None) -> tuple[str, str]:
    return _create_token(
        subject,
        timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        "refresh",
        extra,
    )


def decode_token(token: str) -> dict:
    """解码并验证 JWT，失败抛出 jwt 异常。"""
    return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
