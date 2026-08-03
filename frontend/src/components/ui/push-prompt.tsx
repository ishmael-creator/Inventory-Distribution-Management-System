"use client";

import { useState, useEffect } from "react";
import { BellRing, X } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";

export function PushPrompt() {
  const [isVisible, setIsVisible] = useState(false);
  const { accessToken, userRole } = useAuthStore();

  useEffect(() => {
    // Only show if logged in, push API is supported, and they haven't explicitly denied/accepted yet
    if (accessToken && "Notification" in window) {
      if (Notification.permission === "default") {
        // Delay showing it for 5 seconds so it doesn't interrupt their immediate login flow
        const timer = setTimeout(() => setIsVisible(true), 5000);
        return () => clearTimeout(timer);
      }
    }
  }, [accessToken]);

  const handleAllow = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        // Here you would trigger your existing pushHelper logic to register the service worker 
        // and send the subscription to your backend /notifications/push/subscribe endpoint
        setIsVisible(false);
      } else {
        setIsVisible(false);
      }
    } catch (error) {
      console.error("Failed to request push permissions", error);
    }
  };

  if (!isVisible) return null;

  // Custom text based on role
  const message = userRole === "HUB_OFFICER" 
    ? "Get instantly notified when trucks are dispatched to your hub."
    : "Enable notifications to get real-time alerts on your active operations.";

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 bg-brand text-white p-4 rounded-xl shadow-2xl z-[90] animate-in slide-in-from-bottom-10">
      <div className="flex items-start gap-3">
        <div className="bg-white/20 p-2 rounded-full shrink-0">
          <BellRing className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-sm">Enable Push Notifications</h3>
          <p className="text-xs text-brand-50 mt-1">{message}</p>
          <div className="flex gap-2 mt-3">
            <button 
              onClick={handleAllow}
              className="bg-white text-brand text-xs font-bold px-4 py-2 rounded-md hover:bg-slate-100 transition-colors"
            >
              Allow Notifications
            </button>
            <button 
              onClick={() => setIsVisible(false)}
              className="bg-transparent text-white border border-white/30 text-xs font-bold px-4 py-2 rounded-md hover:bg-white/10 transition-colors"
            >
              Maybe Later
            </button>
          </div>
        </div>
        <button onClick={() => setIsVisible(false)} className="text-white/60 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}