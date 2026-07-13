"""文章路由测试。

覆盖：创建 / 列表 / 详情 / 更新 / 删除 / 草稿
权限矩阵：
- POST /articles: 需要认证
- GET /articles: 公开
- GET /articles/{slug}: 公开
- PUT /articles/{id}: 需要认证 + 本人/管理员
- DELETE /articles/{id}: 需要认证 + 本人/管理员
"""
import pytest
from httpx import AsyncClient

API_PREFIX = "/api/v1/articles"


# ═══════════════════════════════════════════════
# 辅助函数
# ═══════════════════════════════════════════════

async def create_test_article(db_session, author, title="测试文章",
                              status="PUBLISHED"):
    """快速创建测试文章。"""
    from app.models.article import Article
    from datetime import datetime, timezone

    article = Article(
        title=title,
        slug=title.lower().replace(" ", "-"),
        content="这是文章正文内容",
        status=status,
        author_id=author.id,
        published_at=datetime.now(timezone.utc) if status == "PUBLISHED" else None,
    )
    db_session.add(article)
    await db_session.flush()
    await db_session.refresh(article)
    return article


# ═══════════════════════════════════════════════
# 创建文章
# ═══════════════════════════════════════════════

class TestCreateArticle:
    """POST /api/v1/articles"""

    async def test_create_draft_success(self, async_client: AsyncClient, auth_headers):
        """创建草稿 → 201"""
        resp = await async_client.post(API_PREFIX, json={
            "title": "我的新文章",
            "content": "文章正文内容",
            "status": "DRAFT",
        }, headers=auth_headers)
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "我的新文章"
        assert data["status"] == "DRAFT"
        assert data["slug"]  # slug 自动生成

    async def test_create_unauthorized(self, async_client: AsyncClient):
        """未登录 → 401"""
        resp = await async_client.post(API_PREFIX, json={
            "title": "标题",
            "content": "正文",
        })
        assert resp.status_code == 401

    async def test_create_missing_title(self, async_client: AsyncClient, auth_headers):
        """缺少标题 → 422"""
        resp = await async_client.post(API_PREFIX, json={
            "content": "正文",
            "status": "DRAFT",
        }, headers=auth_headers)
        assert resp.status_code == 422

    async def test_create_pending_review(self, async_client: AsyncClient, auth_headers):
        """提交审核 → 201 + status=PENDING_REVIEW"""
        resp = await async_client.post(API_PREFIX, json={
            "title": "待审核文章",
            "content": "正文",
            "status": "PENDING_REVIEW",
        }, headers=auth_headers)
        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "PENDING_REVIEW"

    async def test_create_invalid_status(self, async_client: AsyncClient, auth_headers):
        """非法状态 → 422"""
        resp = await async_client.post(API_PREFIX, json={
            "title": "标题",
            "content": "正文",
            "status": "INVALID",
        }, headers=auth_headers)
        assert resp.status_code == 422


# ═══════════════════════════════════════════════
# 文章列表
# ═══════════════════════════════════════════════

class TestListArticles:
    """GET /api/v1/articles"""

    async def test_list_published(self, async_client: AsyncClient, db_session, test_user):
        """公开列表 → 200 + PageResponse"""
        await create_test_article(db_session, test_user, "文章1", "PUBLISHED")

        resp = await async_client.get(API_PREFIX)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert len(data["items"]) > 0

    async def test_list_draft_not_shown(self, async_client: AsyncClient, db_session, test_user):
        """草稿不应出现在公开列表中"""
        await create_test_article(db_session, test_user, "草稿", "DRAFT")

        resp = await async_client.get(API_PREFIX)
        data = resp.json()
        titles = [item["title"] for item in data["items"]]
        assert "草稿" not in titles

    async def test_list_empty(self, async_client: AsyncClient):
        """无已发布文章时 → 空列表"""
        resp = await async_client.get(API_PREFIX)
        data = resp.json()
        assert len(data["items"]) == 0


# ═══════════════════════════════════════════════
# 文章详情
# ═══════════════════════════════════════════════

