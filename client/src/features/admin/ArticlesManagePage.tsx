import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Search, X, Trash2, Eye, PenSquare, Loader2, FileText, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { adminApi } from "@/lib/api/index";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate, formatCount } from "@/lib/utils";

type ArticleStatus = "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "REJECTED";

const STATUS_MAP: Record<ArticleStatus, { label: string; color: string }> = {
  DRAFT: { label: "草稿", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  PENDING_REVIEW: { label: "审核中", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  PUBLISHED: { label: "已发布", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  REJECTED: { label: "已拒绝", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

/** 管理后台 — 文章管理（增删改查）。 */
export default function ArticlesManagePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;
  const [previewArticle, setPreviewArticle] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  const { data: articles, isLoading } = useQuery({
    queryKey: ["admin", "articles", statusFilter, search, page],
    queryFn: () => adminApi.listArticles({
      status: statusFilter || undefined,
      search: search || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    staleTime: 30 * 1000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminApi.deleteArticle(id),
    onSuccess: () => {
      toast("文章已删除", "success");
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "articles"] });
    },
    onError: () => toast("删除失败", "error"),
  });

  const items = (articles as any[]) ?? [];

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
  }, []);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">文章管理</h1>
      </div>

      {/* 筛选行 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* 搜索 */}
        <form onSubmit={handleSearch} className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索标题..."
            className="w-full rounded-lg border border-input bg-background pl-9 pr-8 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(""); setPage(0); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </form>

        {/* 状态筛选 */}
        <div className="flex gap-1">
          {[
            { label: "全部", value: "" },
            { label: "草稿", value: "DRAFT" },
            { label: "审核中", value: "PENDING_REVIEW" },
            { label: "已发布", value: "PUBLISHED" },
            { label: "已拒绝", value: "REJECTED" },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => { setStatusFilter(f.value); setPage(0); }}
              className={cn(
                "rounded px-2.5 py-1.5 text-xs transition-colors",
                statusFilter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-accent"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* 列表 */}
      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <FileText className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">暂无文章</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">标题</th>
                <th className="px-4 py-3 text-left font-medium">作者</th>
                <th className="px-4 py-3 text-left font-medium">状态</th>
                <th className="px-4 py-3 text-left font-medium">阅读</th>
                <th className="px-4 py-3 text-left font-medium">日期</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a: any) => (
                <tr key={a.id} className="border-b last:border-0 hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {a.cover_image && (
                        <img src={a.cover_image} alt="" className="h-8 w-12 rounded object-cover shrink-0" />
                      )}
                      <span className="font-medium line-clamp-1">{a.title}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Avatar src={a.author?.avatar} fallback={a.author?.username?.[0] ?? "?"} className="h-5 w-5" />
                      <span className="text-muted-foreground">{a.author?.username}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={cn("text-xs", STATUS_MAP[a.status as ArticleStatus]?.color)}>
                      {STATUS_MAP[a.status as ArticleStatus]?.label ?? a.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatCount(a.views)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(a.published_at ?? a.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="预览"
                        onClick={() => setPreviewArticle(a)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Link to={`/editor/${a.slug}`}>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="编辑">
                          <PenSquare className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" title="删除"
                        onClick={() => setDeleteTarget(a)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 分页 */}
      {items.length > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>当前 {page * PAGE_SIZE + 1}-{page * PAGE_SIZE + items.length}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" /> 上一页
            </Button>
            <Button variant="outline" size="sm" disabled={items.length < PAGE_SIZE} onClick={() => setPage((p) => p + 1)}>
              下一页 <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* 预览弹窗 */}
      {previewArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm">
          <div className="relative max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-card p-6 shadow-2xl mx-4">
            <button onClick={() => setPreviewArticle(null)} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
            <h2 className="mb-2 text-xl font-bold">{previewArticle.title}</h2>
            <div className="mb-4 flex items-center gap-3 text-sm text-muted-foreground">
              <span>{previewArticle.author?.username}</span>
              <span>{formatDate(previewArticle.published_at ?? previewArticle.created_at)}</span>
              <Badge className={cn("text-xs", STATUS_MAP[previewArticle.status as ArticleStatus]?.color)}>
                {STATUS_MAP[previewArticle.status as ArticleStatus]?.label ?? previewArticle.status}
              </Badge>
            </div>
            {previewArticle.excerpt && <p className="mb-4 text-sm text-muted-foreground">{previewArticle.excerpt}</p>}
            <div className="border-t pt-4 text-sm">{previewArticle.content?.slice(0, 2000)}{previewArticle.content?.length > 2000 ? "..." : ""}</div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-xl border bg-card p-6 shadow-2xl">
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
              确定要删除 <span className="font-medium">「{deleteTarget.title}」</span> 吗？
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>取消</Button>
              <Button size="sm" className="bg-red-600 text-white hover:bg-red-700"
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? "删除中..." : "确认删除"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
