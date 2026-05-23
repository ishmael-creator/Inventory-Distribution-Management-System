"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Warehouse } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ActionButton } from "@/components/ui/action-button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api";
import type { AllocationRequest, DispatchOrder, HubRecord, ProductPage, WarehouseRecord } from "@/types/inventory";

function requestTone(status: AllocationRequest["status"]) {
  if (status === "FULFILLED") return "success";
  if (status === "APPROVED" || status === "PENDING") return "warning";
  if (status === "REJECTED") return "critical"; // Assuming 'critical' is a valid tone
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
  const [hubForm, setHubForm] = useState({ name: "", location: "", warehouse_id: "" });
  const [requestForm, setRequestForm] = useState({ product_id: "", warehouse_id: "", hub_id: "", quantity: "100", notes: "" });
  const [error, setError] = useState<string | null>(null);

  const products = useQuery({ queryKey: ["products"], queryFn: async () => (await api.get<ProductPage>("/products")).data });
  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: async () => (await api.get<WarehouseRecord[]>("/warehouses")).data });
  const hubs = useQuery({ queryKey: ["hubs"], queryFn: async () => (await api.get<HubRecord[]>("/distribution/hubs")).data });
  const requests = useQuery({ queryKey: ["distribution-requests"], queryFn: async () => (await api.get<AllocationRequest[]>("/distribution/requests")).data });
  const dispatches = useQuery({ queryKey: ["dispatches"], queryFn: async () => (await api.get<DispatchOrder[]>("/distribution/dispatches")).data });

  const productNameById = useMemo(() => new Map((products.data?.items ?? []).map((item) => [item.id, item.name])), [products.data?.items]);
  const warehouseNameById = useMemo(() => new Map((warehouses.data ?? []).map((item) => [item.id, item.name])), [warehouses.data]);
  const hubNameById = useMemo(() => new Map((hubs.data ?? []).map((item) => [item.id, item.name])), [hubs.data]);
  const dispatchByRequestId = useMemo(() => new Map((dispatches.data ?? []).filter((d) => d.allocation_request_id).map((d) => [d.allocation_request_id, d])), [dispatches.data]);

  const filteredHubs = (hubs.data ?? []).filter((hub) => !requestForm.warehouse_id || hub.warehouse_id === requestForm.warehouse_id);

  const createHub = useMutation({
    mutationFn: async () => api.post<HubRecord>("/distribution/hubs", { ...hubForm, location: hubForm.location || null }),
    onSuccess: async () => {
      setHubForm({ name: "", location: "", warehouse_id: "" });
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["hubs"] });
    },
    onError: () => setError("Hub could not be created."),
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
    <AppShell title="Distribution Requests" description="Request stock for Hubs and track fulfillment status.">
      {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      
      <section className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={(e) => { e.preventDefault(); createHub.mutate(); }} className="rounded-md border border-line bg-white p-4">
          <div className="mb-4 flex items-center gap-2">
            <Warehouse className="h-5 w-5 text-brand" />
            <h2 className="text-sm font-semibold text-ink">Create Hub Location</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="Hub Name" value={hubForm.name} onChange={(e) => setHubForm({ ...hubForm, name: e.target.value })} required />
            <SelectField label="Supplying Warehouse" value={hubForm.warehouse_id} onChange={(e) => setHubForm({ ...hubForm, warehouse_id: e.target.value })} required>
              <option value="">Select warehouse</option>
              {(warehouses.data ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </SelectField>
            <TextField label="Location" value={hubForm.location} onChange={(e) => setHubForm({ ...hubForm, location: e.target.value })} />
            <div className="flex items-end"><ActionButton disabled={createHub.isPending} type="submit">Save Hub</ActionButton></div>
          </div>
        </form>

        <form onSubmit={(e) => { e.preventDefault(); createRequest.mutate(); }} className="rounded-md border border-line bg-white p-4">
          <div className="mb-4 flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-brand" />
            <h2 className="text-sm font-semibold text-ink">Request Stock from Warehouse</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField label="Product" value={requestForm.product_id} onChange={(e) => setRequestForm({ ...requestForm, product_id: e.target.value })} required>
              <option value="">Select product</option>
              {(products.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </SelectField>
            <SelectField label="Warehouse" value={requestForm.warehouse_id} onChange={(e) => setRequestForm({ ...requestForm, warehouse_id: e.target.value, hub_id: "" })} required>
              <option value="">Select warehouse</option>
              {(warehouses.data ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </SelectField>
            <SelectField label="Hub" value={requestForm.hub_id} onChange={(e) => setRequestForm({ ...requestForm, hub_id: e.target.value })} required>
              <option value="">Select hub</option>
              {filteredHubs.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </SelectField>
            <TextField label="Quantity" min={1} type="number" value={requestForm.quantity} onChange={(e) => setRequestForm({ ...requestForm, quantity: e.target.value })} required />
            <div className="md:col-span-2">
              <ActionButton disabled={createRequest.isPending} type="submit">Submit Request</ActionButton>
            </div>
          </div>
        </form>
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
                <th className="px-4 py-3">Approved</th>
                <th className="px-4 py-3">Current State</th>
                <th className="px-4 py-3">Warehouse Feedback</th>
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
                    <td className="px-4 py-3 text-slate-600">{request.approved_quantity ?? "-"}</td>
                    <td className="px-4 py-3"><StatusBadge tone={requestTone(request.status)}>{requestLabel(request, dispatch)}</StatusBadge></td>
                    <td className="px-4 py-3 text-slate-600">{request.review_notes ?? "-"}</td>
                  </tr>
                );
              })}
              {!requests.data?.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No requests submitted yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}