"""缓存服务：列表缓存读写 + miss 回填 + 击穿保护(SET NX 锁)。"""
import json
import logging
import random
from typing import Any, Optional

from app.core.redis import get_redis

logger = logging.getLogger(__name__)

# 列表缓存默认 5 分钟
LIST_CACHE_TTL = 300
# 击穿保护锁超时
LOCK_TTL = 10
# 空值缓存 TTL（防穿透，短时间即可）
EMPTY_CACHE_TTL = 60
# TTL 抖动比例（防雪崩：300s → 240~360s）
JITTER_RATIO = 0.2


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
        """写入 JSON 缓存，TTL 自动加随机抖动防雪崩。"""
        ttl = self._ttl_with_jitter(ttl)
        await self.redis.set(key, json.dumps(value, default=str), ex=ttl)

    async def delete(self, *keys: str) -> None:
        if keys:
            await self.redis.delete(*keys)

    async def delete_pattern(self, pattern: str) -> None:
        """按模式删除（如 cache:articles:list:*）。用 SCAN 避免阻塞。"""
        async for key in self.redis.scan_iter(match=pattern, count=100):
            await self.redis.delete(key)

    @staticmethod
    def _ttl_with_jitter(ttl: int) -> int:
        """在 TTL 上施加 ±JITTER_RATIO 的随机抖动，防止缓存雪崩。"""
        delta = int(ttl * JITTER_RATIO)
        return max(1, ttl + random.randint(-delta, delta))

    @staticmethod
    def _is_empty(data: Any) -> bool:
        """判断 loader 返回的结果是否为空（防穿透）。"""
        if data is None:
            return True
        if isinstance(data, (list, dict, str)) and len(data) == 0:
            return True
        return False

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

        防护策略：
        ① 击穿保护：SET NX 互斥锁，未抢到锁的请求等待后读缓存
        ② 穿透保护：空结果缓存短 TTL（60s），避免反复查 DB
        ③ 雪崩防护：TTL 自动加 ±20% 随机抖动

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
                # 空结果也缓存（短 TTL），防穿透
                if self._is_empty(data):
                    await self.set_json(cache_key, data, EMPTY_CACHE_TTL)
                else:
                    await self.set_json(cache_key, data, ttl)
                return data
            finally:
                if got:
                    await self.release_lock(lock_key)

        data = await loader()
        if self._is_empty(data):
            await self.set_json(cache_key, data, EMPTY_CACHE_TTL)
        else:
            await self.set_json(cache_key, data, ttl)
        return data
