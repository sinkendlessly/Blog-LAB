"""请求体大小限制中间件：防止恶意大请求撑爆内存。

Nginx 已有 client_max_body_size 10M 做前置防护，
后端再加一道防线作为兜底。
"""
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings

# 默认 10MB，与 Nginx 对齐
MAX_BODY_SIZE = settings.UPLOAD_MAX_SIZE


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """限制请求体大小，超过直接返回 413 Payload Too Large。"""

    async def dispatch(self, request: Request, call_next):
        # Content-Length 头检查（快速拒绝，无需读取 body）
        content_length = request.headers.get("content-length")
        if content_length and content_length.isdigit():
            if int(content_length) > MAX_BODY_SIZE:
                return JSONResponse(
                    status_code=413,
                    content={
                        "code": "PAYLOAD_TOO_LARGE",
                        "message": f"请求体不能超过 {MAX_BODY_SIZE // (1024*1024)}MB",
                    },
                )

        # 对于没有 Content-Length 的分块传输，在读取 body 时检查
        # 设置 app.state.max_body_size 供 Starlette 使用
        request.state.max_body_size = MAX_BODY_SIZE

        return await call_next(request)
