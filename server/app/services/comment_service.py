"""评论服务：嵌套回复 / 列表（树形）/ 删除 / 点赞。"""
from typing import List, Optional, Tuple

from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.error_handler import AppException
from app.models.article import Article
from app.models.comment import Comment
from app.models.interaction import Interaction
from app.models.user import User
from app.services.counter_service import CounterService
from app.schemas.comment import CommentOut
from app.schemas.user import UserBrief
from app.utils.redis_keys import RedisKeys
from app.utils.pagination import encode_cursor, apply_cursor


class CommentService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.counter = CounterService(db)

    # ============ 创建 ============
    async def create(
        self,
        article_id: int,
        user: User,
        content: str,
        parent_id: Optional[int] = None,
    ) -> Comment:
        article = await self.db.get(Article, article_id)
        if not article:
            raise AppException("文章不存在", 404, "ARTICLE_NOT_FOUND")

        if parent_id is not None:
            parent = await self.db.get(Comment, parent_id)
            if not parent or parent.article_id != article_id:
                raise AppException("父评论不存在或不属于该文章", 400, "PARENT_INVALID")

        comment = Comment(
            content=content,
            article_id=article_id,
            user_id=user.id,
            parent_id=parent_id,
        )
        self.db.add(comment)
        await self.db.flush()
        await self.db.refresh(comment)
        await self.counter.incr_comment_count(article_id)
        return comment

    # ============ 列表（树形 + 游标分页） ============
    async def list_tree(
        self,
        article_id: int,
        sort: str = "latest",
        current_user_id: Optional[int] = None,
        cursor: Optional[str] = None,
        limit: int = 20,
    ) -> Tuple[List[CommentOut], Optional[str]]:
        """获取文章评论树，返回 (roots, next_cursor)。

        分页策略：只对根评论（parent_id IS NULL）做游标分页，
        每条根评论下的 replies 一次性加载（嵌套回复通常数量可控）。
        """
        # 1. 加载根评论（带游标分页）
        root_stmt = (
            select(Comment)
            .where(Comment.article_id == article_id, Comment.parent_id.is_(None))
            .order_by(Comment.created_at.desc())
        )
        if sort == "oldest":
            root_stmt = root_stmt.order_by(Comment.created_at.asc())
        elif sort == "hot":
            root_stmt = root_stmt.order_by(Comment.created_at.desc())

        if cursor:
            root_stmt = apply_cursor(root_stmt, cursor, Comment.created_at, Comment.id)
        root_stmt = root_stmt.limit(limit + 1)

        root_rows = await self.db.execute(root_stmt)
        roots_raw = list(root_rows.scalars().all())

        # 判断是否还有更多
        has_more = len(roots_raw) > limit
        if has_more:
            roots_raw = roots_raw[:limit]

        if not roots_raw:
            return [], None

        # 计算 next_cursor
        next_cursor = None
        if has_more and roots_raw:
            last = roots_raw[-1]
            next_cursor = encode_cursor(last.created_at, last.id)

        # 2. 加载所有子评论（属于这些根评论的）
        root_ids = [r.id for r in roots_raw]
        child_rows = await self.db.execute(
            select(Comment)
            .where(
                Comment.article_id == article_id,
                Comment.parent_id.in_(root_ids),
            )
            .order_by(Comment.created_at.asc())
        )
        children_raw = list(child_rows.scalars().all())

        # 合并所有评论
        all_comments = roots_raw + children_raw

        # 3. 加载用户
        user_ids = list(set(c.user_id for c in all_comments))
        user_result = await self.db.execute(
            select(User).where(User.id.in_(user_ids))
        )
        user_map: dict[int, UserBrief] = {
            u.id: UserBrief(
                id=u.id, username=u.username, phone=u.phone,
                avatar=u.avatar, bio=u.bio,
            )
            for u in user_result.scalars().all()
        }

        # 4. 查询评论点赞数
        comment_ids = [c.id for c in all_comments]
        count_result = await self.db.execute(
            select(Interaction.target_id, func.count(Interaction.id))
            .where(
                Interaction.target_id.in_(comment_ids),
                Interaction.target_type == "comment",
                Interaction.action == "like",
            )
            .group_by(Interaction.target_id)
        )
        like_count_map: dict[int, int] = dict(count_result.all())

        # 5. 查询当前用户已赞的评论
        liked_set: set[int] = set()
        if current_user_id is not None:
            liked_result = await self.db.execute(
                select(Interaction.target_id)
                .where(
                    Interaction.target_id.in_(comment_ids),
                    Interaction.target_type == "comment",
                    Interaction.action == "like",
                    Interaction.user_id == current_user_id,
                )
            )
            liked_set = {row for row in liked_result.scalars().all()}

        # 6. 构建 CommentOut
        def to_out(c: Comment) -> CommentOut:
            return CommentOut(
                id=c.id, content=c.content, article_id=c.article_id,
                user=user_map.get(c.user_id, UserBrief(id=0, username="已注销", phone=None, avatar=None, bio=None)),
                parent_id=c.parent_id, created_at=c.created_at, updated_at=c.updated_at,
                replies=[], like_count=like_count_map.get(c.id, 0), is_liked=c.id in liked_set,
            )

        out_map: dict[int, CommentOut] = {}
        for c in all_comments:
            out_map[c.id] = to_out(c)

        # 7. 构建树
        for c in children_raw:
            if c.parent_id in out_map:
                out_map[c.parent_id].replies.append(out_map[c.id])

        # 8. 根评论排序（hot 按回复数降序）
        roots = [out_map[r.id] for r in roots_raw]
        if sort == "oldest":
            roots.sort(key=lambda o: o.created_at)
        elif sort == "hot":
            roots.sort(key=lambda o: -len(o.replies))
        # "latest" 保持游标返回的顺序（已按 created_at DESC 排序）

        return roots, next_cursor

    # ============ 点赞 ============
    async def toggle_like(self, comment_id: int, user_id: int) -> dict:
        """切换评论点赞状态，返回 {liked, like_count}。

        同 interactions 表唯一约束 + IntegrityError 兜底。
        """
        from app.models.interaction import Interaction
        from sqlalchemy.exc import IntegrityError
        comment = await self.db.get(Comment, comment_id)
        if not comment:
            raise AppException("评论不存在", 404, "COMMENT_NOT_FOUND")

        try:
            existing = await self.db.scalar(
                select(Interaction.id).where(
                    Interaction.user_id == user_id,
                    Interaction.target_id == comment_id,
                    Interaction.target_type == "comment",
                    Interaction.action == "like",
                )
            )
            if existing:
                await self.db.execute(delete(Interaction).where(Interaction.id == existing))
                await self.db.flush()
                liked = False
            else:
                self.db.add(Interaction(user_id=user_id, target_id=comment_id,
                                         target_type="comment", action="like"))
                await self.db.flush()
                liked = True
        except IntegrityError:
            await self.db.rollback()
            liked = True

        # 重新统计点赞数
        cnt = await self.db.scalar(
            select(func.count(Interaction.id))
            .where(Interaction.target_id == comment_id, Interaction.target_type == "comment", Interaction.action == "like")
        )
        return {"liked": liked, "like_count": int(cnt or 0)}

    # ============ 删除 ============
    async def delete(self, comment: Comment, user: User) -> None:
        article = await self.db.get(Article, comment.article_id)
        is_article_author = article and article.author_id == user.id
        if comment.user_id != user.id and user.role != "ADMIN" and not is_article_author:
            raise AppException("无权删除他人评论", 403, "FORBIDDEN")
        await self.db.delete(comment)
        await self.db.flush()
        await self.counter.decr_comment_count(comment.article_id)
