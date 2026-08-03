"use client";

import { ReactNode, useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import { ActionButton } from "./action-button";
import { TextField } from "./form-field";

export function Modal({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: ReactNode }) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm sm:p-4 animate-in fade-in duration-200">
            {/* The Modal Container: acts as a bottom sheet on mobile (mt-auto, rounded-t-2xl) and a centered box on desktop */}
            <div className="w-full max-w-md bg-white sm:rounded-lg rounded-t-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh] mt-auto sm:mt-0 animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-line flex justify-between items-center bg-slate-50">
                    <h3 className="font-semibold text-lg text-ink">{title}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none p-1">&times;</button>
                </div>
                <div className="p-6 overflow-y-auto">
                    {children}
                </div>
            </div>
        </div>
    );
}

export function ConfirmDialog({
  isOpen, onClose, title, description, confirmLabel, variant = "default", isPending, onConfirm, entityName
}: {
  isOpen: boolean; onClose: () => void; title: string; description: string; confirmLabel: string;
  variant?: "default" | "destructive"; isPending: boolean; onConfirm: () => void; entityName?: string;
}) {
  const [confirmText, setConfirmText] = useState("");
  const isDestructive = variant === "destructive";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4">
        {isDestructive && (
          <div className="flex items-start gap-3 rounded-md bg-red-50 p-3 text-red-800">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <p className="text-sm">{description}</p>
          </div>
        )}
        {!isDestructive && <p className="text-sm text-slate-600">{description}</p>}

        {/* Type to confirm logic for destructive actions */}
        {isDestructive && entityName && (
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Type <strong className="select-all">{entityName}</strong> to confirm
            </label>
            <TextField
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={entityName}
            />
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-line mt-4">
          <ActionButton variant="secondary" onClick={onClose} disabled={isPending}>Cancel</ActionButton>
          <ActionButton
            className={isDestructive ? "bg-red-600 hover:bg-red-700 border-red-600 text-white" : ""}
            onClick={() => {
                onConfirm();
                setConfirmText("");
            }}
            disabled={isPending || (isDestructive && !!entityName && confirmText !== entityName)}
          >
            {isPending ? "Processing..." : confirmLabel}
          </ActionButton>
        </div>
      </div>
    </Modal>
  );
}

export function PromptDialog({
  isOpen, onClose, title, description, inputType = "text", confirmLabel, isPending, onConfirm, min, max
}: {
  isOpen: boolean; onClose: () => void; title: string; description: string; inputType?: "text" | "number";
  confirmLabel: string; isPending: boolean; onConfirm: (val: any) => void; min?: number; max?: number;
}) {
  const [inputValue, setInputValue] = useState("");

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{description}</p>
        <div className="pt-2">
            <TextField
            label="Input Required"
            type={inputType}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            min={min}
            max={max}
            required
            />
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-line mt-4">
          <ActionButton variant="secondary" onClick={() => { onClose(); setInputValue(""); }} disabled={isPending}>Cancel</ActionButton>
          <ActionButton
            onClick={() => {
              onConfirm(inputType === "number" ? Number(inputValue) : inputValue);
              setInputValue("");
            }}
            disabled={isPending || !inputValue.trim()}
          >
            {isPending ? "Processing..." : confirmLabel}
          </ActionButton>
        </div>
      </div>
    </Modal>
  );
}