"""搜索路由：文章索引数据 + 热门 + 归档 + SQL LIKE 搜索。"""
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_db
from app.models.article import Article
from app.schemas.article import ArticleBrief
from app.services.search_service import SearchService

router = APIRouter(prefix="/search", tags=["搜索"])


@router.get("", summary="搜索文章（标题 + 内容 LIKE）")
async def search_articles(
    q: str = Query(..., min_length=1, max_length=200, description="搜索关键词"),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """基于 SQL LIKE 的简单搜索，匹配标题和内容。"""
    keyword = f"%{q}%"
    result = await db.execute(
        select(Article)
        .where(
            Article.status == "PUBLISHED",
            or_(Article.title.like(keyword), Article.content.like(keyword)),
        )
        .options(selectinload(Article.author), selectinload(Article.tags), selectinload(Article.category))
        .order_by(Article.views.desc(), Article.published_at.desc())
        .limit(limit)
    )
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


@router.get("/hot", response_model=List[ArticleBrief])
async def hot_articles(
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """热门文章（Redis ZSet 数据源，无数据时按最新文章兜底）。"""
    service = SearchService(db)
    ids = await service.hot_articles(limit)
    if not ids:
        # ZSet 为空时，返回最新发布文章作为兜底
        result = await db.execute(
            select(Article)
            .where(Article.status == "PUBLISHED")
            .options(selectinload(Article.author), selectinload(Article.tags), selectinload(Article.category))
            .order_by(Article.published_at.desc())
            .limit(limit)
        )
        return [
            ArticleBrief(
                id=a.id, title=a.title, slug=a.slug, excerpt=a.excerpt,
                cover_image=a.cover_image, views=a.views, author=a.author,
                category=a.category, tags=a.tags, created_at=a.created_at,
                published_at=a.published_at,
            )
            for a in result.scalars().all()
        ]
    # 保持 ZSet 顺序
    result = await db.execute(
        select(Article)
        .where(Article.id.in_(ids), Article.status == "PUBLISHED")
        .options(selectinload(Article.author), selectinload(Article.tags), selectinload(Article.category))
    )
    articles_map = {a.id: a for a in result.scalars().all()}
    out = []
    for aid in ids:
        a = articles_map.get(aid)
        if a:
            out.append(ArticleBrief(
                id=a.id, title=a.title, slug=a.slug, excerpt=a.excerpt,
                cover_image=a.cover_image, views=a.views, author=a.author,
                category=a.category, tags=a.tags, created_at=a.created_at,
                published_at=a.published_at,
            ))
    return out


@router.get("/archive")
async def archive(db: AsyncSession = Depends(get_db)):
    """按月归档。"""
    service = SearchService(db)
    return await service.archive()
