"""后台管理路由：统计 / 审核 / 用户管理（仅管理员）。"""
from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, require_admin, require_super_admin
from app.middleware.error_handler import AppException
from app.models.user import User
from app.models.article import Article
from app.models.tag import Tag
from app.schemas.article import ArticleBrief, ArticleOut, ArticleUpdate
from app.schemas.user import UserOut
from app.services.admin_service import AdminService

router = APIRouter(prefix="/admin", tags=["后台管理"])


@router.get("/stats/overview")
async def stats_overview(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    service = AdminService(db)
    return await service.stats_overview()


@router.get("/stats/trend")
async def stats_trend(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    service = AdminService(db)
    return await service.stats_trend(days)


@router.get("/articles/pending", response_model=List[ArticleBrief])
async def pending_articles(
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    service = AdminService(db)
    articles = await service.pending_articles(limit)
    return [
        ArticleBrief(
            id=a.id, title=a.title, slug=a.slug, excerpt=a.excerpt,
            cover_image=a.cover_image, views=a.views, author=a.author,
            category=a.category, tags=a.tags, created_at=a.created_at,
            published_at=a.published_at,
        )
        for a in articles
    ]


@router.post("/articles/{article_id}/review")
async def review_article(
    article_id: int,
    action: str = Query(..., description="approve / reject"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    service = AdminService(db)
    article = await service.review_article(article_id, action)
    return {"message": "已通过" if action == "approve" else "已拒绝", "status": article.status}


@router.post("/articles/{article_id}/pin")
async def toggle_pin(
    article_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """置顶/取消置顶文章。"""
    from app.models.article import Article
    article = await db.get(Article, article_id)
    if not article:
        raise AppException("文章不存在", 404, "ARTICLE_NOT_FOUND")
    article.is_pinned = not article.is_pinned
    await db.flush()
    return {"is_pinned": article.is_pinned, "message": "已置顶" if article.is_pinned else "已取消置顶"}


# ════════════════════════════════════════
# 文章管理
# ════════════════════════════════════════

@router.get("/articles", response_model=List[ArticleBrief])
async def admin_list_articles(
    status: str = Query(None, description="DRAFT / PENDING_REVIEW / PUBLISHED / REJECTED"),
    search: str = Query(None, description="标题搜索"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """管理员获取文章列表（可筛选状态 / 搜索标题）。"""
    from sqlalchemy import select, or_
    from sqlalchemy.orm import selectinload

    stmt = (
        select(Article)
        .options(selectinload(Article.author), selectinload(Article.tags), selectinload(Article.category))
        .order_by(Article.updated_at.desc())
        .offset(offset)
        .limit(limit)
    )
    if status:
        stmt = stmt.where(Article.status == status)
    if search:
        stmt = stmt.where(Article.title.like(f"%{search}%"))

    result = await db.execute(stmt)
    articles = result.scalars().all()
    return [
        ArticleBrief(
            id=a.id, title=a.title, slug=a.slug, excerpt=a.excerpt,
            cover_image=a.cover_image, views=a.views, author=a.author,
            category=a.category, tags=a.tags, created_at=a.created_at,
            published_at=a.published_at,
        )
        for a in articles
    ]


@router.get("/articles/{article_id}", response_model=ArticleOut)
async def admin_get_article(
    article_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """管理员获取文章详情（含全部字段，用于编辑）。"""
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(Article)
        .where(Article.id == article_id)
        .options(selectinload(Article.author), selectinload(Article.tags), selectinload(Article.category))
    )
    article = result.scalar_one_or_none()
    if not article:
        raise AppException("文章不存在", 404, "ARTICLE_NOT_FOUND")
    from app.services.counter_service import CounterService
    counter = CounterService(db)
    out = ArticleOut.model_validate(article, from_attributes=True)
    out.like_count = await counter.like_count(article.id)
    out.favorite_count = await counter.favorite_count(article.id)
    out.comment_count = await counter.comment_count(article.id)
    return out


@router.put("/articles/{article_id}", response_model=ArticleOut)
async def admin_update_article(
    article_id: int,
    payload: ArticleUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """管理员编辑文章（可改标题/内容/分类/标签/状态）。"""
    result = await db.execute(
        select(Article).where(Article.id == article_id)
    )
    article = result.scalar_one_or_none()
    if not article:
        raise AppException("文章不存在", 404, "ARTICLE_NOT_FOUND")

    if payload.title is not None:
        article.title = payload.title
    if payload.content is not None:
        article.content = payload.content
    if payload.excerpt is not None:
        article.excerpt = payload.excerpt
    if payload.cover_image is not None:
        article.cover_image = payload.cover_image
    if payload.category_id is not None:
        article.category_id = payload.category_id
    if payload.status is not None:
        from datetime import datetime, timezone
        if payload.status == "PUBLISHED" and article.status != "PUBLISHED":
            article.published_at = datetime.now(timezone.utc)
        article.status = payload.status

    # 同步标签
    if payload.tag_ids is not None:
        if payload.tag_ids:
            tag_result = await db.execute(select(Tag).where(Tag.id.in_(payload.tag_ids)))
            article.tags = list(tag_result.scalars().all())
        else:
            article.tags = []

    await db.flush()
    await db.refresh(article, attribute_names=["author", "tags", "category"])
    return ArticleOut.model_validate(article, from_attributes=True)


@router.delete("/articles/{article_id}")
async def admin_delete_article(
    article_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """管理员删除任意文章。"""
    article = await db.get(Article, article_id)
    if not article:
        raise AppException("文章不存在", 404, "ARTICLE_NOT_FOUND")
    await db.delete(article)
    await db.flush()
    return {"message": "文章已删除"}


@router.post("/ranking/refresh")
async def refresh_ranking(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """手动刷新热门排行。"""
    from app.services.recommendation_service import RecommendationService
    svc = RecommendationService(db)
    count = await svc.refresh_all()
    return {"message": f"已刷新 {count} 篇文章热度"}


@router.get("/users", response_model=List[UserOut])
async def list_users(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    service = AdminService(db)
    users = await service.list_users(limit, offset)
    from app.services.user_service import UserService
    us = UserService(db)
    out = []
    for u in users:
        await us.fill_stats(u)
        out.append(UserOut.model_validate(u, from_attributes=True))
    return out


@router.put("/users/{user_id}/status")
async def set_user_status(
    user_id: int,
    is_active: bool = Query(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    service = AdminService(db)
    u = await service.set_user_status(user, user_id, is_active)
    return {"message": "已启用" if is_active else "已禁用", "is_active": u.is_active}


@router.put("/users/{user_id}/role")
async def set_user_role(
    user_id: int,
    role: str = Query(..., description="USER / ADMIN"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_super_admin),
):
    service = AdminService(db)
    u = await service.set_user_role(user_id, role)
    return {"message": "角色已更新", "role": u.role}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_super_admin),
):
    """删除用户（级联删除其文章、评论、互动记录）。仅超级管理员可用。"""
    service = AdminService(db)
    await service.delete_user(user_id)
    return {"message": "用户已删除"}
