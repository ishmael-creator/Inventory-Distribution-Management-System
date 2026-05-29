"use client";

import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Truck, CheckCircle, Package, ClipboardList, Check, X, Boxes } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api";
import type { ProductPage, AllocationRequest, HubRecord, InventoryBalance, DispatchOrder } from "@/types/inventory";

export default function WarehouseDashboardPage() {
  const queryClient = useQueryClient();

  const [activeWarehouseId, setActiveWarehouseId] = useState<string>("");

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

  // NEW: Fetch dispatches to track if a request has been sent
  const dispatches = useQuery({ 
    queryKey: ["dispatches"], 
    queryFn: async () => (await api.get<DispatchOrder[]>("/distribution/dispatches")).data 
  });

  const productNameById = useMemo(() => new Map((products.data?.items ?? []).map((product) => [product.id, product.name])), [products.data?.items]);
  const hubNameById = useMemo(() => new Map((hubs.data ?? []).map((item) => [item.id, item.name])), [hubs.data]);
  
  // NEW: Map dispatches to their parent requests
  const dispatchByRequestId = useMemo(() => new Map((dispatches.data ?? []).filter((d) => d.allocation_request_id).map((d) => [d.allocation_request_id, d])), [dispatches.data]);

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

  const receiveBatch = useMutation({
    mutationFn: async (batchId: string) => api.post(`/manufacturing/batches/${batchId}/receive`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["batches"] });
      await queryClient.invalidateQueries({ queryKey: ["warehouse-balances"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });

  const approveRequest = useMutation({
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

  return (
    <AppShell title="Warehouse Operations" description="Manage incoming deliveries, inventory, and hub requests.">
      
      <div className="mb-6 flex flex-wrap gap-2 border-b border-line pb-4">
        {(warehouses.data ?? []).map((wh: any) => (
          <button
            key={wh.id}
            onClick={() => setActiveWarehouseId(wh.id)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
              activeWarehouseId === wh.id ? "bg-brand text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {wh.name}
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* INBOUND QUEUE (From Manufacturing) */}
        <section className="rounded-md border border-line bg-white shadow-sm h-fit">
          <div className="flex items-center gap-2 border-b border-line bg-blue-50/50 px-4 py-3">
            <Truck className="h-5 w-5 text-blue-600" />
            <h2 className="text-sm font-semibold text-blue-900">Inbound Delivery Queue</h2>
            <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">{incomingDeliveries.length}</span>
          </div>
          <div className="p-4 space-y-4">
            {incomingDeliveries.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-sm">No trucks arriving.</div>
            ) : (
              incomingDeliveries.map((batch) => (
                <div key={batch.id} className="flex items-center justify-between rounded-lg border border-line bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="rounded-md bg-slate-100 p-2"><Package className="h-5 w-5 text-slate-600" /></div>
                    <div>
                      <p className="font-semibold text-ink">{productNameById.get(batch.product_id) ?? "Product"}</p>
                      <p className="text-sm text-slate-600">{batch.quantity} Units | {batch.batch_number}</p>
                    </div>
                  </div>
                  <ActionButton onClick={() => receiveBatch.mutate(batch.id)} disabled={receiveBatch.isPending}>
                    Confirm Receipt
                  </ActionButton>
                </div>
              ))
            )}
          </div>
        </section>

        {/* OUTBOUND QUEUE (To Hubs) */}
        <section className="rounded-md border border-line bg-white shadow-sm h-fit">
          <div className="flex items-center gap-2 border-b border-line bg-amber-50/50 px-4 py-3">
            <ClipboardList className="h-5 w-5 text-amber-600" />
            <h2 className="text-sm font-semibold text-amber-900">Hub Request Inbox</h2>
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">{activeRequests.length}</span>
          </div>
          <div className="p-4 space-y-4">
            {activeRequests.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-sm">No pending or approved requests.</div>
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
                      
                      <StatusBadge tone={req.status === "PENDING" ? "warning" : (isDispatched ? "info" : "success")}>
                        {req.status === "PENDING" ? "PENDING" : (isDispatched ? "DISPATCHED" : "APPROVED")}
                      </StatusBadge>
                    </div>
                    
                    {req.status === "PENDING" && (
                      <div className="flex gap-2">
                        <ActionButton className="w-1/2 bg-green-600 hover:bg-green-700" onClick={() => approveRequest.mutate(req.id)} disabled={approveRequest.isPending || rejectRequest.isPending}>
                          <Check className="h-4 w-4 mr-1" /> Approve
                        </ActionButton>
                        <ActionButton className="w-1/2" variant="secondary" onClick={() => rejectRequest.mutate(req.id)} disabled={approveRequest.isPending || rejectRequest.isPending}>
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

      {/* INTERNAL WAREHOUSE INVENTORY VIEWER */}
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
              {currentInventory.map((balance) => (
                <tr key={balance.id}>
                  <td className="px-4 py-3 font-medium text-ink">{productNameById.get(balance.product_id) ?? balance.product_id}</td>
                  <td className="px-4 py-3 font-bold text-brand">{balance.quantity - balance.reserved_quantity} Units</td>
                </tr>
              ))}
              {!currentInventory.length && <tr><td colSpan={2} className="px-4 py-8 text-center text-slate-500">This warehouse is currently empty.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

    </AppShell>
  );
}