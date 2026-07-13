# FastAPI 后端单元测试实现方案

## 1. 文件结构

```
server/
  tests/
    conftest.py              # 主 fixture：引擎、session、客户端、认证用户、Redis
    test_auth.py             # 认证路由测试（注册/登录/刷新/登出/me/改密）
    test_articles.py         # 文章路由测试（CRUD/列表/草稿/权限）
    test_comments.py         # 评论路由测试（预留）
    pyproject.toml           # pytest 配置

  app/
    core/
      config.py              # ★ 改造：添加 DATABASE_URL 直接覆盖 + TESTING 标记
```

---

## 2. config.py 改造方案

当前问题：`database_url` 是 `@property`，从 MYSQL_* 字段拼接，无法单独覆盖。

改造目标：添加 `DATABASE_URL` 和 `TESTING` 字段，允许环境变量直接指定完整连接串。

```python
# 在 Settings 类中添加
TESTING: bool = False                # 测试模式标记
DATABASE_URL: str = ""               # 若非空，database_url 直接返回此值

# 修改 database_url 为：
@property
def database_url(self) -> str:
    if self.DATABASE_URL:
        return self.DATABASE_URL
    return (
        f"mysql+aiomysql://{self.MYSQL_USER}:{self.MYSQL_PASSWORD}"
        f"@{self.MYSQL_HOST}:{self.MYSQL_PORT}/{self.MYSQL_DATABASE}?charset=utf8mb4"
    )
```

测试时通过环境变量覆盖：
```
DATABASE_URL=mysql+aiomysql://root:1234@localhost:3306/blogshare_test?charset=utf8mb4
TESTING=true
```

不改动原 `.env` 文件，所有测试配置通过 `os.environ` 注入，在 conftest 的 `session_start` 阶段设置。

---

## 3. conftest.py 完整设计

### 3.1 全局策略概览

| 层次 | 方案 |
|------|------|
| 数据库 | 真实 MySQL，`blogshare_test` 数据库，`create_all` / `drop_all` |
| 事务隔离 | 外层事务 + 每测试 savepoint 回滚 |
| Redis | `fakeredis.aioredis` 模拟，patch `app.core.redis.get_redis` |
| 依赖覆盖 | FastAPI `dependency_overrides` 替换 get_db / get_current_user |
| 中间件 | 保留，但禁用限流（或配置高阈值） |
| App 导入 | 在 env vars 设置后导入，避免引擎指向错误数据库 |

### 3.2 conftest.py 伪代码

