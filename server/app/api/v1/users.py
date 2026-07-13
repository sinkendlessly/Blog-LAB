"""用户路由：资料查看 / 更新 / 关注 / 粉丝 / 关注列表 / 浏览历史。"""
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, get_current_user
from app.models.user import User
from app.schemas.user import UserOut, UserUpdate, UserBrief
from app.schemas.auth import SendCodeRequest, BindPhoneRequest
from app.services.user_service import UserService
from app.services.notification_service import NotificationService

router = APIRouter(prefix="/users", tags=["用户"])


@router.get("/{user_id}", response_model=UserOut)
async def get_user(user_id: int, db: AsyncSession = Depends(get_db)):
    """查看指定用户的公开资料。"""
    service = UserService(db)
    user = await service.get_by_id(user_id)
    await service.fill_stats(user)
    return user


@router.put("/me", response_model=UserOut)
async def update_me(
    payload: UserUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """更新当前用户资料。"""
    service = UserService(db)
    updated = await service.update_profile(user, payload)
    await service.fill_stats(updated)
    return updated


@router.put("/me/phone", response_model=UserOut)
async def bind_phone(
    payload: BindPhoneRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """绑定/换绑手机号（需验证码校验）。"""
    service = UserService(db)
    updated = await service.bind_phone(user, payload.phone, payload.code)
    await service.fill_stats(updated)
    return updated


@router.post("/{user_id}/follow")
async def toggle_follow(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """关注 / 取消关注（toggle 模式）。"""
    service = UserService(db)
    followed = await service.follow(user, user_id)
    # 关注时通知对方（不通知自己）
    if followed and user_id != user.id:
        notif = NotificationService(db)
        await notif.publish(
            user_id=user_id,
            actor_id=user.id,
            type="follow",
            title=f"{user.username} 关注了你",
            link=f"/user/{user.id}",
        )
    return {"message": "已关注" if followed else "已取消关注", "following": followed}


@router.get("/{user_id}/following", response_model=List[UserBrief])
async def list_following(user_id: int, db: AsyncSession = Depends(get_db)):
    """用户关注的人。"""
    service = UserService(db)
    return await service.list_following(user_id)


@router.get("/{user_id}/followers", response_model=List[UserBrief])
async def list_followers(user_id: int, db: AsyncSession = Depends(get_db)):
    """用户的粉丝。"""
    service = UserService(db)
    return await service.list_followers(user_id)
