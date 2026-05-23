import clsx from "clsx";
import type { ReactNode } from "react";

const toneMap = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
  neutral: "bg-slate-50 text-slate-700 ring-slate-200",
};

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: keyof typeof toneMap;
}) {
  return (
    <span className={clsx("inline-flex rounded px-2 py-1 text-xs font-medium ring-1", toneMap[tone])}>
      {children}
    </span>
  );
}
