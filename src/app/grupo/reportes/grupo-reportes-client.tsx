"use client";

import { DataTable } from "@/components/ui/DataTable";
import { formatCurrency } from "@/lib/utils";
import type { BusinessSummary } from "@/app/actions/grupo";

type Props = {
  selectedMonth: string;
  isCurrentMonth: boolean;
  summaries: BusinessSummary[];
};

export function GrupoReportesClient({ selectedMonth, isCurrentMonth, summaries }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reportes del Grupo</h1>
        <p className="text-sm text-gray-500 mt-1">
          Comparativo {isCurrentMonth ? "del mes en curso" : `de ${selectedMonth}`}
        </p>
      </div>

      <DataTable
        rowKey={(r) => r.code}
        data={summaries}
        columns={[
          { key: "name", header: "Negocio", cellClassName: "font-medium" },
          { key: "bankBalance", header: "Saldo BCP", align: "right", render: (r) => formatCurrency(r.bankBalance) },
          { key: "monthlyIncome", header: "Ingresos mes", align: "right", cellClassName: "text-primary-light", render: (r) => formatCurrency(r.monthlyIncome) },
          { key: "monthlyExpenses", header: "Gastos mes", align: "right", cellClassName: "text-red-600", render: (r) => formatCurrency(r.monthlyExpenses) },
          {
            key: "margin",
            header: "Margen",
            align: "right",
            render: (r) => (
              <span className={`font-semibold ${r.margin >= 0 ? "text-primary-light" : "text-red-600"}`}>
                {formatCurrency(r.margin)}
              </span>
            ),
          },
        ]}
      />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
        <p className="font-medium mb-1">Notas sobre la consolidación</p>
        <ul className="list-disc list-inside text-xs space-y-0.5 text-amber-800">
          <li>Los gastos compartidos (Atelier ↔ Fonavi) se cuentan SOLO una vez (parte Atelier).</li>
          <li>Reembolsos Fonavi se excluyen de los ingresos operativos del grupo.</li>
          <li>Mientras Fonavi y Centro estén vacíos, los totales reflejan solo Atelier.</li>
        </ul>
      </div>
    </div>
  );
}
