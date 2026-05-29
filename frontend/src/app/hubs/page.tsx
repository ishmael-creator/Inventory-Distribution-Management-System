"use client";

import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Store, UserCheck, CheckCircle, Boxes } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { ActionButton } from "@/components/ui/action-button";
import { SelectField, TextField } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api";
import type { DispatchOrder, HubRecord, ProductPage, InventoryBalance } from "@/types/inventory";

export default function HubsPage() {
  const queryClient = useQueryClient();

  const [activeHubId, setActiveHubId] = useState<string>("");
  const [receiptNotes, setReceiptNotes] = useState<Record<string, string>>({});
  const [saleForm, setSaleForm] = useState({ product_id: "", agent_name: "", quantity: "1" });
  const [error, setError] = useState<string | null>(null);

  const products = useQuery({ queryKey: ["products"], queryFn: async () => (await api.get<ProductPage>("/products")).data });
  const hubs = useQuery({ queryKey: ["hubs"], queryFn: async () => (await api.get<HubRecord[]>("/distribution/hubs")).data });
  const dispatches = useQuery({ queryKey: ["dispatches"], queryFn: async () => (await api.get<DispatchOrder[]>("/distribution/dispatches")).data });
  
  const balances = useQuery({ 
    queryKey: ["balances"], 
    queryFn: async () => (await api.get<InventoryBalance[]>("/inventory/balances")).data 
  });

  const productNameById = useMemo(() => new Map((products.data?.items ?? []).map((item) => [item.id, item.name])), [products.data?.items]);

  // Auto-select the first Hub tab once they load
  useEffect(() => {
    if (hubs.data && hubs.data.length > 0 && !activeHubId) {
      setActiveHubId(hubs.data[0].id);
    }
  }, [hubs.data, activeHubId]);

  // SMART FILTERS for the active Hub
  const hubReceiptRows = useMemo(() => {
    return (dispatches.data ?? []).filter(
      (dispatch) => (dispatch.status === "DISPATCHED" || dispatch.status === "RECEIVED") && dispatch.to_location_id === activeHubId
    );
  }, [dispatches.data, activeHubId]);

  const currentInventory = useMemo(() => {
    return (balances.data ?? []).filter(
      (bal) => bal.location_type === "HUB" && bal.location_id === activeHubId
    );
  }, [balances.data, activeHubId]);

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
        queryClient.invalidateQueries({ queryKey: ["balances"] })
      ]);
    },
  });

  const recordAgentSale = useMutation({
    mutationFn: async () => api.post("/hubs/sales", {
      hub_id: activeHubId, // Locked to active tab
      product_id: saleForm.product_id,
      agent_name: saleForm.agent_name,
      quantity: Number(saleForm.quantity)
    }),
    onSuccess: async () => {
      setSaleForm({ product_id: "", agent_name: "", quantity: "1" });
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["balances"] });
    },
    onError: () => setError("Endpoint /hubs/sales is not currently active on backend."),
  });

  return (
    <AppShell title="Hub Operations" description="Confirm warehouse receipts and distribute stock to sales agents.">
      
      {/* HUB FILTER TABS */}
      <div className="mb-6 flex flex-wrap gap-2 border-b border-line pb-4">
        {(hubs.data ?? []).map((hub: any) => (
          <button
            key={hub.id}
            onClick={() => setActiveHubId(hub.id)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
              activeHubId === hub.id
                ? "bg-brand text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {hub.name}
          </button>
        ))}
        {hubs.data?.length === 0 && (
          <span className="text-xs text-slate-400">No hubs registered in system</span>
        )}
      </div>

      {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid gap-6 xl:grid-cols-2">
        {/* INBOUND RECEIPTS */}
        <section className="rounded-md border border-line bg-white h-fit">
          <div className="flex items-center gap-2 border-b border-line bg-blue-50/50 px-4 py-3">
            <Store className="h-5 w-5 text-blue-600" />
            <h2 className="text-sm font-semibold text-blue-900">Inbound Warehouse Receipts</h2>
          </div>
          <div className="p-4 space-y-4">
            {hubReceiptRows.length === 0 ? (
               <div className="py-8 text-center text-slate-500 text-sm">No inbound dispatches for this hub.</div>
            ) : (
              hubReceiptRows.map((dispatch) => (
                <div key={dispatch.id} className="flex flex-col gap-4 rounded-lg border border-line bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-ink">{productNameById.get(dispatch.product_id) ?? dispatch.product_id}</p>
                      <p className="text-sm text-slate-600">Dispatched: {dispatch.quantity} Units</p>
                    </div>
                    {dispatch.status === "RECEIVED" && <StatusBadge tone="success">Confirmed</StatusBadge>}
                  </div>
                  
                  {dispatch.status === "DISPATCHED" && (
                    <div className="flex gap-2">
                      <input 
                        className="h-10 flex-1 rounded-md border border-line px-2 text-sm outline-none focus:border-brand" 
                        placeholder="Add optional receipt note..."
                        value={receiptNotes[dispatch.id] ?? ""} 
                        onChange={(e) => setReceiptNotes({ ...receiptNotes, [dispatch.id]: e.target.value })} 
                      />
                      <ActionButton variant="secondary" onClick={() => receiveDispatch.mutate(dispatch)} disabled={receiveDispatch.isPending}>
                         <CheckCircle className="mr-2 h-4 w-4" /> Confirm
                      </ActionButton>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </section>

        {/* AGENT DISTRIBUTION */}
        <form onSubmit={(e) => { e.preventDefault(); recordAgentSale.mutate(); }} className="rounded-md border border-line bg-white p-4 h-fit">
          <div className="mb-4 flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-brand" />
            <h2 className="text-sm font-semibold text-ink">Assign Stock to Agent</h2>
          </div>
          <div className="grid gap-4">
            <SelectField label="Product" value={saleForm.product_id} onChange={(e) => setSaleForm({ ...saleForm, product_id: e.target.value })} required>
              <option value="">Select Product</option>
              {(products.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </SelectField>
            <TextField label="Agent Name / ID" value={saleForm.agent_name} onChange={(e) => setSaleForm({ ...saleForm, agent_name: e.target.value })} required />
            <TextField label="Quantity to Assign" min={1} type="number" value={saleForm.quantity} onChange={(e) => setSaleForm({ ...saleForm, quantity: e.target.value })} required />
            <div className="mt-2">
              <ActionButton disabled={recordAgentSale.isPending || !activeHubId} type="submit" className="w-full">Complete Assignment</ActionButton>
            </div>
          </div>
        </form>
      </div>

      {/* INTERNAL HUB INVENTORY */}
      <section className="mt-6 rounded-md border border-line bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Boxes className="h-5 w-5 text-slate-600" />
          <h2 className="text-sm font-semibold text-ink">Available Hub Inventory</h2>
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
              {!currentInventory.length && <tr><td colSpan={2} className="px-4 py-8 text-center text-slate-500">This hub is currently empty.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

    </AppShell>
  );
}