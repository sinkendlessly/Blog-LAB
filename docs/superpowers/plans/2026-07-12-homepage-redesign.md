# 首页杂志风格改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** 将首页从单调的文章列表改造为杂志风格，增加话题标签栏、精选大卡，去除右侧栏

**Architecture:** 纯前端改动，只修改 `HomePage.tsx` 一个文件。话题标签从已有 `tagApi.list()` 取，精选大卡复用 `hotArticles[0]`，不新增 API 请求。

**Tech Stack:** React + Tailwind CSS + TanStack Query

## Global Constraints
- 不新增后端 API 接口
- 不新增前端路由
- 不改动 `ArticleCard` 组件
- 保持响应式（小屏堆叠，大屏并排）

---

### Task 1: Hero 区 — 话题标签栏 + 精选大卡 + 热门排行

**Files:**
- Modify: `client/src/pages/HomePage.tsx`

**Interfaces:**
- Consumes: `tagApi.list()`, `searchApi.hot(10)` (已有)
- Produces: 改造后首页

- [ ] **Step 1: 重构 HomePage 布局结构**

去掉右侧 `aside` 侧栏和 `.flex.gap-8` 外层容器，改为纯纵向流。

修改 `HomePage.tsx` 的 return 部分：

```tsx
export default function HomePage() {
  // ... 现有 hooks 保持不变 ...

  // 话题标签
  const { data: allTags } = useQuery({
    queryKey: ["tags"],
    queryFn: () => tagApi.list(),
    staleTime: 10 * 60 * 1000,
  });

  const articles = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Hero */}
      <div className="mb-10 animate-in fade-in-up">
        <div className="brand-bar mb-5 h-8 w-1" />
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          <span className="text-brand-gradient">发现</span>好文章
        </h1>
        <p className="mt-3 max-w-lg text-lg text-muted-foreground">
          浏览社区精选内容，找到你感兴趣的知识
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

      {/* 话题标签栏 */}
      {allTags && allTags.length > 0 && (
        <div className="mb-8 animate-in fade-in-up">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
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

      {/* 精选大卡 + 热门排行 */}
      {hotArticles && hotArticles.length > 0 && (
        <div className="mb-10 grid gap-6 lg:grid-cols-3 animate-in fade-in-up">
          {/* 精选大卡 */}
          <Link
            to={`/article/${encodeURIComponent(hotArticles[0].slug)}`}
            className="group relative col-span-2 overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-lg"
          >
            {hotArticles[0].cover_image ? (
              <div className="aspect-[21/9] overflow-hidden sm:aspect-[16/7]">
                <img
                  src={hotArticles[0].cover_image}
                  alt={hotArticles[0].title}
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
                {hotArticles[0].title}
              </h2>
              {hotArticles[0].excerpt && (
                <p className="mb-2 line-clamp-2 text-sm text-white/80">
                  {hotArticles[0].excerpt}
                </p>
              )}
              <div className="flex items-center gap-3 text-xs text-white/60">
                <span>{hotArticles[0].author?.username}</span>
                <span>{formatCount(hotArticles[0].views)} 阅读</span>
              </div>
            </div>
          </Link>

          {/* 热门排行 */}
          <div className="rounded-xl border bg-card p-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <Flame className="h-4 w-4" style={{ color: "hsl(var(--brand))" }} />
              热门排行
            </h3>
            <ol className="space-y-3">
              {hotArticles.slice(0, 5).map((item: any, idx: number) => (
                <li key={item.id ?? idx} className="group flex gap-3">
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                    style={{
                      background: idx < 3 ? "hsl(var(--brand))" : "hsl(var(--muted))",
                      color: idx < 3 ? "white" : "hsl(var(--muted-foreground))",
                    }}
                  >
                    {idx + 1}
                  </span>
                  <Link
                    to={`/article/${encodeURIComponent(item.slug)}`}
                    className="line-clamp-2 text-sm leading-snug text-foreground/80 transition-colors group-hover:text-primary"
                  >
                    {item.title}
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {/* 文章列表（纯双列） */}
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
              <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                加载更多
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 更新 import**

添加缺失的 import：
```tsx
import { Link } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { BookOpen, PenSquare, ArrowRight, Loader2, Flame, Tag } from "lucide-react";
// 注意：保留 ArticleCard 等已有 import，新增 tagApi
import { tagApi } from "@/lib/api/index";
```

移除不再需要的：`Users`（原来用在关注动态）、`ArrowRight`（可选）

- [ ] **Step 3: 验证 TypeScript**

```bash
cd /c/Users/33321/Desktop/blogshare/client
npx tsc --noEmit
```
预期：零错误

- [ ] **Step 4: 视觉验证**
在浏览器中打开首页，确认：
1. 话题标签横向滚动，点击跳转正确
2. 精选大卡显示第一篇热门文章，封面图和渐变背景正常
3. 热门排行在右侧
4. 文章列表纯双列，无右侧栏
5. 小屏下精选大卡和热门排行上下堆叠
6. 响应式布局正常
