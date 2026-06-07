import axios from "axios";
import { useAuthStore } from "@/stores/auth-store";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1",
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach the token to every request
api.interceptors.request.use((config) => {
  // THE FIX: Changed 'token' to 'accessToken'
  const accessToken = useAuthStore.getState().accessToken;
  if (accessToken && config.headers) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Listen for 401 errors and force a redirect
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // THE FIX: Changed 'token' to 'accessToken'
      useAuthStore.setState({ 
        accessToken: null, 
        userId: null, 
        userRole: null, 
        isOverrideEnabled: false 
      });
      
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);