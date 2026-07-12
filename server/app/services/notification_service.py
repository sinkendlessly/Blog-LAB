"""通知服务：生成和查询系统通知。"""
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.notification import Notification


class NotificationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        user_id: int,
        type: str,
        title: str,
        content: str = "",
        link: Optional[str] = None,
        actor_id: Optional[int] = None,
    ) -> Notification:
        """创建一条通知。"""
        notif = Notification(
            user_id=user_id,
            actor_id=actor_id,
            type=type,
            title=title,
            content=content,
            link=link,
        )
        self.db.add(notif)
        await self.db.flush()
        return notif

    async def list_recent(
        self,
        user_id: int,
        limit: int = 20,
        offset: int = 0,
    ) -> List[Notification]:
        """获取用户最近的通知列表。"""
        result = await self.db.execute(
            select(Notification)
            .where(Notification.user_id == user_id)
            .order_by(Notification.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def unread_count(self, user_id: int) -> int:
        """未读通知数量。"""
        result = await self.db.scalar(
            select(func.count(Notification.id))
            .where(Notification.user_id == user_id, Notification.is_read == False)
        )
        return result or 0

    async def mark_read(self, notification_id: int, user_id: int) -> bool:
        """标记单条通知为已读。"""
        result = await self.db.execute(
            update(Notification)
            .where(Notification.id == notification_id, Notification.user_id == user_id)
            .values(is_read=True)
        )
        await self.db.flush()
        return result.rowcount > 0

    async def mark_all_read(self, user_id: int) -> int:
        """标记所有通知为已读，返回更新的条数。"""
        result = await self.db.execute(
            update(Notification)
            .where(Notification.user_id == user_id, Notification.is_read == False)
            .values(is_read=True)
        )
        await self.db.flush()
        return result.rowcount
