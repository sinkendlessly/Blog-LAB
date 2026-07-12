"""后台管理服务：统计 / 审核 / 用户管理。"""
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article import Article
from app.models.comment import Comment
from app.models.interaction import Interaction, Follow
from app.models.user import User
from app.core.redis import get_redis
from app.utils.redis_keys import RedisKeys


class AdminService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.redis = get_redis()

    async def stats_overview(self) -> dict:
        """数据概览。"""
        article_total = await self.db.scalar(select(func.count(Article.id)))
        article_published = await self.db.scalar(
            select(func.count(Article.id)).where(Article.status == "PUBLISHED")
        )
        article_pending = await self.db.scalar(
            select(func.count(Article.id)).where(Article.status == "PENDING_REVIEW")
        )
        user_total = await self.db.scalar(select(func.count(User.id)))
        comment_total = await self.db.scalar(select(func.count(Comment.id)))
        like_total = await self.db.scalar(
            select(func.count(Interaction.id))
            .where(Interaction.target_type == "article", Interaction.action == "like")
        )
        favorite_total = await self.db.scalar(
            select(func.count(Interaction.id))
            .where(Interaction.target_type == "article", Interaction.action == "favorite")
        )
        follow_total = await self.db.scalar(select(func.count(Follow.follower_id)))
        view_total = await self.db.scalar(select(func.sum(Article.views)))
        return {
            "article_count": int(article_total or 0),
            "published_count": int(article_published or 0),
            "pending_count": int(article_pending or 0),
            "user_count": int(user_total or 0),
            "comment_count": int(comment_total or 0),
            "like_count": int(like_total or 0),
            "favorite_count": int(favorite_total or 0),
            "follow_count": int(follow_total or 0),
            "total_views": int(view_total or 0),
        }

    async def stats_trend(self, days: int = 30) -> List[dict]:
        """最近 N 天每日新增文章/用户/点赞/评论数。"""
        start = datetime.now(timezone.utc) - timedelta(days=days)
        art_rows = await self.db.execute(
            select(
                func.date(Article.created_at).label("d"),
                func.count(Article.id).label("c"),
            )
            .where(Article.created_at >= start)
            .group_by("d")
            .order_by("d")
        )
        user_rows = await self.db.execute(
            select(
                func.date(User.created_at).label("d"),
                func.count(User.id).label("c"),
            )
            .where(User.created_at >= start)
            .group_by("d")
            .order_by("d")
        )
        like_rows = await self.db.execute(
            select(
                func.date(Interaction.created_at).label("d"),
                func.count(Interaction.id).label("c"),
            )
            .where(
                Interaction.created_at >= start,
                Interaction.target_type == "article",
                Interaction.action == "like",
            )
            .group_by("d")
            .order_by("d")
        )
        comment_rows = await self.db.execute(
            select(
                func.date(Comment.created_at).label("d"),
                func.count(Comment.id).label("c"),
            )
            .where(Comment.created_at >= start)
            .group_by("d")
            .order_by("d")
        )
        art_map = {str(r.d): int(r.c) for r in art_rows.all()}
        user_map = {str(r.d): int(r.c) for r in user_rows.all()}
        like_map = {str(r.d): int(r.c) for r in like_rows.all()}
        comment_map = {str(r.d): int(r.c) for r in comment_rows.all()}
        all_dates = sorted(set(art_map.keys()) | set(user_map.keys()) | set(like_map.keys()) | set(comment_map.keys()))
        return [
            {
                "date": d, "articles": art_map.get(d, 0), "users": user_map.get(d, 0),
                "likes": like_map.get(d, 0), "comments": comment_map.get(d, 0),
            }
            for d in all_dates
        ]

    async def pending_articles(self, limit: int = 50) -> List[Article]:
        from sqlalchemy.orm import selectinload
        result = await self.db.execute(
            select(Article)
            .options(selectinload(Article.author), selectinload(Article.tags), selectinload(Article.category))
            .where(Article.status == "PENDING_REVIEW")
            .order_by(Article.updated_at.asc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def review_article(self, article_id: int, action: str) -> Article:
        """审核：通过 PUBLISHED / 拒绝 REJECTED。"""
        from app.middleware.error_handler import AppException
        article = await self.db.get(Article, article_id)
        if not article:
            raise AppException("文章不存在", 404, "ARTICLE_NOT_FOUND")
        if action == "approve":
            article.status = "PUBLISHED"
            article.published_at = datetime.now(timezone.utc)
        elif action == "reject":
            article.status = "REJECTED"
        else:
            raise AppException("无效的审核操作", 400, "INVALID_ACTION")
        await self.db.flush()
        await self.db.refresh(article)
        # 刷新热度
        if article.status == "PUBLISHED":
            from app.services.recommendation_service import RecommendationService
            await RecommendationService(self.db).refresh_article_score(article_id)
        else:
            await self.redis.zrem(RedisKeys.HOT_ARTICLES, str(article_id))
        return article

    async def list_users(self, limit: int = 100, offset: int = 0) -> List[User]:
        result = await self.db.execute(
            select(User).order_by(User.created_at.desc()).limit(limit).offset(offset)
        )
        return list(result.scalars().all())

    async def set_user_status(self, caller: User, user_id: int, is_active: bool) -> User:
        from app.middleware.error_handler import AppException
        target = await self.db.get(User, user_id)
        if not target:
            raise AppException("用户不存在", 404, "USER_NOT_FOUND")
        # 普通管理员不能禁用其他管理员
        if target.role == "ADMIN" and not caller.is_super_admin:
            raise AppException("无权操作管理员账号", 403, "FORBIDDEN")
        target.is_active = is_active
        await self.db.flush()
        await self.db.refresh(target)
        return target

    async def set_user_role(self, user_id: int, role: str) -> User:
        from app.middleware.error_handler import AppException
        if role not in ("USER", "ADMIN"):
            raise AppException("无效角色", 400, "INVALID_ROLE")
        user = await self.db.get(User, user_id)
        if not user:
            raise AppException("用户不存在", 404, "USER_NOT_FOUND")
        user.role = role
        await self.db.flush()
        await self.db.refresh(user)
        return user

    async def delete_user(self, user_id: int) -> None:
        from app.middleware.error_handler import AppException
        user = await self.db.get(User, user_id)
        if not user:
            raise AppException("用户不存在", 404, "USER_NOT_FOUND")
        if user.role == "ADMIN":
            raise AppException("不能删除管理员账号", 403, "CANNOT_DELETE_ADMIN")
        await self.db.delete(user)
        await self.db.flush()
