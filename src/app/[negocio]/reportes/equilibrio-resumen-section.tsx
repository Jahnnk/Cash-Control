"use client";

/**
 * "Punto de equilibrio por mes" — la pestaña "PE Resumen" del Excel de
 * Kelly, dentro del reporte mensual. Cada mes con sus propios números, la
 * segunda cifra "incluyendo deudas" (decisión de Jahnn, 19-sep-2026) y, desde
 * que el Excel usa la lista única de categorías, lo que calculó el Excel.
 */

import { useEffect, useState } from "react";
import { Scale, Loader2 } from "lucide-react";
import { formatCurrency, monthLabel } from "@/lib/utils";
import { getResumenEquilibrio, type FilaResumenEquilibrio } from "@/app/actions/breakeven";

export function EquilibrioResumenSection({ month }: { month: string }) {
  const [data, setData] = useState<{ filas: FilaResumenEquilibrio[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let vivo = true;
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al cambiar mes */
    setLoading(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    getResumenEquilibrio(month)
      .then((r) => { if (vivo) setData(r.ok ? r : null); })
      .catch(() => { if (vivo) setData(null); })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, [month]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-center justify-center text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  if (!data || data.filas.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Scale className="w-4 h-4 text-primary" /> Punto de equilibrio por mes
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Lista única de categorías (la misma del Excel de Kelly) y ventas de su Control de VTAS. Cada mes con sus propios números.
          «Incluyendo deudas» suma las cuotas de préstamos y tarjetas: lo que hay que vender para pagarlas también.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase text-gray-500 bg-gray-50">
              <th className="text-left px-3 py-2 font-medium">Mes</th>
              <th className="text-right px-3 py-2 font-medium">Ventas</th>
              <th className="text-right px-3 py-2 font-medium">Costos variables</th>
              <th className="text-right px-3 py-2 font-medium">Costos fijos</th>
              <th className="text-right px-3 py-2 font-medium">Punto de equilibrio</th>
              <th className="text-right px-3 py-2 font-medium">Incluyendo deudas</th>
              <th className="text-right px-3 py-2 font-medium">Utilidad operativa</th>
              <th className="text-left px-3 py-2 font-medium">Estado</th>
              <th className="text-right px-3 py-2 font-medium">Excel de Kelly</th>
            </tr>
          </thead>
          <tbody>
            {data.filas.map((f) => {
              const difiere = f.excel !== null && f.puntoEquilibrio !== null && Math.abs(f.excel - f.puntoEquilibrio) >= 1;
              return (
                <tr key={f.month} className={`border-t border-gray-100 ${f.month === month ? "bg-primary/5" : ""}`}>
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{monthLabel(f.month)}{f.enCurso && <span className="text-[10px] text-gray-400"> (en curso)</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(f.ventas)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(f.variables)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCurrency(f.fijos)}
                    {f.sinTipo >= 0.01 && <span className="block text-[10px] text-amber-700">+{formatCurrency(f.sinTipo)} sin clasificar</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{f.puntoEquilibrio === null ? "—" : formatCurrency(f.puntoEquilibrio)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                    {f.puntoEquilibrioConDeudas === null ? "—" : formatCurrency(f.puntoEquilibrioConDeudas)}
                    {f.financiamiento >= 0.01 && <span className="block text-[10px] text-gray-400">cuotas {formatCurrency(f.financiamiento)}</span>}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${f.utilidadOperativa < 0 ? "text-red-600" : ""}`}>{formatCurrency(f.utilidadOperativa)}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    {f.sobreEquilibrio === null ? <span className="text-gray-400">—</span>
                      : f.sobreEquilibrio ? <span className="text-emerald-700">✔ Sobre el equilibrio</span>
                      : <span className="text-red-700">✖ Debajo</span>}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${difiere ? "text-red-700 font-semibold" : "text-gray-400"}`}>
                    {f.excel === null ? "—" : formatCurrency(f.excel)}
                    {difiere && <span className="block text-[10px]">no coincide</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
