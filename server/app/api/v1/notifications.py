"""通知路由：列表 / 未读数 / 标记已读。"""
from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, get_current_user
from app.middleware.error_handler import AppException
from app.models.user import User
from app.schemas.notification import NotificationOut, UnreadCountOut
from app.schemas.common import OkResponse
from app.services.notification_service import NotificationService

router = APIRouter(prefix="/notifications", tags=["通知"])


def _to_out(n) -> NotificationOut:
    """将 ORM 模型转为 Pydantic schema。"""
    actor = None
    if n.actor:
        from app.schemas.notification import NotificationActor
        actor = NotificationActor(
            id=n.actor.id,
            username=n.actor.username,
            avatar=n.actor.avatar,
        )
    return NotificationOut(
        id=n.id,
        user_id=n.user_id,
        actor=actor,
        type=n.type,
        title=n.title,
        content=n.content,
        link=n.link,
        is_read=n.is_read,
        created_at=n.created_at,
    )


@router.get("", response_model=List[NotificationOut])
async def list_notifications(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """获取当前用户的通知列表。"""
    service = NotificationService(db)
    notifications = await service.list_recent(user.id, limit, offset)
    return [_to_out(n) for n in notifications]


@router.get("/unread-count", response_model=UnreadCountOut)
async def unread_count(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """未读通知数量。"""
    service = NotificationService(db)
    count = await service.unread_count(user.id)
    return UnreadCountOut(count=count)


@router.put("/{notification_id}/read", response_model=OkResponse)
async def mark_read(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """标记单条通知为已读。"""
    service = NotificationService(db)
    ok = await service.mark_read(notification_id, user.id)
    if not ok:
        raise AppException("通知不存在", 404, "NOTIFICATION_NOT_FOUND")
    return OkResponse(message="已标记为已读")


@router.put("/read-all", response_model=OkResponse)
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """标记所有通知为已读。"""
    service = NotificationService(db)
    count = await service.mark_all_read(user.id)
    return OkResponse(message=f"已标记 {count} 条通知为已读")
