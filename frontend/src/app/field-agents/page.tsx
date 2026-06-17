"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Store, UserPlus, ShoppingCart, Contact, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ActionButton } from "@/components/ui/action-button";
import { SelectField, TextField } from "@/components/ui/form-field";
import { api } from "@/lib/api";
import type { HubRecord, ProductPage, AgentRecord } from "@/types/inventory";

export default function FieldAgentsPage() {
  const queryClient = useQueryClient();

  const [newAgentForm, setNewAgentForm] = useState({ name: "", phone: "", hub_id: "" });
  const [agentAllocationForm, setAgentAllocationForm] = useState({ agent_id: "", product_id: "", quantity: "1" });
  const [agentSaleForm, setAgentSaleForm] = useState({ agent_id: "", product_id: "", quantity: "1" });
  
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Queries
  const products = useQuery({ queryKey: ["products"], queryFn: async () => (await api.get<ProductPage>("/products")).data });
  const hubs = useQuery({ queryKey: ["hubs"], queryFn: async () => (await api.get<HubRecord[]>("/distribution/hubs")).data });
  const agents = useQuery({ queryKey: ["agents"], queryFn: async () => (await api.get<AgentRecord[]>("/distribution/agents")).data });

  const hubNameById = useMemo(() => new Map((hubs.data ?? []).map((item) => [item.id, item.name])), [hubs.data]);

  // Mutations
  const createAgent = useMutation({
    mutationFn: async () => api.post("/distribution/agents", newAgentForm),
    onSuccess: async () => { 
      setNewAgentForm({ name: "", phone: "", hub_id: "" }); 
      setError(null); 
      setSuccess("Agent successfully registered!"); 
      await queryClient.invalidateQueries({ queryKey: ["agents"] }); 
      setTimeout(() => setSuccess(null), 4000);
    },
    onError: (err: any) => setError(err.response?.data?.detail || "Failed to register agent.")
  });

  const allocateStockToAgent = useMutation({
    mutationFn: async () => api.post("/distribution/agents/allocate", {
      agent_id: agentAllocationForm.agent_id, product_id: agentAllocationForm.product_id, quantity: Number(agentAllocationForm.quantity)
    }),
    onSuccess: async () => { 
      setAgentAllocationForm({ agent_id: "", product_id: "", quantity: "1" }); 
      setError(null); 
      setSuccess("Allocation sent to Hub Officer for handover!"); 
      setTimeout(() => setSuccess(null), 4000);
    },
    onError: (err: any) => setError(err.response?.data?.detail || "Failed to allocate stock.")
  });

  const recordFinalSale = useMutation({
    mutationFn: async () => api.post("/distribution/agents/sales", {
      agent_id: agentSaleForm.agent_id, product_id: agentSaleForm.product_id, quantity: Number(agentSaleForm.quantity)
    }),
    onSuccess: async () => { 
      setAgentSaleForm({ agent_id: "", product_id: "", quantity: "1" }); 
      setError(null); 
      setSuccess("Sale successfully recorded and stock deducted!"); 
      setTimeout(() => setSuccess(null), 4000);
    },
    onError: (err: any) => setError(err.response?.data?.detail || "Failed to record sale. Ensure the agent has accepted the stock handover.")
  });

  // NEW: Delete Agent Mutation
  const deleteAgent = useMutation({
    mutationFn: async (agentId: string) => api.delete(`/distribution/agents/${agentId}`),
    onSuccess: async () => {
      setError(null);
      setSuccess("Agent successfully removed from the system.");
      setTimeout(() => setSuccess(null), 4000);
      await queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
    onError: (err: any) => setError(err.response?.data?.detail || "Failed to delete agent.")
  });

  return (
    <AppShell title="Field Agents & Sales" description="Register field agents, allocate stock for dispatch, and log field sales.">
      {error && <div className="mb-6 rounded-md bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}
      {success && <div className="mb-6 rounded-md bg-green-50 px-4 py-3 text-sm font-medium text-green-700">{success}</div>}

      <div className="grid gap-8 max-w-5xl">
        
        {/* Tool 1: Create Agent */}
        <section className="rounded-md border border-line bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line bg-slate-50 px-6 py-4">
            <UserPlus className="h-5 w-5 text-brand" />
            <h2 className="text-lg font-semibold text-ink">1. Register New Agent</h2>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); createAgent.mutate(); }} className="p-6">
            <div className="grid gap-4 md:grid-cols-4 items-end">
              <TextField label="Agent Name" value={newAgentForm.name} onChange={(e) => setNewAgentForm({ ...newAgentForm, name: e.target.value })} required />
              <TextField label="Phone (Optional)" value={newAgentForm.phone} onChange={(e) => setNewAgentForm({ ...newAgentForm, phone: e.target.value })} />
              <SelectField label="Assigned Hub" value={newAgentForm.hub_id} onChange={(e) => setNewAgentForm({ ...newAgentForm, hub_id: e.target.value })} required>
                <option value="">Select hub</option>
                {(hubs.data ?? []).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </SelectField>
              <ActionButton disabled={createAgent.isPending} type="submit" className="w-full">Register Agent</ActionButton>
            </div>
          </form>
        </section>

        {/* Tool 2: Allocate Stock */}
        <section className="rounded-md border border-line bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line bg-indigo-50/50 px-6 py-4">
            <Store className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-ink">2. Allocate Stock to Agent </h2>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); allocateStockToAgent.mutate(); }} className="p-6">
            <div className="grid gap-4 md:grid-cols-4 items-end">
              <SelectField label="Select Agent" value={agentAllocationForm.agent_id} onChange={(e) => setAgentAllocationForm({ ...agentAllocationForm, agent_id: e.target.value })} required>
                <option value="">Select agent</option>
                {(agents.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name} ({hubNameById.get(a.hub_id)})</option>)}
              </SelectField>
              <SelectField label="Product" value={agentAllocationForm.product_id} onChange={(e) => setAgentAllocationForm({ ...agentAllocationForm, product_id: e.target.value })} required>
                <option value="">Select product</option>
                {(products.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </SelectField>
              <TextField label="Quantity" min={1} type="number" value={agentAllocationForm.quantity} onChange={(e) => setAgentAllocationForm({ ...agentAllocationForm, quantity: e.target.value })} required />
              <ActionButton disabled={allocateStockToAgent.isPending} type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700">Allocate to Agent</ActionButton>
            </div>
          </form>
        </section>

        {/* Tool 3: Record Sale */}
        <section className="rounded-md border border-line bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line bg-emerald-50/50 px-6 py-4">
            <ShoppingCart className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-ink">3. Record Final Agent Sale</h2>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); recordFinalSale.mutate(); }} className="p-6">
            <div className="grid gap-4 md:grid-cols-4 items-end">
              <SelectField label="Select Agent" value={agentSaleForm.agent_id} onChange={(e) => setAgentSaleForm({ ...agentSaleForm, agent_id: e.target.value })} required>
                <option value="">Select agent</option>
                {(agents.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </SelectField>
              <SelectField label="Product" value={agentSaleForm.product_id} onChange={(e) => setAgentSaleForm({ ...agentSaleForm, product_id: e.target.value })} required>
                <option value="">Select product</option>
                {(products.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </SelectField>
              <TextField label="Qty Sold" min={1} type="number" value={agentSaleForm.quantity} onChange={(e) => setAgentSaleForm({ ...agentSaleForm, quantity: e.target.value })} required />
              <ActionButton disabled={recordFinalSale.isPending} type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700">Record Sale</ActionButton>
            </div>
          </form>
        </section>

        {/* Tool 4: Manage Active Agents (Directory) */}
        <section className="rounded-md border border-line bg-white shadow-sm overflow-hidden mb-12">
          <div className="flex items-center gap-2 border-b border-line bg-slate-50 px-6 py-4">
            <Contact className="h-5 w-5 text-slate-600" />
            <h2 className="text-lg font-semibold text-ink">4. Active Agent Directory</h2>
          </div>
          <div className="overflow-x-auto p-4">
            <table className="w-full text-left text-sm">
              <thead className="bg-panel text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Agent Name</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Hub Location</th>
                  <th className="px-4 py-3">Phone / Contact</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(agents.data ?? []).map((agent) => (
                  <tr key={agent.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-ink">{agent.name}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-bold text-brand bg-teal-50 px-2 py-1 rounded">
                        {agent.agent_code}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{hubNameById.get(agent.hub_id) ?? "Unknown"}</td>
                    <td className="px-4 py-3 text-slate-600">{(agent as any).territory || agent.phone || "N/A"}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          if (window.confirm(`Are you absolutely sure you want to delete ${agent.name}? This will revoke their access immediately.`)) {
                            deleteAgent.mutate(agent.id);
                          }
                        }}
                        disabled={deleteAgent.isPending}
                        className="inline-flex items-center gap-1 rounded bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" /> Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {(!agents.data || agents.data.length === 0) && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No active agents found in the system.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </AppShell>
  );
}