"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { formatCurrency } from "@/lib/utils";
import type { BusinessSummary } from "@/app/actions/grupo";
import type { GroupBreakeven } from "@/app/actions/breakeven";
import { BreakevenBody } from "@/components/breakeven-card";
import { GroupKpisSection } from "./group-kpis-section";
import { AtelierB2BCard } from "./atelier-b2b-card";
import type { AtelierB2BResumen } from "@/app/actions/atelier-b2b";
import { BandaFrescura } from "@/components/banda-frescura";
import { DIAS_SALDO_FRESCO, type LiquidezGrupo } from "@/lib/liquidez";
import type { FrescuraGrupo } from "@/lib/frescura-datos";
import { CargasKelly, SubirExcelKelly } from "./cargas-kelly";
import { SelloClasificacionGrupo } from "@/components/sello-clasificacion";
import { CuadreKellySeccion } from "./cuadre-kelly-seccion";
import type { VerificacionSedeMes } from "@/app/actions/verificacion-kelly";
import { fechaLarga } from "@/lib/frescura-datos";
import { ExecutiveHero, type HeroStats } from "./executive-hero";
import { SedePulseCard, type SedePulse } from "./sede-pulse-card";
import { TodayActionsCard } from "./today-actions-card";
import { CumplimientoEquipo } from "./cumplimiento-equipo";
import { buildTodayActions } from "@/lib/grupo/today-actions";
import type { GroupVentasSede } from "@/app/actions/group-ventas";
import type { KellyLoadStatus } from "@/app/actions/grupo";
import type { ScopeCode } from "@/lib/business-theme";