class TestGetArticle:
    """GET /api/v1/articles/{slug}"""

    async def test_get_published(self, async_client: AsyncClient, db_session, test_user):
        """获取已发布文章 → 200"""
        article = await create_test_article(db_session, test_user, "测试文章", "PUBLISHED")
        resp = await async_client.get(f"{API_PREFIX}/{article.slug}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "测试文章"
        assert data["content"] == "这是文章正文内容"

    async def test_get_draft_by_slug(self, async_client: AsyncClient, db_session, test_user):
        """通过 slug 可访问草稿（路由不限制 status）→ 200 + status=DRAFT"""
        article = await create_test_article(db_session, test_user, "草稿文章", "DRAFT")
        resp = await async_client.get(f"{API_PREFIX}/{article.slug}")
        assert resp.status_code == 200
        assert resp.json()["status"] == "DRAFT"

    async def test_get_nonexistent(self, async_client: AsyncClient):
        """不存在的 slug → 404"""
        resp = await async_client.get(f"{API_PREFIX}/nonexistent-slug-12345")
        assert resp.status_code == 404


# ═══════════════════════════════════════════════
# 更新文章
# ═══════════════════════════════════════════════

class TestUpdateArticle:
    """PUT /api/v1/articles/{id}"""

    async def test_update_own_draft(self, async_client: AsyncClient, db_session, test_user, auth_headers):
        """修改本人的草稿 → 200"""
        article = await create_test_article(db_session, test_user, "待修改", "DRAFT")
        resp = await async_client.put(f"{API_PREFIX}/{article.id}", json={
            "title": "已修改",
            "content": "新内容",
        }, headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["title"] == "已修改"

    async def test_update_others_article(self, async_client: AsyncClient, db_session, test_user, auth_headers,
                                          test_admin):
        """修改他人的文章 → 403"""
        article = await create_test_article(db_session, test_admin, "管理员的文章", "PUBLISHED")
        resp = await async_client.put(f"{API_PREFIX}/{article.id}", json={
            "title": "想修改标题",
        }, headers=auth_headers)
        assert resp.status_code == 403

    async def test_update_publish_draft(self, async_client: AsyncClient, db_session, test_user, auth_headers):
        """草稿发布 → 200 + published_at 非空"""
        article = await create_test_article(db_session, test_user, "发布草稿", "DRAFT")
        resp = await async_client.put(f"{API_PREFIX}/{article.id}", json={
            "status": "PUBLISHED",
        }, headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["status"] == "PUBLISHED"
        assert resp.json()["published_at"] is not None


# ═══════════════════════════════════════════════
# 删除文章
# ═══════════════════════════════════════════════

class TestDeleteArticle:
    """DELETE /api/v1/articles/{id}"""

    async def test_delete_own_article(self, async_client: AsyncClient, db_session, test_user, auth_headers):
        """删除自己的文章 → 200"""
        article = await create_test_article(db_session, test_user, "待删除", "PUBLISHED")
        resp = await async_client.delete(f"{API_PREFIX}/{article.id}", headers=auth_headers)
        assert resp.status_code == 200

    async def test_delete_others_article(self, async_client: AsyncClient, db_session, test_user,
                                          auth_headers, test_admin):
        """删除他人的文章 → 403"""
        article = await create_test_article(db_session, test_admin, "管理员的文章", "PUBLISHED")
        resp = await async_client.delete(f"{API_PREFIX}/{article.id}", headers=auth_headers)
        assert resp.status_code == 403

    async def test_delete_as_admin(self, async_client: AsyncClient, db_session, test_user, admin_headers):
        """管理员可以删除他人文章 → 200"""
        article = await create_test_article(db_session, test_user, "用户的文章", "PUBLISHED")
        resp = await async_client.delete(f"{API_PREFIX}/{article.id}", headers=admin_headers)
        assert resp.status_code == 200

    async def test_delete_nonexistent(self, async_client: AsyncClient, auth_headers):
        """不存在的文章 → 404"""
        resp = await async_client.delete(f"{API_PREFIX}/99999", headers=auth_headers)
        assert resp.status_code == 404


# ═══════════════════════════════════════════════
# 我的草稿
# ═══════════════════════════════════════════════

class TestMyDrafts:
    """GET /api/v1/articles/me/drafts"""

    async def test_list_own_drafts(self, async_client: AsyncClient, db_session, test_user, auth_headers):
        """获取本人的草稿列表"""
        await create_test_article(db_session, test_user, "我的草稿1", "DRAFT")
        await create_test_article(db_session, test_user, "我的草稿2", "DRAFT")
        resp = await async_client.get(f"{API_PREFIX}/me/drafts", headers=auth_headers)
        assert resp.status_code == 200
        assert len(resp.json()["items"]) == 2

    async def test_drafts_require_auth(self, async_client: AsyncClient):
        """草稿列表需要认证"""
        resp = await async_client.get(f"{API_PREFIX}/me/drafts")
        assert resp.status_code == 401
