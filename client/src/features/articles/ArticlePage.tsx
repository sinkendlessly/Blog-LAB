import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { ArrowLeft, Eye, Calendar, Clock, ArrowUp, Copy, Check, Download, Pin, PinOff, Loader2, PenSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { TableOfContents, extractToc, type TocItem } from "@/components/layout/TableOfContents";
import { LikeButton } from "@/components/interaction/LikeButton";
import { FavoriteButton } from "@/components/interaction/FavoriteButton";
import { ShareButton } from "@/components/interaction/ShareButton";
import { CommentSection } from "@/components/interaction/CommentSection";
import { articleApi } from "@/lib/api/articles";
import { adminApi } from "@/lib/api/index";
import { useAuthStore } from "@/store/authStore";
import { formatDate } from "@/lib/utils";

/** 文章阅读页。 */
export default function ArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [readingProgress, setReadingProgress] = useState(0);
  const [showBackTop, setShowBackTop] = useState(false);

  const { user } = useAuthStore();
  const isAdmin = user?.role === "ADMIN";

  const { data: article, isLoading, error } = useQuery({
    queryKey: ["article", slug],
    queryFn: () => articleApi.getBySlug(slug!),
    enabled: !!slug,
  });

  const [pinning, setPinning] = useState(false);
  const [isPinned, setIsPinned] = useState(false);

  const handleTogglePin = async () => {
    if (!article) return;
    setPinning(true);
    try {
      const res = await adminApi.togglePin(article.id);
      setIsPinned(res.is_pinned);
    } catch {
      // silent
    } finally {
      setPinning(false);
    }
  };

  // 相关文章推荐
  const { data: relatedArticles } = useQuery({
    queryKey: ["article", slug, "related"],
    queryFn: () => articleApi.getRelated(slug!),
    enabled: !!slug,
  });

  // 从渲染后的 DOM 中提取目录
  useEffect(() => {
    if (!article) return;
    const timer = setTimeout(() => {
      const contentEl = document.getElementById("article-content");
      if (contentEl) setTocItems(extractToc(contentEl));
    }, 500);
    return () => clearTimeout(timer);
  }, [article]);

  /** 下载文章为 Markdown 文件。 */
  const handleDownload = useCallback(() => {
    if (!article) return;
    const frontmatter = `---
title: "${article.title}"
date: "${article.published_at || article.created_at}"
tags: [${article.tags.map(t => `"${t.name}"`).join(", ")}]
---

`;
    const blob = new Blob([frontmatter + article.content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${article.slug || "article"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [article]);

  // 阅读进度 + 回到顶部
  const handleScroll = useCallback(() => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    setReadingProgress(docHeight > 0 ? Math.min((scrollTop / docHeight) * 100, 100) : 0);
    setShowBackTop(scrollTop > 400);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20">
        <div className="space-y-4">
          <div className="h-8 w-3/4 animate-pulse-soft rounded bg-muted" />
          <div className="flex gap-3">
            <div className="h-5 w-5 animate-pulse-soft rounded-full bg-muted" />
            <div className="h-4 w-24 animate-pulse-soft rounded bg-muted" />
            <div className="h-4 w-32 animate-pulse-soft rounded bg-muted" />
          </div>
          <div className="divider-gradient" />
          <div className="space-y-3 pt-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-4 animate-pulse-soft rounded bg-muted" style={{ width: `${90 - i * 8}%` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <p className="text-muted-foreground">文章不存在或加载失败</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/articles">返回文章列表</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      {/* ═══ 阅读进度条 ═══ */}
      <div className="fixed top-0 left-0 z-50 h-0.5 w-full bg-border/30">
        <div
          className="h-full bg-gradient-to-r from-brand to-primary transition-all duration-100"
          style={{ width: `${readingProgress}%` }}
        />
      </div>

      {/* ═══ 回到顶部按钮 ═══ */}
      {showBackTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-50 flex h-10 w-10 items-center justify-center rounded-full border bg-card shadow-lg transition-all hover:bg-accent animate-in fade-in zoom-in-95"
          title="回到顶部"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      )}

      <div className="mx-auto max-w-6xl px-4 pt-4 pb-8 sm:px-6 animate-in fade-in-up">
        <div className="flex gap-10">
          {/* 正文区 */}
          <article className="min-w-0 flex-1 max-w-3xl">
            <button
              onClick={() => window.history.back()}
              className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> 返回
            </button>

            <div className="rounded-xl card-glass p-6 sm:p-8">
            <h1 className="mb-4 text-3xl font-bold leading-snug tracking-tight sm:text-4xl">
              {article.title}
            </h1>

            {/* 封面图 */}
            {article.cover_image && (
              <div className="mb-6 overflow-hidden rounded-xl border">
                <img
                  src={article.cover_image}
                  alt={article.title}
                  className="h-full w-full object-cover"
                  style={{ maxHeight: "400px" }}
                />
              </div>
            )}

            <div className="mb-8 flex items-center gap-4 pb-6 flex-wrap" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
              <Link to={`/user/${article.author.id}`} className="flex items-center gap-2.5 group">
                <Avatar src={article.author.avatar} fallback={article.author.username[0]} className="h-10 w-10 ring-2 ring-background shadow-sm" />
                <div>
                  <span className="text-sm font-medium transition-colors group-hover:text-primary">{article.author.username}</span>
                </div>
              </Link>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                {article.published_at && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDate(article.published_at)}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5" />
                  {article.views} 阅读
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {Math.max(1, Math.ceil(article.content.length / 500))} 分钟
                </span>
              </div>
              {/* 文章作者或管理员可编辑 */}
              {(user?.id === article.author.id || isAdmin) && (
                <>
                  <div className="h-4 w-px bg-border" />
                  <Link
                    to={`/editor/${article.slug}`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary/80"
                  >
                    <PenSquare className="h-3.5 w-3.5" />
                    编辑
                  </Link>
                </>
              )}
            </div>

            {/* Markdown 正文（含代码块复制按钮） */}
            <div id="article-content" className="prose prose-neutral max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  pre: CodeBlock,
                }}
              >
                {article.content}
              </ReactMarkdown>
            </div>

            {article.tags.length > 0 && (
              <div className="mt-10 flex flex-wrap gap-2 pt-6" style={{ borderTop: "1px solid hsl(var(--border))" }}>
                {article.tags.map((tag) => (
                  <Badge key={tag.id} variant="secondary" className="text-xs transition-colors hover:bg-brand-soft">
                    {tag.name}
                  </Badge>
                ))}
              </div>
            )}

            </div>

            <div className="mt-8 flex items-center gap-3 rounded-xl p-4 card-glass">
              <LikeButton articleId={article.id} initialLiked={article.is_liked} count={article.like_count ?? 0} />
              <div className="h-5 w-px bg-border" />
              <FavoriteButton articleId={article.id} initialFavorited={article.is_favorited} count={article.favorite_count ?? 0} />
              <div className="h-5 w-px bg-border" />
              <ShareButton articleId={article.id} slug={article.slug} />
              <div className="h-5 w-px bg-border" />
              <button
                onClick={handleDownload}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                title="下载 Markdown"
              >
                <Download className="h-4 w-4" />
                下载
              </button>
              {isAdmin && (
                <>
                  <div className="h-5 w-px bg-border" />
                  <button
                    onClick={handleTogglePin}
                    disabled={pinning}
                    className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm transition-colors"
                    style={{ color: isPinned ? "#f59e0b" : undefined }}
                    title={isPinned ? "取消置顶" : "置顶文章"}
                  >
                    {pinning ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isPinned ? (
                      <Pin className="h-4 w-4 fill-amber-400 text-amber-500" />
                    ) : (
                      <PinOff className="h-4 w-4" />
                    )}
                    {isPinned ? "已置顶" : "置顶"}
                  </button>
                </>
              )}
            </div>

            {/* 相关推荐 */}
            {relatedArticles && relatedArticles.length > 0 && (
              <div className="mt-12">
                <h3 className="mb-4 text-lg font-semibold">相关推荐</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {relatedArticles.map((ra) => (
                    <Link
                      key={ra.id}
                      to={`/article/${encodeURIComponent(ra.slug)}`}
                      className="group rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50"
                    >
                      <h4 className="line-clamp-2 text-sm font-medium transition-colors group-hover:text-primary">
                        {ra.title}
                      </h4>
                      {ra.excerpt && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{ra.excerpt}</p>
                      )}
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{ra.author?.username}</span>
                        <span>{ra.views} 阅读</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-12">
              <CommentSection articleId={article.id} authorId={article.author.id} />
            </div>
          </article>

          <aside className="hidden w-56 shrink-0 lg:block">
            <div className="sticky top-20">
              <TableOfContents items={tocItems} />
              <div className="mt-6 rounded-lg border bg-card p-4 text-xs text-muted-foreground">
                <Clock className="h-3 w-3 inline mr-1" />
                预计阅读 {Math.max(1, Math.ceil(article.content.length / 500))} 分钟
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

/** 代码块组件：hover 时右上角显示复制按钮。 */
function CodeBlock({ children, className, ...props }: React.HTMLAttributes<HTMLPreElement>) {
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  const handleCopy = useCallback(async () => {
    const code = preRef.current?.textContent || "";
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, []);

  return (
    <div className="group relative">
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 z-10 rounded-md border bg-card p-1.5 text-muted-foreground opacity-0 shadow-sm transition-all group-hover:opacity-100 hover:text-foreground"
        title="复制代码"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <pre ref={preRef} className={className} {...props}>
        {children}
      </pre>
    </div>
  );
}

