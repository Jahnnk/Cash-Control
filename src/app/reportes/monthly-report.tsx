"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { getMonthlyReport, getDailyBreakdown } from "@/app/actions/reports";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
} from "recharts";

const PIE_COLORS = [
  "#004C40", "#098B5F", "#22C55E", "#EAB308", "#F97316",
  "#DC2626", "#8B5CF6", "#3B82F6", "#EC4899", "#6B7280",
  "#14B8A6", "#A855F7", "#F59E0B",
];

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
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
  const [showDetail, setShowDetail] = useState<"byte" | "income" | "expense" | null>(null);
  const [detailData, setDetailData] = useState<Record<string, unknown>[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [selectedYear] = useState(new Date().getFullYear());
  const monthNum = parseInt(month.split("-")[1]) - 1;

  useEffect(() => {
    setLoading(true);
    setShowDetail(null);
    setDetailData(null);
    getMonthlyReport(month).then((d) => {
      setData(d);
      setLoading(false);
    });
  }, [month]);

  const handleCardClick = useCallback(async (type: "byte" | "income" | "expense") => {
    if (showDetail === type) {
      setShowDetail(null);
      setDetailData(null);
      return;
    }
    setShowDetail(type);
    setDetailLoading(true);
    const result = await getDailyBreakdown(month, type);
    setDetailData(result);
    setDetailLoading(false);
  }, [showDetail, month]);

  // Auto-abrir breakdown si llega desde el dashboard con ?breakdown=...
  const searchParams = useSearchParams();
  const initialBreakdownApplied = useRef(false);
  useEffect(() => {
    if (initialBreakdownApplied.current || loading) return;
    const requested = searchParams.get("breakdown");
    if (requested === "byte" || requested === "income" || requested === "expense") {
      initialBreakdownApplied.current = true;
      handleCardClick(requested);
    }
  }, [searchParams, loading, handleCardClick]);

  function changeMonth(m: number) {
    setMonth(`${selectedYear}-${String(m + 1).padStart(2, "0")}`);
  }

  const donutData = data?.byCategory.map((row) => ({
    name: row.category as string,
    value: parseFloat(row.total as string),
  }));

  return (
    <div className="space-y-6">
      {/* Month selector — dropdown style */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-600">Mes:</label>
        <select
          value={monthNum}
          onChange={(e) => changeMonth(parseInt(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          {MONTHS.map((name, i) => (
            <option key={i} value={i}>{name} {selectedYear}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
          Cargando...
        </div>
      ) : data ? (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Ventas Byte — clickable */}
            <ClickableCard
              label="Ventas Byte"
              value={formatCurrency(data.totals.total_byte as string)}
              color="text-gray-900"
              isExpanded={showDetail === "byte"}
              onClick={() => handleCardClick("byte")}
            />
            {/* Ingresos BCP — clickable */}
            <ClickableCard
              label="Ingresos BCP"
              value={formatCurrency(data.totals.total_income as string)}
              color="text-primary-light"
              isExpanded={showDetail === "income"}
              onClick={() => handleCardClick("income")}
            />
            {/* Egresos totales — clickable */}
            <ClickableCard
              label="Egresos totales"
              value={formatCurrency(data.totals.total_expenses as string)}
              color="text-red-600"
              isExpanded={showDetail === "expense"}
              onClick={() => handleCardClick("expense")}
            />
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="text-sm text-gray-600 mb-1">Variación saldo banco</div>
              <div className={`text-xl font-bold ${data.bankEndBalance - data.bankStartBalance >= 0 ? "text-primary-light" : "text-red-600"}`}>
                {formatCurrency(data.bankEndBalance - data.bankStartBalance)}
              </div>
            </div>
          </div>

          {/* Detail panel */}
          {showDetail && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">
                  {showDetail === "byte"
                    ? "Ventas Byte por día"
                    : showDetail === "income"
                    ? "Ingresos BCP por día"
                    : "Egresos por día"}
                </h3>
                <button onClick={() => { setShowDetail(null); setDetailData(null); }}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {detailLoading ? (
                <div className="p-8 text-center text-gray-500 text-sm">Cargando detalle...</div>
              ) : detailData && detailData.length > 0 ? (
                <div className="overflow-x-auto">
                  {showDetail === "byte" ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-gray-600 text-left">
                          <th className="px-4 py-3 font-medium">Fecha</th>
                          <th className="px-4 py-3 font-medium text-right">Crédito día</th>
                          <th className="px-4 py-3 font-medium text-right">Contado</th>
                          <th className="px-4 py-3 font-medium text-right">Efectivo</th>
                          <th className="px-4 py-3 font-medium text-right">Digital</th>
                          <th className="px-4 py-3 font-medium text-right font-semibold">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {detailData.map((row) => (
                          <tr key={row.date as string} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5 font-medium">{formatDateShort(row.date as string)}</td>
                            <td className="px-4 py-2.5 text-right">{formatCurrency(row.byte_credit_day as string)}</td>
                            <td className="px-4 py-2.5 text-right text-blue-600">{formatCurrency(row.byte_cash_sale as string)}</td>
                            <td className="px-4 py-2.5 text-right text-gray-500">{formatCurrency(row.byte_cash_physical as string)}</td>
                            <td className="px-4 py-2.5 text-right text-gray-500">{formatCurrency(row.byte_digital as string)}</td>
                            <td className="px-4 py-2.5 text-right font-bold">{formatCurrency(row.byte_total as string)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50 font-semibold">
                          <td className="px-4 py-3">Total</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(detailData.reduce((s, r) => s + Number(r.byte_credit_day), 0))}</td>
                          <td className="px-4 py-3 text-right text-blue-600">{formatCurrency(detailData.reduce((s, r) => s + Number(r.byte_cash_sale), 0))}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(detailData.reduce((s, r) => s + Number(r.byte_cash_physical), 0))}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(detailData.reduce((s, r) => s + Number(r.byte_digital), 0))}</td>
                          <td className="px-4 py-3 text-right font-bold">{formatCurrency(detailData.reduce((s, r) => s + Number(r.byte_total), 0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  ) : showDetail === "income" ? (
                    (() => {
                      const byDate = new Map<string, { items: typeof detailData; total: number }>();
                      for (const row of detailData) {
                        const d = row.date as string;
                        if (!byDate.has(d)) byDate.set(d, { items: [], total: 0 });
                        const entry = byDate.get(d)!;
                        entry.items.push(row);
                        entry.total += Number(row.amount);
                      }
                      return (
                        <div className="divide-y divide-gray-100">
                          {Array.from(byDate.entries()).map(([date, { items, total }]) => (
                            <div key={date} className="px-4 py-3">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-gray-900">{formatDateShort(date)}</span>
                                <span className="text-sm font-bold text-primary-light">{formatCurrency(total)}</span>
                              </div>
                              <div className="space-y-0.5">
                                {items.map((item, i) => (
                                  <div key={i} className="flex items-center justify-between text-xs text-gray-500 pl-4">
                                    <span>{item.client_name ? `Pago de ${String(item.client_name)}` : (String(item.note || "Ingreso"))}</span>
                                    <span className="text-primary-light font-medium">+{formatCurrency(item.amount as string)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                          <div className="px-4 py-3 bg-gray-50 flex items-center justify-between font-semibold text-sm">
                            <span>Total</span>
                            <span className="text-primary-light">{formatCurrency(detailData.reduce((s, r) => s + Number(r.amount), 0))}</span>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    (() => {
                      const byDate = new Map<string, { items: typeof detailData; total: number }>();
                      for (const row of detailData) {
                        const d = row.date as string;
                        if (!byDate.has(d)) byDate.set(d, { items: [], total: 0 });
                        const entry = byDate.get(d)!;
                        entry.items.push(row);
                        entry.total += Number(row.amount);
                      }
                      return (
                        <div className="divide-y divide-gray-100">
                          {Array.from(byDate.entries()).map(([date, { items, total }]) => (
                            <div key={date} className="px-4 py-3">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-gray-900">{formatDateShort(date)}</span>
                                <span className="text-sm font-bold text-red-600">−{formatCurrency(total)}</span>
                              </div>
                              <div className="space-y-1">
                                {items.map((item, i) => (
                                  <div key={i} className="pl-4">
                                    <div className="flex items-center justify-between text-xs text-gray-700">
                                      <span>
                                        <span className="font-medium text-gray-900">{String(item.category)}</span>
                                        <span className="text-gray-400"> · </span>
                                        <span>{String(item.concept)}</span>
                                      </span>
                                      <span className="text-red-600 font-medium">−{formatCurrency(item.amount as string)}</span>
                                    </div>
                                    {item.notes ? (
                                      <div className="text-[11px] text-gray-400 pl-2 mt-0.5">{String(item.notes)}</div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                          <div className="px-4 py-3 bg-gray-50 flex items-center justify-between font-semibold text-sm">
                            <span>Total</span>
                            <span className="text-red-600">−{formatCurrency(detailData.reduce((s, r) => s + Number(r.amount), 0))}</span>
                          </div>
                        </div>
                      );
                    })()
                  )}
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500 text-sm">Sin datos para este período</div>
              )}
            </div>
          )}

          {/* Expenses by category */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {donutData && donutData.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Egresos por categoría</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={donutData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value">
                      {donutData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 11 }} />
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
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                          {row.category as string}
                        </td>
                        <td className="px-6 py-3 text-right font-medium">{formatCurrency(row.total as string)}</td>
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

function ClickableCard({
  label, value, color, isExpanded, onClick,
}: {
  label: string; value: string; color: string; isExpanded: boolean; onClick: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
      className={`cursor-pointer select-none bg-white rounded-xl border-2 p-5 transition-all active:scale-[0.98] ${
        isExpanded ? "border-primary-light shadow-md" : "border-gray-200 hover:border-primary-light/50 hover:shadow-sm"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">{label}</div>
        {isExpanded ? <ChevronUp className="w-4 h-4 text-primary-light" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </div>
      <div className={`text-xl font-bold ${color} mt-1`}>{value}</div>
      <div className="text-[10px] text-primary-light mt-1">
        {isExpanded ? "Click para cerrar" : "Ver detalle diario"}
      </div>
    </div>
  );
}
