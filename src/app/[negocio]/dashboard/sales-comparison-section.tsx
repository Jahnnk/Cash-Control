"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, BarChart3 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { getSalesComparison, type SalesComparison } from "@/app/actions/sales-comparison";

/**
 * "Comparativo de ventas" — apartado propio en el dashboard de sede
 * (pedido de Jahnn, 28-jul-2026). Dos preguntas y dos gráficas:
 *   1. ¿Cómo vengo esta semana vs la anterior?
 *   2. ¿Cómo va el mes vs el mismo tramo del mes pasado?
 *
 * El "mismos días" es LITERAL: se emparejan día con día y solo cuentan
 * los que tienen dato en AMBOS meses (mismo motor que la alerta y que
 * el dashboard de Grupo — una sola verdad).
 */

const VERDE = "#098B5F";
const GRIS = "#9CA3AF";

function ddmm(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function Delta({ pct, size = "sm" }: { pct: number | null; size?: "sm" | "lg" }) {
  const cls = size === "lg" ? "text-lg font-bold" : "text-xs font-medium";
  if (pct === null) {
    return <span className={`inline-flex items-center gap-1 text-gray-400 ${cls}`}><Minus className="w-4 h-4" /> sin comparación</span>;
  }
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-1 ${up ? "text-emerald-600" : "text-red-600"} ${cls}`}>
      {up ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
      {up ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

export function SalesComparisonSection() {
  const [data, setData] = useState<SalesComparison | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await getSalesComparison();
      if (r.ok) setData(r.data);
      else setError(r.error);
    })();
  }, []);

  if (error || !data) return null;
  const { semana, mes, serie, porDiaSemana } = data;

  const serieChart = serie.map((d) => ({
    dia: d.dia,
    [mes.etiquetaMes]: d.actual,
    [mes.etiquetaMesPrev]: d.anterior,
  }));
  const dowChart = porDiaSemana.map((d) => ({
    dia: d.dia.slice(0, 3),
    [mes.etiquetaMes]: d.actual,
    [mes.etiquetaMesPrev]: d.anterior,
  }));

  const tooltipFmt = (v: unknown) => (typeof v === "number" ? formatCurrency(v) : "—");

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
        <BarChart3 className="w-3.5 h-3.5" /> Comparativo de ventas
      </h2>

      {/* Los dos números grandes */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="text-xs text-gray-500">
            Última semana ({ddmm(semana.desde)}–{ddmm(data.hasta)})
          </div>
          <div className="text-2xl font-extrabold text-gray-900 mt-0.5">{formatCurrency(semana.actual)}</div>
          <div className="mt-1.5 flex items-center gap-2">
            <Delta pct={semana.pct} size="lg" />
            <span className="text-xs text-gray-500">vs la semana anterior ({formatCurrency(semana.previa)})</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5">
            Compara la venta promedio por día con datos ({semana.diasActual} vs {semana.diasPrevia} días),
            para que una semana a medio cargar no infle el resultado.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="text-xs text-gray-500 capitalize">
            {mes.etiquetaMes} al día {mes.throughDay ?? "—"}
          </div>
          <div className="text-2xl font-extrabold text-gray-900 mt-0.5">{formatCurrency(mes.totalMes)}</div>
          <div className="mt-1.5 flex items-center gap-2">
            <Delta pct={mes.sameDay.pct} size="lg" />
            <span className="text-xs text-gray-500 capitalize">vs {mes.etiquetaMesPrev}, mismos días</span>
          </div>
          <p className={`text-[11px] mt-1.5 ${mes.lowCoverage ? "text-amber-600" : "text-gray-400"}`}>
            {mes.sameDay.daysCompared} días con dato en ambos meses: {formatCurrency(mes.sameDay.current)} vs{" "}
            {formatCurrency(mes.sameDay.previous)}.
            {mes.lowCoverage && " ⚠ Faltan datos del mes pasado para que el % sea confiable."}
          </p>
          {mes.weekdayShift !== 0 && mes.weekdayAligned.pct !== null && (
            <p className="text-[11px] text-gray-500 mt-1">
              Alineado por día de semana (sábado con sábado):{" "}
              <strong className={mes.weekdayAligned.pct >= 0 ? "text-emerald-600" : "text-red-600"}>
                {mes.weekdayAligned.pct >= 0 ? "+" : ""}{mes.weekdayAligned.pct.toFixed(1)}%
              </strong>
              . Los meses no arrancan el mismo día de la semana, y un sábado no vende como un martes.
            </p>
          )}
        </div>
      </div>

      {/* Gráfica 1 — venta por día del mes, los dos meses superpuestos */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="text-xs font-semibold text-gray-700 mb-2 capitalize">
          Venta por día · {mes.etiquetaMes} vs {mes.etiquetaMesPrev}
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={serieChart} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "#9CA3AF" }} />
            <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
            <Tooltip formatter={tooltipFmt} labelFormatter={(l) => `Día ${l}`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey={mes.etiquetaMesPrev} stroke={GRIS} strokeWidth={2} dot={false} connectNulls />
            <Line type="monotone" dataKey={mes.etiquetaMes} stroke={VERDE} strokeWidth={2.5} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-[11px] text-gray-400 mt-1">
          Cada punto es el mismo número de día en cada mes. Donde la línea verde va por debajo de la gris, ese día vendió menos que el mes pasado.
        </p>
      </div>

      {/* Gráfica 2 — por día de semana (la lectura más justa para café) */}
      {porDiaSemana.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs font-semibold text-gray-700 mb-2 capitalize">
            Venta por día de la semana · {mes.etiquetaMes} vs {mes.etiquetaMesPrev}
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dowChart} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 11, fill: "#6B7280" }} />
              <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={tooltipFmt} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey={mes.etiquetaMesPrev} fill={GRIS} radius={[3, 3, 0, 0]} />
              <Bar dataKey={mes.etiquetaMes} fill={VERDE} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {porDiaSemana.map((d) => (
              <span key={d.dia} className="text-[11px] text-gray-500">
                {d.dia}: <Delta pct={d.pct} />
              </span>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            Empareja el 1er lunes con el 1er lunes, el 2do sábado con el 2do sábado… Es la lectura más
            representativa cuando los meses no arrancan el mismo día.
          </p>
        </div>
      )}

      <p className="text-[11px] text-gray-400">
        Datos hasta el {ddmm(data.hasta)} · fuente:{" "}
        {data.fuente === "byte" ? "reportes Byte" : data.fuente === "mixta" ? "Byte + registro diario" : "registro diario"}
      </p>
    </section>
  );
}
