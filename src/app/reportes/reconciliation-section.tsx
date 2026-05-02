"use client";

import { useState, useEffect } from "react";
import { getReconciliation } from "@/app/actions/reconciliation";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { KPICard } from "@/components/ui/KPICard";

type ReconciliationData = {
  daily: Record<string, unknown>[];
  totals: Record<string, unknown>;
  balanceStart: number;
  balanceEnd: number;
  balanceEndDate: string | null;
};

type Period = "semana" | "mes" | "anio" | "rango";

function getDateRange(period: Period, customStart?: string, customEnd?: string) {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  if (period === "rango" && customStart && customEnd) {
    return { start: customStart, end: customEnd };
  }

  if (period === "semana") {
    const day = today.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    return { start: monday.toISOString().split("T")[0], end: todayStr };
  }

  if (period === "mes") {
    const start = `${todayStr.substring(0, 7)}-01`;
    return { start, end: todayStr };
  }

  // anio
  const start = `${today.getFullYear()}-01-01`;
  return { start, end: todayStr };
}

export function ReconciliationSection() {
  const [period, setPeriod] = useState<Period>("mes");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [data, setData] = useState<ReconciliationData | null>(null);
  const [loading, setLoading] = useState(true);

  const range = getDateRange(period, customStart, customEnd);

  useEffect(() => {
    if (period === "rango" && (!customStart || !customEnd)) return;
    setLoading(true);
    getReconciliation(range.start, range.end).then((d) => {
      setData(d);
      setLoading(false);
    });
  }, [period, range.start, range.end, customStart, customEnd]);

  const periods: { key: Period; label: string }[] = [
    { key: "semana", label: "Semana" },
    { key: "mes", label: "Mes" },
    { key: "anio", label: "Año" },
    { key: "rango", label: "Rango" },
  ];

  const t = data?.totals;
  const totalByteExpected = parseFloat((t?.total_byte_expected as string) || "0");
  const totalBankIncome = parseFloat((t?.total_bank_income as string) || "0");
  const totalBankExpenses = parseFloat((t?.total_bank_expenses as string) || "0");
  const totalExpenses = parseFloat((t?.total_expenses as string) || "0");
  const totalByteSales = parseFloat((t?.total_byte_sales as string) || "0");
  const totalCashIncome = parseFloat((t?.total_cash_income as string) || "0");
  const totalCashExpenses = parseFloat((t?.total_cash_expenses as string) || "0");
  const incomeDiff = totalByteExpected - totalBankIncome;
  const bankNet = totalBankIncome - totalBankExpenses;
  const balanceChange = (data?.balanceEnd || 0) - (data?.balanceStart || 0);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Header with period selector */}
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Conciliación Bancaria</h2>
              <p className="text-xs text-gray-500 mt-0.5">Byte esperado vs BCP real · Solo transferencias</p>
            </div>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {periods.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    period === p.key ? "bg-white text-primary shadow-sm" : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {period === "rango" && (
            <div className="flex items-center gap-2 mt-3">
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
              <span className="text-gray-400">→</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
            </div>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500 text-sm">Cargando...</div>
        ) : data ? (
          <>
            {/* Summary cards */}
            <div className="p-4 border-b border-gray-100 bg-gray-50/50">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KPICard size="compact" title="Ingresos BCP" value={formatCurrency(totalBankIncome)} valueClassName="text-primary-light" />
                <KPICard size="compact" title="Egresos bancarios" value={formatCurrency(totalBankExpenses)} valueClassName="text-red-600" />
                <KPICard
                  size="compact"
                  title="Neto banco"
                  value={`${bankNet >= 0 ? "+" : ""}${formatCurrency(bankNet)}`}
                  valueClassName={bankNet >= 0 ? "text-primary-light" : "text-red-600"}
                />
                <KPICard
                  size="compact"
                  title="Variación saldo"
                  value={`${balanceChange >= 0 ? "+" : ""}${formatCurrency(balanceChange)}`}
                  valueClassName={balanceChange >= 0 ? "text-primary-light" : "text-red-600"}
                  subtitle={data.balanceEndDate ? `Saldo actual: ${formatCurrency(data.balanceEnd)}` : undefined}
                />
              </div>

              {/* Second row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
                <KPICard size="compact" title="Ventas Byte" value={formatCurrency(totalByteSales)} valueClassName="text-gray-900" />
                <KPICard size="compact" title="Byte esperado banco" value={formatCurrency(totalByteExpected)} valueClassName="text-gray-700" />
                <KPICard
                  size="compact"
                  title="Diferencia ingreso"
                  value={Math.abs(incomeDiff) < 1 ? "✓ Cuadra" : `${incomeDiff > 0 ? "+" : ""}${formatCurrency(incomeDiff)}`}
                  valueClassName={Math.abs(incomeDiff) < 1 ? "text-green-600" : "text-amber-600"}
                />
                <KPICard size="compact" title="Total egresos (todos)" value={formatCurrency(totalExpenses)} valueClassName="text-red-600" />
              </div>

              {/* Cash summary if any */}
              {(totalCashIncome > 0 || totalCashExpenses > 0) && (
                <div className="mt-3 bg-amber-50 rounded-lg p-3 flex items-center justify-between text-sm">
                  <span className="text-amber-800 font-medium">Efectivo:</span>
                  <div className="flex gap-4">
                    <span className="text-primary-light">Ingreso: {formatCurrency(totalCashIncome)}</span>
                    <span className="text-red-600">Egreso: {formatCurrency(totalCashExpenses)}</span>
                    <span className={`font-bold ${totalCashIncome - totalCashExpenses >= 0 ? "text-primary-light" : "text-red-600"}`}>
                      Neto: {formatCurrency(totalCashIncome - totalCashExpenses)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Daily detail table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 text-left">
                    <th className="px-3 py-3 font-medium">Fecha</th>
                    <th className="px-3 py-3 font-medium text-right">Byte esperado</th>
                    <th className="px-3 py-3 font-medium text-right">Ingreso BCP</th>
                    <th className="px-3 py-3 font-medium text-right">Diferencia</th>
                    <th className="px-3 py-3 font-medium text-right">Egreso banco</th>
                    <th className="px-3 py-3 font-medium text-right">Neto banco</th>
                    <th className="px-3 py-3 font-medium text-right">Saldo BCP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.daily.map((row) => {
                    const diff = parseFloat((row.income_diff as string) || "0");
                    const hasDiff = Math.abs(diff) >= 1;
                    const net = parseFloat((row.bank_net as string) || "0");
                    return (
                      <tr key={row.date as string} className={hasDiff ? "bg-amber-50/50" : "hover:bg-gray-50"}>
                        <td className="px-3 py-2.5 font-medium">{formatDateShort(row.date as string)}</td>
                        <td className="px-3 py-2.5 text-right text-gray-700">{formatCurrency(row.byte_expected_bank as string)}</td>
                        <td className="px-3 py-2.5 text-right text-primary-light font-medium">{formatCurrency(row.bank_income as string)}</td>
                        <td className={`px-3 py-2.5 text-right font-medium ${!hasDiff ? "text-green-600" : diff > 0 ? "text-amber-600" : "text-blue-600"}`}>
                          {!hasDiff ? "✓" : `${diff > 0 ? "+" : ""}${formatCurrency(diff)}`}
                        </td>
                        <td className="px-3 py-2.5 text-right text-red-600">{formatCurrency(row.bank_expenses as string)}</td>
                        <td className={`px-3 py-2.5 text-right font-semibold ${net >= 0 ? "text-primary-light" : "text-red-600"}`}>
                          {net >= 0 ? "+" : ""}{formatCurrency(net)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold">
                          {row.bank_balance_real ? formatCurrency(row.bank_balance_real as string) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

