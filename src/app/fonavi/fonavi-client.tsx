"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { Plus, Loader2 } from "lucide-react";
import type { ReceivableRow } from "@/app/actions/fonavi-receivables";
import { ReimbursementModal } from "./reimbursement-modal";

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
  const [filter, setFilter] = useState<"all" | "pending">("pending");
  const [showModal, setShowModal] = useState(false);

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
          onClick={() => setShowModal(true)}
          className="bg-violet-600 text-white px-4 py-2 rounded-lg hover:bg-violet-700 flex items-center gap-2 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Registrar reembolso
        </button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 border-l-4 border-l-violet-500 p-5">
          <div className="text-sm text-gray-600 mb-1">Total pendiente de cobro</div>
          <div className="text-2xl font-bold text-violet-700">{formatCurrency(pendingTotal)}</div>
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

      {/* Filtro */}
      <div className="flex gap-2">
        <button
          onClick={() => setFilter("pending")}
          className={`px-3 py-1.5 rounded-md text-sm font-medium ${filter === "pending" ? "bg-primary text-white" : "bg-white text-gray-600 border border-gray-200"}`}
        >
          Pendientes
        </button>
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1.5 rounded-md text-sm font-medium ${filter === "all" ? "bg-primary text-white" : "bg-white text-gray-600 border border-gray-200"}`}
        >
          Todas
        </button>
      </div>

      {/* Tabla */}
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
                    <td className="px-4 py-2.5 text-right font-semibold text-violet-700">{formatCurrency(r.amount_due)}</td>
                    <td className="px-4 py-2.5 text-right text-green-700">{formatCurrency(r.amount_collected)}</td>
                    <td className="px-4 py-2.5">{statusBadge(r.status)}</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${agingClass(Math.floor(r.days_old), r.status)}`}>
                      {Math.floor(r.days_old)} d
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <ReimbursementModal
          pendingReceivables={initialReceivables.filter((r) => r.status !== "collected")}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); router.refresh(); }}
        />
      )}
    </div>
  );
}
