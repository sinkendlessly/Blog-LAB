"""文章路由：CRUD / 草稿 / 发布 / 索引数据 / 归档。"""
from typing import List, Optional
import re

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, get_current_user, get_current_user_optional
from app.models.user import User
from app.models.article import Article
from app.models.category import Category
from app.models.tag import Tag, article_tags
from app.schemas.article import (
    ArticleCreate, ArticleUpdate, ArticleOut, ArticleBrief, ArticleIndexItem,
)
from app.schemas.common import PageResponse, PageMeta, OkResponse
from app.services.article_service import ArticleService
from app.services.comment_service import CommentService
from app.services.counter_service import CounterService
from app.services.interaction_service import InteractionService
from app.services.user_service import UserService

router = APIRouter(prefix="/articles", tags=["文章"])


async def _to_brief(article, counter: CounterService, user: Optional[User]) -> ArticleBrief:
    """将 Article ORM 转 Brief schema。"""
    like_count = await counter.like_count(article.id)
    favorite_count = await counter.favorite_count(article.id)
    return ArticleBrief(
        id=article.id,
        title=article.title,
        slug=article.slug,
        excerpt=article.excerpt,
        cover_image=article.cover_image,
        views=article.views,
        author=article.author,
        category=article.category,
        tags=article.tags,
        created_at=article.created_at,
        published_at=article.published_at,
        like_count=like_count,
        favorite_count=favorite_count,
    )


@router.post("", response_model=ArticleOut, status_code=201)
async def create_article(
    payload: ArticleCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    service = ArticleService(db)
    article = await service.create(user, payload)
    await db.refresh(article, attribute_names=["author", "tags", "category"])
    return ArticleOut.model_validate(article, from_attributes=True)


@router.get("", response_model=PageResponse[ArticleBrief])
async def list_articles(
    cursor: Optional[str] = Query(None),
    category_id: Optional[int] = Query(None),
    tag_id: Optional[int] = Query(None),
    author_id: Optional[int] = Query(None),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    service = ArticleService(db)
    items, next_cursor = await service.list_published(
        cursor=cursor, category_id=category_id, tag_id=tag_id, author_id=author_id, limit=limit
    )
    counter = CounterService(db)
    items_brief = [await _to_brief(a, counter, None) for a in items]
    return PageResponse(
        items=items_brief,
        meta=PageMeta(next_cursor=next_cursor, has_more=next_cursor is not None),
    )


@router.get("/following", response_model=List[ArticleBrief])
async def get_following_articles(
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """获取关注的人发布的文章（关注动态 Feed）。"""
    from app.models.interaction import Follow
    # 查询关注的人的 ID
    follow_result = await db.execute(
        select(Follow.following_id).where(Follow.follower_id == user.id)
    )
    following_ids = [r for r in follow_result.scalars().all()]
    if not following_ids:
        return []

    result = await db.execute(
        select(Article)
        .where(
            Article.status == "PUBLISHED",
            Article.author_id.in_(following_ids),
        )
        .options(selectinload(Article.author), selectinload(Article.tags), selectinload(Article.category))
        .order_by(Article.published_at.desc())
        .limit(limit)
    )
    articles = result.scalars().all()
    return [
        ArticleBrief(
            id=a.id, title=a.title, slug=a.slug, excerpt=a.excerpt,
            cover_image=a.cover_image, views=a.views, author=a.author,
            category=a.category, tags=a.tags, created_at=a.created_at,
            published_at=a.published_at,
        )
        for a in articles
    ]


@router.get("/pinned", response_model=List[ArticleBrief])
async def get_pinned_articles(
    db: AsyncSession = Depends(get_db),
):
    """获取管理员置顶的文章。"""
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(Article)
        .where(Article.status == "PUBLISHED", Article.is_pinned == True)
        .options(selectinload(Article.author), selectinload(Article.tags), selectinload(Article.category))
        .order_by(Article.updated_at.desc())
        .limit(5)
    )
    articles = result.scalars().all()
    return [
        ArticleBrief(
            id=a.id, title=a.title, slug=a.slug, excerpt=a.excerpt,
            cover_image=a.cover_image, views=a.views, author=a.author,
            category=a.category, tags=a.tags, created_at=a.created_at,
            published_at=a.published_at,
        )
        for a in articles
    ]


@router.get("/index", response_model=List[ArticleIndexItem])
async def article_index(db: AsyncSession = Depends(get_db)):
    """供前端 flexsearch 建索引的精简数据。"""
    service = ArticleService(db)
    items = await service.list_index()
    return [ArticleIndexItem.model_validate(a, from_attributes=True) for a in items]


@router.get("/{slug}/related")
async def related_articles(
    slug: str,
    db: AsyncSession = Depends(get_db),
):
    """根据文章标签推荐相关文章。"""
    service = ArticleService(db)
    article = await service.get_by_slug(slug)

    # 找当前文章的标签
    result = await db.execute(
        select(article_tags.c.tag_id).where(article_tags.c.article_id == article.id)
    )
    tag_ids = [r[0] for r in result.all()]
    if not tag_ids:
        return []

    # 找有相同标签的已发布文章（用 JOIN 避免 MySQL IN+LIMIT 限制）
    from sqlalchemy import func as sa_fn
    related = await db.execute(
        select(
            Article.id, Article.title, Article.slug, Article.excerpt, Article.views,
            Article.published_at, Article.author_id,
        )
        .join(article_tags, Article.id == article_tags.c.article_id)
        .where(
            Article.id != article.id,
            Article.status == "PUBLISHED",
            article_tags.c.tag_id.in_(tag_ids),
        )
        .group_by(Article.id)
        .having(sa_fn.count(article_tags.c.tag_id) > 0)
        .order_by(sa_fn.count(article_tags.c.tag_id).desc(), Article.published_at.desc())
        .limit(5)
    )

    results = []
    for r in related.all():
        author = await db.get(User, r.author_id)
        results.append({
            "id": r.id,
            "title": r.title,
            "slug": r.slug,
            "excerpt": r.excerpt,
            "views": r.views,
            "published_at": r.published_at.isoformat() if r.published_at else None,
            "author": {"id": author.id, "username": author.username, "avatar": author.avatar} if author else None,
        })
    return results


@router.get("/{slug}/recommend")
async def recommend_articles(
    slug: str,
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_optional),
):
    """基于 AI 的个性化文章推荐（浏览历史相似度）。"""
    if not user:
        return []
    from app.services.article_service import ArticleService
    article = await ArticleService(db).get_by_slug(slug)
    if not article:
        return []
    from app.services.recommendation_v2 import RecommendationV2
    recs = await RecommendationV2(db).recommend_for_user(
        user.id, article.id, limit=5
    )
    return [
        ArticleBrief(
            id=a.id, title=a.title, slug=a.slug,
            excerpt=a.excerpt, cover_image=a.cover_image,
            views=a.views, author=a.author,
            category=a.category, tags=a.tags,
            created_at=a.created_at, published_at=a.published_at,
        )
        for a in recs
    ]


def _get_client_ip(request: Request) -> Optional[str]:
    """获取客户端真实 IP（优先取 X-Forwarded-For）。"""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


@router.get("/{slug}", response_model=ArticleOut)
async def get_article(
    request: Request,
    slug: str,
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_optional),
):
    service = ArticleService(db)
    article = await service.get_by_slug(slug)
    # 浏览量 + 历史（匿名用户按 IP 去重）
    client_ip = _get_client_ip(request)
    await service.record_view(article, user, client_ip)
    counter = CounterService(db)
    is_liked = await counter.is_liked(user.id, article.id) if user else False
    is_favorited = await counter.is_favorited(user.id, article.id) if user else False
    like_count = await counter.like_count(article.id)
    favorite_count = await counter.favorite_count(article.id)
    comment_count = await counter.comment_count(article.id)
    out = ArticleOut.model_validate(article, from_attributes=True)
    out.is_liked = is_liked
    out.is_favorited = is_favorited
    out.like_count = like_count
    out.favorite_count = favorite_count
    out.comment_count = comment_count
    return out


