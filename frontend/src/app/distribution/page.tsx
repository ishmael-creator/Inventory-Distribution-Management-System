"use client";

import { useMemo, useState, Fragment } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Boxes, Settings2, ChevronDown, ChevronUp, Store, Trash2, AlertOctagon, Search, Check, Truck, ArrowRightLeft } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { ActionButton } from "@/components/ui/action-button";
import { SelectField, TextField } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type { AllocationRequest, DispatchOrder, HubRecord, ProductPage, WarehouseRecord, InventoryBalance } from "@/types/inventory";

const DEMO_HUBS = ["Ablekuma", "Konongo", "Manpong", "Offinso", "Adukrom", "Koforidua", "Oda", "Nkawkaw", "Kasoa", "Assin Fosu"];

function requestTone(status: AllocationRequest["status"]) {
  if (status === "FULFILLED") return "success";
  if (status === "APPROVED" || status === "PENDING") return "warning";
  if (status === "REJECTED") return "neutral";
  return "neutral";
}

function requestLabel(request: AllocationRequest, dispatch?: DispatchOrder) {
  if (request.status === "PENDING") return "Awaiting warehouse review";
  if (request.status === "APPROVED" && !dispatch) return "Accepted, awaiting dispatch";
  if (dispatch?.status === "DISPATCHED") return "Dispatched, awaiting hub receipt";
  if (request.status === "FULFILLED" || dispatch?.status === "RECEIVED" || dispatch?.status === "PARTIALLY_RECEIVED") return "Hub receipt confirmed";
  if (request.status === "REJECTED") return "Warehouse rejected";
  return request.status.replaceAll("_", " ");
}

