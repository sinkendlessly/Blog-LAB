"""互动路由：点赞 / 收藏 / 分享 / 收藏列表。"""
from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, get_current_user
from app.models.article import Article
from app.models.user import User
from app.schemas.article import ArticleBrief
from app.schemas.common import OkResponse
from app.services.interaction_service import InteractionService
from app.services.counter_service import CounterService
from app.services.notification_service import NotificationService

router = APIRouter(prefix="/interactions", tags=["互动"])


async def _get_article_author_id(db: AsyncSession, article_id: int) -> int:
    """获取文章作者 ID。"""
    result = await db.scalar(select(Article.author_id).where(Article.id == article_id))
    return result or 0


@router.post("/articles/{article_id}/like")
async def toggle_like(
    article_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    service = InteractionService(db)
    liked = await service.toggle_like(user.id, article_id)
    counter = CounterService(db)
    count = await counter.like_count(article_id)

    # 通知文章作者（不通知自己）
    if liked:
        author_id = await _get_article_author_id(db, article_id)
        if author_id and author_id != user.id:
            notif = NotificationService(db)
            await notif.create(
                user_id=author_id,
                actor_id=user.id,
                type="like",
                title=f"{user.username} 赞了你的文章",
                link=f"/article/{article_id}",
            )

    return {"liked": liked, "like_count": count}


@router.post("/articles/{article_id}/favorite")
async def toggle_favorite(
    article_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    service = InteractionService(db)
    favorited = await service.toggle_favorite(user.id, article_id)
    counter = CounterService(db)
    count = await counter.favorite_count(article_id)

    # 通知文章作者（不通知自己）
    if favorited:
        author_id = await _get_article_author_id(db, article_id)
        if author_id and author_id != user.id:
            notif = NotificationService(db)
            await notif.create(
                user_id=author_id,
                actor_id=user.id,
                type="favorite",
                title=f"{user.username} 收藏了你的文章",
                link=f"/article/{article_id}",
            )

    return {"favorited": favorited, "favorite_count": count}


@router.post("/articles/{article_id}/share")
async def record_share(
    article_id: int,
    platform: str = Query(..., description="weibo/wechat/twitter/link"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    service = InteractionService(db)
    await service.record_share(article_id, user.id, platform)
    return OkResponse(message="已记录分享")


@router.get("/me/favorites", response_model=List[ArticleBrief])
async def my_favorites(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """我收藏的文章列表。"""
    service = InteractionService(db)
    articles = await service.favorite_articles(user.id)
    return [
        ArticleBrief(
            id=a.id, title=a.title, slug=a.slug, excerpt=a.excerpt,
            cover_image=a.cover_image, views=a.views, author=a.author,
            category=a.category, tags=a.tags, created_at=a.created_at,
            published_at=a.published_at,
        )
        for a in articles
    ]
