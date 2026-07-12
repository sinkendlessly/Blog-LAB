"""Interaction 统一模型：点赞 / 收藏 / 分享 / 评论点赞。

替代原来的 Like + Favorite + CommentLike + Share 四张表。
"""
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import String, DateTime, func, ForeignKey, Integer, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class Interaction(Base):
    """用户互动记录（点赞/收藏/分享）。

    UNIQUE(user_id, target_id, target_type, action) 确保幂等。
    """
    __tablename__ = "interactions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    target_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(
        SAEnum("article", "comment", name="interaction_target"), nullable=False
    )
    action: Mapped[str] = mapped_column(
        SAEnum("like", "favorite", "share", name="interaction_action"), nullable=False
    )
    platform: Mapped[str | None] = mapped_column(String(30), nullable=True, comment="分享平台")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship()


class Follow(Base):
    """用户关注关系（联合主键：follower 关注 following）。"""
    __tablename__ = "follows"

    follower_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    following_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    follower: Mapped["User"] = relationship(
        foreign_keys="Follow.follower_id", back_populates="following"
    )
    following: Mapped["User"] = relationship(
        foreign_keys="Follow.following_id", back_populates="followers"
    )
