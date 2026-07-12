"""种子数据脚本：创建管理员账号 + 示例分类 / 标签。

使用方式：
    python -m app.seed
"""
import asyncio

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import AsyncSessionLocal, engine
from app.db.base import Base
from app.models.user import User
from app.models.category import Category
from app.models.tag import Tag
from app.utils.slug import slugify

ADMIN_EMAIL = "admin@blogshare.com"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123456"  # 仅种子用，生产部署后请立即修改

CATEGORIES = [
    ("前端开发", "前端 / Web / 移动端技术"),
    ("后端开发", "服务端 / API / 架构"),
    ("数据库", "MySQL / Redis / 存储"),
    ("DevOps", "部署 / 容器 / CI"),
    ("AI 与算法", "大模型 / 机器学习 / RAG"),
    ("随笔杂谈", "思考 / 总结 / 生活"),
]

TAGS = ["React", "FastAPI", "Python", "MySQL", "Redis", "Docker", "TypeScript", "Markdown"]


async def main() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        # 管理员
        existing = await db.execute(select(User).where(User.email == ADMIN_EMAIL))
        if not existing.scalar_one_or_none():
            admin = User(
                email=ADMIN_EMAIL,
                username=ADMIN_USERNAME,
                password_hash=hash_password(ADMIN_PASSWORD),
                role="ADMIN",
            )
            db.add(admin)
            print(f"[seed] 已创建管理员: {ADMIN_EMAIL} / {ADMIN_USERNAME} (密码: {ADMIN_PASSWORD})")
        else:
            print("[seed] 管理员已存在，跳过")

        # 分类
        for name, desc in CATEGORIES:
            exists = await db.execute(select(Category).where(Category.slug == slugify(name)))
            if not exists.scalar_one_or_none():
                db.add(Category(name=name, slug=slugify(name), description=desc, sort_order=0))
        print(f"[seed] 分类处理完成（{len(CATEGORIES)} 项）")

        # 标签
        for name in TAGS:
            exists = await db.execute(select(Tag).where(Tag.slug == slugify(name)))
            if not exists.scalar_one_or_none():
                db.add(Tag(name=name, slug=slugify(name)))
        print(f"[seed] 标签处理完成（{len(TAGS)} 项）")

        await db.commit()

    await engine.dispose()
    print("[seed] 完成")


if __name__ == "__main__":
    asyncio.run(main())
