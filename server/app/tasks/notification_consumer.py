"""通知消费者：从 RabbitMQ 消费通知消息，异步写入数据库。

在 FastAPI lifespan 中启动，作为后台任务持续运行。
消息格式：{"type", "user_id", "actor_id", "title", "content", "link"}
"""
import json
import logging
from typing import Optional

import aio_pika
from aio_pika.abc import AbstractIncomingMessage

from app.core.config import settings
from app.core.rabbitmq import get_channel
from app.db.session import AsyncSessionLocal
from app.services.notification_service import NotificationService

logger = logging.getLogger(__name__)

_consumer_tag: Optional[str] = None


async def process_message(body: dict) -> None:
    """处理单条通知消息：写入数据库。"""
    async with AsyncSessionLocal() as db:
        try:
            service = NotificationService(db)
            await service.create(
                user_id=body["user_id"],
                type=body["type"],
                title=body.get("title", ""),
                content=body.get("content", ""),
                link=body.get("link"),
                actor_id=body.get("actor_id"),
            )
            await db.commit()
            logger.debug("Notification created: type=%s user=%d", body["type"], body["user_id"])
        except Exception as e:
            await db.rollback()
            logger.error("Failed to process notification: %s | body=%s", e, body)
            raise


async def on_message(message: AbstractIncomingMessage) -> None:
    """RabbitMQ 消息回调。"""
    async with message.process(requeue=True):
        body = json.loads(message.body.decode())
        await process_message(body)


async def start_consumer() -> bool:
    """启动后台消费者（在 lifespan 中调用）。"""
    global _consumer_tag

    channel = get_channel()
    if channel is None:
        logger.warning("RabbitMQ not connected, notification consumer disabled")
        return False

    queue = await channel.declare_queue(settings.NOTIFICATION_QUEUE, durable=True)
    _consumer_tag = await queue.consume(on_message)
    logger.info("Notification consumer started on queue: %s", settings.NOTIFICATION_QUEUE)
    return True


async def stop_consumer() -> None:
    """停止消费者。"""
    global _consumer_tag

    if _consumer_tag is not None:
        channel = get_channel()
        if channel is not None:
            await channel.cancel(_consumer_tag)
            logger.info("Notification consumer stopped")
        _consumer_tag = None
