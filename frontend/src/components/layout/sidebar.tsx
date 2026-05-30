"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, ClipboardCheck, Factory, Gauge, History, Package, Warehouse, Store, UserSquare2, Users, FileBarChart } from "lucide-react";
import clsx from "clsx";
import { useAuthStore } from "@/stores/auth-store";

// Map pages to the exact roles that are allowed to see them
const items = [
  // Dashboard (Role-specific charts)
  { label: "Role Dashboard", href: "/", icon: Gauge, roles: ["SUPER_ADMIN", "MANAGER", "MANUFACTURER", "WAREHOUSE_OFFICER", "DISTRIBUTION_TEAM", "HUB_OFFICER", "AGENT"] },
  
  // Dedicated Official Reports Tab
  { label: "Official Reports", href: "/reports", icon: FileBarChart, roles: ["SUPER_ADMIN", "MANAGER", "MANUFACTURER", "WAREHOUSE_OFFICER", "DISTRIBUTION_TEAM", "HUB_OFFICER"] },

  // Operational Pages
  { label: "Products", href: "/products", icon: Package, roles: ["SUPER_ADMIN", "MANUFACTURER", "WAREHOUSE_OFFICER", "HUB_OFFICER", "MANAGER", "DISTRIBUTION_TEAM", "AGENT"] },
  { label: "Manufacturing", href: "/manufacturing", icon: Factory, roles: ["SUPER_ADMIN", "MANUFACTURER", "MANAGER"] },
  { label: "Warehouse", href: "/warehouse", icon: Warehouse, roles: ["SUPER_ADMIN", "WAREHOUSE_OFFICER", "MANAGER"] },
  { label: "Distribution", href: "/distribution", icon: ClipboardCheck, roles: ["SUPER_ADMIN", "DISTRIBUTION_TEAM", "MANAGER"] },
  { label: "Hubs", href: "/hubs", icon: Store, roles: ["SUPER_ADMIN", "HUB_OFFICER", "MANAGER"] },
  { label: "Agent Dashboard", href: "/agent", icon: UserSquare2, roles: ["SUPER_ADMIN", "AGENT", "MANAGER"] },
  
  // Logs Page
  { label: "System Logs", href: "/inventory", icon: History, roles: ["SUPER_ADMIN", "MANAGER", "DISTRIBUTION_TEAM", "MANUFACTURER", "WAREHOUSE_OFFICER", "HUB_OFFICER"] },
  
  // Admin only
  { label: "User Management", href: "/users", icon: Users, roles: ["SUPER_ADMIN"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const userRole = useAuthStore((state) => state.userRole);

  const visibleItems = items.filter(item => item.roles.includes(userRole || ""));

  return (
    <aside className="hidden w-72 shrink-0 border-r border-line bg-white lg:block">
      <div className="border-b border-line px-6 py-5">
        <div className="text-sm font-semibold uppercase tracking-wide text-brand">UPE-IMS</div>
        <div className="mt-1 text-lg font-semibold text-ink">Inventory Control</div>
      </div>
      <nav className="space-y-1 px-3 py-4">
        {visibleItems.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={clsx(
              "flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium",
              pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
                ? "bg-brand text-white"
                : "text-slate-700 hover:bg-slate-100",
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}