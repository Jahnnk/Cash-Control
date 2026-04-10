"use client";

import { useState, useEffect } from "react";
import { getWeeklyReport } from "@/app/actions/reports";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

function getWeekRange(weeksAgo: number = 0) {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset - weeksAgo * 7);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    start: monday.toISOString().split("T")[0],
    end: sunday.toISOString().split("T")[0],
  };
}

export function WeeklyReport() {
  const [weeksAgo, setWeeksAgo] = useState(0);
  const [data, setData] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(true);

  const range = getWeekRange(weeksAgo);

  useEffect(() => {
    setLoading(true);
    getWeeklyReport(range.start, range.end).then((d) => {
      setData(d);
      setLoading(false);
    });
  }, [range.start, range.end]);

  const chartData = data?.map((row) => ({
    name: formatDateShort(row.date as string),
    Ventas: parseFloat(row.sales_total as string),
    Cobros: parseFloat(row.collections_total as string),
    Egresos: parseFloat(row.expenses_total as string),
  }));

  const totals = data
    ? {
        sales: data.reduce((s, r) => s + parseFloat(r.sales_total as string), 0),
        collections: data.reduce((s, r) => s + parseFloat(r.collections_total as string), 0),
        expenses: data.reduce((s, r) => s + parseFloat(r.expenses_total as string), 0),
      }
    : null;

  return (
    <div className="space-y-6">
      {/* Week selector */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setWeeksAgo(weeksAgo + 1)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          &larr; Anterior
        </button>
        <span className="text-sm font-medium text-gray-700">
          {range.start} — {range.end}
        </span>
        <button
          onClick={() => setWeeksAgo(Math.max(0, weeksAgo - 1))}
          disabled={weeksAgo === 0}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
        >
          Siguiente &rarr;
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
          Cargando...
        </div>
      ) : (
        <>
          {/* Chart */}
          {chartData && chartData.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                Ventas vs Cobros vs Egresos
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value))}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Ventas" fill="#EAB308" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Cobros" fill="#098B5F" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Egresos" fill="#DC2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 text-left">
                    <th className="px-6 py-3 font-medium">Fecha</th>
                    <th className="px-6 py-3 font-medium text-right">Ventas Byte</th>
                    <th className="px-6 py-3 font-medium text-right">Cobros reales</th>
                    <th className="px-6 py-3 font-medium text-right">Egresos</th>
                    <th className="px-6 py-3 font-medium text-right">Saldo banco</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data?.map((row) => (
                    <tr key={row.date as string} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium">
                        {formatDateShort(row.date as string)}
                      </td>
                      <td className="px-6 py-3 text-right">
                        {formatCurrency(row.sales_total as string)}
                      </td>
                      <td className="px-6 py-3 text-right text-primary-light font-medium">
                        {formatCurrency(row.collections_total as string)}
                      </td>
                      <td className="px-6 py-3 text-right text-red-600">
                        {formatCurrency(row.expenses_total as string)}
                      </td>
                      <td className="px-6 py-3 text-right font-semibold">
                        {row.bank_balance
                          ? formatCurrency(row.bank_balance as string)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {totals && (
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-6 py-3">Total</td>
                      <td className="px-6 py-3 text-right">{formatCurrency(totals.sales)}</td>
                      <td className="px-6 py-3 text-right text-primary-light">
                        {formatCurrency(totals.collections)}
                      </td>
                      <td className="px-6 py-3 text-right text-red-600">
                        {formatCurrency(totals.expenses)}
                      </td>
                      <td className="px-6 py-3"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
