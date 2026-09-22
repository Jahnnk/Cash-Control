"use client";

/**
 * "Cómo va tu carta" en el panel de sede: la versión corta del informe
 * trimestral (decisión de Jahnn, 22-sep-2026 — el detalle con clase ABC y
 * recomendaciones de carta se queda en dirección).
 *
 * El administrador ve sus tres meses, qué categorías pesan más, su top 10 y
 * qué productos subieron o cayeron.
 */

import { useEffect, useState } from "react";
import { Loader2, TrendingUp, TrendingDown, LineChart } from "lucide-react";
import { formatCurrency, monthLabel } from "@/lib/utils";
import { getTrimestreSede, type TrimestreSede } from "@/app/actions/productos-panorama";

export function TrimestreCard({ month }: { month: string }) {
  const [data, setData] = useState<TrimestreSede | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    /* eslint-disable react-hooks/set-state-in-effect -- se recarga al cambiar de mes */
    setCargando(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    getTrimestreSede(month)
      .then((r) => { if (vivo) setData(r.ok ? r.data : null); })
      .catch(() => { if (vivo) setData(null); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [month]);

  if (cargando) {
    return <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-center justify-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  }
  if (!data) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div>
        <div className="text-base font-bold text-gray-900 flex items-center gap-2">
          <LineChart className="w-5 h-5 text-primary" /> Cómo va tu carta · últimos 3 meses
        </div>
        <div className="text-[11px] text-gray-500">
          {data.meses.map((m) => monthLabel(m.month)).join(" · ")} · {formatCurrency(data.ventas)} vendidos en productos
        </div>
      </div>

      {/* Meses */}
      <div className="grid grid-cols-3 gap-2">
        {data.meses.map((m) => (
          <div key={m.month} className="rounded-xl border border-gray-200 p-2.5">
            <div className="text-[11px] text-gray-500">{monthLabel(m.month)}</div>
            <div className="text-base font-bold text-gray-900 tabular-nums">{formatCurrency(m.ventas)}</div>
            <div className="text-[10px] text-gray-500">{m.unidades} unidades{m.incompleto ? " · mes incompleto" : ""}</div>
            {m.sospechoso && <div className="text-[10px] text-red-700">falta subir reportes de este mes</div>}
          </div>
        ))}
      </div>

      {/* Categorías */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase text-gray-500 bg-gray-50">
              <th className="text-left px-3 py-1.5 font-medium">Categoría</th>
              {data.meses.map((m) => <th key={m.month} className="text-right px-2 py-1.5 font-medium">{monthLabel(m.month).split(" ")[0]}</th>)}
              <th className="text-right px-2 py-1.5 font-medium">% del total</th>
            </tr>
          </thead>
          <tbody>
            {data.familias.map((f) => (
              <tr key={f.familia} className="border-t border-gray-100">
                <td className="px-3 py-1.5 text-gray-800">{f.familia}</td>
                {data.meses.map((m) => (
                  <td key={m.month} className="px-2 py-1.5 text-right tabular-nums text-gray-600">
                    {formatCurrency(f.porMes.find((x) => x.month === m.month)?.ventas ?? 0)}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right tabular-nums font-medium">{f.pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Top 10 + qué se movió */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-3 py-2 bg-gray-50 text-sm font-semibold text-gray-800">Tus 10 productos con más ingresos</div>
          <ol className="divide-y divide-gray-100">
            {data.top.map((p, i) => (
              <li key={p.nombre} className="px-3 py-1.5 flex justify-between gap-2 text-sm">
                <span className="text-gray-800 truncate">{i + 1}. {p.nombre}</span>
                <span className="tabular-nums shrink-0">{p.unidades} u · <strong>{formatCurrency(p.ingresos)}</strong></span>
              </li>
            ))}
          </ol>
        </div>
        <div className="space-y-2">
          <div className="rounded-xl border border-emerald-200 overflow-hidden">
            <div className="px-3 py-2 bg-emerald-50 text-sm font-semibold text-emerald-900 flex items-center gap-1.5"><TrendingUp className="w-4 h-4" /> Los que más subieron</div>
            <ul className="divide-y divide-gray-100">
              {data.suben.map((p) => (
                <li key={p.nombre} className="px-3 py-1.5 flex justify-between gap-2 text-sm">
                  <span className="text-gray-800 truncate">{p.nombre}</span>
                  <span className="tabular-nums text-emerald-700 shrink-0">+{p.variacionPct}%</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-red-200 overflow-hidden">
            <div className="px-3 py-2 bg-red-50 text-sm font-semibold text-red-900 flex items-center gap-1.5"><TrendingDown className="w-4 h-4" /> Los que más cayeron</div>
            <ul className="divide-y divide-gray-100">
              {data.bajan.map((p) => (
                <li key={p.nombre} className="px-3 py-1.5 flex justify-between gap-2 text-sm">
                  <span className="text-gray-800 truncate">{p.nombre}</span>
                  <span className="tabular-nums text-red-700 shrink-0">{p.variacionPct}%</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div className="text-[11px] text-gray-400">
        Compara el último mes contra el primero. Una caída puede ser falta de stock y no de demanda: si sabes de un quiebre, avísalo.
      </div>
    </div>
  );
}
