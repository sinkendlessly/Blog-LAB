import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Users, Loader2, UserPlus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { userApi } from "@/lib/api/index";
import { articleApi } from "@/lib/api/articles";
import { useAuthStore } from "@/store/authStore";

/** 我的关注：展示关注的用户列表 + 他们的最新文章。 */
export default function MyFollowingPage() {
  const { user, isAuthenticated } = useAuthStore();

  const { data: followingUsers, isLoading: usersLoading } = useQuery({
    queryKey: ["my-following-users"],
    queryFn: () => userApi.following(user!.id),
    enabled: !!user?.id,
    staleTime: 60 * 1000,
  });

  const { data: articles, isLoading: articlesLoading } = useQuery({
    queryKey: ["articles", "following"],
    queryFn: () => articleApi.getFollowing(20),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-20 text-center text-muted-foreground">
        登录后即可查看关注
      </div>
    );
  }

  if (usersLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const users = followingUsers ?? [];
  const items = articles ?? [];

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-bold">我的关注</h1>

      {/* 关注的用户列表 */}
      {users.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <UserPlus className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">还没有关注任何人</p>
        </div>
      ) : (
        <div className="mb-8 grid gap-3 sm:grid-cols-2">
          {users.map((u: any) => (
            <Link
              key={u.id}
              to={`/user/${u.id}`}
              className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent/50"
            >
              <Avatar src={u.avatar} fallback={u.username[0]?.toUpperCase() ?? "?"} className="h-10 w-10 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{u.username}</p>
                {u.bio && <p className="truncate text-xs text-muted-foreground">{u.bio}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* 关注用户的最近文章 */}
      {items.length > 0 && (
        <>
          <h2 className="mb-4 text-lg font-semibold">关注动态</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {items.map((a: any) => (
              <Link
                key={a.id}
                to={`/article/${encodeURIComponent(a.slug)}`}
                className="group rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Avatar
                    src={a.author?.avatar}
                    fallback={a.author?.username?.[0]?.toUpperCase() ?? "?"}
                    className="h-5 w-5 shrink-0"
                  />
                  <span className="text-xs text-muted-foreground">{a.author?.username}</span>
                </div>
                <h3 className="line-clamp-2 text-sm font-medium transition-colors group-hover:text-primary">
                  {a.title}
                </h3>
                {a.excerpt && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.excerpt}</p>
                )}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
