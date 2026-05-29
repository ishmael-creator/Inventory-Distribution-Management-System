"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, UserSquare2, ShoppingCart } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ActionButton } from "@/components/ui/action-button";
import { SelectField, TextField } from "@/components/ui/form-field";
import { api } from "@/lib/api";
import type { ProductPage } from "@/types/inventory";

interface InventoryBalance {
  id: string;
  product_id: string;
  quantity: number;
}

export default function AgentDashboardPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ product_id: "", quantity: "1" });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 1. Fetch Agent's Balances
  const balances = useQuery({
    queryKey: ["agent-balances"],
    queryFn: async () => (await api.get<InventoryBalance[]>("/inventory/agent/balances")).data,
  });

  // 2. Fetch Products for mapping names
  const products = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await api.get<ProductPage>("/products")).data,
  });

  const productNameById = useMemo(
    () => new Map((products.data?.items ?? []).map((product) => [product.id, product.name])),
    [products.data?.items],
  );

  // 3. The Sale Mutation
  const recordSale = useMutation({
    mutationFn: async () =>
      api.post("/inventory/agent/sales", {
        product_id: form.product_id,
        quantity: Number(form.quantity),
      }),
    onSuccess: async () => {
      setForm({ product_id: "", quantity: "1" });
      setError(null);
      setSuccess("Sale successfully recorded!");
      setTimeout(() => setSuccess(null), 4000); // Hide success message after 4 seconds
      await queryClient.invalidateQueries({ queryKey: ["agent-balances"] });
    },
    onError: (err: any) => {
      setSuccess(null);
      // Extracts the exact error message from our backend safety net
      setError(err.response?.data?.detail || "Failed to record sale. Check your stock.");
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    recordSale.mutate();
  }

  return (
    <AppShell title="Agent Dashboard" description="Manage your territory inventory and record customer sales.">
      {/* Quick Stat Card */}
      <div className="mb-6 grid gap-6 md:grid-cols-3">
        <div className="flex items-center gap-4 rounded-md border border-line bg-white p-4">
          <div className="rounded-full bg-brand/10 p-3 text-brand">
            <Package className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Unique Products in Stock</p>
            <p className="text-2xl font-bold text-ink">
              {balances.data?.length ?? 0}
            </p>
          </div>
        </div>
      </div>

      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        {/* Record Sale Form */}
        <form onSubmit={onSubmit} className="rounded-md border border-line bg-white p-4 h-fit">
          <div className="mb-4 flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-brand" />
            <h2 className="text-sm font-semibold text-ink">Record Customer Sale</h2>
          </div>
          <div className="space-y-4">
            <SelectField
              label="Product"
              value={form.product_id}
              onChange={(event) => setForm({ ...form, product_id: event.target.value })}
              required
            >
              <option value="">Select a product to sell</option>
              {/* Only show products the Agent actually has in stock! */}
              {(balances.data ?? []).map((balance) => (
                <option key={balance.id} value={balance.product_id}>
                  {productNameById.get(balance.product_id) ?? balance.product_id} (Max: {balance.quantity})
                </option>
              ))}
            </SelectField>

            <TextField
              label="Quantity Sold"
              min={1}
              type="number"
              value={form.quantity}
              onChange={(event) => setForm({ ...form, quantity: event.target.value })}
              required
            />
            
            {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            {success && <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{success}</div>}
            
            <ActionButton disabled={recordSale.isPending || !balances.data?.length} type="submit">
              <ShoppingCart className="h-4 w-4" />
              {recordSale.isPending ? "Processing..." : "Complete Sale"}
            </ActionButton>
          </div>
        </form>

        {/* Inventory Table */}
        <section className="rounded-md border border-line bg-white h-fit">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <UserSquare2 className="h-5 w-5 text-brand" />
            <h2 className="text-sm font-semibold text-ink">My Available Inventory</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-left text-sm">
              <thead className="bg-panel text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Product Name</th>
                  <th className="px-4 py-3 text-right">Available Quantity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(balances.data ?? []).map((balance) => (
                  <tr key={balance.id}>
                    <td className="px-4 py-3 font-medium text-ink">
                      {productNameById.get(balance.product_id) ?? balance.product_id}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-600">
                      {balance.quantity}
                    </td>
                  </tr>
                ))}
                {!balances.data?.length && (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center text-slate-500">
                      You have no inventory allocated to you yet. Check with your Hub Manager.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </AppShell>
  );
}