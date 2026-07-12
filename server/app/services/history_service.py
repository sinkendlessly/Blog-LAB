"""用户浏览历史服务：Redis LIST 存储最近浏览。"""
from typing import List, Optional

from app.core.redis import get_redis
from app.utils.redis_keys import RedisKeys

HISTORY_MAX = 50


class HistoryService:
    def __init__(self):
        self.redis = get_redis()

    async def record(self, user_id: int, article_id: int) -> None:
        """记录浏览：LPUSH + 去重 + LTRIM 保留最近 50 条。"""
        key = RedisKeys.user_history(user_id)
        # 先移除已存在的相同记录（去重）
        await self.redis.lrem(key, 0, str(article_id))
        await self.redis.lpush(key, str(article_id))
        await self.redis.ltrim(key, 0, HISTORY_MAX - 1)

    async def list_ids(self, user_id: int, limit: int = 20) -> List[int]:
        raw = await self.redis.lrange(RedisKeys.user_history(user_id), 0, limit - 1)
        return [int(x) for x in raw]

    async def clear(self, user_id: int) -> None:
        await self.redis.delete(RedisKeys.user_history(user_id))
