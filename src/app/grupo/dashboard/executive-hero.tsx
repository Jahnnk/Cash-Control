"use client";

import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Sparkline, ProgressBar } from "@/components/ui/Sparkline";

/**
 * "¿Cómo estamos?" — la primera pregunta del CEO, respondida en menos
 * de 5 segundos: UN número dominante (la liquidez del grupo) y tres
 * lecturas de apoyo. Todo lo demás del dashboard es detalle.
 *
 * Regla de color: el gris es el estado normal. Verde y rojo se reservan
 * para variaciones reales — si todo fuera de color, nada destacaría.
 */

export type HeroStats = {
  liquidez: number;
  ventasMes: number;
  ventasDeltaPct: number | null;
  margen: number;
  /** % del punto de equilibrio del grupo cubierto (0-100+); null sin base. */
  equilibrioPct: number | null;
  /** Serie de venta diaria del grupo (últimos días con datos). */
  serie: number[];
  periodo: string;
};

export function Delta({ pct, className = "" }: { pct: number | null; className?: string }) {
  if (pct === null) return <span className={`text-gray-400 ${className}`}>—</span>;
  const up = pct >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 tabular-nums ${up ? "text-emerald-600" : "text-red-600"} ${className}`}>
      <Icon className="w-3.5 h-3.5" strokeWidth={2.5} />
      {up ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

function Stat({
  label, value, children,
}: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-medium uppercase tracking-[0.09em] text-gray-400">{label}</div>
      <div className="mt-1 text-xl font-semibold text-gray-900 tabular-nums tracking-tight">{value}</div>
      {children && <div className="mt-1.5">{children}</div>}
    </div>
  );
}

export function ExecutiveHero({ s }: { s: HeroStats }) {
  const trendTone = s.ventasDeltaPct === null ? "neutral" : s.ventasDeltaPct >= 0 ? "positive" : "negative";
  const eq = s.equilibrioPct;
  const eqTone = eq === null ? "neutral" : eq >= 100 ? "positive" : eq >= 80 ? "warning" : "negative";

  return (
    <section className="bg-white rounded-2xl border border-gray-200/70 shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-7 sm:p-9">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-6 xl:gap-8">
        {/* El número que manda */}
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">
            Liquidez del grupo · {s.periodo}
          </div>
          <div className="mt-2 text-[2.25rem] sm:text-[2.75rem] xl:text-[3.25rem] font-semibold text-gray-900 tabular-nums tracking-[-0.035em] leading-none">
            {formatCurrency(s.liquidez)}
          </div>
          <div className="mt-3 text-sm text-gray-400">Banco + caja de las tres sedes</div>
        </div>

        {/* La tendencia, sin ejes ni ruido */}
        {s.serie.length >= 2 && (
          <div className="w-full xl:w-60 shrink-0">
            <div className="text-[10px] font-medium uppercase tracking-[0.09em] text-gray-400 mb-1.5">
              Ventas · últimos {s.serie.length} días
            </div>
            <Sparkline points={s.serie} tone={trendTone} height={52} />
          </div>
        )}
      </div>

      {/* Tres lecturas de apoyo, separadas por aire y no por líneas */}
      <div className="mt-8 pt-7 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-7 sm:gap-10">
        <Stat label="Ventas del mes" value={formatCurrency(s.ventasMes)}>
          <div className="text-xs">
            <Delta pct={s.ventasDeltaPct} className="font-semibold" />
            <span className="text-gray-400 ml-1.5">vs mes pasado</span>
          </div>
        </Stat>
        <Stat label="Margen consolidado" value={formatCurrency(s.margen)}>
          <div className="text-xs text-gray-400">Ingresos − gastos del mes</div>
        </Stat>
        <Stat label="Punto de equilibrio" value={eq === null ? "—" : `${Math.round(eq)}%`}>
          {eq !== null ? (
            <>
              <ProgressBar pct={eq} tone={eqTone} />
              <div className="mt-1.5 text-xs text-gray-400">
                {eq >= 100 ? "Costos cubiertos" : `Falta ${Math.round(100 - eq)}% para cubrir costos`}
              </div>
            </>
          ) : (
            <div className="text-xs text-gray-400">Sin base de cálculo</div>
          )}
        </Stat>
      </div>
    </section>
  );
}
