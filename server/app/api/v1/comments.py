"""评论路由：创建 / 列表（树形）/ 删除 / 点赞。"""
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, get_current_user, get_current_user_optional
from app.models.article import Article
from app.models.comment import Comment
from app.models.user import User
from app.middleware.error_handler import AppException
from app.schemas.comment import CommentCreate, CommentOut
from app.schemas.common import OkResponse
from app.services.comment_service import CommentService
from app.services.notification_service import NotificationService

router = APIRouter(prefix="/comments", tags=["评论"])


@router.post("", response_model=CommentOut, status_code=201)
async def create_comment(
    payload: CommentCreate,
    article_id: int = Query(..., description="文章 ID"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    service = CommentService(db)
    comment = await service.create(article_id, user, payload.content, payload.parent_id)

    # 通知（不通知自己）
    notif = NotificationService(db)
    if payload.parent_id:
        # 回复评论 → 通知被回复者
        parent = await db.get(Comment, payload.parent_id)
        if parent and parent.user_id != user.id:
            await notif.create(
                user_id=parent.user_id,
                actor_id=user.id,
                type="reply",
                title=f"{user.username} 回复了你的评论",
                content=payload.content[:100],
                link=f"/article/{article_id}",
            )
    else:
        # 评论文章 → 通知文章作者
        result = await db.scalar(select(Article.author_id).where(Article.id == article_id))
        if result and result != user.id:
            await notif.create(
                user_id=result,
                actor_id=user.id,
                type="comment",
                title=f"{user.username} 评论了你的文章",
                content=payload.content[:100],
                link=f"/article/{article_id}",
            )

    # 直接从当前已认证的 user 构造 UserBrief，避免 ORM 关系懒加载问题
    from app.schemas.user import UserBrief
    return CommentOut(
        id=comment.id,
        content=comment.content,
        article_id=comment.article_id,
        user=UserBrief(
            id=user.id,
            username=user.username,
            phone=user.phone,
            avatar=user.avatar,
            bio=user.bio,
        ),
        parent_id=comment.parent_id,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        replies=[],
    )


@router.get("", response_model=List[CommentOut])
async def list_comments(
    article_id: int = Query(...),
    sort: str = Query("latest", regex="^(latest|oldest|hot)$"),
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_optional),
):
    """获取文章评论树（含点赞状态）。"""
    service = CommentService(db)
    return await service.list_tree(article_id, sort, user.id if user else None)


@router.post("/{comment_id}/like")
async def like_comment(
    comment_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """点赞/取消点赞评论。"""
    service = CommentService(db)
    return await service.toggle_like(comment_id, user.id)


@router.delete("/{comment_id}", response_model=OkResponse)
async def delete_comment(
    comment_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    comment = await db.get(Comment, comment_id)
    if not comment:
        raise AppException("评论不存在", 404, "COMMENT_NOT_FOUND")
    service = CommentService(db)
    await service.delete(comment, user)
    return OkResponse(message="已删除")
