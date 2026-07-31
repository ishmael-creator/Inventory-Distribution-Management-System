"use client";

import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Truck, CheckCircle, Package, ClipboardList, Check, X, Boxes, Ship, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { SelectField, TextField } from "@/components/ui/form-field";
import { api } from "@/lib/api";
import type { ProductPage, AllocationRequest, HubRecord, InventoryBalance, DispatchOrder } from "@/types/inventory";

export default function WarehouseDashboardPage() {
  const queryClient = useQueryClient();
  const [activeWarehouseId, setActiveWarehouseId] = useState<string>("");
  
  const [isImportFormOpen, setIsImportFormOpen] = useState(false);
  const [importForm, setImportForm] = useState({ product_id: "", quantity: "100", notes: "" });
  
  // NEW: Receipt Form State
  const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(null);
  const [receiptForm, setReceiptForm] = useState({ received: 0, damaged: 0, missing: 0, notes: "" });

  const [error, setError] = useState<string | null>(null);

  const warehouses = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const res = await api.get<any>("/warehouses");
      return Array.isArray(res.data) ? res.data : (res.data?.items ?? []);
    },
  });

  const batches = useQuery({
    queryKey: ["batches"],
    queryFn: async () => (await api.get<any[]>("/manufacturing/batches")).data,
  });

  const products = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await api.get<ProductPage>("/products")).data,
  });

  const hubs = useQuery({
    queryKey: ["hubs"],
    queryFn: async () => (await api.get<HubRecord[]>("/distribution/hubs")).data
  });

  const requests = useQuery({
    queryKey: ["distribution-requests"],
    queryFn: async () => (await api.get<AllocationRequest[]>("/distribution/requests")).data
  });

  const balances = useQuery({
    queryKey: ["warehouse-balances"],
    queryFn: async () => (await api.get<InventoryBalance[]>("/inventory/balances")).data
  });

  const dispatches = useQuery({
    queryKey: ["dispatches"],
    queryFn: async () => (await api.get<DispatchOrder[]>("/distribution/dispatches")).data
  });

  const productNameById = useMemo(() => new Map((products.data?.items ?? []).map((product) => [product.id, product.name])), [products.data?.items]);
  const hubNameById = useMemo(() => new Map((hubs.data ?? []).map((item) => [item.id, item.name])), [hubs.data]);
  const dispatchByRequestId = useMemo(() => new Map((dispatches.data ?? []).filter((d) => d.allocation_request_id).map((d) => [d.allocation_request_id, d])), [dispatches.data]);

  const importedProducts = useMemo(() => {
    return (products.data?.items ?? []).filter(p => p.sku === "EPC" || p.name === "EPC");
  }, [products.data?.items]);

  useEffect(() => {
    if (warehouses.data && warehouses.data.length > 0 && !activeWarehouseId) {
      setActiveWarehouseId(warehouses.data[0].id);
    }
  }, [warehouses.data, activeWarehouseId]);

  const incomingDeliveries = useMemo(() => {
    return (batches.data ?? []).filter((batch) => batch.status === "RELEASED_TO_WAREHOUSE" && batch.destination_id === activeWarehouseId);
  }, [batches.data, activeWarehouseId]);

  const activeRequests = useMemo(() => {
    return (requests.data ?? []).filter(
      (req) => (req.status === "PENDING" || req.status === "APPROVED") && req.warehouse_id === activeWarehouseId
    );
  }, [requests.data, activeWarehouseId]);

  const currentInventory = useMemo(() => {
    return (balances.data ?? []).filter((bal) => bal.location_type === "WAREHOUSE" && bal.location_id === activeWarehouseId);
  }, [balances.data, activeWarehouseId]);

  // THE FIX: Updated to support Phase 2 math validation
  const receiveBatch = useMutation({
    mutationFn: async (payload: any) => api.post(`/warehouses/receipts`, payload),
    onSuccess: async () => {
      setExpandedReceiptId(null);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["batches"] });
      await queryClient.invalidateQueries({ queryKey: ["warehouse-balances"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (err: any) => setError(err.response?.data?.detail || "Failed to receive batch.")
  });

  const acceptRequest = useMutation({
    mutationFn: async (requestId: string) => api.post(`/distribution/requests/${requestId}/approve`, {}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["distribution-requests"] });
    },
  });

  const rejectRequest = useMutation({
    mutationFn: async (requestId: string) => api.post(`/distribution/requests/${requestId}/reject`, { review_notes: "Rejected by Warehouse Operations" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["distribution-requests"] });
    },
  });

  const dispatchRequest = useMutation({
    mutationFn: async (requestId: string) => api.post(`/distribution/requests/${requestId}/dispatch`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["distribution-requests"] });
      await queryClient.invalidateQueries({ queryKey: ["dispatches"] });
      await queryClient.invalidateQueries({ queryKey: ["warehouse-balances"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });

  const logDirectImport = useMutation({
    mutationFn: async () => api.post(`/warehouses/${activeWarehouseId}/import`, {
      product_id: importForm.product_id,
      quantity: Number(importForm.quantity),
      notes: importForm.notes || "Direct import from external supplier"
    }),
    onSuccess: async () => {
      setImportForm({ product_id: "", quantity: "100", notes: "" });
      setError(null);
      setIsImportFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["warehouse-balances"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: () => setError("Failed to log import. Make sure you selected a valid product."),
  });

  return (
    <AppShell title="Central Warehouse" description="Manage incoming deliveries, direct imports, and hub requests.">
      {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {/* DIRECT IMPORT BAR */}
      <section className="mb-6">
        <div className="rounded-md border border-line bg-white shadow-sm overflow-hidden transition-all">
          <button
            type="button"
            onClick={() => setIsImportFormOpen(!isImportFormOpen)}
            className="flex w-full items-center justify-between bg-white px-6 py-4 hover:bg-slate-50 transition-colors focus:outline-none"
          >
            <div className="flex items-center gap-3">
              <Ship className="h-6 w-6 text-brand" />
              <h2 className="text-lg font-semibold text-ink">Log Direct Import (External Sourcing)</h2>
            </div>
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              {isImportFormOpen ? "Close" : "Open Form"}
              {isImportFormOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </div>
          </button>

          {isImportFormOpen && (
            <div className="border-t border-line bg-slate-50/50 p-6">
              <form onSubmit={(e) => { e.preventDefault(); logDirectImport.mutate(); }}>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <SelectField label="Imported Product" value={importForm.product_id} onChange={(e) => setImportForm({ ...importForm, product_id: e.target.value })} required>
                    <option value="">Select product</option>
                    {importedProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </SelectField>
                  <TextField label="Quantity Received" min={1} type="number" value={importForm.quantity} onChange={(e) => setImportForm({ ...importForm, quantity: e.target.value })} required />
                  <TextField label="Import Notes (Optional)" value={importForm.notes} onChange={(e) => setImportForm({ ...importForm, notes: e.target.value })} />
                  <div className="md:col-span-2 lg:col-span-3 mt-2">
                    <ActionButton disabled={logDirectImport.isPending || !activeWarehouseId} type="submit" className="w-full h-12 text-base">
                      {logDirectImport.isPending ? "Processing..." : "Add Import to Inventory"}
                    </ActionButton>
                  </div>
                </div>
              </form>
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* INBOUND DELIVERY QUEUE */}
        <section className="rounded-md border border-line bg-white shadow-sm h-fit">
          <div className="flex items-center gap-2 border-b border-line bg-blue-50/50 px-4 py-3">
            <Truck className="h-5 w-5 text-blue-600" />
            <h2 className="text-sm font-semibold text-blue-900">Inbound Delivery Queue</h2>
            <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">{incomingDeliveries.length}</span>
          </div>
          <div className="p-4 space-y-4">
            {incomingDeliveries.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-sm">No trucks arriving from manufacturing.</div>
            ) : (
              incomingDeliveries.map((batch) => {
                const isExpanded = expandedReceiptId === batch.id;
                const totalReported = Number(receiptForm.received) + Number(receiptForm.damaged) + Number(receiptForm.missing);
                const isMathValid = totalReported === batch.quantity;

                return (
                  <div key={batch.id} className="flex flex-col gap-4 rounded-lg border border-line bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="rounded-md bg-slate-100 p-2"><Package className="h-5 w-5 text-slate-600" /></div>
                        <div>
                          <p className="font-semibold text-ink">{productNameById.get(batch.product_id) ?? "Product"}</p>
                          <p className="text-sm text-slate-600">Expected: <strong className="text-brand">{batch.quantity} Units</strong> | {batch.batch_number}</p>
                        </div>
                      </div>
                      
                      {!isExpanded && (
                        <ActionButton onClick={() => {
                          setExpandedReceiptId(batch.id);
                          setReceiptForm({ received: batch.quantity, damaged: 0, missing: 0, notes: "" });
                        }}>
                          Log Receipt
                        </ActionButton>
                      )}
                    </div>

                    {/* NEW: EXPANDABLE DISCREPANCY FORM */}
                    {isExpanded && (
                      <div className="border-t border-line pt-4 grid gap-4">
                        <div className="p-3 bg-blue-50 rounded-md border border-blue-100">
                          <p className="text-sm font-semibold text-blue-900 flex items-center gap-1"><AlertTriangle className="h-4 w-4"/> Delivery Discrepancy Check</p>
                          {/* <p className="text-xs text-blue-700 mt-1">You must account for exactly <strong>{batch.quantity} units</strong> to unlock the submit button.</p> */}
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <TextField label="Good (Sellable)" type="number" min={0} value={receiptForm.received} onChange={(e) => setReceiptForm({...receiptForm, received: Number(e.target.value)})} />
                          <TextField label="Damaged" type="number" min={0} value={receiptForm.damaged} onChange={(e) => setReceiptForm({...receiptForm, damaged: Number(e.target.value)})} />
                          <TextField label="Missing" type="number" min={0} value={receiptForm.missing} onChange={(e) => setReceiptForm({...receiptForm, missing: Number(e.target.value)})} />
                        </div>
                        
                        <TextField label="Discrepancy Notes" placeholder="Required if damaged or missing..." value={receiptForm.notes} onChange={(e) => setReceiptForm({...receiptForm, notes: e.target.value})} />

                        <div className="flex gap-2 justify-end mt-2">
                          <ActionButton variant="secondary" onClick={() => setExpandedReceiptId(null)}>Cancel</ActionButton>
                          <ActionButton 
                            disabled={!isMathValid || receiveBatch.isPending || ((receiptForm.damaged > 0 || receiptForm.missing > 0) && !receiptForm.notes)} 
                            onClick={() => receiveBatch.mutate({ 
                              batch_id: batch.id, 
                              warehouse_id: activeWarehouseId,
                              quantity_received: receiptForm.received, 
                              damaged_quantity: receiptForm.damaged, 
                              missing_quantity: receiptForm.missing, 
                              notes: receiptForm.notes 
                            })}
                          >
                            <CheckCircle className="h-4 w-4 mr-2" /> Confirm & Process
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

        {/* HUB REQUEST INBOX */}
        <section className="rounded-md border border-line bg-white shadow-sm h-fit">
          <div className="flex items-center gap-2 border-b border-line bg-amber-50/50 px-4 py-3">
            <ClipboardList className="h-5 w-5 text-amber-600" />
            <h2 className="text-sm font-semibold text-amber-900">Hub Request Inbox</h2>
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">{activeRequests.length}</span>
          </div>
          <div className="p-4 space-y-4">
            {activeRequests.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-sm">No pending or accepted requests.</div>
            ) : (
              activeRequests.map((req) => {
                const isDispatched = !!dispatchByRequestId.get(req.id);
                return (
                  <div key={req.id} className="flex flex-col gap-4 rounded-lg border border-line bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-brand">Destination: {req.hub_id ? hubNameById.get(req.hub_id) : "Hub"}</p>
                        <p className="mt-1 font-semibold text-ink">{productNameById.get(req.product_id) ?? "Product"}</p>
                        <p className="text-sm text-slate-600">Requested: {req.quantity} Units</p>
                      </div>
                      <StatusBadge tone={req.status === "PENDING" ? "warning" : (isDispatched ? "neutral" : "success")}>
                        {req.status === "PENDING" ? "PENDING" : (isDispatched ? "DISPATCHED" : "ACCEPTED")}
                      </StatusBadge>
                    </div>

                    {req.status === "PENDING" && (
                      <div className="flex gap-2">
                        <ActionButton className="w-1/2 bg-green-600 hover:bg-green-700" onClick={() => acceptRequest.mutate(req.id)} disabled={acceptRequest.isPending || rejectRequest.isPending}>
                          <Check className="h-4 w-4 mr-1" /> Accept
                        </ActionButton>
                        <ActionButton className="w-1/2" variant="secondary" onClick={() => rejectRequest.mutate(req.id)} disabled={acceptRequest.isPending || rejectRequest.isPending}>
                          <X className="h-4 w-4 mr-1" /> Reject
                        </ActionButton>
                      </div>
                    )}
                    {req.status === "APPROVED" && !isDispatched && (
                      <ActionButton
                        className="w-full bg-brand hover:bg-teal-800"
                        onClick={() => dispatchRequest.mutate(req.id)}
                        disabled={dispatchRequest.isPending}
                      >
                        <Truck className="h-4 w-4 mr-2" /> Dispatch to Hub
                      </ActionButton>
                    )}
                    {req.status === "APPROVED" && isDispatched && (
                      <div className="flex items-center justify-center rounded-md bg-blue-50 py-2 text-sm font-medium text-blue-700">
                        <Truck className="mr-2 h-4 w-4" />
                        Dispatched, awaiting Hub Receipt...
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      <section className="mt-8 rounded-md border border-line bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Boxes className="h-5 w-5 text-slate-600" />
          <h2 className="text-sm font-semibold text-ink">My Available Inventory</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-panel text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Product Name</th>
                <th className="px-4 py-3">Available Quantity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(products.data?.items ?? []).map((product) => {
                const bal = currentInventory.find(b => b.product_id === product.id);
                const qty = bal ? bal.quantity - bal.reserved_quantity : 0;
                return (
                  <tr key={product.id}>
                    <td className="px-4 py-3 font-medium text-ink">{product.name}</td>
                    <td className="px-4 py-3 font-bold text-brand">{qty} Units</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}