/**
 * Executive Command Center del Grupo (rediseño 28-jul-2026; reorganizado en
 * pestañas el 22-sep-2026 porque "lo noto desordenado": la carga del Excel de
 * Kelly estaba escondida en "Ver detalle operativo" y el corte de datos se
 * repetía en dos lugares).
 *
 * Cabecera: dónde estamos, hasta cuándo hay datos (una pastilla) y "Subir
 * Excel de Kelly", siempre a mano. Pestañas: Resumen · Sedes y equipo ·
 * Finanzas · Excel de Kelly.
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
/** "2026-09" → "2026-08". */
const mesAnterior = (m: string) => {
  const [y, mm] = m.split("-").map(Number);
  return mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, "0")}`;
};
/** Orden de la liquidez por sede bajo el número del grupo. */
const ORDEN_LIQUIDEZ = [2, 3, 1];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

type Props = {
  selectedMonth: string;
  isCurrentMonth: boolean;
  summaries: BusinessSummary[];
  totals: { bankBalance: number; monthlyIncome: number; monthlyExpenses: number; margin: number };
  breakeven: GroupBreakeven | null;
  frescura: FrescuraGrupo | null;
  liquidez: LiquidezGrupo | null;
  ventas: GroupVentasSede[] | null;
  kellyLoads: KellyLoadStatus[];
  atelierB2B: AtelierB2BResumen;
  /** Verificación automática contra el Excel de Kelly; null si falló. */
  cuadreKelly: VerificacionSedeMes[] | null;
};

export function GrupoDashboardClient({
  selectedMonth, isCurrentMonth, summaries, totals: t, breakeven, frescura, liquidez, ventas, kellyLoads,
  atelierB2B, cuadreKelly,
}: Props) {
  const [pestana, setPestana] = useState<"resumen" | "equipo" | "finanzas" | "kelly">("resumen");

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
    // La liquidez sale de getLiquidezGrupo (única fuente). Si falla, se
    // cae al total del resumen para no dejar la tarjeta en blanco.
    liquidez: liquidez ? liquidez.total : t.bankBalance,
    liquidezProcedencia: liquidez ? liquidez.procedencia : null,
    liquidezConfiable: liquidez ? liquidez.confiable : false,
    liquidezSedes: ORDEN_LIQUIDEZ
      .map((id) => liquidez?.sedes.find((x) => x.businessId === id))
      .filter((x): x is NonNullable<typeof x> => !!x)
      .map((x) => ({
        businessId: x.businessId, nombre: x.nombre.replace("Yayi's ", ""),
        total: x.total, banco: x.banco, caja: x.caja,
        // Alerta solo si el saldo no está declarado o ya está viejo; lo que a
        // Kelly le falta cuadrar se muestra aparte, como dato.
        alerta: x.origen !== "declarado" || (x.antiguedadDias ?? 0) > DIAS_SALDO_FRESCO,
        descuadre: x.descuadreKelly !== null && Math.abs(x.descuadreKelly) >= 0.01 ? x.descuadreKelly : null,
      })),
    ventasMes: ventasMes > 0 ? ventasMes : t.monthlyIncome,
    ventasDeltaPct: deltaGrupo,
    margen: t.margin,
    equilibrioPct: breakeven?.grupo.avancePct ?? null,
    serie: serieGrupo,
    periodo,
  };

  // ── Sedes ordenadas por desempeño (mejor arriba) ──
  const liqById = new Map((liquidez?.sedes ?? []).map((x) => [x.businessId, x]));
  // ¿Los ingresos y gastos de la sede son los del Excel de Kelly de este mes?
  const excelDe = (bId: number) => {
    const v = (cuadreKelly ?? []).find((x) => x.businessId === bId && x.month === selectedMonth);
    if (!v?.caja || v.caja.esperadoEntro === null || v.caja.esperadoSalio === null) return null;
    const igual = Math.abs(v.caja.entro - v.caja.esperadoEntro) < 0.01 && Math.abs(v.caja.salio - v.caja.esperadoSalio) < 0.01;
    return { igual, ingresos: v.caja.esperadoEntro, gastos: v.caja.esperadoSalio };
  };

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
        // Misma fuente que la liquidez del hero; si no cargó, el saldo del resumen.
        saldo: liqById.get(s.businessId)?.total ?? s.bankBalance,
        ingresosMes: s.monthlyIncome,
        gastosMes: s.monthlyExpenses,
        deudaAhorro: s.monthlyDebtSavings ?? 0,
        excelKelly: excelDe(s.businessId),
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
    // Solo el mes elegido y el anterior: lo más viejo se ve en la sección
    // del cuadre (pestaña Excel de Kelly) sin llenar las acciones de hoy.
    cuadres: (cuadreKelly ?? [])
      .filter((v) => v.month >= mesAnterior(selectedMonth))
      .map((v) => ({ sede: v.sede, mes: v.month, alertas: v.alertas.length })),
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

  const alDia = frescura?.estado === "al_dia";
  const chipFrescura = frescura?.hasta
    ? `Datos hasta el ${fechaLarga(frescura.hasta)}${frescura.diasAtraso ? ` · hace ${frescura.diasAtraso} días` : ""}`
    : "Sin datos cargados";

  return (
    <div className="space-y-6 pb-4 max-w-[1400px] min-w-0">
      {/* Cabecera: identidad, hasta cuándo hay datos y la acción de siempre */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Grupo Yayi&apos;s</h1>
          <p className="text-sm text-gray-500 mt-1">{isCurrentMonth ? "Mes en curso" : "Mes cerrado"} · {periodo}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {frescura && (
            <button
              type="button"
              onClick={() => setPestana("kelly")}
              title="Ver qué Excel están cargados"
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                alDia ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              {alDia ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              {chipFrescura}
            </button>
          )}
          <SubirExcelKelly className="flex-1 sm:flex-none" />
        </div>
      </header>

      <div className="border-b border-gray-200">
        <nav className="flex gap-6 overflow-x-auto -mb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {([
            ["resumen", "Resumen"],
            ["equipo", "Sedes y equipo"],
            ["finanzas", "Finanzas"],
            ["kelly", "Excel"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setPestana(k)}
              className={`py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                pestana === k ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {pestana === "resumen" && (
        <div className="space-y-6">
          {/* Solo si hay algo que pedirle a Kelly: con todo al día basta la
              pastilla verde de la cabecera (un aviso que aparece siempre deja
              de leerse). */}
          {frescura && !alDia && <BandaFrescura frescura={frescura} />}

          {/* ¿Cómo estamos?  ·  ¿Qué debo hacer hoy? */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
            <div className="lg:col-span-2 min-w-0">
              <ExecutiveHero s={hero} />
            </div>
            <TodayActionsCard actions={actions} />
          </div>

          {/* ¿Qué sede preocupa, cuál va mejor? — ordenadas por desempeño */}
          <section className="space-y-3">
            <h2 className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Las sedes este mes</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {pulses.map((p) => <SedePulseCard key={p.businessId} s={p} />)}
            </div>
          </section>

          {/* Atelier B2B — tres números para decidir */}
          <AtelierB2BCard resumen={atelierB2B} />
        </div>
      )}

      {pestana === "equipo" && (
        <div className="space-y-6">
          {/* ¿Está todo el equipo al día con sus registros? */}
          <CumplimientoEquipo />
          {/* Los KPIs de la semana de cada sede */}
          <GroupKpisSection showDeck={false} />
        </div>
      )}

      {pestana === "finanzas" && (
        <div className="space-y-6">
          {/* ¿Cuánto confiar en el punto de equilibrio? Lo que vale la clasificación. */}
          <SelloClasificacionGrupo month={selectedMonth} />
          {breakeven && (
            <section className="space-y-3">
              <h2 className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Punto de equilibrio · {periodo}</h2>
              <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
                {breakeven.sedes.map((s) => {
                  const code = SEDE_CODE[s.businessId];
                  return (
                    <div key={s.businessId} className="bg-white rounded-2xl border border-gray-200/80 p-5">
                      <Link href={code ? `/${code}/dashboard` : "#"} className="text-sm font-semibold text-gray-900 hover:text-primary transition-colors">
                        {s.name}
                      </Link>
                      <div className="mt-3">
                        <BreakevenBody r={s.result} isCurrent={breakeven.isCurrent} compact />
                      </div>
                    </div>
                  );
                })}
                <div className="bg-white rounded-2xl border border-gray-200/80 p-5">
                  <div className="text-sm font-semibold text-gray-900">Grupo Yayi&apos;s</div>
                  <div className="mt-3">
                    <BreakevenBody r={breakeven.grupo} isCurrent={breakeven.isCurrent} compact />
                  </div>
                </div>
              </div>
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Caja, ingresos y gastos del mes</h2>
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
          </section>
        </div>
      )}

      {pestana === "kelly" && (
        <div className="space-y-6">
          {frescura && <BandaFrescura frescura={frescura} />}
          <CuadreKellySeccion items={cuadreKelly} />
          <CargasKelly />
        </div>
      )}
    </div>
  );
}
