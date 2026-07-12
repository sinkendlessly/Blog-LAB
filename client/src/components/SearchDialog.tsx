import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, FileText, ArrowRight } from "lucide-react";
import { searchIndex, type SearchResult } from "@/lib/search";
import { articleApi } from "@/lib/api/articles";
import { useUIStore } from "@/store/uiStore";

/** Cmd/Ctrl+K 搜索弹窗 — Spotlight 风格。 */
export function SearchDialog() {
  const { searchOpen, setSearchOpen } = useUIStore();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  // 建索引（懒加载）
  useQuery({
    queryKey: ["articles", "index"],
    queryFn: async () => {
      const data = await articleApi.index();
      searchIndex.buildIndex(data);
      return data;
    },
    staleTime: 30 * 60 * 1000,
    enabled: searchOpen,
  });

  // 搜索
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSelectedIndex(0);
      return;
    }
    const r = searchIndex.search(query);
    setResults(r);
    setSelectedIndex(0);
  }, [query]);

  // 聚焦输入框
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery("");
      setResults([]);
    }
  }, [searchOpen]);

  // 全局快捷键 Cmd/Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(!searchOpen);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [searchOpen, setSearchOpen]);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      setSearchOpen(false);
      navigate(`/article/${encodeURIComponent(result.slug)}`);
    },
    [navigate, setSearchOpen]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      handleSelect(results[selectedIndex]);
    } else if (e.key === "Escape") {
      setSearchOpen(false);
    }
  };

  if (!searchOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[18vh]">
      {/* 遮罩 — 柔和模糊 */}
      <div
        className="absolute inset-0 bg-foreground/15 backdrop-blur-md"
        onClick={() => setSearchOpen(false)}
      />

      {/* 弹窗 — 圆润、阴影、品牌色边框 */}
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl animate-in zoom-in-95 bg-card" style={{ borderColor: "hsl(var(--border))" }}>
        {/* 品牌色顶边 */}
        <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, hsl(var(--brand)), hsl(var(--primary)))` }} />

        {/* 搜索框 */}
        <div className="flex items-center gap-3 px-5 py-3.5">
          <Search className="h-4.5 w-4.5 shrink-0 text-muted-foreground" style={{ width: 18, height: 18 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索文章、标签..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          />
          <kbd className="rounded-md border border-border bg-muted/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            ESC
          </kbd>
        </div>

        {/* 分割线 */}
        <div className="divider-gradient" />

        {/* 结果列表 */}
        <div className="max-h-80 overflow-y-auto p-2 scrollbar-thin">
          {query.trim() && results.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              未找到「{query}」相关文章
            </div>
          )}

          {results.map((result, idx) => (
            <button
              key={result.id}
              onClick={() => handleSelect(result)}
              className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-all ${
                idx === selectedIndex
                  ? "bg-accent shadow-sm"
                  : "hover:bg-accent/40"
              }`}
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="font-medium leading-snug">{result.title}</div>
                {result.excerpt && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {result.excerpt}
                  </p>
                )}
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{result.author.username}</span>
                  {result.tags.slice(0, 2).map((t) => (
                    <span key={t.id} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground">
                      {t.name}
                    </span>
                  ))}
                </div>
              </div>
              {idx === selectedIndex && (
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
            </button>
          ))}

          {!query.trim() && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              输入关键词开始搜索
            </div>
          )}
        </div>

        {/* 底部键盘提示 */}
        <div className="flex items-center justify-between border-t px-5 py-2.5 text-[10px] text-muted-foreground/70">
          <div className="flex items-center gap-3">
            <span>↑↓ 导航</span>
            <span>↵ 打开</span>
            <span>esc 关闭</span>
          </div>
          <span>⌘K 切换</span>
        </div>
      </div>
    </div>
  );
}
