"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { KPICard } from "@/components/ui/KPICard";
import { DataTable } from "@/components/ui/DataTable";
import { Plus, History, Wallet, CheckCircle2, AlertTriangle, X, Pencil, Paperclip } from "lucide-react";
import type { ReceivableRow } from "@/app/actions/fonavi-receivables";
import { markReceivableAsCollected, updateReceivableAmount } from "@/app/actions/fonavi-receivables";
import { AttachmentsModal } from "@/components/attachments/attachments-modal";
import { getAttachmentCounts } from "@/app/actions/attachments";
import { ReimbursementModal } from "./reimbursement-modal";
import { ReimbursementHistoryModal } from "./reimbursement-history-modal";
import { PartnerReportModal } from "./partner-report-modal";
import { FileDown } from "lucide-react";

function statusBadge(status: ReceivableRow["status"]) {
  if (status === "collected") return <span className="px-2 py-0.5 rounded-full text-[11px] bg-green-100 text-green-700">Cobrado</span>;
  if (status === "partial") return <span className="px-2 py-0.5 rounded-full text-[11px] bg-amber-100 text-amber-700">Parcial</span>;
  return <span className="px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-700">Pendiente</span>;
}

function agingClass(days: number, status: string) {
  if (status === "collected") return "text-gray-400";
  if (days <= 7) return "text-green-600";
  if (days <= 15) return "text-amber-600";
  if (days <= 30) return "text-orange-600";
  return "text-red-600";
}

export type DebtorInfo = { id: 2 | 3; name: string };

