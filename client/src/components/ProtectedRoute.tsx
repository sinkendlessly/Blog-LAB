import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

/** 路由守卫：未登录跳转登录页。 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

/** 管理员路由守卫。 */
export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (user?.role !== "ADMIN") {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
