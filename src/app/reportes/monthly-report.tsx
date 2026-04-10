"use client";

import { useState, useEffect } from "react";
import { getMonthlyReport } from "@/app/actions/reports";
import { formatCurrency } from "@/lib/utils";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

const PIE_COLORS = [
  "#004C40", "#098B5F", "#22C55E", "#EAB308", "#F97316",
  "#DC2626", "#8B5CF6", "#3B82F6", "#EC4899", "#6B7280",
  "#14B8A6", "#A855F7", "#F59E0B",
];

function getCurrentMonth() {
  return new Date().toISOString().substring(0, 7);
}

type MonthlyData = {
  totals: Record<string, unknown>;
  bankStartBalance: number;
  bankEndBalance: number;
  byCategory: Record<string, unknown>[];
};

export function MonthlyReport() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [data, setData] = useState<MonthlyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getMonthlyReport(month).then((d) => {
      setData(d);
      setLoading(false);
    });
  }, [month]);

  const donutData = data?.byCategory.map((row) => ({
    name: row.category as string,
    value: parseFloat(row.total as string),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-600">Mes:</label>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
          Cargando...
        </div>
      ) : data ? (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              label="Ventas Byte"
              value={formatCurrency(data.totals.total_byte as string)}
            />
            <SummaryCard
              label="Ingresos BCP"
              value={formatCurrency(data.totals.total_income as string)}
              color="text-primary-light"
            />
            <SummaryCard
              label="Egresos totales"
              value={formatCurrency(data.totals.total_expenses as string)}
              color="text-red-600"
            />
            <SummaryCard
              label="Variación saldo banco"
              value={formatCurrency(data.bankEndBalance - data.bankStartBalance)}
              color={
                data.bankEndBalance - data.bankStartBalance >= 0
                  ? "text-primary-light"
                  : "text-red-600"
              }
            />
          </div>

          {/* Expenses by category */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {donutData && donutData.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">
                  Egresos por categoría
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {donutData.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Legend
                      layout="vertical"
                      align="right"
                      verticalAlign="middle"
                      wrapperStyle={{ fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">Detalle por categoría</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-6 py-3 text-left font-medium text-gray-600">Categoría</th>
                      <th className="px-6 py-3 text-right font-medium text-gray-600">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.byCategory.map((row, i) => (
                      <tr key={row.category as string}>
                        <td className="px-6 py-3 flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                          />
                          {row.category as string}
                        </td>
                        <td className="px-6 py-3 text-right font-medium">
                          {formatCurrency(row.total as string)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color = "text-gray-900",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="text-sm text-gray-600 mb-1">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
