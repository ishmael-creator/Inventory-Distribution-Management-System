import type { ButtonHTMLAttributes } from "react";
import clsx from "clsx";
import { useAuthStore } from "@/stores/auth-store";

export function ActionButton({
  children,
  variant = "primary",
  requireOverride = false, // Defaults to false
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary"; requireOverride?: boolean }) {
  
  const userRole = useAuthStore((state) => state.userRole);
  const isOverrideEnabled = useAuthStore((state) => state.isOverrideEnabled);

  // Lock the button if it's an operational button, the user is a Super Admin, and the toggle is off.
  const isLockedForAdmin = requireOverride && userRole === "SUPER_ADMIN" && !isOverrideEnabled;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (requireOverride && userRole === "SUPER_ADMIN") {
      if (!isOverrideEnabled) {
        e.preventDefault();
        return; // Prevent click entirely
      }
      if (!window.confirm("Warning: You are overriding an operational flow. Proceed?")) {
        e.preventDefault();
        return;
      }
    }
    if (onClick) onClick(e);
  };

  return (
    <button
      {...props}
      onClick={handleClick}
      disabled={props.disabled || isLockedForAdmin}
      className={clsx(
        "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-all disabled:cursor-not-allowed",
        isLockedForAdmin && "opacity-40 grayscale",
        !isLockedForAdmin && props.disabled && "opacity-60",
        !isLockedForAdmin && variant === "primary" ? "bg-brand text-white hover:bg-teal-800" : "",
        !isLockedForAdmin && variant === "secondary" ? "border border-line bg-white text-slate-700 hover:bg-slate-50" : ""
      )}
    >
      {children}
    </button>
  );
}