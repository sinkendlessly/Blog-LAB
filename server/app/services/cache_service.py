"""缓存服务：列表缓存读写 + miss 回填 + 击穿保护(SET NX 锁)。"""
import json
import logging
from typing import Any, Optional

from app.core.redis import get_redis

logger = logging.getLogger(__name__)

# 列表缓存默认 5 分钟
LIST_CACHE_TTL = 300
# 击穿保护锁超时
LOCK_TTL = 10


class CacheService:
    def __init__(self):
        self.redis = get_redis()

    # ============ 通用 JSON 缓存 ============
    async def get_json(self, key: str) -> Optional[Any]:
        raw = await self.redis.get(key)
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None

    async def set_json(self, key: str, value: Any, ttl: int = LIST_CACHE_TTL) -> None:
        await self.redis.set(key, json.dumps(value, default=str), ex=ttl)

    async def delete(self, *keys: str) -> None:
        if keys:
            await self.redis.delete(*keys)

    async def delete_pattern(self, pattern: str) -> None:
        """按模式删除（如 cache:articles:list:*）。用 SCAN 避免阻塞。"""
        async for key in self.redis.scan_iter(match=pattern, count=100):
            await self.redis.delete(key)

    # ============ 击穿保护锁 ============
    async def acquire_lock(self, key: str, ttl: int = LOCK_TTL) -> bool:
        """SET NX 加锁，成功返回 True。"""
        return bool(await self.redis.set(key, "1", nx=True, ex=ttl))

    async def release_lock(self, key: str) -> None:
        await self.redis.delete(key)

    async def get_or_load(
        self,
        cache_key: str,
        loader,
        ttl: int = LIST_CACHE_TTL,
        lock_key: Optional[str] = None,
    ):
        """缓存读取，miss 时回填，可选加锁防击穿。

        loader: async callable, 返回可 JSON 序列化的数据。
        """
        cached = await self.get_json(cache_key)
        if cached is not None:
            return cached

        # 加锁防击穿
        if lock_key:
            got = await self.acquire_lock(lock_key)
            if not got:
                # 未拿到锁，短暂等待后重试缓存
                import asyncio
                await asyncio.sleep(0.1)
                cached = await self.get_json(cache_key)
                if cached is not None:
                    return cached
                # 仍未命中则直接加载（降级，放弃锁保护）
            try:
                data = await loader()
                await self.set_json(cache_key, data, ttl)
                return data
            finally:
                if got:
                    await self.release_lock(lock_key)

        data = await loader()
        await self.set_json(cache_key, data, ttl)
        return data
