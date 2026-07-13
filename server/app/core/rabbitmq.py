"""RabbitMQ 异步连接管理：发布消息与消费消息。

设计原则：
- 生命周期与 FastAPI lifespan 绑定（init → close）
- RabbitMQ 不可用时静默降级，不阻塞应用启动
- 消息持久化（DeliveryMode.PERSISTENT），队列持久化（durable=True）
"""
import json
import logging
from typing import Optional

import aio_pika
from aio_pika import Message, DeliveryMode
from aio_pika.abc import AbstractRobustConnection, AbstractRobustChannel

from app.core.config import settings

logger = logging.getLogger(__name__)

_connection: Optional[AbstractRobustConnection] = None
_channel: Optional[AbstractRobustChannel] = None


async def init_rabbitmq() -> None:
    """应用启动时建立 RabbitMQ 连接和通道。"""
    global _connection, _channel

    if _connection is not None:
        return

    try:
        _connection = await aio_pika.connect_robust(
            settings.rabbitmq_url,
            timeout=10,
        )
        _channel = await _connection.channel()
        # 声明所有队列（持久化，重启不丢失）
        for q in [settings.NOTIFICATION_QUEUE, settings.IMAGE_PROCESSING_QUEUE, settings.RANKING_QUEUE]:
            await _channel.declare_queue(q, durable=True)
        logger.info("RabbitMQ connected: %s, queues=%d", settings.RABBITMQ_HOST, 3)
    except Exception as e:
        logger.warning("RabbitMQ unavailable (%s), notifications will be disabled", e)
        _connection = None
        _channel = None


async def close_rabbitmq() -> None:
    """应用关闭时释放连接。"""
    global _connection, _channel

    if _channel is not None:
        await _channel.close()
        _channel = None
    if _connection is not None:
        await _connection.close()
        _connection = None


async def publish_message(queue_name: str, body: dict) -> bool:
    """发布消息到指定队列。

    返回 True 表示发布成功，False 表示 RabbitMQ 不可用。
    """
    global _channel

    if _channel is None:
        logger.warning("RabbitMQ not connected, dropping message: %s", body.get("type"))
        return False

    try:
        message = Message(
            body=json.dumps(body, default=str).encode(),
            delivery_mode=DeliveryMode.PERSISTENT,
            content_type="application/json",
        )
        await _channel.default_exchange.publish(message, routing_key=queue_name)
        return True
    except Exception as e:
        logger.error("Failed to publish message: %s", e)
        return False


def get_channel() -> Optional[AbstractRobustChannel]:
    """获取当前 RabbitMQ 通道（供消费者使用）。"""
    return _channel
