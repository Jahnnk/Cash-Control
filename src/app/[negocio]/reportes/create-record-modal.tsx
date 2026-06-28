"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { X, Loader2 } from "lucide-react";
import { createBankIncomeItem } from "@/app/actions/bank-income";
import { createExpense } from "@/app/actions/expenses";
import { NON_OPERATIVE_CATEGORIES } from "@/lib/income-base";
import { LOAN_NON_OPERATIVE_CATEGORY } from "@/lib/loans";

type ClientOption = { id: string; name: string };

/** Mismo criterio que EditRecordModal — placeholder condicional por negocio. */
function emptyClientLabel(negocio: string | null): string {
  return negocio === "atelier"
    ? "— Sin cliente —"
    : "— Sin cliente (ingreso del Byte) —";
}

export type CreateTarget = {
  type: "income" | "expense";
  /** Fecha prellenada (YYYY-MM-DD). */
  date: string;
  /** Si es `true`, el campo fecha queda bloqueado (creando desde el bloque
   * de un día específico). Si es `false`, el usuario puede cambiar la
   * fecha — usado por el botón global "+ Agregar movimiento". */
  dateLocked: boolean;
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Modal para crear ingresos o egresos a Ctas. y Efectivo directamente
 * desde la pestaña "Movimientos diarios". Espeja la estructura visual
 * de EditRecordModal para mantener consistencia.
 *
 * Reutiliza las server actions `createBankIncomeItem` (single-row,
 * añadida específicamente para este flujo) y `createExpense`
 * (existente, usada también por Registro Diario).
 *
 * Restricciones:
 * - Fecha máxima = hoy (no permite futuras, frontend + backend).
 * - Solo crea filas operativas normales — los tipos especiales
 *   (préstamos socio, transferencias internas, reembolsos Fonavi)
 *   tienen sus propios módulos y NO son creables desde aquí.
 */
export function CreateRecordModal({
  target,
  categories,
  clients,
  onClose,
  onCreated,
}: {
  target: CreateTarget;
  categories: string[];
  clients: ClientOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const isIncome = target.type === "income";
  const TODAY = todayISO();
  const params = useParams<{ negocio?: string }>();
  const negocio = params?.negocio ?? null;

  // Campos comunes
  const [date, setDate] = useState(target.date);
  const [amount, setAmount] = useState("");

  // Ingreso
  const [clientId, setClientId] = useState<string>("");
  const [note, setNote] = useState("");
  const [incomePaymentMethod, setIncomePaymentMethod] = useState<string>("transferencia");
  // "" = operativo (ventas); texto = categoría no operativa (fuera del EBITDA)
  const [nonOpCategory, setNonOpCategory] = useState<string>("");
  // Préstamo del socio (solo Atelier + categoría de préstamos): el ingreso
  // queda registrado también en "Préstamos del socio" como deuda con Jahnn.
  const [isPartnerLoan, setIsPartnerLoan] = useState(false);
  const partnerLoanAvailable =
    negocio === "atelier" && nonOpCategory === LOAN_NON_OPERATIVE_CATEGORY;

  // Egreso
  const [category, setCategory] = useState<string>(categories[0] ?? "");
  const [concept, setConcept] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("transferencia");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);

    // Validaciones frontend
    const amountNum = parseFloat(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError("El monto debe ser mayor a 0");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError("Fecha inválida");
      return;
    }
    if (date > TODAY) {
      setError("No se pueden registrar movimientos con fecha futura");
      return;
    }
    if (!isIncome) {
      if (!category.trim()) {
        setError("Selecciona una categoría");
        return;
      }
      if (!concept.trim()) {
        setError("Escribe un concepto");
        return;
      }
    }

    setSaving(true);
    try {
      if (isIncome) {
        const result = await createBankIncomeItem({
          date,
          amount: amountNum,
          // Un préstamo del socio nunca lleva cliente (el server lo re-valida).
          clientId: partnerLoanAvailable && isPartnerLoan ? null : clientId || null,
          note: note.trim(),
          paymentMethod: incomePaymentMethod,
          nonOperativeCategory: nonOpCategory || null,
          isPartnerLoan: partnerLoanAvailable && isPartnerLoan,
        });
        if (!result.success) {
          setError(result.error);
          setSaving(false);
          return;
        }
      } else {
        // createExpense lanza Error si falla (no devuelve Result).
        await createExpense({
          date,
          category: category.trim(),
          concept: concept.trim(),
          amount: amountNum,
          paymentMethod,
          notes: notes.trim() || undefined,
        });
      }
      setSaving(false);
      onCreated();
    } catch (err) {
      console.error("[CreateRecordModal] save failed:", err);
      setError(err instanceof Error ? err.message : "Error al guardar");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            Nuevo {isIncome ? "ingreso" : "egreso"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Banner informativo */}
        <div className="mx-6 mt-4 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-900">
          💡 El movimiento se registra automáticamente y recalcula el saldo del banco.
        </div>

        {/* Form */}
        <div className="p-6 space-y-4">
          {/* Fecha — siempre editable. Por defecto el día del bloque (o hoy),
              pero puedes cambiarlo a un día anterior. */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Fecha
            </label>
            <input
              type="date"
              value={date}
              max={TODAY}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-light/30"
            />
            <div className="text-[11px] text-gray-500 mt-1">
              Por defecto {target.dateLocked ? "el día seleccionado" : "hoy"}; puedes elegir un día anterior. No se permiten fechas futuras.
            </div>
          </div>

          {/* Monto */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Monto (S/)
            </label>
            <input
              type="number" inputMode="decimal" min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-light/30"
              placeholder="0.00"
              autoFocus
            />
          </div>

          {isIncome ? (
            <>
              {/* Cliente (opcional) */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Cliente (opcional)
                </label>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  disabled={partnerLoanAvailable && isPartnerLoan}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="">{emptyClientLabel(negocio)}</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Nota */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Nota (opcional)
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Descripción breve"
                />
              </div>

              {/* Método de pago */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Método de pago
                </label>
                <div className="flex gap-2">
                  {(["transferencia", "efectivo", "yape"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setIncomePaymentMethod(m)}
                      className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                        incomePaymentMethod === m
                          ? "bg-primary-light text-white border-primary-light"
                          : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
                      }`}
                    >
                      {m === "transferencia"
                        ? "Transferencia"
                        : m === "efectivo"
                          ? "Efectivo"
                          : "Yape"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tipo de ingreso: operativo vs no operativo (fuera del EBITDA) */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Tipo de ingreso
                </label>
                <select
                  value={nonOpCategory}
                  onChange={(e) => setNonOpCategory(e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2 text-sm bg-white ${nonOpCategory ? "border-amber-300 bg-amber-50 text-amber-900" : "border-gray-300"}`}
                >
                  <option value="">Operativo (ventas)</option>
                  {NON_OPERATIVE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>No operativo · {c}</option>
                  ))}
                </select>
                {nonOpCategory && (
                  <div className="text-[11px] text-amber-700 mt-1">
                    Entra al saldo (banco o caja según el método) pero <strong>no cuenta como venta ni en el EBITDA</strong>.
                  </div>
                )}
              </div>

              {/* Préstamo del socio (solo Atelier + categoría de préstamos) */}
              {partnerLoanAvailable && (
                <div className="border border-emerald-200 bg-emerald-50/60 rounded-lg px-3 py-2.5">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isPartnerLoan}
                      onChange={(e) => {
                        setIsPartnerLoan(e.target.checked);
                        if (e.target.checked) setClientId("");
                      }}
                      className="mt-0.5 accent-emerald-600"
                    />
                    <span className="text-xs text-emerald-900">
                      <strong>Es préstamo del socio (Jahnn → Atelier)</strong>
                      <span className="block text-emerald-700 mt-0.5">
                        Quedará registrado en &quot;Préstamos del socio&quot; como deuda
                        pendiente con Jahnn, y se gestiona desde esa pantalla.
                      </span>
                    </span>
                  </label>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Categoría */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Categoría
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  {categories.length === 0 && <option value="">(sin categorías)</option>}
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Concepto */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Concepto
                </label>
                <input
                  type="text"
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Ej. Compra de harina"
                />
              </div>

              {/* Método de pago */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Método de pago
                </label>
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
                      {m === "transferencia"
                        ? "Transferencia"
                        : m === "efectivo"
                          ? "Efectivo"
                          : "Yape"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notas */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Notas (opcional)
                </label>
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
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Mini-selector para el botón global "+ Agregar movimiento": pregunta
 * "¿Ingreso o Egreso?" antes de abrir el formulario completo.
 */
export function CreateTypeSelector({
  onPick,
  onClose,
}: {
  onPick: (type: "income" | "expense") => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            ¿Qué quieres registrar?
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 grid grid-cols-2 gap-3">
          <button
            onClick={() => onPick("income")}
            className="flex flex-col items-center justify-center gap-1 px-4 py-6 rounded-lg border-2 border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 hover:border-emerald-300 transition-colors"
          >
            <span className="text-2xl">+</span>
            <span className="text-sm font-semibold text-emerald-700">Ingreso</span>
          </button>
          <button
            onClick={() => onPick("expense")}
            className="flex flex-col items-center justify-center gap-1 px-4 py-6 rounded-lg border-2 border-red-200 bg-red-50/50 hover:bg-red-50 hover:border-red-300 transition-colors"
          >
            <span className="text-2xl">−</span>
            <span className="text-sm font-semibold text-red-700">Egreso</span>
          </button>
        </div>
        <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
