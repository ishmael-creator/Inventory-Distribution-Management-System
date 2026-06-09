"use client";

import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Store, UserCheck, CheckCircle, Boxes, ShieldAlert, Wrench, ChevronDown, ChevronUp, UserPlus, X } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { ActionButton } from "@/components/ui/action-button";
import { SelectField, TextField, TextAreaField } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type { DispatchOrder, HubRecord, ProductPage, InventoryBalance } from "@/types/inventory";

export default function HubsPage() {
  const queryClient = useQueryClient();
  const userRole = useAuthStore((state) => state.userRole);

  const [activeHubId, setActiveHubId] = useState<string>("");
  const [receiptNotes, setReceiptNotes] = useState<Record<string, string>>({});
  
  const [saleForm, setSaleForm] = useState({ product_id: "", agent_name: "", quantity: "1" });
  
  // Complaint Form State
  const [isComplaintFormOpen, setIsComplaintFormOpen] = useState(false);
  const [complaintForm, setComplaintForm] = useState({ product_id: "", agent_name: "", complaint_type: "REPLACEMENT", quantity: "1", notes: "" });

  // Manager Assignment State
  const [isManagerModalOpen, setIsManagerModalOpen] = useState(false);
  const [selectedManagerId, setSelectedManagerId] = useState("");

  const [error, setError] = useState<string | null>(null);

  // Queries
  const products = useQuery({ queryKey: ["products"], queryFn: async () => (await api.get<ProductPage>("/products")).data });
  const hubs = useQuery({ queryKey: ["hubs"], queryFn: async () => (await api.get<HubRecord[]>("/distribution/hubs")).data });
  const dispatches = useQuery({ queryKey: ["dispatches"], queryFn: async () => (await api.get<DispatchOrder[]>("/distribution/dispatches")).data });
  const balances = useQuery({ queryKey: ["balances"], queryFn: async () => (await api.get<InventoryBalance[]>("/inventory/balances")).data });
  
  // NEW: Fetch all users so we can populate the dropdown
  const users = useQuery({ 
    queryKey: ["users"], 
    queryFn: async () => (await api.get<any[]>("/users")).data,
    enabled: userRole !== "HUB_OFFICER" // Only fetch if admin
  });

  const productNameById = useMemo(() => new Map((products.data?.items ?? []).map((item) => [item.id, item.name])), [products.data?.items]);

  useEffect(() => {
    if (hubs.data && hubs.data.length > 0 && !activeHubId) {
      setActiveHubId(hubs.data[0].id);
    }
  }, [hubs.data, activeHubId]);

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

  // Mutations
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
      hub_id: activeHubId,
      product_id: saleForm.product_id,
      agent_name: saleForm.agent_name,
      quantity: Number(saleForm.quantity)
    }),
    onSuccess: async () => {
      setSaleForm({ product_id: "", agent_name: "", quantity: "1" });
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["balances"] });
    },
    onError: (err: any) => setError(err.response?.data?.detail || "Failed to assign stock to agent."),
  });

  const logComplaint = useMutation({
    mutationFn: async () => api.post(`/hubs/${activeHubId}/complaints`, {
      product_id: complaintForm.product_id,
      agent_name: complaintForm.agent_name,
      complaint_type: complaintForm.complaint_type,
      quantity: Number(complaintForm.quantity),
      notes: complaintForm.notes
    }),
    onSuccess: async () => {
      setComplaintForm({ product_id: "", agent_name: "", complaint_type: "REPLACEMENT", quantity: "1", notes: "" });
      setIsComplaintFormOpen(false);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["balances"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (err: any) => setError(err.response?.data?.detail || "Failed to process complaint."),
  });

  const markRepaired = useMutation({
    mutationFn: async ({ product_id, quantity }: { product_id: string, quantity: number }) => 
      api.post(`/hubs/${activeHubId}/repairs`, { product_id, quantity }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["balances"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (err: any) => setError(err.response?.data?.detail || "Failed to mark as repaired."),
  });

  // NEW: Assign Manager Mutation
  const assignManager = useMutation({
    mutationFn: async () => api.patch(`/distribution/hubs/${activeHubId}`, {
      manager_id: selectedManagerId
    }),
    onSuccess: async () => {
      setIsManagerModalOpen(false);
      setSelectedManagerId("");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["hubs"] });
      alert("Manager successfully assigned!");
    },
    onError: (err: any) => setError(err.response?.data?.detail || "Failed to assign manager."),
  });

  return (
    <AppShell title="Hub Operations" description="Manage receipts, field agents, customer complaints, and damaged goods.">
      
      {/* HUB FILTER TABS & ASSIGN MANAGER BUTTON */}
      {userRole === "HUB_OFFICER" ? (
        <div className="mb-6 border-b border-line pb-4">
          <h2 className="text-xl font-bold text-ink flex items-center gap-2">
            <Store className="h-6 w-6 text-brand" />
            {hubs.data?.find(h => h.id === activeHubId)?.name || "Assigned"} Hub Operations
          </h2>
        </div>
      ) : (
        <div className="mb-6 flex flex-wrap items-center justify-between border-b border-line pb-4">
          <div className="flex flex-wrap gap-2">
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

          {/* ADMIN ONLY: Assign Manager Button */}
          {activeHubId && (
            <ActionButton 
              variant="secondary" 
              className="ml-auto"
              onClick={() => setIsManagerModalOpen(true)}
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Assign Manager
            </ActionButton>
          )}
        </div>
      )}

      {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {/* COMPLAINTS & RETURNS BAR */}
      <section className="mb-6">
        <div className="rounded-md border border-line bg-white shadow-sm overflow-hidden transition-all">
          <button
            type="button"
            onClick={() => setIsComplaintFormOpen(!isComplaintFormOpen)}
            className="flex w-full items-center justify-between bg-red-50 px-6 py-4 hover:bg-red-100 transition-colors focus:outline-none"
          >
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
                    <option value="">Select Product</option>
                    {(products.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </SelectField>
                  <TextField label="Associated Agent" value={complaintForm.agent_name} onChange={(e) => setComplaintForm({ ...complaintForm, agent_name: e.target.value })} required />
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

      {/* REST OF YOUR UI REMAINS IDENTICAL... */}
      <div className="grid gap-6 xl:grid-cols-2">
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

        <form onSubmit={(e) => { e.preventDefault(); recordAgentSale.mutate(); }} className="rounded-md border border-line bg-white p-4 h-fit shadow-sm">
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
                const damaged = 0; // Update when you have damaged stock state
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
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
                          {damaged} Defective
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {damaged > 0 && (
                        <ActionButton 
                          variant="secondary" 
                          onClick={() => {
                            const qty = parseInt(prompt(`How many ${product.name} are you marking as Repaired?`, damaged.toString()) || "0");
                            if (qty > 0 && qty <= damaged) {
                              markRepaired.mutate({ product_id: product.id, quantity: qty });
                            }
                          }}
                          disabled={markRepaired.isPending}
                        >
                          <Wrench className="h-4 w-4 mr-1" />
                          Mark Repaired
                        </ActionButton>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!products.data?.items?.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No products configured.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* NEW: ASSIGN MANAGER MODAL OVERLAY */}
      {isManagerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-ink">Assign Hub Manager</h3>
              <button onClick={() => setIsManagerModalOpen(false)} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4 text-sm text-slate-600">
              Select a user to manage the <strong>{hubs.data?.find(h => h.id === activeHubId)?.name}</strong> Hub. They will receive all dispatch notifications for this location.
            </p>
            
            <form onSubmit={(e) => { e.preventDefault(); assignManager.mutate(); }}>
              <div className="mb-6">
                <SelectField 
                  label="Select User" 
                  value={selectedManagerId} 
                  onChange={(e) => setSelectedManagerId(e.target.value)} 
                  required
                >
                  <option value="">-- Choose a Manager --</option>
                  {(users.data ?? [])
                    .filter((u: any) => u.is_active) // Optional: only show active users
                    .map((user: any) => (
                    <option key={user.id} value={user.id}>
                      {user.full_name} ({user.role.name})
                    </option>
                  ))}
                </SelectField>
              </div>
              <div className="flex justify-end gap-3">
                <ActionButton type="button" variant="secondary" onClick={() => setIsManagerModalOpen(false)}>
                  Cancel
                </ActionButton>
                <ActionButton type="submit" disabled={assignManager.isPending || !selectedManagerId}>
                  {assignManager.isPending ? "Assigning..." : "Save Manager"}
                </ActionButton>
              </div>
            </form>
          </div>
        </div>
      )}

    </AppShell>
  );
}