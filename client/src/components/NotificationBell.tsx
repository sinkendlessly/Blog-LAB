import { useState, useRef, useEffect } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationApi } from "@/lib/api/index";
import { useAuthStore } from "@/store/authStore";
import { cn, formatDate } from "@/lib/utils";

/** 通知铃铛：TopBar 上的图标 + 未读红点 + 下拉列表。 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthStore();
  const ref = useRef<HTMLDivElement>(null);

  // 未读数
  const { data: unread } = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () => notificationApi.unreadCount(),
    enabled: isAuthenticated,
    refetchInterval: 30000, // 每 30 秒轮询
  });

  // 通知列表
  const { data: notifications } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => notificationApi.list(10),
    enabled: open,
  });

  // 标记已读
  const markRead = useMutation({
    mutationFn: (id: number) => notificationApi.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => notificationApi.markAllRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const count = unread?.count ?? 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          if (!isAuthenticated) return;
          setOpen(!open);
          if (!open) queryClient.invalidateQueries({ queryKey: ["notifications"] });
        }}
        className="relative rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="通知"
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white leading-none">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border bg-card shadow-lg animate-in fade-in slide-in-from-top-2">
          {/* 标题栏 */}
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-sm font-semibold">通知</span>
            {count > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                全部已读
              </button>
            )}
          </div>

          {/* 列表 */}
          <div className="max-h-80 overflow-y-auto">
            {!notifications || notifications.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-muted-foreground">
                <Bell className="mb-2 h-8 w-8 opacity-30" />
                <span className="text-xs">暂无通知</span>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.is_read) markRead.mutate(n.id);
                    if (n.link) navigate(n.link);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full gap-3 border-b border-border/50 px-4 py-3 text-left transition-colors hover:bg-accent/50 last:border-b-0",
                    !n.is_read && "bg-accent/20"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {!n.is_read && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-brand" />
                      )}
                      <span className="text-xs font-medium truncate">{n.title}</span>
                    </div>
                    {n.content && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{n.content}</p>
                    )}
                    <span className="mt-1 block text-[10px] text-muted-foreground/50">
                      {formatDate(n.created_at)}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
