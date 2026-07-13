"""排行消费者：攒批刷新热门排行 ZSet。

消费 ranking 队列消息，收集 article_id，
每 30 秒或积累 50 条后批量刷新一次。
"""
import asyncio
import json
import logging
from typing import Optional, Set

from aio_pika.abc import AbstractIncomingMessage

from app.core.config import settings
from app.core.rabbitmq import get_channel
from app.db.session import AsyncSessionLocal

logger = logging.getLogger(__name__)

_consumer_tag: Optional[str] = None

# 批处理参数
BATCH_SIZE = 50          # 积累多少条后触发
BATCH_INTERVAL = 30      # 最长等待秒数

_pending_ids: Set[int] = set()
_batch_task: Optional[asyncio.Task] = None


async def _flush_batch() -> None:
    """批量刷新所有待处理的 article_id 热度分值。"""
    global _pending_ids
    if not _pending_ids:
        return

    ids = list(_pending_ids)
    _pending_ids = set()

    try:
        async with AsyncSessionLocal() as db:
            from app.services.recommendation_service import RecommendationService
            svc = RecommendationService(db)
            for article_id in ids:
                try:
                    await svc.refresh_article_score(article_id)
                except Exception as e:
                    logger.warning("refresh_score failed: article=%d %s", article_id, e)
            await db.commit()
        logger.info("batch ranking refresh: %d articles", len(ids))
    except Exception as e:
        logger.error("batch ranking refresh error: %s", e)


async def _schedule_flush():
    """定时触发器：到达 BATCH_INTERVAL 后批量刷新。"""
    await asyncio.sleep(BATCH_INTERVAL)
    await _flush_batch()


async def on_ranking_message(message: AbstractIncomingMessage) -> None:
    """排行队列消息回调。"""
    global _pending_ids, _batch_task

    async with message.process():
        body = json.loads(message.body.decode())
        article_id = body.get("article_id")
        if not article_id:
            return

        _pending_ids.add(article_id)

        # 积累到阈值 → 立即刷
        if len(_pending_ids) >= BATCH_SIZE:
            if _batch_task and not _batch_task.done():
                _batch_task.cancel()
            await _flush_batch()
        else:
            # 启动定时器（如果还没启动）
            if not _batch_task or _batch_task.done():
                _batch_task = asyncio.ensure_future(_schedule_flush())


async def start_ranking_consumer() -> bool:
    """启动排行消费者。"""
    global _consumer_tag, _pending_ids, _batch_task

    _pending_ids = set()
    _batch_task = None

    channel = get_channel()
    if channel is None:
        logger.warning("RabbitMQ not connected, ranking consumer disabled")
        return False

    await channel.set_qos(prefetch_count=100)  # 排行消息轻量，可多取
    queue = await channel.declare_queue(settings.RANKING_QUEUE, durable=True)
    _consumer_tag = await queue.consume(on_ranking_message)
    logger.info("Ranking consumer started on queue: %s", settings.RANKING_QUEUE)
    return True


async def stop_ranking_consumer() -> None:
    """停止排行消费者。"""
    global _consumer_tag, _batch_task
    if _batch_task and not _batch_task.done():
        _batch_task.cancel()
    # 停止前刷一次，避免丢数据
    await _flush_batch()
    if _consumer_tag is not None:
        channel = get_channel()
        if channel is not None:
            await channel.cancel(_consumer_tag)
            logger.info("Ranking consumer stopped")
        _consumer_tag = None
