"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { updateIncomeItem, updateExpense } from "@/app/actions/record-edits";
import { formatDateShort } from "@/lib/utils";

type ClientOption = { id: string; name: string };

export type EditTarget =
  | {
      type: "income";
      id: string;
      date: string;
      amount: number;
      note: string;
      clientId: string | null;
      clientName: string | null;
    }
  | {
      type: "expense";
      id: string;
      date: string;
      amount: number;
      category: string;
      concept: string;
      paymentMethod: string;
      notes: string | null;
    };

export function EditRecordModal({
  target,
  categories,
  clients,
  onClose,
  onSaved,
}: {
  target: EditTarget;
  categories: string[];
  clients: ClientOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isIncome = target.type === "income";

  // Local state
  const [amount, setAmount] = useState(String(target.amount));
  const [note, setNote] = useState(isIncome ? target.note : "");
  const [clientId, setClientId] = useState<string>(isIncome ? target.clientId ?? "" : "");

  const [category, setCategory] = useState(!isIncome ? target.category : "");
  const [concept, setConcept] = useState(!isIncome ? target.concept : "");
  const [paymentMethod, setPaymentMethod] = useState(!isIncome ? target.paymentMethod : "transferencia");
  const [notes, setNotes] = useState(!isIncome && target.notes ? target.notes : "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoryNotListed = !isIncome && category && !categories.includes(category);

  async function handleSave() {
    setError(null);
    const amountNum = parseFloat(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError("El monto debe ser mayor a 0");
      return;
    }

    setSaving(true);
    const result = isIncome
      ? await updateIncomeItem(target.id, {
          amount: amountNum,
          note: note.trim(),
          clientId: clientId || null,
        })
      : await updateExpense(target.id, {
          amount: amountNum,
          category: category.trim(),
          concept: concept.trim(),
          paymentMethod,
          notes: notes.trim() || null,
        });
    setSaving(false);

    if (!result.success) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            Editar {isIncome ? "ingreso" : "gasto"} del {formatDateShort(target.date)}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Banner informativo */}
        <div className="mx-6 mt-4 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-900">
          💡 Los cambios se registran automáticamente en el historial y recalculan el saldo del banco.
        </div>

        {/* Form */}
        <div className="p-6 space-y-4">
          {/* Monto */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Monto (S/)</label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-light/30"
              autoFocus
            />
          </div>

          {isIncome ? (
            <>
              {/* Cliente (opcional) */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Cliente (opcional)</label>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="">— Sin cliente (ingreso del Byte) —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                  {target.type === "income" && target.clientId && !clients.find((c) => c.id === target.clientId) && (
                    <option value={target.clientId}>
                      [{target.clientName ?? "Cliente"} — inactivo]
                    </option>
                  )}
                </select>
              </div>

              {/* Nota */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nota</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Opcional"
                />
              </div>
            </>
          ) : (
            <>
              {/* Categoría */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Categoría</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  {categoryNotListed && (
                    <option value={category}>{category} (no listada)</option>
                  )}
                </select>
                {categoryNotListed && (
                  <div className="text-[11px] text-amber-600 mt-1">
                    Esta categoría ya no está activa. Puedes mantenerla o cambiarla.
                  </div>
                )}
              </div>

              {/* Concepto */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Concepto</label>
                <input
                  type="text"
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              {/* Método de pago */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Método de pago</label>
                <div className="flex gap-2">
                  {(["transferencia", "efectivo", "yape"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentMethod(m)}
                      className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                        paymentMethod === m
                          ? "bg-primary-light text-white border-primary-light"
                          : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
                      }`}
                    >
                      {m === "transferencia" ? "Transferencia" : m === "efectivo" ? "Efectivo" : "Yape"}
                    </button>
                  ))}
                </div>
                {!isIncome && target.paymentMethod !== paymentMethod && (
                  <div className="text-[11px] text-amber-600 mt-1">
                    Cambiar método de pago modifica el saldo del banco
                    {target.paymentMethod === "efectivo" || paymentMethod === "efectivo"
                      ? " (efectivo no cuenta para el saldo BCP)."
                      : "."}
                  </div>
                )}
              </div>

              {/* Notas */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notas (opcional)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </>
          )}

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-light flex items-center gap-2 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}
