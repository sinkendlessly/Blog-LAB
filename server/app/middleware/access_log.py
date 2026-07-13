"""请求日志中间件：记录每个 API 请求的方法/路径/状态码/耗时。

配合 RequestIDMiddleware 使用，日志格式：
  2026-07-13 12:00:00 [access] GET /api/v1/articles/123 200 45ms [uuid]
"""
import time
import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("access")


class AccessLogMiddleware(BaseHTTPMiddleware):
    """记录请求方法、路径、状态码、耗时及 trace ID。"""

    async def dispatch(self, request: Request, call_next):
        # 健康检查放行，避免日志刷屏
        if request.url.path in ("/api/health", "/", "/api/docs", "/api/redoc", "/api/openapi.json"):
            return await call_next(request)

        start = time.time()
        response = await call_next(request)
        elapsed = int((time.time() - start) * 1000)
        request_id = getattr(request.state, "request_id", "-")

        logger.info(
            "%s %s %d %dms [%s]",
            request.method,
            request.url.path,
            response.status_code,
            elapsed,
            request_id,
        )
        return response
