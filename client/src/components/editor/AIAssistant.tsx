import { useState, useRef, useCallback } from "react";
import { Sparkles, X, Send, Check } from "lucide-react";
import { chatWrite, type ChatMode } from "@/lib/api/chat";

interface Props {
  selectedText?: string;
  onInsert: (text: string) => void;
  onClose: () => void;
}

type Msg = { role: "user" | "assistant"; content: string };

/** AI 写作助手侧栏面板：对话/润色/续写/翻译。 */
export default function AIAssistant({ selectedText, onInsert, onClose }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState(selectedText || "");
  const [streaming, setStreaming] = useState(false);
  const [mode, setMode] = useState<ChatMode>("chat");
  const [copiedIdx, setCopiedIdx] = useState(-1);

  const handleSend = useCallback(async () => {
    if (!input.trim() || streaming) return;

    const userMsg: Msg = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);

    let full = "";
    try {
      for await (const token of chatWrite([...messages, userMsg], mode)) {
        full += token;
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: full };
          return copy;
        });
      }
    } catch {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: "请求失败" };
        return copy;
      });
    }
    setStreaming(false);
  }, [input, messages, mode, streaming]);

  const copyToClipboard = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(-1), 1500);
    } catch { /* ignore */ }
  };

  return (
    <div className="flex h-full flex-col border-l bg-card">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-purple-500" /> AI 助手
        </span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 模式切换 */}
      <div className="flex gap-1 border-b px-2 py-1.5">
        {(["chat", "polish", "continue", "translate"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded px-2 py-0.5 text-xs transition-colors ${
              mode === m
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m === "chat" ? "对话" : m === "polish" ? "润色" : m === "continue" ? "续写" : "翻译"}
          </button>
        ))}
      </div>

      {/* 对话记录 */}
      <div className="flex-1 overflow-y-auto space-y-3 p-3 text-sm">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center pt-8">
            {selectedText
              ? `已选中文字，输入问题或点击润色/续写/翻译`
              : "输入问题开始对话"}
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`${msg.role === "user" ? "text-right" : ""}`}>
            <div
              className={`inline-block rounded-lg px-3 py-1.5 max-w-[90%] text-left ${
                msg.role === "user" ? "bg-primary/10" : "bg-muted"
              }`}
            >
              <p className="whitespace-pre-wrap break-words">
                {msg.content || (msg.role === "assistant" ? "..." : "")}
              </p>
              {msg.role === "assistant" && msg.content && !streaming && (
                <div className="mt-1 flex gap-2 border-t pt-1">
                  <button
                    onClick={() => onInsert(msg.content)}
                    className="text-xs text-primary hover:underline"
                  >
                    使用
                  </button>
                  <button
                    onClick={() => copyToClipboard(msg.content, i)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {copiedIdx === i ? <Check className="h-3 w-3 inline" /> : "复制"}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 输入框 */}
      <div className="border-t p-2">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSend())}
            placeholder={selectedText ? "对选中文字提问..." : "输入问题..."}
            className="flex-1 rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={handleSend}
            disabled={streaming || !input.trim()}
            className="rounded-md bg-primary px-2.5 text-primary-foreground disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
