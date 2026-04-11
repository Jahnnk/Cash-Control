"use client";

import { formatCurrency, formatDate, formatDateShort } from "@/lib/utils";
import { useRouter } from "next/navigation";
import {
  Landmark,
  Receipt,
  TrendingDown,
  ShieldCheck,
  Pencil,
} from "lucide-react";

type DashboardData = {
  bankBalance: number;
  bankDate: string | null;
  accountsReceivable: number;
  monthlyExpenses: number;
  daysCovered: number;
  avgDailyExpense: number;
  last7Days: Record<string, unknown>[];
  monthlyByte: Record<string, unknown>;
  reconciliation: Record<string, unknown>[];
  reconTotals: Record<string, unknown>;
};

export function DashboardClient({ data }: { data: DashboardData }) {
  const router = useRouter();

  function editDay(dateStr: string) {
    // Navigate to /registro with this date pre-selected
    const d = new Date(dateStr);
    const formatted = d.toISOString().split("T")[0];
    router.push(`/registro?fecha=${formatted}`);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Top Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          icon={<Landmark className="w-5 h-5 text-primary-light" />}
          label="Saldo en banco"
          value={formatCurrency(data.bankBalance)}
          sub={data.bankDate ? `al ${formatDate(data.bankDate)}` : "Sin registro"}
          accent="primary"
        />
        <Card
          icon={<Receipt className="w-5 h-5 text-amber-600" />}
          label="Cuentas por cobrar"
          value={formatCurrency(data.accountsReceivable)}
          sub="Byte total - Cobros BCP"
          accent="amber"
        />
        <Card
          icon={<TrendingDown className="w-5 h-5 text-red-600" />}
          label="Gastos del mes"
          value={formatCurrency(data.monthlyExpenses)}
          sub={`Promedio: ${formatCurrency(data.avgDailyExpense)}/día`}
          accent="red"
        />
        <Card
          icon={<ShieldCheck className="w-5 h-5 text-primary-light" />}
          label="Cobertura"
          value={`${data.daysCovered > 90 ? "90+" : data.daysCovered} días`}
          sub="Días de operación cubiertos"
          accent="primary"
        />
      </div>

      {/* Last 7 Days */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Últimos 7 días</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-left">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium text-right">Byte Total</th>
                <th className="px-4 py-3 font-medium text-right">Créd. Día</th>
                <th className="px-4 py-3 font-medium text-right">Créd. Cobr.</th>
                <th className="px-4 py-3 font-medium text-right">Ingreso BCP</th>
                <th className="px-4 py-3 font-medium text-right">Egresos</th>
                <th className="px-4 py-3 font-medium text-right">Saldo BCP</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.last7Days.map((row: Record<string, unknown>) => (
                <tr key={row.date as string} className="hover:bg-gray-50 group">
                  <td className="px-4 py-3 font-medium">
                    {formatDateShort(row.date as string)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatCurrency(row.byte_total as string)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {formatCurrency(row.byte_credit_day as string)}
                  </td>
                  <td className="px-4 py-3 text-right text-blue-600">
                    {formatCurrency(row.byte_credit_collected as string)}
                  </td>
                  <td className="px-4 py-3 text-right text-primary-light font-medium">
                    {formatCurrency(row.bank_income as string)}
                  </td>
                  <td className="px-4 py-3 text-right text-red-600">
                    {formatCurrency(row.expenses_total as string)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {row.bank_balance_real
                      ? formatCurrency(row.bank_balance_real as string)
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => editDay(row.date as string)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-primary-light p-1 rounded"
                      title="Editar este día"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right">
                  {formatCurrency(sum(data.last7Days, "byte_total"))}
                </td>
                <td className="px-4 py-3 text-right text-gray-600">
                  {formatCurrency(sum(data.last7Days, "byte_credit_day"))}
                </td>
                <td className="px-4 py-3 text-right text-blue-600">
                  {formatCurrency(sum(data.last7Days, "byte_credit_collected"))}
                </td>
                <td className="px-4 py-3 text-right text-primary-light">
                  {formatCurrency(sum(data.last7Days, "bank_income"))}
                </td>
                <td className="px-4 py-3 text-right text-red-600">
                  {formatCurrency(sum(data.last7Days, "expenses_total"))}
                </td>
                <td className="px-4 py-3"></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Reconciliation: Byte vs Bank */}
      {data.reconciliation.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Conciliación: Byte vs Banco
            </h2>
            {(() => {
              const totalDiff =
                parseFloat((data.reconTotals.total_byte_collected as string) || "0") -
                parseFloat((data.reconTotals.total_bank_income as string) || "0");
              const absDiff = Math.abs(totalDiff);
              if (absDiff < 1) return <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">Cuadrado</span>;
              return (
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  totalDiff > 0 ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"
                }`}>
                  {totalDiff > 0
                    ? `Byte cobró ${formatCurrency(absDiff)} más que banco`
                    : `Banco recibió ${formatCurrency(absDiff)} más que Byte`}
                </span>
              );
            })()}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-left">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium text-right">Contado Byte</th>
                  <th className="px-4 py-3 font-medium text-right">Créd. Cobr. Byte</th>
                  <th className="px-4 py-3 font-medium text-right font-semibold">Total cobrado Byte</th>
                  <th className="px-4 py-3 font-medium text-right font-semibold">Ingreso BCP</th>
                  <th className="px-4 py-3 font-medium text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.reconciliation.map((row) => {
                  const diff = parseFloat((row.difference as string) || "0");
                  const hasDiff = Math.abs(diff) >= 1;
                  return (
                    <tr key={row.date as string} className={hasDiff ? "bg-amber-50/50" : "hover:bg-gray-50"}>
                      <td className="px-4 py-3 font-medium">
                        {formatDateShort(row.date as string)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {formatCurrency(row.byte_cash as string)}
                      </td>
                      <td className="px-4 py-3 text-right text-blue-600">
                        {formatCurrency(row.byte_credit_collected as string)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {formatCurrency(row.byte_collected as string)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-primary-light">
                        {formatCurrency(row.bank_income as string)}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${
                        !hasDiff ? "text-green-600" :
                        diff > 0 ? "text-amber-600" : "text-blue-600"
                      }`}>
                        {!hasDiff ? "✓" : (
                          <>
                            {diff > 0 ? "+" : ""}{formatCurrency(diff)}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-4 py-3" colSpan={3}>Total mes</td>
                  <td className="px-4 py-3 text-right">
                    {formatCurrency(data.reconTotals.total_byte_collected as string)}
                  </td>
                  <td className="px-4 py-3 text-right text-primary-light">
                    {formatCurrency(data.reconTotals.total_bank_income as string)}
                  </td>
                  <td className={`px-4 py-3 text-right font-bold ${
                    (() => {
                      const d = parseFloat((data.reconTotals.total_byte_collected as string) || "0") -
                        parseFloat((data.reconTotals.total_bank_income as string) || "0");
                      return Math.abs(d) < 1 ? "text-green-600" : d > 0 ? "text-amber-600" : "text-blue-600";
                    })()
                  }`}>
                    {(() => {
                      const d = parseFloat((data.reconTotals.total_byte_collected as string) || "0") -
                        parseFloat((data.reconTotals.total_bank_income as string) || "0");
                      if (Math.abs(d) < 1) return "✓";
                      return `${d > 0 ? "+" : ""}${formatCurrency(d)}`;
                    })()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function sum(rows: Record<string, unknown>[], key: string): number {
  return rows.reduce((s, r) => s + parseFloat((r[key] as string) || "0"), 0);
}

function Card({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accent: "primary" | "amber" | "red";
}) {
  const borderColor =
    accent === "primary"
      ? "border-l-primary-light"
      : accent === "amber"
        ? "border-l-amber-500"
        : "border-l-red-500";

  return (
    <div className={`bg-white rounded-xl border border-gray-200 border-l-4 ${borderColor} p-5`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-sm text-gray-600">{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{sub}</div>
    </div>
  );
}
