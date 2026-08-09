"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Scale } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { formatCurrency } from "@/lib/utils";
import type { BusinessSummary } from "@/app/actions/grupo";
import type { GroupBreakeven } from "@/app/actions/breakeven";
import { BreakevenBody } from "@/components/breakeven-card";
import { GroupKpisSection } from "./group-kpis-section";
import { ClientSalesSection } from "@/app/[negocio]/panel/client-sales-section";
import type { ClientSalesAnalisis } from "@/app/actions/client-sales";
import { DataFreshnessCard } from "./data-freshness-card";
import { KellyImportCard } from "./kelly-import-card";
import { KellyLoadCard } from "./kelly-load-card";
import { ExecutiveHero, type HeroStats } from "./executive-hero";
import { SedePulseCard, type SedePulse } from "./sede-pulse-card";
import { TodayActionsCard } from "./today-actions-card";
import { buildTodayActions } from "@/lib/grupo/today-actions";
import { formatCutoff } from "@/lib/data-cutoff";
import type { SedeCutoff } from "@/app/actions/data-cutoff";
import type { GroupVentasSede } from "@/app/actions/group-ventas";
import type { DataFreshness, KellyLoadStatus } from "@/app/actions/grupo";
import { BUSINESS_THEMES, type ScopeCode } from "@/lib/business-theme";

/**
 * Executive Command Center del Grupo (rediseño 28-jul-2026).
 *
 * La pantalla responde CUATRO preguntas en este orden, y nada más:
 *   1. ¿Cómo estamos?          → el hero, un número dominante.
 *   2. ¿Qué debo hacer hoy?    → máximo tres frases accionables.
 *   3. ¿Qué negocio preocupa / cuál va mejor? → sedes ORDENADAS por
 *      desempeño, con la peor y la mejor etiquetadas.
 *   4. El detalle              → plegado, para el contador, no el CEO.
 *
 * Disciplina de color: gris por defecto. Verde/ámbar/rojo SOLO cuando
 * significan algo (variación real, riesgo real). Si todo tiene color,
 * nada destaca.
 */

const SEDE_CODE: Record<number, ScopeCode> = { 1: "atelier", 2: "fonavi", 3: "centro" };
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

type Props = {
  selectedMonth: string;
  isCurrentMonth: boolean;
  summaries: BusinessSummary[];
  totals: { bankBalance: number; monthlyIncome: number; monthlyExpenses: number; margin: number };
  breakeven: GroupBreakeven | null;
  freshness: DataFreshness[];
  ventas: GroupVentasSede[] | null;
  kellyLoads: KellyLoadStatus[];
  cutoffs: SedeCutoff[] | null;
  clientes: ClientSalesAnalisis;
};

