"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { X, Loader2 } from "lucide-react";
import { updateIncomeItem, updateExpense } from "@/app/actions/record-edits";
import { getSharedRules, type SharedRule } from "@/app/actions/shared-expense-rules";
import { computeThreeWaySplit } from "@/lib/shared-split";
import { formatDateShort } from "@/lib/utils";

type ClientOption = { id: string; name: string };

/**
 * Atelier es centro de produccion B2B sin POS Byte. Centro y Fonavi
 * si tienen POS Byte y por eso los cobros llegan al banco mezclados
 * con cobros B2B — el texto "(ingreso del Byte)" ayuda a distinguir
 * en esos negocios. En Atelier el texto es confuso porque no aplica.
 */
function emptyClientLabel(negocio: string | null): string {
  return negocio === "atelier"
    ? "— Sin cliente —"
    : "— Sin cliente (ingreso del Byte) —";
}

export type EditTarget =
  | {
      type: "income";
      id: string;
      date: string;
      amount: number;
      note: string;
      clientId: string | null;
      clientName: string | null;
      paymentMethod: string;
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
      // Condición de compartido (solo relevante en Atelier)
      isShared?: boolean;
      sharedRuleId?: string | null;
      fonaviAmount?: number | null;
      centroAmount?: number | null;
      /** Espejo auto-generado en Fonavi (no editable; se gestiona desde Atelier). */
      isMirror?: boolean;
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
  const params = useParams<{ negocio?: string }>();
  const negocio = params?.negocio ?? null;

  // Local state
  const [amount, setAmount] = useState(String(target.amount));
  const [note, setNote] = useState(isIncome ? target.note : "");
  const [clientId, setClientId] = useState<string>(isIncome ? target.clientId ?? "" : "");

  const [category, setCategory] = useState(!isIncome ? target.category : "");
  const [concept, setConcept] = useState(!isIncome ? target.concept : "");
  // Método de pago: aplica tanto a ingreso como a egreso. Se inicializa con
  // el valor real del registro (ambos targets ahora traen paymentMethod).
  const [paymentMethod, setPaymentMethod] = useState(target.paymentMethod ?? "transferencia");
  const [notes, setNotes] = useState(!isIncome && target.notes ? target.notes : "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ───── Gasto compartido con Fonavi (solo egresos de Atelier) ─────
  // Permite marcar/quitar/ajustar la condición al editar: el server action
  // crea/elimina/sincroniza el por cobrar y el gasto-espejo en transacción.
  const canShare = !isIncome && negocio === "atelier" && !target.isMirror;
  const [sharedRules, setSharedRules] = useState<SharedRule[]>([]);
  const [isShared, setIsShared] = useState(!isIncome && !!target.isShared);
  const [sharedRuleId, setSharedRuleId] = useState<string>(
    (!isIncome && target.sharedRuleId) || "",
  );
  const [fonaviPart, setFonaviPart] = useState<string>(
    !isIncome && target.fonaviAmount != null ? target.fonaviAmount.toFixed(2) : "",
  );
  const [centroPart, setCentroPart] = useState<string>(
    !isIncome && target.centroAmount != null ? target.centroAmount.toFixed(2) : "",
  );
  useEffect(() => {
    if (canShare) getSharedRules().then((rules) => setSharedRules(rules.filter((r) => r.active)));
  }, [canShare]);
  const rulesForCategory = sharedRules.filter((r) => r.category_name === category);
  const selectedRule = rulesForCategory.find((r) => r.id === sharedRuleId) ?? null;

  // Default de la parte de Fonavi según la regla y el monto (editable a mano).
  function recomputeFonaviDefault(ruleId: string, amountStr: string) {
    const rule = sharedRules.find((r) => r.id === ruleId);
    const amt = parseFloat(amountStr);
    if (!rule || !Number.isFinite(amt) || amt <= 0) return;
    const split = computeThreeWaySplit(
      {
        splitMode: rule.split_mode === "fixed" ? "fixed" : "percentage",
        atelierPercentage: rule.atelier_percentage,
        fonaviPercentage: rule.fonavi_percentage,
        centroPercentage: rule.centro_percentage ?? 0,
        atelierFixed: rule.atelier_fixed,
        fonaviFixed: rule.fonavi_fixed,
        centroFixed: rule.centro_fixed,
      },
      amt,
    );
    setFonaviPart(split.fonavi > 0 ? split.fonavi.toFixed(2) : "0");
    setCentroPart(split.centro > 0 ? split.centro.toFixed(2) : "0");
  }

  const categoryNotListed = !isIncome && category && !categories.includes(category);

  async function handleSave() {
    setError(null);
    const amountNum = parseFloat(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError("El monto debe ser mayor a 0");
      return;
    }
    if (canShare && isShared) {
      if (!sharedRuleId) { setError("Selecciona la regla de gasto compartido"); return; }
      const f = Math.max(0, parseFloat(fonaviPart) || 0);
      const c = Math.max(0, parseFloat(centroPart) || 0);
      if (f + c <= 0) { setError("Al menos una cafetería (Fonavi o Centro) debe tener una parte mayor a 0"); return; }
      if (f + c > amountNum + 0.005) { setError("Las partes de Fonavi y Centro no pueden exceder el monto total"); return; }
    }

    setSaving(true);
    const result = isIncome
      ? await updateIncomeItem(target.id, {
          amount: amountNum,
          note: note.trim(),
          clientId: clientId || null,
          paymentMethod,
        })
      : await updateExpense(target.id, {
          amount: amountNum,
          category: category.trim(),
          concept: concept.trim(),
          paymentMethod,
          notes: notes.trim() || null,
          // Solo Atelier gestiona la condición; en Fonavi/Centro no se toca.
          ...(canShare
            ? { shared: isShared ? { ruleId: sharedRuleId, fonaviAmount: Math.max(0, parseFloat(fonaviPart) || 0), centroAmount: Math.max(0, parseFloat(centroPart) || 0) } : null }
            : {}),
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
              type="number" inputMode="decimal" min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                if (canShare && isShared && sharedRuleId) recomputeFonaviDefault(sharedRuleId, e.target.value);
              }}
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
                  <option value="">{emptyClientLabel(negocio)}</option>
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

              {/* Método de pago — efectivo NO suma al saldo del banco;
                  transferencia/yape sí. Cambiarlo recalcula el saldo. */}
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
                {target.type === "income" && target.paymentMethod !== paymentMethod && (
                  <div className="text-[11px] text-amber-600 mt-1">
                    Cambiar el método recalcula el saldo del banco
                    {target.paymentMethod === "efectivo" || paymentMethod === "efectivo"
                      ? " (efectivo no cuenta para el saldo BCP)."
                      : "."}
                  </div>
                )}
                {!["transferencia", "efectivo", "yape"].includes(paymentMethod) && (
                  <div className="text-[11px] text-gray-500 mt-1">
                    Método actual: <span className="font-medium">{paymentMethod === "socio" ? "Pagado por el socio (préstamo directo — no toca banco ni caja)" : paymentMethod}</span> (se conserva si no eliges otro).
                  </div>
                )}
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

              {/* Gasto compartido con Fonavi (solo Atelier) */}
              {canShare && (
                <div className="bg-violet-50 border border-violet-100 rounded-lg p-3 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isShared}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setIsShared(next);
                        if (next) {
                          // Auto-elegir regla si hay una sola para la categoría
                          const rid = sharedRuleId || (rulesForCategory.length === 1 ? rulesForCategory[0].id : "");
                          if (rid !== sharedRuleId) setSharedRuleId(rid);
                          if (rid && !fonaviPart) recomputeFonaviDefault(rid, amount);
                        }
                      }}
                      className="rounded text-violet-600"
                    />
                    <span className="text-sm font-medium text-violet-900">Compartido con Fonavi</span>
                  </label>

                  {isShared && (
                    <>
                      {rulesForCategory.length === 0 ? (
                        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
                          La categoría &quot;{category}&quot; no tiene reglas de gasto compartido. Créala en Configuración → Gastos compartidos.
                        </div>
                      ) : (
                        <select
                          value={sharedRuleId}
                          onChange={(e) => {
                            setSharedRuleId(e.target.value);
                            if (e.target.value) recomputeFonaviDefault(e.target.value, amount);
                          }}
                          className="w-full border border-violet-200 rounded-md px-2 py-1.5 text-xs bg-white"
                        >
                          <option value="">— Elegir regla —</option>
                          {rulesForCategory.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.concept}{" "}
                              {r.split_mode === "fixed"
                                ? `(Atelier S/${(r.atelier_fixed ?? 0).toFixed(2)} fijo)`
                                : `(${r.atelier_percentage}% / ${r.fonavi_percentage}%)`}
                            </option>
                          ))}
                        </select>
                      )}

                      <div className="flex items-center gap-2 flex-wrap text-xs text-violet-800">
                        <span className="whitespace-nowrap">Fonavi: S/</span>
                        <input
                          type="number" step="0.01" min="0" inputMode="decimal"
                          value={fonaviPart}
                          onChange={(e) => setFonaviPart(e.target.value)}
                          className="w-24 border border-violet-200 rounded-md px-2 py-1 text-xs text-right bg-white"
                          title="Parte de Fonavi (0 = no participa)"
                        />
                        <span className="whitespace-nowrap">Centro: S/</span>
                        <input
                          type="number" step="0.01" min="0" inputMode="decimal"
                          value={centroPart}
                          onChange={(e) => setCentroPart(e.target.value)}
                          className="w-24 border border-violet-200 rounded-md px-2 py-1 text-xs text-right bg-white"
                          title="Parte de Centro (0 = no participa)"
                        />
                        {selectedRule && (
                          <span className="text-violet-500">
                            Tu parte: S/ {(Math.round((parseFloat(amount || "0") - (parseFloat(fonaviPart) || 0) - (parseFloat(centroPart) || 0)) * 100) / 100).toFixed(2)}
                          </span>
                        )}
                      </div>

                      {!target.isShared && (
                        <div className="text-[11px] text-violet-600">
                          Al guardar se crearán los por cobrar y gastos espejo de los locales con parte mayor a 0.
                        </div>
                      )}
                    </>
                  )}

                  {!isShared && target.isShared && (
                    <div className="text-[11px] text-amber-700">
                      Al guardar se eliminarán los por cobrar y gastos espejo de este gasto.
                    </div>
                  )}
                </div>
              )}
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
