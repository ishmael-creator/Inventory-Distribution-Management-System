"use client";

import { useMemo, useState, Fragment } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Boxes, Settings2, ChevronDown, ChevronUp, Store } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ActionButton } from "@/components/ui/action-button";
import { SelectField, TextField } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api";
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
  if (request.status === "FULFILLED" || dispatch?.status === "RECEIVED") return "Hub receipt confirmed";
  if (request.status === "REJECTED") return "Warehouse rejected";
  return request.status.replaceAll("_", " ");
}

export default function DistributionPage() {
  const queryClient = useQueryClient();
  const [showAdminTools, setShowAdminTools] = useState(false);
  const [isRequestFormOpen, setIsRequestFormOpen] = useState(false);

  // Forms
  const [hubForm, setHubForm] = useState({ name: "", location: "" });
  const [requestForm, setRequestForm] = useState({ product_id: "", hub_id: "", quantity: "100", notes: "" });
  
  const [error, setError] = useState<string | null>(null);

  // Queries
  const products = useQuery({ queryKey: ["products"], queryFn: async () => (await api.get<ProductPage>("/products")).data });
  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: async () => (await api.get<WarehouseRecord[]>("/warehouses")).data });
  const hubs = useQuery({ queryKey: ["hubs"], queryFn: async () => (await api.get<HubRecord[]>("/distribution/hubs")).data });
  const requests = useQuery({ queryKey: ["distribution-requests"], queryFn: async () => (await api.get<AllocationRequest[]>("/distribution/requests")).data });
  const dispatches = useQuery({ queryKey: ["dispatches"], queryFn: async () => (await api.get<DispatchOrder[]>("/distribution/dispatches")).data });
  const warehouseBalances = useQuery({ queryKey: ["warehouse-balances"], queryFn: async () => (await api.get<InventoryBalance[]>("/inventory/balances?location_type=WAREHOUSE")).data });
  const hubBalances = useQuery({ queryKey: ["hub-balances"], queryFn: async () => (await api.get<InventoryBalance[]>("/inventory/balances?location_type=HUB")).data });

  const productNameById = useMemo(() => new Map((products.data?.items ?? []).map((item) => [item.id, item.name])), [products.data?.items]);
  const hubNameById = useMemo(() => new Map((hubs.data ?? []).map((item) => [item.id, item.name])), [hubs.data]);
  const dispatchByRequestId = useMemo(() => new Map((dispatches.data ?? []).filter((d) => d.allocation_request_id).map((d) => [d.allocation_request_id, d])), [dispatches.data]);
  
  const centralWarehouse = warehouses.data?.[0];

  // System Mutations
  const createHub = useMutation({
    mutationFn: async () => api.post<HubRecord>("/distribution/hubs", { ...hubForm, location: hubForm.location || null, warehouse_id: centralWarehouse?.id }),
    onSuccess: async () => { setHubForm({ name: "", location: "" }); setError(null); await queryClient.invalidateQueries({ queryKey: ["hubs"] }); }
  });

  const autoCreateDemoHubs = useMutation({
    mutationFn: async () => {
      if (!centralWarehouse) throw new Error("You must create at least one warehouse before generating hubs.");
      const existingHubs = hubs.data?.map(h => h.name) || [];
      for (const hubName of DEMO_HUBS) {
        if (!existingHubs.includes(hubName)) {
          await api.post("/distribution/hubs", { name: hubName, location: "Demo Location", warehouse_id: centralWarehouse.id });
        }
      }
    },
    onSuccess: async () => { setError(null); await queryClient.invalidateQueries({ queryKey: ["hubs"] }); },
    onError: (err: any) => setError(err.message || "Failed to generate hubs.")
  });

  const createRequest = useMutation({
    mutationFn: async () => api.post<AllocationRequest>("/distribution/requests", {
      product_id: requestForm.product_id, warehouse_id: centralWarehouse?.id, hub_id: requestForm.hub_id, quantity: Number(requestForm.quantity), notes: requestForm.notes || null,
    }),
    onSuccess: async () => { setRequestForm({ product_id: "", hub_id: "", quantity: "100", notes: "" }); setError(null); setIsRequestFormOpen(false); await queryClient.invalidateQueries({ queryKey: ["distribution-requests"] }); },
    onError: () => setError("Request failed. Ensure products and hubs are properly configured."),
  });


  return (
    <AppShell title="Distribution Hub Transfers" description="Monitor hub stock levels and request inventory transfers from the Central Warehouse.">
      {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <section className="mb-6 max-w-4xl">
        <div className="rounded-md border border-line bg-white shadow-sm overflow-hidden transition-all">
          <button
            type="button"
            onClick={() => setIsRequestFormOpen(!isRequestFormOpen)}
            className="flex w-full items-center justify-between bg-white px-6 py-4 hover:bg-slate-50 transition-colors focus:outline-none"
          >
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
                  <div className="md:col-span-3 mt-2">
                    <ActionButton disabled={createRequest.isPending || !centralWarehouse} type="submit" className="w-full h-12 text-base">Submit Allocation Request</ActionButton>
                  </div>
                </div>
              </form>
            </div>
          )}
        </div>
      </section>

      {/* CENTRAL WAREHOUSE AVAILABILITY */}
      <section className="mt-6 rounded-md border border-line bg-white">
        <div className="flex items-center gap-2 border-b border-line bg-slate-50/50 px-4 py-3">
          <Boxes className="h-5 w-5 text-slate-600" />
          <h2 className="text-sm font-semibold text-slate-800">Live Central Warehouse Availability</h2>
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
                const bal = (warehouseBalances.data ?? []).find(b => b.product_id === product.id && b.location_id === centralWarehouse?.id);
                const qty = bal ? bal.quantity - bal.reserved_quantity : 0;
                return (
                  <tr key={product.id}>
                    <td className="px-4 py-3 text-slate-600">{product.name}</td>
                    <td className="px-4 py-3 font-semibold text-brand">{qty} Units</td>
                  </tr>
                );
              })}
              {!products.data?.items.length && <tr><td colSpan={2} className="px-4 py-8 text-center text-slate-500">No products configured in the system.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* DISTRIBUTION TRACKING */}
      <section className="mt-6 rounded-md border border-line bg-white">
        <div className="border-b border-line px-4 py-3"><h2 className="text-sm font-semibold text-ink">Distribution Tracking</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-panel text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Hub</th>
                <th className="px-4 py-3">Requested</th>
                <th className="px-4 py-3">Current State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(requests.data ?? []).map((request) => {
                const dispatch = dispatchByRequestId.get(request.id);
                return (
                  <tr key={request.id}>
                    <td className="px-4 py-3 font-medium text-ink">{productNameById.get(request.product_id) ?? request.product_id}</td>
                    <td className="px-4 py-3 text-slate-600">{request.hub_id ? hubNameById.get(request.hub_id) ?? request.hub_id : "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{request.quantity}</td>
                    <td className="px-4 py-3"><StatusBadge tone={requestTone(request.status)}>{requestLabel(request, dispatch)}</StatusBadge></td>
                  </tr>
                );
              })}
              {!requests.data?.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">No requests submitted yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* LIVE HUB AVAILABILITY */}
      <section className="mt-6 rounded-md border border-line bg-white">
        <div className="flex items-center gap-2 border-b border-line bg-indigo-50/50 px-4 py-3">
          <Store className="h-5 w-5 text-indigo-600" />
          <h2 className="text-sm font-semibold text-slate-800">Live Hub Availability</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-panel text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 w-1/3">Hub Location</th>
                <th className="px-4 py-3">Product Name</th>
                <th className="px-4 py-3">Available Quantity</th>
              </tr>
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
                          {index === 0 && (
                            <td rowSpan={allProducts.length} className="px-4 py-4 align-top border-r border-line bg-white w-1/3">
                              <div className="font-semibold text-ink">{hub.name}</div>
                            </td>
                          )}
                          <td className="px-4 py-3 text-slate-600">{product.name}</td>
                          <td className="px-4 py-3 font-semibold text-brand">{qty} Units</td>
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
              {!hubs.data?.length && <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-500">No hubs registered.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

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
          </div>
        )}
      </section>
    </AppShell>
  );
}