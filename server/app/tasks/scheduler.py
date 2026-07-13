"""APScheduler 定时任务：浏览量刷库 + 热门排行刷新。

注意：多 worker（Gunicorn）环境下需用 Redis 锁防止任务重复执行。
"""
import logging
import asyncio
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.core.redis import get_redis
from app.db.session import AsyncSessionLocal
from app.utils.redis_keys import RedisKeys

logger = logging.getLogger(__name__)

# 刷库间隔（秒）
VIEW_FLUSH_INTERVAL = 300  # 5 分钟
RANKING_REFRESH_INTERVAL = 600  # 10 分钟

# 分布式锁 key
SCHEDULER_LOCK = "scheduler:lock:view_flush"
RANKING_LOCK = "scheduler:lock:ranking"

scheduler: Optional[AsyncIOScheduler] = None


async def flush_views_to_db() -> None:
    """扫描 Redis 中所有 article:*:views，批量更新 MySQL，然后归零。"""
    redis = get_redis()
    # 加锁防多 worker 重复
    got = await redis.set(SCHEDULER_LOCK, "1", nx=True, ex=VIEW_FLUSH_INTERVAL - 10)
    if not got:
        return

    try:
        async with AsyncSessionLocal() as db:
            from sqlalchemy import update, text
            from app.models.article import Article

            count = 0
            async for key in redis.scan_iter(match="article:*:views", count=200):
                # key 形如 article:123:views
                parts = key.split(":")
                if len(parts) != 3:
                    continue
                try:
                    article_id = int(parts[1])
                except ValueError:
                    continue
                # GETSET 原子操作：取旧值并归零
                # 即使此后的 INCR 从 0 开始，下次刷库会累加正确值，不会丢失
                cnt = await redis.getset(key, 0)
                if not cnt or int(cnt) <= 0:
                    continue
                # 累加到 MySQL views 字段
                await db.execute(
                    update(Article).where(Article.id == article_id).values(
                        views=Article.views + int(cnt)
                    )
                )
                count += 1
            await db.commit()
            if count:
                logger.info("flush_views: updated %d articles", count)
    except Exception as e:
        logger.error("flush_views error: %s", e)
    finally:
        await redis.delete(SCHEDULER_LOCK)


async def refresh_ranking() -> None:
    """全量刷新热门排行 ZSet。"""
    redis = get_redis()
    got = await redis.set(RANKING_LOCK, "1", nx=True, ex=RANKING_REFRESH_INTERVAL - 10)
    if not got:
        return
    try:
        async with AsyncSessionLocal() as db:
            from app.services.recommendation_service import RecommendationService
            await RecommendationService(db).refresh_all()
    except Exception as e:
        logger.error("refresh_ranking error: %s", e)
    finally:
        await redis.delete(RANKING_LOCK)


def start_scheduler() -> AsyncIOScheduler:
    global scheduler
    if scheduler is not None:
        return scheduler
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        flush_views_to_db,
        IntervalTrigger(seconds=VIEW_FLUSH_INTERVAL),
        id="flush_views",
        replace_existing=True,
    )
    scheduler.add_job(
        refresh_ranking,
        IntervalTrigger(seconds=RANKING_REFRESH_INTERVAL),
        id="refresh_ranking",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("APScheduler started: view_flush=%ds, ranking_refresh=%ds",
                VIEW_FLUSH_INTERVAL, RANKING_REFRESH_INTERVAL)
    return scheduler


async def stop_scheduler() -> None:
    global scheduler
    if scheduler is not None:
        scheduler.shutdown(wait=False)
        scheduler = None
