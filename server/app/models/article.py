"""Article 模型：content 使用 LONGTEXT 存储 Markdown 文本。"""
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import String, Text, Integer, DateTime, func, Enum, ForeignKey
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.category import Category
    from app.models.tag import Tag
    from app.models.comment import Comment


class Article(Base):
    __tablename__ = "articles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    slug: Mapped[str] = mapped_column(String(300), unique=True, index=True, nullable=False)
    content: Mapped[str] = mapped_column(Text().with_variant(LONGTEXT(), "mysql"), nullable=False)
    excerpt: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    cover_image: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(
        Enum("DRAFT", "PENDING_REVIEW", "PUBLISHED", "REJECTED", name="article_status"),
        default="DRAFT",
        nullable=False,
        index=True,
    )
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    category_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), index=True, nullable=True
    )
    views: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_pinned: Mapped[bool] = mapped_column(Integer, default=0, nullable=False, comment="管理员置顶")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    # 关系
    author: Mapped["User"] = relationship(back_populates="articles")
    category: Mapped[Optional["Category"]] = relationship(back_populates="articles")
    tags: Mapped[List["Tag"]] = relationship(
        secondary="article_tags", back_populates="articles", lazy="selectin"
    )
    comments: Mapped[List["Comment"]] = relationship(
        back_populates="article", cascade="all, delete-orphan"
    )
