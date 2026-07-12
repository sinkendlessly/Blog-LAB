"""通知 schemas。"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.schemas.user import UserBrief


class NotificationActor(BaseModel):
    id: int
    username: str
    avatar: Optional[str] = None


class NotificationOut(BaseModel):
    id: int
    user_id: int
    actor: Optional[NotificationActor] = None
    type: str
    title: str
    content: str
    link: Optional[str] = None
    is_read: bool
    created_at: datetime


class UnreadCountOut(BaseModel):
    count: int
