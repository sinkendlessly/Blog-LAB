"""请求超时中间件：超过设定时间未完成的请求返回 504。

防止慢查询/死锁长时间占用 DB 连接池或 Redis 连接。
"""
import asyncio
import logging

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

# 默认超时时间（秒）
DEFAULT_TIMEOUT = 30


class RequestTimeoutMiddleware(BaseHTTPMiddleware):
    """超过 timeout 秒未完成的请求直接返回 504 Gateway Timeout。

    放行 /api/health /api/docs 等不需要太多 I/O 的端点。
    """

    def __init__(self, app, timeout: int = DEFAULT_TIMEOUT):
        super().__init__(app)
        self.timeout = timeout

    async def dispatch(self, request: Request, call_next):
        # 放行轻量端点
        path = request.url.path
        if path in ("/api/health", "/", "/api/docs", "/api/redoc", "/api/openapi.json"):
            return await call_next(request)

        try:
            return await asyncio.wait_for(
                call_next(request),
                timeout=self.timeout,
            )
        except asyncio.TimeoutError:
            logger.warning(
                "Request timeout: %s %s (%ds)",
                request.method, request.url.path, self.timeout,
            )
            return JSONResponse(
                status_code=504,
                content={
                    "code": "REQUEST_TIMEOUT",
                    "message": f"请求处理超时（> {self.timeout}s），请稍后重试",
                },
            )
