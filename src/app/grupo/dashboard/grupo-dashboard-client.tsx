"use client";

import Link from "next/link";
import { Landmark, TrendingUp, TrendingDown, Wallet, Scale, ArrowRight } from "lucide-react";
import { KPICard } from "@/components/ui/KPICard";
import { DataTable } from "@/components/ui/DataTable";
import { formatCurrency } from "@/lib/utils";
import type { BusinessSummary } from "@/app/actions/grupo";
import type { GroupBreakeven } from "@/app/actions/breakeven";
import { BreakevenBody } from "@/components/breakeven-card";
import { GroupKpisSection } from "./group-kpis-section";
import { DataFreshnessCard } from "./data-freshness-card";
import { KellyImportCard } from "./kelly-import-card";
import type { DataFreshness } from "@/app/actions/grupo";
import { BUSINESS_THEMES, type ScopeCode } from "@/lib/business-theme";

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
  breakeven: GroupBreakeven | null;
  freshness: DataFreshness[];
};

const SEDE_CODE: Record<number, ScopeCode> = { 1: "atelier", 2: "fonavi", 3: "centro" };

export function GrupoDashboardClient({ selectedMonth, isCurrentMonth, summaries, totals: t, breakeven, freshness }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Grupo Yayi&apos;s</h1>
        <p className="text-sm text-gray-500 mt-1">
          Vista consolidada · {isCurrentMonth ? "Mes en curso" : `Mes ${selectedMonth}`}
        </p>
      </div>

      {/* Selector de sede: del consolidado al dashboard COMPLETO de cada
          una en un clic (pedido de Jahnn, jul-2026 — los links escondidos
          en las tarjetas de equilibrio no bastaban). */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        {summaries.map((s) => {
          const code = SEDE_CODE[s.businessId];
          const theme = code ? BUSINESS_THEMES[code] : null;
          return (
            <Link
              key={s.code}
              href={`/${s.code}/dashboard`}
              className="group bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow"
              style={theme ? { borderLeftColor: theme.color, borderLeftWidth: 4 } : undefined}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-900">{s.name}</span>
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all" />
              </div>
              <div className="mt-1.5 text-xs text-gray-500">
                Saldo <strong className="text-gray-900">{formatCurrency(s.bankBalance)}</strong>
                {" · "}Margen{" "}
                <strong className={s.margin >= 0 ? "text-primary-light" : "text-red-600"}>
                  {formatCurrency(s.margin)}
                </strong>
              </div>
              <div className="mt-1 text-[11px] text-gray-400">Ver dashboard completo</div>
            </Link>
          );
        })}
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

      {/* ¿Hasta cuándo hay datos por sede? — qué pedirle a Kelly */}
      <DataFreshnessCard items={freshness} />

      {/* ...y cuando Kelly manda los Excel, se suben AQUÍ mismo, sin
          entrar sede por sede (la sede se elige explícita — Opción A). */}
      <KellyImportCard />

      {/* KPIs semanales de las 3 sedes — salud de un vistazo. La GENERACIÓN
          de reportes vive en Reportes del Grupo (dashboard = ver, reportes
          = documentos — decisión de orden del programa). */}
      <GroupKpisSection showDeck={false} />

      {/* Punto de equilibrio — la pregunta del CEO: ¿cada sede se paga
          sola este mes, y el grupo completo? */}
      {breakeven && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5" />
            Punto de equilibrio · {isCurrentMonth ? "mes en curso" : selectedMonth}
          </h2>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            {breakeven.sedes.map((s) => {
              const code = SEDE_CODE[s.businessId];
              const theme = code ? BUSINESS_THEMES[code] : null;
              return (
                <div key={s.businessId} className="bg-white rounded-xl border border-gray-200 p-4" style={theme ? { borderTopColor: theme.color, borderTopWidth: 3 } : undefined}>
                  <Link href={code ? `/${code}/dashboard` : "#"} className="text-sm font-semibold text-gray-900 hover:underline">
                    {s.name}
                  </Link>
                  <div className="mt-2">
                    <BreakevenBody r={s.result} isCurrent={breakeven.isCurrent} compact />
                  </div>
                </div>
              );
            })}
            <div className="bg-white rounded-xl border border-gray-200 p-4" style={{ borderTopColor: BUSINESS_THEMES.grupo.color, borderTopWidth: 3 }}>
              <div className="text-sm font-semibold text-gray-900">Grupo Yayi&apos;s</div>
              <div className="mt-2">
                <BreakevenBody r={breakeven.grupo} isCurrent={breakeven.isCurrent} compact />
              </div>
            </div>
          </div>
        </section>
      )}

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
