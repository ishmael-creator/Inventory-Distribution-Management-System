"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, ClipboardCheck, Factory, Gauge, History, Package, Warehouse, Store, UserSquare2, Users, FileBarChart, X, UserCheck, Contact } from "lucide-react";
import clsx from "clsx";
import { useAuthStore } from "@/stores/auth-store";

// The master navigation list
const items = [
  { label: "Role Dashboard", href: "/", icon: Gauge, roles: ["SUPER_ADMIN", "MANAGER", "REGIONAL_MANAGER", "MANUFACTURER", "WAREHOUSE_OFFICER", "DISTRIBUTION_TEAM", "HUB_OFFICER", "AGENT"] },
  { label: "Official Reports", href: "/reports", icon: FileBarChart, roles: ["SUPER_ADMIN", "MANAGER", "REGIONAL_MANAGER", "MANUFACTURER", "WAREHOUSE_OFFICER", "DISTRIBUTION_TEAM", "HUB_OFFICER"] },
  { label: "Products", href: "/products", icon: Package, roles: ["SUPER_ADMIN", "MANUFACTURER", "WAREHOUSE_OFFICER", "REGIONAL_MANAGER", "HUB_OFFICER", "MANAGER", "DISTRIBUTION_TEAM", "AGENT"] },
  { label: "Manufacturing", href: "/manufacturing", icon: Factory, roles: ["SUPER_ADMIN", "MANUFACTURER", "MANAGER"] },
  { label: "Warehouse", href: "/warehouse", icon: Warehouse, roles: ["SUPER_ADMIN", "WAREHOUSE_OFFICER", "MANAGER"] },
  { label: "Distribution", href: "/distribution", icon: ClipboardCheck, roles: ["SUPER_ADMIN", "DISTRIBUTION_TEAM", "MANAGER"] },
  { label: "Hubs", href: "/hubs", icon: Store, roles: ["SUPER_ADMIN", "HUB_OFFICER", "MANAGER", "REGIONAL_MANAGER"] },
  { label: "Field Agents", href: "/field-agents", icon: UserCheck, roles: ["SUPER_ADMIN", "DISTRIBUTION_TEAM", "MANAGER", "REGIONAL_MANAGER"] },
  { label: "My Agent App", href: "/agent", icon: UserSquare2, roles: ["SUPER_ADMIN", "AGENT", "DISTRIBUTION_TEAM"] },
  { label: "Hub Agents", href: "/hub-agents", icon: Contact, roles: ["SUPER_ADMIN", "HUB_OFFICER", "MANAGER", "DISTRIBUTION_TEAM", "REGIONAL_MANAGER"] },
  { label: "System Logs", href: "/inventory", icon: History, roles: ["SUPER_ADMIN", "MANAGER", "DISTRIBUTION_TEAM", "MANUFACTURER", "WAREHOUSE_OFFICER", "HUB_OFFICER", "REGIONAL_MANAGER"] },
  { label: "User Management", href: "/users", icon: Users, roles: ["SUPER_ADMIN"] },
];

export function Sidebar({ 
  isOpen = false, 
  isCollapsed = false, 
  onClose = () => {},
  onToggleCollapse = () => {} // <-- NEW ACTION
}: { 
  isOpen?: boolean; 
  isCollapsed?: boolean; 
  onClose?: () => void;
  onToggleCollapse?: () => void;
}) {
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
        "fixed inset-y-0 left-0 z-50 transform bg-white transition-all duration-300 lg:static lg:translate-x-0 border-r border-line flex flex-col",
        isOpen ? "translate-x-0" : "-translate-x-full",
        isCollapsed ? "lg:w-20 w-72" : "w-72"
      )}>
        
        {/* NEW CLICKABLE BRAND HEADER WITH SVG LOGO */}
        <div 
          onClick={onToggleCollapse}
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          className={clsx(
            "flex h-16 shrink-0 items-center border-b border-line overflow-hidden whitespace-nowrap cursor-pointer hover:bg-slate-50 transition-colors select-none",
            isCollapsed ? "justify-center px-0" : "justify-between px-6"
          )}
        >
          <div className="flex items-center gap-3">
            {/* Embedded SVG Logo (Isometric Cube + Energy Bolt) */}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="h-8 w-8 shrink-0">
              <path d="M50 10 L90 30 L90 70 L50 90 L10 70 L10 30 Z" fill="#0f766e" opacity="0.2"/>
              <path d="M50 10 L90 30 L50 50 L10 30 Z" fill="#0f766e" opacity="0.8"/>
              <path d="M10 30 L50 50 L50 90 L10 70 Z" fill="#0f766e"/>
              <path d="M50 50 L90 30 L90 70 L50 90 Z" fill="#0f766e" opacity="0.6"/>
              <path d="M50 25 L35 55 L50 55 L50 75 L65 45 L50 45 Z" fill="#ffffff"/>
            </svg>
            
            {!isCollapsed && (
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-brand">UPE-IMS</div>
                <div className="text-base font-semibold text-ink">Inventory Control</div>
              </div>
            )}
          </div>
          
          {/* Mobile close button prevents trapping users */}
          {!isCollapsed && (
            <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="lg:hidden p-1 text-slate-500 hover:bg-slate-100 rounded-md">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="space-y-1 px-3 py-4 overflow-y-auto overflow-x-hidden h-[calc(100vh-4rem)]">
          {visibleItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              title={isCollapsed ? item.label : undefined} // Tooltip on hover when collapsed
              onClick={() => onClose()}
              className={clsx(
                "flex h-10 items-center rounded-md text-sm font-medium transition-colors",
                isCollapsed ? "justify-center" : "gap-3 px-3 w-full text-left",
                pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
                  ? "bg-brand text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-ink",
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!isCollapsed && <span className="truncate">{item.label}</span>}
            </Link>
          ))}
        </nav>
      </aside>
    </>
  );
}