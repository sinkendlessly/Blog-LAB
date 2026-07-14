"""AI 写作助手流式对话接口 + 知识库问答。"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from app.core.deps import get_current_user, get_current_user_optional
from app.models.user import User
from app.services.llm_service import LLMService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["AI 助手"])


class ChatRequest(BaseModel):
    messages: list = Field(..., description="对话历史")
    mode: str = Field("chat", pattern="^(chat|polish|continue|translate)$")


SYSTEM_PROMPTS = {
    "chat": "你是一个技术博客写作助手，回答技术问题、提供建议。",
    "polish": "你是一个技术文档润色助手。请优化以下文字的表达清晰度、专业性，保持原意不变。",
    "continue": "你是一个技术文章续写助手。请根据上下文继续写作，保持风格一致。",
    "translate": "你是一个技术文档翻译助手。请将以下内容翻译为中文，保留技术术语。",
}


@router.post("/write")
async def chat_write(
    payload: ChatRequest,
    user: User = Depends(get_current_user),
):
    """AI 写作助手 SSE 流式对话。

    前端用 EventSource 或 fetch ReadableStream 消费。
    """
    system_msg = {
        "role": "system",
        "content": SYSTEM_PROMPTS.get(payload.mode, SYSTEM_PROMPTS["chat"]),
    }
    messages = [system_msg] + payload.messages

    llm = LLMService()

    async def event_generator():
        async for chunk in llm.chat_stream(messages):
            if chunk:
                yield {"event": "token", "data": chunk}
        yield {"event": "done", "data": ""}

    return EventSourceResponse(event_generator())


@router.post("/ask")
async def chat_ask(
    payload: ChatRequest,
    user: Optional[User] = Depends(get_current_user_optional),
):
    """知识库问答 RAG 接口（非流式）。"""
    question = payload.messages[-1]["content"] if payload.messages else ""
    if not question:
        return {"answer": "请输入问题"}
    from app.services.rag_service import RAGService
    answer = await RAGService().answer(question)
    return {"answer": answer}
