"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  ClipboardCheck,
  Factory,
  Gauge,
  History,
  Package,
  Warehouse,
} from "lucide-react";
import clsx from "clsx";

const items = [
  { label: "Dashboard", href: "/", icon: Gauge },
  { label: "Products", href: "/products", icon: Package },
  { label: "Manufacturing", href: "/manufacturing", icon: Factory },
  { label: "Warehouse", href: "/warehouse", icon: Warehouse },
  { label: "Distribution", href: "/distribution", icon: ClipboardCheck },
  { label: "Inventory Ledger", href: "/inventory", icon: History },
  { label: "Reports", href: "/inventory#balances", icon: Boxes },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-72 shrink-0 border-r border-line bg-white lg:block">
      <div className="border-b border-line px-6 py-5">
        <div className="text-sm font-semibold uppercase tracking-wide text-brand">Enterprise IMS</div>
        <div className="mt-1 text-lg font-semibold text-ink">Inventory Control</div>
      </div>
      <nav className="space-y-1 px-3 py-4">
        {items.map((item) => (
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
