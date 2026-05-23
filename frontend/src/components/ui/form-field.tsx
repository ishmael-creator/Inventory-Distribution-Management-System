import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

type BaseProps = {
  label: string;
};

export function TextField({ label, ...props }: BaseProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        {...props}
        className="mt-2 h-10 w-full rounded-md border border-line px-3 outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
      />
    </label>
  );
}

export function TextAreaField({ label, ...props }: BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <textarea
        {...props}
        className="mt-2 min-h-24 w-full rounded-md border border-line px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
      />
    </label>
  );
}

export function SelectField({ label, children, ...props }: BaseProps & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <select
        {...props}
        className="mt-2 h-10 w-full rounded-md border border-line px-3 outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
      >
        {children}
      </select>
    </label>
  );
}

