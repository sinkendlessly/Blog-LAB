import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2, BookOpen, X, Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArticleCard } from "@/components/ArticleCard";
import { articleApi } from "@/lib/api/articles";
import { tagApi, categoryApi } from "@/lib/api/index";

/** 文章列表页。支持 ?tag_id=X / ?category_id=X 过滤，以及 ?pinned=1 查看置顶。 */
export default function ArticlesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tagId = searchParams.get("tag_id") ? Number(searchParams.get("tag_id")) : undefined;
  const categoryId = searchParams.get("category_id") ? Number(searchParams.get("category_id")) : undefined;
  const isPinned = searchParams.get("pinned") === "1";

  // 获取过滤标签/分类名称
  const { data: tags } = useQuery({
    queryKey: ["tags"],
    queryFn: () => tagApi.list(),
    staleTime: 10 * 60 * 1000,
  });
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoryApi.list(),
    staleTime: 10 * 60 * 1000,
  });

  const currentTag = tags?.find((t) => t.id === tagId);
  const currentCategory = categories?.find((c) => c.id === categoryId);

  // 置顶文章
  const { data: pinnedArticles, isLoading: pinnedLoading } = useQuery({
    queryKey: ["articles", "pinned"],
    queryFn: () => articleApi.getPinned(),
    enabled: isPinned,
    staleTime: 5 * 60 * 1000,
  });

  // 普通列表
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["articles", "list", { tagId, categoryId }],
    queryFn: ({ pageParam }) =>
      articleApi.list({
        cursor: pageParam,
        limit: 20,
        tag_id: tagId,
        category_id: categoryId,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta?.next_cursor ?? undefined,
    enabled: !isPinned,
  });

  const articles = data?.pages.flatMap((p) => p.items) ?? [];
  const displayItems = isPinned ? (pinnedArticles ?? []) : articles;
  const isLoadingItems = isPinned ? pinnedLoading : isLoading;

  const clearFilter = () => setSearchParams({});

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">
            {isPinned ? (
              <span className="flex items-center gap-2">
                <Pin className="h-5 w-5 text-amber-500" />
                置顶文章
              </span>
            ) : currentTag ? (
              `# ${currentTag.name}`
            ) : currentCategory ? (
              currentCategory.name
            ) : (
              "全部文章"
            )}
          </h1>
          {(currentTag || currentCategory) && (
            <button
              onClick={clearFilter}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
              清除筛选
            </button>
          )}
        </div>
        <Link to="/editor">
          <Button size="sm">写文章</Button>
        </Link>
      </div>

      {/* 过滤提示 */}
      {(currentTag || currentCategory) && !isPinned && (
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <span>当前筛选：</span>
          {currentCategory && (
            <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium">
              {currentCategory.name}
            </span>
          )}
          {currentTag && (
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              # {currentTag.name}
            </span>
          )}
        </div>
      )}

      {isLoadingItems ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-4 rounded-xl border bg-card p-4">
              <div className="flex-1 space-y-3 py-1">
                <div className="h-5 w-3/4 animate-pulse-soft rounded bg-muted" />
                <div className="h-4 w-1/2 animate-pulse-soft rounded bg-muted" />
                <div className="flex gap-3">
                  <div className="h-3 w-16 animate-pulse-soft rounded bg-muted" />
                  <div className="h-3 w-20 animate-pulse-soft rounded bg-muted" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : displayItems.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <BookOpen className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">
            {isPinned ? "暂无置顶文章" : (currentTag || currentCategory ? "该筛选条件下暂无文章" : "暂无文章")}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {displayItems.map((a) => (
              <ArticleCard key={a.id} article={a} horizontal />
            ))}
          </div>

          {!isPinned && hasNextPage && (
            <div className="mt-8 flex justify-center">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
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
