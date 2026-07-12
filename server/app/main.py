"""FastAPI 应用入口。

职责：
- lifespan 初始化/关闭 Redis、启动/停止 APScheduler
- 注册 CORS、异常处理、限流中间件
- 挂载 v1 路由
- 提供健康检查端点
"""
import logging
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
from app.middleware.error_handler import register_exception_handlers
from app.middleware.rate_limit import RateLimitMiddleware
from app.tasks.scheduler import start_scheduler, stop_scheduler

# 确保所有 ORM 模型注册到 Base.metadata（relationship 解析需要）
from app.models import ensure_models_loaded
ensure_models_loaded()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动
    await init_redis()
    start_scheduler()
    logger.info("BlogShare server starting...")
    yield
    # 关闭
    await stop_scheduler()
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

# 中间件（顺序：后添加的先执行请求，先添加的先执行响应）
app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