export function GrupoDashboardClient({
  selectedMonth, isCurrentMonth, summaries, totals: t, breakeven, freshness, ventas, kellyLoads, cutoffs,
  clientes,
}: Props) {
  const [verDetalle, setVerDetalle] = useState(false);

  const [y, m] = selectedMonth.split("-").map(Number);
  const periodo = `${MESES[m - 1]} ${y}`;

  const byId = new Map((ventas ?? []).map((v) => [v.businessId, v]));
  const beById = new Map((breakeven?.sedes ?? []).map((s) => [s.businessId, s.result]));

  // ── Hero: la venta del grupo y su tendencia agregada por día ──
  const ventasMes = (ventas ?? []).reduce((s, v) => s + v.mes, 0);
  const largo = Math.max(0, ...(ventas ?? []).map((v) => v.serie14.length));
  const serieGrupo = Array.from({ length: largo }, (_, i) =>
    (ventas ?? []).reduce((s, v) => {
      // Alinear por el FINAL: el último punto de cada sede es su último día.
      const off = largo - v.serie14.length;
      return s + (i >= off ? v.serie14[i - off] : 0);
    }, 0),
  );
  // Δ del grupo: suma de los tramos emparejados de cada sede (no un
  // promedio de porcentajes, que pesaría igual a una sede chica).
  const cmpCur = (ventas ?? []).reduce((s, v) => s + (v.mesCmp?.sameDay.current ?? 0), 0);
  const cmpPrev = (ventas ?? []).reduce((s, v) => s + (v.mesCmp?.sameDay.previous ?? 0), 0);
  const deltaGrupo = cmpPrev > 0 ? Math.round(((cmpCur - cmpPrev) / cmpPrev) * 1000) / 10 : null;

  const hero: HeroStats = {
    liquidez: t.bankBalance,
    ventasMes: ventasMes > 0 ? ventasMes : t.monthlyIncome,
    ventasDeltaPct: deltaGrupo,
    margen: t.margin,
    equilibrioPct: breakeven?.grupo.avancePct ?? null,
    serie: serieGrupo,
    periodo,
  };

  // ── Sedes ordenadas por desempeño (mejor arriba) ──
  const pulses: SedePulse[] = summaries
    .map((s): SedePulse => {
      const v = byId.get(s.businessId);
      const be = beById.get(s.businessId);
      return {
        businessId: s.businessId,
        code: SEDE_CODE[s.businessId] ?? "grupo",
        nombre: s.name.replace("Yayi's ", ""),
        ventasMes: v?.mes ?? s.monthlyIncome,
        deltaPct: v?.mesCmp?.sameDay.pct ?? null,
        diasComparados: v?.mesCmp?.sameDay.daysCompared ?? 0,
        coberturaBaja: v?.mesCmp?.lowCoverage ?? false,
        saldo: s.bankBalance,
        equilibrioPct: be?.avancePct ?? null,
        serie: v?.serie14 ?? [],
        hasta: v?.hasta ?? null,
        flag: null,
      };
    })
    .sort((a, b) => (b.deltaPct ?? -999) - (a.deltaPct ?? -999));

  // Etiquetar solo cuando hay contraste real y comparativo confiable.
  const confiables = pulses.filter((p) => p.deltaPct !== null && !p.coberturaBaja);
  if (confiables.length >= 2) {
    const mejor = confiables[0], peor = confiables[confiables.length - 1];
    if ((mejor.deltaPct ?? 0) > (peor.deltaPct ?? 0)) {
      if ((peor.deltaPct ?? 0) < 0) peor.flag = "atencion";
      if ((mejor.deltaPct ?? 0) > (peor.deltaPct ?? 0) + 5) mejor.flag = "mejor";
    }
  }

  // ── Acciones de hoy (motor puro y testeado) ──
  const actions = buildTodayActions({
    cargas: kellyLoads.map((k) => ({
      nombre: k.name.replace("Yayi's ", ""),
      nivel: k.level,
      diasDesdeCarga: k.daysSinceImport,
    })),
    sedes: pulses.map((p) => ({
      nombre: p.nombre,
      code: p.code,
      deltaPct: p.deltaPct,
      diasComparados: p.diasComparados,
      coberturaBaja: p.coberturaBaja,
      equilibrioPct: p.equilibrioPct,
      // El motor de equilibrio ya decide el estado: solo "en_riesgo"
      // amerita interrumpir (superado y en_camino no son problema).
      equilibrioEnRiesgo: beById.get(p.businessId)?.estado === "en_riesgo",
    })),
  });

  return (
    <div className="space-y-8 pb-4">
      {/* Encabezado: identidad y frescura, sin ruido */}
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="text-[1.75rem] font-semibold text-gray-900 tracking-[-0.02em] leading-none">
            Grupo Yayi&apos;s
          </h1>
          <p className="text-sm text-gray-400 mt-1.5">
            {isCurrentMonth ? "Mes en curso" : "Cerrado"} · {periodo}
          </p>
        </div>
        {cutoffs && cutoffs.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {cutoffs.map((c) => (
              <span
                key={c.businessId}
                className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 bg-white border border-gray-200/70 rounded-full pl-2 pr-2.5 py-1"
                title="Hasta cuándo son completos los datos de esta sede"
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: BUSINESS_THEMES[(SEDE_CODE[c.businessId] ?? "grupo")].color }} />
                {c.name.replace("Yayi's ", "")}
                <span className="text-gray-400 tabular-nums">{formatCutoff(c.cutoff)}</span>
              </span>
            ))}
          </div>
        )}
      </header>

      {/* 1 · ¿Cómo estamos?   ·   2 · ¿Qué debo hacer hoy? */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2">
          <ExecutiveHero s={hero} />
        </div>
        <TodayActionsCard actions={actions} />
      </div>

      {/* 3 · ¿Qué negocio preocupa? ¿Cuál va mejor? — las tres juntas y
             ordenadas, para compararlas de un vistazo. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {pulses.map((p) => <SedePulseCard key={p.businessId} s={p} />)}
      </div>

      {/* 4 · Clientes B2B de Atelier — quién nos compra de verdad.
              Solo lectura: el que sube el reporte es Luis, desde su panel. */}
      {clientes.hayDatos && (
        <div className="pt-1">
          <ClientSalesSection data={clientes} />
        </div>
      )}

      {/* 5 · El detalle — plegado. El CEO no lo necesita para decidir. */}
      <div>
        <button
          onClick={() => setVerDetalle((v) => !v)}
          className="group inline-flex items-center gap-2 text-xs font-medium text-gray-400 hover:text-gray-700 transition-colors"
        >
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${verDetalle ? "rotate-180" : ""}`} />
          {verDetalle ? "Ocultar detalle" : "Ver detalle operativo"}
        </button>

        {verDetalle && (
          <div className="mt-5 space-y-6">
            <KellyLoadCard items={kellyLoads} />
            <DataFreshnessCard items={freshness} />
            <KellyImportCard />
            <GroupKpisSection showDeck={false} />

            {breakeven && (
              <section className="space-y-3">
                <h2 className="text-[10px] font-medium uppercase tracking-[0.09em] text-gray-400 flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5" /> Punto de equilibrio
                </h2>
                <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
                  {breakeven.sedes.map((s) => {
                    const code = SEDE_CODE[s.businessId];
                    return (
                      <div key={s.businessId} className="bg-white rounded-2xl border border-gray-200/70 p-5">
                        <Link href={code ? `/${code}/dashboard` : "#"} className="text-sm font-semibold text-gray-900 hover:text-primary transition-colors">
                          {s.name}
                        </Link>
                        <div className="mt-3">
                          <BreakevenBody r={s.result} isCurrent={breakeven.isCurrent} compact />
                        </div>
                      </div>
                    );
                  })}
                  <div className="bg-white rounded-2xl border border-gray-200/70 p-5">
                    <div className="text-sm font-semibold text-gray-900">Grupo Yayi&apos;s</div>
                    <div className="mt-3">
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
                  key: "name", header: "Negocio",
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
                  key: "margin", header: "Margen", align: "right",
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
        )}
      </div>
    </div>
  );
}
