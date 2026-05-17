"use client";

/**
 * Modal de registro de saldo BCP real (Fase 1 — solo Atelier).
 *
 * Comportamiento:
 *  - Date picker default = hoy (Lima), permite pasado, NO permite futuro.
 *  - Saldo real BCP: input numérico, valida > 0.
 *  - Saldo del sistema: read-only, calculado server-side. Se
 *    recalcula al cambiar la fecha en el picker.
 *  - Si ya existe registro para la fecha + negocio activo → precarga
 *    valores y el botón dice "Actualizar".
 *  - Al guardar: cierra modal, llama onSaved() para que el card del
 *    dashboard se refresque sin reload.
 */
import { useState, useEffect, useTransition } from "react";
import { X, Loader2, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  upsertBankRealCheck,
  computeSystemBalanceForDate,
  getBankRealCheckByDate,
} from "@/app/actions/bank-real-checks";

export type BankRealCheckModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function todayLima(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

export function BankRealCheckModal({ open, onClose, onSaved }: BankRealCheckModalProps) {
  const [checkDate, setCheckDate] = useState(() => todayLima());
  const [realBalance, setRealBalance] = useState("");
  const [notes, setNotes] = useState("");
  const [systemBalance, setSystemBalance] = useState<number | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [loadingDateData, setLoadingDateData] = useState(false);

  // Reset state al abrir
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset al abrir
    setCheckDate(todayLima());
    setRealBalance("");
    setNotes("");
    setError(null);
    setExistingId(null);
  }, [open]);

  // Cargar saldo sistema + posible registro previo al cambiar fecha
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch al cambiar fecha
    setLoadingDateData(true);
    Promise.all([
      computeSystemBalanceForDate(checkDate),
      getBankRealCheckByDate(checkDate),
    ]).then(([sys, existing]) => {
      if (cancelled) return;
      setSystemBalance(sys);
      if (existing) {
        setExistingId(existing.id);
        setRealBalance(String(existing.realBalance));
        setNotes(existing.notes ?? "");
      } else {
        setExistingId(null);
      }
      setLoadingDateData(false);
    });
    return () => { cancelled = true; };
  }, [checkDate, open]);

  const today = todayLima();
  const realBalanceNum = parseFloat(realBalance);
  const canSave = realBalance.trim() !== "" && realBalanceNum > 0 && checkDate <= today && !pending;

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const r = await upsertBankRealCheck({
        checkDate,
        realBalance: realBalanceNum,
        notes: notes.trim() || null,
      });
      if (!r.success) {
        setError(r.error);
        return;
      }
      onSaved();
      onClose();
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
         onClick={() => !pending && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {existingId ? "Actualizar saldo BCP real" : "Registrar saldo BCP real"}
          </h3>
          <button onClick={onClose} disabled={pending}
                  className="text-gray-400 hover:text-gray-600 disabled:opacity-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha del saldo</label>
            <input
              type="date"
              value={checkDate}
              max={today}
              onChange={(e) => setCheckDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            {checkDate === today && (
              <p className="text-[11px] text-gray-500 mt-1">Hoy ({today})</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Saldo real BCP</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">S/</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={realBalance}
                onChange={(e) => setRealBalance(e.target.value)}
                placeholder="0.00"
                className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm"
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Saldo del sistema</label>
            <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700">
              {loadingDateData ? (
                <span className="inline-flex items-center gap-2 text-gray-500"><Loader2 className="w-3 h-3 animate-spin" /> Calculando...</span>
              ) : systemBalance !== null ? (
                formatCurrency(systemBalance)
              ) : (
                "—"
              )}
            </div>
            {!loadingDateData && systemBalance !== null && realBalanceNum > 0 && (
              <p className="text-[11px] text-gray-500 mt-1">
                Diferencia: <span className={`font-medium ${realBalanceNum - systemBalance >= 0 ? "text-amber-700" : "text-red-700"}`}>
                  {realBalanceNum - systemBalance >= 0 ? "+" : ""}{formatCurrency(realBalanceNum - systemBalance)}
                </span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Comentarios sobre la diferencia (opcional)..."
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-4 mt-4 border-t border-gray-100">
          <button onClick={onClose} disabled={pending}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={!canSave}
                  className="px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg disabled:opacity-50 inline-flex items-center gap-2">
            {pending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
            ) : existingId ? (
              "Actualizar"
            ) : (
              "Guardar"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
