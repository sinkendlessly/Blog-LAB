"""安全响应头中间件：添加基础安全防护头。"""
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """为每个响应添加安全头，防止常见 Web 攻击。"""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # 禁止浏览器嗅探 MIME 类型（防 XSS 的一种手段）
        response.headers["X-Content-Type-Options"] = "nosniff"
        # 禁止页面被嵌入 iframe（防 clickjacking）
        response.headers["X-Frame-Options"] = "DENY"
        # 启用 XSS 过滤器（老旧浏览器兼容）
        response.headers["X-XSS-Protection"] = "1; mode=block"
        # 限制 Referer 传递策略
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        return response
