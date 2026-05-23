"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Store, UserCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ActionButton } from "@/components/ui/action-button";
import { SelectField, TextField } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api";
import type { DispatchOrder, HubRecord, ProductPage } from "@/types/inventory";

export default function HubsPage() {
  const queryClient = useQueryClient();
  const [receiptNotes, setReceiptNotes] = useState<Record<string, string>>({});
  
  // State for Agent Sales Form
  const [saleForm, setSaleForm] = useState({ hub_id: "", product_id: "", agent_name: "", quantity: "1" });
  const [error, setError] = useState<string | null>(null);

  const products = useQuery({ queryKey: ["products"], queryFn: async () => (await api.get<ProductPage>("/products")).data });
  const hubs = useQuery({ queryKey: ["hubs"], queryFn: async () => (await api.get<HubRecord[]>("/distribution/hubs")).data });
  const dispatches = useQuery({ queryKey: ["dispatches"], queryFn: async () => (await api.get<DispatchOrder[]>("/distribution/dispatches")).data });

  const productNameById = useMemo(() => new Map((products.data?.items ?? []).map((item) => [item.id, item.name])), [products.data?.items]);
  const hubNameById = useMemo(() => new Map((hubs.data ?? []).map((item) => [item.id, item.name])), [hubs.data]);

  const hubReceiptRows = (dispatches.data ?? []).filter((dispatch) => dispatch.status === "DISPATCHED" || dispatch.status === "RECEIVED");

  // Receive stock into Hub
  const receiveDispatch = useMutation({
    mutationFn: async (dispatch: DispatchOrder) => api.post<DispatchOrder>("/distribution/receipts", {
      dispatch_order_id: dispatch.id,
      quantity_received: dispatch.quantity,
      notes: receiptNotes[dispatch.id] || null,
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["distribution-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["dispatches"] }),
        queryClient.invalidateQueries({ queryKey: ["balances"] }) // Assuming balances track hub inventory
      ]);
    },
  });

  // Assign stock to Agent / Log Sale (Requires Backend Endpoint creation)
  const recordAgentSale = useMutation({
    mutationFn: async () => api.post("/hubs/sales", {
      hub_id: saleForm.hub_id,
      product_id: saleForm.product_id,
      agent_name: saleForm.agent_name,
      quantity: Number(saleForm.quantity)
    }),
    onSuccess: async () => {
      setSaleForm({ ...saleForm, agent_name: "", quantity: "1" });
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["balances"] });
    },
    onError: () => setError("Failed to assign stock to agent. Please ensure backend endpoint exists."),
  });

  return (
    <AppShell title="Hub Operations" description="Confirm warehouse receipts and distribute stock to sales agents.">
      {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <section className="grid gap-6 xl:grid-cols-2">
        {/* NEW: Agent Distribution Form */}
        <form onSubmit={(e) => { e.preventDefault(); recordAgentSale.mutate(); }} className="rounded-md border border-line bg-white p-4">
          <div className="mb-4 flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-brand" />
            <h2 className="text-sm font-semibold text-ink">Assign Stock to Agent</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField label="Hub" value={saleForm.hub_id} onChange={(e) => setSaleForm({ ...saleForm, hub_id: e.target.value })} required>
              <option value="">Select your Hub</option>
              {(hubs.data ?? []).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </SelectField>
            <SelectField label="Product" value={saleForm.product_id} onChange={(e) => setSaleForm({ ...saleForm, product_id: e.target.value })} required>
              <option value="">Select Product</option>
              {(products.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </SelectField>
            <TextField label="Agent Name / ID" value={saleForm.agent_name} onChange={(e) => setSaleForm({ ...saleForm, agent_name: e.target.value })} required />
            <TextField label="Quantity to Assign" min={1} type="number" value={saleForm.quantity} onChange={(e) => setSaleForm({ ...saleForm, quantity: e.target.value })} required />
            <div className="md:col-span-2">
              <ActionButton disabled={recordAgentSale.isPending} type="submit">Complete Assignment</ActionButton>
            </div>
          </div>
        </form>
      </section>

      {/* Moved from Distribution.tsx */}
      <section className="mt-6 rounded-md border border-line bg-white">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Inbound Hub Receipts</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-panel text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Hub Location</th>
                <th className="px-4 py-3">Quantity</th>
                <th className="px-4 py-3">Receipt Note</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {hubReceiptRows.map((dispatch) => (
                <tr key={dispatch.id}>
                  <td className="px-4 py-3 font-medium text-ink">{productNameById.get(dispatch.product_id) ?? dispatch.product_id}</td>
                  <td className="px-4 py-3 text-slate-600">{hubNameById.get(dispatch.to_location_id) ?? dispatch.to_location_id}</td>
                  <td className="px-4 py-3 text-slate-600">{dispatch.quantity}</td>
                  <td className="px-4 py-3">
                    {dispatch.status === "DISPATCHED" ? (
                      <input className="h-9 w-72 rounded-md border border-line px-2" value={receiptNotes[dispatch.id] ?? ""} onChange={(e) => setReceiptNotes({ ...receiptNotes, [dispatch.id]: e.target.value })} />
                    ) : (
                      <StatusBadge tone="success">Receipt confirmed</StatusBadge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {dispatch.status === "DISPATCHED" ? (
                      <ActionButton variant="secondary" onClick={() => receiveDispatch.mutate(dispatch)} type="button">Confirm Receipt</ActionButton>
                    ) : (
                      <span className="text-slate-400">Complete</span>
                    )}
                  </td>
                </tr>
              ))}
              {!hubReceiptRows.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No inbound dispatches yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}