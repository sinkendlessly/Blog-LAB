import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FileText, Bookmark, Users as UsersIcon } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArticleCard } from "@/components/ArticleCard";
import { userApi } from "@/lib/api/index";
import { articleApi } from "@/lib/api/articles";
import { interactionApi } from "@/lib/api/index";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/components/ui/toast";
import { useState } from "react";
import { cn, formatCount } from "@/lib/utils";

type Tab = "articles" | "favorites" | "following";

/** 用户个人主页。 */
export default function UserProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user: me, isAuthenticated } = useAuthStore();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("articles");

  const userId = Number(id);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["user", userId],
    queryFn: () => userApi.get(userId),
    enabled: !!userId,
  });

  const { data: articles } = useQuery({
    queryKey: ["articles", "user", userId],
    queryFn: () => articleApi.list({ author_id: userId, limit: 20 }),
    enabled: tab === "articles",
  });

  const { data: favorites } = useQuery({
    queryKey: ["favorites", userId],
    queryFn: () => interactionApi.myFavorites(),
    enabled: tab === "favorites" && isAuthenticated,
  });

  const { data: following } = useQuery({
    queryKey: ["following", userId],
    queryFn: () => userApi.following(userId),
    enabled: tab === "following",
  });

  const [isFollowing, setIsFollowing] = useState(false);
  const isMe = me?.id === userId;

  const handleFollow = async () => {
    if (!isAuthenticated) {
      toast("请先登录", "default");
      return;
    }
    try {
      const res = await userApi.toggleFollow(userId);
      setIsFollowing(res.following);
    } catch {
      toast("操作失败", "error");
    }
  };

  if (isLoading || !profile) {
    return <div className="mx-auto max-w-4xl px-6 py-20 text-center text-muted-foreground">加载中...</div>;
  }

  const tabs: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "articles", label: "文章", icon: FileText },
    { key: "favorites", label: "收藏", icon: Bookmark },
    { key: "following", label: "关注", icon: UsersIcon },
  ];

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* 个人信息区 */}
      <div className="mb-8 flex items-start gap-6">
        <Avatar
          src={profile.avatar}
          fallback={profile.username.slice(0, 2).toUpperCase()}
          className="h-20 w-20 text-2xl"
        />
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{profile.username}</h1>
          {profile.bio && <p className="mt-1 text-muted-foreground">{profile.bio}</p>}
          <div className="mt-3 flex items-center gap-6 text-sm text-muted-foreground">
            <span><strong className="text-foreground">{formatCount(profile.article_count ?? 0)}</strong> 文章</span>
            <span><strong className="text-foreground">{formatCount(profile.total_views ?? 0)}</strong> 阅读</span>
            <span><strong className="text-foreground">{formatCount(profile.total_likes ?? 0)}</strong> 获赞</span>
            <span><strong className="text-foreground">{formatCount(profile.follower_count ?? 0)}</strong> 粉丝</span>
            <span><strong className="text-foreground">{formatCount(profile.following_count ?? 0)}</strong> 关注</span>
          </div>
        </div>
        {!isMe && isAuthenticated && (
          <Button
            variant={isFollowing ? "outline" : "default"}
            onClick={handleFollow}
            size="sm"
          >
            {isFollowing ? "已关注" : "关注"}
          </Button>
        )}
        {isMe && (
          <Link to="/settings">
            <Button variant="outline" size="sm">编辑资料</Button>
          </Link>
        )}
      </div>

      {/* Tab 切换 */}
      <div className="mb-6 flex gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      {tab === "articles" && (
        <div className="space-y-4">
          {articles?.items?.length ? (
            articles.items.map((a) => <ArticleCard key={a.id} article={a} horizontal />)
          ) : (
            <p className="py-10 text-center text-muted-foreground">暂无文章</p>
          )}
        </div>
      )}

      {tab === "favorites" && (
        <div className="space-y-4">
          {(favorites as any[])?.length ? (
            (favorites as any[]).map((a: any) => (
              <ArticleCard key={a.id} article={a} horizontal />
            ))
          ) : (
            <p className="py-10 text-center text-muted-foreground">暂无收藏</p>
          )}
        </div>
      )}

      {tab === "following" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {following?.length ? (
            following.map((u) => (
              <Link
                key={u.id}
                to={`/user/${u.id}`}
                className="flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50"
              >
                <Avatar src={u.avatar} fallback={u.username[0]} className="h-10 w-10" />
                <div>
                  <div className="font-medium">{u.username}</div>
                  {u.bio && <div className="text-xs text-muted-foreground">{u.bio}</div>}
                </div>
              </Link>
            ))
          ) : (
            <p className="col-span-2 py-10 text-center text-muted-foreground">暂无关注</p>
          )}
        </div>
      )}
    </div>
  );
}
