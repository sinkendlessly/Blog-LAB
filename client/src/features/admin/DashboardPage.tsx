import { useQuery, useMutation } from "@tanstack/react-query";
import { FileText, Users, MessageSquare, Heart, Eye, TrendingUp, Activity, RefreshCw } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar,
} from "recharts";
import { Button } from "@/components/ui/button";
import { adminApi } from "@/lib/api/index";
import { cn, formatCount } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

/** 管理后台首页：统计卡片 + 趋势图。 */
export default function DashboardPage() {
  const { toast } = useToast();

  const { data: overview } = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => adminApi.statsOverview(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: trend } = useQuery({
    queryKey: ["admin", "trend"],
    queryFn: () => adminApi.statsTrend(30),
    staleTime: 5 * 60 * 1000,
  });

  const refreshMutation = useMutation({
    mutationFn: () => adminApi.refreshRanking(),
    onSuccess: (data: any) => toast(data.message, "success"),
    onError: () => toast("刷新失败", "error"),
  });

  const stats = (overview as any) ?? {};
  const trendData = (trend as any[]) ?? [];

  const cards = [
    { label: "文章数", value: stats.article_count ?? 0, icon: FileText, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30" },
    { label: "用户数", value: stats.user_count ?? 0, icon: Users, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
    { label: "总浏览量", value: stats.total_views ?? 0, icon: Eye, color: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-950/30" },
    { label: "点赞数", value: stats.like_count ?? 0, icon: Heart, color: "text-red-500", bg: "bg-red-50 dark:bg-red-950/30" },
    { label: "评论数", value: stats.comment_count ?? 0, icon: MessageSquare, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950/30" },
  ];

  return (
    <div className="animate-in fade-in-up">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">数据概览</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
          >
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
            刷新排行
          </Button>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Activity className="h-3 w-3" />
            实时更新
          </span>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((card) => (
          <div key={card.label} className={cn("rounded-xl border bg-card p-4 transition-shadow hover:shadow-md", card.bg)}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{card.label}</span>
              <card.icon className={cn("h-4 w-4 opacity-70", card.color)} />
            </div>
            <div className="mt-2 text-2xl font-bold">{formatCount(card.value)}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 趋势图：文章+用户 */}
        {trendData.length > 0 && (
          <div className="rounded-xl border bg-card p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              近 30 天趋势
            </h2>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
                <Legend />
                <Line type="monotone" dataKey="articles" name="新增文章" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="users" name="新增用户" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 柱状图：每日互动 */}
        {trendData.length > 0 && (
          <div className="rounded-xl border bg-card p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <Heart className="h-4 w-4 text-muted-foreground" />
              每日互动
            </h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
                <Legend />
                <Bar dataKey="likes" name="点赞" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="comments" name="评论" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* 无数据提示 */}
      {trendData.length === 0 && (
        <div className="flex items-center justify-center rounded-xl border bg-card py-20 text-muted-foreground">
          暂无统计数据
        </div>
      )}
    </div>
  );
}
