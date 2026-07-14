import { api } from "@/lib/api";
import type {
  Article, ArticleBrief, ArticleIndexItem, ArchiveItem, PageResponse,
} from "@/types";

export interface ArticleListParams {
  cursor?: string;
  category_id?: number;
  tag_id?: number;
  author_id?: number;
  limit?: number;
}

export const articleApi = {
  list: (params: ArticleListParams = {}) =>
    api.get<PageResponse<ArticleBrief>>("/articles", { params }).then((r) => r.data),

  index: () =>
    api.get<ArticleIndexItem[]>("/articles/index").then((r) => r.data),

  archive: () =>
    api.get<ArchiveItem[]>("/articles/archive").then((r) => r.data),

  getBySlug: (slug: string) =>
    api.get<Article>(`/articles/${slug}`).then((r) => r.data),

  getById: (id: number) =>
    api.get<Article>(`/articles/${id}`).then((r) => r.data),

  create: (data: {
    title: string; content: string; excerpt?: string; cover_image?: string;
    category_id?: number; tag_ids?: number[]; status?: string;
  }) => api.post<Article>("/articles", data).then((r) => r.data),

  update: (id: number, data: Partial<{
    title: string; content: string; excerpt?: string; cover_image?: string;
    category_id?: number; tag_ids?: number[]; status?: string;
  }>) => api.put<Article>(`/articles/${id}`, data).then((r) => r.data),

  remove: (id: number) => api.delete(`/articles/${id}`).then((r) => r.data),

  myDrafts: (params: { cursor?: string; status?: string; limit?: number } = {}) =>
    api.get<PageResponse<ArticleBrief>>("/articles/me/drafts", { params }).then((r) => r.data),

  suggestTags: (title: string, content?: string) =>
    api.post<{ category_id: number | null; tag_ids: number[] }>("/articles/suggest-tags", { title, content }).then((r) => r.data),

  getRelated: (slug: string) =>
    api.get<RelatedArticle[]>(`/articles/${slug}/related`).then((r) => r.data),

  getFollowing: (limit = 20) =>
    api.get<ArticleBrief[]>("/articles/following", { params: { limit } }).then((r) => r.data),

  getPinned: () =>
    api.get<ArticleBrief[]>("/articles/pinned").then((r) => r.data),

  getRecommended: (slug: string) =>
    api.get<ArticleBrief[]>(`/articles/${slug}/recommend`).then((r) => r.data),
};

export interface RelatedArticle {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  views: number;
  published_at: string | null;
  author: { id: number; username: string; avatar: string | null } | null;
}
