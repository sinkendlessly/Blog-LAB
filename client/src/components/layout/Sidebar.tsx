import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen, Home, FileText, Bookmark, Users, Search,
  PanelLeftClose, PanelLeft, PenSquare, Tag,
  FileCheck, BarChart3, FolderTree, Clock,
  Sun, Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/uiStore";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { useAuthStore } from "@/store/authStore";
import { categoryApi, tagApi } from "@/lib/api/index";
import { articleApi } from "@/lib/api/articles";

const NAV_ITEMS = [
  { to: "/", label: "发现", icon: Home },
  { to: "/articles", label: "全部文章", icon: BookOpen },
  { to: "/articles?pinned=1", label: "置顶文章", icon: FileText },
];

const MY_ITEMS = [
  { to: "/my/articles", label: "我的文章", icon: PenSquare },
  { to: "/my/favorites", label: "我的收藏", icon: Bookmark },
  { to: "/my/following", label: "我的关注", icon: Users },
];

const ADMIN_ITEMS = [
  { to: "/admin", label: "数据概览", icon: BarChart3 },
  { to: "/admin/articles", label: "文章管理", icon: FileText },
  { to: "/admin/review", label: "文章审核", icon: FileCheck },
  { to: "/admin/users", label: "用户管理", icon: Users },
];

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, theme, toggleTheme } = useUIStore();
  const { user, isAuthenticated } = useAuthStore();
  const isAdmin = user?.role === "ADMIN";
  const location = useLocation();
  const navigate = useNavigate();

  if (sidebarCollapsed) {
    return (
      <aside className="flex h-screen w-16 flex-col items-center border-r bg-card/80 py-4 backdrop-blur-sm">
        <button
          onClick={toggleSidebar}
          className="mb-6 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="展开侧边栏"
        >
          <PanelLeft className="h-5 w-5" />
        </button>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.to}
            onClick={() => navigate(item.to)}
            className={cn(
              "mb-1 rounded-lg p-2.5 transition-all",
              location.pathname === item.to
                ? "bg-accent text-accent-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
            title={item.label}
          >
            <item.icon className="h-5 w-5" />
          </button>
        ))}
        {isAdmin && (
          <>
            <hr className="my-2 w-8 border-t border-border" />
            {ADMIN_ITEMS.map((item) => (
              <button
                key={item.to}
                onClick={() => navigate(item.to)}
                className={cn(
                  "mb-1 rounded-lg p-2.5 transition-all",
                  item.to === "/admin" ? location.pathname === "/admin" : location.pathname.startsWith(item.to)
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
                title={item.label}
              >
                <item.icon className="h-5 w-5" />
              </button>
            ))}
          </>
        )}
      </aside>
    );
  }

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-card/80 backdrop-blur-sm">
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-4">
        <Link to="/" className="flex items-center gap-2.5 group">
          <img src="/logo.png" alt="Blog LAB" className="h-20 w-20" />
          <span className="text-lg font-semibold tracking-tight">Blog   LAB</span>
        </Link>
        <button
          onClick={toggleSidebar}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="收起侧边栏"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* 写文章按钮 */}
      {isAuthenticated && (
        <div className="px-3 pb-3">
          <Button asChild className="w-full justify-start gap-2 shadow-sm" size="sm">
            <Link to="/editor">
              <PenSquare className="h-4 w-4" />
              写文章
            </Link>
          </Button>
        </div>
      )}

      {/* 用户信息卡片 */}
      {isAuthenticated && user && (
        <Link
          to={`/user/${user.id}`}
          className="mx-3 mb-3 flex items-center gap-3 rounded-lg border border-border/50 bg-card/70 backdrop-blur-sm px-3 py-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent/50 hover:shadow-md"
        >
          <Avatar
            src={user.avatar}
            fallback={user.username[0]?.toUpperCase() ?? "U"}
            className="h-9 w-9 shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="truncate text-sm font-medium">{user.username}</div>
            <div className="text-[11px] text-muted-foreground">
              {user.article_count ?? 0} 文章 · {user.follower_count ?? 0} 粉丝
            </div>
          </div>
        </Link>
      )}

      {/* 导航菜单 */}
      <nav className="flex-1 overflow-y-auto px-3 scrollbar-thin">
        <NavSection title="浏览">
          {NAV_ITEMS.map((item) => {
            const [path, search] = item.to.split("?");
            const active = search
              ? location.pathname === path && location.search === `?${search}`
              : location.pathname === path;
            return <NavLink key={item.to} {...item} active={active} />;
          })}
        </NavSection>

        {isAuthenticated && (
          <NavSection title="我的空间">
            {MY_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                {...item}
                active={location.pathname.startsWith(item.to)}
              />
            ))}
          </NavSection>
        )}

        {isAdmin && (
          <NavSection title="管理后台">
            {ADMIN_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                {...item}
                active={item.to === "/admin" ? location.pathname === "/admin" : location.pathname.startsWith(item.to)}
              />
            ))}
          </NavSection>
        )}

        {/* 置顶文章 */}
        <SidebarPinned />

        {/* 分类列表 */}
        <SidebarCategories />

        {/* 标签云 */}
        <SidebarTags />

        {/* 最近文章 */}
        <SidebarRecent />
      </nav>

      {/* 底部搜索 + 主题切换 */}
      <div className="border-t p-3 space-y-2">
        <button
          onClick={() => useUIStore.getState().setSearchOpen(true)}
          className="flex w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-solid hover:bg-accent hover:text-foreground"
          style={{ borderColor: "hsl(var(--border))" }}
        >
          <Search className="h-4 w-4" />
          搜索文章
          <kbd className="ml-auto rounded border border-border bg-muted/80 px-1.5 py-0.5 text-[10px] font-medium">
          搜索
          </kbd>
        </button>

        {/* 主题切换 */}
        <button
          onClick={toggleTheme}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {theme === "dark" ? "亮色模式" : "暗色模式"}
        </button>

      </div>
    </aside>
  );
}

