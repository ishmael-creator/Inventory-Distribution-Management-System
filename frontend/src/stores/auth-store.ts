import { create } from "zustand";
import { persist } from "zustand/middleware";

function parseJwt(token: string) {
  try {
    if (typeof window === "undefined") return null;
    return JSON.parse(atob(token.split('.')[1]));
  } catch (e) {
    return null;
  }
}

type AuthState = {
  accessToken: string | null;
  userRole: string | null;
  userId: string | null; // NEW: Track the specific user's ID
  isOverrideEnabled: boolean;
  setAccessToken: (token: string | null) => void;
  setOverrideEnabled: (enabled: boolean) => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      userRole: null,
      userId: null,
      isOverrideEnabled: false,
      setAccessToken: (token) => {
        const decoded = token ? parseJwt(token) : null;
        set({ 
          accessToken: token, 
          userRole: decoded?.role || null, 
          userId: decoded?.sub || null, // 'sub' is the standard JWT field for User ID
          isOverrideEnabled: false 
        });
      },
      setOverrideEnabled: (enabled) => set({ isOverrideEnabled: enabled }),
    }),
    { name: "inventory-auth" },
  ),
);