export function FonaviClient({ initialReceivables, debtor }: { initialReceivables: ReceivableRow[]; debtor: DebtorInfo }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<"all" | "pending">("pending");
  const [registerFor, setRegisterFor] = useState<ReceivableRow | null>(null);
  const [partnerReportOpen, setPartnerReportOpen] = useState(false);
  const [registerGeneric, setRegisterGeneric] = useState(false);
  const [historyFor, setHistoryFor] = useState<ReceivableRow | null>(null);
  const [markCollectedFor, setMarkCollectedFor] = useState<ReceivableRow | null>(null);
  const [editAmountFor, setEditAmountFor] = useState<ReceivableRow | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [markError, setMarkError] = useState<string | null>(null);
  // Constancia del gasto por fila (clave = expense_id). Aparece en el reporte.
  const [attachFor, setAttachFor] = useState<{ expenseId: string; title: string } | null>(null);
  const [attachCounts, setAttachCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const ids = [...new Set(initialReceivables.map((r) => r.expense_id))];
    if (ids.length) getAttachmentCounts("expense", ids).then(setAttachCounts);
  }, [initialReceivables]);

  function handleMarkAsCollected() {
    if (!markCollectedFor) return;
    setMarkError(null);
    const id = markCollectedFor.id;
    startTransition(async () => {
      const r = await markReceivableAsCollected(id);
      if (r.success) {
        setMarkCollectedFor(null);
        router.refresh();
      } else {
        setMarkError(r.error);
      }
    });
  }

  function openEditAmount(r: ReceivableRow) {
    setEditError(null);
    setEditValue(String(r.amount_due));
    setEditAmountFor(r);
  }

  function handleEditAmount() {
    if (!editAmountFor) return;
    setEditError(null);
    const amount = parseFloat(editValue);
    if (!Number.isFinite(amount) || amount <= 0) {
      setEditError("Ingresa un monto válido mayor a cero");
      return;
    }
    const id = editAmountFor.id;
    startTransition(async () => {
      const r = await updateReceivableAmount(id, amount);
      if (r.ok) {
        setEditAmountFor(null);
        router.refresh();
      } else {
        setEditError(r.error);
      }
    });
  }

  // Tope editable = parte de Atelier + parte actual del deudor (lo que pagó
  // Atelier menos la parte fija del otro local). La parte de Atelier absorbe
  // la diferencia, así que el total que pagó Atelier nunca cambia.
  const editMax = editAmountFor
    ? Math.round((editAmountFor.atelier_amount + editAmountFor.amount_due) * 100) / 100
    : 0;

  // Si llega ?accion=registrar-reembolso, abrir el modal una vez
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (searchParams.get("accion") === "registrar-reembolso") {
      autoOpenedRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intencional: auto-open por query param al primer mount
      setRegisterGeneric(true);
    }
  }, [searchParams]);

  const filtered = filter === "pending"
    ? initialReceivables.filter((r) => r.status !== "collected")
    : initialReceivables;

  const pendingTotal = initialReceivables
    .filter((r) => r.status !== "collected")
    .reduce((s, r) => s + r.amount_pending, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Cuentas por cobrar a {debtor.name}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPartnerReportOpen(true)}
            className="border border-violet-200 text-violet-700 bg-violet-50 hover:bg-violet-100 px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium"
            title="PDF del mes con gastos compartidos, reembolsos y constancias adjuntas"
          >
            <FileDown className="w-4 h-4" />
            Reporte para socia
          </button>
          <button
            onClick={() => setRegisterGeneric(true)}
            className="bg-violet-600 text-white px-4 py-2 rounded-lg hover:bg-violet-700 flex items-center gap-2 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Registrar reembolso
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard
          title="Total pendiente de cobro"
          value={formatCurrency(pendingTotal)}
          variant="violet"
          dim={pendingTotal === 0}
        />
        <KPICard
          title="Cuentas pendientes"
          value={initialReceivables.filter(r => r.status !== "collected").length}
          variant="default"
          withAccentBar={false}
        />
        <KPICard
          title="Cuentas cobradas"
          value={initialReceivables.filter(r => r.status === "collected").length}
          variant="default"
          withAccentBar={false}
          dim
        />
      </div>

      <div className="flex gap-2">
        <button onClick={() => setFilter("pending")}
          className={`px-3 py-1.5 rounded-md text-sm font-medium ${filter === "pending" ? "bg-primary text-white" : "bg-white text-gray-600 border border-gray-200"}`}>
          Pendientes
        </button>
        <button onClick={() => setFilter("all")}
          className={`px-3 py-1.5 rounded-md text-sm font-medium ${filter === "all" ? "bg-primary text-white" : "bg-white text-gray-600 border border-gray-200"}`}>
          Todas
        </button>
      </div>

      <DataTable
        rowKey={(r) => r.id}
        data={filtered}
        emptyMessage={filter === "pending" ? "No hay cuentas pendientes." : "Sin cuentas registradas."}
        columns={[
          { key: "expense_date", header: "Fecha", render: (r) => formatDateShort(r.expense_date) },
          {
            key: "category",
            header: "Categoría · Concepto",
            render: (r) => (
              <>
                <div className="font-medium text-gray-900">{r.category}</div>
                <div className="text-xs text-gray-500">{r.concept}</div>
              </>
            ),
          },
          { key: "amount_total", header: "Total pagado", align: "right", render: (r) => formatCurrency(r.amount_total) },
          {
            key: "atelier_amount",
            header: "Tu parte",
            align: "right",
            cellClassName: "text-gray-700",
            render: (r) => formatCurrency(r.atelier_amount),
          },
          {
            key: "amount_pending",
            header: "Por cobrar",
            align: "right",
            render: (r) => (
              <span className={`font-semibold ${r.amount_pending > 0 ? "text-violet-700" : "text-gray-400"}`}>
                {formatCurrency(r.amount_pending)}
              </span>
            ),
          },
          {
            key: "amount_collected",
            header: "Cobrado",
            align: "right",
            cellClassName: "text-green-700",
            render: (r) => formatCurrency(r.amount_collected),
          },
          { key: "status", header: "Estado", render: (r) => statusBadge(r.status) },
          {
            key: "days_old",
            header: "Antigüedad",
            align: "right",
            render: (r) => (
              <span className={`font-medium ${agingClass(Math.floor(r.days_old), r.status)}`}>
                {Math.floor(r.days_old)} d
              </span>
            ),
          },
          {
            key: "actions",
            header: "Acciones",
            align: "right",
            render: (r) => (
              <div className="inline-flex items-center gap-2">
                <button
                  onClick={() => setAttachFor({ expenseId: r.expense_id, title: `${r.category} · ${r.concept}` })}
                  className={`text-xs hover:underline inline-flex items-center gap-1 ${attachCounts[r.expense_id] ? "text-violet-700 font-medium" : "text-gray-500"}`}
                  title="Adjuntar constancia de este gasto (imagen o PDF). Aparece en el reporte para socia."
                >
                  <Paperclip className="w-3 h-3" />
                  Constancia{attachCounts[r.expense_id] ? ` (${attachCounts[r.expense_id]})` : ""}
                </button>
                {r.status !== "collected" && (
                  <>
                    <button
                      onClick={() => setRegisterFor(r)}
                      className="text-xs text-violet-700 hover:underline inline-flex items-center gap-1"
                      title="Registrar reembolso para esta cuenta"
                    >
                      <Wallet className="w-3 h-3" /> Registrar
                    </button>
                    {r.amount_collected === 0 && (
                      <button
                        onClick={() => openEditAmount(r)}
                        className="text-xs text-blue-700 hover:underline inline-flex items-center gap-1"
                        title="Editar cuánto debe este local por este gasto (no mueve los saldos del banco)"
                      >
                        <Pencil className="w-3 h-3" /> Editar
                      </button>
                    )}
                    <button
                      onClick={() => { setMarkError(null); setMarkCollectedFor(r); }}
                      className="text-xs text-emerald-700 hover:underline inline-flex items-center gap-1"
                      title="Marcar como cobrado sin generar ingreso (si el pago ya fue registrado antes)"
                    >
                      <CheckCircle2 className="w-3 h-3" /> Marcar cobrado
                    </button>
                  </>
                )}
                {r.amount_collected > 0 && (
                  <button
                    onClick={() => setHistoryFor(r)}
                    className="text-xs text-gray-600 hover:underline inline-flex items-center gap-1"
                    title="Ver historial de reembolsos"
                  >
                    <History className="w-3 h-3" /> Historial
                  </button>
                )}
              </div>
            ),
          },
        ]}
      />

      {(registerGeneric || registerFor) && (
        <ReimbursementModal
          debtorName={debtor.name}
          pendingReceivables={initialReceivables.filter((r) => r.status !== "collected")}
          preselectedReceivableId={registerFor?.id}
          onClose={() => { setRegisterFor(null); setRegisterGeneric(false); }}
          onSaved={() => { setRegisterFor(null); setRegisterGeneric(false); router.refresh(); }}
        />
      )}

      {attachFor && (
        <AttachmentsModal
          recordType="expense"
          recordId={attachFor.expenseId}
          title={attachFor.title}
          onClose={() => setAttachFor(null)}
          onCountChange={(n) => setAttachCounts((p) => ({ ...p, [attachFor.expenseId]: n }))}
        />
      )}

      {partnerReportOpen && (
        <PartnerReportModal debtor={debtor} onClose={() => setPartnerReportOpen(false)} />
      )}
      {historyFor && (
        <ReimbursementHistoryModal
          receivable={historyFor}
          onClose={() => setHistoryFor(null)}
          onChanged={() => router.refresh()}
        />
      )}

      {editAmountFor && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => !pending && setEditAmountFor(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                  <Pencil className="w-5 h-5 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Editar cuánto debe {debtor.name}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Cambia solo lo que {debtor.name} te debe por este gasto.
                    <strong> No mueve el saldo del banco</strong> (ni el tuyo ni el de {debtor.name}).
                  </p>
                </div>
              </div>
              <button
                onClick={() => !pending && setEditAmountFor(null)}
                className="text-gray-400 hover:text-gray-600 shrink-0"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm space-y-1 mb-4">
              <div><span className="text-gray-500">Concepto: </span><span className="text-gray-900">{editAmountFor.concept}</span></div>
              <div><span className="text-gray-500">Total que pagó Atelier: </span><span className="font-medium text-gray-900">{formatCurrency(editAmountFor.amount_total)}</span></div>
              <div><span className="text-gray-500">Debe ahora: </span><span className="text-gray-900">{formatCurrency(editAmountFor.amount_due)}</span></div>
            </div>

            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nuevo monto que debe {debtor.name} (S/)
            </label>
            <input
              type="number" inputMode="decimal" min="0.01" max={editMax} step="0.01"
              value={editValue}
              autoFocus
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="0.00"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Máximo S/{editMax.toFixed(2)} (lo que pagó Atelier menos la parte del otro local).
              La diferencia la absorbe Atelier.
            </p>

            {editError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-4">
                {editError}
              </div>
            )}

            <div className="flex gap-2 justify-end pt-5">
              <button
                onClick={() => setEditAmountFor(null)}
                disabled={pending}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleEditAmount}
                disabled={pending}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
              >
                {pending ? "Guardando..." : "Guardar monto"}
              </button>
            </div>
          </div>
        </div>
      )}

      {markCollectedFor && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => !pending && setMarkCollectedFor(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Marcar como cobrado
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Esta opción marca la CxC como cobrada <strong>sin generar un ingreso nuevo</strong>.
                    Úsala cuando el pago ya fue registrado previamente como ingreso normal.
                  </p>
                </div>
              </div>
              <button
                onClick={() => !pending && setMarkCollectedFor(null)}
                className="text-gray-400 hover:text-gray-600 shrink-0"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm space-y-1 mb-5">
              <div>
                <span className="text-gray-500">Categoría: </span>
                <span className="font-medium text-gray-900">{markCollectedFor.category}</span>
              </div>
              <div>
                <span className="text-gray-500">Concepto: </span>
                <span className="text-gray-900">{markCollectedFor.concept}</span>
              </div>
              <div>
                <span className="text-gray-500">Monto a cerrar: </span>
                <span className="font-medium text-gray-900">{formatCurrency(markCollectedFor.amount_pending)}</span>
              </div>
              <div>
                <span className="text-gray-500">Fecha del gasto: </span>
                <span className="text-gray-900">{formatDateShort(markCollectedFor.expense_date)}</span>
              </div>
            </div>

            {markError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
                {markError}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setMarkCollectedFor(null)}
                disabled={pending}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleMarkAsCollected}
                disabled={pending}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
              >
                {pending ? "Marcando..." : "Sí, marcar como cobrado"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
