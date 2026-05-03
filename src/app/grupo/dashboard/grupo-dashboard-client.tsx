"use client";

import Link from "next/link";
import { Landmark, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { KPICard } from "@/components/ui/KPICard";
import { DataTable } from "@/components/ui/DataTable";
import { formatCurrency } from "@/lib/utils";
import type { BusinessSummary } from "@/app/actions/grupo";

type Props = {
  selectedMonth: string;
  isCurrentMonth: boolean;
  summaries: BusinessSummary[];
  totals: {
    bankBalance: number;
    monthlyIncome: number;
    monthlyExpenses: number;
    margin: number;
  };
};

export function GrupoDashboardClient({ selectedMonth, isCurrentMonth, summaries, totals: t }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Grupo Yayi&apos;s</h1>
        <p className="text-sm text-gray-500 mt-1">
          Vista consolidada · {isCurrentMonth ? "Mes en curso" : `Mes ${selectedMonth}`}
        </p>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <KPICard
          icon={<Landmark className="w-5 h-5 text-primary-light" />}
          title="Saldo total"
          value={formatCurrency(t.bankBalance)}
          subtitle="Atelier + Fonavi + Centro"
          variant="default"
        />
        <KPICard
          icon={<TrendingUp className="w-5 h-5 text-primary-light" />}
          title="Ingresos del mes"
          value={formatCurrency(t.monthlyIncome)}
          subtitle="Suma de los 3 negocios"
          variant="default"
        />
        <KPICard
          icon={<TrendingDown className="w-5 h-5 text-red-600" />}
          title="Gastos del mes"
          value={formatCurrency(t.monthlyExpenses)}
          subtitle="Sin duplicar gastos compartidos"
          variant="danger"
        />
        <KPICard
          icon={<Wallet className="w-5 h-5 text-amber-600" />}
          title="Margen consolidado"
          value={formatCurrency(t.margin)}
          subtitle="Ingresos − Gastos"
          variant={t.margin >= 0 ? "success" : "danger"}
        />
      </div>

      <DataTable
        rowKey={(r) => r.code}
        data={summaries}
        columns={[
          {
            key: "name",
            header: "Negocio",
            render: (r) => (
              <Link href={`/${r.code}/dashboard`} className="font-medium text-primary-light hover:underline">
                {r.name}
              </Link>
            ),
          },
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
        footer={
          <tr className="bg-gray-50 font-semibold">
            <td className="px-4 py-3">Total grupo</td>
            <td className="px-4 py-3 text-right">{formatCurrency(t.bankBalance)}</td>
            <td className="px-4 py-3 text-right text-primary-light">{formatCurrency(t.monthlyIncome)}</td>
            <td className="px-4 py-3 text-right text-red-600">{formatCurrency(t.monthlyExpenses)}</td>
            <td className={`px-4 py-3 text-right ${t.margin >= 0 ? "text-primary-light" : "text-red-600"}`}>
              {formatCurrency(t.margin)}
            </td>
          </tr>
        }
      />
    </div>
  );
}
