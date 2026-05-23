"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Warehouse } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ActionButton } from "@/components/ui/action-button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api";
import type { ProductBatch, ProductPage, WarehouseRecord } from "@/types/inventory";

export default function WarehousePage() {
  const queryClient = useQueryClient();
  const [warehouseForm, setWarehouseForm] = useState({ name: "", location: "" });
  const [receiptForm, setReceiptForm] = useState({
    batch_id: "",
    warehouse_id: "",
    quantity_received: "",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);

  const products = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await api.get<ProductPage>("/products")).data,
  });

  const batches = useQuery({
    queryKey: ["batches"],
    queryFn: async () => (await api.get<ProductBatch[]>("/manufacturing/batches")).data,
  });

  const warehouses = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => (await api.get<WarehouseRecord[]>("/warehouses")).data,
  });

  const productNameById = useMemo(
    () => new Map((products.data?.items ?? []).map((product) => [product.id, product.name])),
    [products.data?.items],
  );

  const releasedBatches = (batches.data ?? []).filter((batch) => batch.status === "RELEASED_TO_WAREHOUSE");

  const createWarehouse = useMutation({
    mutationFn: async () =>
      api.post<WarehouseRecord>("/warehouses", {
        name: warehouseForm.name,
        location: warehouseForm.location || null,
      }),
    onSuccess: async () => {
      setWarehouseForm({ name: "", location: "" });
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["warehouses"] });
    },
    onError: () => setError("Warehouse could not be saved."),
  });

  const receiveBatch = useMutation({
    mutationFn: async () =>
      api.post<ProductBatch>("/warehouses/receipts", {
        batch_id: receiptForm.batch_id,
        warehouse_id: receiptForm.warehouse_id,
        quantity_received: Number(receiptForm.quantity_received),
        notes: receiptForm.notes || null,
      }),
    onSuccess: async () => {
      setReceiptForm({ batch_id: "", warehouse_id: "", quantity_received: "", notes: "" });
      setError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["batches"] }),
        queryClient.invalidateQueries({ queryKey: ["balances"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
      ]);
    },
    onError: () => setError("Receipt failed. In Phase 1, the received quantity must match the released batch quantity."),
  });

  function submitWarehouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createWarehouse.mutate();
  }

  function submitReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    receiveBatch.mutate();
  }

  return (
    <AppShell title="Warehouse" description="Create warehouses and receipt released manufacturing batches.">
      <section className="grid gap-6 xl:grid-cols-[380px_420px_1fr]">
        <form onSubmit={submitWarehouse} className="rounded-md border border-line bg-white p-4">
          <div className="mb-4 flex items-center gap-2">
            <Warehouse className="h-5 w-5 text-brand" />
            <h2 className="text-sm font-semibold text-ink">Create Warehouse</h2>
          </div>
          <div className="space-y-4">
            <TextField
              label="Warehouse Name"
              value={warehouseForm.name}
              onChange={(event) => setWarehouseForm({ ...warehouseForm, name: event.target.value })}
              required
            />
            <TextField
              label="Location"
              value={warehouseForm.location}
              onChange={(event) => setWarehouseForm({ ...warehouseForm, location: event.target.value })}
            />
            <ActionButton disabled={createWarehouse.isPending} type="submit">
              <Warehouse className="h-4 w-4" />
              {createWarehouse.isPending ? "Saving" : "Save Warehouse"}
            </ActionButton>
          </div>
        </form>

        <form onSubmit={submitReceipt} className="rounded-md border border-line bg-white p-4">
          <div className="mb-4 flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-brand" />
            <h2 className="text-sm font-semibold text-ink">Receipt Batch</h2>
          </div>
          <div className="space-y-4">
            <SelectField
              label="Released Batch"
              value={receiptForm.batch_id}
              onChange={(event) => {
                const batch = releasedBatches.find((item) => item.id === event.target.value);
                setReceiptForm({
                  ...receiptForm,
                  batch_id: event.target.value,
                  quantity_received: batch ? String(batch.quantity) : "",
                });
              }}
              required
            >
              <option value="">Select batch</option>
              {releasedBatches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.batch_number} - {productNameById.get(batch.product_id) ?? "Product"} ({batch.quantity})
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Warehouse"
              value={receiptForm.warehouse_id}
              onChange={(event) => setReceiptForm({ ...receiptForm, warehouse_id: event.target.value })}
              required
            >
              <option value="">Select warehouse</option>
              {(warehouses.data ?? []).map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </SelectField>
            <TextField
              label="Quantity Received"
              min={1}
              type="number"
              value={receiptForm.quantity_received}
              onChange={(event) => setReceiptForm({ ...receiptForm, quantity_received: event.target.value })}
              required
            />
            <TextAreaField
              label="Notes"
              value={receiptForm.notes}
              onChange={(event) => setReceiptForm({ ...receiptForm, notes: event.target.value })}
            />
            {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <ActionButton disabled={receiveBatch.isPending} type="submit">
              <ClipboardCheck className="h-4 w-4" />
              {receiveBatch.isPending ? "Receipting" : "Confirm Receipt"}
            </ActionButton>
          </div>
        </form>

        <section className="rounded-md border border-line bg-white">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Warehouses</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-panel text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(warehouses.data ?? []).map((warehouse) => (
                  <tr key={warehouse.id}>
                    <td className="px-4 py-3 font-medium text-ink">{warehouse.name}</td>
                    <td className="px-4 py-3 text-slate-600">{warehouse.location ?? "-"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={warehouse.is_active ? "success" : "warning"}>
                        {warehouse.is_active ? "Active" : "Inactive"}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
                {!warehouses.data?.length && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                      No warehouses found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </AppShell>
  );
}

