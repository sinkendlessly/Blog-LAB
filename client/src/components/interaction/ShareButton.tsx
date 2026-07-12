import { useState } from "react";
import { Share2, Link2, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { interactionApi } from "@/lib/api/index";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/components/ui/toast";

const SHARE_PLATFORMS = [
  { key: "weibo", label: "微博", url: (slug: string) => `https://service.weibo.com/share/share.php?url=${encodeURIComponent(window.location.origin + "/article/" + encodeURIComponent(slug))}` },
  { key: "twitter", label: "Twitter", url: (slug: string) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(window.location.origin + "/article/" + encodeURIComponent(slug))}` },
  { key: "link", label: "复制链接", url: null },
] as const;

interface ShareButtonProps {
  articleId: number;
  slug: string;
  className?: string;
  size?: "sm" | "default";
}

/** 分享下拉菜单。 */
export function ShareButton({ articleId, slug, className, size = "default" }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const { isAuthenticated } = useAuthStore();
  const { toast } = useToast();

  const handleShare = async (platform: typeof SHARE_PLATFORMS[number]) => {
    // 记录分享行为
    if (isAuthenticated) {
      try {
        await interactionApi.recordShare(articleId, platform.key);
      } catch {
        // 静默失败
      }
    }

    if (platform.key === "link") {
      // 复制链接
      try {
        await navigator.clipboard.writeText(window.location.origin + "/article/" + encodeURIComponent(slug));
        toast("链接已复制", "success");
      } catch {
        toast("复制失败", "error");
      }
    } else if (platform.url) {
      window.open(platform.url(slug), "_blank", "width=600,height=400");
    }
    setOpen(false);
  };

  return (
    <div className={cn("relative", className)}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center gap-1 rounded-full text-muted-foreground transition-colors hover:text-foreground",
          size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"
        )}
      >
        <Share2 className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
        分享
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 min-w-[140px] rounded-lg border bg-card py-1 shadow-lg animate-in zoom-in-95">
            {SHARE_PLATFORMS.map((p) => (
              <button
                key={p.key}
                onClick={() => handleShare(p)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors"
              >
                {p.key === "link" ? (
                  <Link2 className="h-4 w-4" />
                ) : (
                  <MessageCircle className="h-4 w-4" />
                )}
                {p.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
