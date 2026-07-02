"use client";

import Link from "next/link";
import { useState } from "react";
import { formatCurrency } from "@/lib/utils";
import type { LiquidityPanelData } from "@/app/actions/liquidity-panel";
import {
  liquidityVerdict,
  runwayVerdict,
  reconciliationVerdict,
  receivablesVerdict,
  liquidityStreak,
  monthEndProjection,
  simulateCollect,
  simulateCutSpending,
  simulateFreeze,
  type Verdict,
} from "@/lib/liquidity";
import {
  Wallet,
  Landmark,
  Coins,
  TimerReset,
  ShieldCheck,
  ShieldAlert,
  Handshake,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Plus,
  HelpCircle,
  FlaskConical,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

/**
 * Panel Ejecutivo de Liquidez — sección "Saldos" del Dashboard.
 * Regla de diseño: cada tarjeta responde UNA pregunta de negocio; todo
 * número lleva contexto (variación, tendencia, objetivo, semáforo).
 *
 *  1. Liquidez disponible → ¿cuánto dinero tengo realmente hoy y cómo se mueve?
 *  2. Días de cobertura   → ¿cuántos días opero si hoy dejo de vender?
 *  3. Confianza           → ¿puedo confiar en estos números?
 *  4. Por cobrar          → ¿cuánta plata mía está en manos de otros?
 *  5. Flujo del mes vive en la tarjeta 1 (Δ mes) y en el drilldown.
 */

function Delta({ value, label }: { value: number | null; label: string }) {
  if (value === null) return null;
  const up = value > 0.004;
  const down = value < -0.004;
  const cls = up ? "text-emerald-600" : down ? "text-red-600" : "text-gray-400";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${cls}`}>
      {up ? <TrendingUp className="w-3 h-3" /> : down ? <TrendingDown className="w-3 h-3" /> : null}
      {up ? "+" : ""}{formatCurrency(value)} <span className="text-gray-400 font-normal">{label}</span>
    </span>
  );
}

/** Sparkline SVG minimalista (sin librerías) de la serie de liquidez. */
function Sparkline({ points, positive }: { points: number[]; positive: boolean }) {
  if (points.length < 2) return null;
  const w = 140;
  const h = 36;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = w / (points.length - 1);
  const path = points
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - 3 - ((v - min) / span) * (h - 6)).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-9" preserveAspectRatio="none" aria-hidden="true">
      <path d={path} fill="none" strokeWidth="2" className={positive ? "stroke-emerald-500" : "stroke-red-500"} />
    </svg>
  );
}

const LEVEL_UI = {
  verde: { dot: "bg-emerald-500", text: "text-emerald-700", bar: "bg-emerald-500", label: "Saludable" },
  ambar: { dot: "bg-amber-500", text: "text-amber-700", bar: "bg-amber-500", label: "Ajustada" },
  rojo: { dot: "bg-red-500", text: "text-red-700", bar: "bg-red-500", label: "Crítica" },
  "sin-datos": { dot: "bg-gray-300", text: "text-gray-500", bar: "bg-gray-300", label: "Sin historial" },
} as const;

const TONE_TEXT: Record<Verdict["tone"], string> = {
  bien: "text-emerald-700",
  neutro: "text-gray-600",
  atencion: "text-amber-700",
  riesgo: "text-red-700",
};

/** El veredicto en lenguaje natural de cada tarjeta ("te habla tu CFO"). */
function VerdictLine({ v }: { v: Verdict }) {
  return <p className={`text-xs leading-snug mt-2 ${TONE_TEXT[v.tone]}`}>{v.text}</p>;
}

export function LiquidityPanel({ data, negocio }: { data: LiquidityPanelData; negocio: string }) {
  const lvl = LEVEL_UI[data.runway.level];
  const trendPositive = (data.deltaWeek ?? data.deltaDay ?? 0) >= 0;
  const [showWhy, setShowWhy] = useState(false);
  const [showSim, setShowSim] = useState(false);

  // Copiloto: racha, proyección de cierre (con confianza) y simulaciones.
  const streak = liquidityStreak(data.series);
  const netDaily14 =
    data.series.length >= 2
      ? Math.round(((data.series[data.series.length - 1].value - data.series[0].value) / (data.series.length - 1)) * 100) / 100
      : null;
  const projection = data.projection
    ? monthEndProjection({
        liquid: data.liquid,
        netDaily8w: data.projection.netDaily8w,
        daysRemaining: data.projection.daysRemaining,
        minSoles: data.runway.minSoles,
        netDaily14,
      })
    : null;
  const simCollect = data.receivables && data.receivables.total > 0
    ? simulateCollect({ liquid: data.liquid, receivablesTotal: data.receivables.total, dailyExpense: data.runway.dailyExpense })
    : null;
  const simCut = projection && data.projection
    ? simulateCutSpending({ dailyExpense: data.runway.dailyExpense, daysRemaining: data.projection.daysRemaining, pct: 0.15, projectedClose: projection.value })
    : null;
  const simFreeze = data.runway.dailyExpense > 0
    ? simulateFreeze({ dailyExpense: data.runway.dailyExpense, days: 3, liquid: data.liquid })
    : null;
  const whyNet = Math.round((data.why.totalIn - data.why.totalOut) * 100) / 100;

  // Veredictos: el sistema interpreta; el gerente no descifra números.
  const vLiquidity = liquidityVerdict({
    liquid: data.liquid,
    deltaDay: data.deltaDay,
    deltaWeek: data.deltaWeek,
    minSoles: data.runway.minSoles,
  });
  const vRunway = runwayVerdict(data.runway.days, data.runway.minDays);
  const vTrust = reconciliationVerdict({
    lastCheckDiff: data.trust.lastCheckDiff,
    hasDiscrepancy: data.trust.hasDiscrepancy,
    verifiedPct: data.trust.verifiedPct,
  });
  const trustUI =
    vTrust.tone === "bien" ? LEVEL_UI.verde : vTrust.tone === "atencion" ? LEVEL_UI.ambar : LEVEL_UI.rojo;

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        Liquidez · hoy
      </h2>
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">

        {/* ── 1. LIQUIDEZ DISPONIBLE (protagonista, doble ancho) ──
               Pregunta: ¿cuánto dinero tengo realmente hoy y cómo se mueve? */}
        <div className="md:col-span-2 bg-white rounded-xl border-l-4 border border-gray-200 border-l-primary p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Wallet className="w-4 h-4" /> Liquidez disponible
              </div>
              <div className="text-3xl font-extrabold text-gray-900 mt-1">
                {formatCurrency(data.liquid)}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-gray-500">
                <Link href={`/${negocio}/registro`} className="inline-flex items-center gap-1 hover:underline">
                  <Landmark className="w-3 h-3" /> Banco {formatCurrency(data.bank)}
                </Link>
                <Link href={`/${negocio}/registro`} className="inline-flex items-center gap-1 hover:underline">
                  <Coins className="w-3 h-3" /> Caja {formatCurrency(data.cash)}
                </Link>
              </div>
            </div>
            <div className="w-36 shrink-0 hidden sm:block">
              <Sparkline points={data.series.map((p) => p.value)} positive={trendPositive} />
              <div className="text-[10px] text-gray-400 text-right">últimos 14 días</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-3 border-t border-gray-100">
            <Delta value={data.deltaDay} label="vs ayer" />
            <Delta value={data.deltaWeek} label="vs hace 7 días" />
            <Delta value={data.deltaMonth} label="en el mes" />
          </div>
          <VerdictLine v={vLiquidity} />
          {streak.text && (
            <p className={`text-xs leading-snug mt-1 ${streak.direction === "baja" ? "text-red-700" : "text-emerald-700"}`}>
              {streak.text}
            </p>
          )}
          {projection && (
            <div>
              <VerdictLine v={projection.verdict} />
              <span
                className={`inline-flex items-center gap-1 mt-1 text-[10px] font-medium rounded-full border px-2 py-0.5 ${
                  projection.confidence.level === "alta"
                    ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                    : projection.confidence.level === "media"
                      ? "text-amber-700 bg-amber-50 border-amber-200"
                      : "text-red-700 bg-red-50 border-red-200"
                }`}
                title={projection.confidence.reason}
              >
                confianza {projection.confidence.level}
              </span>
            </div>
          )}

          {/* ¿Por qué cambió? — desglose de los últimos 7 días */}
          <div className="mt-3 pt-2 border-t border-gray-100 flex flex-wrap gap-x-4 gap-y-1">
            <button
              onClick={() => setShowWhy((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
            >
              <HelpCircle className="w-3.5 h-3.5" /> ¿Por qué cambió?
              {showWhy ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
            <button
              onClick={() => setShowSim((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
            >
              <FlaskConical className="w-3.5 h-3.5" /> ¿Y si…?
              {showSim ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          </div>
          {showWhy && (
            <div className="mt-2 bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs text-gray-700 space-y-1">
              <div>
                Últimos 7 días: entró <strong className="text-emerald-700">{formatCurrency(data.why.totalIn)}</strong>,
                salió <strong className="text-red-700">{formatCurrency(data.why.totalOut)}</strong> →
                neto <strong className={whyNet >= 0 ? "text-emerald-700" : "text-red-700"}>{whyNet >= 0 ? "+" : "−"}{formatCurrency(Math.abs(whyNet))}</strong>.
              </div>
              {data.why.topOut.length > 0 && (
                <div>
                  Las salidas que más pesaron:{" "}
                  {data.why.topOut.map((t, i) => (
                    <span key={i}>
                      {i > 0 && " · "}
                      &quot;{t.concept}&quot; {formatCurrency(t.amount)}
                    </span>
                  ))}
                  .
                </div>
              )}
              <Link href={`/${negocio}/reportes?tab=movimientos`} className="inline-flex items-center gap-1 text-primary font-medium hover:underline">
                Ver todos los movimientos <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          )}
          {showSim && (
            <div className="mt-2 bg-blue-50/60 border border-blue-100 rounded-lg p-3 text-xs text-gray-700 space-y-1.5">
              {simCollect && (
                <div className="flex items-start gap-1.5">
                  <span>💰</span>
                  <span>{simCollect.text}{" "}
                    <Link href={`/${negocio}/fonavi`} className="text-primary font-medium hover:underline">Cobrar →</Link>
                  </span>
                </div>
              )}
              {simCut && <div className="flex items-start gap-1.5"><span>✂️</span><span>{simCut.text}</span></div>}
              {simFreeze && <div className="flex items-start gap-1.5"><span>🧊</span><span>{simFreeze.text}</span></div>}
              <div className="text-[10px] text-gray-400 pt-1">
                Estimaciones sobre tu ritmo real — no promesas.
              </div>
            </div>
          )}
        </div>

        {/* ── 2. DÍAS DE COBERTURA ──
               Pregunta: si hoy dejo de vender, ¿cuántos días sigo operando? */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <TimerReset className="w-4 h-4" /> Días de cobertura
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className={`text-3xl font-extrabold ${lvl.text}`}>
              {data.runway.days ?? "—"}
            </span>
            <span className="text-sm text-gray-500">días sin vender</span>
            {/* Estado en palabra: legible en <1 segundo */}
            <span className={`ml-auto inline-flex items-center gap-1.5 text-xs font-semibold ${lvl.text}`}>
              <span className={`w-2 h-2 rounded-full ${lvl.dot}`} aria-hidden="true" />
              {lvl.label}
            </span>
          </div>
          {/* Barra hacia el objetivo mínimo, con la marca del objetivo */}
          <div className="relative mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${lvl.bar}`}
              style={{ width: `${Math.min(100, ((data.runway.days ?? 0) / (data.runway.minDays * 2)) * 100)}%` }}
            />
            <div className="absolute top-0 bottom-0 w-0.5 bg-gray-400/70" style={{ left: "50%" }} title={`Objetivo: ${data.runway.minDays} días`} />
          </div>
          <div className="text-[11px] text-gray-500 mt-1.5 leading-snug">
            ~{formatCurrency(data.runway.dailyExpense)}/día real · la marca = objetivo ≥{data.runway.minDays} días
          </div>
          <VerdictLine v={vRunway} />
        </div>

        {/* ── 3. CONCILIACIÓN BANCARIA ──
               Pregunta: ¿puedo confiar en estos saldos? El sistema interpreta
               el nivel de riesgo (tolerancia: <S/1 cuadrado, ≤S/50 menor). */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            {vTrust.tone === "bien"
              ? <ShieldCheck className="w-4 h-4 text-emerald-600" />
              : <ShieldAlert className={`w-4 h-4 ${trustUI.text}`} />}
            Conciliación bancaria
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className={`text-lg font-bold ${trustUI.text}`}>{vTrust.label}</span>
            {data.trust.lastCheckDate && (
              <span className="text-[11px] text-gray-400">último cuadre: {data.trust.lastCheckDate}</span>
            )}
          </div>
          <VerdictLine v={vTrust} />
          <Link
            href={`/${negocio}/reportes?tab=conciliacion`}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline mt-2"
          >
            {vTrust.tone === "bien" ? "Ver conciliación" : "Investigar ahora"} <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {/* ── 4. POR COBRAR (liquidez futura, solo Atelier) ──
               Pregunta: ¿cuánta plata mía está en manos de otros y qué tan cobrable es? */}
        {data.receivables && (
          <div className="md:col-span-2 xl:col-span-4 bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Handshake className="w-5 h-5 text-violet-600 shrink-0" />
                <div className="min-w-0">
                  <span className="text-sm text-gray-600">Liquidez futura (por cobrar): </span>
                  <span className="text-base font-bold text-violet-700">{formatCurrency(data.receivables.total)}</span>
                  {data.receivables.byDebtor.length > 0 && (
                    <span className="text-xs text-gray-500">
                      {" "}· {data.receivables.byDebtor
                        .map((d) => `${d.name} ${formatCurrency(d.pending)} (${d.oldestDays} d)`)
                        .join(" · ")}
                    </span>
                  )}
                  {data.receivables.overdue > 0 && (
                    <span className="ml-2 inline-flex items-center text-[11px] font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                      {formatCurrency(data.receivables.overdue)} vencido
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href={`/${negocio}/fonavi?accion=registrar-reembolso`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-md px-3 py-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Registrar cobro
                </Link>
                <Link
                  href={`/${negocio}/fonavi`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 hover:underline"
                >
                  Ver detalle <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
            <div className="pl-8">
              <VerdictLine
                v={receivablesVerdict({
                  total: data.receivables.total,
                  overdue: data.receivables.overdue,
                  oldestDays: data.receivables.oldestDays,
                  dailyExpense: data.runway.dailyExpense,
                })}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
