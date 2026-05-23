import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  icon: Icon,
  detail,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  detail: string;
}) {
  return (
    <section className="rounded-md border border-line bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-slate-600">{label}</div>
        <Icon className="h-4 w-4 text-brand" />
      </div>
      <div className="mt-3 text-2xl font-semibold text-ink">{value}</div>
      <div className="mt-1 text-sm text-slate-500">{detail}</div>
    </section>
  );
}