```python
"""
pytest 配置与 fixture。
策略：每测试函数一个事务 savepoint，测完回滚；Redis 用 fakeredis 模拟。
"""
import os
import pytest
import pytest_asyncio
from typing import AsyncIterator, Generator
from asyncio import get_event_loop_policy

# ==== 1. 在导入任何 app 模块前设置测试环境变量 ====
os.environ["TESTING"] = "true"
os.environ["DATABASE_URL"] = "mysql+aiomysql://root:1234@localhost:3306/blogshare_test?charset=utf8mb4"
os.environ["REDIS_DB"] = "15"  # fakeredis 不使用，但保留 fallback
os.environ["SMS_PROVIDER"] = "mock"
os.environ["UPLOAD_DIR"] = "/tmp/test_uploads"

# ==== 2. 现在可以安全导入 app 模块 ====
from sqlalchemy.ext.asyncio import (
    AsyncSession, async_sessionmaker, create_async_engine, AsyncConnection,
)
from sqlalchemy import text
import fakeredis.aioredis
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db import session as db_session_module
from app.db.base import Base
from app.core import config, redis as redis_module
from app.core.deps import get_db, get_current_user
from app.core.security import create_access_token, hash_password
from app.models.user import User

# ──────────────────────────────────────────────
# 3. session-scoped: engine + 建表
# ──────────────────────────────────────────────

@pytest.fixture(scope="session")
def event_loop():
    """session-scoped event loop（pytest-asyncio 需要单 session 共享 loop）"""
    policy = get_event_loop_policy()
    loop = policy.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def test_engine():
    """创建指向 blogshare_test 的引擎，初始化表结构，用完销毁。"""
    engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)

    # 确保 blogshare_test 数据库存在（MySQL 用 CREATE DATABASE IF NOT EXISTS）
    # 连接时 URL 中已包含数据库名，此处直接创建表
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture(scope="session")
async def test_redis():
    """session-scoped fakeredis 实例。"""
    redis = fakeredis.aioredis.FakeRedis(decode_responses=True)
    yield redis
    await redis.aclose()


# ──────────────────────────────────────────────
# 4. function-scoped: session + 客户端 + 认证用户
# ──────────────────────────────────────────────

@pytest_asyncio.fixture(autouse=True)
async def patch_redis(test_redis):
    """
    autouse fixture：每测试自动 patch get_redis() 返回 fakeredis。
    使用 monkeypatch 在模块级别替换。
    """
    import app.core.redis as redis_mod
    import app.services.auth_service as auth_svc
    import app.services.article_service as article_svc
    import app.services.counter_service as counter_svc
    import app.services.cache_service as cache_svc
    # ... 所有引用了 get_redis 的模块都需要 patch

    # 保存原始引用
    original_get_redis = redis_mod.get_redis

    # 替换为返回 fakeredis 的函数
    redis_mod.get_redis = lambda: test_redis

    yield

    # 恢复
    redis_mod.get_redis = original_get_redis


@pytest_asyncio.fixture(autouse=True)
async def test_session(test_engine):
    """
    autouse fixture：每测试一个独立事务，测完回滚。

    实现方式：
    1. 从引擎拿原始连接
    2. 在连接上开事务
    3. 绑定 session 到该连接
    4. yield session
    5. 回滚事务（所有修改消失）
    """
    # 获取连接并开启事务
    connection = await test_engine.connect()
    trans = await connection.begin()

    # 创建绑定到此连接/事务的 session
    session = AsyncSession(
        bind=connection,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )

    # 用 savepoint 实现每测试回滚（SQLAlchemy nested transaction）
    # 实际上不需要额外 savepoint，只需在 yield 后 rollback 外层事务即可

    yield session

    await session.close()
    await trans.rollback()
    await connection.close()


@pytest_asyncio.fixture
async def db_session(test_session):
    """显式 db session 供测试函数直接使用（如准备测试数据）。"""
    return test_session


@pytest_asyncio.fixture
async def async_client(test_session):
    """
    测试用 HTTP 客户端。
    关键：通过 dependency_overrides 注入测试 session（支持保存点回滚）。
    """

    # 定义 override 版本的 get_db
    async def override_get_db() -> AsyncIterator[AsyncSession]:
        yield test_session
        # 不在这里 commit/rollback——由 test_session fixture 管理

    app.dependency_overrides[get_db] = override_get_db

    # 使用 ASGI transport 创建 httpx 客户端
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://testserver",
    ) as client:
        yield client

    # 清理
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def test_user(db_session) -> User:
    """创建一个测试用户，返回 ORM 对象。"""
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
async def auth_headers(test_user) -> dict:
    """生成测试用户的 Authorization header。"""
    access_token, _ = create_access_token(
        subject=str(test_user.id),
        extra={"role": test_user.role, "username": test_user.username},
    )
    return {"Authorization": f"Bearer {access_token}"}


@pytest_asyncio.fixture
async def override_get_current_user(test_user):
    """
    高阶 fixture：替换 get_current_user 依赖，跳过 JWT 校验。
    用法：先 invoke 这个 fixture，再用 async_client。

    conftest 中直接注册 override：

    async def _override_get_current_user():
        return test_user

    app.dependency_overrides[get_current_user] = _override_get_current_user
    """
    async def _inner():
        return test_user
    return _inner


# ──────────────────────────────────────────────
# 5. 可选：管理员用户 fixtures
# ──────────────────────────────────────────────

@pytest_asyncio.fixture
async def test_admin(db_session) -> User:
    user = User(
        email="admin@example.com",
        username="admin",
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
async def admin_headers(test_admin) -> dict:
    access_token, _ = create_access_token(
        subject=str(test_admin.id),
        extra={"role": test_admin.role, "username": test_admin.username},
    )
    return {"Authorization": f"Bearer {access_token}"}
```

