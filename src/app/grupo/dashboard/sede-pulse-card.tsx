"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Sparkline, ProgressBar } from "@/components/ui/Sparkline";
import { Delta } from "./executive-hero";
import { BUSINESS_THEMES, type ScopeCode } from "@/lib/business-theme";

/**
 * "¿Qué negocio preocupa? ¿Cuál va mejor?" — una tarjeta por sede,
 * ORDENADAS por desempeño, con la señal arriba y el detalle abajo.
 *
 * La identidad de cada sede nunca depende SOLO del color: siempre va
 * su nombre y su ícono junto al punto de color.
 */

export type SedePulse = {
  businessId: number;
  code: ScopeCode;
  nombre: string;
  ventasMes: number;
  deltaPct: number | null;
  /** Días emparejados del comparativo; <10 = poco confiable. */
  diasComparados: number;
  coberturaBaja: boolean;
  saldo: number;
  /** % del punto de equilibrio cubierto (0-100+); null sin base. */
  equilibrioPct: number | null;
  serie: number[];
  hasta: string | null;
  /** Etiqueta destacada: la sede que más preocupa o la que va mejor. */
  flag: "atencion" | "mejor" | null;
};

function ddmm(iso: string | null) {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—";
}

export function SedePulseCard({ s }: { s: SedePulse }) {
  const theme = BUSINESS_THEMES[s.code];
  const Icon = theme.icon;
  const tone = s.deltaPct === null ? "neutral" : s.deltaPct >= 0 ? "positive" : "negative";
  const eq = s.equilibrioPct;
  const eqTone = eq === null ? "neutral" : eq >= 100 ? "positive" : eq >= 80 ? "warning" : "negative";

  return (
    <Link
      href={`/${s.code}/dashboard`}
      className="group block bg-white rounded-2xl border border-gray-200/70 shadow-[0_1px_3px_rgba(15,23,42,0.04)]
                 p-6 transition-all duration-200 hover:shadow-[0_8px_24px_rgba(15,23,42,0.07)]
                 hover:border-gray-300/70 hover:-translate-y-0.5"
    >
      {/* Identidad + señal */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-8 h-8 rounded-lg grid place-items-center shrink-0"
            style={{ backgroundColor: theme.colorSoft, color: theme.color }}
          >
            <Icon className="w-4 h-4" />
          </span>
          <span className="text-sm font-semibold text-gray-900 truncate">{s.nombre}</span>
        </div>
        {s.flag === "atencion" && (
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-50 text-red-700">
            Atención
          </span>
        )}
        {s.flag === "mejor" && (
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
            Mejor
          </span>
        )}
      </div>

      {/* El número de la sede */}
      <div className="mt-5">
        <div className="text-3xl font-semibold text-gray-900 tabular-nums tracking-[-0.03em] leading-none">
          {formatCurrency(s.ventasMes)}
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-xs">
          <Delta pct={s.deltaPct} className="font-semibold" />
          <span className="text-gray-400">
            vs mes pasado
            {s.coberturaBaja && <span className="text-amber-600"> · {s.diasComparados} días</span>}
          </span>
        </div>
      </div>

      {/* Tendencia */}
      {s.serie.length >= 2 && (
        <div className="mt-5">
          <Sparkline points={s.serie} tone={tone} height={38} />
        </div>
      )}

      {/* Equilibrio + saldo, en voz baja */}
      <div className="mt-5 space-y-2.5">
        {eq !== null && (
          <div>
            <div className="flex items-baseline justify-between text-[11px] mb-1.5">
              <span className="text-gray-400">Equilibrio</span>
              <span className="font-medium text-gray-600 tabular-nums">{Math.round(eq)}%</span>
            </div>
            <ProgressBar pct={eq} tone={eqTone} />
          </div>
        )}
        <div className="flex items-baseline justify-between text-[11px] pt-1">
          <span className="text-gray-400">Saldo</span>
          <span className="font-medium text-gray-600 tabular-nums">{formatCurrency(s.saldo)}</span>
        </div>
      </div>

      {/* Microinteracción: el pie aparece al pasar el mouse */}
      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
        <span className="text-[11px] text-gray-400">Datos al {ddmm(s.hasta)}</span>
        <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-gray-400 group-hover:text-primary transition-colors">
          Abrir
          <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </span>
      </div>
    </Link>
  );
}
