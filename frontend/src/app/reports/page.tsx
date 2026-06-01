"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileBarChart, Calendar } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { ActionButton } from "@/components/ui/action-button";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type { InventoryTransaction, ProductPage } from "@/types/inventory";

export default function ReportsPage() {
  const userRole = useAuthStore((state) => state.userRole);
  
  // Date filtering state
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30); // Default to last 30 days
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);

  const transactions = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => (await api.get<InventoryTransaction[]>("/inventory/transactions?limit=500")).data,
  });

  const products = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await api.get<ProductPage>("/products")).data,
  });

  const productNameById = useMemo(() => new Map((products.data?.items ?? []).map((p) => [p.id, p.name])), [products.data?.items]);

  // CORE LOGIC: Filter by Date AND User Role
  const filteredData = useMemo(() => {
    let data = transactions.data ?? [];

    // 1. Filter by Date Range
    data = data.filter((tx) => {
      const txDate = new Date(tx.created_at).toISOString().split("T")[0];
      return txDate >= startDate && txDate <= endDate;
    });

    // 2. Filter strictly by Role to isolate views
    if (userRole === "MANUFACTURER") {
      data = data.filter(tx => tx.transaction_type === "PRODUCTION" || tx.from_location_type === "MANUFACTURER");
    } else if (userRole === "WAREHOUSE_OFFICER") {
      data = data.filter(tx => tx.to_location_type === "WAREHOUSE" || tx.from_location_type === "WAREHOUSE");
    } else if (userRole === "HUB_OFFICER") {
      data = data.filter(tx => tx.to_location_type === "HUB" || tx.from_location_type === "HUB");
    }
    // SUPER_ADMIN, MANAGER, and DISTRIBUTION_TEAM see everything in this unified report.

    return data;
  }, [transactions.data, startDate, endDate, userRole]);

  // Aggregate Metrics for the Summary Cards
  const totalVolume = filteredData.reduce((sum, tx) => sum + tx.quantity, 0);
  const transactionCount = filteredData.length;

  const downloadCSV = () => {
    const headers = ["Date", "Transaction Type", "Product", "Quantity", "From Location", "To Location", "Notes"];
    
    const rows = filteredData.map(tx => [
      new Date(tx.created_at).toLocaleString().replace(",", ""),
      tx.transaction_type,
      productNameById.get(tx.product_id) || tx.product_id,
      tx.quantity.toString(),
      tx.from_location_type || "N/A",
      tx.to_location_type || "N/A",
      `""` // wrap in quotes to prevent comma breaking
    ]);

    const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `UPE_IMS_${userRole}_Report_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <AppShell title="Official Reports" description="Generate and export date-filtered operational reports.">
      
      {/* FILTER BAR */}
      <section className="mb-6 rounded-md border border-line bg-white p-4 shadow-sm flex flex-wrap items-end gap-4">
        <div className="flex items-center gap-2 text-brand font-semibold w-full md:w-auto mb-2 md:mb-0">
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
        
        <div className="flex-1 text-right">
          <ActionButton onClick={downloadCSV} disabled={filteredData.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Export to CSV
          </ActionButton>
        </div>
      </section>

      {/* REPORT SUMMARY */}
      <div className="mb-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-md border border-line bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Total Volume Processed (Units)</p>
          <p className="text-3xl font-bold text-ink">{totalVolume.toLocaleString()}</p>
        </div>
        <div className="rounded-md border border-line bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Total Operations Logged</p>
          <p className="text-3xl font-bold text-ink">{transactionCount}</p>
        </div>
      </div>

      {/* REPORT DATA TABLE */}
      <section className="rounded-md border border-line bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3 bg-slate-50">
          <FileBarChart className="h-5 w-5 text-slate-600" />
          <h2 className="text-sm font-semibold text-ink">Filtered Operations Data</h2>
        </div>
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full min-w-[900px] text-left text-sm relative">
            <thead className="bg-panel text-xs uppercase text-slate-500 sticky top-0 shadow-sm">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Movement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filteredData.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-500">{new Date(tx.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 font-semibold text-brand">{tx.transaction_type.replaceAll("_", " ")}</td>
                  <td className="px-4 py-3 text-ink font-medium">{productNameById.get(tx.product_id) ?? tx.product_id}</td>
                  <td className="px-4 py-3 font-bold text-slate-700">{tx.quantity}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {tx.from_location_type || "N/A"} ➔ {tx.to_location_type || "N/A"}
                  </td>
                </tr>
              ))}
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-500">No data available for this date range and role.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

    </AppShell>
  );
}