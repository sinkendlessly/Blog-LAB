import { api } from "@/lib/api";
import type { Comment, User, UserBrief, ArticleBrief, NotificationItem, UnreadCount } from "@/types";

export const commentApi = {
  create: (articleId: number, content: string, parentId?: number) =>
    api
      .post<Comment>("/comments", { content, parent_id: parentId ?? null }, {
        params: { article_id: articleId },
      })
      .then((r) => r.data),

  list: (articleId: number, sort?: string) =>
    api.get<Comment[]>("/comments", { params: { article_id: articleId, sort: sort ?? "latest" } }).then((r) => r.data),

  remove: (id: number) => api.delete(`/comments/${id}`).then((r) => r.data),

  toggleLike: (commentId: number) =>
    api.post<{ liked: boolean; like_count: number }>(`/comments/${commentId}/like`).then((r) => r.data),
};

export const interactionApi = {
  toggleLike: (articleId: number) =>
    api.post<{ liked: boolean; like_count: number }>(`/interactions/articles/${articleId}/like`).then((r) => r.data),

  toggleFavorite: (articleId: number) =>
    api.post<{ favorited: boolean; favorite_count: number }>(`/interactions/articles/${articleId}/favorite`).then((r) => r.data),

  recordShare: (articleId: number, platform: string) =>
    api.post(`/interactions/articles/${articleId}/share`, null, {
      params: { platform },
    }).then((r) => r.data),

  myFavorites: () =>
    api.get("/interactions/me/favorites").then((r) => r.data),
};

export const userApi = {
  get: (id: number) => api.get<User>(`/users/${id}`).then((r) => r.data),

  updateMe: (data: { username?: string; avatar?: string; bio?: string }) =>
    api.put<User>("/users/me", data).then((r) => r.data),

  bindPhone: (phone: string, code: string) =>
    api.put<User>("/users/me/phone", { phone, code }).then((r) => r.data),

  toggleFollow: (userId: number) =>
    api.post<{ following: boolean }>(`/users/${userId}/follow`).then((r) => r.data),

  following: (userId: number) =>
    api.get<UserBrief[]>(`/users/${userId}/following`).then((r) => r.data),

  followers: (userId: number) =>
    api.get<UserBrief[]>(`/users/${userId}/followers`).then((r) => r.data),
};

export const searchApi = {
  hot: (limit = 10) =>
    api.get("/search/hot", { params: { limit } }).then((r) => r.data),

  archive: () => api.get("/search/archive").then((r) => r.data),

  search: (q: string, limit = 20) =>
    api.get<ArticleBrief[]>("/search", { params: { q, limit } }).then((r) => r.data),
};

export interface CategoryWithCount {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  article_count: number;
}

export interface TagWithCount {
  id: number;
  name: string;
  slug: string;
  article_count: number;
}

export const categoryApi = {
  list: () => api.get<CategoryWithCount[]>("/categories").then((r) => r.data),
};

export const tagApi = {
  list: () => api.get<TagWithCount[]>("/tags").then((r) => r.data),
};

export const uploadApi = {
  image: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<{ url: string; filename: string }>("/upload", form).then((r) => r.data);
  },
};

export const notificationApi = {
  list: (limit = 20, offset = 0) =>
    api.get<NotificationItem[]>("/notifications", { params: { limit, offset } }).then((r) => r.data),
  unreadCount: () =>
    api.get<UnreadCount>("/notifications/unread-count").then((r) => r.data),
  markRead: (id: number) =>
    api.put(`/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () =>
    api.put("/notifications/read-all").then((r) => r.data),
};

export const adminApi = {
  statsOverview: () => api.get("/admin/stats/overview").then((r) => r.data),

  statsTrend: (days = 30) =>
    api.get("/admin/stats/trend", { params: { days } }).then((r) => r.data),

  pendingArticles: (limit = 50) =>
    api.get("/admin/articles/pending", { params: { limit } }).then((r) => r.data),

  reviewArticle: (articleId: number, action: "approve" | "reject") =>
    api.post(`/admin/articles/${articleId}/review`, null, { params: { action } }).then((r) => r.data),

  listUsers: (limit = 100, offset = 0) =>
    api.get("/admin/users", { params: { limit, offset } }).then((r) => r.data),

  setUserStatus: (userId: number, isActive: boolean) =>
    api.put(`/admin/users/${userId}/status`, null, { params: { is_active: isActive } }).then((r) => r.data),

  setUserRole: (userId: number, role: string) =>
    api.put(`/admin/users/${userId}/role`, null, { params: { role } }).then((r) => r.data),

  deleteUser: (userId: number) =>
    api.delete(`/admin/users/${userId}`).then((r) => r.data),

  togglePin: (articleId: number) =>
    api.post<{ is_pinned: boolean }>(`/admin/articles/${articleId}/pin`).then((r) => r.data),

  // ═══ 文章管理 ═══
  listArticles: (params?: { status?: string; search?: string; limit?: number; offset?: number }) =>
    api.get<any[]>("/admin/articles", { params }).then((r) => r.data),

  getArticle: (id: number) =>
    api.get<any>(`/admin/articles/${id}`).then((r) => r.data),

  updateArticle: (id: number, data: any) =>
    api.put<any>(`/admin/articles/${id}`, data).then((r) => r.data),

  deleteArticle: (id: number) =>
    api.delete(`/admin/articles/${id}`).then((r) => r.data),

  refreshRanking: () =>
    api.post("/admin/ranking/refresh").then((r) => r.data),
};
