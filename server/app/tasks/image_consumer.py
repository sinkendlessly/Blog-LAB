"""图片处理消费者：异步压缩图片 + 生成 WebP 缩略图。

消费 image_processing 队列消息，用 Pillow 压缩原图并生成 WebP，
完成后覆盖原文件。
"""
import asyncio
import logging
from pathlib import Path
from typing import Optional

from aio_pika.abc import AbstractIncomingMessage

from app.core.config import settings
from app.core.rabbitmq import get_channel

logger = logging.getLogger(__name__)

_consumer_tag: Optional[str] = None

# 压缩配置
JPEG_QUALITY = 85        # JPEG 质量 0-100
WEBP_QUALITY = 80        # WebP 质量 0-100
MAX_DIMENSION = 2560     # 最长边不超过此像素
THUMBNAIL_SIZE = (400, 300)  # 缩略图尺寸


async def process_image(body: dict) -> None:
    """处理单张图片：压缩 + WebP + 缩略图。"""
    url = body.get("url", "")
    ext = body.get("ext", "jpg")

    # URL 形如 /uploads/images/2026/07/14/uuid.jpg
    # 转为本地文件路径
    relative_path = url.lstrip("/")
    file_path = Path(settings.UPLOAD_DIR) / relative_path

    if not file_path.exists():
        logger.warning("image file not found: %s", file_path)
        return

    try:
        loop = asyncio.get_event_loop()
        from PIL import Image

        def _compress():
            img = Image.open(file_path)
            original_size = file_path.stat().st_size

            # 缩放到最大尺寸
            if max(img.size) > MAX_DIMENSION:
                ratio = MAX_DIMENSION / max(img.size)
                new_size = (int(img.width * ratio), int(img.height * ratio))
                img = img.resize(new_size, Image.LANCZOS)

            # 转 RGB（去掉 alpha 通道，JPEG 不支持 alpha）
            if img.mode in ("RGBA", "P"):
                rgb = Image.new("RGB", img.size, (255, 255, 255))
                if img.mode == "RGBA":
                    rgb.paste(img, mask=img.split()[3])
                else:
                    rgb.paste(img)
                img = rgb

            # 保存压缩版（覆盖原文件）
            save_path = file_path.with_suffix(f".{ext}")
            img.save(save_path, "JPEG" if ext.upper() in ("JPG", "JPEG") else ext.upper(),
                     quality=JPEG_QUALITY, optimize=True)

            compressed_size = save_path.stat().st_size
            saved = (original_size - compressed_size) / original_size * 100
            logger.info(
                "compressed: %s  %s→%s  (%.0f%%)",
                url, _fmt_size(original_size), _fmt_size(compressed_size), saved,
            )

            # 生成 WebP（同目录下）
            webp_path = file_path.with_suffix(".webp")
            img_copy = Image.open(save_path)
            img_copy.save(webp_path, "WEBP", quality=WEBP_QUALITY)

            # 生成缩略图
            thumb_dir = Path(settings.UPLOAD_DIR) / "thumbnails" / relative_path
            thumb_dir.parent.mkdir(parents=True, exist_ok=True)
            thumb_path = thumb_dir.with_suffix(".webp")
            thumb = img_copy.copy()
            thumb.thumbnail(THUMBNAIL_SIZE, Image.LANCZOS)
            thumb.save(thumb_path, "WEBP", quality=WEBP_QUALITY)

        await loop.run_in_executor(None, _compress)

    except Exception as e:
        logger.error("image processing failed: %s | %s", url, e)
        raise


async def on_image_message(message: AbstractIncomingMessage) -> None:
    """图片队列消息回调。"""
    import json
    async with message.process(requeue=True):
        body = json.loads(message.body.decode())
        await process_image(body)


async def start_image_consumer() -> bool:
    """启动图片处理消费者。"""
    global _consumer_tag

    channel = get_channel()
    if channel is None:
        logger.warning("RabbitMQ not connected, image consumer disabled")
        return False

    await channel.set_qos(prefetch_count=5)  # 图片处理慢，最多同时 5 张
    queue = await channel.declare_queue(settings.IMAGE_PROCESSING_QUEUE, durable=True)
    _consumer_tag = await queue.consume(on_image_message)
    logger.info("Image consumer started on queue: %s", settings.IMAGE_PROCESSING_QUEUE)
    return True


async def stop_image_consumer() -> None:
    """停止图片处理消费者。"""
    global _consumer_tag
    if _consumer_tag is not None:
        channel = get_channel()
        if channel is not None:
            await channel.cancel(_consumer_tag)
            logger.info("Image consumer stopped")
        _consumer_tag = None


def _fmt_size(b: int) -> str:
    if b < 1024:
        return f"{b}B"
    if b < 1024 * 1024:
        return f"{b / 1024:.1f}KB"
    return f"{b / 1024 / 1024:.1f}MB"
