"""AI 智能标签推荐（替换关键词匹配）。"""
import json
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.category import Category
from app.models.tag import Tag
from app.services.llm_service import LLMService

logger = logging.getLogger(__name__)


class AITagService:
    """基于 DeepSeek 的内容分析，自动推荐分类和标签。"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.llm = LLMService()

    async def suggest(self, title: str, content: str) -> dict:
        """推荐分类和标签。

        返回 {'category_id': number | None, 'tag_ids': list[int]}
        API Key 未配置或 LLM 失败时返回空推荐。
        """
        if not settings.DEEPSEEK_API_KEY:
            return {"category_id": None, "tag_ids": []}

        # 加载现有分类和标签列表作为候选
        cats = (await self.db.execute(
            select(Category.id, Category.name).order_by(Category.sort_order)
        )).all()
        tags = (await self.db.execute(
            select(Tag.id, Tag.name).order_by(Tag.name)
        )).all()

        cat_list = [{"id": c[0], "name": c[1]} for c in cats]
        tag_list = [{"id": t[0], "name": t[1]} for t in tags]

        prompt = f"""你是一个技术博客的标签推荐助手。
根据标题和内容，从以下已有分类和标签中选择最匹配的（也可都不选）。

文章标题：{title}

已有分类：{json.dumps(cat_list, ensure_ascii=False)}
已有标签：{json.dumps(tag_list, ensure_ascii=False)}

请返回 JSON（只返回 JSON，不含其他文字）：
{{"category_id": number | null, "tag_ids": number[]}}"""

        result = await self.llm.chat_completion([
            {"role": "system", "content": "你只回复 JSON，不包含其他文字。"},
            {"role": "user", "content": prompt},
        ], temperature=0.3, max_tokens=256)

        if not result:
            return {"category_id": None, "tag_ids": []}

        try:
            data = json.loads(result)
            return {
                "category_id": data.get("category_id"),
                "tag_ids": data.get("tag_ids", [])[:5],
            }
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            logger.warning("AI tag suggestion parse error: %s", e)
            return {"category_id": None, "tag_ids": []}
