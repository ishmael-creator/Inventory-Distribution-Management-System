"use client";

import { useMemo, useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCcw, Filter } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api";
import type { InventoryBalance, InventoryTransaction, ProductPage } from "@/types/inventory";

export default function InventoryPage() {
  const [locationFilter, setLocationFilter] = useState<string>("ALL");

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

  // 1. Group balances by Location for the sub-row table layout
  const groupedBalances = useMemo(() => {
    const groups = new Map<string, { id: string; type: string; products: { name: string; quantity: number }[] }>();
    
    (balances.data ?? []).forEach((balance) => {
      const locKey = balance.location_id;
      if (!groups.has(locKey)) {
        groups.set(locKey, {
          id: balance.location_id,
          type: balance.location_type,
          products: [],
        });
      }
      
      const productName = productNameById.get(balance.product_id) ?? balance.product_id;
      const availableQty = balance.quantity - balance.reserved_quantity;
      
      groups.get(locKey)!.products.push({
        name: productName,
        quantity: availableQty,
      });
    });

    return Array.from(groups.values());
  }, [balances.data, productNameById]);

  // 2. Dynamically get unique location types for the transaction filter
  const uniqueLocationTypes = useMemo(() => {
    const types = new Set<string>();
    (transactions.data ?? []).forEach((tx) => {
      if (tx.from_location_type) types.add(tx.from_location_type);
      if (tx.to_location_type) types.add(tx.to_location_type);
    });
    return Array.from(types);
  }, [transactions.data]);

  // 3. Filter the transactions
  const filteredTransactions = useMemo(() => {
    if (locationFilter === "ALL") return transactions.data ?? [];
    return (transactions.data ?? []).filter(
      (tx) => tx.from_location_type === locationFilter || tx.to_location_type === locationFilter
    );
  }, [transactions.data, locationFilter]);

  async function refreshAll() {
    await Promise.all([products.refetch(), balances.refetch(), transactions.refetch()]);
  }

  return (
    <AppShell title="Inventory Ledger" description="Review calculated balances and immutable inventory transactions.">
      <div className="mb-6 flex justify-end">
        <ActionButton onClick={refreshAll} type="button" variant="secondary">
          <RefreshCcw className="h-4 w-4" />
          Refresh
        </ActionButton>
      </div>

      {/* Grouped Balances Table (Pivot Style) */}
      <section id="balances" className="mb-6 rounded-md border border-line bg-white">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Stock by Location</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-panel text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 w-1/3">Location</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3 text-right">Available Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {groupedBalances.map((group) => (
                <Fragment key={group.id}>
                  {group.products.map((prod, index) => (
                    <tr key={`${group.id}-${prod.name}`} className="hover:bg-slate-50">
                      {/* Render the Location column ONLY on the first row of the group, spanning downwards */}
                      {index === 0 && (
                        <td
                          rowSpan={group.products.length}
                          className="px-4 py-4 align-top border-r border-line bg-white w-1/3"
                        >
                          <div className="mb-2"><StatusBadge>{group.type}</StatusBadge></div>
                          <div className="text-xs text-slate-500 font-mono">{group.id}</div>
                        </td>
                      )}
                      {/* Render Product and Qty as standard sub-rows */}
                      <td className="px-4 py-3 text-slate-700 font-medium">{prod.name}</td>
                      <td className="px-4 py-3 text-right font-bold text-ink">{prod.quantity}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              {!groupedBalances.length && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                    No inventory balances yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Filterable Transactions Table */}
      <section className="rounded-md border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Transaction History</h2>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              className="rounded-md border border-line px-2 py-1 text-sm text-slate-700 outline-none focus:border-brand"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
            >
              <option value="ALL">All Locations</option>
              {uniqueLocationTypes.map((type) => (
                <option key={type} value={type}>{type.replaceAll("_", " ")}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-panel text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Date & Time</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Quantity</th>
                <th className="px-4 py-3">From</th>
                <th className="px-4 py-3">To</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filteredTransactions.map((transaction) => (
                <tr key={transaction.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                    {new Date(transaction.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-medium text-ink">{productNameById.get(transaction.product_id) ?? transaction.product_id}</td>
                  <td className="px-4 py-3">
                    <StatusBadge>{transaction.transaction_type.replaceAll("_", " ")}</StatusBadge>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{transaction.quantity}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{transaction.from_location_type ?? "-"}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{transaction.to_location_type ?? "-"}</td>
                </tr>
              ))}
              {!filteredTransactions.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No transactions found for this location.
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