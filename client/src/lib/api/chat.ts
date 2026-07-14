/** AI 助手 API 客户端（SSE 流式对话 + RAG 问答）。 */

const API_BASE = "/api/v1";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type ChatMode = "chat" | "polish" | "continue" | "translate";

/**
 * 写作助手 SSE 流式对话。
 * 使用 AsyncGenerator 逐 token 产出 AI 回复。
 */
export async function* chatWrite(
  messages: ChatMessage[],
  mode: ChatMode = "chat"
): AsyncGenerator<string> {
  const resp = await fetch(`${API_BASE}/chat/write`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ messages, mode }),
  });

  if (!resp.ok || !resp.body) {
    yield "请求失败，请稍后重试";
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("event:")) continue;
      if (trimmed.startsWith("data:")) {
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") return;
        yield data;
      }
    }
  }
}

/** 知识库问答（非流式）。 */
export async function chatAsk(question: string): Promise<string> {
  try {
    const resp = await fetch(`${API_BASE}/chat/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        messages: [{ role: "user", content: question }],
      }),
    });
    const data = await resp.json();
    return data.answer || "暂无回答";
  } catch {
    return "请求失败，请稍后重试";
  }
}
