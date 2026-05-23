"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCcw } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api";
import type { InventoryBalance, InventoryTransaction, ProductPage } from "@/types/inventory";

export default function InventoryPage() {
  const products = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await api.get<ProductPage>("/products")).data,
  });

  const balances = useQuery({
    queryKey: ["balances"],
    queryFn: async () => (await api.get<InventoryBalance[]>("/inventory/balances")).data,
  });

  const transactions = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => (await api.get<InventoryTransaction[]>("/inventory/transactions")).data,
  });

  const productNameById = useMemo(
    () => new Map((products.data?.items ?? []).map((product) => [product.id, product.name])),
    [products.data?.items],
  );

  async function refreshAll() {
    await Promise.all([products.refetch(), balances.refetch(), transactions.refetch()]);
  }

  return (
    <AppShell title="Inventory Ledger" description="Review calculated balances and immutable inventory transactions.">
      <div className="flex justify-end">
        <ActionButton onClick={refreshAll} type="button" variant="secondary">
          <RefreshCcw className="h-4 w-4" />
          Refresh
        </ActionButton>
      </div>

      <section id="balances" className="rounded-md border border-line bg-white">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Stock by Location</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-panel text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Location Type</th>
                <th className="px-4 py-3">Location ID</th>
                <th className="px-4 py-3">Quantity</th>
                <th className="px-4 py-3">Reserved</th>
                <th className="px-4 py-3">Available</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(balances.data ?? []).map((balance) => (
                <tr key={balance.id}>
                  <td className="px-4 py-3 font-medium text-ink">{productNameById.get(balance.product_id) ?? balance.product_id}</td>
                  <td className="px-4 py-3">
                    <StatusBadge>{balance.location_type}</StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{balance.location_id}</td>
                  <td className="px-4 py-3 text-slate-900">{balance.quantity}</td>
                  <td className="px-4 py-3 text-slate-600">{balance.reserved_quantity}</td>
                  <td className="px-4 py-3 font-medium text-ink">{balance.quantity - balance.reserved_quantity}</td>
                  <td className="px-4 py-3 text-slate-600">{new Date(balance.updated_at).toLocaleString()}</td>
                </tr>
              ))}
              {!balances.data?.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No inventory balances yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-md border border-line bg-white">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Transaction History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-panel text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Quantity</th>
                <th className="px-4 py-3">From</th>
                <th className="px-4 py-3">To</th>
                <th className="px-4 py-3">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(transactions.data ?? []).map((transaction) => (
                <tr key={transaction.id}>
                  <td className="px-4 py-3 text-slate-600">{new Date(transaction.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 font-medium text-ink">{productNameById.get(transaction.product_id) ?? transaction.product_id}</td>
                  <td className="px-4 py-3">
                    <StatusBadge>{transaction.transaction_type.replaceAll("_", " ")}</StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-slate-900">{transaction.quantity}</td>
                  <td className="px-4 py-3 text-slate-600">{transaction.from_location_type ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{transaction.to_location_type ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{transaction.reference_type ?? "-"}</td>
                </tr>
              ))}
              {!transactions.data?.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No ledger transactions yet.
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

