"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownCircle, ArrowUpCircle, HandCoins, Plus, X, Trash2, Pencil, AlertTriangle } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { KPICard } from "@/components/ui/KPICard";
import { formatCurrency, formatDate, getToday } from "@/lib/utils";
import { useToast } from "@/components/toast-provider";
import {
  createLoan,
  createRefund,
  updateLoanMovement,
  deleteLoanMovement,
  type LoanMovement,
  type LoansSummary,
} from "@/app/actions/loans";

type Mode = null | "loan" | "refund";

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
  const [concept, setConcept] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setDate(getToday());
    setAmount("");
    setPaymentMethod("efectivo");
    setConcept("");
    setNotes("");
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
        const payload = {
          date,
          amount: amountNum,
          paymentMethod,
          concept: concept.trim(),
          notes: notes.trim() || undefined,
        };
        if (editing) {
          const r = await updateLoanMovement(editing.id, editing.kind, payload);
          if (!r.success) {
            setError(r.error);
            return;
          }
        } else if (mode === "loan") {
          await createLoan(payload);
        } else if (mode === "refund") {
          await createRefund(payload);
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
      width: "w-28",
      render: (r) => <span className="text-xs text-gray-600 capitalize">{r.paymentMethod}</span>,
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
              </div>
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
