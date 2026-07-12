/** 全局类型定义。 */

export interface User {
  id: number;
  username: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  bio: string | null;
  role: "USER" | "ADMIN";
  is_active: boolean;
  is_super_admin?: boolean;
  created_at: string;
  article_count?: number;
  follower_count?: number;
  following_count?: number;
  total_views?: number;
  total_likes?: number;
}

export interface UserBrief {
  id: number;
  username: string;
  phone: string | null;
  avatar: string | null;
  bio: string | null;
}

export interface Tag {
  id: number;
  name: string;
  slug: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  parent_id: number | null;
  sort_order: number;
}

export type ArticleStatus = "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "REJECTED";

export interface Article {
  id: number;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  cover_image: string | null;
  status: ArticleStatus;
  views: number;
  author: UserBrief;
  category: Category | null;
  tags: Tag[];
  created_at: string;
  updated_at: string;
  published_at: string | null;
  is_liked?: boolean;
  is_favorited?: boolean;
  like_count?: number;
  favorite_count?: number;
  comment_count?: number;
}

export interface ArticleBrief {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image: string | null;
  status?: ArticleStatus;
  views: number;
  author: UserBrief;
  category: Category | null;
  tags: Tag[];
  created_at: string;
  published_at: string | null;
  like_count?: number;
  favorite_count?: number;
}

export interface ArticleIndexItem {
  id: number;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  author: UserBrief;
  tags: Tag[];
  created_at: string;
}

export interface Comment {
  id: number;
  content: string;
  article_id: number;
  user: UserBrief;
  parent_id: number | null;
  created_at: string;
  updated_at: string;
  replies: Comment[];
  like_count?: number;
  is_liked?: boolean;
}

export interface PageMeta {
  next_cursor: string | null;
  has_more: boolean;
  total?: number;
}

export interface PageResponse<T> {
  items: T[];
  meta: PageMeta;
}

export interface ApiError {
  code: string;
  message: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface ArchiveItem {
  year: number;
  month: number;
  count: number;
}

export interface NotificationItem {
  id: number;
  user_id: number;
  actor: { id: number; username: string; avatar: string | null } | null;
  type: string;
  title: string;
  content: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface UnreadCount {
  count: number;
}