### 3.3 关键设计决策说明

**为什么用 autouse patch_redis 而非 fakeredis 作为全局替换？**

几乎所有 service 的 `__init__` 中都调用了 `get_redis()`：
```python
class AuthService:
    def __init__(self, db):
        self.db = db
        self.redis = get_redis()  # ← 模块级全局函数
```
`get_redis()` 返回模块级全局变量 `redis_client`，无法通过 `dependency_overrides` 替换。因此采用 `unittest.mock` 风格在模块级别 patch。

更彻底的方案是重构 service，让 Redis 通过构造器注入。但在当前设计阶段，patch 方案侵入性最小。

**为什么 get_db override 中没有 commit/rollback？**

原始 `get_db()` 在 yield 后 commit/rollback，但测试中事务管理应完全由 `test_session` fixture 控制（所有修改在测后回滚），所以 override 版本只 yield session，不做任何提交。

**为什么 test_session 用 autouse？**

确保每个测试都用测试 session，即使测试函数没显式请求 `test_session` 或 `db_session` fixture。测试函数只需声明 `async_client` 即可获得完整的环境。

---

## 4. 依赖覆盖（Dependency Overrides）策略

| 原始依赖 | Override | 说明 |
|----------|----------|------|
| `get_db` | `test_session` | 事务隔离 |
| `get_current_user` | 返回 `test_user` | 跳过 JWT 校验 + Redis 黑名单检查 |
| `get_current_user_optional` | 返回 `test_user` 或 `None` | 按需 |
| `require_admin` | 返回 `test_admin` | 跳过角色检查 |
| `require_super_admin` | 返回 `test_admin` | 跳过超级管理员检查 |

覆盖时机：

```python
# 在 async_client fixture 中统一注册
app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[get_current_user] = override_get_current_user
```

**核心原则：** 测试认证到路由层为止（service 内部逻辑通过 service 单元测试覆盖）。因此 `get_current_user` 的 override 直接返回预创建的用户对象，无需签 JWT token。

`auth_headers` fixture（生成真实 JWT token）仅用于测试 `/auth/me`、`/auth/logout` 等认证端点自身——这些端点内部调用 `get_current_user`，我们需要它们走真实的 JWT 解码流程。

---

## 5. 中间件处理

### 5.1 RateLimitMiddleware

限流中间件内部直接调用 `get_redis()`，每请求都会增加 Redis 计数器。测试中 fakeredis 没有连接限制，不会触发真正限流，但由于 patch 后 get_redis() 返回 fakeredis，计数器会正常增长。

**解决方案1（推荐）：** 在 override_get_current_user 中设置 `request.state.user`，并配置环境变量使限流阈值极高：

```python
# 在 pytest session 开始时设置
os.environ["TEST_RATE_LIMIT"] = "1000000"
```

中间件代码不够灵活（阈值硬编码为 60），但 fakeredis 的 INCR 值正常，只会在请求数超过硬编码阈值时报 429。对于每个测试只发几条请求的单元测试，不会触发限流。

**解决方案2（更彻底）：** 在创建测试 app 时移除此中间件：

```python
# 在 async_client fixture 中
app.user_middleware = [
    m for m in app.user_middleware
    if m.cls.__name__ != "RateLimitMiddleware"
]
```

但这会改变中间件链整体结构，可能导致测试与实际行为不一致。**优先用方案1**。

### 5.2 其他中间件

| 中间件 | 处理方式 | 理由 |
|--------|----------|------|
| CORSMiddleware | 保留 | 不影响测试结果，CORS 头不影响请求处理 |
| SecurityHeadersMiddleware | 保留 | 无害 |
| RequestIDMiddleware | 保留 | 无害 |
| AccessLogMiddleware | 保留 | 只是日志 |
| BodySizeLimitMiddleware | 保留 | 不影响 |

### 5.3 main.py 导入副作用

导入 `app.main` 时会执行：
- Monkey patches（安全，幂等）
- `ensure_models_loaded()`（安全，幂等）
- `upload_dir.mkdir(parents=True, exist_ok=True)`（测试时指向 `/tmp` 目录，安全）

不需要特殊处理。

---

## 6. test_auth.py 测试场景

