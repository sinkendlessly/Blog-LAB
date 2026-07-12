"""热门排行服务：ZSet 实时维护文章热度。"""
import math
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Tuple

from app.core.redis import get_redis
from app.utils.redis_keys import RedisKeys

logger = logging.getLogger(__name__)

# 热门算法权重
WEIGHT_VIEWS = 1
WEIGHT_LIKES = 3
WEIGHT_COMMENTS = 2
# 时间衰减：约 10 天半衰期
DECAY_FACTOR = 0.1
# 新鲜度基础分（新文章至少有这个保底分，解决 0 浏览量永远上不了榜的问题）
FRESHNESS_BASE = 10
# 新鲜度衰减（天数），约 3 天衰减一半
FRESHNESS_DECAY = 0.2


class RankingService:
    def __init__(self):
        self.redis = get_redis()

    def compute_score(
        self, views: int, likes: int, comments: int, published_at: datetime
    ) -> float:
        """计算热度分值。

        公式：
          score = interaction_score * time_decay + freshness_bonus

        - interaction_score = views*1 + likes*3 + comments*2
        - time_decay = e^(-0.1 * Δt_days)，约 10 天半衰
        - freshness_bonus = 10 * e^(-0.2 * Δt_days)，约 3 天半衰
          给新文章保底分，确保 0 浏览的新文章也能上榜
        """
        raw = (
            views * WEIGHT_VIEWS
            + likes * WEIGHT_LIKES
            + comments * WEIGHT_COMMENTS
        )
        if published_at is None:
            now = datetime.now(timezone.utc)
            published_at = now
        if published_at.tzinfo is None:
            published_at = published_at.replace(tzinfo=timezone.utc)
        delta_days = max((datetime.now(timezone.utc) - published_at).total_seconds() / 86400, 0)
        decay = math.exp(-DECAY_FACTOR * delta_days)
        freshness = FRESHNESS_BASE * math.exp(-FRESHNESS_DECAY * delta_days)
        return round(raw * decay + freshness, 4)

    async def update_score(
        self,
        article_id: int,
        views: int,
        likes: int,
        comments: int,
        published_at: datetime,
    ) -> float:
        """更新文章在 ZSet 中的分值。"""
        score = self.compute_score(views, likes, comments, published_at)
        await self.redis.zadd(RedisKeys.HOT_ARTICLES, {str(article_id): score})
        return score

    async def remove(self, article_id: int) -> None:
        await self.redis.zrem(RedisKeys.HOT_ARTICLES, str(article_id))

    async def top(self, limit: int = 10) -> List[Tuple[int, float]]:
        """取热门 Top N，返回 [(article_id, score), ...] 按分值降序。"""
        items = await self.redis.zrevrange(
            RedisKeys.HOT_ARTICLES, 0, limit - 1, withscores=True
        )
        return [(int(member), float(score)) for member, score in items]

    async def top_ids(self, limit: int = 10) -> List[int]:
        """仅返回 article_id 列表。"""
        return [aid for aid, _ in await self.top(limit)]
