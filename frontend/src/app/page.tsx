"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Boxes, ClipboardCheck, Factory, History } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { StatCard } from "@/components/dashboard/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type { InventoryBalance, InventoryTransaction, Product } from "@/types/inventory";

type PageResponse<T> = {
  items: T[];
  total: number;
};

export default function DashboardPage() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const products = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await api.get<PageResponse<Product>>("/products")).data,
    retry: false,
    enabled: Boolean(accessToken),
  });

  const balances = useQuery({
    queryKey: ["balances"],
    queryFn: async () => (await api.get<InventoryBalance[]>("/inventory/balances")).data,
    retry: false,
    enabled: Boolean(accessToken),
  });

  const transactions = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => (await api.get<InventoryTransaction[]>("/inventory/transactions")).data,
    retry: false,
    enabled: Boolean(accessToken),
  });

  const totalStock = balances.data?.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const reservedStock = balances.data?.reduce((sum, item) => sum + item.reserved_quantity, 0) ?? 0;

  return (
    <main className="flex min-h-screen bg-[#eef2f6]">
      <Sidebar />
      <section className="min-w-0 flex-1">
        <header className="border-b border-line bg-white px-5 py-4 lg:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold text-ink">Operations Dashboard</h1>
              <p className="text-sm text-slate-600">Movement-based inventory control across production and warehouse.</p>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge tone="success">Ledger enforced</StatusBadge>
              {!accessToken && (
                <Link className="rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white" href="/login">
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </header>

        <div className="space-y-6 p-5 lg:p-8">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Products" value={`${products.data?.total ?? 0}`} detail="Active catalog records" icon={Boxes} />
            <StatCard label="Current Stock" value={`${totalStock}`} detail="Across all locations" icon={ClipboardCheck} />
            <StatCard label="Reserved" value={`${reservedStock}`} detail="Allocated but not dispatched" icon={Factory} />
            <StatCard label="Ledger Entries" value={`${transactions.data?.length ?? 0}`} detail="Recent transactions" icon={History} />
          </div>

          <section className="rounded-md border border-line bg-white">
            <div className="border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Inventory Balances</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-panel text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Location Type</th>
                    <th className="px-4 py-3">Location ID</th>
                    <th className="px-4 py-3">Quantity</th>
                    <th className="px-4 py-3">Reserved</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {(balances.data ?? []).map((balance) => (
                    <tr key={balance.id}>
                      <td className="px-4 py-3 font-medium text-ink">{balance.product_id}</td>
                      <td className="px-4 py-3"><StatusBadge>{balance.location_type}</StatusBadge></td>
                      <td className="px-4 py-3 text-slate-600">{balance.location_id}</td>
                      <td className="px-4 py-3 text-slate-900">{balance.quantity}</td>
                      <td className="px-4 py-3 text-slate-600">{balance.reserved_quantity}</td>
                    </tr>
                  ))}
                  {!balances.data?.length && (
                    <tr>
                      <td className="px-4 py-8 text-center text-slate-500" colSpan={5}>
                        Sign in and receive inventory to populate balances.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