```python
"""
认证路由测试。

测试策略：
- /register /login 用真实请求 + 真实 DB
- /me /logout 需要认证的端点，用 auth_headers
- /refresh 需要 HttpOnly Cookie，测试 client.cookies
"""

class TestRegister:
    """POST /api/v1/auth/register"""

    async def test_register_success(self, async_client):
        """正常注册 → 201 + UserOut"""

    async def test_register_dup_email(self, async_client):
        """重复邮箱 → 409 EMAIL_EXISTS"""

    async def test_register_dup_username(self, async_client):
        """重复用户名 → 409 USERNAME_EXISTS"""

    async def test_register_invalid_email(self, async_client):
        """非法邮箱格式 → 422"""

    async def test_register_short_password(self, async_client):
        """密码 < 6 位 → 422"""


class TestLogin:
    """POST /api/v1/auth/login"""

    async def test_login_success(self, async_client):
        """正常登录 → 200 + TokenResponse + HttpOnly Cookie"""

    async def test_login_wrong_password(self, async_client):
        """密码错误 → 401 INVALID_CREDENTIALS"""

    async def test_login_nonexistent(self, async_client):
        """账号不存在 → 401 INVALID_CREDENTIALS"""

    async def test_login_disabled_user(self, async_client):
        """已禁用用户 → 403 ACCOUNT_DISABLED"""


class TestMe:
    """GET /api/v1/auth/me"""

    async def test_me_success(self, async_client, auth_headers):
        """正常获取用户信息 → 200"""

    async def test_me_no_token(self, async_client):
        """未携带 token → 401"""

    async def test_me_expired_token(self, async_client):
        """过期 token → 401 TOKEN_EXPIRED"""


class TestLogout:
    """POST /api/v1/auth/logout"""

    async def test_logout_success(self, async_client, auth_headers):
        """正常登出 → 200 + Cookie 清除"""

    async def test_logout_twice(self, async_client, auth_headers):
        """重复登出不应报错（幂等）"""


class TestChangePassword:
    """PUT /api/v1/auth/me/password"""

    async def test_change_password_success(self, async_client, auth_headers):
        """正常修改 → 200"""

    async def test_change_password_wrong_old(self, async_client, auth_headers):
        """原密码错误 → 400 OLD_PASSWORD_WRONG"""


class TestRefresh:
    """POST /api/v1/auth/refresh"""

    async def test_refresh_success(self, async_client, auth_headers):
        """用 refresh cookie 刷新 → 200"""

    async def test_refresh_no_cookie(self, async_client):
        """无 cookie → 401 REFRESH_TOKEN_MISSING"""
```

---

## 7. test_articles.py 测试场景

