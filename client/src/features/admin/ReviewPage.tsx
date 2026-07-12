import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Eye, Loader2, Pin, PinOff } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { adminApi } from "@/lib/api/index";
import { articleApi } from "@/lib/api/articles";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate } from "@/lib/utils";
import type { ArticleBrief } from "@/types";

type Tab = "pending" | "published";

/** 文章管理页面：审核 + 置顶管理。 */
export default function ReviewPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("pending");
  const [previewArticle, setPreviewArticle] = useState<any>(null);

  // 待审核
  const { data: pending, isLoading: pendingLoading } = useQuery({
    queryKey: ["admin", "pending"],
    queryFn: () => adminApi.pendingArticles(),
    staleTime: 2 * 60 * 1000,
  });

  // 已发布（用于置顶管理）
  const { data: publishedData, isLoading: publishedLoading } = useQuery({
    queryKey: ["admin", "published"],
    queryFn: () => articleApi.list({ limit: 100 }),
    enabled: tab === "published",
    staleTime: 2 * 60 * 1000,
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "approve" | "reject" }) =>
      adminApi.reviewArticle(id, action),
    onSuccess: (_, { action }) => {
      toast(action === "approve" ? "文章已通过" : "文章已拒绝", "success");
      queryClient.invalidateQueries({ queryKey: ["admin", "pending"] });
      setPreviewArticle(null);
    },
    onError: () => toast("操作失败", "error"),
  });

  const pinMutation = useMutation({
    mutationFn: (id: number) => adminApi.togglePin(id),
    onSuccess: (data) => {
      toast(data.is_pinned ? "已置顶" : "已取消置顶", "success");
      queryClient.invalidateQueries({ queryKey: ["admin", "published"] });
    },
    onError: () => toast("操作失败", "error"),
  });

  const pendingArticles = (pending as any[]) ?? [];
  const publishedArticles = (publishedData?.items as ArticleBrief[]) ?? [];
  const isLoading = tab === "pending" ? pendingLoading : publishedLoading;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">文章管理</h1>

      {/* Tab 切换 */}
      <div className="mb-6 flex gap-1 border-b">
        {([{ key: "pending", label: "待审核" }, { key: "published", label: "已发布" }] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : tab === "pending" ? (
        /* ═══ 待审核 ═══ */
        pendingArticles.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">暂无待审核文章</div>
        ) : (
          <div className="space-y-3">
            {pendingArticles.map((a: any) => (
              <div key={a.id} className="flex items-center gap-4 rounded-lg border bg-card p-4">
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{a.title}</span>
                    <Badge variant="secondary" className="text-xs shrink-0">待审核</Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Avatar src={a.author?.avatar} fallback={a.author?.username?.[0] ?? "?"} className="h-4 w-4" />
                      {a.author?.username}
                    </span>
                    <span>{formatDate(a.created_at)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setPreviewArticle(a)}>
                    <Eye className="mr-1 h-4 w-4" /> 预览
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    className="text-emerald-600 hover:text-emerald-700"
                    onClick={() => reviewMutation.mutate({ id: a.id, action: "approve" })}
                    disabled={reviewMutation.isPending}
                  >
                    <CheckCircle className="mr-1 h-4 w-4" /> 通过
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    className="text-red-500 hover:text-red-600"
                    onClick={() => reviewMutation.mutate({ id: a.id, action: "reject" })}
                    disabled={reviewMutation.isPending}
                  >
                    <XCircle className="mr-1 h-4 w-4" /> 拒绝
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* ═══ 已发布（置顶管理） ═══ */
        publishedArticles.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">暂无已发布文章</div>
        ) : (
          <div className="space-y-3">
            {publishedArticles.map((a) => (
              <div key={a.id} className="flex items-center gap-4 rounded-lg border bg-card p-4">
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-2">
                    {(a as any).is_pinned && (
                      <Pin className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                    )}
                    <span className="font-medium truncate">{a.title}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{a.views} 阅读</span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <Avatar src={a.author.avatar} fallback={a.author.username[0]} className="h-4 w-4" />
                    <span>{a.author.username}</span>
                    <span>{formatDate(a.published_at ?? a.created_at)}</span>
                  </div>
                </div>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => pinMutation.mutate(a.id)}
                  disabled={pinMutation.isPending}
                >
                  {(a as any).is_pinned ? (
                    <><PinOff className="mr-1 h-4 w-4" /> 取消置顶</>
                  ) : (
                    <><Pin className="mr-1 h-4 w-4" /> 置顶</>
                  )}
                </Button>
              </div>
            ))}
          </div>
        )
      )}

      {/* 预览弹窗 */}
      {previewArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm">
          <div className="relative max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-card p-6 shadow-2xl">
            <button
              onClick={() => setPreviewArticle(null)}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
            <h2 className="mb-4 text-xl font-bold">{previewArticle.title}</h2>
            <div className="prose prose-neutral max-w-none text-sm">
              {previewArticle.excerpt && <p className="text-muted-foreground">{previewArticle.excerpt}</p>}
              <div className="mt-4 whitespace-pre-wrap">{previewArticle.content?.slice(0, 1000)}{previewArticle.content?.length > 1000 ? "..." : ""}</div>
            </div>
            <div className="mt-6 flex gap-3 border-t pt-4">
              <Button onClick={() => reviewMutation.mutate({ id: previewArticle.id, action: "approve" })} disabled={reviewMutation.isPending}>
                <CheckCircle className="mr-1 h-4 w-4" /> 通过
              </Button>
              <Button variant="outline" onClick={() => reviewMutation.mutate({ id: previewArticle.id, action: "reject" })} disabled={reviewMutation.isPending}>
                <XCircle className="mr-1 h-4 w-4" /> 拒绝
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
