import { Link, useNavigate } from "react-router-dom";
import { Search, LogIn, UserCircle, LogOut, Settings, Shield } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dropdown, DropdownItem, DropdownSeparator,
} from "@/components/ui/dropdown";
import { NotificationBell } from "@/components/NotificationBell";
import { authApi } from "@/lib/api/auth";
import { useToast } from "@/components/ui/toast";

export function TopBar() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const { setSearchOpen } = useUIStore();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // 忽略后端错误，前端仍清理本地状态
    }
    logout();
    toast("已退出登录", "success");
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b px-6 bg-background/70 backdrop-blur-lg">
      {/* 搜索框 — Spotlight 风格触发器 */}
      <button
        onClick={() => setSearchOpen(true)}
        className="flex w-full max-w-md items-center gap-2.5 rounded-xl border border-dashed px-4 py-2 text-sm text-muted-foreground/70 transition-all hover:border-solid hover:border-border hover:bg-muted/40 hover:text-muted-foreground"
        style={{ borderColor: "hsl(var(--border))" }}
      >
        <Search className="h-4 w-4" />
        <span>搜索文章、作者、标签...</span>
        <kbd className="ml-auto rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/60">
          ⌘K
        </kbd>
      </button>

      {/* 右侧操作 */}
      <div className="flex items-center gap-1">
        {isAuthenticated && <NotificationBell />}

        {isAuthenticated && user ? (
          <Dropdown
            trigger={
              <button className="flex items-center gap-2 rounded-full p-0.5 pr-3 transition-all hover:bg-accent">
                <Avatar
                  src={user.avatar}
                  fallback={user.username.slice(0, 2).toUpperCase()}
                  className="h-8 w-8 ring-2 ring-background"
                />
                <span className="text-sm font-medium">{user.username}</span>
              </button>
            }
          >
            <DropdownItem onClick={() => navigate(`/user/${user.id}`)}>
              <UserCircle className="mr-2 h-4 w-4" />
              个人主页
            </DropdownItem>
            <DropdownItem onClick={() => navigate("/settings")}>
              <Settings className="mr-2 h-4 w-4" />
              设置
            </DropdownItem>
            {user.role === "ADMIN" && (
              <DropdownItem onClick={() => navigate("/admin")}>
                <Shield className="mr-2 h-4 w-4" />
                后台管理
              </DropdownItem>
            )}
            <DropdownSeparator />
            <DropdownItem onClick={handleLogout} className="text-red-600">
              <LogOut className="mr-2 h-4 w-4" />
              退出登录
            </DropdownItem>
          </Dropdown>
        ) : (
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/login">
                <LogIn className="mr-1 h-4 w-4" />
                登录
              </Link>
            </Button>
            <Button size="sm" asChild className="shadow-sm">
              <Link to="/register">注册</Link>
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
