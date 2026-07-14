"""知识库问答（RAG）：基于 Chroma 向量检索 + LLM 回答。"""
import logging

from app.core.embeddings import EmbeddingService
from app.services.llm_service import LLMService

logger = logging.getLogger(__name__)


class RAGService:
    """基于博客文章知识库的 RAG 问答。

    流程：问题向量化 → Chroma 检索 → LLM 综合回答。
    """

    def __init__(self):
        self.llm = LLMService()
        self.embedding = EmbeddingService()

    async def answer(self, question: str) -> str:
        """回答用户问题。"""
        # 1. 问题向量化
        q_embedding = await self.llm.embed_text(question)
        if not q_embedding:
            return "暂时无法回答该问题（向量化服务不可用）。"

        # 2. 检索相似文章
        results = await self.embedding.search_similar(
            q_embedding, top_k=5, threshold=0.7
        )
        if not results:
            return "未找到相关文章。"

        # 3. 构建上下文
        # results 格式: [(article_id, distance, metadata), ...]
        # 但 metadata 里没有完整 content，需要从 Chroma document 取
        contexts = []
        try:
            collection = self.embedding.get_collection()
            ids = [str(aid) for aid, _, _ in results]
            fetched = collection.get(ids=ids)
            documents = fetched.get("documents", []) or []
            metadatas = fetched.get("metadatas", []) or []
            for i in range(len(ids)):
                title = (metadatas[i] or {}).get("title", "未知") if i < len(metadatas) else "未知"
                doc = documents[i] if i < len(documents) else ""
                if doc:
                    contexts.append(f"文章《{title}》：{doc[:300]}")
        except Exception as e:
            logger.warning("Chroma fetch failed: %s", e)
            for _, _, meta in results:
                title = meta.get("title", "未知")
                contexts.append(f"文章《{title}》")

        if not contexts:
            return "未找到相关文章。"

        context_str = "\n\n".join(contexts)

        # 4. LLM 综合回答
        prompt = f"""根据以下文章片段回答问题。如果无法从片段中找到答案，请如实说不知道。

## 问题
{question}

## 参考资料
{context_str}"""

        answer = await self.llm.chat_completion([
            {
                "role": "system",
                "content": "你是基于博客知识库的技术问答助手。回答简洁准确，引用相关来源。",
            },
            {"role": "user", "content": prompt},
        ], temperature=0.3, max_tokens=1024)

        return answer or "暂时无法回答该问题。"
