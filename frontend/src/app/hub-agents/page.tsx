"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Contact, PackageOpen, MapPin, Search, Filter, X } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type { ProductPage, AgentRecord, InventoryBalance, HubRecord } from "@/types/inventory";

export default function HubAgentsPage() {
  const userRole = useAuthStore((state) => state.userRole);

  // Filter & UI States
  const [searchQuery, setSearchQuery] = useState("");
  const [filterHubId, setFilterHubId] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<AgentRecord | null>(null);

  // Queries
  const agents = useQuery({ queryKey: ["agents"], queryFn: async () => (await api.get<AgentRecord[]>("/distribution/agents")).data });
  const products = useQuery({ queryKey: ["products"], queryFn: async () => (await api.get<ProductPage>("/products")).data });
  const balances = useQuery({ queryKey: ["agent-balances"], queryFn: async () => (await api.get<InventoryBalance[]>("/inventory/balances?location_type=AGENT")).data });
  const hubs = useQuery({ queryKey: ["hubs"], queryFn: async () => (await api.get<HubRecord[]>("/distribution/hubs")).data });

  const activeProducts = products.data?.items ?? [];
  const productNameById = useMemo(() => new Map(activeProducts.map((p) => [p.id, p.name])), [activeProducts]);
  const hubNameById = useMemo(() => new Map((hubs.data ?? []).map((h) => [h.id, h.name])), [hubs.data]);

  // Dynamic filtering logic
  const activeAgents = useMemo(() => {
    let list = agents.data ?? [];

    // THE GHOSTING RULE: If you are a Hub Officer, you only see agents assigned to your Hub
    // AND who are currently holding stock. Once they hit 0 stock, they ghost!
    if (userRole === "HUB_OFFICER") {
      // Find the Hub Officer's actual assigned Hub ID from their profile (or default to the filter they clicked)
      const myHub = filterHubId || list[0]?.hub_id;

      list = list.filter(agent => {
        const isAtMyHub = agent.hub_id === myHub;

        // Check if they have ANY positive balance in their backpack
        const hasStock = (balances.data ?? []).some(b => b.location_id === agent.id && b.quantity > 0);

        return isAtMyHub && hasStock;
      });
    }

    if (searchQuery.trim()) {
      const lowerQ = searchQuery.toLowerCase();
      list = list.filter(a =>
        a.name.toLowerCase().includes(lowerQ) ||
        a.agent_code.toLowerCase().includes(lowerQ)
      );
    }

    // Allow Distribution team to filter manually
    if (filterHubId && userRole !== "HUB_OFFICER") {
      list = list.filter(a => a.hub_id === filterHubId);
    }

    return list;
  }, [agents.data, searchQuery, filterHubId, balances.data, userRole]);

  return (
    <AppShell title="Hub Agents Directory" description="Live overview of the field agents and their current holding stock.">

      {/* FILTER BAR */}
      <div className="mb-6 flex flex-wrap gap-4 items-end rounded-md border border-line bg-white p-4 shadow-sm">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
            <Search className="h-4 w-4 text-brand" /> Search Agents
          </label>
          <input
            type="text"
            placeholder="Search by name or agent code..."
            className="h-10 w-full rounded-md border border-line px-3 outline-none focus:border-brand transition-colors"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Only show Hub Filter to higher roles, Hub Officers are already isolated */}
        {userRole !== "HUB_OFFICER" && (
          <div className="w-full md:w-64">
             <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
               <Filter className="h-4 w-4 text-brand" /> Filter by Hub
             </label>
             <select
               className="h-10 w-full rounded-md border border-line px-3 outline-none focus:border-brand bg-white"
               value={filterHubId}
               onChange={(e) => setFilterHubId(e.target.value)}
             >
               <option value="">All Hubs</option>
               {(hubs.data ?? []).map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
             </select>
          </div>
        )}
      </div>

      {/* DYNAMIC AGENT LIST TABLE */}
      <div className="overflow-x-auto rounded-md border border-line bg-white shadow-sm mb-8">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-panel text-xs uppercase text-slate-500 border-b border-line">
            <tr>
              <th className="px-4 py-3">Agent Code</th>
              <th className="px-4 py-3">Agent Name</th>
              {/* THE FIX: Swapped Hub Location for Region */}
              {userRole !== "HUB_OFFICER" && <th className="px-4 py-3">Region</th>}

              {/* Dynamically render a column for EVERY product in the system */}
              {activeProducts.map(p => (
                <th key={p.id} className="px-4 py-3 text-right">{p.name}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {activeAgents.length === 0 ? (
              <tr>
                <td colSpan={3 + activeProducts.length} className="px-4 py-12 text-center text-slate-500">
                  No agents found. Try adjusting your search or filter settings.
                </td>
              </tr>
            ) : (
              activeAgents.map((agent) => {
                const hubName = hubNameById.get(agent.hub_id) ?? "Unknown Hub";
                return (
                  <tr
                    key={agent.id}
                    onClick={() => setSelectedAgent(agent)}
                    className="hover:bg-teal-50/50 cursor-pointer transition-colors group"
                  >
                    <td className="px-4 py-3 font-mono text-xs font-bold text-slate-500 group-hover:text-brand">{agent.agent_code}</td>
                    <td className="px-4 py-3 font-semibold text-ink">{agent.name}</td>

                    {/* THE FIX: Display the new Region data instead of the Hub Name */}
                    {userRole !== "HUB_OFFICER" && (
                      <td className="px-4 py-3">
                        <span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded text-xs font-semibold">
                          {agent.region || "N/A"}
                        </span>
                      </td>
                    )}
                    {/* Loop through products and grab this agent's specific balance for each */}
                    {activeProducts.map(product => {
                      const bal = (balances.data ?? []).find(b => b.location_id === agent.id && b.product_id === product.id);
                      const qty = bal ? bal.quantity : 0;
                      return (
                        <td key={product.id} className="px-4 py-3 text-right font-medium text-slate-700">
                          {qty > 0 ? (
                            <span className="bg-teal-50 text-brand px-2 py-0.5 rounded font-bold">{qty}</span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* SLIDE-OVER SIDEBAR DETAILS (POP-UP) */}
      {selectedAgent && (
        <>
          {/* Dark blurred background overlay */}
          <div
            className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-sm transition-opacity"
            onClick={() => setSelectedAgent(null)}
          />

          {/* The Sidebar Drawer */}
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-2xl transform transition-transform duration-300 flex flex-col border-l border-line">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-line bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="bg-brand/10 text-brand p-2 rounded-full">
                  <Contact className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-ink">{selectedAgent.name}</h2>
                  <p className="text-xs font-mono text-slate-500">{selectedAgent.agent_code}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedAgent(null)}
                className="p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600 rounded-md transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Sidebar Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">

              {/* Agent Information Block */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Assignment Details</h3>
                <div className="rounded-md border border-line p-3 bg-slate-50 flex items-center gap-3 mb-2">
                  <MapPin className="h-5 w-5 text-indigo-500" />
                  <div>
                    <p className="text-sm font-medium text-ink">Operating Region</p>
                    <p className="text-xs font-bold text-indigo-700">{selectedAgent.region || "N/A"}</p>
                  </div>
                </div>
                <div className="rounded-md border border-line p-3 bg-slate-50 flex items-center gap-3">
                  <Contact className="h-5 w-5 text-emerald-500" />
                  <div>
                    <p className="text-sm font-medium text-ink">Contact / Territory</p>
                    <p className="text-xs text-slate-600">{(selectedAgent as any).territory || selectedAgent.phone || "Not specified"}</p>
                  </div>
                </div>
              </div>

              {/* Detailed Stock Holding */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1">
                  <PackageOpen className="h-3 w-3" /> Current Inventory Holding
                </h3>
                <div className="rounded-md border border-line overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-line text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Product</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {activeProducts.map(product => {
                        const bal = (balances.data ?? []).find(b => b.location_id === selectedAgent.id && b.product_id === product.id);
                        const qty = bal ? bal.quantity : 0;

                        if (qty === 0) return null; // Only show products they actually have in the side-bar

                        return (
                          <tr key={product.id} className="bg-white">
                            <td className="px-3 py-2 font-medium text-slate-700">{product.name}</td>
                            <td className="px-3 py-2 text-right font-bold text-brand">{qty}</td>
                          </tr>
                        );
                      })}
                      {/* Empty state fallback */}
                      {activeProducts.filter(p => {
                        const bal = (balances.data ?? []).find(b => b.location_id === selectedAgent.id && b.product_id === p.id);
                        return bal && bal.quantity > 0;
                      }).length === 0 && (
                        <tr>
                          <td colSpan={2} className="px-3 py-4 text-center text-slate-500 italic text-xs">
                            Agent currently holds no stock.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Helpful redirect */}
              <div className="rounded-md border border-brand bg-teal-50 p-4 mt-6">
                <p className="text-sm text-teal-800 font-medium mb-1">Need to record a sale or return?</p>
                <p className="text-xs text-teal-600">Head over to the <strong className="font-bold text-brand">Field Agents</strong> tab to process transactions for this agent.</p>
              </div>

            </div>
          </div>
        </>
      )}

    </AppShell>
  );
}
