"use client";

import { useState, useEffect } from "react";
import { getDebtAgingReport } from "@/app/actions/reports";
import { formatCurrency, agingColor } from "@/lib/utils";

type AgingRange = {
  range: string;
  total: number;
  clients: { name: string; amount: number }[];
};

const RANGE_LABELS: Record<string, string> = {
  "0-7": "0–7 días",
  "8-15": "8–15 días",
  "16-30": "16–30 días",
  "31-60": "31–60 días",
  "60+": "60+ días",
};

const RANGE_COLORS: Record<string, string> = {
  "0-7": "bg-green-500",
  "8-15": "bg-yellow-400",
  "16-30": "bg-orange-500",
  "31-60": "bg-red-500",
  "60+": "bg-red-700",
};

export function DebtAgingReport() {
  const [data, setData] = useState<AgingRange[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    getDebtAgingReport().then((d) => {
      setData(d);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
        Cargando...
      </div>
    );
  }

  const grandTotal = data?.reduce((s, r) => s + r.total, 0) || 0;

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">
            Total cuentas por cobrar
          </h3>
          <span className="text-xl font-bold text-gray-900">
            {formatCurrency(grandTotal)}
          </span>
        </div>
        {grandTotal > 0 && (
          <div className="flex rounded-lg overflow-hidden h-4">
            {data?.map(
              (range) =>
                range.total > 0 && (
                  <div
                    key={range.range}
                    className={`${RANGE_COLORS[range.range]} transition-all`}
                    style={{ width: `${(range.total / grandTotal) * 100}%` }}
                    title={`${RANGE_LABELS[range.range]}: ${formatCurrency(range.total)}`}
                  />
                )
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-4 mt-3">
          {data?.map((range) => (
            <div key={range.range} className="flex items-center gap-2 text-xs text-gray-600">
              <span className={`w-3 h-3 rounded-full ${RANGE_COLORS[range.range]}`} />
              {RANGE_LABELS[range.range]}
            </div>
          ))}
        </div>
      </div>

      {/* Ranges */}
      {data?.map((range) => (
        <div
          key={range.range}
          className="bg-white rounded-xl border border-gray-200 overflow-hidden"
        >
          <button
            onClick={() => setExpanded(expanded === range.range ? null : range.range)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50"
          >
            <div className="flex items-center gap-3">
              <span className={`w-3 h-3 rounded-full ${RANGE_COLORS[range.range]}`} />
              <span className="font-semibold text-gray-900">
                {RANGE_LABELS[range.range]}
              </span>
              <span className="text-sm text-gray-500">
                ({range.clients.length} clientes)
              </span>
            </div>
            <span className="text-lg font-bold text-gray-900">
              {formatCurrency(range.total)}
            </span>
          </button>

          {expanded === range.range && range.clients.length > 0 && (
            <div className="border-t border-gray-100">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {range.clients
                    .sort((a, b) => b.amount - a.amount)
                    .map((client) => (
                      <tr key={client.name} className="hover:bg-gray-50">
                        <td className="px-6 py-3 pl-12">{client.name}</td>
                        <td className="px-6 py-3 text-right font-medium">
                          {formatCurrency(client.amount)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
