"""认证 schemas。"""
from pydantic import BaseModel, EmailStr, Field


class UserRegister(BaseModel):
    username: str = Field(min_length=2, max_length=50)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class UserLogin(BaseModel):
    account: str = Field(description="邮箱或用户名")
    password: str


class TokenResponse(BaseModel):
    """登录成功响应（access token 放 body，refresh token 放 HttpOnly Cookie）。"""
    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(description="access token 有效期（秒）")


class RefreshRequest(BaseModel):
    """从 HttpOnly Cookie 读取 refresh token，body 可空。"""
    pass


class LogoutResponse(BaseModel):
    message: str = "已登出"


class SendCodeRequest(BaseModel):
    """发送短信验证码。"""
    phone: str = Field(pattern=r"^1[3-9]\d{9}$", description="中国手机号")


class SmsLoginRequest(BaseModel):
    """手机号 + 验证码登录。"""
    phone: str = Field(pattern=r"^1[3-9]\d{9}$")
    code: str = Field(min_length=6, max_length=6)


class SmsRegisterRequest(BaseModel):
    """手机号 + 验证码注册。"""
    phone: str = Field(pattern=r"^1[3-9]\d{9}$")
    code: str = Field(min_length=6, max_length=6)
    username: str = Field(min_length=2, max_length=50)
    password: str = Field(min_length=6, max_length=128)


class BindPhoneRequest(BaseModel):
    """绑定/换绑手机号。"""
    phone: str = Field(pattern=r"^1[3-9]\d{9}$")
    code: str = Field(min_length=6, max_length=6)
