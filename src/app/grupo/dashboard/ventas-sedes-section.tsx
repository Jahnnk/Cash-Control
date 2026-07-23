"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { GroupVentasSede } from "@/app/actions/group-ventas";
import { BUSINESS_THEMES, type ScopeCode } from "@/lib/business-theme";

/**
 * Dashboard de Grupo · "Ventas al último reporte" (pedido jul-2026).
 * Una tarjeta por sede: última semana con datos vs la semana anterior,
 * y mes acumulado vs el mes pasado a MISMOS días transcurridos.
 * Mismo cerebro que la lámina de ventas del deck (compareVentasSede).
 */

const SEDE_CODE: Record<number, ScopeCode> = { 1: "atelier", 2: "fonavi", 3: "centro" };

function ddmm(iso: string | null): string {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—";
}

function Delta({ pct }: { pct: number | null }) {
  if (pct === null) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-gray-400">
        <Minus className="w-3 h-3" /> sin comparación
      </span>
    );
  }
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${up ? "text-emerald-600" : "text-red-600"}`}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {up ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

export function VentasSedesSection({ sedes }: { sedes: GroupVentasSede[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        Ventas al último reporte
      </h2>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {sedes.map((s) => {
          const code = SEDE_CODE[s.businessId];
          const theme = code ? BUSINESS_THEMES[code] : null;
          return (
            <div
              key={s.businessId}
              className="bg-white rounded-xl border border-gray-200 p-4"
              style={theme ? { borderLeftColor: theme.color, borderLeftWidth: 4 } : undefined}
            >
              <div className="text-sm font-semibold text-gray-900">{s.sede}</div>
              {s.hasta === null ? (
                <div className="mt-2 text-xs text-gray-400">
                  Sin datos de ventas aún — sube el reporte de Ventas Byte o el registro diario.
                </div>
              ) : (
                <>
                  <div className="mt-2.5 flex items-baseline justify-between gap-2">
                    <div>
                      <div className="text-[11px] text-gray-500">Última semana ({ddmm(shift(s.hasta, -6))}–{ddmm(s.hasta)})</div>
                      <div className="text-base font-bold text-gray-900">{formatCurrency(s.rango)}</div>
                    </div>
                    <div className="text-right">
                      <Delta pct={s.deltaRangoPct} />
                      <div className="text-[10px] text-gray-400">vs semana anterior</div>
                      {s.rangoPrevDias > 0 && s.rangoPrevDias !== s.rangoDias && (
                        <div className="text-[10px] text-amber-600">anterior: {s.rangoPrevDias}/{s.rangoDias} días</div>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between gap-2 border-t border-gray-100 pt-2">
                    <div>
                      <div className="text-[11px] text-gray-500">Mes (al {ddmm(s.hasta)})</div>
                      <div className="text-base font-bold text-gray-900">{formatCurrency(s.mes)}</div>
                    </div>
                    <div className="text-right">
                      <Delta pct={s.deltaMesPct} />
                      <div className="text-[10px] text-gray-400">vs mes pasado, mismos días</div>
                      {s.mesPrevDias > 0 && s.mesPrevDias !== s.mesDias && (
                        <div className="text-[10px] text-amber-600">mes pasado: {s.mesPrevDias}/{s.mesDias} días</div>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 text-[10px] text-gray-400">
                    Datos hasta el {ddmm(s.hasta)} · fuente: {s.fuente === "byte" ? "reportes Byte" : s.fuente === "mixta" ? "Byte + registro diario" : "registro diario"}
                    <br />El % compara la venta promedio por día con datos.
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function shift(date: string, days: number): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
