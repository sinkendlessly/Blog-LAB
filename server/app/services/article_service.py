"""文章服务：CRUD / 草稿 / 发布 / 列表缓存 / 索引数据。"""
import logging
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from sqlalchemy import select, func, update, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.redis import get_redis
from app.middleware.error_handler import AppException
from app.models.article import Article
from app.models.category import Category
from app.models.tag import Tag
from app.models.user import User
from app.schemas.article import ArticleCreate, ArticleUpdate
from app.services.cache_service import CacheService
from app.services.counter_service import CounterService
from app.services.recommendation_service import RecommendationService
from app.utils.pagination import apply_cursor, encode_cursor
from app.utils.redis_keys import RedisKeys
from app.utils.slug import slugify

logger = logging.getLogger(__name__)

ARTICLES_PER_PAGE = 20


class ArticleService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.redis = get_redis()
        self.cache = CacheService()
        self.counter = CounterService(db)

    # ============ 创建 ============
    async def create(self, author: User, payload: ArticleCreate) -> Article:
        slug = await self._unique_slug(payload.title)
        article = Article(
            title=payload.title,
            slug=slug,
            content=payload.content,
            excerpt=payload.excerpt or self._gen_excerpt(payload.content),
            cover_image=payload.cover_image,
            status=payload.status,
            author_id=author.id,
            category_id=payload.category_id,
        )
        if payload.status == "PUBLISHED":
            article.published_at = datetime.now(timezone.utc)
        self.db.add(article)
        await self.db.flush()
        await self.db.refresh(article)

        # 标签关联
        if payload.tag_ids:
            await self._sync_tags(article, payload.tag_ids)

        # 失效列表缓存
        await self.cache.delete_pattern("cache:articles:list:*")
        return article

    # ============ 更新（支持草稿自动保存部分字段） ============
    async def update(
        self, article: Article, author: User, payload: ArticleUpdate
    ) -> Article:
        if article.author_id != author.id and author.role != "ADMIN":
            raise AppException("无权修改他人文章", 403, "FORBIDDEN")

        old_status = article.status
        if payload.title is not None:
            article.title = payload.title
        if payload.content is not None:
            article.content = payload.content
            if payload.excerpt is None:
                article.excerpt = self._gen_excerpt(payload.content)
        if payload.excerpt is not None:
            article.excerpt = payload.excerpt
        if payload.cover_image is not None:
            article.cover_image = payload.cover_image
        if payload.category_id is not None:
            article.category_id = payload.category_id
        if payload.tag_ids is not None:
            await self._sync_tags(article, payload.tag_ids)
        if payload.status is not None:
            article.status = payload.status
            # DRAFT → PUBLISHED 时记录发布时间
            if payload.status == "PUBLISHED" and old_status != "PUBLISHED":
                article.published_at = datetime.now(timezone.utc)
            # 重新变为草稿则清空发布时间
            if payload.status == "DRAFT":
                article.published_at = None

        await self.db.flush()
        await self.db.refresh(article)

        # 失效缓存
        await self.cache.delete_pattern("cache:articles:list:*")
        await self.redis.delete(f"cache:article:detail:{article.id}")

        # 发布/下架时刷新热度
        if article.status == "PUBLISHED":
            await RecommendationService(self.db).refresh_article_score(article.id)
        else:
            await self.redis.zrem(RedisKeys.HOT_ARTICLES, str(article.id))
        return article

    # ============ 查询 ============
    async def get_by_id(self, article_id: int) -> Article:
        article = await self.db.get(
            Article,
            article_id,
            options=[selectinload(Article.author), selectinload(Article.tags), selectinload(Article.category)],
        )
        if not article:
            raise AppException("文章不存在", 404, "ARTICLE_NOT_FOUND")
        return article

    async def get_by_slug(self, slug: str) -> Article:
        result = await self.db.execute(
            select(Article)
            .where(Article.slug == slug)
            .options(selectinload(Article.author), selectinload(Article.tags), selectinload(Article.category))
        )
        article = result.scalar_one_or_none()
        if not article:
            raise AppException("文章不存在", 404, "ARTICLE_NOT_FOUND")
        return article

    # ============ 删除 ============
    async def delete(self, article: Article, author: User) -> None:
        if article.author_id != author.id and author.role != "ADMIN":
            raise AppException("无权删除他人文章", 403, "FORBIDDEN")
        await self.db.delete(article)
        await self.db.flush()
        await self.cache.delete_pattern("cache:articles:list:*")
        await self.redis.delete(f"cache:article:detail:{article.id}")
        await self.redis.zrem(RedisKeys.HOT_ARTICLES, str(article.id))

    # ============ 列表（已发布，游标分页 + 列表缓存） ============
    async def list_published(
        self,
        cursor: Optional[str] = None,
        category_id: Optional[int] = None,
        tag_id: Optional[int] = None,
        author_id: Optional[int] = None,
        limit: int = ARTICLES_PER_PAGE,
    ) -> Tuple[List[Article], Optional[str]]:
        stmt = (
            select(Article)
            .where(Article.status == "PUBLISHED")
            .options(selectinload(Article.author), selectinload(Article.tags), selectinload(Article.category))
            .order_by(Article.is_pinned.desc(), Article.published_at.desc(), Article.id.desc())
        )
        if category_id is not None:
            stmt = stmt.where(Article.category_id == category_id)
        if author_id is not None:
            stmt = stmt.where(Article.author_id == author_id)
        if tag_id is not None:
            stmt = stmt.join(Article.tags).where(Tag.id == tag_id)
        stmt = apply_cursor(stmt, cursor, Article.published_at, Article.id).limit(limit + 1)

        result = await self.db.execute(stmt)
        items = list(result.scalars().all())

        has_more = len(items) > limit
        if has_more:
            items = items[:limit]
        next_cursor = None
        if has_more and items:
            last = items[-1]
            next_cursor = encode_cursor(
                last.published_at or last.created_at, last.id
            )
        return items, next_cursor

    # ============ 作者本人的文章列表（含草稿） ============
    async def list_by_author(
        self,
        author_id: int,
        status: Optional[str] = None,
        cursor: Optional[str] = None,
        limit: int = ARTICLES_PER_PAGE,
    ) -> Tuple[List[Article], Optional[str]]:
        stmt = (
            select(Article)
            .where(Article.author_id == author_id)
            .options(selectinload(Article.tags), selectinload(Article.category))
            .order_by(Article.updated_at.desc(), Article.id.desc())
        )
        if status:
            stmt = stmt.where(Article.status == status)
        stmt = apply_cursor(stmt, cursor, Article.updated_at, Article.id).limit(limit + 1)
        result = await self.db.execute(stmt)
        items = list(result.scalars().all())
        has_more = len(items) > limit
        if has_more:
            items = items[:limit]
        next_cursor = None
        if has_more and items:
            last = items[-1]
            next_cursor = encode_cursor(last.updated_at, last.id)
        return items, next_cursor

    # ============ 索引数据（供前端 flexsearch） ============
    async def list_index(self) -> List[Article]:
        """返回所有已发布文章的精简字段。"""
        result = await self.db.execute(
            select(Article)
            .where(Article.status == "PUBLISHED")
            .options(selectinload(Article.author), selectinload(Article.tags))
            .order_by(Article.published_at.desc())
        )
        return list(result.scalars().all())

    # ============ 归档（按月统计） ============
    async def archive(self) -> List[dict]:
        """按月份归档：[{year, month, count}, ...]"""
        result = await self.db.execute(
            select(
                func.year(Article.published_at).label("y"),
                func.month(Article.published_at).label("m"),
                func.count(Article.id).label("c"),
            )
            .where(Article.status == "PUBLISHED", Article.published_at.is_not(None))
            .group_by("y", "m")
            .order_by("y", "m")
        )
        return [
            {"year": int(r.y), "month": int(r.m), "count": int(r.c)}
            for r in result.all()
        ]

    # ============ 浏览量自增 + 历史记录 ============
    async def record_view(self, article: Article, user: Optional[User], ip_address: Optional[str] = None) -> None:
        from app.services.history_service import HistoryService
        added = await self.counter.add_view_if_first(
            user.id if user else None, article.id, ip_address
        )
        if added:
            await RecommendationService(self.db).refresh_article_score(article.id)
        if user:
            await HistoryService().record(user.id, article.id)

    # ============ 工具 ============
    async def _unique_slug(self, title: str) -> str:
        base = slugify(title)

        async def exists(s: str) -> bool:
            r = await self.db.scalar(select(func.count(Article.id)).where(Article.slug == s))
            return bool(r)

        if not await exists(base):
            return base
        n = 2
        while await exists(f"{base}-{n}"):
            n += 1
        return f"{base}-{n}"

    async def _sync_tags(self, article: Article, tag_ids: List[int]) -> None:
        if not tag_ids:
            article.tags = []
            return
        result = await self.db.execute(select(Tag).where(Tag.id.in_(tag_ids)))
        article.tags = list(result.scalars().all())

    @staticmethod
    def _gen_excerpt(content: str, length: int = 150) -> str:
        """从 Markdown 内容生成摘要（去除标记符号）。"""
        import re
        text = re.sub(r"[#*`>\-\[\]()!]", "", content)
        text = re.sub(r"\s+", " ", text).strip()
        return text[:length] + ("..." if len(text) > length else "")
