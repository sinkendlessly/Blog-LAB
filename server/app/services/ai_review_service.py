"""AI 评论审核：检测垃圾/广告/攻击/违规内容。"""
import json
import logging

from app.core.config import settings
from app.services.llm_service import LLMService

logger = logging.getLogger(__name__)


class AIReviewService:
    """基于 DeepSeek 对评论内容进行审核。

    空 API Key / 审核失败时均放行（is_flagged=False）。
    """

    def __init__(self):
        self.llm = LLMService()

    async def review(self, content: str) -> dict:
        """审核单条评论。

        返回 {'is_flagged': bool, 'reason': str | None, 'category': str | None}
        """
        if not settings.DEEPSEEK_API_KEY or not content.strip():
            return {"is_flagged": False, "reason": None, "category": None}

        prompt = f"""判断以下评论是否包含：广告推广、人身攻击、色情内容、政治敏感。

评论：{content[:500]}

请返回 JSON（只返回 JSON，不含其他文字）：
{{"is_flagged": bool, "reason": str | null, "category": "spam" | "abuse" | "nsfw" | "political" | null}}"""

        result = await self.llm.chat_completion([
            {"role": "system", "content": "你只回复 JSON，不包含其他文字。"},
            {"role": "user", "content": prompt},
        ], temperature=0.1, max_tokens=128)

        if not result:
            return {"is_flagged": False, "reason": None, "category": None}

        try:
            data = json.loads(result)
            return {
                "is_flagged": bool(data.get("is_flagged", False)),
                "reason": data.get("reason"),
                "category": data.get("category"),
            }
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            logger.warning("AI review parse error: %s", e)
            return {"is_flagged": False, "reason": None, "category": None}
