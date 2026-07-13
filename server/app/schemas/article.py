"""文章 schemas。"""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.user import UserBrief
from app.schemas.common import PageMeta


class TagOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    slug: str


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    slug: str
    description: Optional[str] = None
    parent_id: Optional[int] = None
    sort_order: int = 0


class ArticleBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    excerpt: Optional[str] = Field(default=None, max_length=500)
    cover_image: Optional[str] = None
    category_id: Optional[int] = None
    tag_ids: List[int] = []


class ArticleCreate(ArticleBase):
    content: str = Field(min_length=1)
    status: str = Field(default="DRAFT", pattern="^(DRAFT|PENDING_REVIEW)$")


class ArticleUpdate(BaseModel):
    """文章更新（所有字段可选，支持草稿自动保存部分字段）。"""
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    content: Optional[str] = None
    excerpt: Optional[str] = Field(default=None, max_length=500)
    cover_image: Optional[str] = None
    category_id: Optional[int] = None
    tag_ids: Optional[List[int]] = None
    status: Optional[str] = Field(default=None, pattern="^(DRAFT|PENDING_REVIEW|PUBLISHED)$")


class ArticleOut(BaseModel):
    """文章详情。"""
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    slug: str
    content: str
    excerpt: Optional[str] = None
    cover_image: Optional[str] = None
    status: str
    views: int
    version: int = Field(default=1, description="乐观锁版本号")
    author: UserBrief
    category: Optional[CategoryOut] = None
    tags: List[TagOut] = []
    created_at: datetime
    updated_at: datetime
    published_at: Optional[datetime] = None
    # 当前用户的互动状态（登录时填充）
    is_liked: bool = False
    is_favorited: bool = False
    # 互动计数
    like_count: int = 0
    favorite_count: int = 0
    comment_count: int = 0


class ArticleBrief(BaseModel):
    """文章列表项（不含正文）。"""
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    slug: str
    excerpt: Optional[str] = None
    cover_image: Optional[str] = None
    views: int
    author: UserBrief
    category: Optional[CategoryOut] = None
    tags: List[TagOut] = []
    created_at: datetime
    published_at: Optional[datetime] = None
    # 互动计数（列表页展示）
    like_count: int = 0
    favorite_count: int = 0


class ArticleIndexItem(BaseModel):
    """供前端 flexsearch 建索引的精简数据。"""
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    slug: str
    content: str
    excerpt: Optional[str] = None
    author: UserBrief
    tags: List[TagOut] = []
    created_at: datetime
