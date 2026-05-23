"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuthStore } from "@/stores/auth-store";

export function AppShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const setAccessToken = useAuthStore((state) => state.setAccessToken);

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
            <div className="flex items-center gap-3">
              <StatusBadge tone={accessToken ? "success" : "warning"}>
                {accessToken ? "Signed in" : "Sign in required"}
              </StatusBadge>
              {accessToken ? (
                <button
                  className="flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => setAccessToken(null)}
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
