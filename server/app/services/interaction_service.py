"""互动服务：点赞 / 收藏 / 分享 统一入口。"""
from typing import List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article import Article
from app.models.interaction import Interaction
from app.services.counter_service import CounterService
from app.services.recommendation_service import RecommendationService


class InteractionService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.counter = CounterService(db)

    async def toggle_like(self, user_id: int, article_id: int) -> bool:
        liked = await self.counter.like(user_id, article_id)
        await RecommendationService(self.db).refresh_article_score(article_id)
        return liked

    async def toggle_favorite(self, user_id: int, article_id: int) -> bool:
        favorited = await self.counter.favorite(user_id, article_id)
        return favorited

    async def record_share(self, article_id: int, user_id: int, platform: str) -> Interaction:
        share = Interaction(
            user_id=user_id, target_id=article_id,
            target_type="article", action="share", platform=platform,
        )
        self.db.add(share)
        await self.db.flush()
        await self.db.refresh(share)
        return share

    async def favorite_articles(self, user_id: int) -> List[Article]:
        """用户收藏的文章列表。"""
        result = await self.db.execute(
            select(Article)
            .join(Interaction, Interaction.target_id == Article.id)
            .where(
                Interaction.user_id == user_id,
                Interaction.target_type == "article",
                Interaction.action == "favorite",
                Article.status == "PUBLISHED",
            )
            .order_by(Interaction.created_at.desc())
        )
        return list(result.scalars().all())
