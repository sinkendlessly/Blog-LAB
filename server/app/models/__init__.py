"""ORM 模型包 — 延迟导入所有模型以确保 SQLAlchemy relationship 解析正常。

不要在模块级别直接导入所有模型（会有循环依赖），
而是在 app 启动后调用 ensure_models_loaded()。
"""

_loaded = False

def ensure_models_loaded():
    """确保所有 ORM 模型已注册到 Base.metadata。"""
    global _loaded
    if _loaded:
        return
    from app.models.user import User       # noqa: F401
    from app.models.article import Article  # noqa: F401
    from app.models.category import Category # noqa: F401
    from app.models.tag import Tag          # noqa: F401
    from app.models.comment import Comment  # noqa: F401
    from app.models.interaction import Interaction, Follow # noqa: F401
    from app.models.notification import Notification  # noqa: F401
    _loaded = True
