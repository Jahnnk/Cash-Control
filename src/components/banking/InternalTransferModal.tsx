"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, X, AlertTriangle } from "lucide-react";
import { formatCurrency, getToday } from "@/lib/utils";
import { useBankBalance } from "@/hooks/useBankBalance";
import { useCashBalance } from "@/hooks/useCashBalance";
import {
  createInternalTransfer,
  updateInternalTransfer,
  type TransferDirection,
} from "@/app/actions/internal-transfers";

export type InternalTransferModalProps = {
  open: boolean;
  onClose: () => void;
  /**
   * Si se pasa, el modal está en modo EDICIÓN. Pre-llena los campos y
   * llama updateInternalTransfer en lugar de createInternalTransfer.
   * La dirección NO es editable (consistente con el prompt).
   */
  editing?: {
    pairId: string;
    direction: TransferDirection;
    amount: number;
    date: string;
    note: string | null;
  };
};

export function InternalTransferModal({ open, onClose, editing }: InternalTransferModalProps) {
  const router = useRouter();
  const bank = useBankBalance();
  const cash = useCashBalance();
  const [pending, startTransition] = useTransition();

  const [direction, setDirection] = useState<TransferDirection>("efectivo_to_banco");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(getToday());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [overrideWarning, setOverrideWarning] = useState(false);

  // Pre-llenar al entrar en modo edición o resetear al abrir.
  // setState dentro del effect es intencional (sync con props), mismo
  // patrón ya tolerado en useBankBalance/useCashBalance.
  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    if (editing) {
      setDirection(editing.direction);
      setAmount(String(editing.amount));
      setDate(editing.date);
      setNote(editing.note ?? "");
    } else {
      setDirection("efectivo_to_banco");
      setAmount("");
      setDate(getToday());
      setNote("");
    }
    setError(null);
    setOverrideWarning(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, editing]);

  if (!open) return null;

  const amountNum = parseFloat(amount);
  const amountValid = Number.isFinite(amountNum) && amountNum > 0;
  const today = getToday();
  const dateValid = !!date && date <= today;

  const sourceBalance = direction === "efectivo_to_banco" ? cash.current : bank.current;
  const exceedsSource = amountValid && amountNum > sourceBalance;

  function handleSubmit() {
    setError(null);
    if (!dateValid) {
      setError(date ? "La fecha no puede ser futura" : "La fecha es obligatoria");
      return;
    }
    if (!amountValid) {
      setError("Ingresa un monto válido mayor a cero");
      return;
    }
    if (exceedsSource && !overrideWarning) {
      // Mostrar warning, requerir segundo click
      setOverrideWarning(true);
      return;
    }

    startTransition(async () => {
      try {
        if (editing) {
          const r = await updateInternalTransfer(editing.pairId, {
            amount: amountNum,
            date,
            note: note.trim() || undefined,
          });
          if (!r.success) { setError(r.error); return; }
        } else {
          const r = await createInternalTransfer({
            direction,
            amount: amountNum,
            date,
            note: note.trim() || undefined,
          });
          if (!r.success) { setError(r.error); return; }
        }
        onClose();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al guardar");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={() => !pending && onClose()}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <ArrowRightLeft className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">
              {editing ? "Editar transferencia interna" : "Transferencia interna entre cuentas"}
            </h3>
          </div>
          <button onClick={() => !pending && onClose()} className="text-gray-400 hover:text-gray-600 shrink-0" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-gray-500 mb-4">
          Mueve dinero entre la caja efectivo y la cuenta BCP de este negocio.
          No afecta ingresos ni gastos operativos.
        </p>

        <div className="space-y-4">
          {/* Dirección */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Dirección</label>
            <div className="space-y-2">
              <label className={`flex items-center gap-2 text-sm cursor-pointer ${editing ? "opacity-50" : ""}`}>
                <input
                  type="radio"
                  checked={direction === "efectivo_to_banco"}
                  onChange={() => !editing && setDirection("efectivo_to_banco")}
                  disabled={!!editing}
                />
                De Efectivo a BCP <span className="text-gray-400">(depositar)</span>
              </label>
              <label className={`flex items-center gap-2 text-sm cursor-pointer ${editing ? "opacity-50" : ""}`}>
                <input
                  type="radio"
                  checked={direction === "banco_to_efectivo"}
                  onChange={() => !editing && setDirection("banco_to_efectivo")}
                  disabled={!!editing}
                />
                De BCP a Efectivo <span className="text-gray-400">(retirar)</span>
              </label>
            </div>
            {!editing && (
              <p className="text-[11px] text-gray-400 mt-1">
                Saldo actual {direction === "efectivo_to_banco" ? "efectivo" : "BCP"}: {formatCurrency(sourceBalance)}
              </p>
            )}
          </div>

          {/* Monto */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Monto (S/)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setOverrideWarning(false); }}
              placeholder="0.00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              autoFocus
            />
          </div>

          {/* Fecha */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
            <input
              type="date"
              value={date}
              max={today}
              required
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Nota */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nota <span className="text-gray-400">(opcional)</span>
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ej: Depósito al banco del día"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Warning de saldo */}
          {!editing && exceedsSource && (
            <div className="text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-amber-900">
                El monto excede el saldo actual de{" "}
                {direction === "efectivo_to_banco" ? "caja efectivo" : "BCP"} ({formatCurrency(sourceBalance)}).
                {overrideWarning ? " Click de nuevo en \"Registrar transferencia\" para confirmar." : ""}
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <button
              onClick={() => !pending && onClose()}
              disabled={pending}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={pending}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
            >
              {pending
                ? "Guardando..."
                : editing
                  ? "Guardar cambios"
                  : exceedsSource && overrideWarning
                    ? "Sí, registrar de todos modos"
                    : "Registrar transferencia"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
