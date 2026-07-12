"""推荐服务：计算热度并刷新 ZSet（供定时任务与发布时调用）。"""
import logging
from typing import List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article import Article
from app.services.counter_service import CounterService
from app.services.ranking_service import RankingService

logger = logging.getLogger(__name__)


class RecommendationService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.counter = CounterService(db)
        self.ranking = RankingService()

    async def refresh_article_score(self, article_id: int) -> None:
        """刷新单篇文章热度分值。"""
        article = await self.db.get(Article, article_id)
        if not article or article.status != "PUBLISHED":
            await self.ranking.remove(article_id)
            return
        views = await self.counter.get_views(article_id) + article.views
        likes = await self.counter.like_count(article_id)
        comments = await self.counter.comment_count(article_id)
        await self.ranking.update_score(
            article_id, views, likes, comments, article.published_at or article.created_at
        )

    async def refresh_all(self, batch: int = 200) -> int:
        """全量刷新热门排行（定时任务调用）。返回处理文章数。"""
        result = await self.db.execute(
            select(Article.id, Article.views, Article.published_at, Article.created_at)
            .where(Article.status == "PUBLISHED")
            .order_by(Article.published_at.desc())
        )
        rows = result.all()
        count = 0
        for row in rows:
            article_id = row[0]
            db_views = row[1] or 0
            published_at = row[2] or row[3]
            views = await self.counter.get_views(article_id) + db_views
            likes = await self.counter.like_count(article_id)
            comments = await self.counter.comment_count(article_id)
            await self.ranking.update_score(article_id, views, likes, comments, published_at)
            count += 1
            if count % batch == 0:
                logger.info("refresh_all progress: %d/%d", count, len(rows))
        logger.info("refresh_all done: %d articles", count)
        return count

    async def hot_article_ids(self, limit: int = 10) -> List[int]:
        return await self.ranking.top_ids(limit)
