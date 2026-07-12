import { Outlet, Link, useLocation } from "react-router-dom";
import { BarChart3, FileCheck, Users, ArrowLeft, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";

const NAV_ITEMS = [
  { to: "/admin", label: "数据概览", icon: BarChart3, exact: true },
  { to: "/admin/review", label: "文章审核", icon: FileCheck },
  { to: "/admin/users", label: "用户管理", icon: Users },
];

/** 管理后台布局：左侧菜单 + 内容区。 */
export default function AdminLayout() {
  const location = useLocation();
  const { user } = useAuthStore();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* 左侧菜单 */}
      <aside className="flex w-56 flex-col border-r bg-card">
        <div className="flex items-center gap-2 border-b px-5 py-4">
          <Shield className="h-5 w-5 text-primary" />
          <span className="font-semibold">管理后台</span>
        </div>

        <nav className="flex-1 space-y-0.5 px-3 py-3">
          {NAV_ITEMS.map((item) => {
            const active = item.exact
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t p-3">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            返回主站
          </Link>
        </div>
      </aside>

      {/* 内容区 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-between border-b px-6">
          <h2 className="font-semibold">管理后台</h2>
          <span className="text-sm text-muted-foreground">{user?.username}</span>
        </header>
        <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
