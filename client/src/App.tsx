import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute, AdminRoute } from "@/components/ProtectedRoute";
import { SearchDialog } from "@/components/SearchDialog";

// 路由级别代码分割
const HomePage = lazy(() => import("@/pages/HomePage"));
const LoginPage = lazy(() => import("@/features/auth/LoginPage"));
const RegisterPage = lazy(() => import("@/features/auth/RegisterPage"));
const ArticlesPage = lazy(() => import("@/features/articles/ArticlesPage"));
const ArticlePage = lazy(() => import("@/features/articles/ArticlePage"));
const EditorPage = lazy(() => import("@/features/articles/EditorPage"));

const UserProfilePage = lazy(() => import("@/features/user/UserProfilePage"));
const MyArticlesPage = lazy(() => import("@/features/user/MyArticlesPage"));
const MyFavoritesPage = lazy(() => import("@/features/user/MyFavoritesPage"));
const MyFollowingPage = lazy(() => import("@/features/user/MyFollowingPage"));
const SettingsPage = lazy(() => import("@/features/user/SettingsPage"));
const DashboardPage = lazy(() => import("@/features/admin/DashboardPage"));
const ReviewPage = lazy(() => import("@/features/admin/ReviewPage"));
const ArticlesManagePage = lazy(() => import("@/features/admin/ArticlesManagePage"));
const UsersPage = lazy(() => import("@/features/admin/UsersPage"));
const AIAskPage = lazy(() => import("@/pages/AIAskPage"));

/** 路由切换时的加载占位。 */
function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
    </div>
  );
}

export default function App() {
  return (
    <>
      {/* 全局搜索弹窗 */}
      <SearchDialog />

      <Routes>
        {/* 认证页（无布局） */}
        <Route path="/login" element={<Suspense fallback={<PageLoader />}><LoginPage /></Suspense>} />
        <Route path="/register" element={<Suspense fallback={<PageLoader />}><RegisterPage /></Suspense>} />

        {/* 主应用（带布局 — 侧边栏 + 顶栏 + 内容区） */}
        <Route element={<AppLayout />}>
          <Route path="/" element={<Suspense fallback={<PageLoader />}><HomePage /></Suspense>} />
          <Route path="/articles" element={<Suspense fallback={<PageLoader />}><ArticlesPage /></Suspense>} />
          <Route path="/article/:slug" element={<Suspense fallback={<PageLoader />}><ArticlePage /></Suspense>} />

          {/* 需登录 */}
          <Route path="/editor" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><EditorPage /></Suspense></ProtectedRoute>} />
          <Route path="/editor/:id" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><EditorPage /></Suspense></ProtectedRoute>} />
          <Route path="/my/articles" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><MyArticlesPage /></Suspense></ProtectedRoute>} />
          <Route path="/my/favorites" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><MyFavoritesPage /></Suspense></ProtectedRoute>} />
          <Route path="/my/following" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><MyFollowingPage /></Suspense></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><SettingsPage /></Suspense></ProtectedRoute>} />
          <Route path="/ai/ask" element={<Suspense fallback={<PageLoader />}><AIAskPage /></Suspense>} />

          {/* 用户主页 */}
          <Route path="/user/:id" element={<Suspense fallback={<PageLoader />}><UserProfilePage /></Suspense>} />

          {/* 管理后台 */}
          <Route path="/admin" element={<AdminRoute><Suspense fallback={<PageLoader />}><DashboardPage /></Suspense></AdminRoute>} />
          <Route path="/admin/review" element={<AdminRoute><Suspense fallback={<PageLoader />}><ReviewPage /></Suspense></AdminRoute>} />
          <Route path="/admin/articles" element={<AdminRoute><Suspense fallback={<PageLoader />}><ArticlesManagePage /></Suspense></AdminRoute>} />
          <Route path="/admin/users" element={<AdminRoute><Suspense fallback={<PageLoader />}><UsersPage /></Suspense></AdminRoute>} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
