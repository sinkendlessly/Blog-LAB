import { useState, useEffect, useRef } from "react";
import TextType from "@/components/ui/TextType";
import { Link } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { BookOpen, PenSquare, Loader2, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArticleCard } from "@/components/ArticleCard";
import { articleApi } from "@/lib/api/articles";
import { searchApi, tagApi } from "@/lib/api/index";
import { useAuthStore } from "@/store/authStore";
import { formatCount } from "@/lib/utils";

/** 首页：杂志风格 — 话题标签栏 + 精选大卡 + 热门排行 + 双列文章流。 */
export default function HomePage() {
  const { isAuthenticated } = useAuthStore();

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["articles", "home"],
    queryFn: ({ pageParam }) => articleApi.list({ cursor: pageParam, limit: 12 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta?.next_cursor ?? undefined,
  });

  const { data: hotArticles } = useQuery({
    queryKey: ["search", "hot"],
    queryFn: () => searchApi.hot(10),
    staleTime: 10 * 60 * 1000,
  });

  const { data: allTags } = useQuery({
    queryKey: ["tags"],
    queryFn: () => tagApi.list(),
    staleTime: 10 * 60 * 1000,
  });

  const articles = data?.pages.flatMap((p) => p.items) ?? [];

  // 话题标签横向滚轮
  const tagScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = tagScrollRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [allTags]);

  // 精选轮播
  const [featIdx, setFeatIdx] = useState(0);
  const featured = hotArticles?.slice(0, 5) ?? [];
  const featLen = featured.length;
  useEffect(() => {
    if (featLen < 2) return;
    const timer = setInterval(() => setFeatIdx((p) => (p + 1) % featLen), 5000);
    return () => clearInterval(timer);
  }, [featLen]);

  // 热门排行滚动
  const [hotIdx, setHotIdx] = useState(0);
  const hotPages = Math.ceil((hotArticles?.length ?? 0) / 5);
  useEffect(() => {
    if (hotPages < 2) return;
    const timer = setInterval(() => setHotIdx((p) => (p + 1) % hotPages), 4500);
    return () => clearInterval(timer);
  }, [hotPages]);

  // 精选轮播滚轮
  const carouselRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = carouselRef.current;
    if (!el || featLen < 2) return;
    const handler = (e: WheelEvent) => {
      if (e.deltaY > 0) setFeatIdx((p) => (p + 1) % featLen);
      else setFeatIdx((p) => (p - 1 + featLen) % featLen);
      e.preventDefault();
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [featLen]);

  // 热门排行滚轮
  const hotRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = hotRef.current;
    if (!el || hotPages < 2) return;
    const handler = (e: WheelEvent) => {
      if (e.deltaY > 0) setHotIdx((p) => (p + 1) % hotPages);
      else setHotIdx((p) => (p - 1 + hotPages) % hotPages);
      e.preventDefault();
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [hotPages]);

  return (
    <div className="mx-auto max-w-6xl px-6 pt-4 pb-8">
      {/* ═══ Hero ═══ */}
      <div className="mb-10 animate-in fade-in-up">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          <span className="text-brand-gradient">记录</span>思想
        </h1>
        <p className="mt-3 max-w-lg text-lg text-muted-foreground min-h-[1.5em]">
          <TextType
            text={["分享你的知识、经验和故事", "发现社区精选技术文章", "记录你的编程学习之路"]}
            typingSpeed={60}
            deletingSpeed={25}
            pauseDuration={2500}
            loop={true}
            showCursor={true}
            cursorCharacter="|"
          />
        </p>
        {isAuthenticated && (
          <Button asChild className="mt-5" size="default">
            <Link to="/editor">
              <PenSquare className="mr-1.5 h-4 w-4" />
              开始写作
            </Link>
          </Button>
        )}
      </div>

      {/* ═══ 话题标签栏 ═══ */}
      {allTags && allTags.length > 0 && (
        <div className="mb-8 animate-in fade-in-up">
          <div
            ref={tagScrollRef}
            className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin"
          >
            {allTags.map((tag) => (
              <Link
                key={tag.id}
                to={`/articles?tag_id=${tag.id}`}
                className="inline-flex items-center gap-1.5 shrink-0 rounded-full border border-border/60 bg-card px-4 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:border-primary/40 hover:text-primary hover:bg-primary/5"
              >
                {tag.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ═══ 精选轮播 + 热门排行 ═══ */}
      {featured.length > 0 && (
        <div className="mb-10 grid gap-6 lg:grid-cols-3 animate-in fade-in-up">
          {/* 精选轮播 */}
          <div ref={carouselRef} className="relative col-span-2 overflow-hidden rounded-xl card-glass">
            {featured.map((item: any, idx: number) => (
              <Link
                key={item.id ?? idx}
                to={`/article/${encodeURIComponent(item.slug)}`}
                className={`absolute inset-0 transition-all duration-700 ${
                  idx === featIdx ? "opacity-100 z-10" : "opacity-0 z-0"
                }`}
              >
                {item.cover_image ? (
                  <div className="aspect-[21/9] overflow-hidden sm:aspect-[16/7]">
                    <img
                      src={item.cover_image}
                      alt={item.title}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                ) : (
                  <div className="flex aspect-[21/9] items-center justify-center bg-gradient-to-br from-brand/10 to-primary/10 sm:aspect-[16/7]">
                    <BookOpen className="h-12 w-12 text-brand/30" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-0 p-5 sm:p-6">
                  <h2 className="mb-2 text-xl font-bold text-white sm:text-2xl line-clamp-2">
                    {item.title}
                  </h2>
                  {item.excerpt && (
                    <p className="mb-2 line-clamp-2 text-sm text-white/80">
                      {item.excerpt}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-white/60">
                    <span>{item.author?.username}</span>
                    <span>{formatCount(item.views)} 阅读</span>
                  </div>
                </div>
              </Link>
            ))}
            {/* 轮播指示器 */}
            {featured.length > 1 && (
              <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-1.5">
                {featured.map((_: any, idx: number) => (
                  <button
                    key={idx}
                    onClick={(e) => { e.preventDefault(); setFeatIdx(idx); }}
                    className={`h-1.5 rounded-full transition-all ${
                      idx === featIdx ? "w-6 bg-white" : "w-1.5 bg-white/50"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 热门排行（滚动轮播 Top 10） */}
          <div ref={hotRef} className="rounded-xl p-5 card-glass">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <Flame className="h-4 w-4" style={{ color: "hsl(var(--brand))" }} />
              热门排行
            </h3>
            <div className="relative h-[240px] overflow-hidden">
              {(() => {
                const pages = [];
                const items = hotArticles?.slice(0, 10) ?? [];
                const pageSize = 5;
                for (let p = 0; p < Math.ceil(items.length / pageSize); p++) {
                  pages.push(p);
                }
                return (
                  <>
                    {pages.map((page) => (
                      <ol
                        key={page}
                        className={`space-y-3 absolute inset-0 transition-all duration-500 ${
                          page === hotIdx
                            ? "opacity-100 translate-y-0"
                            : "opacity-0 translate-y-4 pointer-events-none"
                        }`}
                      >
                        {items.slice(page * pageSize, (page + 1) * pageSize).map((item: any, idx: number) => {
                          const rank = page * pageSize + idx;
                          return (
                            <li key={item.id ?? rank} className="group flex gap-3">
                              <span
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                                style={{
                                  background: rank < 3 ? "hsl(var(--brand))" : "hsl(var(--muted))",
                                  color: rank < 3 ? "white" : "hsl(var(--muted-foreground))",
                                }}
                              >
                                {rank + 1}
                              </span>
                              <Link
                                to={`/article/${encodeURIComponent(item.slug)}`}
                                className="line-clamp-2 text-sm leading-snug text-foreground/80 transition-colors group-hover:text-primary"
                              >
                                {item.title}
                              </Link>
                            </li>
                          );
                        })}
                      </ol>
                    ))}
                    {/* 页面指示器 */}
                    {pages.length > 1 && (
                      <div className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 gap-1">
                        {pages.map((p) => (
                          <span
                            key={p}
                            className={`h-1 rounded-full transition-all ${
                              p === hotIdx ? "w-4 bg-brand" : "w-1 bg-border"
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ═══ 文章列表（纯双列） ═══ */}
      {isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-52 animate-pulse-soft rounded-xl border bg-card" />
          ))}
        </div>
      ) : articles.length === 0 ? (
        <div className="flex flex-col items-center py-24 text-center">
          <BookOpen className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <p className="text-muted-foreground">暂无文章，成为第一个创作者吧</p>
          {isAuthenticated && (
            <Button asChild className="mt-5" size="sm">
              <Link to="/editor">写第一篇文章</Link>
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            {articles.map((a, i) => (
              <div key={a.id} className={`animate-in fade-in-up stagger-${Math.min(i + 1, 6)}`}>
                <ArticleCard article={a} />
              </div>
            ))}
          </div>

          {hasNextPage && (
            <div className="mt-8 flex justify-center">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="gap-2"
              >
                {isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" />}
                加载更多
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
