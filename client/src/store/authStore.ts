import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { User } from "@/types";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, token: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
}

/** 每个标签页独立登录，使用 sessionStorage（关闭标签页自动清除）。 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      setAuth: (user, token) => {
        set({ user, accessToken: token, isAuthenticated: true });
      },
      setUser: (user) => set({ user }),
      logout: () => {
        set({ user: null, accessToken: null, isAuthenticated: false });
      },
    }),
    {
      name: "blogshare-auth",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.accessToken) {
          state.isAuthenticated = true;
        }
      },
    }
  )
);
