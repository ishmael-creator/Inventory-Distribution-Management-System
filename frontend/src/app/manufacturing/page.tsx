"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Factory, Send } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ActionButton } from "@/components/ui/action-button";
import { SelectField, TextField } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api";
import type { ProductBatch, ProductPage } from "@/types/inventory";

function toDatetimeLocal(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function batchTone(status: ProductBatch["status"]) {
  if (status === "RECEIVED_AT_WAREHOUSE") return "success";
  if (status === "RELEASED_TO_WAREHOUSE") return "warning";
  return "neutral";
}

export default function ManufacturingPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    product_id: "",
    batch_number: "",
    quantity: "100",
    produced_at: toDatetimeLocal(new Date()),
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

  const productNameById = useMemo(
    () => new Map((products.data?.items ?? []).map((product) => [product.id, product.name])),
    [products.data?.items],
  );

  const createBatch = useMutation({
    mutationFn: async () =>
      api.post<ProductBatch>("/manufacturing/batches", {
        product_id: form.product_id,
        batch_number: form.batch_number,
        quantity: Number(form.quantity),
        produced_at: new Date(form.produced_at).toISOString(),
      }),
    onSuccess: async () => {
      setForm({ product_id: "", batch_number: "", quantity: "100", produced_at: toDatetimeLocal(new Date()) });
      setError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["batches"] }),
        queryClient.invalidateQueries({ queryKey: ["balances"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
      ]);
    },
    onError: () => setError("Batch could not be created. Check the product, batch number, and quantity."),
  });

  const releaseBatch = useMutation({
    mutationFn: async (batchId: string) => api.post<ProductBatch>(`/manufacturing/batches/${batchId}/release`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["batches"] });
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createBatch.mutate();
  }

  return (
    <AppShell title="Manufacturing" description="Create production batches and release them for warehouse receipt.">
      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <form onSubmit={onSubmit} className="rounded-md border border-line bg-white p-4">
          <div className="mb-4 flex items-center gap-2">
            <Factory className="h-5 w-5 text-brand" />
            <h2 className="text-sm font-semibold text-ink">Create Production Batch</h2>
          </div>
          <div className="space-y-4">
            <SelectField
              label="Product"
              value={form.product_id}
              onChange={(event) => setForm({ ...form, product_id: event.target.value })}
              required
            >
              <option value="">Select product</option>
              {(products.data?.items ?? []).map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({product.sku})
                </option>
              ))}
            </SelectField>
            <TextField
              label="Batch Number"
              value={form.batch_number}
              onChange={(event) => setForm({ ...form, batch_number: event.target.value })}
              required
            />
            <TextField
              label="Quantity"
              min={1}
              type="number"
              value={form.quantity}
              onChange={(event) => setForm({ ...form, quantity: event.target.value })}
              required
            />
            <TextField
              label="Produced At"
              type="datetime-local"
              value={form.produced_at}
              onChange={(event) => setForm({ ...form, produced_at: event.target.value })}
              required
            />
            {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <ActionButton disabled={createBatch.isPending} type="submit">
              <Factory className="h-4 w-4" />
              {createBatch.isPending ? "Creating" : "Create Batch"}
            </ActionButton>
          </div>
        </form>

        <section className="rounded-md border border-line bg-white">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Production Batches</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-panel text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Batch</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Quantity</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Produced</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(batches.data ?? []).map((batch) => (
                  <tr key={batch.id}>
                    <td className="px-4 py-3 font-medium text-ink">{batch.batch_number}</td>
                    <td className="px-4 py-3 text-slate-600">{productNameById.get(batch.product_id) ?? batch.product_id}</td>
                    <td className="px-4 py-3 text-slate-600">{batch.quantity}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={batchTone(batch.status)}>{batch.status.replaceAll("_", " ")}</StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{new Date(batch.produced_at).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      {batch.status === "DRAFT" ? (
                        <ActionButton
                          disabled={releaseBatch.isPending}
                          onClick={() => releaseBatch.mutate(batch.id)}
                          type="button"
                          variant="secondary"
                        >
                          <Send className="h-4 w-4" />
                          Release
                        </ActionButton>
                      ) : (
                        <span className="text-slate-400">No action</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!batches.data?.length && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      No production batches found.
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

