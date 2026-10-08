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
  /** Banco + caja de la sede: la misma cifra que la liquidez de arriba. */
  saldo: number;
  /** Plata que entró en el mes (banco + caja): la misma cifra del Excel de Kelly. */
  ingresosMes: number;
  /** Plata que salió en el mes: la misma cifra del Excel de Kelly. */
  gastosMes: number;
  /** De esos gastos, cuotas de préstamos y tarjetas, ahorro y préstamos a otra sede. */
  deudaAhorro: number;
  /**
   * ¿Ingresos y gastos coinciden con el Excel de Kelly del mes? (verificación
   * automática). null = no hay Excel cargado con foto.
   */
  excelKelly: { igual: boolean; ingresos: number; gastos: number } | null;
  /** % del punto de equilibrio cubierto (0-100+); null sin base. */
  equilibrioPct: number | null;
  serie: number[];
  hasta: string | null;
  /** Meta de ventas del mes (venta esperada del presupuesto aprobado); null sin presupuesto. */
  meta: number | null;
  /** Etiqueta destacada: la sede que más preocupa o la que va mejor. */
  flag: "atencion" | "mejor" | null;
};

function ddmm(iso: string | null) {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—";
}

/**
 * ¿Hasta qué día está al día la venta? Lo normal es "ayer": el
 * administrador registra al día siguiente del cierre de Byte. Si falta
 * ayer o más, se avisa cuántos días faltan (Jahnn la revisa cada mañana).
 */
function diasSinRegistrar(hasta: string | null): number | null {
  if (!hasta) return null;
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const dias = Math.round((Date.parse(hoy + "T12:00:00Z") - Date.parse(hasta + "T12:00:00Z")) / 86_400_000);
  return Math.max(0, dias - 1);
}

export function SedePulseCard({ s }: { s: SedePulse }) {
  const theme = BUSINESS_THEMES[s.code];
  const Icon = theme.icon;
  const tone = s.deltaPct === null ? "neutral" : s.deltaPct >= 0 ? "positive" : "negative";
  const eq = s.equilibrioPct;
  const faltan = diasSinRegistrar(s.hasta);
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
          <ArrowUpRight className="w-3.5 h-3.5 text-gray-300 transition-colors group-hover:text-primary" aria-hidden />
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
        <div className="text-[10px] font-medium uppercase tracking-[0.09em] text-gray-400 mb-1.5">Vendido del mes</div>
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
        {s.hasta && (
          <div className={`mt-1.5 text-[11px] ${faltan ? "text-amber-600" : "text-gray-400"}`}>
            {faltan
              ? `⚠ Al día hasta el ${ddmm(s.hasta)} · ${faltan === 1 ? "falta 1 día" : `faltan ${faltan} días`}`
              : `✓ Al día hasta el ${ddmm(s.hasta)}`}
          </div>
        )}
      </div>

      {/* Tendencia */}
      {s.serie.length >= 2 && (
        <div className="mt-5">
          <Sparkline points={s.serie} tone={tone} height={38} />
        </div>
      )}

      {/* Una sola barra: contra la meta del presupuesto si hay; si no, el punto de equilibrio. */}
      <div className="mt-5">
        {s.meta ? (
          <>
            <div className="flex items-baseline justify-between text-[11px] mb-1.5">
              <span className="text-gray-500">Meta {formatCurrency(s.meta)}</span>
              <span className="font-medium text-gray-700 tabular-nums">{Math.round((s.ventasMes / s.meta) * 100)}%</span>
            </div>
            <ProgressBar pct={(s.ventasMes / s.meta) * 100} tone={s.ventasMes >= s.meta ? "positive" : "neutral"} />
            {eq !== null && <div className="mt-2 text-[11px] text-gray-500">Punto de equilibrio: <span className={`font-medium tabular-nums ${eq >= 100 ? "text-emerald-700" : "text-gray-700"}`}>{Math.round(eq)}% cubierto</span></div>}
          </>
        ) : eq !== null ? (
          <>
            <div className="flex items-baseline justify-between text-[11px] mb-1.5">
              <span className="text-gray-500">Punto de equilibrio</span>
              <span className="font-medium text-gray-700 tabular-nums">{Math.round(eq)}%</span>
            </div>
            <ProgressBar pct={eq} tone={eqTone} />
          </>
        ) : null}
      </div>
    </Link>
  );
}
