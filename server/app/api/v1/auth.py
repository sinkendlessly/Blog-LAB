"""认证路由：注册 / 登录 / 刷新 / 登出 / 修改密码。"""
from typing import Optional

from fastapi import APIRouter, Depends, Response, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_db, get_current_user, get_refresh_token_from_cookie
from app.middleware.error_handler import AppException
from app.models.user import User
from app.schemas.auth import (
    UserRegister, UserLogin, TokenResponse, RefreshRequest, LogoutResponse,
    SendCodeRequest, SmsLoginRequest, SmsRegisterRequest,
)
from app.schemas.user import UserOut, ChangePassword
from app.services.auth_service import AuthService
from app.services.sms_service import sms_service
from app.services.user_service import UserService

router = APIRouter(prefix="/auth", tags=["认证"])


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    """将 refresh token 写入 HttpOnly Cookie。"""
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=not settings.DEBUG,  # 生产环境强制 HTTPS
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/v1/auth",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key="refresh_token", path="/api/v1/auth")


@router.post("/register", response_model=UserOut, status_code=201)
async def register(payload: UserRegister, db: AsyncSession = Depends(get_db)):
    service = AuthService(db)
    user = await service.register(payload)
    await UserService(db).fill_stats(user)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: UserLogin,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    service = AuthService(db)
    user, access_token, refresh_token, _ = await service.login(payload)
    _set_refresh_cookie(response, refresh_token)
    return TokenResponse(
        access_token=access_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    response: Response,
    refresh_token: str = Depends(get_refresh_token_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    service = AuthService(db)
    user, access_token, new_refresh, _ = await service.refresh(refresh_token)
    _set_refresh_cookie(response, new_refresh)
    return TokenResponse(
        access_token=access_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/logout", response_model=LogoutResponse)
async def logout(
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db),
    refresh_token: Optional[str] = Depends(get_refresh_token_from_cookie),
):
    # 从请求头取 access token
    auth_header = request.headers.get("authorization", "")
    access_token = ""
    if auth_header.startswith("Bearer "):
        access_token = auth_header.removeprefix("Bearer ").strip()
    service = AuthService(db)
    await service.logout(access_token, refresh_token)
    _clear_refresh_cookie(response)
    return LogoutResponse()


@router.get("/me", response_model=UserOut)
async def get_me(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """获取当前登录用户信息。"""
    await UserService(db).fill_stats(user)
    return user


@router.put("/me/password", response_model=LogoutResponse)
async def change_password(
    payload: ChangePassword,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """修改密码。修改成功后前端应重新登录（旧 token 仍有效，建议引导登出）。"""
    service = AuthService(db)
    await service.change_password(user, payload.old_password, payload.new_password)
    return LogoutResponse(message="密码修改成功，请重新登录")


# ============ 短信验证码 ============

@router.post("/sms/send", response_model=LogoutResponse)
async def send_sms_code(payload: SendCodeRequest):
    """发送短信验证码（60秒内不可重发）。"""
    await sms_service.send_code(payload.phone)
    return LogoutResponse(message="验证码已发送")


@router.post("/sms/login", response_model=TokenResponse)
async def sms_login(
    payload: SmsLoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """手机号 + 验证码登录。"""
    service = AuthService(db)
    user, access_token, refresh_token, _ = await service.login_by_sms(
        payload.phone, payload.code
    )
    _set_refresh_cookie(response, refresh_token)
    return TokenResponse(
        access_token=access_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/sms/register", status_code=201)
async def sms_register(
    payload: SmsRegisterRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """手机号 + 验证码注册（直接返回 token，免二次登录）。"""
    service = AuthService(db)
    user, access_token, refresh_token, _ = await service.register_by_sms(payload)
    _set_refresh_cookie(response, refresh_token)
    return TokenResponse(
        access_token=access_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
