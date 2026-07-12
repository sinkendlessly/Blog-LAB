"""通用 schemas：分页、统一响应。"""
from typing import Generic, List, Optional, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class PageMeta(BaseModel):
    """游标分页元数据。"""
    next_cursor: Optional[str] = None
    has_more: bool = False
    total: Optional[int] = None


class PageResponse(BaseModel, Generic[T]):
    """游标分页响应。"""
    items: List[T]
    meta: PageMeta


class OkResponse(BaseModel):
    """简单成功响应。"""
    message: str = "ok"
