"""用户 schemas。"""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserBase(BaseModel):
    username: str
    email: EmailStr
    phone: Optional[str] = None
    avatar: Optional[str] = None
    bio: Optional[str] = None


class UserOut(UserBase):
    """用户公开信息（不含密码）。"""
    model_config = ConfigDict(from_attributes=True)
    id: int
    role: str
    is_active: bool
    is_super_admin: bool = False
    created_at: datetime
    # 统计数据（可选，按需填充）
    article_count: int = 0
    follower_count: int = 0
    following_count: int = 0
    total_views: int = 0
    total_likes: int = 0


class UserUpdate(BaseModel):
    """用户资料更新。"""
    username: Optional[str] = Field(default=None, min_length=2, max_length=50)
    phone: Optional[str] = None
    avatar: Optional[str] = None
    bio: Optional[str] = Field(default=None, max_length=500)


class ChangePassword(BaseModel):
    old_password: str
    new_password: str = Field(min_length=6, max_length=128)


class FollowOut(BaseModel):
    """关注关系。"""
    model_config = ConfigDict(from_attributes=True)
    follower_id: int
    following_id: int
    created_at: datetime


class UserBrief(BaseModel):
    """用户简要信息（用于列表展示）。"""
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    phone: Optional[str] = None
    avatar: Optional[str] = None
    bio: Optional[str] = None
