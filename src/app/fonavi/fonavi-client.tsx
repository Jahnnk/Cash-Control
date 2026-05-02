"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { Plus, History, Wallet } from "lucide-react";
import type { ReceivableRow } from "@/app/actions/fonavi-receivables";
import { ReimbursementModal } from "./reimbursement-modal";
import { ReimbursementHistoryModal } from "./reimbursement-history-modal";

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

export function FonaviClient({ initialReceivables }: { initialReceivables: ReceivableRow[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<"all" | "pending">("pending");
  const [registerFor, setRegisterFor] = useState<ReceivableRow | null>(null);
  const [registerGeneric, setRegisterGeneric] = useState(false);
  const [historyFor, setHistoryFor] = useState<ReceivableRow | null>(null);

  // Si llega ?accion=registrar-reembolso, abrir el modal una vez
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (searchParams.get("accion") === "registrar-reembolso") {
      autoOpenedRef.current = true;
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
        <h1 className="text-2xl font-bold text-gray-900">Cuentas por cobrar a Fonavi</h1>
        <button
          onClick={() => setRegisterGeneric(true)}
          className="bg-violet-600 text-white px-4 py-2 rounded-lg hover:bg-violet-700 flex items-center gap-2 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Registrar reembolso
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 border-l-4 border-l-violet-500 p-5">
          <div className="text-sm text-gray-600 mb-1">Total pendiente de cobro</div>
          <div className={`text-2xl font-bold ${pendingTotal > 0 ? "text-violet-700" : "text-gray-400"}`}>{formatCurrency(pendingTotal)}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="text-sm text-gray-600 mb-1">Cuentas pendientes</div>
          <div className="text-2xl font-bold text-gray-900">{initialReceivables.filter(r => r.status !== "collected").length}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="text-sm text-gray-600 mb-1">Cuentas cobradas</div>
          <div className="text-2xl font-bold text-gray-400">{initialReceivables.filter(r => r.status === "collected").length}</div>
        </div>
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

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            {filter === "pending" ? "No hay cuentas pendientes." : "Sin cuentas registradas."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-left">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Categoría · Concepto</th>
                  <th className="px-4 py-3 font-medium text-right">Total pagado</th>
                  <th className="px-4 py-3 font-medium text-right">Tu parte</th>
                  <th className="px-4 py-3 font-medium text-right">Por cobrar</th>
                  <th className="px-4 py-3 font-medium text-right">Cobrado</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium text-right">Antigüedad</th>
                  <th className="px-4 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5">{formatDateShort(r.expense_date)}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-900">{r.category}</div>
                      <div className="text-xs text-gray-500">{r.concept}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right">{formatCurrency(r.amount_total)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{formatCurrency(r.atelier_amount)}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${r.amount_pending > 0 ? "text-violet-700" : "text-gray-400"}`}>
                      {formatCurrency(r.amount_pending)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-green-700">{formatCurrency(r.amount_collected)}</td>
                    <td className="px-4 py-2.5">{statusBadge(r.status)}</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${agingClass(Math.floor(r.days_old), r.status)}`}>
                      {Math.floor(r.days_old)} d
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        {r.status !== "collected" && (
                          <button
                            onClick={() => setRegisterFor(r)}
                            className="text-xs text-violet-700 hover:underline inline-flex items-center gap-1"
                            title="Registrar reembolso para esta cuenta"
                          >
                            <Wallet className="w-3 h-3" /> Registrar
                          </button>
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(registerGeneric || registerFor) && (
        <ReimbursementModal
          pendingReceivables={initialReceivables.filter((r) => r.status !== "collected")}
          preselectedReceivableId={registerFor?.id}
          onClose={() => { setRegisterFor(null); setRegisterGeneric(false); }}
          onSaved={() => { setRegisterFor(null); setRegisterGeneric(false); router.refresh(); }}
        />
      )}

      {historyFor && (
        <ReimbursementHistoryModal
          receivable={historyFor}
          onClose={() => setHistoryFor(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  );
}
