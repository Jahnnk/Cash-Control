"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { formatCurrency, formatDateShort, getToday } from "@/lib/utils";
import { registerFonaviReimbursement, type ReceivableRow } from "@/app/actions/fonavi-receivables";

export function ReimbursementModal({
  pendingReceivables,
  onClose,
  onSaved,
}: {
  pendingReceivables: ReceivableRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(getToday());
  const [totalAmount, setTotalAmount] = useState("");
  const [note, setNote] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({}); // receivableId → amount string
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalNum = parseFloat(totalAmount || "0");
  const allocSum = Object.values(allocations).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const remaining = totalNum - allocSum;

  function autoAssign() {
    // Asigna desde el más antiguo hasta agotar el total
    let left = totalNum;
    const next: Record<string, string> = {};
    const sorted = [...pendingReceivables].sort((a, b) => a.expense_date.localeCompare(b.expense_date));
    for (const r of sorted) {
      if (left <= 0) break;
      const use = Math.min(left, r.amount_pending);
      if (use > 0) {
        next[r.id] = use.toFixed(2);
        left = Math.round((left - use) * 100) / 100;
      }
    }
    setAllocations(next);
  }

  async function handleSave() {
    setError(null);
    if (!Number.isFinite(totalNum) || totalNum <= 0) { setError("Monto inválido"); return; }
    const allocList = Object.entries(allocations)
      .map(([receivableId, amt]) => ({ receivableId, amount: parseFloat(amt) }))
      .filter((a) => Number.isFinite(a.amount) && a.amount > 0);
    if (allocList.length === 0) { setError("Asigna el monto a al menos una cuenta"); return; }
    if (Math.round(allocSum * 100) !== Math.round(totalNum * 100)) {
      setError("La suma de las asignaciones debe coincidir con el monto total");
      return;
    }

    setSaving(true);
    const result = await registerFonaviReimbursement({
      date,
      totalAmount: totalNum,
      note: note.trim() || null,
      allocations: allocList,
    });
    setSaving(false);
    if (!result.success) { setError(result.error); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Registrar reembolso de Fonavi</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Datos del reembolso */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Fecha</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Monto recibido (S/)</label>
              <input type="number" step="0.01" value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                placeholder="0.00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nota (opcional)</label>
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Ej. transferencia BCP"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          {/* Asignación */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700">Asigna el reembolso a las cuentas pendientes:</label>
              <button onClick={autoAssign} disabled={!totalNum} className="text-xs text-primary-light hover:underline disabled:opacity-50">
                Auto-asignar (más antiguas primero)
              </button>
            </div>

            {pendingReceivables.length === 0 ? (
              <div className="text-sm text-gray-500 text-center p-4">No hay cuentas pendientes.</div>
            ) : (
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {pendingReceivables.map((r) => (
                  <div key={r.id} className="p-3 flex items-center gap-3 hover:bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{r.category} · {r.concept}</div>
                      <div className="text-xs text-gray-500">
                        {formatDateShort(r.expense_date)} · pendiente <span className="font-medium text-violet-700">{formatCurrency(r.amount_pending)}</span>
                      </div>
                    </div>
                    <input
                      type="number" step="0.01" min="0" max={r.amount_pending}
                      value={allocations[r.id] ?? ""}
                      onChange={(e) => setAllocations({ ...allocations, [r.id]: e.target.value })}
                      placeholder="0.00"
                      className="w-28 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 flex items-center justify-between text-sm">
              <div className="text-gray-600">Asignado: <span className="font-medium text-gray-900">{formatCurrency(allocSum)}</span></div>
              <div className={`font-medium ${Math.abs(remaining) < 0.01 ? "text-green-600" : remaining < 0 ? "text-red-600" : "text-amber-600"}`}>
                {Math.abs(remaining) < 0.01 ? "✓ Cuadra" : remaining < 0 ? `Excede ${formatCurrency(-remaining)}` : `Falta asignar ${formatCurrency(remaining)}`}
              </div>
            </div>
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving || pendingReceivables.length === 0}
            className="px-4 py-2 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 flex items-center gap-2 disabled:opacity-50">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar reembolso
          </button>
        </div>
      </div>
    </div>
  );
}
