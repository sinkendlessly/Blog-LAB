import { useState, useRef } from "react";
import { Bookmark } from "lucide-react";
import { cn, formatCount } from "@/lib/utils";
import { interactionApi } from "@/lib/api/index";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/components/ui/toast";

interface FavoriteButtonProps {
  articleId: number;
  initialFavorited?: boolean;
  count?: number;
  className?: string;
  size?: "sm" | "default";
}

const COOLDOWN_MS = 1500;

/** 收藏按钮，星标填充动画 + 计数。 */
export function FavoriteButton({
  articleId,
  initialFavorited = false,
  count = 0,
  className,
  size = "default",
}: FavoriteButtonProps) {
  const [favorited, setFavorited] = useState(initialFavorited);
  const [currentCount, setCurrentCount] = useState(count);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const cooldownRef = useRef(false);
  const { isAuthenticated } = useAuthStore();
  const { toast } = useToast();

  const handleClick = async () => {
    if (!isAuthenticated) {
      toast("请先登录", "default");
      return;
    }
    if (pendingRef.current || cooldownRef.current) return;
    pendingRef.current = true;
    setPending(true);
    try {
      const res = await interactionApi.toggleFavorite(articleId);
      setFavorited(res.favorited);
      if (res.favorite_count !== undefined) {
        setCurrentCount(res.favorite_count);
      } else {
        setCurrentCount((c) => (res.favorited ? c + 1 : Math.max(0, c - 1)));
      }
    } catch (err: any) {
      if (err?.response?.status === 429) {
        cooldownRef.current = true;
        setTimeout(() => { cooldownRef.current = false; }, 3000);
        return;
      }
      const msg = err?.response?.data?.message || "操作失败";
      toast(msg, "error");
    } finally {
      pendingRef.current = false;
      setPending(false);
      cooldownRef.current = true;
      setTimeout(() => { cooldownRef.current = false; }, COOLDOWN_MS);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className={cn(
        "inline-flex items-center gap-1 rounded-full transition-colors disabled:cursor-not-allowed",
        size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm",
        favorited
          ? "text-amber-500 hover:text-amber-600"
          : "text-muted-foreground hover:text-foreground",
        pending && "opacity-50",
        className
      )}
    >
      <Bookmark
        className={cn(
          size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4",
          favorited && "fill-current"
        )}
      />
      <span>{formatCount(currentCount)}</span>
    </button>
  );
}
