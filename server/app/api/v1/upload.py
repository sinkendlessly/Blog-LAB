"""文件上传路由。支持本地磁盘 / 阿里云 OSS（由 STORAGE_BACKEND 配置决定）。"""
from fastapi import APIRouter, Depends, UploadFile, File

from app.core.config import settings
from app.core.deps import get_current_user
from app.models.user import User
from app.middleware.error_handler import AppException
from app.services.storage_service import get_storage

router = APIRouter(prefix="/upload", tags=["上传"])

ALLOWED = set(settings.UPLOAD_ALLOWED_EXTENSIONS.split(","))


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

    # 校验文件大小（读取内容后判断）
    content = await file.read()
    if len(content) > settings.UPLOAD_MAX_SIZE:
        raise AppException(
            f"图片过大（{len(content) / 1024 / 1024:.1f}MB），最大 {settings.UPLOAD_MAX_SIZE / 1024 / 1024:.0f}MB",
            413,
            "FILE_TOO_LARGE",
        )

    # 通过存储后端保存（local / oss 自动切换）
    storage = get_storage()
    url = await storage.save(content, ext, category="images")
    return {"url": url, "filename": file.filename}
