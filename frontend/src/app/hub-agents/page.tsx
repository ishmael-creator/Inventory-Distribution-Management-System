"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Contact, PackageOpen, MapPin } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type { ProductPage, AgentRecord, InventoryBalance, HubRecord } from "@/types/inventory";

export default function HubAgentsPage() {
  const userRole = useAuthStore((state) => state.userRole);

  // Queries
  const agents = useQuery({ queryKey: ["agents"], queryFn: async () => (await api.get<AgentRecord[]>("/distribution/agents")).data });
  const products = useQuery({ queryKey: ["products"], queryFn: async () => (await api.get<ProductPage>("/products")).data });
  const balances = useQuery({ queryKey: ["agent-balances"], queryFn: async () => (await api.get<InventoryBalance[]>("/inventory/balances?location_type=AGENT")).data });
  
  // THE FIX: Fetch the hubs so Distribution/Admins can see where the agents belong
  const hubs = useQuery({ queryKey: ["hubs"], queryFn: async () => (await api.get<HubRecord[]>("/distribution/hubs")).data });

  const productNameById = useMemo(() => new Map((products.data?.items ?? []).map((p) => [p.id, p.name])), [products.data?.items]);
  const hubNameById = useMemo(() => new Map((hubs.data ?? []).map((h) => [h.id, h.name])), [hubs.data]);

  // Ensure we only process agents returned by the backend (which auto-filters for Hub Officers)
  const activeAgents = agents.data ?? [];

  return (
    <AppShell title="Hub Agents Directory" description="Live overview of the field agents and their current holding stock.">
      
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {activeAgents.length === 0 ? (
           <div className="col-span-full py-12 text-center rounded-md border border-dashed border-slate-300 bg-slate-50">
             <Contact className="h-12 w-12 text-slate-300 mx-auto mb-3" />
             <h3 className="text-lg font-semibold text-slate-600">No Agents Assigned</h3>
             <p className="text-sm text-slate-500">There are currently no active field agents in your scope.</p>
           </div>
        ) : (
          activeAgents.map((agent) => {
            // Filter balances down to just what this specific agent is holding
            const agentStock = (balances.data ?? []).filter(bal => bal.location_id === agent.id && bal.quantity > 0);
            const hubName = hubNameById.get(agent.hub_id) ?? "Unknown Hub";

            return (
              <div key={agent.id} className="rounded-md border border-line bg-white shadow-sm overflow-hidden flex flex-col">
                {/* Agent Header */}
                <div className="bg-slate-50 px-4 py-3 border-b border-line flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-ink">{agent.name}</h3>
                    <p className="text-xs font-mono text-slate-500">{agent.agent_code}</p>
                  </div>
                  <div className="bg-brand/10 text-brand p-2 rounded-full">
                    <Contact className="h-5 w-5" />
                  </div>
                </div>

                {/* Hub Location Tag (Very useful for Distribution/Admins) */}
                {userRole !== "HUB_OFFICER" && (
                  <div className="bg-indigo-50/50 border-b border-line px-4 py-2 flex items-center gap-2">
                    <MapPin className="h-3 w-3 text-indigo-500" />
                    <span className="text-xs font-semibold text-indigo-900">{hubName}</span>
                  </div>
                )}

                {/* Agent Stock List */}
                <div className="p-4 flex-1">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1">
                    <PackageOpen className="h-3 w-3" /> Currently Holding
                  </h4>
                  
                  {agentStock.length === 0 ? (
                    <p className="text-sm text-slate-500 italic">No stock currently assigned.</p>
                  ) : (
                    <ul className="space-y-2">
                      {agentStock.map(bal => (
                        <li key={bal.id} className="flex justify-between items-center text-sm">
                          <span className="font-medium text-slate-700">{productNameById.get(bal.product_id) ?? "Unknown Product"}</span>
                          <span className="font-bold text-brand bg-teal-50 px-2 py-0.5 rounded">{bal.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </AppShell>
  );
}