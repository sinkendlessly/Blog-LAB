"""用户服务：资料更新 / 关注 / 粉丝列表。"""
from typing import List

from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.error_handler import AppException
from app.models.user import User
from app.models.interaction import Follow
from app.schemas.user import UserUpdate


class UserService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, user_id: int) -> User:
        user = await self.db.get(User, user_id)
        if not user:
            raise AppException("用户不存在", 404, "USER_NOT_FOUND")
        return user

    async def update_profile(self, user: User, payload: UserUpdate) -> User:
        if payload.username is not None and payload.username != user.username:
            exists = await self.db.execute(
                select(User).where(User.username == payload.username, User.id != user.id)
            )
            if exists.scalar_one_or_none():
                raise AppException("用户名已被占用", 409, "USERNAME_EXISTS")
            user.username = payload.username
        if payload.phone is not None and payload.phone != user.phone:
            # 手机号需验证码校验，由绑定接口处理；此处仅处理空值清除
            if payload.phone == "":
                user.phone = None
            elif payload.phone != user.phone:
                # 不允许直接通过 update_profile 改手机号
                raise AppException("请使用手机号绑定接口修改手机号", 400, "PHONE_NEEDS_VERIFY")
        if payload.avatar is not None:
            user.avatar = payload.avatar
        if payload.bio is not None:
            user.bio = payload.bio
        await self.db.flush()
        await self.db.refresh(user)
        return user

    async def bind_phone(self, user: User, phone: str, code: str) -> User:
        """绑定/换绑手机号（需验证码校验）。"""
        from app.services.sms_service import sms_service
        await sms_service.verify_code(phone, code)

        # 检查手机号是否被其他用户占用
        exists = await self.db.execute(
            select(User).where(User.phone == phone, User.id != user.id)
        )
        if exists.scalar_one_or_none():
            raise AppException("该手机号已被其他账号绑定", 409, "PHONE_EXISTS")

        user.phone = phone
        await self.db.flush()
        await self.db.refresh(user)
        return user

    async def fill_stats(self, user: User) -> User:
        """填充文章数 / 粉丝数 / 关注数 / 总阅读 / 总点赞。"""
        from app.models.article import Article
        from app.models.interaction import Interaction
        article_count = await self.db.scalar(
            select(func.count(Article.id)).where(
                Article.author_id == user.id, Article.status == "PUBLISHED"
            )
        )
        follower_count = await self.db.scalar(
            select(func.count(Follow.follower_id)).where(Follow.following_id == user.id)
        )
        following_count = await self.db.scalar(
            select(func.count(Follow.following_id)).where(Follow.follower_id == user.id)
        )
        total_views = await self.db.scalar(
            select(func.coalesce(func.sum(Article.views), 0)).where(
                Article.author_id == user.id, Article.status == "PUBLISHED"
            )
        )
        total_likes = await self.db.scalar(
            select(func.count(Interaction.id)).where(
                Interaction.target_type == "article",
                Interaction.action == "like",
                Interaction.target_id.in_(
                    select(Article.id).where(Article.author_id == user.id)
                ),
            )
        )
        user.article_count = int(article_count or 0)
        user.follower_count = int(follower_count or 0)
        user.following_count = int(following_count or 0)
        user.total_views = int(total_views or 0)
        user.total_likes = int(total_likes or 0)
        return user

    # ============ 关注 ============
    async def follow(self, follower: User, following_id: int) -> bool:
        """关注用户，返回是否新建（已关注则取消，toggle 模式）。

        注意：这里采用 toggle 语义方便前端；如需明确关注/取关，前端应分别调用。
        """
        if follower.id == following_id:
            raise AppException("不能关注自己", 400, "CANNOT_FOLLOW_SELF")

        # 确认目标用户存在
        await self.get_by_id(following_id)

        existing = await self.db.execute(
            select(Follow).where(
                Follow.follower_id == follower.id,
                Follow.following_id == following_id,
            )
        )
        rel = existing.scalar_one_or_none()
        if rel:
            await self.db.delete(rel)
            await self.db.flush()
            return False  # 已取消关注
        self.db.add(Follow(follower_id=follower.id, following_id=following_id))
        await self.db.flush()
        return True  # 新关注

    async def is_following(self, follower_id: int, following_id: int) -> bool:
        result = await self.db.execute(
            select(Follow).where(
                Follow.follower_id == follower_id,
                Follow.following_id == following_id,
            )
        )
        return result.scalar_one_or_none() is not None

    async def list_following(self, user_id: int) -> List[User]:
        result = await self.db.execute(
            select(User)
            .join(Follow, Follow.following_id == User.id)
            .where(Follow.follower_id == user_id)
        )
        return list(result.scalars().all())

    async def list_followers(self, user_id: int) -> List[User]:
        result = await self.db.execute(
            select(User)
            .join(Follow, Follow.follower_id == User.id)
            .where(Follow.following_id == user_id)
        )
        return list(result.scalars().all())
