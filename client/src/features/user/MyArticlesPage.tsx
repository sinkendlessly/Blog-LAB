import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PenSquare, Trash2, Loader2, FileText, Search, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { articleApi } from "@/lib/api/articles";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate, formatCount } from "@/lib/utils";
import type { ArticleStatus } from "@/types";

const STATUS_MAP: Record<ArticleStatus, { label: string; color: string }> = {
  DRAFT: { label: "草稿", color: "bg-amber-100 text-amber-700" },
  PENDING_REVIEW: { label: "审核中", color: "bg-blue-100 text-blue-700" },
  PUBLISHED: { label: "已发布", color: "bg-emerald-100 text-emerald-700" },
  REJECTED: { label: "被拒绝", color: "bg-red-100 text-red-700" },
};

/** 我的文章：草稿 + 已发布管理。 */
export default function MyArticlesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchText, setSearchText] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["my-articles", statusFilter],
    queryFn: ({ pageParam }) =>
      articleApi.myDrafts({ cursor: pageParam, status: statusFilter, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta?.next_cursor ?? undefined,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => articleApi.remove(id),
    onSuccess: () => {
      toast("文章已删除", "success");
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["my-articles"] });
    },
    onError: () => toast("删除失败", "error"),
  });

  const articles = data?.pages.flatMap((p) => p.items) ?? [];

  // 本地搜索过滤
  const filtered = useMemo(() => {
    if (!searchText.trim()) return articles;
    const q = searchText.toLowerCase();
    return articles.filter((a) => a.title.toLowerCase().includes(q));
  }, [articles, searchText]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">我的文章</h1>
        <Link to="/editor">
          <Button size="sm"><PenSquare className="mr-1.5 h-4 w-4" />写文章</Button>
        </Link>
      </div>

      {/* 状态筛选 */}
      <div className="mb-6 flex gap-2">
        {[
          { label: "全部", value: "" },
          { label: "草稿", value: "DRAFT" },
          { label: "审核中", value: "PENDING_REVIEW" },
          { label: "已发布", value: "PUBLISHED" },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm transition-colors",
              statusFilter === f.value
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-accent"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 搜索框 */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="搜索我的文章..."
          className="w-full rounded-lg border border-input bg-background pl-9 pr-8 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        {searchText && (
          <button
            onClick={() => setSearchText("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <FileText className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">
            {searchText ? "没有匹配的文章" : "还没有文章"}
          </p>
          {!searchText && (
            <Link to="/editor"><Button className="mt-4" size="sm">写第一篇文章</Button></Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => {
            const st = STATUS_MAP[a.status as ArticleStatus] ?? STATUS_MAP.DRAFT;
            return (
              <div key={a.id} className="flex items-center gap-4 rounded-lg border bg-card p-4">
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-2">
                    <Link to={`/article/${encodeURIComponent(a.slug)}`} className="font-medium hover:text-primary transition-colors truncate">
                      {a.title}
                    </Link>
                    <Badge className={cn("text-xs shrink-0", st.color)}>{st.label}</Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{formatDate(a.published_at ?? a.created_at)}</span>
                    <span>{formatCount(a.views)} 阅读</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link to={`/editor/${a.slug}`}>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <PenSquare className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-500 hover:text-red-600"
                    onClick={() => setDeleteTarget({ id: a.id, title: a.title })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-xl border bg-card p-6 shadow-2xl animate-in zoom-in-95">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/30">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold">确认删除</h3>
                <p className="text-sm text-muted-foreground">此操作不可撤销</p>
              </div>
            </div>
            <p className="mb-1 text-sm">
              确定要删除文章
              <span className="font-medium">「{deleteTarget.title}」</span>
              吗？
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
                取消
              </Button>
              <Button
                size="sm"
                className="bg-red-600 text-white hover:bg-red-700"
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "删除中..." : "确认删除"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {hasNextPage && (
        <div className="mt-6 flex justify-center">
          <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            加载更多
          </Button>
        </div>
      )}
    </div>
  );
}
