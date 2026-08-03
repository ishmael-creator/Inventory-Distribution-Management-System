"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Factory, Send, CheckCircle, PackageX } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { ActionButton } from "@/components/ui/action-button";
import { SelectField, TextField } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type { ProductBatch, ProductPage, DispatchOrder } from "@/types/inventory";

function toDatetimeLocal(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function batchTone(status: string): "success" | "warning" | "neutral" | undefined {
  if (status === "RECEIVED_AT_WAREHOUSE") return "success";
  if (status === "RELEASED_TO_WAREHOUSE") return "warning";
  return "neutral";
}

export default function ManufacturingPage() {
  const queryClient = useQueryClient();
  const { userRole, isOverrideEnabled } = useAuthStore();

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

  // THE FIX: Hit the new dedicated route so the Manufacturer doesn't get a 403 Forbidden!
  const dispatches = useQuery({
    queryKey: ["factory-returns"],
    queryFn: async () => (await api.get<DispatchOrder[]>("/manufacturing/returns")).data
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

  // THE FIX: We use the dedicated factory returns list
  const factoryReturns = useMemo(() => {
    return (dispatches.data ?? []).filter(d =>
      d.status === "DISPATCHED" || d.status === "RECEIVED"
    );
  }, [dispatches.data]);

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

  const receiveFactoryReturn = useMutation({
    mutationFn: async ({ dispatch_order_id, quantity }: { dispatch_order_id: string, quantity: number }) =>
      api.post("/distribution/reverse-logistics/receive", {
        dispatch_order_id,
        quantity_received: quantity,
        notes: "Formally received damaged goods from Warehouse for assessment/disposal."
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["factory-returns"] });
      alert("Returned stock successfully received!");
    },
    onError: (err: any) => alert(err.response?.data?.detail || "Failed to receive return.")
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createBatch.mutate();
  }

  const centralWarehouse = warehouses.data?.[0];
  const canCreate = userRole === "MANUFACTURER" || (userRole === "SUPER_ADMIN" && isOverrideEnabled);

  return (
    <AppShell title="Manufacturer Dashboard" description="Create production batches and process returned goods.">

      {/* FACTORY RETURNS QUEUE */}
      <section className="mb-8 rounded-md border border-line bg-white shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line bg-rose-50 px-4 py-3">
          <PackageX className="h-5 w-5 text-rose-600" />
          <h2 className="text-sm font-semibold text-rose-900">Inbound Damaged Returns (Reverse Logistics)</h2>
        </div>
        <div className="overflow-x-auto overflow-y-auto max-h-[300px]">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-panel text-xs uppercase text-slate-500 sticky top-0 z-10 border-b border-line">
              <tr>
                <th className="px-4 py-3 bg-panel">Date Shipped</th>
                <th className="px-4 py-3 bg-panel">Origin</th>
                <th className="px-4 py-3 bg-panel">Product</th>
                <th className="px-4 py-3 bg-panel font-bold text-red-600">Damaged Qty</th>
                <th className="px-4 py-3 bg-panel text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {factoryReturns.map((shipment) => (
                <tr key={shipment.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-500 text-xs">{new Date(shipment.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 font-medium text-slate-600">Central Warehouse</td>
                  <td className="px-4 py-3 font-semibold text-ink">{productNameById.get(shipment.product_id) ?? "Unknown Product"}</td>
                  <td className="px-4 py-3 font-bold text-red-600">{shipment.quantity} Units</td>
                  <td className="px-4 py-3 text-right">
                    {shipment.status === "DISPATCHED" ? (
                      <ActionButton
                        disabled={receiveFactoryReturn.isPending || !canCreate}
                        onClick={() => receiveFactoryReturn.mutate({ dispatch_order_id: shipment.id, quantity: shipment.quantity })}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" /> Receive Goods
                      </ActionButton>
                    ) : (
                      <StatusBadge tone="success">Received</StatusBadge>
                    )}
                  </td>
                </tr>
              ))}
              {factoryReturns.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No damaged goods currently in transit from the Warehouse.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        {/* BATCH CREATION FORM */}
        {canCreate ? (
          <form onSubmit={onSubmit} className="rounded-md border border-line bg-white p-4 h-fit shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Factory className="h-5 w-5 text-brand" />
              <h2 className="text-sm font-semibold text-ink">Create Production Batch</h2>
            </div>
            <div className="space-y-4">
              <SelectField label="Product to Manufacture" value={form.product_id} onChange={(event) => setForm({ ...form, product_id: event.target.value })} required>
                <option value="">Select product</option>
                {manufacturableProducts.map((product) => (
                  <option key={product.id} value={product.id}>{product.name} ({product.sku})</option>
                ))}
              </SelectField>
              <TextField label="Quantity Produced" min={1} type="number" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required />
              <TextField label="Produced At" type="datetime-local" value={form.produced_at} onChange={(event) => setForm({ ...form, produced_at: event.target.value })} required />
              {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
              <ActionButton disabled={createBatch.isPending} type="submit" className="w-full h-11">
                <Factory className="h-4 w-4 mr-2" /> {createBatch.isPending ? "Creating Batch..." : "Create Batch"}
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

        {/* PRODUCTION BATCH LOG */}
        <section className="rounded-md border border-line bg-white shadow-sm overflow-hidden h-fit">
          <div className="border-b border-line bg-slate-50 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Production Batch Log</h2>
          </div>
          <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
            <table className="w-full min-w-[700px] text-left text-sm whitespace-nowrap">
              <thead className="bg-panel text-xs uppercase text-slate-500 sticky top-0 z-10 shadow-sm border-b border-line">
                <tr>
                  <th className="px-4 py-3 bg-panel">Batch ID</th>
                  <th className="px-4 py-3 bg-panel">Product</th>
                  <th className="px-4 py-3 bg-panel">Quantity</th>
                  <th className="px-4 py-3 bg-panel">Status</th>
                  <th className="px-4 py-3 bg-panel text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(batches.data ?? []).map((batch) => {
                  const canRelease = userRole === "MANUFACTURER" || (userRole === "SUPER_ADMIN" && isOverrideEnabled);
                  return (
                    <tr key={batch.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-medium text-slate-600">{batch.batch_number}</td>
                      <td className="px-4 py-3 font-semibold text-ink">{productNameById.get(batch.product_id) ?? batch.product_id}</td>
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
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                      No production batches found in the system.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}