/* ========== 子组件 ========== */

/** 置顶文章组件。 */
function SidebarPinned() {
  const { data: pinned } = useQuery({
    queryKey: ["articles", "pinned"],
    queryFn: () => articleApi.getPinned(),
    staleTime: 10 * 60 * 1000,
  });

  if (!pinned?.length) return null;

  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center gap-1.5 px-3 py-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-600 dark:text-amber-400">📌 置顶</span>
      </div>
      <div className="space-y-0.5">
        {pinned.map((a) => (
          <Link
            key={a.id}
            to={`/article/${encodeURIComponent(a.slug)}`}
            className="group flex items-start gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-accent/60"
          >
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
            <span className="line-clamp-2 text-foreground/65 group-hover:text-foreground">{a.title}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function NavSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h4 className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        {title}
      </h4>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function NavLink({
  to, label, icon: Icon, active,
}: {
  to: string; label: string; icon: React.ComponentType<{ className?: string }>; active: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200 hover:-translate-y-0.5",
        active
          ? "bg-accent font-medium text-accent-foreground shadow-sm"
          : "text-foreground/65 hover:bg-accent/60 hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
      {active && <div className="ml-auto h-1.5 w-1.5 rounded-full" style={{ background: "hsl(var(--brand))" }} />}
    </Link>
  );
}

/** 分类列表组件。 */
function SidebarCategories() {
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoryApi.list(),
    staleTime: 10 * 60 * 1000,
  });

  if (!categories?.length) return null;

  return (
    <div className="mb-5">
      <h4 className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        <FolderTree className="h-3 w-3" />
        分类
      </h4>
      <div className="space-y-0.5">
        {categories.map((cat) => (
          <Link
            key={cat.id}
            to={`/articles?category_id=${cat.id}`}
            className="flex items-center justify-between rounded-lg px-3 py-1.5 text-sm text-foreground/65 transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent/60 hover:text-foreground"
          >
            <span>{cat.name}</span>
            <span className="text-xs text-muted-foreground/60">{cat.article_count}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** 标签云组件。 */
function SidebarTags() {
  const { data: tags } = useQuery({
    queryKey: ["tags"],
    queryFn: () => tagApi.list(),
    staleTime: 10 * 60 * 1000,
  });

  if (!tags?.length) return null;

  return (
    <div className="mb-5">
      <h4 className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        <Tag className="h-3 w-3" />
        标签
      </h4>
      <div className="flex flex-wrap gap-1.5 px-2 py-1">
        {tags.slice(0, 20).map((t) => (
          <Link
            key={t.id}
            to={`/articles?tag_id=${t.id}`}
            className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground transition-colors hover:bg-accent"
          >
            {t.name}
            <span className="text-[10px] text-muted-foreground/60">{t.article_count}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** 最近文章组件。 */
function SidebarRecent() {
  const { data: articlesData } = useQuery({
    queryKey: ["articles", "sidebar-recent"],
    queryFn: () => articleApi.list({ limit: 5 }),
    staleTime: 5 * 60 * 1000,
  });

  const articles = articlesData?.items ?? [];

  if (!articles.length) return null;

  return (
    <div className="mb-5">
      <h4 className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        <Clock className="h-3 w-3" />
        最近更新
      </h4>
      <div className="space-y-0.5">
        {articles.map((a) => (
          <Link
            key={a.id}
            to={`/article/${encodeURIComponent(a.slug)}`}
            className="block truncate rounded-lg px-3 py-1.5 text-sm text-foreground/65 transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent/60 hover:text-foreground"
            title={a.title}
          >
            {a.title}
          </Link>
        ))}
      </div>
    </div>
  );
}

