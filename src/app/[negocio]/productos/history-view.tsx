"use client";

import { useEffect, useState } from "react";
import {
  ComposedChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  getPortfolioHistory,
  type PortfolioHistoryResult,
} from "@/app/actions/portfolio-story";

/**
 * PIC · Vista Histórico: la película completa de todos los meses
 * cargados — serie de venta/utilidad/salud, mayores subidas y caídas
 * del periodo, y proyección del próximo mes con escenarios honestos.
 */
export function HistoryView() {
  const [data, setData] = useState<Extract<PortfolioHistoryResult, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const r = await getPortfolioHistory();
      if (r.ok) setData(r);
      else setError(r.error);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Compilando todos los meses…
      </div>
    );
  }
  if (error || !data) {
    return <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">{error}</div>;
  }

  const chartData = data.months.map((m) => ({
    mes: m.monthLabel.split(" ")[0],
    Venta: m.revenue,
    Utilidad: m.contribution,
    Salud: m.health,
  }));
  const first = data.months[0];
  const last = data.months[data.months.length - 1];
  const changePct = first && last && first.revenue > 0
    ? Math.round(((last.revenue - first.revenue) / first.revenue) * 1000) / 10
    : null;

  return (
    <div className="space-y-4">
      {/* Serie mensual */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <div className="text-sm font-semibold text-gray-900">
            Evolución del portafolio · {data.months.length} meses
          </div>
          {changePct !== null && (
            <div className={`text-xs font-medium ${changePct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              Venta {first.monthLabel.split(" ")[0]} → {last.monthLabel.split(" ")[0]}: {changePct >= 0 ? "+" : ""}{changePct}%
            </div>
          )}
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `S/${Math.round(Number(v) / 1000)}k`} width={44} />
              <Tooltip
                formatter={(value, key) => key === "Salud" ? [`${value}/100`, "Salud"] : [formatCurrency(Number(value)), key]}
                contentStyle={{ fontSize: 11 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Venta" fill="#098B5F" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Utilidad" fill="#004C40" radius={[3, 3, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <table className="w-full text-xs mt-3">
          <thead>
            <tr className="text-[10px] uppercase text-gray-500 bg-gray-50">
              <th className="text-left px-2 py-1.5 font-medium">Mes</th>
              <th className="text-right px-2 py-1.5 font-medium">Venta</th>
              <th className="text-right px-2 py-1.5 font-medium">Utilidad (costeada)</th>
              <th className="text-right px-2 py-1.5 font-medium">Cobertura costos</th>
              <th className="text-right px-2 py-1.5 font-medium">Salud</th>
              <th className="text-right px-2 py-1.5 font-medium">Productos</th>
            </tr>
          </thead>
          <tbody>
            {data.months.map((m) => (
              <tr key={m.month} className="border-t border-gray-100">
                <td className="px-2 py-1.5 font-medium text-gray-900">{m.monthLabel}</td>
                <td className="px-2 py-1.5 text-right font-semibold">{formatCurrency(m.revenue)}</td>
                <td className="px-2 py-1.5 text-right text-gray-700">{formatCurrency(m.contribution)}</td>
                <td className="px-2 py-1.5 text-right text-gray-500">{m.costCoveragePct}%</td>
                <td className={`px-2 py-1.5 text-right font-medium ${m.health >= 75 ? "text-emerald-600" : m.health >= 55 ? "text-gray-700" : "text-amber-600"}`}>{m.health}</td>
                <td className="px-2 py-1.5 text-right text-gray-500">{m.products}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Movers del periodo */}
      {(data.risers.length > 0 || data.fallers.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs font-semibold text-gray-900 mb-2 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" /> Mayores subidas del periodo
            </div>
            {data.risers.length === 0 ? (
              <div className="text-xs text-gray-400">Sin subidas relevantes.</div>
            ) : data.risers.map((m) => (
              <div key={m.name} className="flex justify-between text-xs py-1 border-b border-gray-50 last:border-0">
                <span className="text-gray-700 truncate pr-3">{m.name}</span>
                <span className="shrink-0 text-emerald-600 font-medium">
                  +{m.changePct}% <span className="text-gray-400 font-normal">({formatCurrency(m.firstRevenue)} → {formatCurrency(m.lastRevenue)})</span>
                </span>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs font-semibold text-gray-900 mb-2 flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5 text-red-600" /> Mayores caídas del periodo
            </div>
            {data.fallers.length === 0 ? (
              <div className="text-xs text-gray-400">Sin caídas relevantes.</div>
            ) : data.fallers.map((m) => (
              <div key={m.name} className="flex justify-between text-xs py-1 border-b border-gray-50 last:border-0">
                <span className="text-gray-700 truncate pr-3">{m.name}</span>
                <span className="shrink-0 text-red-600 font-medium">
                  {m.changePct}% <span className="text-gray-400 font-normal">({formatCurrency(m.firstRevenue)} → {formatCurrency(m.lastRevenue)})</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Proyección */}
      {data.projection && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="text-sm font-semibold text-gray-900 mb-2">
            Proyección del próximo mes <span className="text-xs font-normal text-gray-500">· confianza {data.projection.confidence}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
            {data.projection.scenarios.map((s) => (
              <div key={s.scenario} className={`rounded-lg border px-3 py-2 ${s.scenario === "esperado" ? "border-primary/40 bg-primary/5" : "border-gray-100"}`}>
                <div className="text-[11px] text-gray-500 capitalize">{s.scenario}</div>
                <div className="text-sm font-bold text-gray-900">{formatCurrency(s.revenue)}</div>
                <div className="text-[11px] text-gray-400">utilidad ~{formatCurrency(s.contribution)}</div>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-gray-500 italic">
            Base: {data.projection.basis}. Proyección por ritmo real — escenarios, no promesas.
          </div>
        </div>
      )}
    </div>
  );
}
