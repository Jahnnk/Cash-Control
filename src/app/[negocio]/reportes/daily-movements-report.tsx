"use client";

import { useState, useEffect, useCallback, useMemo, type ReactNode, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import { getDailyBreakdown } from "@/app/actions/reports";
import { getCategories } from "@/app/actions/categories";
import { getClients } from "@/app/actions/clients";
import { getAvailableMonthRange } from "@/app/actions/month-range";
import {
  toggleBcpVerifiedIncome,
  toggleBcpVerifiedExpense,
} from "@/app/actions/bcp-verification";
import { moveBankIncomeItem } from "@/app/actions/bank-income";
import { moveExpenseItem } from "@/app/actions/expenses";
import { reorderColumn } from "@/lib/dnd-reorder";
import { useBankBalance } from "@/hooks/useBankBalance";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { MonthSelector } from "@/components/ui/MonthSelector";
import { Pencil, Trash2, Plus, CheckCircle2, Paperclip, GripVertical, X as XIcon } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/** id de columna-día para el DnD: `inc__<fecha>` / `exp__<fecha>`. */
function colId(type: "income" | "expense", date: string): string {
  return `${type === "income" ? "inc" : "exp"}__${date}`;
}
function parseColId(id: string): { type: "income" | "expense"; date: string } | null {
  const m = /^(inc|exp)__(\d{4}-\d{2}-\d{2})$/.exec(id);
  if (!m) return null;
  return { type: m[1] === "inc" ? "income" : "expense", date: m[2] };
}
import { EditRecordModal, type EditTarget } from "./edit-record-modal";
import { DeleteRecordModal, type DeleteTarget } from "./delete-record-modal";
import { useToast } from "@/components/toast-provider";
import { AttachmentsModal } from "@/components/attachments/attachments-modal";
import { getAttachmentCounts, type AttachmentRecordType } from "@/app/actions/attachments";
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
  payment_method: string | null;
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
  // Condición de compartido (para editar desde el modal; solo Atelier)
  is_shared?: boolean;
  shared_rule_id?: string | null;
  fonavi_amount?: number | null;
  centro_amount?: number | null;
  linked_atelier_expense_id?: string | null;
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

  // Saldo banco HOY — misma fuente que el Dashboard (useBankBalance →
  // getUnifiedBankBalance). NO es un cálculo nuevo: garantiza que el
  // número coincida siempre con el Dashboard. Es el saldo actual del
  // BCP, independiente del mes navegado. Tras cada mutación se llama
  // bank.refresh() (mismo patrón que Dashboard/BankBalanceCard).
  const bank = useBankBalance();
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
  // Adjuntos: target del modal + conteos por movimiento (clave "tipo:id")
  const [attachTarget, setAttachTarget] = useState<{ recordType: AttachmentRecordType; recordId: string; title: string } | null>(null);
  const [attachCounts, setAttachCounts] = useState<Record<string, number>>({});
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [createTarget, setCreateTarget] = useState<CreateTarget | null>(null);
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const { showToast } = useToast();


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
          payment_method: (r.payment_method as string) || null,
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
          is_shared: !!r.is_shared,
          shared_rule_id: (r.shared_rule_id as string) || null,
          fonavi_amount: r.fonavi_amount != null ? Number(r.fonavi_amount) : null,
          centro_amount: r.centro_amount != null ? Number(r.centro_amount) : null,
          linked_atelier_expense_id: (r.linked_atelier_expense_id as string) || null,
        })),
      );
    } else {
      setExpenses([]);
    }
    setLoading(false);

    // Conteos de adjuntos en lote (una query por tipo) para el clip del feed
    const incIds = inc.format === "income" ? inc.rows.map((r) => r.id as string) : [];
    const expIds = exp.format === "expense" ? exp.rows.map((r) => r.id as string) : [];
    const [incCounts, expCounts] = await Promise.all([
      getAttachmentCounts("income", incIds),
      getAttachmentCounts("expense", expIds),
    ]);
    const merged: Record<string, number> = {};
    for (const [id, n] of Object.entries(incCounts)) merged[`income:${id}`] = n;
    for (const [id, n] of Object.entries(expCounts)) merged[`expense:${id}`] = n;
    setAttachCounts(merged);
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
        showToast(result.error || "Error al actualizar", "error");
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

  // ── Selección para sumar (independiente por tipo, cruza días) ──
  const [selectedIncome, setSelectedIncome] = useState<Set<string>>(new Set());
  const [selectedExpense, setSelectedExpense] = useState<Set<string>>(new Set());
  const toggleSelect = useCallback((type: "income" | "expense", id: string) => {
    const setter = type === "income" ? setSelectedIncome : setSelectedExpense;
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  // Filas seleccionadas que AÚN existen (tras recargar, los ids viejos
  // simplemente no cuentan — sin efecto de limpieza ni cascada de renders).
  const selectedIncomeRows = useMemo(
    () => incomes.filter((i) => selectedIncome.has(i.id)),
    [incomes, selectedIncome],
  );
  const selectedExpenseRows = useMemo(
    () => expenses.filter((e) => selectedExpense.has(e.id)),
    [expenses, selectedExpense],
  );
  const selectedIncomeSum = selectedIncomeRows.reduce((s, i) => s + i.amount, 0);
  const selectedExpenseSum = selectedExpenseRows.reduce((s, e) => s + e.amount, 0);

  // ── Drag & drop: reordenar dentro del día y mover entre días ──
  // Sensores: en escritorio arranca tras 6px de arrastre (no estorba clicks);
  // en táctil, tras mantener presionado 200ms (no choca con el scroll).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;
      const activeId = String(active.id);
      const overRaw = String(over.id);
      if (overRaw === activeId) return;

      // Tipo + fecha de origen del item arrastrado.
      const inc = incomes.find((i) => i.id === activeId);
      const exp = expenses.find((e) => e.id === activeId);
      const type: "income" | "expense" | null = inc ? "income" : exp ? "expense" : null;
      if (!type) return;
      const fromDate = (inc ?? exp)!.date;

      // Destino: el 'over' puede ser otra fila (item) o una columna vacía.
      let targetType: "income" | "expense";
      let targetDate: string;
      let overItemId: string | null;
      const parsedCol = parseColId(overRaw);
      if (parsedCol) {
        targetType = parsedCol.type;
        targetDate = parsedCol.date;
        overItemId = null;
      } else {
        const oInc = incomes.find((i) => i.id === overRaw);
        const oExp = expenses.find((e) => e.id === overRaw);
        if (oInc) { targetType = "income"; targetDate = oInc.date; }
        else if (oExp) { targetType = "expense"; targetDate = oExp.date; }
        else return;
        overItemId = overRaw;
      }

      // No se puede convertir un ingreso en egreso (ni viceversa).
      if (targetType !== type) {
        showToast("No puedes mover un ingreso a egresos ni al revés.", "error");
        return;
      }
      if (targetDate === fromDate && (overItemId === activeId || overItemId === null)) return;

      const rows = type === "income" ? incomes : expenses;
      const fullIds = rows.filter((r) => r.date === targetDate).map((r) => r.id);
      const newOrder = reorderColumn(fullIds, activeId, overItemId);
      const dateChanged = targetDate !== fromDate;

      // Update optimista (snapshot para revertir si el server falla).
      const prevIncomes = incomes;
      const prevExpenses = expenses;
      const reorderArr = <T extends { id: string; date: string }>(curr: T[]): T[] => {
        const updated = curr.map((r) =>
          r.id === activeId ? { ...r, date: targetDate } : r,
        );
        const target = newOrder
          .map((id) => updated.find((r) => r.id === id))
          .filter(Boolean) as T[];
        const others = updated.filter((r) => r.date !== targetDate);
        return [...others, ...target];
      };
      if (type === "income") setIncomes(reorderArr);
      else setExpenses(reorderArr);

      const result =
        type === "income"
          ? await moveBankIncomeItem({ id: activeId, toDate: targetDate, orderedIds: newOrder })
          : await moveExpenseItem({ id: activeId, toDate: targetDate, orderedIds: newOrder });

      if (!result.ok) {
        setIncomes(prevIncomes);
        setExpenses(prevExpenses);
        showToast(result.error, "error");
        return;
      }
      // Mover entre días re-fecha el movimiento → refrescar el saldo del banco.
      if (dateChanged) await bank.refresh();
    },
    [incomes, expenses, bank, showToast],
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
              <div title="Saldo actual del banco — no cambia con el mes navegado">
                <div className="text-gray-500 text-xs uppercase tracking-wide">
                  Saldo banco hoy
                </div>
                <div className="font-semibold text-base text-gray-900">
                  {bank.isLoading ? "—" : formatCurrency(bank.current)}
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
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <div className="space-y-6">
                {visibleDays.map((d) => (
                  <DayCard
                    onAttach={(recordType, recordId, title) => setAttachTarget({ recordType, recordId, title })}
                    attachCounts={attachCounts}
                    key={d.date}
                    day={d}
                    hideVerified={hideVerified}
                    onEdit={setEditTarget}
                    onDelete={setDeleteTarget}
                    onCreate={(type) =>
                      setCreateTarget({ type, date: d.date, dateLocked: true })
                    }
                    onToggleVerify={toggleVerify}
                    selectedIncome={selectedIncome}
                    selectedExpense={selectedExpense}
                    onToggleSelect={toggleSelect}
                  />
                ))}
              </div>
            </DndContext>
          )}
        </>
      )}

      {/* Barras de suma de selección (aparecen solo si hay algo marcado) */}
      {(selectedIncomeRows.length > 0 || selectedExpenseRows.length > 0) && (
        <div className="sticky bottom-3 z-30 flex flex-col items-center gap-2 pointer-events-none">
          {selectedIncomeRows.length > 0 && (
            <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-emerald-200 bg-white/95 backdrop-blur px-4 py-2 shadow-lg">
              <span className="text-xs text-gray-500">
                {selectedIncomeRows.length} ingreso{selectedIncomeRows.length === 1 ? "" : "s"} ·
              </span>
              <span className="text-sm font-bold text-emerald-600">
                Suma: {formatCurrency(selectedIncomeSum)}
              </span>
              <button
                onClick={() => setSelectedIncome(new Set())}
                className="text-gray-400 hover:text-gray-700 p-0.5 rounded hover:bg-gray-100"
                aria-label="Limpiar selección de ingresos"
                title="Limpiar selección"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {selectedExpenseRows.length > 0 && (
            <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-red-200 bg-white/95 backdrop-blur px-4 py-2 shadow-lg">
              <span className="text-xs text-gray-500">
                {selectedExpenseRows.length} egreso{selectedExpenseRows.length === 1 ? "" : "s"} ·
              </span>
              <span className="text-sm font-bold text-red-600">
                Suma: {formatCurrency(selectedExpenseSum)}
              </span>
              <button
                onClick={() => setSelectedExpense(new Set())}
                className="text-gray-400 hover:text-gray-700 p-0.5 rounded hover:bg-gray-100"
                aria-label="Limpiar selección de egresos"
                title="Limpiar selección"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {attachTarget && (
        <AttachmentsModal
          recordType={attachTarget.recordType}
          recordId={attachTarget.recordId}
          title={attachTarget.title}
          onClose={() => setAttachTarget(null)}
          onCountChange={(n) =>
            setAttachCounts((prev) => ({ ...prev, [`${attachTarget.recordType}:${attachTarget.recordId}`]: n }))
          }
        />
      )}
      {editTarget && (
        <EditRecordModal
          target={editTarget}
          categories={categories}
          clients={clients}
          onClose={() => setEditTarget(null)}
          onSaved={async () => {
            await Promise.all([loadData(), bank.refresh()]);
            setEditTarget(null);
            showToast("Cambios guardados", "success");
          }}
        />
      )}
      {deleteTarget && (
        <DeleteRecordModal
          target={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={async () => {
            await Promise.all([loadData(), bank.refresh()]);
            setDeleteTarget(null);
            showToast("Movimiento eliminado", "success");
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
            await Promise.all([loadData(), bank.refresh()]);
            showToast(wasIncome ? "Ingreso registrado" : "Egreso registrado", "success");
          }}
        />
      )}

    </div>
  );
}

/** Columna-día que acepta soltar (incluso vacía). */
function DroppableColumn({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`divide-y divide-gray-50 min-h-[2.75rem] transition-colors ${isOver ? "bg-primary/5" : ""}`}
    >
      {children}
    </div>
  );
}

/**
 * Fila arrastrable. El "asa" (⠿) lleva los listeners de arrastre; el resto
 * de la fila sigue clickeable (casillas, lápiz, papelera). El asa se entrega
 * vía render-prop para colocarla dentro del contenido de la fila.
 */
function SortableRow({
  id,
  children,
}: {
  id: string;
  children: (handleProps: Record<string, unknown>) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
    zIndex: isDragging ? 10 : undefined,
    position: isDragging ? "relative" : undefined,
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ ...attributes, ...listeners })}
    </div>
  );
}

/** Asa de arrastre reutilizable (mismo look en ingresos y egresos). */
function DragHandle({ handleProps }: { handleProps: Record<string, unknown> }) {
  return (
    <button
      {...handleProps}
      className="self-stretch flex items-center px-1.5 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none shrink-0"
      aria-label="Arrastrar para reordenar o mover a otro día"
      title="Arrastrar para reordenar o mover a otro día"
    >
      <GripVertical className="w-3.5 h-3.5" />
    </button>
  );
}

/** Casilla para sumar (al costado del monto). Distinta de la de verificado. */
function SumCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="shrink-0 w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer"
      aria-label="Seleccionar para sumar"
      title="Seleccionar este monto para sumarlo abajo"
    />
  );
}

