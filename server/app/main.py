"""FastAPI 应用入口。

职责：
- lifespan 初始化/关闭 Redis、启动/停止 APScheduler
- 注册 CORS、异常处理、限流中间件
- 挂载 v1 路由
- 提供健康检查端点
"""
import logging
import secrets
from contextlib import asynccontextmanager

# Monkey-patch: 修复 aiomysql + SQLAlchemy 的 ping 兼容性问题
# SQLAlchemy 的 do_ping 调用 dbapi_connection.ping() 但 aiomysql 的异步适配器需要 reconnect 参数
try:
    import aiomysql.connection
    _orig_ping = aiomysql.connection.AsyncAdapt_aiomysql_connection.ping
    def _patched_ping(self, reconnect=True):
        return _orig_ping(self)
    aiomysql.connection.AsyncAdapt_aiomysql_connection.ping = _patched_ping
except Exception:
    pass

# 同样 patch SQLAlchemy 的 MySQLDialect.do_ping
try:
    from sqlalchemy.dialects.mysql.pymysql import MySQLDialect_pymysql
    _orig_do_ping = MySQLDialect_pymysql.do_ping
    async def _patched_do_ping(self, dbapi_connection):
        if hasattr(dbapi_connection, 'ping'):
            try:
                dbapi_connection.ping(reconnect=True)
            except Exception:
                from sqlalchemy.exc import DBAPIError
                raise
        return True
    MySQLDialect_pymysql.do_ping = _patched_do_ping
except Exception:
    pass

from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1 import api_router
from app.api.v1.sitemap import router as sitemap_router
from app.core.config import settings
from app.core.redis import close_redis, init_redis
from app.core.rabbitmq import init_rabbitmq, close_rabbitmq
from app.middleware.body_size_limit import BodySizeLimitMiddleware
from app.middleware.error_handler import register_exception_handlers
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.trace_id import RequestIDMiddleware
from app.middleware.access_log import AccessLogMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.tasks.notification_consumer import start_consumer, stop_consumer
from app.tasks.scheduler import start_scheduler, stop_scheduler

# 确保所有 ORM 模型注册到 Base.metadata（relationship 解析需要）
from app.models import ensure_models_loaded
ensure_models_loaded()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _check_security() -> None:
    """启动时安全检查：检测常见不安全配置。"""
    # 检查 JWT_SECRET_KEY 是否仍为默认值
    default_prefixes = ("please_change", "changeme", "default")
    if any(settings.JWT_SECRET_KEY.lower().startswith(p) for p in default_prefixes):
        logger.warning(
            "⚠ JWT_SECRET_KEY 仍为默认值！请修改为随机字符串。\n"
            "  生成命令: python -c \"import secrets; print(secrets.token_urlsafe(32))\""
        )
    # 检查 DEBUG 模式
    if settings.DEBUG:
        logger.warning("⚠ DEBUG=True！生产环境请设为 False")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动
    await init_redis()
    start_scheduler()
    await init_rabbitmq()
    await start_consumer()

    # 安全检查：检测是否仍在使用默认密钥
    _check_security()

    logger.info("BlogShare server starting...")
    yield
    # 关闭
    await stop_consumer()
    await stop_scheduler()
    await close_rabbitmq()
    await close_redis()
    logger.info("BlogShare server stopped.")


app = FastAPI(
    title="BlogShare API",
    description="博客知识分享系统后端 API",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# 中间件注册顺序（先添加 = 外层，后添加 = 内层，紧贴路由）
# 请求流：CORS → 安全头 → 请求ID → 访问日志 → 限流 → 路由
# 响应流：路由 → 限流 → 访问日志 → 请求ID → 安全头 → CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestIDMiddleware)
app.add_middleware(AccessLogMiddleware)
app.add_middleware(BodySizeLimitMiddleware)
app.add_middleware(RateLimitMiddleware)

# 异常处理
register_exception_handlers(app)

# 路由
app.include_router(api_router, prefix="/api/v1")

# 网站地图（根路径）
app.include_router(sitemap_router)

# 静态文件：上传目录
upload_dir = Path(settings.UPLOAD_DIR)
upload_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(upload_dir)), name="uploads")


@app.get("/api/health", summary="健康检查（容器 healthcheck）")
async def health() -> dict:
    return {"status": "ok", "service": "blogshare-server"}


@app.get("/", summary="根路径")
async def root() -> dict:
    return {"name": "BlogShare API", "docs": "/api/docs"}
