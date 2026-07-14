"""DeepSeek API 统一封装：补全 / 流式 / Embedding。"""
import json
import logging
from typing import AsyncGenerator, Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class LLMService:
    """DeepSeek API 封装，所有 AI 功能通过此服务调用 LLM。

    空 API Key 时所有方法返回空值/空列表（静默降级）。
    """

    def __init__(self):
        self.api_key = settings.DEEPSEEK_API_KEY
        self.base_url = settings.DEEPSEEK_BASE_URL
        self.chat_model = settings.DEEPSEEK_CHAT_MODEL
        self.embed_model = settings.DEEPSEEK_EMBED_MODEL
        self.timeout = settings.DEEPSEEK_TIMEOUT
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self.timeout,
                headers={"Authorization": f"Bearer {self.api_key}"},
            )
        return self._client

    async def chat_completion(
        self,
        messages: list,
        temperature: float = 0.7,
        max_tokens: int = 512,
    ) -> str:
        """普通文本补全（标签推荐/摘要/审核等）。"""
        if not self.api_key:
            logger.debug("DEEPSEEK_API_KEY not set, skipping LLM call")
            return ""
        client = await self._get_client()
        for attempt in range(2):
            try:
                resp = await client.post("/v1/chat/completions", json={
                    "model": self.chat_model,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                })
                resp.raise_for_status()
                data = resp.json()
                return data["choices"][0]["message"]["content"]
            except httpx.TimeoutException:
                logger.warning("LLM timeout (attempt %d/2)", attempt + 1)
                if attempt == 0:
                    continue
                return ""
            except Exception as e:
                logger.error("LLM chat_completion error: %s", e)
                return ""
        return ""

    async def chat_stream(
        self,
        messages: list,
        temperature: float = 0.7,
    ) -> AsyncGenerator[str, None]:
        """流式补全（写作助手 SSE 输出）。"""
        if not self.api_key:
            yield ""
            return
        try:
            async with httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self.timeout + 30,
                headers={"Authorization": f"Bearer {self.api_key}"},
            ) as client:
                async with client.stream("POST", "/v1/chat/completions", json={
                    "model": self.chat_model,
                    "messages": messages,
                    "temperature": temperature,
                    "stream": True,
                }) as resp:
                    async for line in resp.aiter_lines():
                        if line.startswith("data: "):
                            data = line[6:]
                            if data == "[DONE]":
                                break
                            try:
                                chunk = json.loads(data)
                                delta = chunk["choices"][0].get("delta", {})
                                content = delta.get("content", "")
                                if content:
                                    yield content
                            except json.JSONDecodeError:
                                continue
        except Exception as e:
            logger.error("LLM stream error: %s", e)
            yield ""

    async def embed_text(self, text: str) -> list[float]:
        """文本转 Embedding 向量（1536维）。"""
        if not self.api_key:
            return []
        client = await self._get_client()
        try:
            resp = await client.post("/v1/embeddings", json={
                "model": self.embed_model,
                "input": text,
            })
            resp.raise_for_status()
            return resp.json()["data"][0]["embedding"]
        except Exception as e:
            logger.error("embed_text error: %s", e)
            return []

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """批量 Embedding。"""
        if not self.api_key:
            return [[] for _ in texts]
        client = await self._get_client()
        try:
            resp = await client.post("/v1/embeddings", json={
                "model": self.embed_model,
                "input": texts,
            })
            resp.raise_for_status()
            items = resp.json()["data"]
            return [it["embedding"] for it in sorted(items, key=lambda x: x["index"])]
        except Exception as e:
            logger.error("embed_batch error: %s", e)
            return [[] for _ in texts]

    async def aclose(self):
        if self._client:
            await self._client.aclose()
            self._client = None
