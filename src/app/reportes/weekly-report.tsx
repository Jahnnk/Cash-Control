"use client";

import { useState, useEffect } from "react";
import { getWeeklyReport } from "@/app/actions/reports";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { DataTable } from "@/components/ui/DataTable";
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
    "Byte Total": parseFloat(row.byte_total as string),
    "Ingreso BCP": parseFloat(row.bank_income as string),
    Egresos: parseFloat(row.expenses_total as string),
  }));

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
          {chartData && chartData.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                Byte Total vs Ingreso BCP vs Egresos
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
                  <Bar dataKey="Byte Total" fill="#EAB308" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Ingreso BCP" fill="#098B5F" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Egresos" fill="#DC2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Table */}
          <DataTable
            rowKey={(row) => row.date as string}
            data={data ?? []}
            columns={[
              { key: "date", header: "Fecha", cellClassName: "font-medium", render: (row) => formatDateShort(row.date as string) },
              { key: "byte_total", header: "Byte Total", align: "right", render: (row) => formatCurrency(row.byte_total as string) },
              { key: "byte_credit_day", header: "Créd. Día", align: "right", cellClassName: "text-gray-600", render: (row) => formatCurrency(row.byte_credit_day as string) },
              { key: "byte_credit_collected", header: "Créd. Cobr.", align: "right", cellClassName: "text-blue-600", render: (row) => formatCurrency(row.byte_credit_collected as string) },
              { key: "bank_income", header: "Ingreso BCP", align: "right", cellClassName: "text-primary-light font-medium", render: (row) => formatCurrency(row.bank_income as string) },
              { key: "expenses_total", header: "Egresos", align: "right", cellClassName: "text-red-600", render: (row) => formatCurrency(row.expenses_total as string) },
              { key: "bank_balance_real", header: "Saldo BCP", align: "right", cellClassName: "font-semibold", render: (row) => row.bank_balance_real ? formatCurrency(row.bank_balance_real as string) : "—" },
            ]}
          />
        </>
      )}
    </div>
  );
}