@router.put("/{article_id}", response_model=ArticleOut)
async def update_article(
    article_id: int,
    payload: ArticleUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    service = ArticleService(db)
    article = await service.get_by_id(article_id)
    updated = await service.update(article, user, payload)
    await db.refresh(updated, attribute_names=["author", "tags", "category"])
    return ArticleOut.model_validate(updated, from_attributes=True)


@router.delete("/{article_id}", response_model=OkResponse)
async def delete_article(
    article_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    service = ArticleService(db)
    article = await service.get_by_id(article_id)
    await service.delete(article, user)
    return OkResponse(message="已删除")


@router.get("/me/drafts", response_model=PageResponse[ArticleBrief])
async def my_drafts(
    cursor: Optional[str] = Query(None),
    status: str = Query("DRAFT"),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """当前用户的草稿/文章列表。"""
    service = ArticleService(db)
    items, next_cursor = await service.list_by_author(
        author_id=user.id, status=status, cursor=cursor, limit=limit
    )
    counter = CounterService(db)
    items_brief = [await _to_brief(a, counter, user) for a in items]
    return PageResponse(
        items=items_brief,
        meta=PageMeta(next_cursor=next_cursor, has_more=next_cursor is not None),
    )


@router.post("/suggest-tags")
async def suggest_tags(
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    """根据标题关键字智能推荐分类和标签。

    请求: {"title": "文章标题", "content": "文章内容（可选）"}
    返回: {"category_id": number|null, "tag_ids": number[]}
    """
    title = payload.get("title", "") or ""
    content = payload.get("content", "") or ""
    full_text = (title + " " + content).lower()

    # 加载分类和标签
    cat_rows = (await db.execute(
        select(Category.id, Category.name).order_by(Category.sort_order)
    )).all()
    cats = {}
    for r in cat_rows:
        cats[str(r[1])] = int(r[0])

    tag_rows = (await db.execute(
        select(Tag.id, Tag.name).order_by(Tag.name)
    )).all()
    tags = {}
    for r in tag_rows:
        tags[str(r[1])] = int(r[0])

    # === 分类匹配 ===
    cat_keywords = [
        (["react", "vue", "angular", "css", "html", "javascript", "typescript", "webpack", "前端", "组件", "页面", "ui", "ux"], "前端开发"),
        (["fastapi", "spring", "django", "flask", "go", "rust", "java", "python", "api", "微服务", "接口", "服务端"], "后端开发"),
        (["mysql", "redis", "mongodb", "postgresql", "sql", "nosql", "数据", "索引", "缓存", "sqlalchemy"], "数据库"),
        (["docker", "kubernetes", "k8s", "ci/cd", "jenkins", "devops", "部署", "容器", "运维"], "DevOps"),
        (["ai", "人工智能", "算法", "机器学习", "深度学习", "llm", "大模型", "gpt", "神经网络"], "AI 与算法"),
    ]

    best_cat = None
    best_score = -1
    for kws, cname in cat_keywords:
        score = sum(3 for kw in kws if kw in full_text)
        if score > best_score:
            best_score = score
            best_cat = cats.get(cname)

    # === 标签匹配 ===
    matched_tags = []
    for tname, tid in tags.items():
        if tname.lower() in full_text:
            matched_tags.append(tid)

    return {
        "category_id": best_cat if best_score > 0 else None,
        "tag_ids": matched_tags[:5],
    }
