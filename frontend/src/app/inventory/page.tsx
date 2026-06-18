"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, Boxes, Calendar } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type { InventoryBalance, InventoryTransaction, ProductPage } from "@/types/inventory";

export default function InventoryLedgerPage() {
  const userRole = useAuthStore((state) => state.userRole);
  
  // Define who gets to see the global stock balances
  const isGlobalRole = ["SUPER_ADMIN", "MANAGER", "DISTRIBUTION_TEAM"].includes(userRole || "");

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7); // Default to last 7 days
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);

  const products = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await api.get<ProductPage>("/products")).data,
  });

  const balances = useQuery({
    queryKey: ["balances"],
    queryFn: async () => (await api.get<InventoryBalance[]>("/inventory/balances")).data,
    enabled: isGlobalRole, // Only fetch balances if the user is a global role to save bandwidth
  });

  const transactions = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => (await api.get<InventoryTransaction[]>("/inventory/transactions")).data,
  });

  const productNameById = useMemo(() => new Map((products.data?.items ?? []).map((p) => [p.id, p.name])), [products.data?.items]);

  // AUTOMATIC & PERMANENT LOG FILTERING
  const filteredTransactions = useMemo(() => {
    let data = transactions.data ?? [];

    // 1. Enforce Date Range Filter
    data = data.filter((tx) => {
      const txDate = new Date(tx.created_at).toISOString().split("T")[0];
      return txDate >= startDate && txDate <= endDate;
    });

    // 2. Enforce Strict Role Isolation
    if (userRole === "MANUFACTURER") {
      data = data.filter(tx => tx.transaction_type === "PRODUCTION" || tx.from_location_type === "MANUFACTURER");
    } else if (userRole === "WAREHOUSE_OFFICER") {
      data = data.filter(tx => tx.to_location_type === "WAREHOUSE" || tx.from_location_type === "WAREHOUSE");
    } else if (userRole === "HUB_OFFICER") {
      data = data.filter(tx => tx.to_location_type === "HUB" || tx.from_location_type === "HUB");
    }

    return data;
  }, [transactions.data, startDate, endDate, userRole]);

  return (
    <AppShell title="System Logs & Ledger" description="View system-wide activity and historical transaction logs.">
      
      {/* EXCLUSIVE DATE FILTER BAR */}
      <section className="mb-6 rounded-md border border-line bg-white p-4 shadow-sm flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-brand font-semibold">
          <Calendar className="h-5 w-5" /> Date Range:
        </div>
        <label className="text-sm font-medium text-slate-700">
          From
          <input 
            type="date" 
            value={startDate} 
            onChange={(e) => setStartDate(e.target.value)} 
            className="ml-2 rounded-md border border-line px-3 py-1.5 outline-none focus:border-brand"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          To
          <input 
            type="date" 
            value={endDate} 
            onChange={(e) => setEndDate(e.target.value)} 
            className="ml-2 rounded-md border border-line px-3 py-1.5 outline-none focus:border-brand"
          />
        </label>
      </section>

      {/* GLOBAL STOCK BALANCES (ONLY VISIBLE TO SUPER_ADMIN, MANAGER, DISTRIBUTION) */}
      {isGlobalRole && (
        <section className="mb-8 rounded-md border border-line bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-line bg-slate-50 px-4 py-3">
            <Boxes className="h-5 w-5 text-slate-600" />
            <h2 className="text-sm font-semibold text-ink">Global Stock by Location</h2>
          </div>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-left text-sm relative">
              <thead className="bg-panel text-xs uppercase text-slate-500 sticky top-0 shadow-sm">
                <tr>
                  <th className="px-4 py-3">Location Type</th>
                  <th className="px-4 py-3">Product Name</th>
                  <th className="px-4 py-3">Total Held</th>
                  <th className="px-4 py-3">Reserved</th>
                  <th className="px-4 py-3 text-red-600">Damaged</th>
                  <th className="px-4 py-3 font-bold text-brand">Available to Move</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(balances.data ?? []).map((balance) => {
                  const available = balance.quantity - (balance.reserved_quantity || 0);
                  return (
                    <tr key={balance.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-700">{balance.location_type}</td>
                      <td className="px-4 py-3 text-slate-600">{productNameById.get(balance.product_id) ?? balance.product_id}</td>
                      <td className="px-4 py-3">{balance.quantity}</td>
                      <td className="px-4 py-3 text-amber-600">{balance.reserved_quantity || 0}</td>
                      <td className="px-4 py-3 text-red-600">0</td>
                      <td className="px-4 py-3 font-bold text-brand">{available}</td>
                    </tr>
                  );
                })}
                {!balances.data?.length && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No balances recorded across the system.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ISOLATED TRANSACTION LOGS (VISIBLE TO EVERYONE, BUT FILTERED BY ROLE) */}
      <section className="rounded-md border border-line bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-line bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-slate-600" />
            <h2 className="text-sm font-semibold text-ink">System Action Logs</h2>
          </div>
          <span className="text-xs font-semibold text-slate-500 bg-white px-2 py-1 rounded border border-line">
            Showing {filteredTransactions.length} events
          </span>
        </div>
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full min-w-[900px] text-left text-sm relative">
            <thead className="bg-panel text-xs uppercase text-slate-500 sticky top-0 shadow-sm">
              <tr>
                <th className="px-4 py-3">Date & Time</th>
                <th className="px-4 py-3">Action Type</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Movement Path</th>
                <th className="px-4 py-3">System Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filteredTransactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {new Date(tx.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-brand text-xs uppercase tracking-wider bg-teal-50 px-2 py-1 rounded">
                      {tx.transaction_type === "DISPATCH" && tx.from_location_type === "AGENT" ? "AGENT SALE" : tx.transaction_type.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-ink">{productNameById.get(tx.product_id) ?? tx.product_id}</td>
                  <td className="px-4 py-3 font-bold text-slate-700">{tx.quantity}</td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-500">
                    {tx.from_location_type ? tx.from_location_type.substring(0, 3) : "---"} ➔ {tx.to_location_type ? tx.to_location_type.substring(0, 3) : "---"}
                  </td>
                  <td className="px-4 py-3 text-slate-500 italic max-w-xs truncate">
                      -
                </td>
                </tr>
              ))}
              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    No activity found for your role within this date range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

    </AppShell>
  );
}