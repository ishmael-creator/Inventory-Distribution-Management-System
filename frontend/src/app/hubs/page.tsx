"use client";

import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Store, UserCheck, CheckCircle, Boxes, ShieldAlert, Wrench, ChevronDown, ChevronUp, Truck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ActionButton } from "@/components/ui/action-button";
import { SelectField, TextField, TextAreaField } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type { DispatchOrder, HubRecord, ProductPage, InventoryBalance, AgentRecord, AgentAllocationRecord } from "@/types/inventory";

export default function HubsPage() {
  const queryClient = useQueryClient();
  const userRole = useAuthStore((state) => state.userRole);
  const [activeHubId, setActiveHubId] = useState<string>("");
  const [receiptNotes, setReceiptNotes] = useState<Record<string, string>>({});
  
  // Complaint Form State
  const [isComplaintFormOpen, setIsComplaintFormOpen] = useState(false);
  const [complaintForm, setComplaintForm] = useState({ product_id: "", agent_name: "", complaint_type: "REPLACEMENT", quantity: "1", notes: "" });

  const [error, setError] = useState<string | null>(null);

  // Core Queries
  const products = useQuery({ queryKey: ["products"], queryFn: async () => (await api.get<ProductPage>("/products")).data });
  const hubs = useQuery({ queryKey: ["hubs"], queryFn: async () => (await api.get<HubRecord[]>("/distribution/hubs")).data });
  const dispatches = useQuery({ queryKey: ["dispatches"], queryFn: async () => (await api.get<DispatchOrder[]>("/distribution/dispatches")).data });
  const balances = useQuery({ queryKey: ["balances"], queryFn: async () => (await api.get<InventoryBalance[]>("/inventory/balances")).data });
  
  // Agent Data Queries
  const agents = useQuery({ queryKey: ["agents"], queryFn: async () => (await api.get<AgentRecord[]>("/distribution/agents")).data });
  const allocations = useQuery({ 
    queryKey: ["agent-allocations", activeHubId], 
    queryFn: async () => (await api.get<AgentAllocationRecord[]>(`/distribution/agents/allocations?hub_id=${activeHubId}`)).data,
    enabled: !!activeHubId
  });

  const productNameById = useMemo(() => new Map((products.data?.items ?? []).map((item) => [item.id, item.name])), [products.data?.items]);
  const agentNameById = useMemo(() => new Map((agents.data ?? []).map((a) => [a.id, a.name])), [agents.data]);

  useEffect(() => {
    if (hubs.data && hubs.data.length > 0 && !activeHubId) {
      setActiveHubId(hubs.data[0].id);
    }
  }, [hubs.data, activeHubId]);

  const hubReceiptRows = useMemo(() => {
    return (dispatches.data ?? []).filter(d => (d.status === "DISPATCHED" || d.status === "RECEIVED") && d.to_location_id === activeHubId);
  }, [dispatches.data, activeHubId]);

  const pendingHandovers = useMemo(() => {
    return (allocations.data ?? []).filter(a => a.status === "PENDING");
  }, [allocations.data]);

  const currentInventory = useMemo(() => {
    return (balances.data ?? []).filter(bal => bal.location_type === "HUB" && bal.location_id === activeHubId);
  }, [balances.data, activeHubId]);

  // Mutations
  const receiveDispatch = useMutation({
    mutationFn: async (dispatch: DispatchOrder) => api.post<DispatchOrder>("/distribution/receipts", { dispatch_order_id: dispatch.id, quantity_received: dispatch.quantity, notes: receiptNotes[dispatch.id] || null }),
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["distribution-requests"] }), queryClient.invalidateQueries({ queryKey: ["dispatches"] }), queryClient.invalidateQueries({ queryKey: ["balances"] })]); },
  });

  const confirmHandover = useMutation({
    mutationFn: async (allocationId: string) => api.post(`/distribution/agents/allocations/${allocationId}/confirm`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["agent-allocations"] });
      await queryClient.invalidateQueries({ queryKey: ["balances"] });
    },
    onError: (err: any) => setError(err.response?.data?.detail || "Failed to confirm handover. Check hub inventory.")
  });

  const logComplaint = useMutation({
    mutationFn: async () => api.post(`/hubs/${activeHubId}/complaints`, { ...complaintForm, quantity: Number(complaintForm.quantity) }),
    onSuccess: async () => {
      setComplaintForm({ product_id: "", agent_name: "", complaint_type: "REPLACEMENT", quantity: "1", notes: "" });
      setIsComplaintFormOpen(false); setError(null);
      await queryClient.invalidateQueries({ queryKey: ["balances"] }); await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (err: any) => setError(err.response?.data?.detail || "Failed to process complaint."),
  });

  const markRepaired = useMutation({
    mutationFn: async ({ product_id, quantity }: { product_id: string, quantity: number }) => api.post(`/hubs/${activeHubId}/repairs`, { product_id, quantity }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["balances"] }); await queryClient.invalidateQueries({ queryKey: ["transactions"] }); },
    onError: (err: any) => setError(err.response?.data?.detail || "Failed to mark as repaired."),
  });

  const activeHubName = hubs.data?.find(h => h.id === activeHubId)?.name || "Hub";

  return (
    <AppShell title={`${activeHubName} Hub Dashboard`} description="Manage receipts, agent handovers, and inventory.">
      
      {/* HUB FILTER TABS */}
      {userRole !== "HUB_OFFICER" && (
        <div className="mb-6 flex flex-wrap items-center justify-between border-b border-line pb-4">
          <div className="flex flex-wrap gap-2">
            {(hubs.data ?? []).map((hub: any) => (
              <button
                key={hub.id}
                onClick={() => setActiveHubId(hub.id)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                  activeHubId === hub.id ? "bg-brand text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {hub.name}
              </button>
            ))}
            {hubs.data?.length === 0 && <span className="text-xs text-slate-400">No hubs registered</span>}
          </div>
        </div>
      )}

      {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {/* COMPLAINTS & RETURNS BAR */}
      <section className="mb-6">
        <div className="rounded-md border border-line bg-white shadow-sm overflow-hidden transition-all">
          <button type="button" onClick={() => setIsComplaintFormOpen(!isComplaintFormOpen)} className="flex w-full items-center justify-between bg-red-50 px-6 py-4 hover:bg-red-100 transition-colors focus:outline-none">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-6 w-6 text-red-600" />
              <h2 className="text-lg font-semibold text-red-900">Process Customer Complaint & Return</h2>
            </div>
            <div className="flex items-center gap-2 text-sm font-medium text-red-700">
              {isComplaintFormOpen ? "Close" : "Open Form"}
              {isComplaintFormOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </div>
          </button>
          {isComplaintFormOpen && (
            <div className="border-t border-red-100 bg-white p-6">
              <form onSubmit={(e) => { e.preventDefault(); logComplaint.mutate(); }}>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <SelectField label="Resolution Type" value={complaintForm.complaint_type} onChange={(e) => setComplaintForm({ ...complaintForm, complaint_type: e.target.value })} required>
                    <option value="REPLACEMENT">Replacement</option>
                    <option value="REFUND">Refund Only</option>
                  </SelectField>
                  <SelectField label="Returned Product" value={complaintForm.product_id} onChange={(e) => setComplaintForm({ ...complaintForm, product_id: e.target.value })} required>
                    <option value="">Select product</option>
                    {(products.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </SelectField>
                  
                  <SelectField label="Associated Agent" value={complaintForm.agent_name} onChange={(e) => setComplaintForm({ ...complaintForm, agent_name: e.target.value })} required>
                    <option value="">Select agent</option>
                    {(agents.data ?? []).filter(a => a.hub_id === activeHubId).map((a) => (
                      <option key={a.id} value={a.name}>{a.name} ({a.agent_code})</option>
                    ))}
                  </SelectField>

                  <TextField label="Quantity Returned" min={1} type="number" value={complaintForm.quantity} onChange={(e) => setComplaintForm({ ...complaintForm, quantity: e.target.value })} required />
                  <div className="md:col-span-2 lg:col-span-4">
                    <TextAreaField label="Complaint Notes / Defect Details" value={complaintForm.notes} onChange={(e) => setComplaintForm({ ...complaintForm, notes: e.target.value })} required />
                  </div>
                  <div className="md:col-span-2 lg:col-span-4 mt-2">
                    <ActionButton disabled={logComplaint.isPending || !activeHubId} type="submit" className="w-full h-12 text-base bg-red-600 hover:bg-red-700">
                      {logComplaint.isPending ? "Processing..." : "Process Return (Move to Damaged Goods)"}
                    </ActionButton>
                  </div>
                </div>
              </form>
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* INBOUND DISPATCHES FROM WAREHOUSE */}
        <section className="rounded-md border border-line bg-white h-fit shadow-sm">
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

        {/* PENDING FIELD AGENT HANDOVERS */}
        <section className="rounded-md border border-line bg-white h-fit shadow-sm">
          <div className="flex items-center gap-2 border-b border-line bg-teal-50/50 px-4 py-3">
            <UserCheck className="h-5 w-5 text-teal-700" />
            <h2 className="text-sm font-semibold text-teal-900">Pending Field Agent Handovers</h2>
          </div>
          <div className="p-4 space-y-4">
            {pendingHandovers.length === 0 ? (
               <div className="py-8 text-center text-slate-500 text-sm">No pending allocations to agents.</div>
            ) : (
              pendingHandovers.map((allocation) => (
                <div key={allocation.id} className="flex items-center justify-between rounded-lg border border-teal-100 bg-teal-50/10 p-4 shadow-sm">
                  <div>
                    <p className="font-bold text-teal-800">{agentNameById.get(allocation.agent_id) ?? "Unknown Agent"}</p>
                    <p className="font-medium text-ink mt-1">{productNameById.get(allocation.product_id) ?? "Product"}</p>
                    <p className="text-sm text-slate-600">Collects: {allocation.quantity} Units</p>
                  </div>
                  <ActionButton onClick={() => confirmHandover.mutate(allocation.id)} disabled={confirmHandover.isPending}>
                    <Truck className="h-4 w-4 mr-2" /> Confirm
                  </ActionButton>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="mt-8 rounded-md border border-line bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Boxes className="h-5 w-5 text-slate-600" />
          <h2 className="text-sm font-semibold text-ink">Active Hub Inventory & Repairs</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-panel text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Product Name</th>
                <th className="px-4 py-3">Total Held</th>
                <th className="px-4 py-3">Sellable Stock</th>
                <th className="px-4 py-3 text-red-600">Damaged / Returned</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(products.data?.items ?? []).map((product) => {
                const bal = currentInventory.find(b => b.product_id === product.id);
                const damaged = 0; // Replace with actual defect tracking logic later
                const reserved = bal?.reserved_quantity || 0;
                const total = bal?.quantity || 0;
                const sellable = total - reserved - damaged;
                return (
                  <tr key={product.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-ink">{product.name}</td>
                    <td className="px-4 py-3 text-slate-600">{total} Units</td>
                    <td className="px-4 py-3 font-bold text-brand">{sellable} Units</td>
                    <td className="px-4 py-3">
                      {damaged > 0 ? (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">{damaged} Defective</span>
                      ) : <span className="text-slate-400">0</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {damaged > 0 && (
                        <ActionButton variant="secondary" onClick={() => {
                          const qty = parseInt(prompt(`How many ${product.name} are you marking as Repaired?`, damaged.toString()) || "0");
                          if (qty > 0 && qty <= damaged) markRepaired.mutate({ product_id: product.id, quantity: qty });
                        }} disabled={markRepaired.isPending}>
                          <Wrench className="h-4 w-4 mr-1" /> Mark Repaired
                        </ActionButton>
                      )}
                    </td>
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