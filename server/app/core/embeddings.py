"""Chroma 向量数据库客户端封装。

用于文章向量化存储和相似度检索，支持 RAG 问答和个性化推荐。
"""
import logging
from typing import Optional

import chromadb
from chromadb.config import Settings

logger = logging.getLogger(__name__)

CHROMA_PATH = "./chroma_db"
COLLECTION_NAME = "blogshare_articles"


class EmbeddingService:
    """Chroma 持久化客户端，管理文章向量库。"""

    def __init__(self):
        self._client: Optional[chromadb.PersistentClient] = None

    def _get_client(self) -> chromadb.PersistentClient:
        if self._client is None:
            self._client = chromadb.PersistentClient(
                path=CHROMA_PATH,
                settings=Settings(anonymized_telemetry=False),
            )
        return self._client

    def get_collection(self):
        """获取或创建文章集合。"""
        client = self._get_client()
        return client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )

    async def upsert_article(
        self,
        article_id: int,
        embedding: list[float],
        title: str,
        slug: str,
        content: str,
        author: str = "",
    ):
        """将文章嵌入向量库。"""
        try:
            collection = self.get_collection()
            collection.upsert(
                ids=[str(article_id)],
                embeddings=[embedding],
                metadatas=[{"title": title, "slug": slug, "author": author}],
                documents=[content[:1000]],
            )
            logger.debug("Chroma upsert: article %d", article_id)
        except Exception as e:
            logger.warning("Chroma upsert failed (article %d): %s", article_id, e)

    async def remove_article(self, article_id: int):
        """从向量库中删除文章。"""
        try:
            self.get_collection().delete(ids=[str(article_id)])
            logger.debug("Chroma delete: article %d", article_id)
        except Exception:
            pass

    async def search_similar(
        self,
        embedding: list[float],
        top_k: int = 10,
        threshold: float = 0.7,
    ) -> list[tuple[int, float, dict]]:
        """搜索相似文章。

        返回 [(article_id, cosine_distance, metadata), ...]
        distance 越小越相似，仅返回 <= threshold 的结果。
        """
        if not embedding:
            return []
        try:
            collection = self.get_collection()
            results = collection.query(
                query_embeddings=[embedding],
                n_results=top_k,
            )
            if not results["ids"] or not results["ids"][0]:
                return []
            output = []
            for i in range(len(results["ids"][0])):
                dist = results["distances"][0][i] if results.get("distances") else 0
                if dist <= threshold:
                    output.append((
                        int(results["ids"][0][i]),
                        float(dist),
                        (results["metadatas"][0][i] or {}) if results.get("metadatas") else {},
                    ))
            return output
        except Exception as e:
            logger.warning("Chroma search failed: %s", e)
            return []
