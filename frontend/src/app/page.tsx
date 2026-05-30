"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Package, ArrowRightLeft, MapPin, Calendar, Factory } from "lucide-react";
import type { InventoryBalance, InventoryTransaction, ProductPage } from "@/types/inventory";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function DashboardPage() {
  const userRole = useAuthStore((state) => state.userRole);

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
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
  });

  const transactions = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => (await api.get<InventoryTransaction[]>("/inventory/transactions")).data,
  });

  const productNameById = useMemo(() => new Map((products.data?.items ?? []).map((p) => [p.id, p.name])), [products.data?.items]);

  // Dynamic Labels based on Role
  const stockLabel = userRole === "MANUFACTURER" ? "Current Factory Stock" 
                   : userRole === "WAREHOUSE_OFFICER" ? "Current Warehouse Stock"
                   : userRole === "HUB_OFFICER" ? "Current Hub Stock"
                   : "Global Active Stock";

  // Filter Transactions by Date AND Role
  const filteredTransactions = useMemo(() => {
    let data = transactions.data ?? [];

    data = data.filter((tx) => {
      const txDate = new Date(tx.created_at).toISOString().split("T")[0];
      return txDate >= startDate && txDate <= endDate;
    });

    if (userRole === "MANUFACTURER") {
      data = data.filter(tx => tx.transaction_type === "PRODUCTION" || tx.from_location_type === "MANUFACTURER");
    } else if (userRole === "WAREHOUSE_OFFICER") {
      data = data.filter(tx => tx.to_location_type === "WAREHOUSE" || tx.from_location_type === "WAREHOUSE");
    } else if (userRole === "HUB_OFFICER") {
      data = data.filter(tx => tx.to_location_type === "HUB" || tx.from_location_type === "HUB");
    }

    return data;
  }, [transactions.data, startDate, endDate, userRole]);

  // Filter Balances by Role for the Pie Chart
  const stockDistribution = useMemo(() => {
    let data = balances.data ?? [];
    
    if (userRole === "MANUFACTURER") data = data.filter(b => b.location_type === "MANUFACTURER");
    if (userRole === "WAREHOUSE_OFFICER") data = data.filter(b => b.location_type === "WAREHOUSE");
    if (userRole === "HUB_OFFICER") data = data.filter(b => b.location_type === "HUB");

    const grouped = data.reduce((acc, curr) => {
      acc[curr.location_type] = (acc[curr.location_type] || 0) + curr.quantity;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(grouped).map(([name, value]) => ({ name, value }));
  }, [balances.data, userRole]);

  const activityData = useMemo(() => {
    const grouped = filteredTransactions.reduce((acc, curr) => {
      acc[curr.transaction_type] = (acc[curr.transaction_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(grouped).map(([name, count]) => ({ name, count }));
  }, [filteredTransactions]);

  // NEW: Total Produced by Product (For Manufacturers & Admins)
  const productionTotals = useMemo(() => {
    const prodTx = filteredTransactions.filter(tx => tx.transaction_type === "PRODUCTION");
    const grouped = prodTx.reduce((acc, tx) => {
       acc[tx.product_id] = (acc[tx.product_id] || 0) + tx.quantity;
       return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(grouped).map(([id, qty]) => ({
       product: productNameById.get(id) || "Unknown Product",
       quantity: qty
    }));
  }, [filteredTransactions, productNameById]);

  const totalStock = stockDistribution.reduce((sum, item) => sum + item.value, 0);
  const totalTransactions = filteredTransactions.length;
  const activeLocations = stockDistribution.length;

  return (
    <AppShell title={`${userRole?.replace("_", " ") || "System"} Dashboard`} description="Role-specific overview of your inventory operations.">
      
      {/* FILTER BAR */}
      <section className="mb-6 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-brand font-semibold">
          <Calendar className="h-5 w-5" /> Filter Metrics:
        </div>
        <input 
          type="date" 
          value={startDate} 
          onChange={(e) => setStartDate(e.target.value)} 
          className="rounded-md border border-line px-3 py-1.5 outline-none focus:border-brand text-sm"
        />
        <span className="text-slate-400">to</span>
        <input 
          type="date" 
          value={endDate} 
          onChange={(e) => setEndDate(e.target.value)} 
          className="rounded-md border border-line px-3 py-1.5 outline-none focus:border-brand text-sm"
        />
      </section>

      <div className="mb-6 grid gap-6 md:grid-cols-3">
        <div className="flex items-center gap-4 rounded-md border border-line bg-white p-4 shadow-sm">
          <div className="rounded-full bg-blue-50 p-3 text-blue-600"><Package className="h-6 w-6" /></div>
          <div>
            <p className="text-sm text-slate-500">{stockLabel}</p>
            <p className="text-2xl font-bold text-ink">{totalStock.toLocaleString()}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-md border border-line bg-white p-4 shadow-sm">
          <div className="rounded-full bg-green-50 p-3 text-green-600"><ArrowRightLeft className="h-6 w-6" /></div>
          <div>
            <p className="text-sm text-slate-500">Period Transactions</p>
            <p className="text-2xl font-bold text-ink">{totalTransactions.toLocaleString()}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-md border border-line bg-white p-4 shadow-sm">
          <div className="rounded-full bg-purple-50 p-3 text-purple-600"><MapPin className="h-6 w-6" /></div>
          <div>
            <p className="text-sm text-slate-500">Locations in Scope</p>
            <p className="text-2xl font-bold text-ink">{activeLocations}</p>
          </div>
        </div>
      </div>

      {/* NEW: Total Produced Module for Manufacturers */}
      {(userRole === "MANUFACTURER" || userRole === "SUPER_ADMIN" || userRole === "MANAGER") && (
        <section className="mb-6 rounded-md border border-line bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-line bg-slate-50 px-4 py-3">
            <Factory className="h-5 w-5 text-slate-600" />
            <h2 className="text-sm font-semibold text-ink">Total Produced by Product (In Selected Date Range)</h2>
          </div>
          <div className="p-4 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {productionTotals.map((item, idx) => (
              <div key={idx} className="rounded-md border border-line p-3 bg-slate-50">
                <p className="text-sm text-slate-500 font-medium truncate">{item.product}</p>
                <p className="text-xl font-bold text-brand mt-1">{item.quantity.toLocaleString()} Units</p>
              </div>
            ))}
            {productionTotals.length === 0 && (
              <div className="col-span-full py-6 text-center text-slate-500 text-sm">
                No production batches recorded in this date range.
              </div>
            )}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-md border border-line bg-white p-4 shadow-sm h-96 flex flex-col">
          <h2 className="text-sm font-semibold text-ink mb-4">Stock Distribution in Scope</h2>
          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stockDistribution} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                  {stockDistribution.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <RechartsTooltip formatter={(value: number) => value.toLocaleString()} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-md border border-line bg-white p-4 shadow-sm h-96 flex flex-col">
          <h2 className="text-sm font-semibold text-ink mb-4">Transaction Volume by Type</h2>
          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <RechartsTooltip cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </AppShell>
  );
}