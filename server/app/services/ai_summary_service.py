"""AI 文章摘要生成。"""
import logging

from app.core.config import settings
from app.services.llm_service import LLMService

logger = logging.getLogger(__name__)


class AISummaryService:
    """基于 DeepSeek 为文章生成 100-150 字摘要。

    失败时截取 content[:150] 兜底。
    """

    def __init__(self):
        self.llm = LLMService()

    async def generate(self, title: str, content: str) -> str:
        """生成摘要。"""
        if not settings.DEEPSEEK_API_KEY or not content.strip():
            return content[:150] if content else ""

        prompt = f"""你是一个技术文章摘要助手。请为以下文章生成一段 100-150 字的摘要，突出核心观点和技术要点。

标题：{title}
内容：{content[:2000]}

回复纯文本摘要即可。"""

        result = await self.llm.chat_completion([
            {"role": "system", "content": "你只回复摘要文本，不包含前缀。"},
            {"role": "user", "content": prompt},
        ], temperature=0.5, max_tokens=256)

        if result and len(result) > 10:
            return result.strip()
        return content[:150]
