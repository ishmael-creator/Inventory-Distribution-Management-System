"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { LogOut, ShieldAlert } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuthStore } from "@/stores/auth-store";

export function AppShell({ title, description, children }: { title: string; description: string; children: ReactNode; }) {
  const router = useRouter();
  const { accessToken, userRole, isOverrideEnabled, setAccessToken, setOverrideEnabled } = useAuthStore();

  const handleSignOut = () => {
    // 1. Wipe all local data
    setAccessToken(null);
    useAuthStore.setState({ userId: null, userRole: null, isOverrideEnabled: false });
    
    // 2. Physically move the browser to the login page
    router.push("/login");
  };

  return (
    <main className="flex min-h-screen bg-[#eef2f6]">
      <Sidebar />
      <section className="min-w-0 flex-1">
        <header className="border-b border-line bg-white px-5 py-4 lg:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold text-ink">{title}</h1>
              <p className="text-sm text-slate-600">{description}</p>
            </div>
            
            <div className="flex items-center gap-4">
              {/* THE BREAK-GLASS TOGGLE */}
              {userRole === "SUPER_ADMIN" && (
                <div className="flex items-center gap-2 border-r border-line pr-4">
                  <ShieldAlert className={`h-4 w-4 ${isOverrideEnabled ? 'text-red-600' : 'text-slate-400'}`} />
                  <label className="text-sm font-bold text-slate-700 cursor-pointer flex items-center gap-2">
                    Enable Overrides
                    <input 
                      type="checkbox" 
                      checked={isOverrideEnabled}
                      onChange={(e) => setOverrideEnabled(e.target.checked)}
                      className="w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand cursor-pointer"
                    />
                  </label>
                </div>
              )}

              <StatusBadge tone={accessToken ? "success" : "warning"}>
                {userRole ? userRole.replaceAll("_", " ") : "Sign in required"}
              </StatusBadge>
              
              {accessToken ? (
                <button
                  className="flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={handleSignOut}
                  type="button"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              ) : (
                <Link className="rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white" href="/login">
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </header>
        <div className="space-y-6 p-5 lg:p-8">{children}</div>
      </section>
    </main>
  );
}