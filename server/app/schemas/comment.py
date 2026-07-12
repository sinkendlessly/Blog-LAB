"""评论 schemas。"""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.user import UserBrief


class CommentCreate(BaseModel):
    content: str = Field(min_length=1, max_length=2000)
    parent_id: Optional[int] = None


class CommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    content: str
    article_id: int
    user: UserBrief
    parent_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    replies: List["CommentOut"] = []
    like_count: int = 0
    is_liked: bool = False


class CommentListItem(BaseModel):
    """评论列表项（不含 replies）。"""
    model_config = ConfigDict(from_attributes=True)
    id: int
    content: str
    article_id: int
    user: UserBrief
    parent_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime


CommentOut.model_rebuild()
