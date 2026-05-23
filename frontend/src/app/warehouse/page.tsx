"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ClipboardCheck, Send, Warehouse, X } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ActionButton } from "@/components/ui/action-button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api";
import type { AllocationRequest, DispatchOrder, ProductBatch, ProductPage, WarehouseRecord, HubRecord } from "@/types/inventory";

// Helper for status colors
function requestTone(status: AllocationRequest["status"]) {
  if (status === "FULFILLED") return "success";
  if (status === "APPROVED" || status === "PENDING") return "warning";
  return "neutral";
}

export default function WarehousePage() {
  const queryClient = useQueryClient();

  // Forms & State
  const [warehouseForm, setWarehouseForm] = useState({ name: "", location: "" });
  const [receiptForm, setReceiptForm] = useState({ batch_id: "", warehouse_id: "", quantity_received: "", notes: "" });
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [approvedQuantities, setApprovedQuantities] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Queries
  const products = useQuery({ queryKey: ["products"], queryFn: async () => (await api.get<ProductPage>("/products")).data });
  const batches = useQuery({ queryKey: ["batches"], queryFn: async () => (await api.get<ProductBatch[]>("/manufacturing/batches")).data });
  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: async () => (await api.get<WarehouseRecord[]>("/warehouses")).data });
  const hubs = useQuery({ queryKey: ["hubs"], queryFn: async () => (await api.get<HubRecord[]>("/distribution/hubs")).data });
  const requests = useQuery({ queryKey: ["distribution-requests"], queryFn: async () => (await api.get<AllocationRequest[]>("/distribution/requests")).data });

  // Memos
  const productNameById = useMemo(() => new Map((products.data?.items ?? []).map((p) => [p.id, p.name])), [products.data?.items]);
  const warehouseNameById = useMemo(() => new Map((warehouses.data ?? []).map((w) => [w.id, w.name])), [warehouses.data]);
  const hubNameById = useMemo(() => new Map((hubs.data ?? []).map((h) => [h.id, h.name])), [hubs.data]);
  
  const releasedBatches = (batches.data ?? []).filter((batch) => batch.status === "RELEASED_TO_WAREHOUSE");
  const warehouseQueue = (requests.data ?? []).filter((request) => request.status === "PENDING" || request.status === "APPROVED");

  // Mutations
  const createWarehouse = useMutation({
    mutationFn: async () => api.post<WarehouseRecord>("/warehouses", { name: warehouseForm.name, location: warehouseForm.location || null }),
    onSuccess: async () => {
      setWarehouseForm({ name: "", location: "" });
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["warehouses"] });
    },
    onError: () => setError("Warehouse could not be saved."),
  });

  const receiveBatch = useMutation({
    mutationFn: async () => api.post<ProductBatch>("/warehouses/receipts", {
      batch_id: receiptForm.batch_id,
      warehouse_id: receiptForm.warehouse_id,
      quantity_received: Number(receiptForm.quantity_received),
      notes: receiptForm.notes || null,
    }),
    onSuccess: async () => {
      setReceiptForm({ batch_id: "", warehouse_id: "", quantity_received: "", notes: "" });
      setError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["batches"] }),
        queryClient.invalidateQueries({ queryKey: ["balances"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
      ]);
    },
    onError: () => setError("Receipt failed. Ensure received quantity matches released quantity."),
  });

  const approveRequest = useMutation({
    mutationFn: async (request: AllocationRequest) => api.post<AllocationRequest>(`/distribution/requests/${request.id}/approve`, {
      approved_quantity: Number(approvedQuantities[request.id] || request.quantity),
      review_notes: reviewNotes[request.id] || null,
    }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["distribution-requests"] }),
  });

  const rejectRequest = useMutation({
    mutationFn: async (request: AllocationRequest) => api.post<AllocationRequest>(`/distribution/requests/${request.id}/reject`, {
      review_notes: reviewNotes[request.id] || "Warehouse cannot fulfill this request.",
    }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["distribution-requests"] }),
  });

  const dispatchRequest = useMutation({
    mutationFn: async (requestId: string) => api.post<DispatchOrder>(`/distribution/requests/${requestId}/dispatch`),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["distribution-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["dispatches"] }),
        queryClient.invalidateQueries({ queryKey: ["balances"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
      ]);
    },
    onError: () => setError("Dispatch failed. Check warehouse stock is available."),
  });

  return (
    <AppShell title="Warehouse Operations" description="Manage warehouses, receipt batches, and fulfill distribution requests.">
      {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      
      <section className="grid gap-6 xl:grid-cols-[380px_420px_1fr]">
        <form onSubmit={(e) => { e.preventDefault(); createWarehouse.mutate(); }} className="rounded-md border border-line bg-white p-4">
          <div className="mb-4 flex items-center gap-2">
            <Warehouse className="h-5 w-5 text-brand" />
            <h2 className="text-sm font-semibold text-ink">Create Warehouse</h2>
          </div>
          <div className="space-y-4">
            <TextField label="Warehouse Name" value={warehouseForm.name} onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })} required />
            <TextField label="Location" value={warehouseForm.location} onChange={(e) => setWarehouseForm({ ...warehouseForm, location: e.target.value })} />
            <ActionButton disabled={createWarehouse.isPending} type="submit">Save Warehouse</ActionButton>
          </div>
        </form>

        <form onSubmit={(e) => { e.preventDefault(); receiveBatch.mutate(); }} className="rounded-md border border-line bg-white p-4">
          <div className="mb-4 flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-brand" />
            <h2 className="text-sm font-semibold text-ink">Receipt Manufacturing Batch</h2>
          </div>
          <div className="space-y-4">
            <SelectField label="Released Batch" value={receiptForm.batch_id} onChange={(e) => {
              const batch = releasedBatches.find((b) => b.id === e.target.value);
              setReceiptForm({ ...receiptForm, batch_id: e.target.value, quantity_received: batch ? String(batch.quantity) : "" });
            }} required>
              <option value="">Select batch</option>
              {releasedBatches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.batch_number} - {productNameById.get(batch.product_id) ?? "Product"} ({batch.quantity})
                </option>
              ))}
            </SelectField>
            <SelectField label="Warehouse" value={receiptForm.warehouse_id} onChange={(e) => setReceiptForm({ ...receiptForm, warehouse_id: e.target.value })} required>
              <option value="">Select warehouse</option>
              {(warehouses.data ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </SelectField>
            <TextField label="Quantity Received" type="number" min={1} value={receiptForm.quantity_received} onChange={(e) => setReceiptForm({ ...receiptForm, quantity_received: e.target.value })} required />
            <ActionButton disabled={receiveBatch.isPending} type="submit">Confirm Receipt</ActionButton>
          </div>
        </form>

        <section className="rounded-md border border-line bg-white">
          <div className="border-b border-line px-4 py-3"><h2 className="text-sm font-semibold text-ink">Active Warehouses</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-panel text-xs uppercase text-slate-500">
                <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(warehouses.data ?? []).map((w) => (
                  <tr key={w.id}>
                    <td className="px-4 py-3 font-medium text-ink">{w.name}</td>
                    <td className="px-4 py-3 text-slate-600">{w.location ?? "-"}</td>
                    <td className="px-4 py-3"><StatusBadge tone={w.is_active ? "success" : "warning"}>{w.is_active ? "Active" : "Inactive"}</StatusBadge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      {/* WAREHOUSE WORKBENCH MOVED HERE */}
      <section className="mt-6 rounded-md border border-line bg-white">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Warehouse Workbench (Fulfillment)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-left text-sm">
            <thead className="bg-panel text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Warehouse</th>
                <th className="px-4 py-3">Hub</th>
                <th className="px-4 py-3">Requested</th>
                <th className="px-4 py-3">Approved Qty</th>
                <th className="px-4 py-3">Warehouse Note</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {warehouseQueue.map((request) => (
                <tr key={request.id}>
                  <td className="px-4 py-3 font-medium text-ink">{productNameById.get(request.product_id) ?? request.product_id}</td>
                  <td className="px-4 py-3 text-slate-600">{warehouseNameById.get(request.warehouse_id) ?? request.warehouse_id}</td>
                  <td className="px-4 py-3 text-slate-600">{hubNameById.get(request.hub_id) ?? request.hub_id}</td>
                  <td className="px-4 py-3 text-slate-600">{request.quantity}</td>
                  <td className="px-4 py-3">
                    {request.status === "PENDING" ? (
                      <input className="h-9 w-24 rounded-md border border-line px-2" min={1} max={request.quantity} type="number" value={approvedQuantities[request.id] ?? String(request.quantity)} onChange={(e) => setApprovedQuantities({ ...approvedQuantities, [request.id]: e.target.value })} />
                    ) : (
                      request.approved_quantity ?? "-"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {request.status === "PENDING" ? (
                      <input className="h-9 w-64 rounded-md border border-line px-2" placeholder="Availability note" value={reviewNotes[request.id] ?? ""} onChange={(e) => setReviewNotes({ ...reviewNotes, [request.id]: e.target.value })} />
                    ) : (
                      <span className="text-slate-600">{request.review_notes ?? "-"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3"><StatusBadge tone={requestTone(request.status)}>{request.status}</StatusBadge></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {request.status === "PENDING" && (
                        <>
                          <ActionButton variant="secondary" onClick={() => approveRequest.mutate(request)} type="button"><Check className="h-4 w-4" />Approve</ActionButton>
                          <ActionButton variant="secondary" onClick={() => rejectRequest.mutate(request)} type="button"><X className="h-4 w-4" />Reject</ActionButton>
                        </>
                      )}
                      {request.status === "APPROVED" && (
                        <ActionButton variant="secondary" onClick={() => dispatchRequest.mutate(request.id)} type="button"><Send className="h-4 w-4" />Dispatch</ActionButton>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!warehouseQueue.length && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">No requests awaiting warehouse action.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}