```python
"""
文章路由测试。

权限矩阵：
- POST /articles: 需要认证
- GET /articles: 公开
- GET /articles/{slug}: 公开（未登录无互动状态）
- PUT /articles/{id}: 需要认证 + 本人/管理员
- DELETE /articles/{id}: 需要认证 + 本人/管理员
- GET /articles/me/drafts: 需要认证（本人草稿）
"""

class TestCreateArticle:
    """POST /api/v1/articles"""

    async def test_create_draft_success(self, async_client, auth_headers):
        """创建草稿 → 201"""

    async def test_create_article_unauthorized(self, async_client):
        """未登录 → 401"""

    async def test_create_article_missing_title(self, async_client, auth_headers):
        """缺少标题 → 422"""

    async def test_create_article_with_tags(self, async_client, auth_headers):
        """指定标签创建 → 201 + 标签关联正确"""

    async def test_create_article_with_category(self, async_client, auth_headers):
        """指定分类创建 → 201 + 分类关联正确"""


class TestListArticles:
    """GET /api/v1/articles"""

    async def test_list_published(self, async_client):
        """公开列表 → 200 + PageResponse"""

    async def test_list_empty(self, async_client):
        """无文章时 → 空列表"""

    async def test_list_with_category_filter(self, async_client):
        """按分类过滤"""

    async def test_list_with_cursor_pagination(self, async_client):
        """游标分页"""


class TestGetArticle:
    """GET /api/v1/articles/{slug}"""

    async def test_get_published(self, async_client):
        """获取已发布文章 → 200"""

    async def test_get_draft_not_found(self, async_client):
        """草稿不应出现在公开访问中 → 404"""

    async def test_get_nonexistent(self, async_client):
        """不存在的 slug → 404"""

    async def test_get_with_auth_and_interaction_status(self, async_client, auth_headers):
        """登录用户查看 → 返回 is_liked / is_favorited 状态"""


class TestUpdateArticle:
    """PUT /api/v1/articles/{id}"""

    async def test_update_own_draft(self, async_client, auth_headers):
        """修改本人的草稿 → 200"""

    async def test_update_others_article(self, async_client, auth_headers):
        """修改他人的文章 → 403"""

    async def test_update_publish_draft(self, async_client, auth_headers):
        """草稿发布 → 200 + published_at 非空"""


class TestDeleteArticle:
    """DELETE /api/v1/articles/{id}"""

    async def test_delete_own_article(self, async_client, auth_headers):
        """删除自己的文章 → 200"""

    async def test_delete_others_article(self, async_client, auth_headers):
        """删除他人的文章 → 403"""

    async def test_delete_as_admin(self, async_client, admin_headers):
        """管理员可以删除他人文章 → 200"""


class TestMyDrafts:
    """GET /api/v1/articles/me/drafts"""

    async def test_list_own_drafts(self, async_client, auth_headers):
        """获取本人的草稿列表"""

    async def test_drafts_other_users_not_visible(self, async_client, auth_headers):
        """不能看到他人的草稿"""
```

---

## 8. 完整文件内容

### 8.1 pyproject.toml

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
python_files = ["test_*.py"]
```

### 8.2 运行时 .env 覆盖

不修改 `.env` 文件，通过 `conftest.py` 最顶部设置 `os.environ`，并在 `pyproject.toml` 或命令行传入：

```bash
# 方式1（推荐）：conftest 中硬编码测试环境变量，最可靠
cd server && python -m pytest tests/ -v --asyncio-mode=auto

# 方式2：环境变量覆盖
cd server && DATABASE_URL="mysql+aiomysql://root:1234@localhost:3306/blogshare_test?charset=utf8mb4" \
  TESTING=true \
  python -m pytest tests/ -v
```

### 8.3 测试数据库初始化脚本（可选）

```sql
-- 首次运行前执行
CREATE DATABASE IF NOT EXISTS blogshare_test
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

`Base.metadata.create_all` 在 `test_engine` fixture 中自动执行，因此只需要确保数据库存在即可。

---

## 9. 已知挑战与规避方案

### 挑战1：引擎全局变量

`db/session.py` 模块级变量在 import 时即创建。解决方案：在 conftest 顶部设置 `DATABASE_URL` 环境变量使 `config.settings.database_url` 返回正确值。

**但 engine 和 AsyncSessionLocal 在被测试代码中使用的是 import 时的值**——因为 `db/session.py` 是在模块加载时创建的。解决方案：

```python
# 在 conftest 中，import app 后立即替换引擎
from app.db import session as db_session_module

@pytest_asyncio.fixture(scope="session")
async def test_engine():
    engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
    # ★ 替换模块级全局变量
    db_session_module.engine = engine
    db_session_module.AsyncSessionLocal = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False,
    )
    ...
```

由于 `get_db()` 依赖中引用的是 `from app.db.session import AsyncSessionLocal`，在 import 时它拿到了原始引用。替换模块变量后，后续调用会使用新引擎。**但原始引用已被 import 到 `deps.py` 的模块命名空间**，所以还需要同步：

```python
# 方法A：让 deps 模块跟随
from app.core import deps
deps.AsyncSessionLocal = db_session_module.AsyncSessionLocal

# 方法B（更彻底）：不在 db/session.py 模块级创建，改为懒加载模式
```

**推荐改造现有 `db/session.py` 支持懒加载：**

```python
# db/session.py 改造后
_engine = None
_async_session_local = None

def get_engine():
    global _engine
    if _engine is None:
        _engine = create_async_engine(settings.database_url, ...)
    return _engine

def get_async_session():
    global _async_session_local
    if _async_session_local is None:
        _async_session_local = async_sessionmaker(bind=get_engine(), ...)
    return _async_session_local

# 同时保留模块变量兼容（可选）
engine = property(get_engine)  # 或直接删除，改所有引用处
AsyncSessionLocal = property(get_async_session)
```

