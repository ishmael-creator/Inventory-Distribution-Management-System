"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Factory, Send, User } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { ActionButton } from "@/components/ui/action-button";
import { SelectField, TextField } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type { ProductBatch, ProductPage } from "@/types/inventory";

function toDatetimeLocal(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function batchTone(status: ProductBatch["status"]) {
  if (status === "RECEIVED_AT_WAREHOUSE") return "success";
  if (status === "RELEASED_TO_WAREHOUSE") return "info";
  if (status === "AWAITING_RELEASE") return "warning";
  return "neutral";
}

export default function ManufacturingPage() {
  const queryClient = useQueryClient();
  const { userId, userRole, isOverrideEnabled } = useAuthStore();

  const [form, setForm] = useState({
    product_id: "",
    quantity: "100",
    produced_at: toDatetimeLocal(new Date()),
  });
  
  const [error, setError] = useState<string | null>(null);

  const products = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await api.get<ProductPage>("/products")).data,
  });

  const batches = useQuery({
    queryKey: ["batches"],
    queryFn: async () => (await api.get<any[]>("/manufacturing/batches")).data,
  });

  const warehouses = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const res = await api.get<any>("/warehouses");
      return Array.isArray(res.data) ? res.data : (res.data?.items ?? []);
    },
  });

  const productNameById = useMemo(
    () => new Map((products.data?.items ?? []).map((product) => [product.id, product.name])),
    [products.data?.items],
  );

  const manufacturableProducts = useMemo(() => {
    return (products.data?.items ?? []).filter(
      (p) => p.sku !== "EPC" && p.name !== "EPC"
    );
  }, [products.data?.items]);

  const createBatch = useMutation({
    mutationFn: async () =>
      api.post<ProductBatch>("/manufacturing/batches", {
        product_id: form.product_id,
        quantity: Number(form.quantity),
        produced_at: new Date(form.produced_at).toISOString(),
      }),
    onSuccess: async () => {
      setForm({ product_id: "", quantity: "100", produced_at: toDatetimeLocal(new Date()) });
      setError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["batches"] }),
        queryClient.invalidateQueries({ queryKey: ["balances"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
      ]);
    },
    onError: () => setError("Batch could not be created. Check the product and quantity."),
  });

  const releaseBatch = useMutation({
    mutationFn: async ({ batchId, destinationId }: { batchId: string; destinationId: string }) => 
      api.post<ProductBatch>(`/manufacturing/batches/${batchId}/release`, {
        destination_id: destinationId
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["batches"] });
      await queryClient.invalidateQueries({ queryKey: ["balances"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createBatch.mutate();
  }

  const centralWarehouse = warehouses.data?.[0];
  
  // Security Checks: Manufacturer or Overridden Admin
  const canCreate = userRole === "MANUFACTURER" || (userRole === "SUPER_ADMIN" && isOverrideEnabled);

  return (
    <AppShell title="Manufacturing" description="Create production batches and release them to the Central Warehouse.">
      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        
        {canCreate ? (
          <form onSubmit={onSubmit} className="rounded-md border border-line bg-white p-4 h-fit shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Factory className="h-5 w-5 text-brand" />
              <h2 className="text-sm font-semibold text-ink">Create Production Batch</h2>
            </div>

            <div className="space-y-4">
              <SelectField
                label="Product to Manufacture"
                value={form.product_id}
                onChange={(event) => setForm({ ...form, product_id: event.target.value })}
                required
              >
                <option value="">Select product</option>
                {manufacturableProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} ({product.sku})
                  </option>
                ))}
              </SelectField>

              <TextField
                label="Quantity Produced"
                min={1}
                type="number"
                value={form.quantity}
                onChange={(event) => setForm({ ...form, quantity: event.target.value })}
                required
              />

              <TextField
                label="Produced At"
                type="datetime-local"
                value={form.produced_at}
                onChange={(event) => setForm({ ...form, produced_at: event.target.value })}
                required
              />

              {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

              <ActionButton disabled={createBatch.isPending} type="submit" className="w-full h-11">
                <Factory className="h-4 w-4 mr-2" />
                {createBatch.isPending ? "Creating Batch..." : "Create Batch"}
              </ActionButton>
            </div>
          </form>
        ) : (
          <div className="rounded-md border border-line bg-slate-50 p-6 text-center shadow-sm h-fit">
            <Factory className="h-8 w-8 text-slate-400 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-600">Viewing Access Only</p>
            <p className="text-xs text-slate-500 mt-1">Your role does not permit creating batches.</p>
          </div>
        )}

        <section className="rounded-md border border-line bg-white shadow-sm overflow-hidden">
          <div className="border-b border-line bg-slate-50 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Production Batch Log</h2>
          </div>
          
          <div className="overflow-x-auto min-h-[400px]">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-panel text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Batch ID</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Creator</th>
                  <th className="px-4 py-3">Quantity</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(batches.data ?? []).map((batch) => {
                  
                  const isCreator = batch.created_by === userId;
                  // REMOVED CREATOR LOCK: Any Manufacturer (or Admin Override) can release any batch
                  const canRelease = userRole === "MANUFACTURER" || (userRole === "SUPER_ADMIN" && isOverrideEnabled);

                  return (
                    <tr key={batch.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs font-medium text-slate-600">{batch.batch_number}</td>
                      <td className="px-4 py-3 font-semibold text-ink">{productNameById.get(batch.product_id) ?? batch.product_id}</td>
                      
                      <td className="px-4 py-3">
                        {isCreator ? (
                          <span className="inline-flex items-center gap-1 rounded bg-teal-50 px-2 py-1 text-xs font-bold text-teal-700">
                            <User className="h-3 w-3" /> You
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500 italic">Colleague / System</span>
                        )}
                      </td>

                      <td className="px-4 py-3 font-bold text-slate-700">{batch.quantity} Units</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={batchTone(batch.status)}>{batch.status.replaceAll("_", " ")}</StatusBadge>
                      </td>
                      
                      <td className="px-4 py-3 text-right">
                        {batch.status === "AWAITING_RELEASE" ? (
                          <button
                            disabled={releaseBatch.isPending || !centralWarehouse || !canRelease}
                            onClick={() => {
                              if (!canRelease) return; 
                              if (userRole === "SUPER_ADMIN" && !window.confirm("Warning: Admin Override. Proceed?")) return;
                              
                              releaseBatch.mutate({ 
                                batchId: batch.id, 
                                destinationId: centralWarehouse.id 
                              });
                            }}
                            type="button"
                            className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                              canRelease 
                                ? "bg-white border border-brand text-brand hover:bg-brand hover:text-white" 
                                : "bg-slate-100 text-slate-400 cursor-not-allowed border border-transparent"
                            }`}
                          >
                            <Send className="h-3 w-3" />
                            {canRelease ? "Release to Warehouse" : "Not Authorized"}
                          </button>
                        ) : (
                          <span className="text-slate-400 text-xs italic mr-4">Completed</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                
                {!batches.data?.length && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                      No production batches found in the system.
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