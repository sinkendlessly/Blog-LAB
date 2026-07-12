"""API 限流中间件：按 用户/IP + 接口维度 限制每分钟请求次数。

- 评论 / 点赞 / 收藏类接口：10 次/分钟
- 其他 /api 接口：60 次/分钟
- 未登录用户按 IP 限流
"""
import logging
from typing import Optional

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.redis import get_redis
from app.utils.redis_keys import RedisKeys

logger = logging.getLogger(__name__)

# 严格限流接口（每分钟）
STRICT_LIMIT = 60
STRICT_PATHS = ("/comments", "/like", "/favorite", "/share", "/follow")
# 普通限流
DEFAULT_LIMIT = 60
WINDOW_SECONDS = 60


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        # 只对 /api 接口限流
        if not path.startswith("/api"):
            return await call_next(request)

        # 健康检查与文档放行
        if path in ("/api/health", "/api/docs", "/api/redoc", "/api/openapi.json") or path.endswith("/ping"):
            return await call_next(request)

        # 确定用户标识：优先从已解析 token 取（request.state.user），否则用 IP
        user_key = self._get_user_key(request)
        endpoint = self._endpoint_key(path)

        limit = STRICT_LIMIT if any(s in path for s in STRICT_PATHS) else DEFAULT_LIMIT
        key = RedisKeys.rate_limit(user_key, endpoint)

        redis = get_redis()
        try:
            current = await redis.incr(key)
            if current == 1:
                await redis.expire(key, WINDOW_SECONDS)
            if current > limit:
                ttl = await redis.ttl(key)
                return JSONResponse(
                    status_code=429,
                    content={
                        "code": "RATE_LIMITED",
                        "message": f"请求过于频繁，请 {ttl or WINDOW_SECONDS} 秒后重试",
                    },
                    headers={"Retry-After": str(ttl or WINDOW_SECONDS)},
                )
        except Exception as e:
            # Redis 故障时降级（放行），避免限流拖垮服务
            logger.warning("rate limit skipped: %s", e)

        return await call_next(request)

    def _get_user_key(self, request: Request) -> str:
        user = getattr(request.state, "user", None)
        if user is not None:
            return f"u{user.id}"
        # 取真实 IP
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return f"ip:{forwarded.split(',')[0].strip()}"
        client = request.client
        return f"ip:{client.host if client else 'unknown'}"

    def _endpoint_key(self, path: str) -> str:
        """将路径归一化为接口分类，避免高基数。

        如 /api/v1/articles/123 → articles
        """
        parts = [p for p in path.split("/") if p]
        # parts 形如 ['api','v1','articles','123']
        if len(parts) >= 3:
            return parts[2]
        return "other"
