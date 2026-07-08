"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownCircle, ArrowUpCircle, HandCoins, Plus, X, Trash2, Pencil, AlertTriangle, ArrowRight, Wallet } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { KPICard } from "@/components/ui/KPICard";
import { formatCurrency, formatDate, getToday } from "@/lib/utils";
import { useToast } from "@/components/toast-provider";
import {
  createLoan,
  createRefund,
  createDirectLoanWithExpenses,
  updateLoanMovement,
  deleteLoanMovement,
  type LoanEntry,
  type LoanMovement,
  type LoansSummary,
} from "@/app/actions/loans";
import { getCategories } from "@/app/actions/categories";
import { useEffect } from "react";

type Mode = null | "loan" | "refund";

/** Etiquetas de "¿cómo entró el dinero?" (préstamos). */
const ENTRY_LABELS: Record<LoanEntry, string> = {
  directo: "Directo (Jahnn pagó el gasto)",
  banco: "A la cuenta BCP",
  caja: "A caja (efectivo)",
};
const ENTRY_HINTS: Record<LoanEntry, string> = {
  directo: "Jahnn pagó obligaciones con su dinero. Abajo detallas QUÉ pagó: cada pago queda como gasto real del negocio (sin tocar banco ni caja) y la deuda se registra sola por el total.",
  banco: "Jahnn depositó/transfirió a la cuenta BCP de Atelier. El saldo del banco SÍ sube — luego paga las obligaciones desde el banco como siempre.",
  caja: "Jahnn puso efectivo en la caja física. El saldo de caja SÍ sube.",
};

type DirectItem = { category: string; concept: string; amount: string };
const emptyItem = (): DirectItem => ({ category: "", concept: "", amount: "" });

