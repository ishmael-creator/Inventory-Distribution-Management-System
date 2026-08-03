"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Store, Boxes, PackageX, AlertTriangle, Truck, Undo2, Import, Send } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { ActionButton } from "@/components/ui/action-button";
import { SelectField, TextField } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type { AllocationRequest, ProductBatch, ProductPage, WarehouseRecord, InventoryBalance, HubRecord, DispatchOrder } from "@/types/inventory";

export default function WarehousePage() {
  const queryClient = useQueryClient();
  const userRole = useAuthStore((state) => state.userRole);

  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [receiptForm, setReceiptForm] = useState({ received: 0, damaged: 0, missing: 0, notes: "" });

  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
  const [reviewForm, setReviewForm] = useState({ approved_quantity: 0, review_notes: "" });

  const [factoryReturnForm, setFactoryReturnForm] = useState({ product_id: "", quantity: "1", reason: "" });
  const [importForm, setImportForm] = useState({ product_id: "", quantity: "1", notes: "" });

  const [error, setError] = useState<string | null>(null);

  // Queries
  const products = useQuery({ queryKey: ["products"], queryFn: async () => (await api.get<ProductPage>("/products")).data });
  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: async () => (await api.get<WarehouseRecord[]>("/warehouses")).data });
  const hubs = useQuery({ queryKey: ["hubs"], queryFn: async () => (await api.get<HubRecord[]>("/distribution/hubs")).data });
  const batches = useQuery({ queryKey: ["batches"], queryFn: async () => (await api.get<ProductBatch[]>("/manufacturing/batches")).data });
  const requests = useQuery({ queryKey: ["distribution-requests"], queryFn: async () => (await api.get<AllocationRequest[]>("/distribution/requests")).data });
  const balances = useQuery({ queryKey: ["balances"], queryFn: async () => (await api.get<InventoryBalance[]>("/inventory/balances?location_type=WAREHOUSE")).data });
  const dispatches = useQuery({ queryKey: ["dispatches"], queryFn: async () => (await api.get<DispatchOrder[]>("/distribution/dispatches")).data });

  const centralWarehouse = Array.isArray(warehouses.data) ? warehouses.data[0] : null;

  const productNameById = useMemo(() => new Map((products.data?.items ?? []).map((p) => [p.id, p.name])), [products.data?.items]);
  const hubNameById = useMemo(() => new Map((hubs.data ?? []).map((h) => [h.id, h.name])), [hubs.data]);

  // Derived Queues
  const inboundBatches = useMemo(() => (batches.data ?? []).filter(b => b.status === "RELEASED_TO_WAREHOUSE"), [batches.data]);
  
  const pendingRequests = useMemo(() => (requests.data ?? []).filter(r => r.status === "PENDING" || r.status === "APPROVED"), [requests.data]);

  // REVERSE LOGISTICS: Hubs -> Warehouse
  const inboundHubReturns = useMemo(() => {
    return (dispatches.data ?? []).filter(d =>
      d.from_location_type === "HUB" &&
      d.to_location_type === "WAREHOUSE" &&
      d.status === "DISPATCHED"
    );
  }, [dispatches.data]);

  // Mutations
  const receiveBatch = useMutation({
    mutationFn: async (payload: any) => api.post("/warehouses/receipts", payload),
    onSuccess: async () => {
      setExpandedBatchId(null);
      setError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["batches"] }),
        queryClient.invalidateQueries({ queryKey: ["balances"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] })
      ]);
    },
    onError: (err: any) => setError(err.response?.data?.detail || "Failed to log receipt.")
  });

  const approveRequest = useMutation({
    mutationFn: async ({ id, ...data }: any) => api.post(`/distribution/requests/${id}/approve`, data),
    onSuccess: async () => { setExpandedRequestId(null); setError(null); await queryClient.invalidateQueries({ queryKey: ["distribution-requests"] }); },
    onError: (err: any) => setError(err.response?.data?.detail || "Failed to approve request.")
  });

  const rejectRequest = useMutation({
    mutationFn: async ({ id, ...data }: any) => api.post(`/distribution/requests/${id}/reject`, data),
    onSuccess: async () => { setExpandedRequestId(null); setError(null); await queryClient.invalidateQueries({ queryKey: ["distribution-requests"] }); },
    onError: (err: any) => setError(err.response?.data?.detail || "Failed to reject request.")
  });

  const dispatchTruck = useMutation({
    mutationFn: async (id: string) => api.post(`/distribution/requests/${id}/dispatch`),
    onSuccess: async () => {
      setError(null);
      alert("Truck officially dispatched! Stock has been deducted.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["distribution-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["balances"] })
      ]);
    },
    onError: (err: any) => setError(err.response?.data?.detail || "Failed to dispatch. Ensure you have enough physical stock.")
  });

  const receiveHubReturn = useMutation({
    mutationFn: async ({ dispatch_order_id, quantity }: { dispatch_order_id: string, quantity: number }) =>
      api.post("/distribution/reverse-logistics/receive", {
        dispatch_order_id,
        quantity_received: quantity,
        notes: "Received damaged goods from Hub."
      }),
    onSuccess: async () => {
      setError(null);
      alert("Returned goods successfully received into Warehouse Quarantine.");
      await queryClient.invalidateQueries({ queryKey: ["balances"] });
      await queryClient.invalidateQueries({ queryKey: ["dispatches"] });
    },
    onError: (err: any) => setError(err.response?.data?.detail || "Failed to process return.")
  });

  const dispatchToFactory = useMutation({
    mutationFn: async () => {
      if (!centralWarehouse) throw new Error("Warehouse not found.");

      return api.post("/distribution/reverse-logistics/dispatch", {
        source_location_type: "WAREHOUSE",
        source_location_id: centralWarehouse.id,
        destination_location_type: "MANUFACTURER",
        destination_location_id: centralWarehouse.id, // Dummy ID, backend handles actual routing now!
        product_id: factoryReturnForm.product_id,
        quantity: Number(factoryReturnForm.quantity),
        reason: factoryReturnForm.reason
      });
    },
    onSuccess: async () => {
      setFactoryReturnForm({ product_id: "", quantity: "1", reason: "" });
      setError(null);
      alert("Damaged stock successfully dispatched back to the Manufacturer!");
      await queryClient.invalidateQueries({ queryKey: ["balances"] });
      await queryClient.invalidateQueries({ queryKey: ["dispatches"] });
    },
    onError: (err: any) => setError(err.message || err.response?.data?.detail || "Failed to dispatch return.")
  });

  const directImport = useMutation({
    mutationFn: async () => api.post(`/warehouses/${centralWarehouse?.id}/import`, {
      product_id: importForm.product_id,
      quantity: Number(importForm.quantity),
      notes: importForm.notes
    }),
    onSuccess: async () => {
      setImportForm({ product_id: "", quantity: "1", notes: "" });
      setError(null);
      alert("Stock successfully imported directly to Warehouse!");
      await queryClient.invalidateQueries({ queryKey: ["balances"] });
    },
    onError: (err: any) => setError(err.response?.data?.detail || "Import failed.")
  });

  const canManage = userRole === "WAREHOUSE_OFFICER" || userRole === "SUPER_ADMIN" || userRole === "MANAGER";

  return (
    <AppShell title="Central Warehouse Operations" description="Manage inbound factory deliveries, external imports, and outbound hub requests.">
      {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid gap-6 xl:grid-cols-2">
        {/* INBOUND MANUFACTURED BATCHES */}
        <section className="rounded-md border border-line bg-white h-fit shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line bg-blue-50/50 px-4 py-3">
            <Truck className="h-5 w-5 text-blue-600" />
            <h2 className="text-sm font-semibold text-blue-900">Inbound Manufacturer Deliveries</h2>
          </div>
          <div className="p-4 space-y-4">
            {inboundBatches.length === 0 ? (
               <div className="py-8 text-center text-slate-500 text-sm">No incoming shipments from the manufacturer.</div>
            ) : (
              inboundBatches.map((batch) => {
                const isExpanded = expandedBatchId === batch.id;
                const totalReported = Number(receiptForm.received) + Number(receiptForm.damaged) + Number(receiptForm.missing);
                const isMathValid = totalReported === batch.quantity;

                return (
                  <div key={batch.id} className="flex flex-col gap-4 rounded-lg border border-line bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-ink">{productNameById.get(batch.product_id) ?? batch.product_id}</p>
                        <p className="text-sm text-slate-600">Expected: <strong className="text-brand">{batch.quantity} Units</strong></p>
                        <p className="text-xs font-mono text-slate-400 mt-1">{batch.batch_number}</p>
                      </div>
                      {!isExpanded && (
                        <ActionButton disabled={!canManage} variant="secondary" onClick={() => {
                          setExpandedBatchId(batch.id);
                          setReceiptForm({ received: batch.quantity, damaged: 0, missing: 0, notes: "" });
                        }}>
                          Process Receipt
                        </ActionButton>
                      )}
                    </div>

                    {isExpanded && (
                      <div className="border-t border-line pt-4 grid gap-4">
                        <div className="p-3 bg-blue-50 rounded-md border border-blue-100">
                          <p className="text-sm font-semibold text-blue-900 flex items-center gap-1"><AlertTriangle className="h-4 w-4"/> Verification</p>
                          <p className="text-xs text-blue-700 mt-1">You must account for exactly <strong>{batch.quantity} units</strong> to log this delivery.</p>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <TextField label="Good (Sellable)" type="number" min={0} value={receiptForm.received} onChange={(e) => setReceiptForm({...receiptForm, received: Number(e.target.value)})} />
                          <TextField label="Damaged" type="number" min={0} value={receiptForm.damaged} onChange={(e) => setReceiptForm({...receiptForm, damaged: Number(e.target.value)})} />
                          <TextField label="Missing" type="number" min={0} value={receiptForm.missing} onChange={(e) => setReceiptForm({...receiptForm, missing: Number(e.target.value)})} />
                        </div>
                        <TextField label="Discrepancy Notes" placeholder="Required if damaged or missing..." value={receiptForm.notes} onChange={(e) => setReceiptForm({...receiptForm, notes: e.target.value})} />
                        <div className="flex gap-2 justify-end mt-2">
                          <ActionButton variant="secondary" onClick={() => setExpandedBatchId(null)}>Cancel</ActionButton>
                          <ActionButton
                            disabled={!isMathValid || receiveBatch.isPending || ((receiptForm.damaged > 0 || receiptForm.missing > 0) && !receiptForm.notes)}
                            onClick={() => receiveBatch.mutate({
                              batch_id: batch.id,
                              warehouse_id: centralWarehouse?.id,
                              quantity_received: receiptForm.received,
                              damaged_quantity: receiptForm.damaged,
                              missing_quantity: receiptForm.missing,
                              notes: receiptForm.notes
                            })}
                          >
                            <CheckCircle className="h-4 w-4 mr-2" /> Confirm Receipt
                          </ActionButton>
                        </div>
                        {!isMathValid && <p className="text-xs text-red-600 text-right">Current sum: {totalReported}. Must equal {batch.quantity}.</p>}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* HUB ALLOCATION REQUESTS */}
        <section className="rounded-md border border-line bg-white h-fit shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line bg-teal-50/50 px-4 py-3">
            <Store className="h-5 w-5 text-teal-700" />
            <h2 className="text-sm font-semibold text-teal-900">Pending Hub Requests</h2>
          </div>
          <div className="p-4 space-y-4">
            {pendingRequests.length === 0 ? (
               <div className="py-8 text-center text-slate-500 text-sm">No pending stock requests from Hubs.</div>
            ) : (
              pendingRequests.map((req) => {
                const isExpanded = expandedRequestId === req.id;
                const hubName = req.hub_id ? hubNameById.get(req.hub_id) : "Unknown Hub";

                return (
                  <div key={req.id} className="flex flex-col gap-4 rounded-lg border border-line bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-teal-800">{hubName}</p>
                        <p className="font-medium text-ink mt-1">{productNameById.get(req.product_id) ?? req.product_id}</p>
                        <p className="text-sm text-slate-600">
                          {req.status === "PENDING" ? "Requested: " : "Accepted: "}
                          <strong className="text-brand">
                            {req.status === "PENDING" ? req.quantity : (req.approved_quantity || req.quantity)} Units
                          </strong>
                        </p>
                      </div>

                      {!isExpanded && req.status === "PENDING" && (
                        <ActionButton disabled={!canManage} variant="secondary" onClick={() => {
                          setExpandedRequestId(req.id);
                          setReviewForm({ approved_quantity: req.quantity, review_notes: "" });
                        }}>
                          Review
                        </ActionButton>
                      )}

                      {!isExpanded && req.status === "APPROVED" && (
                        <ActionButton disabled={!canManage || dispatchTruck.isPending} onClick={() => dispatchTruck.mutate(req.id)}>
                          <Send className="h-4 w-4 mr-2" /> Dispatch
                        </ActionButton>
                      )}
                    </div>

                    {isExpanded && req.status === "PENDING" && (
                      <div className="border-t border-line pt-4 grid gap-4">
                        <TextField label="Approved Quantity" type="number" min={1} value={reviewForm.approved_quantity} onChange={(e) => setReviewForm({...reviewForm, approved_quantity: Number(e.target.value)})} />
                        <TextField label="Review Notes (Optional)" placeholder="e.g. Approved partial amount due to low central stock" value={reviewForm.review_notes} onChange={(e) => setReviewForm({...reviewForm, review_notes: e.target.value})} />
                        <div className="flex gap-2 justify-end mt-2">
                          <ActionButton variant="secondary" onClick={() => setExpandedRequestId(null)}>Cancel</ActionButton>
                          <ActionButton
                            disabled={rejectRequest.isPending || approveRequest.isPending}
                            onClick={() => {
                              const note = prompt("Reason for rejection?", "Insufficient stock");
                              if (note) rejectRequest.mutate({ id: req.id, review_notes: note });
                            }}
                            className="bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
                          >
                            <XCircle className="h-4 w-4 mr-1" /> Reject
                          </ActionButton>
                          <ActionButton
                            disabled={rejectRequest.isPending || approveRequest.isPending}
                            onClick={() => approveRequest.mutate({
                              id: req.id,
                              approved_quantity: reviewForm.approved_quantity,
                              review_notes: reviewForm.review_notes
                            })}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" /> Accept
                          </ActionButton>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2 mt-6">
        {/* INBOUND HUB RETURNS (REVERSE LOGISTICS) */}
        <section className="rounded-md border border-line bg-white h-fit shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line bg-amber-50 px-4 py-3">
            <Undo2 className="h-5 w-5 text-amber-600" />
            <h2 className="text-sm font-semibold text-amber-900">Inbound Damaged Goods (From Hubs)</h2>
          </div>
          <div className="p-4 space-y-4">
            {inboundHubReturns.length === 0 ? (
               <div className="py-8 text-center text-slate-500 text-sm">No reverse logistics shipments in transit.</div>
            ) : (
              inboundHubReturns.map((shipment) => (
                <div key={shipment.id} className="flex items-center justify-between rounded-lg border border-line bg-slate-50 p-4 shadow-sm">
                  <div>
                    <span className="mb-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-800">Damaged Return</span>
                    <p className="font-semibold text-ink">{productNameById.get(shipment.product_id) ?? "Unknown Product"}</p>
                    <p className="text-sm text-slate-600">From: <strong>{hubNameById.get(shipment.from_location_id) ?? "Unknown Hub"}</strong></p>
                    <p className="text-sm text-slate-600">Qty: <strong className="text-red-600">{shipment.quantity} Units</strong></p>
                  </div>
                  <ActionButton
                    disabled={!canManage || receiveHubReturn.isPending}
                    onClick={() => receiveHubReturn.mutate({ dispatch_order_id: shipment.id, quantity: shipment.quantity })}
                  >
                    Receive to Quarantine
                  </ActionButton>
                </div>
              ))
            )}
          </div>
        </section>

        {/* DISPATCH TO MANUFACTURER (REVERSE LOGISTICS) */}
        <section className="rounded-md border border-rose-200 bg-white h-fit shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 border-b border-rose-200 bg-rose-50 px-4 py-3">
            <PackageX className="h-5 w-5 text-rose-600" />
            <h2 className="text-sm font-semibold text-rose-900">Dispatch Quarantined Goods to Manufacturer</h2>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); dispatchToFactory.mutate(); }} className="p-6">
            <div className="grid gap-4">
              <SelectField label="Quarantined Product" value={factoryReturnForm.product_id} onChange={(e) => setFactoryReturnForm({ ...factoryReturnForm, product_id: e.target.value })} required>
                <option value="">Select product...</option>
                {(products.data?.items ?? []).map((p) => {
                  const bal = (balances.data ?? []).find(b => b.product_id === p.id);
                  if (bal && bal.reserved_quantity > 0) {
                    return <option key={p.id} value={p.id}>{p.name} ({bal.reserved_quantity} Damaged)</option>;
                  }
                  return null;
                })}
              </SelectField>
              <TextField label="Quantity to Return" min={1} type="number" value={factoryReturnForm.quantity} onChange={(e) => setFactoryReturnForm({ ...factoryReturnForm, quantity: e.target.value })} required />
              <TextField label="Return Note" placeholder="e.g. Monthly batch of broken units for assessment" value={factoryReturnForm.reason} onChange={(e) => setFactoryReturnForm({ ...factoryReturnForm, reason: e.target.value })} required />
              <div className="mt-2">
                <ActionButton disabled={dispatchToFactory.isPending || !canManage} type="submit" className="w-full h-12 text-base bg-rose-600 hover:bg-rose-700">
                  Dispatch Return Truck to Manufacturer
                </ActionButton>
              </div>
            </div>
          </form>
        </section>
      </div>

      <section className="mt-8 rounded-md border border-line bg-white shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Boxes className="h-5 w-5 text-slate-600" />
          <h2 className="text-sm font-semibold text-ink">Active Central Warehouse Inventory</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-panel text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Product Name</th>
                <th className="px-4 py-3 text-right">Total Physical Stock</th>
                <th className="px-4 py-3 text-right text-brand">Good (Sellable)</th>
                <th className="px-4 py-3 text-right text-red-600">Quarantined (Damaged)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(products.data?.items ?? []).map((product) => {
                const bal = (balances.data ?? []).find(b => b.product_id === product.id);
                const reserved = bal?.reserved_quantity || 0;
                const total = bal?.quantity || 0;
                const sellable = total - reserved;

                return (
                  <tr key={product.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-ink">{product.name}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{total} Units</td>
                    <td className="px-4 py-3 text-right font-bold text-brand">{sellable} Units</td>
                    <td className="px-4 py-3 text-right font-bold text-red-600">
                      {reserved > 0 ? reserved : <span className="text-slate-400 font-normal">0</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* EXTERNAL DIRECT IMPORT (ADMIN / WAREHOUSE TOOL) */}
      {canManage && (
        <section className="mt-8 rounded-md border border-line bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line bg-slate-50 px-6 py-4">
            <Import className="h-5 w-5 text-slate-600" />
            <h2 className="text-lg font-semibold text-ink">External Supplier Import (Bypass Manufacturer)</h2>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); directImport.mutate(); }} className="p-6">
            <div className="grid gap-4 md:grid-cols-4 items-end">
              <SelectField label="Import Product" value={importForm.product_id} onChange={(e) => setImportForm({ ...importForm, product_id: e.target.value })} required>
                <option value="">Select product...</option>
                {(products.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </SelectField>
              <TextField label="Quantity" min={1} type="number" value={importForm.quantity} onChange={(e) => setImportForm({ ...importForm, quantity: e.target.value })} required />
              <div className="md:col-span-2">
                <TextField label="Import Origin / Notes" placeholder="e.g. Container arrival from external vendor" value={importForm.notes} onChange={(e) => setImportForm({ ...importForm, notes: e.target.value })} required />
              </div>
              <div className="md:col-span-4 mt-2">
                <ActionButton disabled={directImport.isPending} type="submit" variant="secondary" className="w-full">
                  Process Direct Import into Central Warehouse
                </ActionButton>
              </div>
            </div>
          </form>
        </section>
      )}
    </AppShell>
  );
}