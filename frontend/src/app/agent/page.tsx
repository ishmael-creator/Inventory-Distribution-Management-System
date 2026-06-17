"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, UserSquare2, ShoppingCart, Undo2, History } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ActionButton } from "@/components/ui/action-button";
import { SelectField } from "@/components/ui/form-field";
import { api } from "@/lib/api";
import type { ProductPage, AgentRecord, InventoryBalance, InventoryTransaction } from "@/types/inventory";

export default function AgentDashboardPage() {
  const queryClient = useQueryClient();
  
  // Master Filter State
  const [activeAgentId, setActiveAgentId] = useState<string>("");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Queries
  const agents = useQuery({ queryKey: ["agents"], queryFn: async () => (await api.get<AgentRecord[]>("/distribution/agents")).data });
  const products = useQuery({ queryKey: ["products"], queryFn: async () => (await api.get<ProductPage>("/products")).data });
  const balances = useQuery({ queryKey: ["agent-balances"], queryFn: async () => (await api.get<InventoryBalance[]>("/inventory/balances?location_type=AGENT")).data });
  const transactions = useQuery({ queryKey: ["transactions"], queryFn: async () => (await api.get<InventoryTransaction[]>("/inventory/transactions")).data });

  const productNameById = useMemo(() => new Map((products.data?.items ?? []).map((p) => [p.id, p.name])), [products.data?.items]);

  // Filtered Data based on selected Agent
  const activeAgent = useMemo(() => (agents.data ?? []).find(a => a.id === activeAgentId), [agents.data, activeAgentId]);
  
  const agentBackpack = useMemo(() => {
    return (balances.data ?? []).filter(bal => bal.location_id === activeAgentId && bal.quantity > 0);
  }, [balances.data, activeAgentId]);

  const agentSalesHistory = useMemo(() => {
    return (transactions.data ?? [])
      .filter(tx => tx.from_location_id === activeAgentId && tx.transaction_type === "SALE")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [transactions.data, activeAgentId]);

  // Return to Hub Mutation
  const returnStock = useMutation({
    mutationFn: async ({ product_id, quantity }: { product_id: string, quantity: number }) =>
      api.post("/distribution/agents/return", { agent_id: activeAgentId, product_id, quantity }),
    onSuccess: async () => {
      setError(null);
      setSuccess("Stock successfully returned to the Hub!");
      setTimeout(() => setSuccess(null), 4000);
      await queryClient.invalidateQueries({ queryKey: ["agent-balances"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["warehouse-balances"] }); // Hub balances are tracked here too
    },
    onError: (err: any) => setError(err.response?.data?.detail || "Failed to return stock.")
  });

  return (
    <AppShell title="Agent Monitoring Dashboard" description="Select an agent to view their current holding stock, process returns, and track sales history.">
      
      {/* 1. MASTER AGENT FILTER */}
      <section className="mb-8 rounded-md border border-brand bg-teal-50/30 p-6 shadow-sm">
        <div className="max-w-md">
          <SelectField 
            label="Select Active Agent" 
            value={activeAgentId} 
            onChange={(e) => setActiveAgentId(e.target.value)}
          >
            <option value="">-- Choose an Agent --</option>
            {(agents.data ?? []).map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name} ({agent.agent_code})
              </option>
            ))}
          </SelectField>
        </div>
      </section>

      {error && <div className="mb-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && <div className="mb-6 rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}

      {!activeAgentId ? (
        <div className="py-20 text-center rounded-md border border-dashed border-slate-300 bg-slate-50">
          <UserSquare2 className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-slate-600">No Agent Selected</h3>
          <p className="text-sm text-slate-500">Please select an agent from the dropdown above to view their data.</p>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
          
          {/* 2. CURRENT BACKPACK (HELD INVENTORY) */}
          <section className="rounded-md border border-line bg-white h-fit shadow-sm">
            <div className="flex items-center gap-2 border-b border-line bg-slate-50 px-4 py-3">
              <Package className="h-5 w-5 text-brand" />
              <h2 className="text-sm font-semibold text-ink">Current Holding Inventory (Backpack)</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-panel text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Product Name</th>
                    <th className="px-4 py-3 font-bold text-brand">Held Qty</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {agentBackpack.map((balance) => (
                    <tr key={balance.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-ink">{productNameById.get(balance.product_id) ?? balance.product_id}</td>
                      <td className="px-4 py-3 font-bold text-slate-700">{balance.quantity} Units</td>
                      <td className="px-4 py-3 text-right">
                        <ActionButton 
                          variant="secondary" 
                          onClick={() => {
                            const qtyStr = prompt(`How many units of ${productNameById.get(balance.product_id)} is ${activeAgent?.name} returning to the Hub?`, balance.quantity.toString());
                            const qty = parseInt(qtyStr || "0");
                            if (qty > 0 && qty <= balance.quantity) {
                              returnStock.mutate({ product_id: balance.product_id, quantity: qty });
                            } else if (qty > balance.quantity) {
                              alert("Cannot return more than they are currently holding!");
                            }
                          }}
                          disabled={returnStock.isPending}
                        >
                          <Undo2 className="h-4 w-4 mr-2" /> Return to Hub
                        </ActionButton>
                      </td>
                    </tr>
                  ))}
                  {agentBackpack.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                        This agent currently has zero stock in their possession.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* 3. SALES HISTORY LOG */}
          <section className="rounded-md border border-line bg-white h-fit shadow-sm">
            <div className="flex items-center gap-2 border-b border-line bg-emerald-50/50 px-4 py-3">
              <History className="h-5 w-5 text-emerald-600" />
              <h2 className="text-sm font-semibold text-emerald-900">Agent Sales History</h2>
            </div>
            <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
              {agentSalesHistory.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-sm">No sales recorded yet.</div>
              ) : (
                agentSalesHistory.map((tx) => (
                  <div key={tx.id} className="flex flex-col gap-1 rounded-lg border border-line bg-slate-50 p-3 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-ink">{productNameById.get(tx.product_id) ?? "Unknown"}</span>
                      <span className="font-bold text-emerald-600">+{tx.quantity} Sold</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
                      <span>{new Date(tx.created_at).toLocaleString()}</span>
                      <ShoppingCart className="h-3 w-3" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

        </div>
      )}
    </AppShell>
  );
}