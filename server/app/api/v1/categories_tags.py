"""分类与标签公开路由：供侧栏/浏览页使用。"""
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_db
from app.models.category import Category
from app.models.tag import Tag, article_tags
from app.models.article import Article

router = APIRouter(tags=["分类与标签"])


@router.get("/categories")
async def list_categories(db: AsyncSession = Depends(get_db)):
    """返回所有分类及其文章数量。"""
    result = await db.execute(
        select(
            Category.id,
            Category.name,
            Category.slug,
            Category.description,
            Category.sort_order,
            func.count(Article.id).label("article_count"),
        )
        .outerjoin(Article, Article.category_id == Category.id)
        .group_by(Category.id)
        .order_by(Category.sort_order)
    )
    return [
        {
            "id": r.id,
            "name": r.name,
            "slug": r.slug,
            "description": r.description,
            "article_count": r.article_count,
        }
        for r in result.all()
    ]


@router.get("/tags")
async def list_tags(db: AsyncSession = Depends(get_db)):
    """返回所有标签及其文章数量。"""
    result = await db.execute(
        select(
            Tag.id,
            Tag.name,
            Tag.slug,
            func.count(article_tags.c.article_id).label("article_count"),
        )
        .outerjoin(article_tags, Tag.id == article_tags.c.tag_id)
        .group_by(Tag.id)
        .order_by(Tag.name)
    )
    return [
        {
            "id": r.id,
            "name": r.name,
            "slug": r.slug,
            "article_count": r.article_count,
        }
        for r in result.all()
    ]
