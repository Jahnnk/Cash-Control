"use client";

import { useState } from "react";
import { X, Loader2, AlertTriangle } from "lucide-react";
import { deleteIncomeItem, deleteExpense } from "@/app/actions/record-edits";
import { formatCurrency, formatDateShort } from "@/lib/utils";

export type DeleteTarget =
  | {
      type: "income";
      id: string;
      date: string;
      amount: number;
      note: string;
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

const CONFIRM_WORD = "ELIMINAR";

export function DeleteRecordModal({
  target,
  onClose,
  onDeleted,
}: {
  target: DeleteTarget;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isIncome = target.type === "income";
  const canConfirm = confirmText === CONFIRM_WORD && !deleting;

  async function handleDelete() {
    if (!canConfirm) return;
    setError(null);
    setDeleting(true);
    const result = isIncome ? await deleteIncomeItem(target.id) : await deleteExpense(target.id);
    setDeleting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onDeleted();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-red-600 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Eliminar {isIncome ? "ingreso" : "gasto"} permanentemente
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Detalles del registro */}
        <div className="p-6 space-y-3">
          <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
            <DetailRow label="Fecha" value={formatDateShort(target.date)} />
            <DetailRow label="Monto" value={formatCurrency(target.amount)} valueClass="text-red-600 font-semibold" />
            {isIncome ? (
              <>
                <DetailRow label="Cliente" value={target.clientName ?? "— Sin cliente (Byte) —"} />
                {target.note && <DetailRow label="Nota" value={target.note} />}
              </>
            ) : (
              <>
                <DetailRow label="Categoría" value={target.category} />
                <DetailRow label="Concepto" value={target.concept} />
                <DetailRow label="Método" value={target.paymentMethod} />
                {target.notes && <DetailRow label="Notas" value={target.notes} />}
              </>
            )}
          </div>

          <div className="text-xs text-gray-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Esta acción <strong>NO se puede deshacer</strong> y modificará el saldo del banco. Quedará registrada en el historial.
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Escribe <span className="font-mono font-bold">{CONFIRM_WORD}</span> para confirmar
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-red-500/30"
              placeholder={CONFIRM_WORD}
              autoFocus
            />
          </div>

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
            disabled={deleting}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg disabled:opacity-50 font-medium"
          >
            Cancelar
          </button>
          <button
            onClick={handleDelete}
            disabled={!canConfirm}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
            Sí, eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <span className={`text-sm text-right ${valueClass ?? "text-gray-900"}`}>{value}</span>
    </div>
  );
}
