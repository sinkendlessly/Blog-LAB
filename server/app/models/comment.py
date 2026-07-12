"""Comment 嵌套回复模型。"""
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Text, DateTime, func, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.article import Article


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    article_id: Mapped[int] = mapped_column(
        ForeignKey("articles.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    parent_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("comments.id", ondelete="CASCADE"), index=True, nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # 关系
    article: Mapped["Article"] = relationship(back_populates="comments")
    user: Mapped["User"] = relationship(back_populates="comments")
    parent: Mapped[Optional["Comment"]] = relationship(
        remote_side="Comment.id", back_populates="replies"
    )
    replies: Mapped[List["Comment"]] = relationship(
        back_populates="parent", cascade="all, delete-orphan"
    )
