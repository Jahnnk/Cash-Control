"use client";

import { useState, useEffect } from "react";
import { getDebtAgingReport } from "@/app/actions/reports";
import { formatCurrency, formatDateShort } from "@/lib/utils";

type DebtData = {
  dailyData: Record<string, unknown>[];
  totalByte: number;
  totalCollected: number;
  totalPending: number;
};

export function DebtAgingReport() {
  const [data, setData] = useState<DebtData | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (!data) return null;

  const pct = data.totalByte > 0
    ? ((data.totalCollected / data.totalByte) * 100).toFixed(1)
    : "0";

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="text-sm text-gray-600 mb-1">Total vendido (Byte)</div>
          <div className="text-2xl font-bold text-gray-900">
            {formatCurrency(data.totalByte)}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="text-sm text-gray-600 mb-1">Total cobrado (BCP)</div>
          <div className="text-2xl font-bold text-primary-light">
            {formatCurrency(data.totalCollected)}
          </div>
          <div className="text-xs text-gray-500 mt-1">{pct}% recuperado</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 border-l-4 border-l-amber-500">
          <div className="text-sm text-gray-600 mb-1">Pendiente por cobrar</div>
          <div className="text-2xl font-bold text-amber-600">
            {formatCurrency(Math.max(0, data.totalPending))}
          </div>
          <div className="text-xs text-gray-500 mt-1">Diferencia Byte - BCP</div>
        </div>
      </div>

      {/* Progress bar */}
      {data.totalByte > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Porcentaje de cobro</span>
            <span className="text-sm font-bold text-primary-light">{pct}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-primary-light h-3 rounded-full transition-all"
              style={{ width: `${Math.min(100, parseFloat(pct))}%` }}
            />
          </div>
        </div>
      )}

      {/* Daily breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">
            Detalle diario: Byte vs BCP
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-left">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium text-right">Byte Total</th>
                <th className="px-4 py-3 font-medium text-right">Ingreso BCP</th>
                <th className="px-4 py-3 font-medium text-right">Diferencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.dailyData.map((row) => {
                const gap = parseFloat(row.daily_gap as string);
                return (
                  <tr key={row.date as string} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">
                      {formatDateShort(row.date as string)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatCurrency(row.byte_total as string)}
                    </td>
                    <td className="px-4 py-3 text-right text-primary-light">
                      {formatCurrency(row.bank_income as string)}
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${gap > 0 ? "text-amber-600" : "text-primary-light"}`}>
                      {gap > 0 ? "+" : ""}{formatCurrency(gap)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
