"""请求追踪中间件：为每个请求分配唯一 X-Request-ID。

上下游链路追踪：
  Nginx → RequestIDMiddleware → API → Service → MySQL/Redis
  ↑ 每个环节都能拿到 trace_id，串联日志
"""
import uuid
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware


class RequestIDMiddleware(BaseHTTPMiddleware):
    """给每个请求分配唯一 trace ID，注入 request.state 和响应头。"""

    async def dispatch(self, request: Request, call_next):
        # 如果上游（Nginx/网关）已传 X-Request-ID 则沿用
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request.state.request_id = request_id

        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
