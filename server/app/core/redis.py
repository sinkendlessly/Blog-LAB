"""Redis 异步连接池：FastAPI lifespan 中初始化与关闭。"""
from typing import Optional

import redis.asyncio as aioredis

from app.core.config import settings

# 全局 Redis 客户端
redis_client: Optional[aioredis.Redis] = None


async def init_redis() -> aioredis.Redis:
    """应用启动时初始化 Redis 连接池。"""
    global redis_client
    redis_client = aioredis.from_url(
        settings.redis_url,
        encoding="utf-8",
        decode_responses=True,
        max_connections=50,
        socket_connect_timeout=5,   # 连接超时 5 秒（默认永不超时）
        socket_timeout=10,          # 读写超时 10 秒（默认永不超时）
        retry_on_timeout=True,      # 超时自动重试一次
        health_check_interval=30,   # 每 30 秒发一次 PING 检测连接健康
    )
    # 测试连接
    await redis_client.ping()
    return redis_client


async def close_redis() -> None:
    """应用关闭时释放 Redis 连接。"""
    global redis_client
    if redis_client is not None:
        await redis_client.aclose()
        redis_client = None


def get_redis() -> aioredis.Redis:
    """获取全局 Redis 客户端（依赖注入用）。"""
    if redis_client is None:
        raise RuntimeError("Redis client not initialized. Call init_redis() first.")
    return redis_client
