"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { getDailyBreakdown } from "@/app/actions/reports";
import { getCategories } from "@/app/actions/categories";
import { getClients } from "@/app/actions/clients";
import { getAvailableMonthRange } from "@/app/actions/month-range";
import {
  toggleBcpVerifiedIncome,
  toggleBcpVerifiedExpense,
} from "@/app/actions/bcp-verification";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { MonthSelector } from "@/components/ui/MonthSelector";
import { Pencil, Trash2, Plus, CheckCircle2, AlertCircle } from "lucide-react";
import { EditRecordModal, type EditTarget } from "./edit-record-modal";
import { DeleteRecordModal, type DeleteTarget } from "./delete-record-modal";
import {
  CreateRecordModal,
  CreateTypeSelector,
  type CreateTarget,
} from "./create-record-modal";

/**
 * Pestaña "Movimientos diarios" — vista combinada de ingresos y egresos
 * a Ctas. y Efectivo agrupados por día (ingresos a la izquierda, egresos
 * a la derecha). Reutiliza las queries existentes `getDailyBreakdown`
 * con tipos "income" y "expense", y los modales `EditRecordModal` /
 * `DeleteRecordModal` para mantener consistencia con la pestaña Mensual.
 *
 * Filtros aplicados (heredados de getDailyBreakdown):
 * - Excluye transferencias internas, préstamos especiales y
 *   reembolsos Fonavi (idéntico a la pestaña Mensual).
 * - Incluye is_byte_sale=true en ingresos (Centro/Fonavi) para que la
 *   suma del mes coincida con el card "Ingresos Ctas. y Efectivo".
 *
 * Verificación contra BCP:
 * - Checkbox por item para marcar como cuadrado contra app del banco.
 * - Solo metadata visual (campo bcp_verified_at). No afecta saldos.
 * - Toggle "Ocultar verificados" persistido en localStorage.
 */

function getCurrentMonth() {
  return new Date().toISOString().substring(0, 7);
}

function isValidMonth(m: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
}

const HIDE_VERIFIED_LS_KEY = "movimientos-diarios:hideVerified";

type IncomeRow = {
  id: string;
  date: string;
  amount: number;
  note: string | null;
  client_id: string | null;
  client_name: string | null;
  bcpVerifiedAt: string | null;
};

type ExpenseRow = {
  id: string;
  date: string;
  amount: number;
  category: string;
  concept: string;
  notes: string | null;
  payment_method: string | null;
  bcpVerifiedAt: string | null;
};

type DayBlock = {
  date: string;
  incomes: IncomeRow[];
  expenses: ExpenseRow[];
  incomeTotal: number;
  expenseTotal: number;
  net: number;
  incomeVerified: number;
  expenseVerified: number;
};

/** Color del contador "X/N ✓" según el progreso. */
function counterCls(verified: number, total: number): string {
  if (total === 0) return "text-gray-400";
  if (verified === total) return "text-emerald-600";
  if (verified > 0) return "text-amber-600";
  return "text-gray-400";
}

