"""计数服务：统一通过 interactions 表查询交互计数。

策略：
- 写入：直接 INSERT/ DELETE interactions 表
- 读取：SELECT COUNT(*) 聚合（数据量小，无需 Redis）
- 浏览量：Redis INCR 原子自增，定时刷库
"""
import logging
from typing import Optional

from sqlalchemy import select, delete, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.core.redis import get_redis
from app.models.interaction import Interaction
from app.utils.redis_keys import RedisKeys

logger = logging.getLogger(__name__)


class CounterService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.redis = get_redis()

    # ============ 文章点赞 ============
    async def like(self, user_id: int, article_id: int) -> bool:
        """点赞/取消点赞（toggle），返回是否已点赞。

        并发安全策略（三重防护）：
        ① 正常路径：SELECT → 不存在则 INSERT，存在则 DELETE
        ② 唯一约束：DB 层 UNIQUE(user_id, target_id, target_type, action) 防止重复
        ③ 异常兜底：并发 INSERT 冲突时捕获 IntegrityError，返回已点赞
        """
        try:
            existing = await self.db.scalar(
                select(Interaction.id).where(
                    Interaction.user_id == user_id,
                    Interaction.target_id == article_id,
                    Interaction.target_type == "article",
                    Interaction.action == "like",
                )
            )
            if existing:
                await self.db.execute(
                    delete(Interaction).where(Interaction.id == existing)
                )
                await self.db.flush()
                return False
            self.db.add(
                Interaction(user_id=user_id, target_id=article_id,
                            target_type="article", action="like")
            )
            await self.db.flush()
            return True
        except IntegrityError:
            # 并发 INSERT 唯一约束冲突 → 记录已被另一请求插入 → 已点赞
            await self.db.rollback()
            logger.warning("concurrent like conflict: user=%d article=%d", user_id, article_id)
            return True

    async def is_liked(self, user_id: int, article_id: int) -> bool:
        result = await self.db.scalar(
            select(Interaction.id).where(
                Interaction.user_id == user_id,
                Interaction.target_id == article_id,
                Interaction.target_type == "article",
                Interaction.action == "like",
            )
        )
        return result is not None

    async def like_count(self, article_id: int) -> int:
        return await self.count("article", article_id, "like")

    # ============ 文章收藏 ============
    async def favorite(self, user_id: int, article_id: int) -> bool:
        """收藏/取消收藏（toggle），返回是否已收藏。

        并发安全策略同 like()：唯一约束 + IntegrityError 兜底。
        """
        try:
            existing = await self.db.scalar(
                select(Interaction.id).where(
                    Interaction.user_id == user_id,
                    Interaction.target_id == article_id,
                    Interaction.target_type == "article",
                    Interaction.action == "favorite",
                )
            )
            if existing:
                await self.db.execute(
                    delete(Interaction).where(Interaction.id == existing)
                )
                await self.db.flush()
                return False
            self.db.add(
                Interaction(user_id=user_id, target_id=article_id,
                            target_type="article", action="favorite")
            )
            await self.db.flush()
            return True
        except IntegrityError:
            await self.db.rollback()
            logger.warning("concurrent favorite conflict: user=%d article=%d", user_id, article_id)
            return True

    async def is_favorited(self, user_id: int, article_id: int) -> bool:
        result = await self.db.scalar(
            select(Interaction.id).where(
                Interaction.user_id == user_id,
                Interaction.target_id == article_id,
                Interaction.target_type == "article",
                Interaction.action == "favorite",
            )
        )
        return result is not None

    async def favorite_count(self, article_id: int) -> int:
        return await self.count("article", article_id, "favorite")

    # ============ 评论点赞 ============
    async def comment_like_count(self, comment_id: int) -> int:
        return await self.count("comment", comment_id, "like")

    async def comment_liked(self, user_id: int, comment_id: int) -> bool:
        result = await self.db.scalar(
            select(Interaction.id).where(
                Interaction.user_id == user_id,
                Interaction.target_id == comment_id,
                Interaction.target_type == "comment",
                Interaction.action == "like",
            )
        )
        return result is not None

    # ============ 通用计数 ============
    async def count(self, target_type: str, target_id: int, action: str) -> int:
        cnt = await self.db.scalar(
            select(func.count(Interaction.id)).where(
                Interaction.target_type == target_type,
                Interaction.target_id == target_id,
                Interaction.action == action,
            )
        )
        return int(cnt or 0)

    # ============ 浏览量（仅 Redis，定时刷库） ============
    async def incr_views(self, article_id: int) -> int:
        return await self.redis.incr(RedisKeys.article_views(article_id))

    async def get_views(self, article_id: int) -> int:
        cnt = await self.redis.get(RedisKeys.article_views(article_id))
        return int(cnt or 0)

    async def add_view_if_first(self, user_id: Optional[int], article_id: int, ip_address: Optional[str] = None) -> bool:
        if user_id is not None:
            dedup_key = f"view:dedup:user:{user_id}:{article_id}"
            ex = 300
        elif ip_address:
            dedup_key = f"view:dedup:ip:{ip_address}:{article_id}"
            ex = 300
        else:
            await self.incr_views(article_id)
            return True
        added = await self.redis.set(dedup_key, "1", nx=True, ex=ex)
        if added:
            await self.incr_views(article_id)
            return True
        return False

    # ============ 评论计数 ============
    async def incr_comment_count(self, article_id: int) -> None:
        await self.redis.incr(RedisKeys.article_comment_count(article_id))

    async def decr_comment_count(self, article_id: int) -> None:
        cnt = await self.redis.decr(RedisKeys.article_comment_count(article_id))
        if cnt < 0:
            await self.redis.set(RedisKeys.article_comment_count(article_id), 0)

    async def comment_count(self, article_id: int) -> int:
        cnt = await self.redis.get(RedisKeys.article_comment_count(article_id))
        return int(cnt or 0)
