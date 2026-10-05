"use client";

/**
 * Gráfico de la demanda de un producto mes a mes (unidades por semana).
 *
 * Pedido de Jahnn (5-oct-2026): ver, para un candidato a reemplazo, cómo ha ido su
 * demanda en los últimos meses. Una línea por sede (círculo / cuadrado, no solo
 * color), la recta de tendencia punteada sobre los meses completos, y el mes
 * incompleto (el que está en curso) como punto hueco: no cuenta en la tendencia.
 * Pasando el mouse por un mes se leen los números de ese mes.
 */

import { useMemo, useState } from "react";
import { rectaDeTendencia } from "@/lib/productos/tendencia";
import { nombreMes } from "@/components/productos/ui";

export type SerieDemanda = {
  nombre: string;
  color: string;
  forma: "circulo" | "cuadrado";
  puntos: { month: string; completo: boolean; porSemana: number }[];
};

const W = 560, H = 176, PL = 36, PR = 14, PT = 12, PB = 24;

/** Un tope «redondo» para el eje vertical. */
function topeEje(max: number): number {
  if (max <= 0) return 1;
  const pasos = [1, 2, 3, 5, 8, 10, 15, 20, 30, 50, 80, 100, 150, 200];
  return pasos.find((p) => p >= max * 1.05) ?? Math.ceil(max * 1.1);
}

const num = (n: number) => (n >= 10 ? n.toFixed(0) : n.toFixed(1));

export function GraficoDemanda({ series, titulo = "Unidades por semana" }: { series: SerieDemanda[]; titulo?: string }) {
  const [activo, setActivo] = useState<number | null>(null);
  const meses = useMemo(() => [...new Set(series.flatMap((s) => s.puntos.map((p) => p.month)))].sort(), [series]);
  if (meses.length === 0) return null;

  const max = Math.max(0, ...series.flatMap((s) => s.puntos.map((p) => p.porSemana)));
  const tope = topeEje(max);
  const x = (i: number) => (meses.length === 1 ? (PL + W - PR) / 2 : PL + (i * (W - PL - PR)) / (meses.length - 1));
  const y = (v: number) => H - PB - (v / tope) * (H - PT - PB);
  const ticks = [0, tope / 2, tope];

  const valorEn = (s: SerieDemanda, m: string) => s.puntos.find((p) => p.month === m);
  const resumenAria = series.map((s) => `${s.nombre}: ${s.puntos.map((p) => `${nombreMes(p.month, true)} ${num(p.porSemana)}`).join(", ")}`).join(". ");
  const mesActivo = activo !== null ? meses[activo] : null;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[11px] text-gray-500 mb-1">
        <span className="font-medium text-gray-700">{titulo}</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {series.map((s) => (
            <span key={s.nombre} className="inline-flex items-center gap-1 text-gray-700">
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                {s.forma === "circulo" ? <circle cx="5" cy="5" r="4" fill={s.color} /> : <rect x="1" y="1" width="8" height="8" rx="1" fill={s.color} />}
              </svg>
              {s.nombre}
            </span>
          ))}
          <span className="inline-flex items-center gap-1">
            <svg width="16" height="6" viewBox="0 0 16 6" aria-hidden><line x1="0" y1="3" x2="16" y2="3" stroke="#6B7280" strokeWidth="1.5" strokeDasharray="3 2" /></svg>
            tendencia
          </span>
        </span>
      </div>
      {/* Lectura del mes bajo el puntero: siempre ocupa su lugar para que el gráfico no salte. */}
      <div className="h-4 text-[11px] tabular-nums text-gray-700 mb-0.5" aria-live="polite">
        {mesActivo
          ? <>{nombreMes(mesActivo)}: {series.map((s, i) => { const p = valorEn(s, mesActivo); return p ? <span key={s.nombre}>{i > 0 ? " · " : ""}{s.nombre} <b>{num(p.porSemana)}</b>{p.completo ? "" : " (mes a medias)"}</span> : null; })}</>
          : <span className="text-gray-400">Pasa el mouse por un mes para ver sus números.</span>}
      </div>
      <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[440px]" role="img" aria-label={`${titulo}. ${resumenAria}`} onMouseLeave={() => setActivo(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke="#E5E7EB" strokeWidth="1" />
            <text x={PL - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#6B7280">{num(t)}</text>
          </g>
        ))}
        {meses.map((m, i) => (
          <text key={m} x={x(i)} y={H - 7} textAnchor="middle" fontSize="10" fill={activo === i ? "#111827" : "#6B7280"} fontWeight={activo === i ? 600 : 400}>{nombreMes(m, true)}</text>
        ))}
        {activo !== null && <line x1={x(activo)} x2={x(activo)} y1={PT} y2={H - PB} stroke="#9CA3AF" strokeWidth="1" strokeDasharray="2 2" />}
        {series.map((s) => {
          const idx = (m: string) => meses.indexOf(m);
          const completos = s.puntos.filter((p) => p.completo);
          const recta = rectaDeTendencia(completos.map((p) => p.porSemana));
          const linea = completos.map((p, k) => `${k === 0 ? "M" : "L"}${x(idx(p.month)).toFixed(1)},${y(p.porSemana).toFixed(1)}`).join(" ");
          const medias = s.puntos.filter((p) => !p.completo);
          return (
            <g key={s.nombre}>
              {recta && completos.length >= 2 && (
                <line x1={x(idx(completos[0].month))} y1={y(recta[0])} x2={x(idx(completos[completos.length - 1].month))} y2={y(recta[recta.length - 1])}
                  stroke={s.color} strokeOpacity="0.55" strokeWidth="1.5" strokeDasharray="4 3" />
              )}
              <path d={linea} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {/* El mes a medias se une con línea suelta, sin tendencia. */}
              {medias.length > 0 && completos.length > 0 && medias.map((p) => (
                <line key={`u-${p.month}`} x1={x(idx(completos[completos.length - 1].month))} y1={y(completos[completos.length - 1].porSemana)} x2={x(idx(p.month))} y2={y(p.porSemana)}
                  stroke={s.color} strokeOpacity="0.4" strokeWidth="1.5" strokeDasharray="1 3" />
              ))}
              {s.puntos.map((p) => {
                const cx = x(idx(p.month)), cy = y(p.porSemana);
                const relleno = p.completo ? s.color : "white";
                return s.forma === "circulo"
                  ? <circle key={p.month} cx={cx} cy={cy} r="3.8" fill={relleno} stroke={s.color} strokeWidth="2" />
                  : <rect key={p.month} x={cx - 3.6} y={cy - 3.6} width="7.2" height="7.2" rx="1" fill={relleno} stroke={s.color} strokeWidth="2" />;
              })}
            </g>
          );
        })}
        {meses.map((m, i) => (
          <rect key={`h-${m}`} x={x(i) - (W - PL - PR) / meses.length / 2} y={0} width={(W - PL - PR) / meses.length} height={H} fill="transparent" onMouseEnter={() => setActivo(i)} />
        ))}
      </svg>
      </div>
    </div>
  );
}
