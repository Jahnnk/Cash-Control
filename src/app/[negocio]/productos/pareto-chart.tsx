"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, Cell,
} from "recharts";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { computeParetoCurve } from "@/lib/portfolio/history";
import type { ProductIntel } from "@/lib/portfolio/types";

/**
 * PIC · Pareto 80/20 gráfico: qué pocos productos generan el 80% de la
 * UTILIDAD (barras = utilidad por producto; línea = % acumulado; los del
 * top-80% en verde marca). Solo productos costeados — y se dice.
 */
export function ParetoChart({ products }: { products: ProductIntel[] }) {
  const [showList, setShowList] = useState(false);
  const pareto = useMemo(
    () => computeParetoCurve(products.map((p) => ({ name: p.name, contribution: p.contribution }))),
    [products],
  );
  if (pareto.points.length < 5) return null;

  const chartData = pareto.points.slice(0, 40).map((p) => ({
    name: p.name,
    utilidad: p.contribution,
    acumulado: p.cumulativePct,
    inTop80: p.inTop80,
  }));
  const top80 = pareto.points.filter((p) => p.inTop80);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="text-sm font-semibold text-gray-900">Pareto de la utilidad (80/20)</div>
      <p className="text-xs text-gray-600 mt-1 mb-3">
        <strong className="text-primary">
          {pareto.top80Count} de {pareto.totalCount} productos ({pareto.top80SharePct}%)
        </strong>{" "}
        generan el 80% de tu utilidad. Calculado sobre los productos con costo conocido.
      </p>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <XAxis dataKey="name" hide />
            <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v) => `S/${Math.round(Number(v))}`} width={52} />
            <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} width={36} />
            <Tooltip
              formatter={(value, key) =>
                key === "utilidad"
                  ? [formatCurrency(Number(value)), "Utilidad del mes"]
                  : [`${value}%`, "Acumulado"]
              }
              labelStyle={{ fontSize: 11 }}
              contentStyle={{ fontSize: 11 }}
            />
            <ReferenceLine yAxisId="right" y={80} stroke="#DC2626" strokeDasharray="4 4" />
            <Bar yAxisId="left" dataKey="utilidad" radius={[2, 2, 0, 0]}>
              {chartData.map((d) => (
                <Cell key={d.name} fill={d.inTop80 ? "#098B5F" : "#D1D5DB"} />
              ))}
            </Bar>
            <Line yAxisId="right" dataKey="acumulado" stroke="#004C40" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <button
        onClick={() => setShowList((v) => !v)}
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-light"
      >
        {showList ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        Ver los {pareto.top80Count} productos que sostienen la utilidad
      </button>
      {showList && (
        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
          {top80.map((p, i) => (
            <div key={p.name} className="flex justify-between text-xs border-b border-gray-50 py-1">
              <span className="text-gray-700 truncate pr-3">{i + 1}. {p.name}</span>
              <span className="shrink-0 text-gray-500">
                {formatCurrency(p.contribution)} <span className="text-gray-400">({p.share}%)</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
