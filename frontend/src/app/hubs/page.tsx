"use client";

import { useMemo, useState, useEffect, Fragment } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Store, UserCheck, CheckCircle, Boxes, ShieldAlert, Wrench, ChevronDown, ChevronUp, Truck, AlertTriangle, ClipboardList, Search, Filter } from "lucide-react";

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
  
  // Complaint Form State
  const [isComplaintFormOpen, setIsComplaintFormOpen] = useState(false);
  const [complaintForm, setComplaintForm] = useState({ product_id: "", agent_name: "", complaint_type: "REPLACEMENT", quantity: "1", notes: "" });
  
  // Walk-In Return State
  const [isWalkInReturnOpen, setIsWalkInReturnOpen] = useState(false);
  const [walkInForm, setWalkInForm] = useState({ agent_code: "", product_id: "", quantity: "1" });

  // Receipt Form State
  const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(null);
  const [receiptForm, setReceiptForm] = useState({ received: 0, damaged: 0, missing: 0, notes: "" });

  const [error, setError] = useState<string | null>(null);

  // Regional Manager Allocation Tracker State
  const [rmSearchQuery, setRmSearchQuery] = useState("");
  const [rmFilterStatus, setRmFilterStatus] = useState("");
  const [rmFilterHub, setRmFilterHub] = useState("");
  const [rmCurrentPage, setRmCurrentPage] = useState(1);
  const rmItemsPerPage = 10;

  // Core Queries
  const products = useQuery({ queryKey: ["products"], queryFn: async () => (await api.get<ProductPage>("/products")).data });
  const hubs = useQuery({ queryKey: ["hubs"], queryFn: async () => (await api.get<HubRecord[]>("/distribution/hubs")).data });
  const dispatches = useQuery({ queryKey: ["dispatches"], queryFn: async () => (await api.get<DispatchOrder[]>("/distribution/dispatches")).data });
  const balances = useQuery({ queryKey: ["balances"], queryFn: async () => (await api.get<InventoryBalance[]>("/inventory/balances")).data });
  
  // Agent Data Queries
  const agents = useQuery({ queryKey: ["agents"], queryFn: async () => (await api.get<AgentRecord[]>("/distribution/agents")).data });
  
  // THE FIX: Allow RM to fetch ALL allocations, while Hub Officers only fetch their specific Hub
  const allocations = useQuery({ 
    queryKey: ["agent-allocations", userRole === "REGIONAL_MANAGER" ? "all" : activeHubId], 
    queryFn: async () => {
      const url = userRole === "REGIONAL_MANAGER" 
        ? "/distribution/agents/allocations" 
        : `/distribution/agents/allocations?hub_id=${activeHubId}`;
      return (await api.get<AgentAllocationRecord[]>(url)).data;
    },
    enabled: userRole === "REGIONAL_MANAGER" ? true : !!activeHubId
  });

  const productNameById = useMemo(() => new Map((products.data?.items ?? []).map((item) => [item.id, item.name])), [products.data?.items]);
  const agentNameById = useMemo(() => new Map((agents.data ?? []).map((a) => [a.id, a.name])), [agents.data]);
  const hubNameById = useMemo(() => new Map((hubs.data ?? []).map((h) => [h.id, h.name])), [hubs.data]);

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

  // RM Allocation Filtering & Pagination Logic
  const rmFilteredAllocations = useMemo(() => {
    let list = allocations.data ?? [];
    
    if (rmSearchQuery.trim()) {
      const q = rmSearchQuery.toLowerCase();
      list = list.filter(a => {
        const agentName = agentNameById.get(a.agent_id)?.toLowerCase() || "";
        const productName = productNameById.get(a.product_id)?.toLowerCase() || "";
        return agentName.includes(q) || productName.includes(q);
      });
    }
    
    if (rmFilterStatus) {
      list = list.filter(a => a.status === rmFilterStatus);
    }
    
    if (rmFilterHub) {
      list = list.filter(a => {
        const agent = (agents.data ?? []).find(ag => ag.id === a.agent_id);
        return agent?.hub_id === rmFilterHub;
      });
    }
    
    return list;
  }, [allocations.data, rmSearchQuery, rmFilterStatus, rmFilterHub, agents.data, agentNameById, productNameById]);

  const rmTotalPages = Math.ceil(rmFilteredAllocations.length / rmItemsPerPage);
  const rmPaginatedAllocations = rmFilteredAllocations.slice((rmCurrentPage - 1) * rmItemsPerPage, rmCurrentPage * rmItemsPerPage);

  const receiveDispatch = useMutation({
    mutationFn: async (payload: any) => api.post<DispatchOrder>("/distribution/receipts", payload),
    onSuccess: async () => {
      setExpandedReceiptId(null);
      setError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["distribution-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["dispatches"] }),
        queryClient.invalidateQueries({ queryKey: ["balances"] })
      ]);
    },
    onError: (err: any) => setError(err.response?.data?.detail || "Failed to receive dispatch.")
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

  const processWalkInReturn = useMutation({
    mutationFn: async () => api.post("/distribution/agents/return", { 
      ...walkInForm, 
      quantity: Number(walkInForm.quantity),
      target_hub_id: activeHubId
    }),
    onSuccess: async () => {
      setWalkInForm({ agent_code: "", product_id: "", quantity: "1" });
      setIsWalkInReturnOpen(false);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["balances"] });
      alert("Walk-in return successfully processed! Stock added to your Hub.");
    },
    onError: (err: any) => setError(err.response?.data?.detail || "Failed to process walk-in return."),
  });

  const markRepaired = useMutation({
    mutationFn: async ({ product_id, quantity }: { product_id: string, quantity: number }) => api.post(`/hubs/${activeHubId}/repairs`, { product_id, quantity }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["balances"] }); await queryClient.invalidateQueries({ queryKey: ["transactions"] }); },
    onError: (err: any) => setError(err.response?.data?.detail || "Failed to mark as repaired."),
  });

  const activeHubName = hubs.data?.find(h => h.id === activeHubId)?.name || "Hub";

  // =========================================================================
  // EXCLUSIVE VIEW: REGIONAL MANAGER COMMAND CENTER
  // =========================================================================
  if (userRole === "REGIONAL_MANAGER") {
    return (
      <AppShell title="Regional Hubs Overview" description="Live inventory balances and allocation tracking across your region.">
        
        {/* TABLE 1: HUB STOCK MATRIX */}
        <section className="rounded-md border border-line bg-white shadow-sm overflow-hidden mb-8">
          <div className="flex items-center gap-2 border-b border-line px-6 py-4 bg-slate-50">
            <Store className="h-5 w-5 text-slate-600" />
            <h2 className="text-lg font-semibold text-ink">Hub Stock Matrix</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-panel text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-6 py-4 w-1/4">Hub Name</th>
                  <th className="px-6 py-4">Product Name</th>
                  <th className="px-6 py-4 text-right">Sellable Stock</th>
                  <th className="px-6 py-4 text-right text-red-600">Damaged / Reserved</th>
                  <th className="px-6 py-4 text-right font-bold text-ink">Total Held</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(hubs.data ?? []).map((hub) => {
                  const allProducts = products.data?.items ?? [];
                  if (allProducts.length === 0) return null;
                  return (
                    <Fragment key={hub.id}>
                      {allProducts.map((product, index) => {
                        const bal = (balances.data ?? []).find(b => b.location_type === "HUB" && b.location_id === hub.id && b.product_id === product.id);
                        const total = bal?.quantity || 0;
                        const reserved = bal?.reserved_quantity || 0;
                        const damaged = 0; // Handled as reserved in phase 1 structure
                        const sellable = total - reserved - damaged;

                        return (
                          <tr key={`${hub.id}-${product.id}`} className="hover:bg-slate-50 transition-colors">
                            {index === 0 && (
                              <td rowSpan={allProducts.length} className="px-6 py-4 align-top border-r border-line bg-white font-bold text-ink text-base">
                                {hub.name}
                              </td>
                            )}
                            <td className="px-6 py-3 font-medium text-slate-700">{product.name}</td>
                            <td className="px-6 py-3 text-right font-bold text-brand text-base">{sellable > 0 ? sellable : "-"}</td>
                            <td className="px-6 py-3 text-right text-red-600 font-medium">{reserved > 0 ? reserved : "-"}</td>
                            <td className="px-6 py-3 text-right font-bold text-slate-800 text-base">{total > 0 ? total : "-"}</td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
                {hubs.data?.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-500">No operational hubs found in the system.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* TABLE 2: AGENT ALLOCATION TRACKER */}
        <section className="rounded-md border border-line bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-6 py-4 bg-slate-50">
            <ClipboardList className="h-5 w-5 text-slate-600" />
            <h2 className="text-lg font-semibold text-ink">Agent Allocation Status Tracker</h2>
          </div>
          
          {/* Tracker Filter Bar */}
          <div className="flex flex-wrap gap-4 p-4 border-b border-line bg-white">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1"><Search className="h-3 w-3"/> Search</label>
              <input 
                type="text" 
                placeholder="Search agent or product..." 
                className="w-full h-9 px-3 rounded-md border border-line outline-none focus:border-brand text-sm transition-colors"
                value={rmSearchQuery}
                onChange={(e) => { setRmSearchQuery(e.target.value); setRmCurrentPage(1); }}
              />
            </div>
            <div className="w-full md:w-48">
              <label className="text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1"><Filter className="h-3 w-3"/> Status</label>
              <select 
                className="w-full h-9 px-3 rounded-md border border-line outline-none focus:border-brand text-sm bg-white"
                value={rmFilterStatus}
                onChange={(e) => { setRmFilterStatus(e.target.value); setRmCurrentPage(1); }}
              >
                <option value="">All Statuses</option>
                <option value="PENDING">Pending Handover</option>
                <option value="HANDED_OVER">Handed Over</option>
              </select>
            </div>
            <div className="w-full md:w-48">
              <label className="text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1"><Filter className="h-3 w-3"/> Hub</label>
              <select 
                className="w-full h-9 px-3 rounded-md border border-line outline-none focus:border-brand text-sm bg-white"
                value={rmFilterHub}
                onChange={(e) => { setRmFilterHub(e.target.value); setRmCurrentPage(1); }}
              >
                <option value="">All Hubs</option>
                {(hubs.data ?? []).map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-panel text-xs uppercase text-slate-500 border-b border-line">
                <tr>
                  <th className="px-6 py-3">Timestamp</th>
                  <th className="px-6 py-3">Hub Name</th>
                  <th className="px-6 py-3">Agent</th>
                  <th className="px-6 py-3">Product</th>
                  <th className="px-6 py-3 text-right">Qty</th>
                  <th className="px-6 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rmPaginatedAllocations.map(allocation => {
                  const agent = (agents.data ?? []).find(a => a.id === allocation.agent_id);
                  const hubName = agent ? hubNameById.get(agent.hub_id) : "Unknown Hub";
                  const statusTone = allocation.status === "PENDING" ? "warning" : "success";

                  return (
                    <tr key={allocation.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 text-slate-500 text-xs">
                        {new Date(allocation.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-3 font-semibold text-slate-700">{hubName || "N/A"}</td>
                      <td className="px-6 py-3 font-medium text-ink">{agentNameById.get(allocation.agent_id) ?? "Unknown Agent"}</td>
                      <td className="px-6 py-3 text-slate-600">{productNameById.get(allocation.product_id) ?? "Unknown Product"}</td>
                      <td className="px-6 py-3 text-right font-bold text-slate-800">{allocation.quantity}</td>
                      <td className="px-6 py-3 text-center">
                        <StatusBadge tone={statusTone}>{allocation.status.replace("_", " ")}</StatusBadge>
                      </td>
                    </tr>
                  )
                })}
                {rmPaginatedAllocations.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500">No agent allocations match your filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Tracker Pagination Footer */}
          {rmTotalPages > 1 && (
            <div className="flex items-center justify-between border-t border-line px-6 py-3 bg-slate-50">
              <span className="text-xs text-slate-500">
                Showing {(rmCurrentPage - 1) * rmItemsPerPage + 1} to {Math.min(rmCurrentPage * rmItemsPerPage, rmFilteredAllocations.length)} of {rmFilteredAllocations.length} entries
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setRmCurrentPage(p => Math.max(1, p - 1))}
                  disabled={rmCurrentPage === 1}
                  className="px-3 py-1.5 text-xs font-medium border border-line bg-white text-slate-600 rounded hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setRmCurrentPage(p => Math.min(rmTotalPages, p + 1))}
                  disabled={rmCurrentPage === rmTotalPages}
                  className="px-3 py-1.5 text-xs font-medium border border-line bg-white text-slate-600 rounded hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </AppShell>
    );
  }

  // =========================================================================
  // STANDARD VIEW: HUB OFFICERS & MANAGERS
  // =========================================================================
  return (
    <AppShell title={`${activeHubName} Hub Dashboard`} description="Manage receipts, agent handovers, and inventory.">
      
      {/* HUB SELECTOR FOR NON-OFFICERS */}
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

      {/* WALK-IN AGENT RETURN BAR */}
      <section className="mb-6">
        <div className="rounded-md border border-line bg-white shadow-sm overflow-hidden transition-all">
          <button type="button" onClick={() => setIsWalkInReturnOpen(!isWalkInReturnOpen)} className="flex w-full items-center justify-between bg-indigo-50 px-6 py-4 hover:bg-indigo-100 transition-colors focus:outline-none">
            <div className="flex items-center gap-3">
              <UserCheck className="h-6 w-6 text-indigo-600" />
              <h2 className="text-lg font-semibold text-indigo-900">Process Walk-In Agent Return</h2>
            </div>
            <div className="flex items-center gap-2 text-sm font-medium text-indigo-700">
              {isWalkInReturnOpen ? "Close" : "Open Form"}
              {isWalkInReturnOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </div>
          </button>
          
          {isWalkInReturnOpen && (
            <div className="border-t border-indigo-100 bg-white p-6">
              <form onSubmit={(e) => { e.preventDefault(); processWalkInReturn.mutate(); }}>
                <div className="grid gap-4 md:grid-cols-4 items-end">
                  <TextField label="Agent Code (e.g. AGT-1A2B)" value={walkInForm.agent_code} onChange={(e) => setWalkInForm({ ...walkInForm, agent_code: e.target.value.toUpperCase() })} required placeholder="AGT-XXXX" />
                  <SelectField label="Product Being Returned" value={walkInForm.product_id} onChange={(e) => setWalkInForm({ ...walkInForm, product_id: e.target.value })} required>
                    <option value="">Select product...</option>
                    {(products.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </SelectField>
                  <TextField label="Quantity" min={1} type="number" value={walkInForm.quantity} onChange={(e) => setWalkInForm({ ...walkInForm, quantity: e.target.value })} required />
                  <ActionButton disabled={processWalkInReturn.isPending || !activeHubId} type="submit" className="w-full h-10 bg-indigo-600 hover:bg-indigo-700">
                    {processWalkInReturn.isPending ? "Processing..." : "Receive Stock"}
                  </ActionButton>
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
              hubReceiptRows.map((dispatch) => {
                const isExpanded = expandedReceiptId === dispatch.id;
                const totalReported = Number(receiptForm.received) + Number(receiptForm.damaged) + Number(receiptForm.missing);
                const isMathValid = totalReported === dispatch.quantity;

                return (
                  <div key={dispatch.id} className="flex flex-col gap-4 rounded-lg border border-line bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-ink">{productNameById.get(dispatch.product_id) ?? dispatch.product_id}</p>
                        <p className="text-sm text-slate-600">Expected: <strong className="text-brand">{dispatch.quantity} Units</strong></p>
                      </div>
                      {dispatch.status === "RECEIVED" ? (
                        <StatusBadge tone="success">Confirmed</StatusBadge>
                      ) : (
                        !isExpanded && (
                          <ActionButton variant="secondary" onClick={() => {
                            setExpandedReceiptId(dispatch.id);
                            setReceiptForm({ received: dispatch.quantity, damaged: 0, missing: 0, notes: "" });
                          }}>
                            Log Receipt
                          </ActionButton>
                        )
                      )}
                    </div>

                    {/* EXPANDABLE DISCREPANCY FORM */}
                    {isExpanded && dispatch.status === "DISPATCHED" && (
                      <div className="border-t border-line pt-4 grid gap-4">
                        <div className="p-3 bg-blue-50 rounded-md border border-blue-100">
                          <p className="text-sm font-semibold text-blue-900 flex items-center gap-1"><AlertTriangle className="h-4 w-4"/> Delivery Discrepancy Check</p>
                          <p className="text-xs text-blue-700 mt-1">You must account for exactly <strong>{dispatch.quantity} units</strong> to unlock the submit button.</p>
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
                            disabled={!isMathValid || receiveDispatch.isPending || ((receiptForm.damaged > 0 || receiptForm.missing > 0) && !receiptForm.notes)} 
                            onClick={() => receiveDispatch.mutate({
                              dispatch_order_id: dispatch.id,
                              quantity_received: receiptForm.received,
                              damaged_quantity: receiptForm.damaged,
                              missing_quantity: receiptForm.missing,
                              notes: receiptForm.notes
                            })}
                          >
                            <CheckCircle className="h-4 w-4 mr-2" /> Confirm & Process
                          </ActionButton>
                        </div>
                        {!isMathValid && <p className="text-xs text-red-600 text-right">Current sum: {totalReported}. Must equal {dispatch.quantity}.</p>}
                      </div>
                    )}
                  </div>
                );
              })
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
                    <p className="text-xs text-slate-400 mt-1 font-mono">
                      {new Date(allocation.created_at).toLocaleString()}
                    </p>
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
                const damaged = 0; // Or bal?.reserved_quantity if you use that mapping
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