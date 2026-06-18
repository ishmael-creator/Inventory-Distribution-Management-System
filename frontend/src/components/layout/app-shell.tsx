"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, type FormEvent, useEffect, useRef } from "react";
import { LogOut, ShieldAlert, KeyRound, CheckCircle2, Bell, CheckCheck, Inbox, ChevronDown, ChevronUp, Settings2 } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";

function timeAgo(dateString: string) {
  const date = new Date(dateString);
  const diffMins = Math.floor((new Date().getTime() - date.getTime()) / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return `${Math.floor(diffMins / 1440)}d ago`;
}

type Notification = {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

export function AppShell({ title, description, children }: { title: string; description: string; children: ReactNode; }) {
  const router = useRouter();
  const { accessToken, userRole, email, mustChangePassword, isOverrideEnabled, setAccessToken, setOverrideEnabled } = useAuthStore();
  
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [expandedNotifs, setExpandedNotifs] = useState<Set<string>>(new Set());

  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const userInitial = email ? email.charAt(0).toUpperCase() : "U";

  useEffect(() => {
    if (!accessToken || mustChangePassword) return;
    const fetchNotifications = async () => {
      try {
        const response = await api.get<Notification[]>("/notifications");
        setNotifications(response.data);
      } catch (err) {
        console.error("Failed to fetch notifications", err);
      }
    };
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [accessToken, mustChangePassword]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) setIsNotifOpen(false);
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) setIsUserMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = () => {
    setAccessToken(null);
    useAuthStore.setState({ userId: null, userRole: null, isOverrideEnabled: false, mustChangePassword: false });
    router.push("/login");
  };

  const markAsRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    } catch (err) {
      console.error(err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.post("/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      console.error(err);
    }
  };

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNotifs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  const handlePasswordReset = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) return setError("New passwords do not match.");
    if (newPassword.length < 8) return setError("Password must be at least 8 characters long.");
    setIsSubmitting(true);
    try {
      const response = await api.post<{ access_token: string }>("/auth/change-password", { 
        old_password: oldPassword.trim(), // ✅ THE FIX: Destroys invisible copied spaces!
        new_password: newPassword 
      });
      setAccessToken(response.data.access_token);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to update password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (mustChangePassword) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#eef2f6] px-4">
        <form onSubmit={handlePasswordReset} className="w-full max-w-md rounded-md border border-line bg-white p-6 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-500 text-white"><KeyRound className="h-5 w-5" /></div>
          <h1 className="mt-5 text-xl font-semibold text-ink">Update Your Password</h1>
          <p className="mt-1 text-sm text-slate-600">This is your first login. You must set a permanent password before continuing.</p>
          <label className="mt-6 block text-sm font-medium text-slate-700">Temporary Password<input className="mt-2 h-10 w-full rounded-md border border-line px-3 outline-none focus:border-brand" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} type="password" required /></label>
          <label className="mt-4 block text-sm font-medium text-slate-700">New Permanent Password<input className="mt-2 h-10 w-full rounded-md border border-line px-3 outline-none focus:border-brand" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" required /></label>
          <label className="mt-4 block text-sm font-medium text-slate-700">Confirm New Password<input className="mt-2 h-10 w-full rounded-md border border-line px-3 outline-none focus:border-brand" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} type="password" required /></label>
          {error && <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <button className="mt-6 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={isSubmitting} type="submit"><CheckCircle2 className="h-4 w-4" />{isSubmitting ? "Updating..." : "Save Password"}</button>
          <button type="button" onClick={handleSignOut} className="mt-3 flex w-full items-center justify-center gap-2 text-xs text-slate-500 hover:text-slate-800">Cancel and Sign Out</button>
        </form>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen bg-[#eef2f6]">
      <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
      
      <section className="min-w-0 flex-1 flex flex-col h-screen">
        {/* Header - Locked to h-16 for perfect horizontal alignment */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-line bg-white px-4 lg:px-8">
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsMobileMenuOpen(true)} 
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-md"
            >
              {/* Menu (Hamburger) Icon */}
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
            </button>
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold text-ink">{title}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3 lg:gap-4">
            {userRole === "SUPER_ADMIN" && (
              <div className="hidden sm:flex items-center gap-2 border-r border-line pr-4">
                <ShieldAlert className={`h-4 w-4 ${isOverrideEnabled ? 'text-red-600' : 'text-slate-400'}`} />
                <label className="text-sm font-bold text-slate-700 cursor-pointer flex items-center gap-2">
                  Overrides
                  <input type="checkbox" checked={isOverrideEnabled} onChange={(e) => setOverrideEnabled(e.target.checked)} className="w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand cursor-pointer" />
                </label>
              </div>
            )}

            {/* Notifications Dropdown */}
            {accessToken && (
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => { setIsNotifOpen(!isNotifOpen); setIsUserMenuOpen(false); }}
                  className="relative flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 focus:outline-none transition-colors"
                >
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-white">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>
                {isNotifOpen && (
                  <div className="absolute right-0 top-full mt-2 w-80 overflow-hidden rounded-md border border-line bg-white shadow-lg z-50">
                    <div className="flex items-center justify-between border-b border-line bg-slate-50 px-4 py-3">
                      <h3 className="text-sm font-semibold text-ink">Notifications</h3>
                      {unreadCount > 0 && (
                        <button onClick={markAllAsRead} className="flex items-center gap-1 text-xs font-medium text-brand hover:text-teal-700">
                          <CheckCheck className="h-3 w-3" /> Mark all read
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center px-4 py-8 text-slate-500">
                          <Inbox className="mb-2 h-8 w-8 opacity-20" />
                          <p className="text-sm">You have no notifications.</p>
                        </div>
                      ) : (
                        <ul className="divide-y divide-line">
                          {notifications.map((notif) => {
                            const isExpanded = expandedNotifs.has(notif.id);
                            return (
                              <li
                                key={notif.id}
                                onClick={() => markAsRead(notif.id)}
                                className={`cursor-pointer px-4 py-3 hover:bg-slate-50 transition-colors ${!notif.is_read ? 'bg-teal-50/30' : ''}`}
                              >
                                <div className="flex justify-between items-start gap-2">
                                  <h4 className={`text-sm ${!notif.is_read ? 'font-semibold text-ink' : 'font-medium text-slate-700'}`}>
                                    {notif.title}
                                  </h4>
                                  <div className="flex items-center gap-2">
                                    {!notif.is_read && <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-brand"></span>}
                                    <button
                                      onClick={(e) => toggleExpand(notif.id, e)}
                                      className="text-slate-400 hover:text-slate-600 rounded p-1"
                                    >
                                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                    </button>
                                  </div>
                                </div>
                                <p className={`mt-1 text-xs text-slate-600 transition-all ${isExpanded ? '' : 'line-clamp-2'}`}>
                                  {notif.message}
                                </p>
                                <p className="mt-2 text-[10px] font-medium text-slate-400">{timeAgo(notif.created_at)}</p>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Modern Avatar User Menu */}
            {accessToken ? (
              <div className="relative" ref={userMenuRef}>
                <button 
                  onClick={() => { setIsUserMenuOpen(!isUserMenuOpen); setIsNotifOpen(false); }}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-white shadow-sm hover:ring-2 hover:ring-brand/30 focus:outline-none transition-all"
                >
                  <span className="text-sm font-bold">{userInitial}</span>
                </button>

                {isUserMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-md border border-line bg-white shadow-lg z-50">
                    <div className="border-b border-line px-4 py-3 bg-slate-50">
                      <p className="text-sm font-semibold text-ink truncate">{email}</p>
                    </div>
                    <div className="p-1">
                      <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 text-left">
                        <Settings2 className="h-4 w-4" /> Settings
                      </button>
                      <button 
                        onClick={handleSignOut}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50 text-left font-medium"
                      >
                        <LogOut className="h-4 w-4" /> Sign out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white" href="/login">Sign in</Link>
            )}
          </div>
        </header>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
          {/* Mobile Title (Since header space is limited on phones) */}
          <div className="sm:hidden mb-6">
            <h1 className="text-xl font-bold text-ink">{title}</h1>
            <p className="text-sm text-slate-500 mt-1">{description}</p>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}