export function DailyMovementsReport() {
  const searchParams = useSearchParams();
  const initialMonth = (() => {
    const m = searchParams.get("mes");
    return m && isValidMonth(m) ? m : getCurrentMonth();
  })();

  const [month, setMonth] = useState(initialMonth);
  const [incomes, setIncomes] = useState<IncomeRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthRange, setMonthRange] = useState<{
    minMonth: string;
    maxMonth: string;
    currentMonth: string;
  } | null>(null);

  // Toggle "Ocultar verificados" — persistido en localStorage.
  const [hideVerified, setHideVerified] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(HIDE_VERIFIED_LS_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratacion desde localStorage al mount
    if (stored === "1") setHideVerified(true);
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(HIDE_VERIFIED_LS_KEY, hideVerified ? "1" : "0");
  }, [hideVerified]);

  // Datos auxiliares para modales (idéntico a monthly-report.tsx)
  const [categories, setCategories] = useState<string[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [createTarget, setCreateTarget] = useState<CreateTarget | null>(null);
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);

  // Auto-cierra toast a los 2.5s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    getAvailableMonthRange().then(setMonthRange);
    getCategories(true).then((rows) =>
      setCategories(rows.map((r) => r.name as string)),
    );
    getClients(true).then((rows) =>
      setClients(
        rows.map((r) => ({ id: r.id as string, name: r.name as string })),
      ),
    );
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [inc, exp] = await Promise.all([
      getDailyBreakdown(month, "income"),
      getDailyBreakdown(month, "expense"),
    ]);
    if (inc.format === "income") {
      setIncomes(
        inc.rows.map((r) => ({
          id: r.id as string,
          date: r.date as string,
          amount: Number(r.amount),
          note: (r.note as string) || null,
          client_id: (r.client_id as string) || null,
          client_name: (r.client_name as string) || null,
          bcpVerifiedAt: (r.bcp_verified_at as string) || null,
        })),
      );
    } else {
      setIncomes([]);
    }
    if (exp.format === "expense") {
      setExpenses(
        exp.rows.map((r) => ({
          id: r.id as string,
          date: r.date as string,
          amount: Number(r.amount),
          category: (r.category as string) || "",
          concept: (r.concept as string) || "",
          notes: (r.notes as string) || null,
          payment_method: (r.payment_method as string) || null,
          bcpVerifiedAt: (r.bcp_verified_at as string) || null,
        })),
      );
    } else {
      setExpenses([]);
    }
    setLoading(false);
  }, [month]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- patrón intencional de fetch al cambiar mes */
    loadData();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [loadData]);

  /**
   * Toggle de verificación BCP con update optimista. Si la server
   * action falla, revierte el estado local y muestra toast rojo.
   */
  const toggleVerify = useCallback(
    async (type: "income" | "expense", id: string) => {
      // Snapshot del estado previo para rollback en caso de error.
      const prevIncomes = incomes;
      const prevExpenses = expenses;

      // Update optimista: timestamp efímero del cliente (la server action
      // devuelve el timestamp real de la BD al volver y lo reconciliamos).
      const optimisticNow = new Date().toISOString();
      if (type === "income") {
        setIncomes((curr) =>
          curr.map((i) =>
            i.id === id
              ? { ...i, bcpVerifiedAt: i.bcpVerifiedAt ? null : optimisticNow }
              : i,
          ),
        );
      } else {
        setExpenses((curr) =>
          curr.map((e) =>
            e.id === id
              ? { ...e, bcpVerifiedAt: e.bcpVerifiedAt ? null : optimisticNow }
              : e,
          ),
        );
      }

      const result =
        type === "income"
          ? await toggleBcpVerifiedIncome(id)
          : await toggleBcpVerifiedExpense(id);

      if (!result.ok) {
        // Rollback
        setIncomes(prevIncomes);
        setExpenses(prevExpenses);
        setToast({ msg: result.error || "Error al actualizar", tone: "error" });
        return;
      }

      // Reconciliar con timestamp real devuelto por el servidor.
      if (type === "income") {
        setIncomes((curr) =>
          curr.map((i) =>
            i.id === id ? { ...i, bcpVerifiedAt: result.verifiedAt } : i,
          ),
        );
      } else {
        setExpenses((curr) =>
          curr.map((e) =>
            e.id === id ? { ...e, bcpVerifiedAt: result.verifiedAt } : e,
          ),
        );
      }
    },
    [incomes, expenses],
  );

  // Combina ingresos y egresos en bloques por día (desc por fecha).
  const days: DayBlock[] = useMemo(() => {
    const map = new Map<string, DayBlock>();
    for (const i of incomes) {
      if (!map.has(i.date))
        map.set(i.date, {
          date: i.date,
          incomes: [],
          expenses: [],
          incomeTotal: 0,
          expenseTotal: 0,
          net: 0,
          incomeVerified: 0,
          expenseVerified: 0,
        });
      const d = map.get(i.date)!;
      d.incomes.push(i);
      d.incomeTotal += i.amount;
      if (i.bcpVerifiedAt) d.incomeVerified += 1;
    }
    for (const e of expenses) {
      if (!map.has(e.date))
        map.set(e.date, {
          date: e.date,
          incomes: [],
          expenses: [],
          incomeTotal: 0,
          expenseTotal: 0,
          net: 0,
          incomeVerified: 0,
          expenseVerified: 0,
        });
      const d = map.get(e.date)!;
      d.expenses.push(e);
      d.expenseTotal += e.amount;
      if (e.bcpVerifiedAt) d.expenseVerified += 1;
    }
    const result = Array.from(map.values()).map((d) => ({
      ...d,
      net: d.incomeTotal - d.expenseTotal,
    }));
    result.sort((a, b) => b.date.localeCompare(a.date));
    return result;
  }, [incomes, expenses]);

  // Días visibles según el filtro de verificados. Cuando el filtro está
  // activo, se ocultan los días cuyas dos columnas quedan vacías.
  const visibleDays: DayBlock[] = useMemo(() => {
    if (!hideVerified) return days;
    return days.filter(
      (d) =>
        d.incomes.some((i) => !i.bcpVerifiedAt) ||
        d.expenses.some((e) => !e.bcpVerifiedAt),
    );
  }, [days, hideVerified]);

  const monthIncomeTotal = days.reduce((s, d) => s + d.incomeTotal, 0);
  const monthExpenseTotal = days.reduce((s, d) => s + d.expenseTotal, 0);
  const monthNet = monthIncomeTotal - monthExpenseTotal;

  // Resumen de verificación mensual (sobre TODOS los movimientos del mes,
  // no afectado por el toggle "Ocultar verificados").
  const monthVerified =
    incomes.filter((i) => i.bcpVerifiedAt).length +
    expenses.filter((e) => e.bcpVerifiedAt).length;
  const monthTotalCount = incomes.length + expenses.length;
  const monthVerifiedPct =
    monthTotalCount > 0 ? Math.round((monthVerified / monthTotalCount) * 100) : 0;
  const verifiedSummaryCls =
    monthTotalCount === 0
      ? "text-gray-400"
      : monthVerifiedPct === 100
        ? "text-emerald-600"
        : monthVerifiedPct >= 50
          ? "text-amber-600"
          : "text-gray-500";

  return (
    <div className="space-y-6">
      <MonthSelector
        value={month}
        onChange={setMonth}
        minMonth={monthRange?.minMonth}
        maxMonth={monthRange?.maxMonth}
        currentMonth={monthRange?.currentMonth}
        loading={loading}
      />

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
          Cargando...
        </div>
      ) : days.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center space-y-4">
          <div className="text-gray-500 text-sm">
            No hay movimientos a Ctas. y Efectivo en este mes.
          </div>
          <button
            onClick={() => setShowTypeSelector(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Agregar movimiento
          </button>
        </div>
      ) : (
        <>
          {/* Resumen del mes + botón global */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center justify-between gap-4 text-sm">
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <div className="text-gray-500 text-xs uppercase tracking-wide">
                  Ingresos del mes
                </div>
                <div className="text-emerald-600 font-semibold text-base">
                  {formatCurrency(monthIncomeTotal)}
                </div>
              </div>
              <div>
                <div className="text-gray-500 text-xs uppercase tracking-wide">
                  Egresos del mes
                </div>
                <div className="text-red-600 font-semibold text-base">
                  −{formatCurrency(monthExpenseTotal)}
                </div>
              </div>
              <div>
                <div className="text-gray-500 text-xs uppercase tracking-wide">
                  Neto del mes
                </div>
                <div
                  className={`font-bold text-base ${
                    monthNet > 0
                      ? "text-emerald-600"
                      : monthNet < 0
                        ? "text-red-600"
                        : "text-gray-500"
                  }`}
                >
                  {monthNet >= 0 ? "+" : ""}
                  {formatCurrency(monthNet)}
                </div>
              </div>
              <div>
                <div className="text-gray-500 text-xs uppercase tracking-wide">
                  Verificado
                </div>
                <div className={`font-semibold text-base ${verifiedSummaryCls}`}>
                  {monthVerified}/{monthTotalCount}
                  <span className="text-xs ml-1">({monthVerifiedPct}%)</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setHideVerified((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                  hideVerified
                    ? "bg-primary text-white border-primary hover:bg-primary-light"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400"
                }`}
                title={
                  hideVerified
                    ? "Mostrar todos los movimientos"
                    : "Ocultar movimientos ya verificados contra BCP"
                }
                aria-pressed={hideVerified}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {hideVerified ? "Mostrar todos" : "Ocultar verificados"}
              </button>
              <button
                onClick={() => setShowTypeSelector(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors"
                title="Agregar un movimiento nuevo (cualquier fecha)"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar movimiento
              </button>
            </div>
          </div>

          {visibleDays.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500 text-sm">
              Todos los movimientos del mes están verificados.
            </div>
          ) : (
            visibleDays.map((d) => (
              <DayCard
                key={d.date}
                day={d}
                hideVerified={hideVerified}
                onEdit={setEditTarget}
                onDelete={setDeleteTarget}
                onCreate={(type) =>
                  setCreateTarget({ type, date: d.date, dateLocked: true })
                }
                onToggleVerify={toggleVerify}
              />
            ))
          )}
        </>
      )}

      {editTarget && (
        <EditRecordModal
          target={editTarget}
          categories={categories}
          clients={clients}
          onClose={() => setEditTarget(null)}
          onSaved={async () => {
            await loadData();
            setEditTarget(null);
            setToast({ msg: "Cambios guardados", tone: "success" });
          }}
        />
      )}
      {deleteTarget && (
        <DeleteRecordModal
          target={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={async () => {
            await loadData();
            setDeleteTarget(null);
            setToast({ msg: "Movimiento eliminado", tone: "success" });
          }}
        />
      )}

      {/* Selector de tipo del botón global */}
      {showTypeSelector && (
        <CreateTypeSelector
          onClose={() => setShowTypeSelector(false)}
          onPick={(type) => {
            setShowTypeSelector(false);
            // Default: hoy, fecha editable.
            setCreateTarget({
              type,
              date: new Date().toISOString().slice(0, 10),
              dateLocked: false,
            });
          }}
        />
      )}

      {/* Modal de creación */}
      {createTarget && (
        <CreateRecordModal
          target={createTarget}
          categories={categories}
          clients={clients}
          onClose={() => setCreateTarget(null)}
          onCreated={async () => {
            const wasIncome = createTarget.type === "income";
            setCreateTarget(null);
            await loadData();
            setToast({
              msg: wasIncome ? "Ingreso registrado" : "Egreso registrado",
              tone: "success",
            });
          }}
        />
      )}

      {/* Toast (éxito o error) */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 text-sm font-medium animate-in fade-in slide-in-from-bottom-2 ${
            toast.tone === "error"
              ? "bg-red-600 text-white"
              : "bg-emerald-600 text-white"
          }`}
          role={toast.tone === "error" ? "alert" : "status"}
        >
          {toast.tone === "error" ? (
            <AlertCircle className="w-4 h-4" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function DayCard({
  day,
  hideVerified,
  onEdit,
  onDelete,
  onCreate,
  onToggleVerify,
}: {
  day: DayBlock;
  hideVerified: boolean;
  onEdit: (t: EditTarget) => void;
  onDelete: (t: DeleteTarget) => void;
  onCreate: (type: "income" | "expense") => void;
  onToggleVerify: (type: "income" | "expense", id: string) => void;
}) {
  const netCls =
    day.net > 0
      ? "text-emerald-600"
      : day.net < 0
        ? "text-red-600"
        : "text-gray-500";
  const dotCls =
    day.net > 0 ? "bg-emerald-500" : day.net < 0 ? "bg-red-500" : "bg-gray-400";

  // Filtrado de items visibles cuando el toggle está activo. Los
  // totales del día (incomeTotal/expenseTotal) se mantienen autoritativos
  // sobre TODOS los items del día — el contador "X/N ✓" comunica el
  // progreso para que no haya confusión.
  const visibleIncomes = hideVerified
    ? day.incomes.filter((i) => !i.bcpVerifiedAt)
    : day.incomes;
  const visibleExpenses = hideVerified
    ? day.expenses.filter((e) => !e.bcpVerifiedAt)
    : day.expenses;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header del día */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
        <div className="text-sm font-semibold text-gray-900">
          {formatDateShort(day.date)}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500 text-xs">Neto:</span>
          <span className={`font-bold ${netCls}`}>
            {day.net >= 0 ? "+" : ""}
            {formatCurrency(day.net)}
          </span>
          <span
            className={`w-2 h-2 rounded-full ${dotCls}`}
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Dos columnas: Ingresos | Egresos */}
      <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-gray-100">
        {/* Ingresos */}
        <div>
          <div className="px-4 py-2 bg-emerald-50/60 border-b border-gray-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase text-emerald-700 tracking-wide">
                Ingresos
              </span>
              <button
                onClick={() => onCreate("income")}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 bg-white border border-emerald-200 rounded hover:bg-emerald-100 hover:border-emerald-300 transition-colors"
                title="Agregar ingreso a este día"
                aria-label="Agregar ingreso a este día"
              >
                <Plus className="w-3 h-3" />
                Ingreso
              </button>
              {day.incomes.length > 0 && (
                <span
                  className={`text-[10px] font-medium ${counterCls(day.incomeVerified, day.incomes.length)}`}
                  title="Verificados contra BCP / Total"
                >
                  {day.incomeVerified}/{day.incomes.length} ✓
                </span>
              )}
            </div>
            <span className="text-sm font-bold text-emerald-700">
              {formatCurrency(day.incomeTotal)}
            </span>
          </div>
          <div className="divide-y divide-gray-50">
            {visibleIncomes.length === 0 ? (
              <div className="px-4 py-6 text-xs text-gray-400 italic text-center">
                {day.incomes.length === 0
                  ? "(sin ingresos este día)"
                  : "(todos verificados)"}
              </div>
            ) : (
              visibleIncomes.map((i) => {
                const isVerified = !!i.bcpVerifiedAt;
                return (
                  <div
                    key={i.id}
                    className="group flex items-center justify-between px-4 py-2 hover:bg-gray-50 transition-opacity duration-150"
                  >
                    <label
                      className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
                      title={
                        isVerified
                          ? "Verificado contra BCP — click para desmarcar"
                          : "Click para marcar como verificado contra BCP"
                      }
                    >
                      <input
                        type="checkbox"
                        checked={isVerified}
                        onChange={() => onToggleVerify("income", i.id)}
                        className="shrink-0 w-3.5 h-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer"
                        aria-label="Marcar como verificado contra BCP"
                      />
                      <span
                        className={`text-xs truncate pr-3 transition-opacity duration-150 ${
                          isVerified
                            ? "line-through opacity-50 text-gray-500"
                            : "text-gray-700"
                        }`}
                      >
                        {i.client_name
                          ? `Pago de ${i.client_name}`
                          : i.note || "Ingreso"}
                      </span>
                    </label>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-xs font-medium transition-opacity duration-150 ${
                          isVerified
                            ? "line-through opacity-50 text-gray-500"
                            : "text-emerald-600"
                        }`}
                      >
                        +{formatCurrency(i.amount)}
                      </span>
                      <div className="flex items-center gap-0.5 opacity-30 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() =>
                            onEdit({
                              type: "income",
                              id: i.id,
                              date: i.date,
                              amount: i.amount,
                              note: i.note || "",
                              clientId: i.client_id,
                              clientName: i.client_name,
                            })
                          }
                          className="p-1 hover:bg-blue-50 hover:text-blue-600 rounded text-gray-400"
                          aria-label="Editar"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() =>
                            onDelete({
                              type: "income",
                              id: i.id,
                              date: i.date,
                              amount: i.amount,
                              note: i.note || "",
                              clientName: i.client_name,
                            })
                          }
                          className="p-1 hover:bg-red-50 hover:text-red-600 rounded text-gray-400"
                          aria-label="Eliminar"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Egresos */}
        <div>
          <div className="px-4 py-2 bg-red-50/60 border-b border-gray-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase text-red-700 tracking-wide">
                Egresos
              </span>
              <button
                onClick={() => onCreate("expense")}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-red-700 bg-white border border-red-200 rounded hover:bg-red-100 hover:border-red-300 transition-colors"
                title="Agregar egreso a este día"
                aria-label="Agregar egreso a este día"
              >
                <Plus className="w-3 h-3" />
                Egreso
              </button>
              {day.expenses.length > 0 && (
                <span
                  className={`text-[10px] font-medium ${counterCls(day.expenseVerified, day.expenses.length)}`}
                  title="Verificados contra BCP / Total"
                >
                  {day.expenseVerified}/{day.expenses.length} ✓
                </span>
              )}
            </div>
            <span className="text-sm font-bold text-red-700">
              {formatCurrency(day.expenseTotal)}
            </span>
          </div>
          <div className="divide-y divide-gray-50">
            {visibleExpenses.length === 0 ? (
              <div className="px-4 py-6 text-xs text-gray-400 italic text-center">
                {day.expenses.length === 0
                  ? "(sin egresos este día)"
                  : "(todos verificados)"}
              </div>
            ) : (
              visibleExpenses.map((e) => {
                const isVerified = !!e.bcpVerifiedAt;
                return (
                  <div
                    key={e.id}
                    className="group px-4 py-2 hover:bg-gray-50 transition-opacity duration-150"
                  >
                    <div className="flex items-center justify-between">
                      <label
                        className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
                        title={
                          isVerified
                            ? "Verificado contra BCP — click para desmarcar"
                            : "Click para marcar como verificado contra BCP"
                        }
                      >
                        <input
                          type="checkbox"
                          checked={isVerified}
                          onChange={() => onToggleVerify("expense", e.id)}
                          className="shrink-0 w-3.5 h-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer"
                          aria-label="Marcar como verificado contra BCP"
                        />
                        <span
                          className={`text-xs truncate pr-3 transition-opacity duration-150 ${
                            isVerified
                              ? "line-through opacity-50 text-gray-500"
                              : "text-gray-700"
                          }`}
                        >
                          <span
                            className={
                              isVerified ? "" : "font-medium text-gray-900"
                            }
                          >
                            {e.category}
                          </span>
                          <span className="text-gray-400"> · </span>
                          <span>{e.concept}</span>
                        </span>
                      </label>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-xs font-medium transition-opacity duration-150 ${
                            isVerified
                              ? "line-through opacity-50 text-gray-500"
                              : "text-red-600"
                          }`}
                        >
                          −{formatCurrency(e.amount)}
                        </span>
                        <div className="flex items-center gap-0.5 opacity-30 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() =>
                              onEdit({
                                type: "expense",
                                id: e.id,
                                date: e.date,
                                amount: e.amount,
                                category: e.category,
                                concept: e.concept,
                                paymentMethod:
                                  e.payment_method || "transferencia",
                                notes: e.notes,
                              })
                            }
                            className="p-1 hover:bg-blue-50 hover:text-blue-600 rounded text-gray-400"
                            aria-label="Editar"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() =>
                              onDelete({
                                type: "expense",
                                id: e.id,
                                date: e.date,
                                amount: e.amount,
                                category: e.category,
                                concept: e.concept,
                                paymentMethod:
                                  e.payment_method || "transferencia",
                                notes: e.notes,
                              })
                            }
                            className="p-1 hover:bg-red-50 hover:text-red-600 rounded text-gray-400"
                            aria-label="Eliminar"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                    {e.notes && (
                      <div
                        className={`text-[11px] pl-6 mt-0.5 transition-opacity duration-150 ${
                          isVerified
                            ? "line-through opacity-50 text-gray-400"
                            : "text-gray-400"
                        }`}
                      >
                        {e.notes}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