export function LoansClient({ summary }: { summary: LoansSummary }) {
  const { showToast } = useToast();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [editing, setEditing] = useState<LoanMovement | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<LoanMovement | null>(null);
  const [pending, startTransition] = useTransition();

  const [date, setDate] = useState(getToday());
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"efectivo" | "transferencia" | "yape">("efectivo");
  // Solo préstamos: por dónde entró el dinero. "directo" es el caso
  // histórico más común (Jahnn paga el gasto con su dinero).
  const [entry, setEntry] = useState<LoanEntry>("directo");
  const [concept, setConcept] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Flujo guiado del préstamo DIRECTO: qué pagó Jahnn (gastos 'socio').
  const [items, setItems] = useState<DirectItem[]>([emptyItem()]);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    getCategories().then((cats) =>
      setCategories((cats as { name: string }[]).map((c) => c.name)),
    ).catch(() => setCategories([]));
  }, []);

  const guidedDirect = mode === "loan" && !editing && entry === "directo";
  const itemsTotal = items.reduce((s, it) => {
    const n = parseFloat(it.amount);
    return s + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);

  function resetForm() {
    setDate(getToday());
    setAmount("");
    setPaymentMethod("efectivo");
    setEntry("directo");
    setConcept("");
    setNotes("");
    setItems([emptyItem()]);
    setError(null);
  }

  function closeModal() {
    setMode(null);
    setEditing(null);
    resetForm();
  }

  function openEdit(m: LoanMovement) {
    setEditing(m);
    setMode(m.kind);
    setDate(m.date);
    setAmount(String(m.amount));
    const pm = m.paymentMethod;
    setPaymentMethod(
      pm === "transferencia" || pm === "yape" || pm === "efectivo" ? pm : "efectivo"
    );
    setEntry(m.entry ?? "directo");
    // El concept de un préstamo viene del campo `note` con formato
    // "concepto — notas". Lo separamos cuando es posible para pre-llenar
    // ambos campos. En devoluciones, concept y notes son columnas distintas.
    if (m.kind === "loan") {
      const sep = " — ";
      const idx = m.concept.indexOf(sep);
      if (idx >= 0) {
        setConcept(m.concept.slice(0, idx));
        setNotes(m.concept.slice(idx + sep.length));
      } else {
        setConcept(m.concept);
        setNotes("");
      }
    } else {
      setConcept(m.concept);
      setNotes(m.notes ?? "");
    }
    setError(null);
  }

  async function handleSubmit() {
    setError(null);
    if (!date) {
      setError(
        mode === "loan"
          ? "La fecha del préstamo es obligatoria"
          : "La fecha de la devolución es obligatoria"
      );
      return;
    }
    const today = getToday();
    if (date > today) {
      setError("La fecha no puede ser futura");
      return;
    }

    // Flujo guiado: préstamo directo = gastos pagados por el socio + deuda.
    if (guidedDirect) {
      const clean = items
        .map((it) => ({ category: it.category.trim(), concept: it.concept.trim(), amount: parseFloat(it.amount) }))
        .filter((it) => it.category || it.concept || Number.isFinite(it.amount));
      if (clean.length === 0) {
        setError("Agrega al menos un pago (qué pagó Jahnn, en qué categoría y cuánto)");
        return;
      }
      for (const it of clean) {
        if (!it.category) { setError("Elige la categoría de cada pago"); return; }
        if (!it.concept) { setError("Describe cada pago (ej. Cuota préstamo BCP julio)"); return; }
        if (!Number.isFinite(it.amount) || it.amount <= 0) { setError("Revisa los montos: deben ser mayores a cero"); return; }
      }
      startTransition(async () => {
        const r = await createDirectLoanWithExpenses({
          date,
          items: clean,
          notes: notes.trim() || undefined,
        });
        if (!r.success) { setError(r.error); return; }
        closeModal();
        router.refresh();
      });
      return;
    }

    const amountNum = parseFloat(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError("Ingresa un monto válido mayor a cero");
      return;
    }
    if (!concept.trim()) {
      setError("Describe brevemente el préstamo o devolución");
      return;
    }

    startTransition(async () => {
      try {
        const base = {
          date,
          amount: amountNum,
          concept: concept.trim(),
          notes: notes.trim() || undefined,
        };
        if (editing) {
          const r = await updateLoanMovement(
            editing.id,
            editing.kind,
            editing.kind === "loan" ? { ...base, entry } : { ...base, paymentMethod }
          );
          if (!r.success) {
            setError(r.error);
            return;
          }
        } else if (mode === "loan") {
          await createLoan({ ...base, entry });
        } else if (mode === "refund") {
          await createRefund({ ...base, paymentMethod });
        }
        closeModal();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al guardar");
      }
    });
  }

  function handleConfirmDelete() {
    if (!confirmDelete) return;
    const m = confirmDelete;
    startTransition(async () => {
      const r = await deleteLoanMovement(m.id, m.kind);
      if (r.success) {
        setConfirmDelete(null);
        router.refresh();
      } else {
        // Mantener modal abierto y mostrar error inline
        showToast(r.error, "error");
      }
    });
  }

  const columns: DataTableColumn<LoanMovement>[] = [
    {
      key: "date",
      header: "Fecha",
      width: "w-28",
      sortable: true,
      sortValue: (r) => r.date,
      render: (r) => <span className="text-sm">{formatDate(r.date)}</span>,
    },
    {
      key: "kind",
      header: "Tipo",
      width: "w-32",
      render: (r) =>
        r.kind === "loan" ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
            <ArrowDownCircle className="w-3 h-3" /> Préstamo
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 bg-orange-50 px-2 py-0.5 rounded">
            <ArrowUpCircle className="w-3 h-3" /> Devolución
          </span>
        ),
    },
    {
      key: "concept",
      header: "Concepto",
      render: (r) => (
        <div>
          <div className="text-sm text-gray-900">{r.concept}</div>
          {r.notes && <div className="text-xs text-gray-500 mt-0.5">{r.notes}</div>}
        </div>
      ),
    },
    {
      key: "paymentMethod",
      header: "Método",
      width: "w-36",
      render: (r) =>
        r.kind === "loan" ? (
          <span className="text-xs text-gray-600">
            {ENTRY_LABELS[r.entry ?? "directo"]}
            {r.viaBank && (
              <span className="block text-[10px] text-emerald-600">cuenta en saldo BCP</span>
            )}
          </span>
        ) : (
          <span className="text-xs text-gray-600 capitalize">
            {r.paymentMethod}
            {r.viaBank && (
              <span className="block text-[10px] text-emerald-600">resta del saldo BCP</span>
            )}
          </span>
        ),
    },
    {
      key: "amount",
      header: "Monto",
      align: "right",
      width: "w-32",
      sortable: true,
      sortValue: (r) => r.amount,
      render: (r) => (
        <span className={`text-sm font-medium ${r.kind === "loan" ? "text-emerald-700" : "text-orange-700"}`}>
          {r.kind === "loan" ? "+" : "−"}
          {formatCurrency(r.amount)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "w-20",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => openEdit(r)}
            className="text-gray-400 hover:text-emerald-700 transition-colors p-1"
            aria-label="Editar"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(r)}
            className="text-gray-400 hover:text-red-600 transition-colors p-1"
            aria-label="Eliminar"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <HandCoins className="w-6 h-6" style={{ color: "#C65A3A" }} />
            Préstamos del socio
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Aporte personal de Jahnn a Atelier para liquidez. No afecta ingresos ni EBITDA del negocio.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { resetForm(); setMode("loan"); }}
            className="bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-emerald-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Registrar préstamo
          </button>
          <button
            onClick={() => { resetForm(); setMode("refund"); }}
            disabled={summary.pendingBalance <= 0}
            className="bg-orange-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Registrar devolución
          </button>
        </div>
      </div>

      {/* Cómo funciona — el ciclo completo en una franja */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 text-xs">
          <div className="flex-1 flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
            <ArrowDownCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <div className="font-semibold text-emerald-900">1 · Le prestas a Atelier</div>
              <div className="text-emerald-800/70">Pagas obligaciones directo, o pones plata al banco/caja</div>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-300 shrink-0 self-center rotate-90 sm:rotate-0" />
          <div className="flex-1 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
            <Wallet className="w-4 h-4 text-amber-600 shrink-0" />
            <div>
              <div className="font-semibold text-amber-900">2 · Atelier te debe</div>
              <div className="text-amber-800/70">La deuda queda visible aquí — sin tocar los números del negocio</div>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-300 shrink-0 self-center rotate-90 sm:rotate-0" />
          <div className="flex-1 flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
            <ArrowUpCircle className="w-4 h-4 text-gray-600 shrink-0" />
            <div>
              <div className="font-semibold text-gray-900">3 · Te devuelve</div>
              <div className="text-gray-500">Cuando entren los cobros B2B, registras la devolución</div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard
          title="Saldo pendiente"
          value={formatCurrency(summary.pendingBalance)}
          subtitle="Lo que Atelier debe a Jahnn"
          variant={summary.pendingBalance > 0 ? "warning" : "default"}
        />
        <KPICard
          title="Total prestado"
          value={formatCurrency(summary.totalLoaned)}
          subtitle="Suma histórica de aportes"
        />
        <KPICard
          title="Total devuelto"
          value={formatCurrency(summary.totalRefunded)}
          subtitle="Devoluciones realizadas"
        />
      </div>

      {/* History */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Historial de movimientos</h2>
        <DataTable
          columns={columns}
          data={summary.movements}
          rowKey={(r) => r.id}
          emptyMessage="Sin movimientos registrados todavía. Usa los botones de arriba para registrar el primer préstamo."
        />
      </div>

      {/* Modal */}
      {mode && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={closeModal}>
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {editing
                  ? (mode === "loan" ? "Editar préstamo" : "Editar devolución")
                  : (mode === "loan" ? "Registrar préstamo" : "Registrar devolución")}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-500 mb-4">
              {mode === "loan"
                ? "Jahnn aporta dinero a Atelier. Se registra como deuda pendiente."
                : "Atelier devuelve a Jahnn parte o todo lo prestado."}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {mode === "loan" ? "Fecha del préstamo" : "Fecha de la devolución"}
                </label>
                <input
                  type="date"
                  value={date}
                  max={getToday()}
                  required
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              {!guidedDirect && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Monto (S/)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    autoFocus
                  />
                </div>
              )}
              {mode === "loan" ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ¿Cómo entró el dinero?
                  </label>
                  <select
                    value={entry}
                    onChange={(e) => setEntry(e.target.value as LoanEntry)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    {(Object.keys(ENTRY_LABELS) as LoanEntry[]).map((k) => (
                      <option key={k} value={k}>{ENTRY_LABELS[k]}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-500 mt-1">{ENTRY_HINTS[entry]}</p>

                  {guidedDirect && (
                    <div className="mt-3 space-y-2">
                      <div className="text-sm font-medium text-gray-700">¿Qué pagó Jahnn?</div>
                      {items.map((it, i) => (
                        <div key={i} className="flex gap-1.5 items-start">
                          <select
                            value={it.category}
                            onChange={(e) => setItems((prev) => prev.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)))}
                            className="w-32 border border-gray-300 rounded-lg px-2 py-2 text-xs bg-white"
                          >
                            <option value="">Categoría…</option>
                            {categories.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                          <input
                            value={it.concept}
                            onChange={(e) => setItems((prev) => prev.map((x, j) => (j === i ? { ...x, concept: e.target.value } : x)))}
                            placeholder="Ej: Cuota préstamo BCP julio"
                            className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-xs"
                          />
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={it.amount}
                            onChange={(e) => setItems((prev) => prev.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                            placeholder="0.00"
                            className="w-24 border border-gray-300 rounded-lg px-2 py-2 text-xs text-right"
                          />
                          <button
                            type="button"
                            onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                            disabled={items.length === 1}
                            className="text-gray-300 hover:text-red-500 p-1.5 disabled:opacity-30"
                            aria-label="Quitar pago"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setItems((prev) => [...prev, emptyItem()])}
                          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
                        >
                          <Plus className="w-3.5 h-3.5" /> Agregar otro pago
                        </button>
                        <div className="text-sm">
                          <span className="text-gray-500">Total del préstamo: </span>
                          <span className="font-bold text-gray-900">{formatCurrency(Math.round(itemsTotal * 100) / 100)}</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
                        Cada pago se registra como <strong>gasto real</strong> del negocio (cuenta en presupuesto y EBITDA)
                        con método &ldquo;Pagado por el socio&rdquo; — <strong>sin tocar el saldo del banco ni la caja</strong>.
                        La deuda se crea sola por el total.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Método</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="yape">Yape</option>
                  </select>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {paymentMethod === "efectivo"
                      ? "Sale de la caja física (no toca el banco)."
                      : "Sale de la cuenta BCP: el saldo del banco baja."}
                  </p>
                </div>
              )}
              {!guidedDirect && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Concepto</label>
                  <input
                    type="text"
                    value={concept}
                    onChange={(e) => setConcept(e.target.value)}
                    placeholder={mode === "loan" ? "Ej: Adelanto alquiler abril" : "Ej: Devolución parcial"}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notas <span className="text-gray-400">(opcional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
                />
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg"
                  disabled={pending}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={pending}
                  className={`px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 ${
                    mode === "loan" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-orange-600 hover:bg-orange-700"
                  }`}
                >
                  {pending ? "Guardando..." : (editing ? "Guardar cambios" : "Guardar")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación de eliminación */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => !pending && setConfirmDelete(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900">
                  ¿Eliminar este movimiento?
                </h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Esta acción no se puede deshacer.
                </p>
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm space-y-1 mb-5">
              <div>
                <span className="text-gray-500">Tipo: </span>
                <span className="font-medium text-gray-900">
                  {confirmDelete.kind === "loan" ? "Préstamo" : "Devolución"}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Concepto: </span>
                <span className="text-gray-900">{confirmDelete.concept}</span>
              </div>
              <div>
                <span className="text-gray-500">Monto: </span>
                <span className="font-medium text-gray-900">
                  {formatCurrency(confirmDelete.amount)}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Fecha: </span>
                <span className="text-gray-900">{formatDate(confirmDelete.date)}</span>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={pending}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={pending}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
              >
                {pending ? "Eliminando..." : "Sí, eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
