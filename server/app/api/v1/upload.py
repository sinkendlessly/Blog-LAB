"""文件上传路由。支持本地磁盘 / 阿里云 OSS（由 STORAGE_BACKEND 配置决定）。

并发控制：
- asyncio.Semaphore 限制同时处理的上传数，防止大并发撑爆内存
- 文件内容分块读取，避免一次性加载 10MB 到内存
"""
import asyncio
import logging

from fastapi import APIRouter, Depends, UploadFile, File

from app.core.config import settings
from app.core.deps import get_current_user
from app.models.user import User
from app.middleware.error_handler import AppException
from app.services.storage_service import get_storage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/upload", tags=["上传"])

ALLOWED = set(settings.UPLOAD_ALLOWED_EXTENSIONS.split(","))

# 同时最多处理 5 个上传请求，超过排队等待
_upload_semaphore = asyncio.Semaphore(5)


@router.post("", summary="上传图片")
async def upload_image(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """上传图片，返回可访问的 URL。仅限登录用户。"""
    # 校验文件类型
    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if file.filename else ""
    if ext not in ALLOWED:
        raise AppException(
            f"不支持的图片格式：.{ext}，允许：{settings.UPLOAD_ALLOWED_EXTENSIONS}",
            400,
            "INVALID_FILE_TYPE",
        )

    async with _upload_semaphore:
        # 分块读取并校验大小，避免一次性加载大文件到内存
        content = bytearray()
        size = 0
        while chunk := await file.read(1024 * 1024):  # 每次 1MB
            size += len(chunk)
            if size > settings.UPLOAD_MAX_SIZE:
                raise AppException(
                    f"图片过大，最大 {settings.UPLOAD_MAX_SIZE / 1024 / 1024:.0f}MB",
                    413,
                    "FILE_TOO_LARGE",
                )
            content.extend(chunk)

        # 通过存储后端保存（local / oss 自动切换）
        storage = get_storage()
        url = await storage.save(bytes(content), ext, category="images")
        logger.info("upload: user=%d file=%s url=%s size=%d", user.id, file.filename, url, size)

        # 异步发布图片处理消息（压缩 + WebP，不阻塞响应）
        try:
            from app.core.rabbitmq import publish_message
            await publish_message(settings.IMAGE_PROCESSING_QUEUE, {
                "type": "image_processing",
                "url": url,
                "ext": ext,
            })
        except Exception:
            logger.warning("image processing mq skipped")
        return {"url": url, "filename": file.filename}
