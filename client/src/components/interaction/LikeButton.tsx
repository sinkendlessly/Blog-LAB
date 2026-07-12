import { useState, useRef } from "react";
import { Heart } from "lucide-react";
import { cn, formatCount } from "@/lib/utils";
import { interactionApi } from "@/lib/api/index";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/components/ui/toast";

interface LikeButtonProps {
  articleId: number;
  initialLiked?: boolean;
  count?: number;
  className?: string;
  size?: "sm" | "default";
}

const COOLDOWN_MS = 1500;

/** 点赞按钮，心跳动画 + 计数。 */
export function LikeButton({
  articleId,
  initialLiked = false,
  count = 0,
  className,
  size = "default",
}: LikeButtonProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [currentCount, setCurrentCount] = useState(count);
  const [animating, setAnimating] = useState(false);
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
    // 请求中或冷却中，直接忽略
    if (pendingRef.current || cooldownRef.current) return;
    pendingRef.current = true;
    setPending(true);
    try {
      const res = await interactionApi.toggleLike(articleId);
      setLiked(res.liked);
      if (res.like_count !== undefined) {
        setCurrentCount(res.like_count);
      } else {
        setCurrentCount((c) => (res.liked ? c + 1 : Math.max(0, c - 1)));
      }
      if (res.liked) {
        setAnimating(true);
        setTimeout(() => setAnimating(false), 400);
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
        liked
          ? "text-red-500 hover:text-red-600"
          : "text-muted-foreground hover:text-foreground",
        animating && "animate-heartbeat",
        pending && "opacity-50",
        className
      )}
    >
      <Heart
        className={cn(
          size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4",
          liked && "fill-current"
        )}
      />
      <span>{formatCount(currentCount)}</span>
    </button>
  );
}
