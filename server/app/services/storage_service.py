"""文件存储服务：抽象存储后端，支持本地磁盘 / 阿里云 OSS。

通过 settings.STORAGE_BACKEND 切换：
- "local": 存本地磁盘，由 FastAPI StaticFiles 提供访问
- "oss":   存阿里云 OSS，返回 CDN/外链 URL

接口统一：save(content, ext, category) -> url
"""
import uuid
from datetime import datetime
from abc import ABC, abstractmethod
from pathlib import Path

from app.core.config import settings


class StorageBackend(ABC):
    """存储后端抽象基类。"""

    @abstractmethod
    async def save(self, content: bytes, ext: str, category: str = "images") -> str:
        """保存文件，返回可访问的 URL。"""
        ...


class LocalStorage(StorageBackend):
    """本地磁盘存储。"""

    async def save(self, content: bytes, ext: str, category: str = "images") -> str:
        date_path = datetime.now().strftime("%Y/%m/%d")
        save_dir = Path(settings.UPLOAD_DIR) / category / date_path
        save_dir.mkdir(parents=True, exist_ok=True)
        unique_name = f"{uuid.uuid4().hex[:16]}.{ext}"
        save_path = save_dir / unique_name
        save_path.write_bytes(content)
        return f"/uploads/{category}/{date_path}/{unique_name}"


class OSSStorage(StorageBackend):
    """阿里云 OSS 存储。"""

    def __init__(self):
        try:
            import oss2  # type: ignore
        except ImportError as e:
            raise RuntimeError(
                "未安装 oss2，请运行: pip install oss2"
            ) from e
        self._oss2 = oss2
        auth = oss2.Auth(settings.OSS_ACCESS_KEY_ID, settings.OSS_ACCESS_KEY_SECRET)
        self._bucket = oss2.Bucket(auth, settings.OSS_ENDPOINT, settings.OSS_BUCKET_NAME)

    async def save(self, content: bytes, ext: str, category: str = "images") -> str:
        date_path = datetime.now().strftime("%Y/%m/%d")
        unique_name = f"{uuid.uuid4().hex[:16]}.{ext}"
        object_key = f"{category}/{date_path}/{unique_name}"

        # oss2 是同步 SDK，用 run_in_executor 避免阻塞事件循环
        import asyncio
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: self._bucket.put_object(object_key, content),
        )

        # 拼接可访问 URL
        if settings.OSS_CDN_DOMAIN:
            base = settings.OSS_CDN_DOMAIN.rstrip("/")
            return f"{base}/{object_key}"
        # 默认域名：https://<bucket>.<endpoint>/<key>
        endpoint = settings.OSS_ENDPOINT.lstrip("https://").lstrip("http://")
        return f"https://{settings.OSS_BUCKET_NAME}.{endpoint}/{object_key}"


def get_storage() -> StorageBackend:
    """根据配置返回存储后端实例。"""
    backend = settings.STORAGE_BACKEND.lower()
    if backend == "oss":
        if not all([
            settings.OSS_ACCESS_KEY_ID,
            settings.OSS_ACCESS_KEY_SECRET,
            settings.OSS_ENDPOINT,
            settings.OSS_BUCKET_NAME,
        ]):
            raise RuntimeError(
                "OSS 配置不完整，请检查 OSS_ACCESS_KEY_ID / SECRET / ENDPOINT / BUCKET_NAME"
            )
        return OSSStorage()
    return LocalStorage()
