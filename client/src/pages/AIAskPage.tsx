import { useState } from "react";
import { Send, Sparkles, Loader2 } from "lucide-react";
import { chatAsk } from "@/lib/api/chat";

/** AI 知识库问答页面。 */
export default function AIAskPage() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [asked, setAsked] = useState(false);

  const handleAsk = async () => {
    if (!question.trim() || loading) return;
    setLoading(true);
    setAnswer("");
    setAsked(true);
    try {
      const resp = await chatAsk(question);
      setAnswer(resp);
    } catch {
      setAnswer("请求失败，请稍后重试");
    }
    setLoading(false);
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-2 text-2xl font-bold flex items-center gap-2">
        <Sparkles className="h-6 w-6 text-purple-500" /> AI 知识库问答
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        基于博客已发布文章内容回答你的技术问题
      </p>

      {/* 输入区 */}
      <div className="flex gap-2 mb-6">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleAsk())}
          placeholder="输入你的问题..."
          className="flex-1 rounded-lg border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={handleAsk}
          disabled={loading || !question.trim()}
          className="rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50 transition-opacity"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>

      {/* 回答区 */}
      {asked && (
        <div className="rounded-xl border bg-card p-6">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在检索知识库...
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap leading-relaxed">
              {answer || "未找到相关答案"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
