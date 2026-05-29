"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Warehouse, Boxes, Settings2 } from "lucide-react";

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
  if (request.status === "APPROVED" && !dispatch) return "Approved, awaiting dispatch";
  if (dispatch?.status === "DISPATCHED") return "Dispatched, awaiting hub receipt";
  if (request.status === "FULFILLED" || dispatch?.status === "RECEIVED") return "Hub receipt confirmed";
  if (request.status === "REJECTED") return "Warehouse rejected";
  return request.status.replaceAll("_", " ");
}

export default function DistributionPage() {
  const queryClient = useQueryClient();

  const [showAdminTools, setShowAdminTools] = useState(false);
  const [hubForm, setHubForm] = useState({ name: "", location: "", warehouse_id: "" });
  const [requestForm, setRequestForm] = useState({ product_id: "", warehouse_id: "", hub_id: "", quantity: "100", notes: "" });
  const [error, setError] = useState<string | null>(null);

  const products = useQuery({ queryKey: ["products"], queryFn: async () => (await api.get<ProductPage>("/products")).data });
  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: async () => (await api.get<WarehouseRecord[]>("/warehouses")).data });
  const hubs = useQuery({ queryKey: ["hubs"], queryFn: async () => (await api.get<HubRecord[]>("/distribution/hubs")).data });
  const requests = useQuery({ queryKey: ["distribution-requests"], queryFn: async () => (await api.get<AllocationRequest[]>("/distribution/requests")).data });
  const dispatches = useQuery({ queryKey: ["dispatches"], queryFn: async () => (await api.get<DispatchOrder[]>("/distribution/dispatches")).data });
  
  const balances = useQuery({ 
    queryKey: ["warehouse-balances"], 
    queryFn: async () => (await api.get<InventoryBalance[]>("/inventory/balances?location_type=WAREHOUSE")).data 
  });

  const productNameById = useMemo(() => new Map((products.data?.items ?? []).map((item) => [item.id, item.name])), [products.data?.items]);
  const warehouseNameById = useMemo(() => new Map((warehouses.data ?? []).map((item) => [item.id, item.name])), [warehouses.data]);
  const hubNameById = useMemo(() => new Map((hubs.data ?? []).map((item) => [item.id, item.name])), [hubs.data]);
  const dispatchByRequestId = useMemo(() => new Map((dispatches.data ?? []).filter((d) => d.allocation_request_id).map((d) => [d.allocation_request_id, d])), [dispatches.data]);

  // Filters hubs to only show the ones assigned to the currently selected warehouse in the form
  const filteredHubs = (hubs.data ?? []).filter((hub) => !requestForm.warehouse_id || hub.warehouse_id === requestForm.warehouse_id);

  const createHub = useMutation({
    mutationFn: async () => api.post<HubRecord>("/distribution/hubs", { ...hubForm, location: hubForm.location || null }),
    onSuccess: async () => {
      setHubForm({ name: "", location: "", warehouse_id: "" });
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["hubs"] });
    }
  });

  const autoCreateDemoHubs = useMutation({
    mutationFn: async () => {
      if (!warehouses.data?.length) throw new Error("You must create at least one warehouse before generating hubs.");
      const existingHubs = hubs.data?.map(h => h.name) || [];
      
      let whIndex = 0;
      for (const hubName of DEMO_HUBS) {
        if (!existingHubs.includes(hubName)) {
          // Distribute hubs evenly across available warehouses
          const wh = warehouses.data[whIndex % warehouses.data.length];
          await api.post("/distribution/hubs", { name: hubName, location: "Demo Location", warehouse_id: wh.id });
          whIndex++;
        }
      }
    },
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["hubs"] });
    },
    onError: (err: any) => setError(err.message || "Failed to generate hubs.")
  });

  const createRequest = useMutation({
    mutationFn: async () => api.post<AllocationRequest>("/distribution/requests", {
      product_id: requestForm.product_id,
      warehouse_id: requestForm.warehouse_id,
      hub_id: requestForm.hub_id,
      quantity: Number(requestForm.quantity),
      notes: requestForm.notes || null,
    }),
    onSuccess: async () => {
      setRequestForm({ product_id: "", warehouse_id: "", hub_id: "", quantity: "100", notes: "" });
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["distribution-requests"] });
    },
    onError: () => setError("Request failed. Ensure the hub belongs to the selected warehouse."),
  });

  return (
    <AppShell title="Distribution Requests" description="Monitor stock availability and request inventory for Hubs.">
      {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <section className="mb-6 max-w-4xl">
        <form onSubmit={(e) => { e.preventDefault(); createRequest.mutate(); }} className="rounded-md border border-line bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-brand" />
            <h2 className="text-lg font-semibold text-ink">Request Stock from Warehouse</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField label="Supplying Warehouse" value={requestForm.warehouse_id} onChange={(e) => setRequestForm({ ...requestForm, warehouse_id: e.target.value, hub_id: "" })} required>
              <option value="">Select warehouse</option>
              {(warehouses.data ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </SelectField>
            <SelectField label="Destination Hub" value={requestForm.hub_id} onChange={(e) => setRequestForm({ ...requestForm, hub_id: e.target.value })} required>
              <option value="">Select hub</option>
              {filteredHubs.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </SelectField>
            <SelectField label="Product" value={requestForm.product_id} onChange={(e) => setRequestForm({ ...requestForm, product_id: e.target.value })} required>
              <option value="">Select product</option>
              {(products.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </SelectField>
            <TextField label="Quantity" min={1} type="number" value={requestForm.quantity} onChange={(e) => setRequestForm({ ...requestForm, quantity: e.target.value })} required />
            <div className="md:col-span-2 mt-2">
              <ActionButton disabled={createRequest.isPending} type="submit" className="w-full h-12 text-base">Submit Allocation Request</ActionButton>
            </div>
          </div>
        </form>
      </section>

      <section className="mt-6 rounded-md border border-line bg-white">
        <div className="flex items-center gap-2 border-b border-line bg-slate-50/50 px-4 py-3">
          <Boxes className="h-5 w-5 text-slate-600" />
          <h2 className="text-sm font-semibold text-slate-800">Live Warehouse Availability</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-panel text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Warehouse Location</th>
                <th className="px-4 py-3">Product Name</th>
                <th className="px-4 py-3">Available Quantity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(balances.data ?? []).map((balance) => {
                const whName = warehouseNameById.get(balance.location_id);
                if (!whName) return null;
                return (
                  <tr key={balance.id}>
                    <td className="px-4 py-3 font-medium text-ink">{whName}</td>
                    <td className="px-4 py-3 text-slate-600">{productNameById.get(balance.product_id) ?? balance.product_id}</td>
                    <td className="px-4 py-3 font-semibold text-brand">{balance.quantity - balance.reserved_quantity} Units</td>
                  </tr>
                );
              })}
              {!balances.data?.length && <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-500">No warehouse inventory recorded.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-md border border-line bg-white">
        <div className="border-b border-line px-4 py-3"><h2 className="text-sm font-semibold text-ink">Distribution Tracking</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-panel text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Warehouse</th>
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
                    <td className="px-4 py-3 text-slate-600">{request.warehouse_id ? warehouseNameById.get(request.warehouse_id) ?? request.warehouse_id : "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{request.hub_id ? hubNameById.get(request.hub_id) ?? request.hub_id : "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{request.quantity}</td>
                    <td className="px-4 py-3"><StatusBadge tone={requestTone(request.status)}>{requestLabel(request, dispatch)}</StatusBadge></td>
                  </tr>
                );
              })}
              {!requests.data?.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No requests submitted yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* ADMIN TOOLS: Hub Generation & Creation */}
      <section className="mt-12 mb-8 border-t border-line pt-8">
        <button onClick={() => setShowAdminTools(!showAdminTools)} className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-ink">
          <Settings2 className="h-4 w-4" />
          {showAdminTools ? "Hide Advanced Tools" : "Show Advanced Tools"}
        </button>

        {showAdminTools && (
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="rounded-md border border-line bg-slate-50 p-6">
              <h3 className="font-semibold text-ink mb-2">Initialize Demo Hubs</h3>
              <p className="text-sm text-slate-600 mb-4">Clicking this will automatically create all 10 hardcoded system hubs and distribute them across your available warehouses.</p>
              <ActionButton onClick={() => autoCreateDemoHubs.mutate()} disabled={autoCreateDemoHubs.isPending} className="w-full">
                {autoCreateDemoHubs.isPending ? "Generating..." : "Generate 10 System Hubs"}
              </ActionButton>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); createHub.mutate(); }} className="rounded-md border border-line bg-white p-6">
              <h3 className="font-semibold text-ink mb-4">Manually Create Custom Hub</h3>
              <div className="grid gap-4">
                <TextField label="Hub Name" value={hubForm.name} onChange={(e) => setHubForm({ ...hubForm, name: e.target.value })} required />
                <SelectField label="Supplying Warehouse" value={hubForm.warehouse_id} onChange={(e) => setHubForm({ ...hubForm, warehouse_id: e.target.value })} required>
                  <option value="">Select warehouse</option>
                  {(warehouses.data ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </SelectField>
                <ActionButton disabled={createHub.isPending} type="submit" variant="secondary">Save Hub</ActionButton>
              </div>
            </form>
          </div>
        )}
      </section>

    </AppShell>
  );
}