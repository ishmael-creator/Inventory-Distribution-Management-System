"use client";

import { useMemo, useState, useEffect, Fragment } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Store, UserCheck, CheckCircle, Boxes, ShieldAlert, ChevronDown, ChevronUp, Truck, AlertTriangle, ClipboardList, Search, Filter, ArrowRightLeft, Undo2, Send } from "lucide-react";

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

  // Walk-In Return State
  const [isWalkInReturnOpen, setIsWalkInReturnOpen] = useState(false);
  const [walkInForm, setWalkInForm] = useState({ agent_code: "", product_id: "", quantity: "1", condition: "GOOD", reason_type: "END_OF_DAY", custom_reason: "" });

  const [isHubTransferOpen, setIsHubTransferOpen] = useState(false);
  const [hubTransferForm, setHubTransferForm] = useState({ source_hub_id: "", destination_hub_id: "", product_id: "", quantity: "1", reason: "" });

  const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(null);
  const [receiptForm, setReceiptForm] = useState({ received: 0, damaged: 0, missing: 0, notes: "" });

  // NEW: Return to Warehouse State
  const [isReturnToWarehouseOpen, setIsReturnToWarehouseOpen] = useState(false);
  const [returnToWarehouseForm, setReturnToWarehouseForm] = useState({ product_id: "", quantity: "1", reason: "" });

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

  const activeHub = useMemo(() => (hubs.data ?? []).find(h => h.id === activeHubId), [hubs.data, activeHubId]);

  // DATA FILTERS
  const pendingHandovers = useMemo(() => (allocations.data ?? []).filter(a => a.status === "PENDING"), [allocations.data]);
  const currentInventory = useMemo(() => (balances.data ?? []).filter(bal => bal.location_type === "HUB" && bal.location_id === activeHubId), [balances.data, activeHubId]);
  
  const lateralTransfers = useMemo(() => {
    return (dispatches.data ?? []).filter(d => d.from_location_type === "HUB" && d.to_location_type === "HUB")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [dispatches.data]);

  const hubReceiptRows = useMemo(() => {
    return (dispatches.data ?? []).filter(d => (d.status === "DISPATCHED" || d.status === "RECEIVED") && d.to_location_id === activeHubId);
  }, [dispatches.data, activeHubId]);

  // Outbound Draft Transfers Queue for the Source Hub!
  const outboundTransfers = useMemo(() => {
    return (dispatches.data ?? []).filter(d => 
      d.from_location_type === "HUB" && 
      d.from_location_id === activeHubId && 
      d.status === "DRAFT" && 
      d.to_location_type === "HUB"
    );
  }, [dispatches.data, activeHubId]);

  // RM Allocation Filtering
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
    if (rmFilterStatus) list = list.filter(a => a.status === rmFilterStatus);
    if (rmFilterHub) list = list.filter(a => {
      const agent = (agents.data ?? []).find(ag => ag.id === a.agent_id);
      return agent?.hub_id === rmFilterHub;
    });
    return list;
  }, [allocations.data, rmSearchQuery, rmFilterStatus, rmFilterHub, agents.data, agentNameById, productNameById]);

  const rmTotalPages = Math.ceil(rmFilteredAllocations.length / rmItemsPerPage);
  const rmPaginatedAllocations = rmFilteredAllocations.slice((rmCurrentPage - 1) * rmItemsPerPage, rmCurrentPage * rmItemsPerPage);

  // Mutations
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

  // STEP 1: INITIATE
  const initiateHubTransfer = useMutation({
    mutationFn: async () => api.post("/distribution/hubs/transfer", {
      source_hub_id: hubTransferForm.source_hub_id,
      destination_hub_id: hubTransferForm.destination_hub_id,
      product_id: hubTransferForm.product_id,
      quantity: Number(hubTransferForm.quantity),
      reason: hubTransferForm.reason
    }),
    onSuccess: async () => {
      setHubTransferForm({ source_hub_id: "", destination_hub_id: "", product_id: "", quantity: "1", reason: "" });
      setIsHubTransferOpen(false);
      setError(null);
      alert("Transfer Initiated! The Source Hub must now click Dispatch before it leaves their inventory.");
      await queryClient.invalidateQueries({ queryKey: ["dispatches"] });
    },
    onError: (err: any) => setError(err.response?.data?.detail || "Failed to initiate transfer."),
  });

  // STEP 2: DISPATCH
  const dispatchHubTransfer = useMutation({
    mutationFn: async (dispatchId: string) => api.post(`/distribution/hubs/transfer/${dispatchId}/dispatch`),
    onSuccess: async () => {
      setError(null);
      alert("Transfer successfully dispatched! Stock has been deducted from your hub.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dispatches"] }),
        queryClient.invalidateQueries({ queryKey: ["balances"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] })
      ]);
    },
    onError: (err: any) => setError(err.response?.data?.detail || "Failed to dispatch transfer.")
  });

  const processWalkInReturn = useMutation({
    mutationFn: async () => {
      const finalReason = walkInForm.reason_type === "OTHER" ? walkInForm.custom_reason : walkInForm.reason_type;
      return api.post("/distribution/agents/return", {
        agent_code: walkInForm.agent_code,
        product_id: walkInForm.product_id,
        quantity: Number(walkInForm.quantity),
        condition: walkInForm.condition,
        reason: finalReason,
        target_hub_id: activeHubId
      });
    },
    onSuccess: async () => {
      setWalkInForm({ agent_code: "", product_id: "", quantity: "1", condition: "GOOD", reason_type: "END_OF_DAY", custom_reason: "" });
      setIsWalkInReturnOpen(false);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["balances"] });
      alert("Walk-in return successfully processed! Stock added to your Hub.");
    },
    onError: (err: any) => setError(err.response?.data?.detail || "Failed to process walk-in return."),
  });

  const dispatchToWarehouse = useMutation({
    mutationFn: async () => {
      if (!activeHub?.warehouse_id) throw new Error("No linked Central Warehouse found for this Hub.");
      return api.post("/distribution/reverse-logistics/dispatch", {
        source_location_type: "HUB",
        source_location_id: activeHubId,
        destination_location_type: "WAREHOUSE",
        destination_location_id: activeHub.warehouse_id, 
        product_id: returnToWarehouseForm.product_id,
        quantity: Number(returnToWarehouseForm.quantity),
        reason: returnToWarehouseForm.reason
      });
    },
    onSuccess: async () => {
      setReturnToWarehouseForm({ product_id: "", quantity: "1", reason: "" });
      setIsReturnToWarehouseOpen(false);
      setError(null);
      alert("Damaged stock successfully dispatched back to the Central Warehouse!");
      await queryClient.invalidateQueries({ queryKey: ["balances"] });
      await queryClient.invalidateQueries({ queryKey: ["dispatches"] });
    },
    onError: (err: any) => setError(err.message || err.response?.data?.detail || "Failed to dispatch return.")
  });

  const activeHubName = activeHub?.name || "Hub";
  const canInitiateTransfers = ["SUPER_ADMIN", "DISTRIBUTION_TEAM", "MANAGER", "REGIONAL_MANAGER"].includes(userRole || "");

  // =========================================================================
  // EXCLUSIVE VIEW: REGIONAL MANAGER COMMAND CENTER
  // =========================================================================
  if (userRole === "REGIONAL_MANAGER") {
    return (
      <AppShell title="Regional Hubs Overview" description="Live inventory balances and allocation tracking across your region.">

        {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <section className="mb-8">
          <div className="rounded-md border border-line bg-white shadow-sm overflow-hidden transition-all">
            <button type="button" onClick={() => setIsHubTransferOpen(!isHubTransferOpen)} className="flex w-full items-center justify-between bg-amber-50 px-6 py-4 hover:bg-amber-100 transition-colors focus:outline-none">
              <div className="flex items-center gap-3">
                <ArrowRightLeft className="h-6 w-6 text-amber-600" />
                <h2 className="text-lg font-semibold text-amber-900">Initiate Lateral Hub Transfer</h2>
              </div>
              <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
                {isHubTransferOpen ? "Close" : "Open Form"}
                {isHubTransferOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </button>

            {isHubTransferOpen && (
              <div className="border-t border-amber-100 bg-white p-6">
                <form onSubmit={(e) => { e.preventDefault(); initiateHubTransfer.mutate(); }}>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 items-end">
                    <SelectField label="Source Hub" value={hubTransferForm.source_hub_id} onChange={(e) => setHubTransferForm({ ...hubTransferForm, source_hub_id: e.target.value })} required>
                      <option value="">Select Origin...</option>
                      {(hubs.data ?? []).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                    </SelectField>
                    <SelectField label="Destination Hub" value={hubTransferForm.destination_hub_id} onChange={(e) => setHubTransferForm({ ...hubTransferForm, destination_hub_id: e.target.value })} required>
                      <option value="">Select Destination...</option>
                      {(hubs.data ?? []).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                    </SelectField>
                    <SelectField label="Product to Move" value={hubTransferForm.product_id} onChange={(e) => setHubTransferForm({ ...hubTransferForm, product_id: e.target.value })} required>
                      <option value="">Select product...</option>
                      {(products.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </SelectField>
                    <TextField label="Quantity" min={1} type="number" value={hubTransferForm.quantity} onChange={(e) => setHubTransferForm({ ...hubTransferForm, quantity: e.target.value })} required />

                    <div className="md:col-span-2 lg:col-span-4">
                      <TextField label="Transfer Reason" placeholder="Why is this stock being moved laterally?" value={hubTransferForm.reason} onChange={(e) => setHubTransferForm({ ...hubTransferForm, reason: e.target.value })} required />
                    </div>

                    <div className="md:col-span-2 lg:col-span-4 mt-2">
                      <ActionButton disabled={initiateHubTransfer.isPending} type="submit" className="w-full h-12 text-base bg-amber-600 hover:bg-amber-700">
                        {initiateHubTransfer.isPending ? "Initiating..." : "Initiate Transfer"}
                      </ActionButton>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>
        </section>

        <section className="mt-6 mb-8 rounded-md border border-line bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3 bg-amber-50/50">
            <ArrowRightLeft className="h-5 w-5 text-amber-600" />
            <h2 className="text-sm font-semibold text-amber-900">Lateral Hub Transfers Tracking</h2>
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
                  const originHubName = hubNameById.get(transfer.from_location_id) || "Origin Hub";
                  const destHubName = hubNameById.get(transfer.to_location_id) || "Destination Hub";

                  // Dynamic status text incorporating exact hub names
                  const statusLabel = transfer.status === "DRAFT" 
                    ? `Initiated awaiting ${originHubName} dispatch`
                    : isDispatched 
                    ? `Awaiting ${destHubName} receipt`
                    : transfer.status === "RECEIVED"
                    ? `Confirmed at ${destHubName}`
                    : transfer.status.replaceAll("_", " ");

                  return (
                    <tr key={transfer.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-slate-500">{new Date(transfer.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 font-medium text-ink">{productNameById.get(transfer.product_id) ?? "Unknown"}</td>
                      <td className="px-4 py-3 text-slate-600">{originHubName}</td>
                      <td className="px-4 py-3 font-semibold text-ink">{destHubName}</td>
                      <td className="px-4 py-3 font-bold text-slate-700">{transfer.quantity}</td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge tone={transfer.status === "DRAFT" ? "neutral" : isDispatched ? "warning" : transfer.status === "RECEIVED" ? "success" : "neutral"}>
                          {statusLabel}
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
                        const damaged = 0;
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

        <section className="rounded-md border border-line bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-6 py-4 bg-slate-50">
            <ClipboardList className="h-5 w-5 text-slate-600" />
            <h2 className="text-lg font-semibold text-ink">Agent Allocation Status Tracker</h2>
          </div>

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
  const canManage = userRole === "HUB_OFFICER" || userRole === "SUPER_ADMIN" || userRole === "MANAGER";

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

      {/* LATERAL HUB TRANSFER BAR */}
      {canInitiateTransfers && (
        <section className="mb-6">
          <div className="rounded-md border border-line bg-white shadow-sm overflow-hidden transition-all">
            <button type="button" onClick={() => setIsHubTransferOpen(!isHubTransferOpen)} className="flex w-full items-center justify-between bg-amber-50 px-6 py-4 hover:bg-amber-100 transition-colors focus:outline-none">
              <div className="flex items-center gap-3">
                <ArrowRightLeft className="h-6 w-6 text-amber-600" />
                <h2 className="text-lg font-semibold text-amber-900">Initiate Lateral Hub Transfer</h2>
              </div>
              <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
                {isHubTransferOpen ? "Close" : "Open Form"}
                {isHubTransferOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </button>

            {isHubTransferOpen && (
              <div className="border-t border-amber-100 bg-white p-6">
                <form onSubmit={(e) => { e.preventDefault(); initiateHubTransfer.mutate(); }}>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 items-end">
                    <SelectField label="Source Hub" value={hubTransferForm.source_hub_id} onChange={(e) => setHubTransferForm({ ...hubTransferForm, source_hub_id: e.target.value })} required>
                      <option value="">Select Origin...</option>
                      {(hubs.data ?? []).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                    </SelectField>
                    <SelectField label="Destination Hub" value={hubTransferForm.destination_hub_id} onChange={(e) => setHubTransferForm({ ...hubTransferForm, destination_hub_id: e.target.value })} required>
                      <option value="">Select Destination...</option>
                      {(hubs.data ?? []).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                    </SelectField>
                    <SelectField label="Product to Move" value={hubTransferForm.product_id} onChange={(e) => setHubTransferForm({ ...hubTransferForm, product_id: e.target.value })} required>
                      <option value="">Select product...</option>
                      {(products.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </SelectField>
                    <TextField label="Quantity" min={1} type="number" value={hubTransferForm.quantity} onChange={(e) => setHubTransferForm({ ...hubTransferForm, quantity: e.target.value })} required />

                    <div className="md:col-span-2 lg:col-span-4">
                      <TextField label="Transfer Reason" placeholder="Why is this stock being moved laterally?" value={hubTransferForm.reason} onChange={(e) => setHubTransferForm({ ...hubTransferForm, reason: e.target.value })} required />
                    </div>

                    <div className="md:col-span-2 lg:col-span-4 mt-2">
                      <ActionButton disabled={initiateHubTransfer.isPending} type="submit" className="w-full h-12 text-base bg-amber-600 hover:bg-amber-700">
                        {initiateHubTransfer.isPending ? "Initiating..." : "Initiate Transfer"}
                      </ActionButton>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>
        </section>
      )}

      {/* DETAILED WALK-IN AGENT RETURN BAR */}
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
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 items-end">
                  <TextField label="Agent Code (e.g. AGT-1A2B)" value={walkInForm.agent_code} onChange={(e) => setWalkInForm({ ...walkInForm, agent_code: e.target.value.toUpperCase() })} required placeholder="AGT-XXXX" />
                  <SelectField label="Product Being Returned" value={walkInForm.product_id} onChange={(e) => setWalkInForm({ ...walkInForm, product_id: e.target.value })} required>
                    <option value="">Select product...</option>
                    {(products.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </SelectField>
                  <TextField label="Quantity" min={1} type="number" value={walkInForm.quantity} onChange={(e) => setWalkInForm({ ...walkInForm, quantity: e.target.value })} required />
                  <SelectField label="Item Condition" value={walkInForm.condition} onChange={(e) => setWalkInForm({ ...walkInForm, condition: e.target.value })} required>
                    <option value="GOOD">Good / Sellable</option>
                    <option value="DAMAGED">Damaged / Defective</option>
                  </SelectField>

                  <div className="md:col-span-2 lg:col-span-4 grid gap-4 md:grid-cols-2">
                    <SelectField label="Reason for Return" value={walkInForm.reason_type} onChange={(e) => setWalkInForm({ ...walkInForm, reason_type: e.target.value })} required>
                      <option value="END_OF_DAY">End of Day Stock Return</option>
                      <option value="CUSTOMER_REJECTED">Customer Rejected Delivery</option>
                      <option value="DEFECTIVE_PRODUCT">Defective Product</option>
                      <option value="OTHER">Other (Specify below)</option>
                    </SelectField>

                    {walkInForm.reason_type === "OTHER" && (
                      <TextField
                        label="Specify Reason"
                        value={walkInForm.custom_reason}
                        onChange={(e) => setWalkInForm({ ...walkInForm, custom_reason: e.target.value })}
                        required
                        placeholder="Type detailed reason here..."
                      />
                    )}
                  </div>

                  <div className="md:col-span-2 lg:col-span-4 mt-2">
                    <ActionButton disabled={processWalkInReturn.isPending || !activeHubId} type="submit" className="w-full h-12 text-base bg-indigo-600 hover:bg-indigo-700">
                      {processWalkInReturn.isPending ? "Processing..." : "Process Return into Hub"}
                    </ActionButton>
                  </div>
                </div>
              </form>
            </div>
          )}
        </div>
      </section>

      {/* NEW: RETURN QUARANTINED STOCK TO WAREHOUSE */}
      <section className="mb-6">
        <div className="rounded-md border border-rose-200 bg-white shadow-sm overflow-hidden transition-all">
          <button type="button" onClick={() => setIsReturnToWarehouseOpen(!isReturnToWarehouseOpen)} className="flex w-full items-center justify-between bg-rose-50 px-6 py-4 hover:bg-rose-100 transition-colors focus:outline-none">
            <div className="flex items-center gap-3">
              <Undo2 className="h-6 w-6 text-rose-600" />
              <h2 className="text-lg font-semibold text-rose-900">Dispatch Quarantined Stock to Warehouse</h2>
            </div>
            <div className="flex items-center gap-2 text-sm font-medium text-rose-700">
              {isReturnToWarehouseOpen ? "Close" : "Open Form"}
              {isReturnToWarehouseOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </div>
          </button>

          {isReturnToWarehouseOpen && (
            <div className="border-t border-rose-200 bg-white p-6">
              <form onSubmit={(e) => { e.preventDefault(); dispatchToWarehouse.mutate(); }}>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 items-end">
                  <SelectField label="Quarantined Product" value={returnToWarehouseForm.product_id} onChange={(e) => setReturnToWarehouseForm({ ...returnToWarehouseForm, product_id: e.target.value })} required>
                    <option value="">Select product...</option>
                    {(products.data?.items ?? []).map((p) => {
                      const bal = currentInventory.find(b => b.product_id === p.id);
                      if (bal && bal.reserved_quantity > 0) {
                        return <option key={p.id} value={p.id}>{p.name} ({bal.reserved_quantity} Damaged)</option>;
                      }
                      return null;
                    })}
                  </SelectField>
                  <TextField label="Quantity to Return" min={1} type="number" value={returnToWarehouseForm.quantity} onChange={(e) => setReturnToWarehouseForm({ ...returnToWarehouseForm, quantity: e.target.value })} required />
                  <div className="md:col-span-2 lg:col-span-3">
                    <TextField label="Return Note" placeholder="e.g. Weekly batch of damaged units for factory repair" value={returnToWarehouseForm.reason} onChange={(e) => setReturnToWarehouseForm({ ...returnToWarehouseForm, reason: e.target.value })} required />
                  </div>
                  <div className="md:col-span-2 lg:col-span-3 mt-2">
                    <ActionButton disabled={dispatchToWarehouse.isPending || !activeHubId} type="submit" className="w-full h-12 text-base bg-rose-600 hover:bg-rose-700">
                      Dispatch Return Truck to Central Warehouse
                    </ActionButton>
                  </div>
                </div>
              </form>
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">

        {/* LEFT COLUMN */}
        <div className="flex flex-col gap-6">

          {/* OUTBOUND DRAFT TRANSFERS (SOURCE HUB DISPATCH QUEUE) */}
          {outboundTransfers.length > 0 && (
            <section className="rounded-md border border-brand bg-teal-50/20 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 border-b border-brand/20 bg-teal-50 px-4 py-3">
                <Send className="h-5 w-5 text-brand" />
                <h2 className="text-sm font-bold text-teal-900">Pending Outbound Transfers</h2>
              </div>
              <div className="p-4 space-y-4">
                  {outboundTransfers.map((dispatch) => (
                    <div key={dispatch.id} className="flex flex-col gap-4 rounded-lg border border-teal-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-ink">{productNameById.get(dispatch.product_id) ?? dispatch.product_id}</p>
                          <p className="text-sm text-slate-600">To: <strong className="text-ink">{hubNameById.get(dispatch.to_location_id)}</strong></p>
                          <p className="text-sm text-slate-600">Qty: <strong className="text-brand">{dispatch.quantity} Units</strong></p>
                        </div>
                        <ActionButton 
                          onClick={() => dispatchHubTransfer.mutate(dispatch.id)} 
                          disabled={!canManage || dispatchHubTransfer.isPending}
                        >
                          <Truck className="h-4 w-4 mr-2" /> Dispatch Truck
                        </ActionButton>
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          )}

          {/* INBOUND DISPATCHES FROM WAREHOUSE */}
          <section className="rounded-md border border-line bg-white h-fit shadow-sm">
            <div className="flex items-center gap-2 border-b border-line bg-blue-50/50 px-4 py-3">
              <Store className="h-5 w-5 text-blue-600" />
              <h2 className="text-sm font-semibold text-blue-900">Inbound Receipts Queue</h2>
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
                          {dispatch.from_location_type === "HUB" && (
                             <span className="mb-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">Lateral Transfer</span>
                          )}
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
        </div>

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
          <h2 className="text-sm font-semibold text-ink">Active Hub Inventory & Quarantines</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-panel text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Product Name</th>
                <th className="px-4 py-3 text-right">Total Held</th>
                <th className="px-4 py-3 text-right">Sellable Stock</th>
                <th className="px-4 py-3 text-right text-red-600">Quarantined (Damaged/Reserved)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(products.data?.items ?? []).map((product) => {
                const bal = currentInventory.find(b => b.product_id === product.id);
                const reserved = bal?.reserved_quantity || 0;
                const total = bal?.quantity || 0;
                const sellable = total - reserved;

                return (
                  <tr key={product.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-ink">{product.name}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{total} Units</td>
                    <td className="px-4 py-3 text-right font-bold text-brand">{sellable} Units</td>
                    <td className="px-4 py-3 text-right font-semibold text-red-600">
                      {reserved > 0 ? reserved : <span className="text-slate-400 font-normal">0</span>}
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