function DayCard({
  day,
  hideVerified,
  onEdit,
  onDelete,
  onCreate,
  onToggleVerify,
  onAttach,
  attachCounts,
  selectedIncome,
  selectedExpense,
  onToggleSelect,
}: {
  day: DayBlock;
  hideVerified: boolean;
  onEdit: (t: EditTarget) => void;
  onDelete: (t: DeleteTarget) => void;
  onCreate: (type: "income" | "expense") => void;
  onToggleVerify: (type: "income" | "expense", id: string) => void;
  onAttach: (recordType: "income" | "expense", recordId: string, title: string) => void;
  attachCounts: Record<string, number>;
  selectedIncome: Set<string>;
  selectedExpense: Set<string>;
  onToggleSelect: (type: "income" | "expense", id: string) => void;
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
          <SortableContext items={visibleIncomes.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <DroppableColumn id={colId("income", day.date)}>
            {visibleIncomes.length === 0 ? (
              <div className="px-4 py-6 text-xs text-gray-400 italic text-center">
                {day.incomes.length === 0
                  ? "(sin ingresos este día)"
                  : "(todos verificados)"}
              </div>
            ) : (
              visibleIncomes.map((i) => {
                const isVerified = !!i.bcpVerifiedAt;
                const isSel = selectedIncome.has(i.id);
                return (
                  <SortableRow key={i.id} id={i.id}>
                    {(handleProps) => (
                  <div
                    className={`group flex items-center justify-between pr-4 py-2 transition-opacity duration-150 ${isSel ? "bg-primary/5" : "hover:bg-gray-50"}`}
                  >
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                    <DragHandle handleProps={handleProps} />
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
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <SumCheckbox checked={isSel} onChange={() => onToggleSelect("income", i.id)} />
                      <span
                        className={`text-xs font-medium transition-opacity duration-150 ${
                          isVerified
                            ? "line-through opacity-50 text-gray-500"
                            : "text-emerald-600"
                        }`}
                      >
                        +{formatCurrency(i.amount)}
                      </span>
                      <div className="flex items-center gap-0.5 opacity-30 group-hover:opacity-100 pointer-coarse:opacity-100 transition-opacity">
                        <button
                          onClick={() => onAttach("income", i.id, i.client_name ? `Pago de ${i.client_name}` : (i.note || "Ingreso"))}
                          className={`p-1 rounded relative ${attachCounts[`income:${i.id}`] ? "text-violet-600 hover:bg-violet-50" : "text-gray-400 hover:bg-violet-50 hover:text-violet-600"}`}
                          aria-label="Constancias adjuntas"
                          title="Constancias (imagen del pago / PDF)"
                        >
                          <Paperclip className="w-3 h-3" />
                          {(attachCounts[`income:${i.id}`] ?? 0) > 0 && (
                            <span className="absolute -top-1 -right-1 text-[8px] bg-violet-600 text-white rounded-full w-3 h-3 flex items-center justify-center leading-none">
                              {attachCounts[`income:${i.id}`]}
                            </span>
                          )}
                        </button>
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
                              paymentMethod: i.payment_method || "transferencia",
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
                    )}
                  </SortableRow>
                );
              })
            )}
            </DroppableColumn>
          </SortableContext>
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
          <SortableContext items={visibleExpenses.map((e) => e.id)} strategy={verticalListSortingStrategy}>
            <DroppableColumn id={colId("expense", day.date)}>
            {visibleExpenses.length === 0 ? (
              <div className="px-4 py-6 text-xs text-gray-400 italic text-center">
                {day.expenses.length === 0
                  ? "(sin egresos este día)"
                  : "(todos verificados)"}
              </div>
            ) : (
              visibleExpenses.map((e) => {
                const isVerified = !!e.bcpVerifiedAt;
                const isSel = selectedExpense.has(e.id);
                return (
                  <SortableRow key={e.id} id={e.id}>
                    {(handleProps) => (
                  <div
                    className={`group pr-4 py-2 transition-opacity duration-150 ${isSel ? "bg-primary/5" : "hover:bg-gray-50"}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                      <DragHandle handleProps={handleProps} />
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
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <SumCheckbox checked={isSel} onChange={() => onToggleSelect("expense", e.id)} />
                        <span
                          className={`text-xs font-medium transition-opacity duration-150 ${
                            isVerified
                              ? "line-through opacity-50 text-gray-500"
                              : "text-red-600"
                          }`}
                        >
                          −{formatCurrency(e.amount)}
                        </span>
                        <div className="flex items-center gap-0.5 opacity-30 group-hover:opacity-100 pointer-coarse:opacity-100 transition-opacity">
                          <button
                            onClick={() => onAttach("expense", e.id, e.concept || e.category)}
                            className={`p-1 rounded relative ${attachCounts[`expense:${e.id}`] ? "text-violet-600 hover:bg-violet-50" : "text-gray-400 hover:bg-violet-50 hover:text-violet-600"}`}
                            aria-label="Constancias adjuntas"
                            title="Constancias (imagen del pago / PDF)"
                          >
                            <Paperclip className="w-3 h-3" />
                            {(attachCounts[`expense:${e.id}`] ?? 0) > 0 && (
                              <span className="absolute -top-1 -right-1 text-[8px] bg-violet-600 text-white rounded-full w-3 h-3 flex items-center justify-center leading-none">
                                {attachCounts[`expense:${e.id}`]}
                              </span>
                            )}
                          </button>
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
                                isShared: !!e.is_shared,
                                sharedRuleId: e.shared_rule_id ?? null,
                                fonaviAmount: e.fonavi_amount ?? null,
                                centroAmount: e.centro_amount ?? null,
                                isMirror: !!e.linked_atelier_expense_id,
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
                        className={`text-[11px] pl-8 mt-0.5 transition-opacity duration-150 ${
                          isVerified
                            ? "line-through opacity-50 text-gray-400"
                            : "text-gray-400"
                        }`}
                      >
                        {e.notes}
                      </div>
                    )}
                  </div>
                    )}
                  </SortableRow>
                );
              })
            )}
            </DroppableColumn>
          </SortableContext>
        </div>
      </div>
    </div>
  );
}