export default function DistributionPage() {
  const queryClient = useQueryClient();
  const userRole = useAuthStore((state) => state.userRole);

  const [showAdminTools, setShowAdminTools] = useState(false);
  const [isRequestFormOpen, setIsRequestFormOpen] = useState(false);

  const [hubForm, setHubForm] = useState({ name: "", location: "" });
  const [requestForm, setRequestForm] = useState({ product_id: "", hub_id: "", quantity: "100", notes: "" });
  const [error, setError] = useState<string | null>(null);

  const products = useQuery({ queryKey: ["products"], queryFn: async () => (await api.get<ProductPage>("/products")).data });
  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: async () => (await api.get<WarehouseRecord[]>("/warehouses")).data });
  const hubs = useQuery({ queryKey: ["hubs"], queryFn: async () => (await api.get<HubRecord[]>("/distribution/hubs")).data });
  const requests = useQuery({ queryKey: ["distribution-requests"], queryFn: async () => (await api.get<AllocationRequest[]>("/distribution/requests")).data });
  const dispatches = useQuery({ queryKey: ["dispatches"], queryFn: async () => (await api.get<DispatchOrder[]>("/distribution/dispatches")).data });

  const warehouseBalances = useQuery({ queryKey: ["warehouse-balances"], queryFn: async () => (await api.get<InventoryBalance[]>("/inventory/balances?location_type=WAREHOUSE")).data });
  const hubBalances = useQuery({ queryKey: ["hub-balances"], queryFn: async () => (await api.get<InventoryBalance[]>("/inventory/balances?location_type=HUB")).data });

  const disputes = useQuery({
    queryKey: ["disputes"],
    queryFn: async () => (await api.get<any[]>("/distribution/disputes")).data,
    enabled: userRole === "SUPER_ADMIN" || userRole === "MANAGER"
  });

  const productNameById = useMemo(() => new Map((products.data?.items ?? []).map((item) => [item.id, item.name])), [products.data?.items]);
  const hubNameById = useMemo(() => new Map((hubs.data ?? []).map((item) => [item.id, item.name])), [hubs.data]);
  const dispatchByRequestId = useMemo(() => new Map((dispatches.data ?? []).filter((d) => d.allocation_request_id).map((d) => [d.allocation_request_id, d])), [dispatches.data]);

  // THE FIX: Isolate Lateral Hub Transfers for Tracking
  const lateralTransfers = useMemo(() => {
    return (dispatches.data ?? []).filter(d => d.from_location_type === "HUB" && d.to_location_type === "HUB")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [dispatches.data]);

  const centralWarehouse = warehouses.data?.[0];

  const createHub = useMutation({
    mutationFn: async () => api.post<HubRecord>("/distribution/hubs", { ...hubForm, location: hubForm.location || null, warehouse_id: centralWarehouse?.id }),
    onSuccess: async () => { setHubForm({ name: "", location: "" }); setError(null); await queryClient.invalidateQueries({ queryKey: ["hubs"] }); }
  });

  const autoCreateDemoHubs = useMutation({
    mutationFn: async () => {
      if (!centralWarehouse) throw new Error("Warehouse required.");
      const existingHubs = hubs.data?.map(h => h.name) || [];
      for (const hubName of DEMO_HUBS) {
        if (!existingHubs.includes(hubName)) await api.post("/distribution/hubs", { name: hubName, location: "Demo Location", warehouse_id: centralWarehouse.id });
      }
    },
    onSuccess: async () => { setError(null); await queryClient.invalidateQueries({ queryKey: ["hubs"] }); },
    onError: (err: any) => setError(err.message || "Failed to generate hubs.")
  });

  const createRequest = useMutation({
    mutationFn: async () => api.post<AllocationRequest>("/distribution/requests", { product_id: requestForm.product_id, warehouse_id: centralWarehouse?.id, hub_id: requestForm.hub_id, quantity: Number(requestForm.quantity), notes: requestForm.notes || null }),
    onSuccess: async () => { setRequestForm({ product_id: "", hub_id: "", quantity: "100", notes: "" }); setError(null); setIsRequestFormOpen(false); await queryClient.invalidateQueries({ queryKey: ["distribution-requests"] }); },
    onError: () => setError("Request failed. Ensure products and hubs are properly configured."),
  });

  const deleteHub = useMutation({
    mutationFn: async (hubId: string) => api.delete(`/distribution/hubs/${hubId}`),
    onSuccess: async () => { setError(null); await queryClient.invalidateQueries({ queryKey: ["hubs"] }); },
    onError: (err: any) => setError(err.response?.data?.detail || "Failed to delete hub.")
  });

  const resolveDispute = useMutation({
    mutationFn: async ({ id, action, notes }: { id: string, action: string, notes: string }) =>
      api.post(`/distribution/disputes/${id}/resolve`, { action, notes }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["disputes"] });
      await queryClient.invalidateQueries({ queryKey: ["warehouse-balances"] });
      await queryClient.invalidateQueries({ queryKey: ["hub-balances"] });
    },
    onError: (err: any) => setError(err.response?.data?.detail || "Failed to resolve dispute.")
  });

  const handleResolveAction = (disputeId: string, action: string, promptText: string, defaultNote: string) => {
    const notes = window.prompt(promptText, defaultNote);
    if (notes !== null) {
      resolveDispute.mutate({ id: disputeId, action, notes });
    }
  };

  const activeDisputes = (disputes.data ?? []).filter(d => d.status === "PENDING" || d.status === "INVESTIGATING");
  const resolvedDisputes = (disputes.data ?? []).filter(d => d.status.startsWith("RESOLVED"));

  return (
    <AppShell title="Distribution Hub Transfers" description="Monitor hub stock levels and request inventory transfers.">
      {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <section className="mb-6 max-w-4xl">
        <div className="rounded-md border border-line bg-white shadow-sm overflow-hidden transition-all">
          <button type="button" onClick={() => setIsRequestFormOpen(!isRequestFormOpen)} className="flex w-full items-center justify-between bg-white px-6 py-4 hover:bg-slate-50 focus:outline-none">
            <div className="flex items-center gap-3">
              <ClipboardCheck className="h-6 w-6 text-brand" />
              <h2 className="text-lg font-semibold text-ink">Request Stock from Central Warehouse</h2>
            </div>
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              {isRequestFormOpen ? "Close" : "Open Form"}
              {isRequestFormOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </div>
          </button>

          {isRequestFormOpen && (
            <div className="border-t border-line bg-slate-50/50 p-6">
              <form onSubmit={(e) => { e.preventDefault(); createRequest.mutate(); }}>
                <div className="grid gap-4 md:grid-cols-3">
                  <SelectField label="Destination Hub" value={requestForm.hub_id} onChange={(e) => setRequestForm({ ...requestForm, hub_id: e.target.value })} required>
                    <option value="">Select hub</option>
                    {(hubs.data ?? []).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </SelectField>
                  <SelectField label="Product" value={requestForm.product_id} onChange={(e) => setRequestForm({ ...requestForm, product_id: e.target.value })} required>
                    <option value="">Select product</option>
                    {(products.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </SelectField>
                  <TextField label="Quantity" min={1} type="number" value={requestForm.quantity} onChange={(e) => setRequestForm({ ...requestForm, quantity: e.target.value })} required />
                  <div className="md:col-span-3 mt-2"><ActionButton disabled={createRequest.isPending || !centralWarehouse} type="submit" className="w-full h-12">Submit Allocation Request</ActionButton></div>
                </div>
              </form>
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-md border border-line bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-line bg-slate-50/50 px-4 py-3">
            <Boxes className="h-5 w-5 text-slate-600" />
            <h2 className="text-sm font-semibold text-slate-800">Central Warehouse Stock</h2>
          </div>
          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-left text-sm">
              <thead className="bg-panel text-xs uppercase text-slate-500 sticky top-0">
                <tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Available</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(products.data?.items ?? []).map((product) => {
                  const bal = (warehouseBalances.data ?? []).find(b => b.product_id === product.id && b.location_id === centralWarehouse?.id);
                  const qty = bal ? bal.quantity - bal.reserved_quantity : 0;
                  return (
                    <tr key={product.id}><td className="px-4 py-3 text-slate-600">{product.name}</td><td className="px-4 py-3 font-semibold text-brand">{qty}</td></tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-md border border-line bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-line bg-indigo-50/50 px-4 py-3">
            <Store className="h-5 w-5 text-indigo-600" />
            <h2 className="text-sm font-semibold text-slate-800">Hub Stock Levels</h2>
          </div>
          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-left text-sm">
              <thead className="bg-panel text-xs uppercase text-slate-500 sticky top-0">
                <tr><th className="px-4 py-3 w-1/3">Hub</th><th className="px-4 py-3">Product</th><th className="px-4 py-3">Qty</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(hubs.data ?? []).map((hub) => {
                  const allProducts = products.data?.items ?? [];
                  if (allProducts.length === 0) return null;
                  return (
                    <Fragment key={hub.id}>
                      {allProducts.map((product, index) => {
                        const bal = (hubBalances.data ?? []).find(b => b.location_id === hub.id && b.product_id === product.id);
                        const qty = bal ? bal.quantity - bal.reserved_quantity : 0;
                        return (
                          <tr key={`${hub.id}-${product.id}`} className="hover:bg-slate-50">
                            {index === 0 && <td rowSpan={allProducts.length} className="px-4 py-4 align-top border-r border-line bg-white w-1/3 font-semibold text-ink">{hub.name}</td>}
                            <td className="px-4 py-3 text-slate-600">{product.name}</td><td className="px-4 py-3 font-semibold text-brand">{qty}</td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* NEW: LATERAL HUB TRANSFERS TRACKING */}
      <section className="mt-6 rounded-md border border-line bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3 bg-amber-50/50">
          <ArrowRightLeft className="h-5 w-5 text-amber-600" />
          <h2 className="text-sm font-semibold text-amber-900">Lateral Hub Transfers (In Transit & Completed)</h2>
        </div>
        <div className="overflow-x-auto max-h-80">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-panel text-xs uppercase text-slate-500 sticky top-0">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Origin Hub</th>
                <th className="px-4 py-3">Destination Hub</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lateralTransfers.map((transfer) => {
                const isDispatched = transfer.status === "DISPATCHED";
                return (
                  <tr key={transfer.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-500">{new Date(transfer.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 font-medium text-ink">{productNameById.get(transfer.product_id) ?? "Unknown"}</td>
                    <td className="px-4 py-3 text-slate-600">{hubNameById.get(transfer.from_location_id) ?? "Unknown"}</td>
                    <td className="px-4 py-3 font-semibold text-ink">{hubNameById.get(transfer.to_location_id) ?? "Unknown"}</td>
                    <td className="px-4 py-3 font-bold text-slate-700">{transfer.quantity}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge tone={isDispatched ? "warning" : transfer.status === "RECEIVED" ? "success" : "neutral"}>
                        {isDispatched ? "IN TRANSIT" : transfer.status.replaceAll("_", " ")}
                      </StatusBadge>
                    </td>
                  </tr>
                );
              })}
              {lateralTransfers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">No lateral hub transfers recorded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ORIGINAL DISTRIBUTION TRACKING (Warehouse to Hub) */}
      <section className="mt-6 rounded-md border border-line bg-white shadow-sm">
        <div className="border-b border-line px-4 py-3"><h2 className="text-sm font-semibold text-ink">Central Warehouse ➔ Hub Tracking</h2></div>
        <div className="overflow-x-auto max-h-80">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-panel text-xs uppercase text-slate-500 sticky top-0">
              <tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Hub</th><th className="px-4 py-3">Requested</th><th className="px-4 py-3">State</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(requests.data ?? []).map((request) => {
                const dispatch = dispatchByRequestId.get(request.id);
                return (
                  <tr key={request.id}>
                    <td className="px-4 py-3 font-medium text-ink">{productNameById.get(request.product_id) ?? request.product_id}</td>
                    <td className="px-4 py-3 text-slate-600">{request.hub_id ? hubNameById.get(request.hub_id) ?? "-" : "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{request.quantity}</td>
                    <td className="px-4 py-3"><StatusBadge tone={requestTone(request.status)}>{requestLabel(request, dispatch)}</StatusBadge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* SUPER ADMIN ACTIVE INVESTIGATIONS BOARD */}
      {(userRole === "SUPER_ADMIN" || userRole === "MANAGER") && (
        <section className="mt-12 rounded-md border border-red-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-red-200 bg-red-50 px-4 py-3">
            <div className="flex items-center gap-2">
              <AlertOctagon className="h-5 w-5 text-red-600" />
              <h2 className="text-sm font-bold text-red-900">Active Delivery Investigations Board</h2>
              <span className="ml-2 rounded-full bg-red-200 px-2 py-0.5 text-xs font-bold text-red-800">{activeDisputes.length} Active</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-line">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3 text-red-600">Missing</th>
                  <th className="px-4 py-3 text-amber-600">Damaged</th>
                  <th className="px-4 py-3">Notes & Audit Trail</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Admin Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {activeDisputes.map((dispute) => (
                  <tr key={dispute.id} className={dispute.status === "INVESTIGATING" ? "bg-red-50/10" : "bg-slate-50"}>
                    <td className="px-4 py-3 text-slate-500">{new Date(dispute.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 font-semibold text-ink">{productNameById.get(dispute.product_id) ?? "Unknown"}</td>
                    <td className="px-4 py-3 font-bold text-red-600">{dispute.missing_quantity}</td>
                    <td className="px-4 py-3 font-bold text-amber-600">{dispute.damaged_quantity}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-[250px] whitespace-pre-wrap">{dispute.notes || "None"}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge tone={dispute.status === "PENDING" ? "warning" : "neutral"}>{dispute.status.replaceAll("_", " ")}</StatusBadge>
                    </td>
                    <td className="px-4 py-3">
                      {dispute.status === "PENDING" && (
                        <div className="flex justify-end gap-2">
                          <ActionButton variant="secondary" onClick={() => handleResolveAction(dispute.id, "INVESTIGATE", "Enter investigation reasoning:", "Suspect driver error. Contacting logistics.")}><Search className="h-4 w-4 mr-1" /> Investigate</ActionButton>
                          <ActionButton className="bg-red-600 hover:bg-red-700" onClick={() => handleResolveAction(dispute.id, "WRITE_OFF", "Enter write-off reason:", "Confirmed lost in transit.")}><Trash2 className="h-4 w-4" /></ActionButton>
                        </div>
                      )}
                      {dispute.status === "INVESTIGATING" && (
                        <div className="flex flex-col items-end gap-2">
                          {dispute.missing_quantity > 0 && (
                            <ActionButton className="w-full bg-brand" onClick={() => handleResolveAction(dispute.id, "MARK_FOUND", "Notes for recovering inventory:", "Found on truck. Recovering to inventory.")}><Check className="h-4 w-4 mr-1" /> Recover to Inventory</ActionButton>
                          )}
                          {dispute.damaged_quantity > 0 && (
                            <ActionButton className="w-full bg-amber-600 hover:bg-amber-700 text-white" onClick={() => handleResolveAction(dispute.id, "RETURN_FACTORY", "Notes for returning to factory:", "Damaged goods returned to manufacturer.")}><Truck className="h-4 w-4 mr-1" /> Return to Factory</ActionButton>
                          )}
                          <ActionButton className="w-full bg-red-600 hover:bg-red-700" onClick={() => handleResolveAction(dispute.id, "WRITE_OFF", "Enter write-off reason:", "Investigation failed. Units permanently lost.")}><Trash2 className="h-4 w-4 mr-1" /> Confirm Lost</ActionButton>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}

                {/* RESOLVED LOG */}
                {resolvedDisputes.map((dispute) => (
                  <tr key={dispute.id} className="bg-slate-100 opacity-60">
                    <td className="px-4 py-3 text-slate-500">{new Date(dispute.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 font-semibold text-slate-600">{productNameById.get(dispute.product_id) ?? "Unknown"}</td>
                    <td className="px-4 py-3">{dispute.missing_quantity}</td>
                    <td className="px-4 py-3">{dispute.damaged_quantity}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[250px] truncate">{dispute.notes}</td>
                    <td className="px-4 py-3 text-center"><span className="text-xs font-bold text-slate-500">{dispute.status.replace("_", " ")}</span></td>
                    <td className="px-4 py-3 text-right"><span className="text-xs text-slate-400">Closed</span></td>
                  </tr>
                ))}
                {disputes.data?.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No delivery investigations needed!</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ADMIN TOOLS */}
      <section className="mt-12 mb-8 border-t border-line pt-8">
        <button onClick={() => setShowAdminTools(!showAdminTools)} className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-ink">
          <Settings2 className="h-4 w-4" />
          {showAdminTools ? "Hide Advanced Tools" : "Show Advanced Tools"}
        </button>

        {showAdminTools && (
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="rounded-md border border-line bg-slate-50 p-6">
              <h3 className="font-semibold text-ink mb-2">Initialize Demo Hubs</h3>
              <p className="text-sm text-slate-600 mb-4">Clicking this will automatically create all 10 hardcoded system hubs and bind them to the Central Warehouse.</p>
              <ActionButton onClick={() => autoCreateDemoHubs.mutate()} disabled={autoCreateDemoHubs.isPending} className="w-full">
                {autoCreateDemoHubs.isPending ? "Generating..." : "Generate 10 System Hubs"}
              </ActionButton>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); createHub.mutate(); }} className="rounded-md border border-line bg-white p-6">
              <h3 className="font-semibold text-ink mb-4">Manually Create Custom Hub</h3>
              <div className="grid gap-4">
                <TextField label="Hub Name" value={hubForm.name} onChange={(e) => setHubForm({ ...hubForm, name: e.target.value })} required />
                <ActionButton disabled={createHub.isPending} type="submit" variant="secondary">Save Hub</ActionButton>
              </div>
            </form>

            {userRole === "SUPER_ADMIN" && (
              <div className="rounded-md border border-line bg-white p-6 md:col-span-2 shadow-sm">
                <h3 className="font-semibold text-ink mb-4">Manage Active Hubs</h3>
                <div className="overflow-y-auto max-h-60 border border-line rounded-md">
                  <table className="w-full text-left text-sm">
                    <tbody className="divide-y divide-line">
                      {(hubs.data ?? []).map((hub) => (
                        <tr key={hub.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-ink">{hub.name}</td>
                          <td className="px-4 py-3 text-slate-500">{hub.location || "No Location Specified"}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Are you sure you want to delete ${hub.name}? This will hide it from all screens and revoke access for its assigned officers.`)) {
                                  deleteHub.mutate(hub.id);
                                }
                              }}
                              disabled={deleteHub.isPending}
                              className="inline-flex items-center gap-1 rounded bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors"
                            >
                              <Trash2 className="h-3 w-3" /> Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                      {hubs.data?.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-500">No active hubs found.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </AppShell>
  );
}
