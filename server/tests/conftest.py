"""pytest 配置与测试 fixture。

策略：
- 测试数据库：blogshare_test（MySQL），create_all 建表，drop_all 清理
- 事务隔离：每测试函数一个外层事务，测完 rollback，数据零污染
- Redis 模拟：FakeRedis（内存 dict），patch app.core.redis.get_redis()
- 依赖覆盖：FastAPI dependency_overrides 替换 get_db / get_current_user
"""
import os
from typing import AsyncIterator

# ═══════════════════════════════════════════════
# 1. 在导入任何 app 模块前设置测试环境变量
# ═══════════════════════════════════════════════
os.environ.setdefault("TESTING", "true")
os.environ.setdefault(
    "DATABASE_URL",
    "mysql+aiomysql://root:1234@localhost:3306/blogshare_test?charset=utf8mb4",
)
os.environ.setdefault("SMS_PROVIDER", "mock")
os.environ.setdefault("UPLOAD_DIR", "/tmp/blogshare_test_uploads")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-not-for-production")

# 与 main.py 一致的 aiomysql ping monkey-patch
try:
    import aiomysql.connection
    _orig_ping = aiomysql.connection.AsyncAdapt_aiomysql_connection.ping
    def _patched_ping(self, reconnect=True):
        return _orig_ping(self)
    aiomysql.connection.AsyncAdapt_aiomysql_connection.ping = _patched_ping
except Exception:
    pass

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

# 必须在 env 设置后导入 app 模块
from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.db.base import Base
from app.models import ensure_models_loaded

ensure_models_loaded()

# 使用测试配置
TEST_DB_URL = os.environ["DATABASE_URL"]


# ═══════════════════════════════════════════════
# 2. FakeRedis：内存 dict 模拟 Redis 基本操作
# ═══════════════════════════════════════════════
class FakeRedis:
    """在内存 dict 上实现项目用到的 Redis 方法。"""

    def __init__(self):
        self._data: dict = {}
        self._expiry: dict = {}  # key → expiry timestamp
        # pipeline 缓存（FakeRedisPipeline 写入此处，execute 时刷入 _data）
        self._pipeline_cache: dict = {}
        self._pipeline_expiry: dict = {}
        self._in_pipeline = False

    def _is_expired(self, key: str) -> bool:
        import time
        exp = self._expiry.get(key)
        return exp is not None and time.time() > exp

    def _evict(self):
        import time
        now = time.time()
        expired = [k for k, e in self._expiry.items() if e <= now]
        for k in expired:
            self._data.pop(k, None)
            self._expiry.pop(k, None)

    def pipeline(self, transaction: bool = True):
        """返回一个 FakeRedisPipeline，支持 async with 语法。"""
        return FakeRedisPipeline(self)

    async def get(self, key: str) -> str | None:
        self._evict()
        return self._data.get(key)

    async def set(self, key: str, value: str, ex: int | None = None, nx: bool = False) -> bool:
        if nx and key in self._data and not self._is_expired(key):
            return False
        self._data[key] = value
        if ex:
            import time
            self._expiry[key] = time.time() + ex
        else:
            self._expiry.pop(key, None)
        return True

    async def delete(self, *keys: str) -> int:
        count = 0
        for k in keys:
            if k in self._data:
                del self._data[k]
                self._expiry.pop(k, None)
                count += 1
        return count

    async def incr(self, key: str) -> int:
        val = int(self._data.get(key, 0)) + 1
        self._data[key] = str(val)
        return val

    async def expire(self, key: str, seconds: int) -> bool:
        if key in self._data:
            import time
            self._expiry[key] = time.time() + seconds
            return True
        return False

    async def ttl(self, key: str) -> int:
        import time
        exp = self._expiry.get(key)
        if exp is None:
            return -1 if key in self._data else -2
        ttl = int(exp - time.time())
        return max(0, ttl)

    async def exists(self, key: str) -> bool:
        self._evict()
        return key in self._data

    # ============ ZSet 操作 ============

    async def zadd(self, key: str, mapping: dict, **kwargs) -> int:
        return 0

    async def zrem(self, key: str, *values: str) -> int:
        return 0

    async def zrevrange(self, key: str, start: int, end: int, **kwargs) -> list:
        return []

    async def zcount(self, key: str, min: str, max: str) -> int:
        return 0

    # ============ List 操作 ============

    async def lpush(self, key: str, value: str) -> int:
        """从左侧推入。"""
        lst = self._data.setdefault(key, [])
        if not isinstance(lst, list):
            lst = []
            self._data[key] = lst
        lst.insert(0, str(value))
        return len(lst)

    async def lrem(self, key: str, count: int, value: str) -> int:
        """移除指定值（count=0 移除所有）。"""
        lst = self._data.get(key)
        if not isinstance(lst, list):
            return 0
        before = len(lst)
        if count == 0:
            self._data[key] = [x for x in lst if x != str(value)]
        elif count > 0:
            removed = 0
            self._data[key] = [x for x in lst if not (x == str(value) and (removed := removed + 1) <= count)]
        else:
            removed = 0
            lst2 = lst.copy()
            for i in range(len(lst2) - 1, -1, -1):
                if lst2[i] == str(value):
                    del lst2[i]
                    removed += 1
                    if removed == -count:
                        break
            self._data[key] = lst2
        return before - len(self._data.get(key, []))

    async def ltrim(self, key: str, start: int, stop: int) -> bool:
        """裁剪列表。"""
        lst = self._data.get(key)
        if not isinstance(lst, list):
            return False
        if start < 0:
            start = max(len(lst) + start, 0)
        if stop < 0:
            stop = max(len(lst) + stop, 0)
        self._data[key] = lst[start:stop + 1]
        return True

    async def lrange(self, key: str, start: int, stop: int) -> list:
        lst = self._data.get(key)
        if not isinstance(lst, list):
            return []
        return lst[start:stop + 1]

    # ============ Scan / Keys ============

    async def scan_iter(self, match: str = "*", count: int = 100):
        """Async generator，兼容 async for。"""
        if False:
            yield

    async def keys(self, pattern: str = "*"):
        return []

    async def aclose(self):
        self._data.clear()
        self._expiry.clear()


