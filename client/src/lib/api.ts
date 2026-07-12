import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import type { ApiError } from "@/types";
import { useAuthStore } from "@/store/authStore";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  withCredentials: true, // 携带 refresh token cookie
});

// 请求拦截：从 Zustand store 读取 access token（每个标签页独立）
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 刷新锁，避免并发刷新
let isRefreshing = false;
let pendingQueue: Array<(token: string | null) => void> = [];

function flushQueue(token: string | null) {
  pendingQueue.forEach((cb) => cb(token));
  pendingQueue = [];
}

// 响应拦截：401 自动刷新
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<ApiError>) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // 非 401 或已重试过，直接抛出
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    // 登录/刷新接口本身 401，不自动刷新
    if (original.url?.includes("/auth/login") || original.url?.includes("/auth/refresh")) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      // 排队等待新 token
      return new Promise((resolve, reject) => {
        pendingQueue.push((token) => {
          if (!token) return reject(error);
          original.headers!.Authorization = `Bearer ${token}`;
          resolve(api(original));
        });
      });
    }

    original._retry = true;
    isRefreshing = true;
    try {
      const { data } = await axios.post(
        `${BASE_URL}/auth/refresh`,
        {},
        { withCredentials: true }
      );
      const newToken = data.access_token;
      // 拿到新 token 后重新获取用户信息，避免 refresh cookie 与 store 用户不一致
      const { data: userData } = await axios.get(
        `${BASE_URL}/auth/me`,
        { headers: { Authorization: `Bearer ${newToken}` } }
      );
      useAuthStore.getState().setAuth(userData, newToken);
      flushQueue(newToken);
      original.headers!.Authorization = `Bearer ${newToken}`;
      return api(original);
    } catch (refreshErr) {
      flushQueue(null);
      useAuthStore.getState().logout();
      // 跳转登录
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  }
);

/** 提取后端错误信息。 */
export function getApiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as any;
    // FastAPI 422 校验错误
    if (data?.detail && Array.isArray(data.detail)) {
      return data.detail.map((d: any) => d.msg).join("；");
    }
    return data?.message || data?.detail || err.message || "请求失败";
  }
  return "未知错误";
}
