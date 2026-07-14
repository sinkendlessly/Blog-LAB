"""个性化推荐 v2：基于用户浏览历史的 Embedding 相似度推荐。

替代 v1 的互动量排行推荐，改用 Chroma 向量相似度。
"""
import logging
from typing import List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.embeddings import EmbeddingService
from app.core.redis import get_redis
from app.models.article import Article
from app.services.llm_service import LLMService
from app.utils.redis_keys import RedisKeys

logger = logging.getLogger(__name__)


class RecommendationV2:
    """基于用户浏览历史的个性化文章推荐。"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.llm = LLMService()
        self.embedding = EmbeddingService()
        self.redis = get_redis()

    async def recommend_for_user(
        self, user_id: int, current_article_id: int, limit: int = 5
    ) -> List[Article]:
        """推荐与用户最近浏览相似的文章。

        Args:
            user_id: 用户 ID
            current_article_id: 当前文章 ID（排除）
            limit: 返回数量

        Returns:
            按相似度降序排列的文章列表
        """
        if not self.llm.api_key:
            return []

        # 1. 取最近浏览的 5 篇文章
        history_key = RedisKeys.user_history(user_id)
        recent_raw = await self.redis.lrange(history_key, 0, 4)
        recent_ids = []
        for r in recent_raw:
            try:
                recent_ids.append(int(r))
            except (ValueError, TypeError):
                continue

        if not recent_ids:
            return []

        # 2. 组合浏览历史内容为查询向量
        result = await self.db.execute(
            select(Article.title, Article.content)
            .where(Article.id.in_(recent_ids))
        )
        rows = result.all()
        if not rows:
            return []

        combined = " ".join([f"{r[0]}\n{r[1][:500]}" for r in rows])
        query_emb = await self.llm.embed_text(combined)
        if not query_emb:
            return []

        # 3. Chroma 相似度搜索
        similar = await self.embedding.search_similar(
            query_emb, top_k=limit + len(recent_ids) + 1, threshold=0.6
        )

        # 排除已读和当前文章
        exclude = set(recent_ids) | {current_article_id}
        candidate_ids = [sid for sid, _, _ in similar if sid not in exclude]

        if not candidate_ids:
            return []

        # 4. 取文章详情
        result = await self.db.execute(
            select(Article)
            .where(Article.id.in_(candidate_ids[:limit]))
        )
        return list(result.scalars().all())