class FakeRedisPipeline:
    """模拟 Redis pipeline（MULTI/EXEC 事务），收集命令后一次性写入。"""

    def __init__(self, redis: FakeRedis):
        self._redis = redis
        self._commands: list = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.execute()

    async def lrem(self, key, count, value):
        self._commands.append(("lrem", key, count, value))

    async def lpush(self, key, value):
        self._commands.append(("lpush", key, value))

    async def ltrim(self, key, start, stop):
        self._commands.append(("ltrim", key, start, stop))

    async def execute(self):
        for cmd in self._commands:
            op = cmd[0]
            if op == "lrem":
                await self._redis.lrem(cmd[1], cmd[2], cmd[3])
            elif op == "lpush":
                await self._redis.lpush(cmd[1], cmd[2])
            elif op == "ltrim":
                await self._redis.ltrim(cmd[1], cmd[2], cmd[3])
        self._commands.clear()


# ═══════════════════════════════════════════════
# 3. 引擎 + Redis（module-scoped，避免事件循环冲突）
# ═══════════════════════════════════════════════

@pytest_asyncio.fixture
async def test_engine():
    """创建引擎 + 建表，用完销毁（function-scoped 防止事件循环冲突）。"""
    engine = create_async_engine(TEST_DB_URL, echo=False, pool_pre_ping=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture
async def _fake_redis():
    """每测试一个新的 FakeRedis 实例。"""
    redis = FakeRedis()
    yield redis


# ═══════════════════════════════════════════════
# 4. function-scoped fixtures（autouse）
# ═══════════════════════════════════════════════

@pytest_asyncio.fixture(autouse=True)
async def patch_redis(_fake_redis):
    """每测试自动替换 app.core.redis.get_redis() 返回 FakeRedis。"""
    import app.core.redis as redis_mod
    import app.services.auth_service as auth_svc_mod
    import app.services.article_service as article_svc_mod
    import app.services.counter_service as counter_svc_mod
    import app.services.cache_service as cache_svc_mod
    import app.services.comment_service as comment_svc_mod
    import app.services.interaction_service as interaction_svc_mod
    import app.services.user_service as user_svc_mod
    import app.services.recommendation_service as rec_svc_mod
    import app.services.ranking_service as ranking_svc_mod
    import app.services.history_service as history_svc_mod

    modules = [
        redis_mod,
        auth_svc_mod,
        article_svc_mod,
        counter_svc_mod,
        cache_svc_mod,
        comment_svc_mod,
        interaction_svc_mod,
        user_svc_mod,
        rec_svc_mod,
        ranking_svc_mod,
        history_svc_mod,
    ]

    originals = {}
    for mod in modules:
        if hasattr(mod, "get_redis"):
            originals[mod] = mod.get_redis
            mod.get_redis = lambda r=_fake_redis: r

    yield

    for mod, orig in originals.items():
        mod.get_redis = orig


@pytest_asyncio.fixture(autouse=True)
async def test_session(test_engine):
    """
    每测试一个独立事务，测后 rollback。
    实现：创建 session → 开事务 → yield → 回滚事务。
    """
    session = AsyncSession(
        bind=test_engine,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )
    await session.begin()

    yield session

    await session.rollback()
    await session.close()


@pytest_asyncio.fixture
async def db_session(test_session):
    """显式 db session 供测试函数直接准备数据。"""
    return test_session


# ═══════════════════════════════════════════════
# 5. HTTP 客户端（带依赖覆盖）
# ═══════════════════════════════════════════════

@pytest_asyncio.fixture
async def async_client(test_session, patch_redis):
    """httpx 异步测试客户端，注入测试 session + 绕过认证。"""

    # 从 app.main 导入（此时 env 已设好）
    from app.main import app
    from app.core.deps import get_db, get_current_user

    # 替换 get_db：yield 测试 session，不自动 commit
    async def _override_get_db():
        yield test_session

    app.dependency_overrides[get_db] = _override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client

    app.dependency_overrides.clear()


# ═══════════════════════════════════════════════
# 6. 认证用户 fixtures
# ═══════════════════════════════════════════════

@pytest_asyncio.fixture
async def test_user(db_session) -> "User":
    """创建一个普通测试用户。"""
    from app.models.user import User
    from app.core.security import hash_password

    user = User(
        email="testuser@example.com",
        username="testuser",
        password_hash=hash_password("testpass123"),
        role="USER",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def test_admin(db_session) -> "User":
    """创建一个超级管理员测试用户。"""
    from app.models.user import User
    from app.core.security import hash_password

    user = User(
        email="admin@example.com",
        username="testadmin",
        password_hash=hash_password("admin123"),
        role="ADMIN",
        is_super_admin=True,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def auth_headers(test_user) -> dict:
    """生成普通用户的 Authorization header（真实 JWT）。"""
    from app.core.security import create_access_token

    token, _ = create_access_token(subject=str(test_user.id))
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def admin_headers(test_admin) -> dict:
    """生成管理员的 Authorization header。"""
    from app.core.security import create_access_token

    token, _ = create_access_token(subject=str(test_admin.id))
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def override_get_current_user(test_user):
    """替换 get_current_user 依赖，返回 test_user（跳过 JWT 校验）。"""
    async def _inner():
        return test_user
    return _inner


@pytest_asyncio.fixture
async def auth_client(async_client, override_get_current_user):
    """已注入认证用户的客户端（无需传 auth_headers）。"""
    from app.main import app
    from app.core.deps import get_current_user

    app.dependency_overrides[get_current_user] = override_get_current_user
    yield async_client
    app.dependency_overrides.pop(get_current_user, None)
