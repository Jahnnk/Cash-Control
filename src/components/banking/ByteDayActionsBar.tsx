"use client";

/**
 * Barra de acciones para el registro Byte del día activo del Registro
 * Diario. Aparece debajo del formulario de captura ("Resumen Byte") en
 * Centro/Fonavi (formato B2C) y en el bloque Byte de Atelier.
 *
 * Solo se renderiza cuando `hasData=true` (hay datos guardados para el
 * día). El form sigue siendo el primary CTA para editar montos. Esta
 * barra cubre 2 acciones que no podían hacerse antes:
 *   - Mover el registro a otra fecha (caso usuario: 19/05 → 18/05)
 *   - Eliminar el registro Byte completo del día
 *
 * Ambas acciones disparan recálculo de saldos en cadena desde la fecha
 * más antigua afectada (manejado server-side).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Trash2, AlertTriangle, Loader2, X } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { moveByteRecord, deleteByteRecord } from "@/app/actions/byte-sales";

export function ByteDayActionsBar({
  date,
  hasData,
  total,
  summary,
  onChanged,
}: {
  date: string;
  hasData: boolean;
  total: number;
  /** Línea libre debajo del total ("Efectivo S/X · Yape S/Y · ..."). */
  summary?: string;
  /** Callback tras éxito de move/delete (refresca el form padre). */
  onChanged?: () => void | Promise<void>;
}) {
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (!hasData) return null;

  return (
    <>
      <div className="flex items-center justify-end gap-2 pt-2 mt-3 border-t border-gray-100">
        <button
          type="button"
          onClick={() => setMoveOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 border border-gray-200 rounded-lg transition-colors"
          title="Cambiar la fecha de este registro Byte"
        >
          <Calendar className="w-3.5 h-3.5" />
          Mover a otra fecha
        </button>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors"
          title="Eliminar el registro Byte de este día"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Eliminar
        </button>
      </div>

      {moveOpen && (
        <MoveByteModal
          fromDate={date}
          total={total}
          summary={summary}
          onClose={() => setMoveOpen(false)}
          onSaved={onChanged}
        />
      )}
      {deleteOpen && (
        <DeleteByteModal
          date={date}
          total={total}
          summary={summary}
          onClose={() => setDeleteOpen(false)}
          onDeleted={onChanged}
        />
      )}
    </>
  );
}

// ─── Modal: mover a otra fecha ─────────────────────────────────────

function MoveByteModal({
  fromDate,
  total,
  summary,
  onClose,
  onSaved,
}: {
  fromDate: string;
  total: number;
  summary?: string;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const [toDate, setToDate] = useState(fromDate);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

  function submit() {
    setError(null);
    if (toDate === fromDate) {
      setError("La fecha destino debe ser distinta a la origen.");
      return;
    }
    if (toDate > today) {
      setError("La fecha destino no puede ser futura.");
      return;
    }
    startTransition(async () => {
      const r = await moveByteRecord(fromDate, toDate);
      if (!r.success) {
        setError(r.error);
        return;
      }
      // Navegar al nuevo día para que el form refleje los datos movidos
      router.push(`?fecha=${toDate}`);
      router.refresh();
      if (onSaved) await onSaved();
      onClose();
    });
  }

  return (
    <Modal onClose={() => !pending && onClose()} title="Mover registro Byte" icon="calendar">
      <div className="space-y-4">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Fecha actual</span>
            <span className="font-medium">{formatDate(fromDate)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Total registrado</span>
            <span className="font-semibold text-gray-900">{formatCurrency(total)}</span>
          </div>
          {summary && (
            <div className="text-xs text-gray-500 pt-1 border-t border-gray-200 mt-1">
              {summary}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nueva fecha
          </label>
          <input
            type="date"
            value={toDate}
            max={today}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            autoFocus
          />
          <p className="text-[11px] text-gray-500 mt-1">
            Si el día destino ya tiene un registro Byte, se sobrescribirá.
          </p>
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => !pending && onClose()}
            disabled={pending}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || toDate === fromDate}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
            Mover
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Modal: eliminar (doble confirmación) ───────────────────────────

function DeleteByteModal({
  date,
  total,
  summary,
  onClose,
  onDeleted,
}: {
  date: string;
  total: number;
  summary?: string;
  onClose: () => void;
  onDeleted?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const r = await deleteByteRecord(date);
      if (!r.success) {
        setError(r.error);
        return;
      }
      router.refresh();
      if (onDeleted) await onDeleted();
      onClose();
    });
  }

  return (
    <Modal onClose={() => !pending && onClose()} title="Eliminar registro Byte" icon="warning">
      <div className="space-y-4">
        <p className="text-sm text-gray-700">
          ¿Eliminar el registro Byte del{" "}
          <strong>{formatDate(date)}</strong>?
        </p>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Fecha</span>
            <span className="font-medium">{formatDate(date)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Total</span>
            <span className="font-semibold text-gray-900">{formatCurrency(total)}</span>
          </div>
          {summary && (
            <div className="text-xs text-gray-500 pt-1 border-t border-gray-200 mt-1">
              {summary}
            </div>
          )}
        </div>

        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Esta acción no se puede deshacer. Los saldos de días posteriores se recalcularán automáticamente.
        </p>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => !pending && onClose()}
            disabled={pending}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Confirmar eliminación
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Modal shell ────────────────────────────────────────────────────

function Modal({
  title,
  icon,
  onClose,
  children,
}: {
  title: string;
  icon: "calendar" | "warning";
  onClose: () => void;
  children: React.ReactNode;
}) {
  const Icon = icon === "warning" ? AlertTriangle : Calendar;
  const iconCls = icon === "warning" ? "text-amber-600" : "text-emerald-600";
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Icon className={`w-5 h-5 ${iconCls}`} />
            {title}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
