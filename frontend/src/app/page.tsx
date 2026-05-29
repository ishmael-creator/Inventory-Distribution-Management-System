"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { api } from "@/lib/api";
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
import { Package, ArrowRightLeft, MapPin } from "lucide-react";
import type { InventoryBalance, InventoryTransaction } from "@/types/inventory";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function DashboardPage() {
  const balances = useQuery({
    queryKey: ["balances"],
    queryFn: async () => (await api.get<InventoryBalance[]>("/inventory/balances")).data,
  });

  const transactions = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => (await api.get<InventoryTransaction[]>("/inventory/transactions")).data,
  });

  // 1. Aggregate Data for the Pie Chart (Stock by Location Type)
  const stockDistribution = useMemo(() => {
    const data = balances.data ?? [];
    const grouped = data.reduce((acc, curr) => {
      acc[curr.location_type] = (acc[curr.location_type] || 0) + curr.quantity;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(grouped).map(([name, value]) => ({ name, value }));
  }, [balances.data]);

  // 2. Aggregate Data for the Bar Chart (Transactions by Type)
  const activityData = useMemo(() => {
    const data = transactions.data ?? [];
    const grouped = data.reduce((acc, curr) => {
      acc[curr.transaction_type] = (acc[curr.transaction_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(grouped).map(([name, count]) => ({ name, count }));
  }, [transactions.data]);

  // Summary Stats
  const totalStock = stockDistribution.reduce((sum, item) => sum + item.value, 0);
  const totalTransactions = transactions.data?.length ?? 0;
  const activeLocations = stockDistribution.length;

  return (
    <AppShell title="System Dashboard" description="High-level overview of your enterprise inventory operations.">
      
      {/* Summary Cards */}
      <div className="mb-6 grid gap-6 md:grid-cols-3">
        <div className="flex items-center gap-4 rounded-md border border-line bg-white p-4 shadow-sm">
          <div className="rounded-full bg-blue-50 p-3 text-blue-600">
            <Package className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Total System Units</p>
            <p className="text-2xl font-bold text-ink">{totalStock.toLocaleString()}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-md border border-line bg-white p-4 shadow-sm">
          <div className="rounded-full bg-green-50 p-3 text-green-600">
            <ArrowRightLeft className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Total Transactions</p>
            <p className="text-2xl font-bold text-ink">{totalTransactions.toLocaleString()}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-md border border-line bg-white p-4 shadow-sm">
          <div className="rounded-full bg-purple-50 p-3 text-purple-600">
            <MapPin className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Active Location Types</p>
            <p className="text-2xl font-bold text-ink">{activeLocations}</p>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        
        {/* Pie Chart: Stock Distribution */}
        <section className="rounded-md border border-line bg-white p-4 shadow-sm h-96 flex flex-col">
          <h2 className="text-sm font-semibold text-ink mb-4">Stock Distribution by Location</h2>
          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stockDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {stockDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(value: number) => value.toLocaleString()} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Bar Chart: Transaction Volume */}
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