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
  userId: string | null;
  email: string | null;
  mustChangePassword: boolean; // THE FIX: Added to track password reset penalty box
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
      email: null,
      mustChangePassword: false,
      isOverrideEnabled: false,
      setAccessToken: (token) => {
        const decoded = token ? parseJwt(token) : null;
        set({ 
          accessToken: token, 
          userRole: decoded?.role || null, 
          userId: decoded?.sub || null,
          email: decoded?.email || null,
          mustChangePassword: decoded?.must_change_password || false, // THE FIX: Read flag from JWT
          isOverrideEnabled: false 
        });
      },
      setOverrideEnabled: (enabled) => set({ isOverrideEnabled: enabled }),
    }),
    { name: "inventory-auth" },
  ),
);