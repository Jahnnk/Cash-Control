"use client";

import { formatCurrency, formatDate, formatDateShort } from "@/lib/utils";
import { useRouter } from "next/navigation";
import {
  Landmark,
  Receipt,
  TrendingDown,
  TrendingUp,
  ShieldCheck,
  Pencil,
} from "lucide-react";
import { ReconciliationSection } from "./reconciliation-section";

type DashboardData = {
  bankBalance: number;
  bankDate: string | null;
  accountsReceivable: number;
  monthlyExpenses: number;
  daysCovered: number;
  avgDailyExpense: number;
  last7Days: Record<string, unknown>[];
  monthlyByte: Record<string, unknown>;
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card
          icon={<Landmark className="w-5 h-5 text-primary-light" />}
          label="Saldo en banco"
          value={formatCurrency(data.bankBalance)}
          sub={data.bankDate ? `al ${formatDate(data.bankDate)}` : "Sin registro"}
          accent="primary"
        />
        <Card
          icon={<TrendingUp className="w-5 h-5 text-primary-light" />}
          label="Ingresos del mes"
          value={formatCurrency((data.monthlyByte?.month_bank_income as string) || "0")}
          sub="Ingresos BCP"
          accent="primary"
        />
        <Card
          icon={<TrendingDown className="w-5 h-5 text-red-600" />}
          label="Gastos del mes"
          value={formatCurrency(data.monthlyExpenses)}
          sub={`Promedio: ${formatCurrency(data.avgDailyExpense)}/día`}
          accent="red"
        />
        <Card
          icon={<Receipt className="w-5 h-5 text-amber-600" />}
          label="Cuentas por cobrar"
          value={formatCurrency(data.accountsReceivable)}
          sub="Byte total - Cobros BCP"
          accent="amber"
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

      {/* Reconciliation with period selector */}
      <ReconciliationSection />
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
