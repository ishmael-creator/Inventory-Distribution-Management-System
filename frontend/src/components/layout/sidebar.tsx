"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, ClipboardCheck, Factory, Gauge, History, Package, Warehouse, Store, UserSquare2, Users, FileBarChart, X, UserCheck, Contact } from "lucide-react";
import clsx from "clsx";
import { useAuthStore } from "@/stores/auth-store";

// The master navigation list that was missing!
const items = [
  { label: "Role Dashboard", href: "/", icon: Gauge, roles: ["SUPER_ADMIN", "MANAGER", "MANUFACTURER", "WAREHOUSE_OFFICER", "DISTRIBUTION_TEAM", "HUB_OFFICER", "AGENT"] },
  { label: "Official Reports", href: "/reports", icon: FileBarChart, roles: ["SUPER_ADMIN", "MANAGER", "MANUFACTURER", "WAREHOUSE_OFFICER", "DISTRIBUTION_TEAM", "HUB_OFFICER"] },
  { label: "Products", href: "/products", icon: Package, roles: ["SUPER_ADMIN", "MANUFACTURER", "WAREHOUSE_OFFICER", "HUB_OFFICER", "MANAGER", "DISTRIBUTION_TEAM", "AGENT"] },
  { label: "Manufacturing", href: "/manufacturing", icon: Factory, roles: ["SUPER_ADMIN", "MANUFACTURER", "MANAGER"] },
  { label: "Warehouse", href: "/warehouse", icon: Warehouse, roles: ["SUPER_ADMIN", "WAREHOUSE_OFFICER", "MANAGER"] },
  { label: "Distribution", href: "/distribution", icon: ClipboardCheck, roles: ["SUPER_ADMIN", "DISTRIBUTION_TEAM", "MANAGER"] },
  { label: "Hubs", href: "/hubs", icon: Store, roles: ["SUPER_ADMIN", "HUB_OFFICER", "MANAGER"] },
  { label: "Field Agents", href: "/field-agents", icon: UserCheck, roles: ["SUPER_ADMIN", "DISTRIBUTION_TEAM", "MANAGER"] },

// THE FIX: Distribution Team gets access to My Agent App, Hub Officer removed
  { label: "My Agent App", href: "/agent", icon: UserSquare2, roles: ["SUPER_ADMIN", "AGENT", "DISTRIBUTION_TEAM"] },
  
  // THE FIX: New dedicated tab for Hub Officers!
  { label: "Hub Agents", href: "/hub-agents", icon: Contact, roles: ["SUPER_ADMIN", "HUB_OFFICER", "MANAGER", "DISTRIBUTION_TEAM"] },

  { label: "System Logs", href: "/inventory", icon: History, roles: ["SUPER_ADMIN", "MANAGER", "DISTRIBUTION_TEAM", "MANUFACTURER", "WAREHOUSE_OFFICER", "HUB_OFFICER"] },
  { label: "User Management", href: "/users", icon: Users, roles: ["SUPER_ADMIN"] },
];

export function Sidebar({ isOpen = false, onClose = () => {} }: { isOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const userRole = useAuthStore((state) => state.userRole);
  const visibleItems = items.filter(item => item.roles.includes(userRole || ""));

  return (
    <>
      {/* Mobile Overlay Background */}
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} />
      )}

      {/* Sidebar Container */}
      <aside className={clsx(
        "fixed inset-y-0 left-0 z-50 w-72 transform bg-white transition-transform duration-300 lg:static lg:translate-x-0 border-r border-line",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Header - Locked to exactly h-16 for perfect horizontal alignment */}
        <div className="flex h-16 items-center justify-between border-b border-line px-6">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-brand">UPE-IMS</div>
            <div className="text-base font-semibold text-ink">Inventory Control</div>
          </div>
          <button onClick={onClose} className="lg:hidden p-1 text-slate-500 hover:bg-slate-100 rounded-md">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="space-y-1 px-3 py-4 overflow-y-auto h-[calc(100vh-4rem)]">
          {visibleItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => onClose()} // Close mobile menu on click
              className={clsx(
                "flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium transition-colors",
                pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
                  ? "bg-brand text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-ink",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
    </>
  );
}