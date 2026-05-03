"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { KPICard } from "@/components/ui/KPICard";
import { DataTable } from "@/components/ui/DataTable";
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
            ),
          },
        ]}
      />

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
