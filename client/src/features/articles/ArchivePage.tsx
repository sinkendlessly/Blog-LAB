import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { FileText, ArrowLeft } from "lucide-react";
import { articleApi } from "@/lib/api/articles";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** 归档页：按月分组展示文章。支持 ?y=2026&m=7 定位到指定月份。 */
export default function ArchivePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const targetYear = searchParams.get("y");
  const targetMonth = searchParams.get("m");
  const hasTarget = !!targetYear && !!targetMonth;

  const { data: archiveData, isLoading } = useQuery({
    queryKey: ["articles", "archive"],
    queryFn: () => articleApi.archive(),
    staleTime: 30 * 60 * 1000,
  });

  const { data: articlesData } = useQuery({
    queryKey: ["articles", "archive-list"],
    queryFn: () => articleApi.list({ limit: 200 }),
    staleTime: 30 * 60 * 1000,
  });

  const articles = articlesData?.items ?? [];
  const archive = archiveData ?? [];

  // 按年月分组
  const grouped: Record<string, typeof articles> = {};
  const monthKeys: string[] = [];
  for (const a of articles) {
    const date = new Date(a.published_at ?? a.created_at);
    const key = `${date.getFullYear()}年${date.getMonth() + 1}月`;
    if (!grouped[key]) {
      grouped[key] = [];
      monthKeys.push(key);
    }
    grouped[key].push(a);
  }
  // 按时间倒序
  monthKeys.sort().reverse();

  // 如果有目标月份，过滤
  const targetKey = hasTarget ? `${targetYear}年${parseInt(targetMonth)}月` : null;
  const displayKeys = targetKey && grouped[targetKey]
    ? [targetKey]
    : monthKeys;

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-20 text-center text-muted-foreground">
        加载中...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center gap-4">
        {hasTarget && (
          <Button variant="ghost" size="sm" onClick={() => navigate("/archive")}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            全部归档
          </Button>
        )}
        <h1 className={`font-bold ${hasTarget ? "text-xl" : "text-2xl"}`}>
          {hasTarget ? targetKey : "归档"}
        </h1>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <FileText className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">暂无文章</p>
        </div>
      ) : (
        <div className="space-y-8">
          {displayKeys.map((month) => (
            <div key={month}>
              <h2 className="mb-4 text-lg font-semibold">{month}</h2>
              <ul className="space-y-3">
                {grouped[month].map((a) => (
                  <li key={a.id} className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent/50">
                    <Link to={`/article/${encodeURIComponent(a.slug)}`} className="font-medium hover:text-primary transition-colors">
                      {a.title}
                    </Link>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDate(a.published_at ?? a.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* 统计信息 */}
      {archive.length > 0 && (
        <div className="mt-12 border-t pt-6 text-sm text-muted-foreground">
          共 {archive.reduce((sum, a) => sum + a.count, 0)} 篇文章
        </div>
      )}
    </div>
  );
}
