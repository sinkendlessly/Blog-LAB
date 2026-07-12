"""搜索服务：热门排行 + 归档（实际全文搜索在前端 flexsearch，后端只提供数据源）。"""
from typing import List

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.article_service import ArticleService
from app.services.recommendation_service import RecommendationService


class SearchService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.article_service = ArticleService(db)
        self.recommendation = RecommendationService(db)

    async def article_index(self) -> List:
        """供前端 flexsearch 建索引的数据。"""
        return await self.article_service.list_index()

    async def hot_articles(self, limit: int = 10) -> List[int]:
        """热门文章 ID 列表（ZSet）。"""
        return await self.recommendation.hot_article_ids(limit)

    async def archive(self) -> List[dict]:
        """按月归档统计。"""
        return await self.article_service.archive()
