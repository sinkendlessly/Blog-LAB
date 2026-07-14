"""API v1 路由聚合。"""
from fastapi import APIRouter

from app.api.v1 import (
    auth, users, articles, comments, interactions, search,
    admin, categories_tags, feed, upload, notifications, sitemap,
    chat,
)

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(articles.router)
api_router.include_router(comments.router)
api_router.include_router(interactions.router)
api_router.include_router(search.router)
api_router.include_router(admin.router)
api_router.include_router(categories_tags.router)
api_router.include_router(feed.router)
api_router.include_router(upload.router)
api_router.include_router(notifications.router)
api_router.include_router(chat.router)


@api_router.get("/ping", summary="健康检查")
async def ping() -> dict:
    return {"status": "ok", "version": "v1"}
