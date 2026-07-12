import { useQuery } from "@tanstack/react-query";
import { Bookmark, Loader2 } from "lucide-react";
import { ArticleCard } from "@/components/ArticleCard";
import { interactionApi } from "@/lib/api/index";

/** 我的收藏。 */
export default function MyFavoritesPage() {
  const { data: favorites, isLoading } = useQuery({
    queryKey: ["my-favorites"],
    queryFn: () => interactionApi.myFavorites(),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const items = (favorites as any[]) ?? [];

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-bold">我的收藏</h1>

      {items.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <Bookmark className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">暂无收藏文章</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((a: any) => (
            <ArticleCard key={a.id} article={a} horizontal />
          ))}
        </div>
      )}
    </div>
  );
}
