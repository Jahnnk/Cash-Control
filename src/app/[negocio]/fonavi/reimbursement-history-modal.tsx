"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Trash2, AlertTriangle } from "lucide-react";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import {
  getReimbursementsForReceivable,
  deleteReimbursementAllocation,
  type ReimbursementHistoryItem,
  type ReceivableRow,
} from "@/app/actions/fonavi-receivables";

const CONFIRM_WORD = "ELIMINAR";

export function ReimbursementHistoryModal({
  receivable,
  onClose,
  onChanged,
}: {
  receivable: ReceivableRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<ReimbursementHistoryItem[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getReimbursementsForReceivable(receivable.id).then(setItems);
  }, [receivable.id]);

  async function handleDelete() {
    if (!deletingId) return;
    if (confirmText !== CONFIRM_WORD) return;
    setWorking(true);
    setError(null);
    const result = await deleteReimbursementAllocation(deletingId);
    setWorking(false);
    if (!result.success) { setError(result.error); return; }
    setDeletingId(null);
    setConfirmText("");
    // Refrescar lista local + avisar al padre
    const refreshed = await getReimbursementsForReceivable(receivable.id);
    setItems(refreshed);
    onChanged();
  }

  const totalCollected = items?.reduce((s, i) => s + i.amount, 0) ?? 0;
  const target = items?.find((i) => i.allocation_id === deletingId) ?? null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            Reembolsos de {receivable.category} · {receivable.concept} del {formatDateShort(receivable.expense_date)}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {items === null ? (
            <div className="text-center text-sm text-gray-500 py-6"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Cargando...</div>
          ) : items.length === 0 ? (
            <div className="text-center text-sm text-gray-500 py-6">Sin reembolsos registrados.</div>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 text-left">
                    <th className="px-4 py-2.5 font-medium">Fecha</th>
                    <th className="px-4 py-2.5 font-medium text-right">Monto a esta cuenta</th>
                    <th className="px-4 py-2.5 font-medium">Nota / origen</th>
                    <th className="px-4 py-2.5 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((it) => (
                    <tr key={it.allocation_id}>
                      <td className="px-4 py-2.5">{formatDateShort(it.date)}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-green-700">{formatCurrency(it.amount)}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">
                        {it.note ?? "—"}
                        {it.is_split && (
                          <span className="ml-1 text-amber-600" title="Este reembolso cubre varias cuentas">
                            (compartido)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => { setDeletingId(it.allocation_id); setConfirmText(""); setError(null); }}
                          className="text-xs text-red-600 hover:underline inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" /> Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold text-sm">
                    <td className="px-4 py-2.5">Total reembolsado</td>
                    <td className="px-4 py-2.5 text-right text-green-700">{formatCurrency(totalCollected)}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500" colSpan={2}>
                      Por cobrar: <span className={receivable.amount_pending > 0 ? "text-violet-700 font-semibold" : "text-gray-400"}>
                        {formatCurrency(receivable.amount_pending)}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Confirmación de eliminación inline */}
          {deletingId && target && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <div className="font-semibold text-red-700 mb-1">¿Eliminar este reembolso?</div>
                  <div className="text-gray-700">
                    Se anulará <strong>{formatCurrency(target.amount)}</strong> del {formatDateShort(target.date)}.
                    {target.is_split && (
                      <span className="block mt-1 text-amber-700">
                        ⚠️ Este reembolso cubría varias cuentas. Se reducirá el monto del ingreso bancario, sin afectar las otras cuentas.
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">El saldo del banco se recalculará y la cuenta volverá al estado correspondiente.</div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Escribe <span className="font-mono font-bold">{CONFIRM_WORD}</span> para confirmar
                </label>
                <input type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                  placeholder={CONFIRM_WORD} autoFocus />
              </div>
              {error && <div className="text-xs text-red-600 bg-white border border-red-100 rounded-lg px-3 py-2">{error}</div>}
              <div className="flex justify-end gap-2">
                <button onClick={() => { setDeletingId(null); setConfirmText(""); setError(null); }}
                  disabled={working} className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50">
                  Cancelar
                </button>
                <button onClick={handleDelete} disabled={working || confirmText !== CONFIRM_WORD}
                  className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 flex items-center gap-1.5">
                  {working && <Loader2 className="w-3 h-3 animate-spin" />}
                  Sí, eliminar
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
