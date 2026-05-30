"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackagePlus, RefreshCcw } from "lucide-react";

import { ActionButton } from "@/components/ui/action-button";
import { TextAreaField, TextField } from "@/components/ui/form-field";
import { AppShell } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type { Product, ProductPage } from "@/types/inventory";

const initialForm = {
  name: "",
  sku: "",
  description: "",
  unit: "unit",
};

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const { userRole, isOverrideEnabled } = useAuthStore();

  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState<string | null>(null);

  // STRICT RULE: Manufacturer can always create. Super Admin MUST have override enabled.
  const canCreate = userRole === "MANUFACTURER" || (userRole === "SUPER_ADMIN" && isOverrideEnabled);

  const products = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await api.get<ProductPage>("/products")).data,
  });

  const createProduct = useMutation({
    mutationFn: async () =>
      api.post<Product>("/products", {
        name: form.name,
        sku: form.sku,
        description: form.description || null,
        unit: form.unit,
        low_stock_threshold: 0, 
      }),
    onSuccess: async () => {
      setForm(initialForm);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: () => setError("Product could not be saved. Check the SKU is unique and try again."),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createProduct.mutate();
  }

  return (
    <AppShell title="Products" description="Manage and view the system product catalog.">
      {error && <div className="mb-6 rounded-md bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}

      <section className={`grid gap-6 ${canCreate ? "xl:grid-cols-[420px_1fr]" : "grid-cols-1"}`}>
        
        {/* CREATE PRODUCT FORM (HIDDEN UNLESS AUTHORIZED/OVERRIDDEN) */}
        {canCreate && (
          <form onSubmit={onSubmit} className="rounded-md border border-line bg-white p-4 h-fit shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <PackagePlus className="h-5 w-5 text-brand" />
              <h2 className="text-sm font-semibold text-ink">Create Product</h2>
            </div>

            <div className="space-y-4">
              <TextField 
                label="Product Name" 
                value={form.name} 
                onChange={(event) => setForm({ ...form, name: event.target.value })} 
                required 
              />
              <TextField 
                label="SKU" 
                value={form.sku} 
                onChange={(event) => setForm({ ...form, sku: event.target.value })} 
                required 
              />
              <TextField 
                label="Unit of Measure (e.g., unit, box, pallet)" 
                value={form.unit} 
                onChange={(event) => setForm({ ...form, unit: event.target.value })} 
                required 
              />
              <TextAreaField
                label="Description"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />

              <ActionButton disabled={createProduct.isPending} type="submit" className="w-full">
                <PackagePlus className="h-4 w-4 mr-2" />
                {createProduct.isPending ? "Saving..." : "Save Product"}
              </ActionButton>
            </div>
          </form>
        )}

        {/* PRODUCT CATALOG TABLE */}
        <section className="rounded-md border border-line bg-white h-fit shadow-sm">
          <div className="flex items-center justify-between border-b border-line bg-slate-50 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Product Catalog</h2>
            <ActionButton variant="secondary" onClick={() => products.refetch()} type="button">
              <RefreshCcw className="h-4 w-4 mr-2" />
              Refresh
            </ActionButton>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-left text-sm">
              <thead className="bg-panel text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Unit of Measure</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(products.data?.items ?? []).map((product) => (
                  <tr key={product.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-ink">{product.name}</td>
                    <td className="px-4 py-3 text-slate-600">{product.sku}</td>
                    <td className="px-4 py-3 text-slate-600">{product.unit}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={product.is_active ? "success" : "warning"}>
                        {product.is_active ? "Active" : "Inactive"}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
                {!products.data?.items.length && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      No products found. Add one to get started.
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