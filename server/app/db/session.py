"""异步数据库引擎与会话工厂。"""
# Monkey-patch: 修复 aiomysql + SQLAlchemy 的 ping 兼容性问题
# SQLAlchemy 的 pool_pre_ping 调用 dbapi_connection.ping() 但不传 reconnect 参数
# 而 aiomysql 的 AsyncAdapt_aiomysql_connection.ping 签名要求 reconnect
try:
    from sqlalchemy.dialects.mysql.aiomysql import AsyncAdapt_aiomysql_connection
    _orig_ping = AsyncAdapt_aiomysql_connection.ping
    def _patched_ping(self, reconnect=True):
        return _orig_ping(self, reconnect=reconnect)
    AsyncAdapt_aiomysql_connection.ping = _patched_ping
except Exception:
    pass

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

# 确保所有 ORM 模型注册到 Base.metadata（解决 relationship 延迟解析）
from app.models import ensure_models_loaded
ensure_models_loaded()

engine = create_async_engine(
    settings.database_url,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    pool_recycle=3600,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)