但这涉及大量引用修改。**替代方案：在 conftest 中直接暴力替换，不改动现有代码：**

```python
# conftest 中的 test_engine fixture
from app.db import session as db_session_module
from app.core import deps as core_deps_module

new_engine = create_async_engine(...)
new_session_maker = async_sessionmaker(bind=new_engine, ...)

# 替换所有引用该模块变量的地方
db_session_module.engine = new_engine
db_session_module.AsyncSessionLocal = new_session_maker
core_deps_module.engine = new_engine  # deps.py 在模块级引用了 engine
core_deps_module.AsyncSessionLocal = new_session_maker
```

这虽然略粗暴，但对现有代码零侵入，适合快速实施。

### 挑战2：fakeredis 兼容性

`fakeredis` 不完全支持所有 redis-py 命令。如果遇到不支持的命令（如 `scan_iter`），可以降级为使用真实 Redis 测试实例（`REDIS_DB=15`）。

解决路径：在 `test_redis` fixture 中，先尝试 fakeredis，如遇不兼容则 fallback 到真实 Redis。

### 挑战3：test_session 中 service 异步上下文

`get_db()` 原始代码在 yield 后执行 `commit()` 或 `rollback()`，但 override 版本没有这些操作。`test_session` fixture 通过外层事务回滚保证数据不持久化。这意味着测试中 service 的 `flush()` 操作都是可见的（在同一事务内），但测试结束时会被回滚。

如果某些 service 代码调用了 `rollback()`（如 `ArticleService.create` 中的 `IntegrityError` 处理），它会影响外层 test_session 事务。解决方案：在测试中捕获这些错误，避免 fixture 中的 session 被污染。

---

## 10. 运行命令

```bash
# 第一步：创建测试数据库（仅首次）
mysql -u root -p1234 -e "CREATE DATABASE IF NOT EXISTS blogshare_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 第二步：运行测试
cd c:/Users/33321/Desktop/Blog\ LAB/server

# 全量运行
python -m pytest tests/ -v --asyncio-mode=auto

# 指定测试文件
python -m pytest tests/test_auth.py -v --asyncio-mode=auto

# 指定测试类
python -m pytest tests/test_auth.py::TestRegister -v --asyncio-mode=auto

# 指定测试函数
python -m pytest tests/test_articles.py::TestCreateArticle::test_create_draft_success -v --asyncio-mode=auto

# 带覆盖率
python -m pytest tests/ -v --asyncio-mode=auto --cov=app --cov-report=term-missing

# 失败后立即停止
python -m pytest tests/test_auth.py -x -v --asyncio-mode=auto

# 静默模式（只显示失败）
python -m pytest tests/ -q --asyncio-mode=auto
```

**依赖安装：**
```bash
pip install pytest pytest-asyncio pytest-cov httpx fakeredis
```

---

## 11. 实施步骤（建议优先级）

1. **Phase 0 — 基础设施**（30分钟）
   - 改造 `config.py`：添加 `DATABASE_URL` + `TESTING`
   - 创建 `tests/conftest.py`：engine + session + Redis patch 框架
   - 创建 `tests/pyproject.toml`
   - 创建测试数据库 `blogshare_test`
   - 验证：运行 `pytest tests/` 至少能发现测试文件

2. **Phase 1 — 核心 auth 测试**（1小时）
   - 编写 `test_auth.py` 所有场景
   - 重点：注册、登录、JWT 认证流程
   - 验证：所有测试通过且不回写数据

3. **Phase 2 — 核心 article 测试**（1.5小时）
   - 编写 `test_articles.py` 所有场景
   - 重点：CRUD 权限控制、发布流程
   - 验证：事务隔离有效，测试间无状态干扰

4. **Phase 3 — 完善与扩展**（可选）
   - 添加评论测试 `test_comments.py`
   - 添加 fixture 工厂（批量创建文章/标签/分类）
   - 配置 CI（GitHub Actions）集成测试
