import { useQuery } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { ArticleCard } from "@/components/ArticleCard";
import { articleApi } from "@/lib/api/articles";
import { useAuthStore } from "@/store/authStore";

/** 关注动态：展示关注用户发布的最新文章。 */
export default function MyFollowingPage() {
  const { isAuthenticated } = useAuthStore();

  const { data: articles, isLoading } = useQuery({
    queryKey: ["articles", "following"],
    queryFn: () => articleApi.getFollowing(20),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-20 text-center text-muted-foreground">
        登录后即可查看关注动态
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="mb-6 text-2xl font-bold">关注动态</h1>
        <div className="grid gap-5 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-52 animate-pulse-soft rounded-xl border bg-card" />
          ))}
        </div>
      </div>
    );
  }

  const items = articles ?? [];

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-bold">关注动态</h1>

      {items.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <BookOpen className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <p className="text-muted-foreground">你关注的用户还没有发布文章</p>
          <p className="mt-1 text-xs text-muted-foreground/60">去发现页找找感兴趣的内容吧</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {items.map((a) => (
            <ArticleCard key={a.id} article={a} />
          ))}
        </div>
      )}
    </div>
  );
}
