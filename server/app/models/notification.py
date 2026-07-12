"""通知模型。"""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import String, Integer, Boolean, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Notification(Base):
    """系统通知：有人评论/点赞/收藏/关注时生成。"""

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
        comment="接收通知的用户"
    )
    actor_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
        comment="触发通知的用户（点赞者/评论者等）"
    )
    type: Mapped[str] = mapped_column(
        String(32), nullable=False, default="system",
        comment="通知类型: like / favorite / comment / reply / follow / system"
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    link: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True, comment="点击通知跳转的链接"
    )
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    # 关系
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id], lazy="joined")
    actor: Mapped[Optional["User"]] = relationship("User", foreign_keys=[actor_id], lazy="joined")
