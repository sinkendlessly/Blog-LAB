import { api } from "@/lib/api";
import type { LoginResponse, User } from "@/types";

export const authApi = {
  register: (data: { username: string; email: string; password: string }) =>
    api.post<User>("/auth/register", data).then((r) => r.data),

  login: (data: { account: string; password: string }) =>
    api.post<LoginResponse>("/auth/login", data).then((r) => r.data),

  logout: () => api.post("/auth/logout").then((r) => r.data),

  getMe: () => api.get<User>("/auth/me").then((r) => r.data),

  changePassword: (data: { old_password: string; new_password: string }) =>
    api.put("/auth/me/password", data).then((r) => r.data),

  // 短信验证码
  sendSmsCode: (phone: string) =>
    api.post("/auth/sms/send", { phone }).then((r) => r.data),

  loginBySms: (data: { phone: string; code: string }) =>
    api.post<LoginResponse>("/auth/sms/login", data).then((r) => r.data),

  registerBySms: (data: { phone: string; code: string; username: string; password: string }) =>
    api.post<LoginResponse>("/auth/sms/register", data).then((r) => r.data),
};
