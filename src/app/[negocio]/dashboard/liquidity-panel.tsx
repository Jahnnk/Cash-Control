"use client";

import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import type { LiquidityPanelData } from "@/app/actions/liquidity-panel";
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

export function LiquidityPanel({ data, negocio }: { data: LiquidityPanelData; negocio: string }) {
  const lvl = LEVEL_UI[data.runway.level];
  const trendPositive = (data.deltaWeek ?? data.deltaDay ?? 0) >= 0;

  // Confianza: verde = último check cuadrado y sin inconsistencias internas.
  const checkOk = data.trust.lastCheckDiff !== null && Math.abs(data.trust.lastCheckDiff) < 0.01;
  const trustState: "verde" | "ambar" | "rojo" = data.trust.hasDiscrepancy
    ? "rojo"
    : data.trust.lastCheckDiff === null
      ? "ambar"
      : checkOk
        ? "verde"
        : Math.abs(data.trust.lastCheckDiff) <= 50
          ? "ambar"
          : "rojo";
  const trustUI = LEVEL_UI[trustState === "verde" ? "verde" : trustState === "ambar" ? "ambar" : "rojo"];

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
            <span className={`w-2 h-2 rounded-full ${lvl.dot}`} aria-hidden="true" />
          </div>
          {/* Barra hacia el objetivo mínimo */}
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${lvl.bar}`}
              style={{ width: `${Math.min(100, ((data.runway.days ?? 0) / (data.runway.minDays * 2)) * 100)}%` }}
            />
          </div>
          <div className="text-[11px] text-gray-500 mt-2 leading-snug">
            Gastas ~{formatCurrency(data.runway.dailyExpense)}/día (real, 8 semanas).
            Objetivo: ≥{data.runway.minDays} días ({formatCurrency(data.runway.minSoles)}).
          </div>
        </div>

        {/* ── 3. CONFIANZA EN LOS NÚMEROS ──
               Pregunta: ¿puedo confiar en estos saldos? */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            {trustState === "verde"
              ? <ShieldCheck className="w-4 h-4 text-emerald-600" />
              : <ShieldAlert className={`w-4 h-4 ${trustUI.text}`} />}
            Confianza en los números
          </div>
          <div className={`text-lg font-bold mt-1 ${trustUI.text}`}>
            {data.trust.hasDiscrepancy
              ? "Inconsistencia interna"
              : data.trust.lastCheckDiff === null
                ? "Sin cuadre registrado"
                : checkOk
                  ? "Cuadrado con BCP"
                  : `Diferencia ${formatCurrency(Math.abs(data.trust.lastCheckDiff))}`}
          </div>
          <div className="text-[11px] text-gray-500 mt-1 leading-snug">
            {data.trust.lastCheckDate
              ? <>Último cuadre: {data.trust.lastCheckDate}.</>
              : <>Registra el saldo real del BCP para cuadrar.</>}
            {data.trust.verifiedPct !== null && (
              <> Movimientos del mes verificados: <strong>{data.trust.verifiedPct}%</strong> ({data.trust.verifiedCount}/{data.trust.totalCount}).</>
            )}
          </div>
          <Link
            href={`/${negocio}/reportes?tab=conciliacion`}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline mt-2"
          >
            {trustState === "verde" ? "Ver conciliación" : "Investigar"} <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {/* ── 4. POR COBRAR (liquidez futura, solo Atelier) ──
               Pregunta: ¿cuánta plata mía está en manos de otros y qué tan cobrable es? */}
        {data.receivables && (
          <div className="md:col-span-2 xl:col-span-4 bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Handshake className="w-5 h-5 text-violet-600 shrink-0" />
              <div className="min-w-0">
                <span className="text-sm text-gray-600">Liquidez futura (por cobrar): </span>
                <span className="text-base font-bold text-violet-700">{formatCurrency(data.receivables.total)}</span>
                {data.receivables.byDebtor.length > 0 && (
                  <span className="text-xs text-gray-500">
                    {" "}· {data.receivables.byDebtor.map((d) => `${d.name} ${formatCurrency(d.pending)}`).join(" · ")}
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
        )}
      </div>
    </section>
  );
}
