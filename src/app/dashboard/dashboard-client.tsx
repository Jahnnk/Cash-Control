"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useTransition } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Landmark,
  Receipt,
  TrendingDown,
  TrendingUp,
  ShieldCheck,
  ArrowRight,
  Handshake,
  ChevronLeft,
  ChevronRight,
  Calendar,
} from "lucide-react";

type DashboardData = {
  bankBalance: number;
  bankDate: string | null;
  accountsReceivable: number;
  monthlyExpenses: number;
  daysCovered: number;
  avgDailyExpense: number;
  monthlyByte: Record<string, unknown>;
  fonaviReceivables: number;
  selectedMonth: string;
  currentMonth: string;
  isCurrentMonth: boolean;
  isPartial: boolean;
  isFuture: boolean;
  firstMonth: string;
  maxMonth: string;
};

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function buildMonthOptions(firstMonth: string, maxMonth: string): string[] {
  const out: string[] = [];
  let cur = firstMonth;
  // safety guard to avoid infinite loops
  for (let i = 0; i < 240; i++) {
    out.push(cur);
    if (cur === maxMonth) break;
    cur = shiftMonth(cur, 1);
  }
  return out.reverse(); // más reciente primero
}

export function DashboardClient({ data }: { data: DashboardData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const monthOptions = useMemo(
    () => buildMonthOptions(data.firstMonth, data.maxMonth),
    [data.firstMonth, data.maxMonth]
  );

  const prevMonth = shiftMonth(data.selectedMonth, -1);
  const nextMonth = shiftMonth(data.selectedMonth, 1);
  const canGoPrev = data.selectedMonth > data.firstMonth;
  const canGoNext = data.selectedMonth < data.maxMonth;

  const navigateToMonth = (m: string) => {
    startTransition(() => {
      if (m === data.currentMonth) router.push("/dashboard");
      else router.push(`/dashboard?mes=${m}`);
    });
  };

  const monthlyIncome = (data.monthlyByte?.month_bank_income as string) || "0";
  const incomeIsZero = parseFloat(monthlyIncome) === 0;
  const expenseIsZero = data.monthlyExpenses === 0;
  const monthHasNoData = data.isFuture || (incomeIsZero && expenseIsZero);

  const reportMonthQs = `&mes=${data.selectedMonth}`;

  return (
    <div className={`space-y-6 ${isPending ? "opacity-70 transition-opacity" : ""}`}>
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Banner cuando se está navegando un mes ≠ actual */}
      {!data.isCurrentMonth && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Calendar className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-medium text-amber-900">
                Viendo datos de {monthLabel(data.selectedMonth)}
              </div>
              <div className="text-xs text-amber-700 mt-0.5">
                Saldo y cuentas por cobrar siempre son al día.
              </div>
            </div>
          </div>
          <button
            onClick={() => navigateToMonth(data.currentMonth)}
            className="text-xs font-medium text-amber-900 bg-white border border-amber-300 hover:bg-amber-100 rounded-md px-3 py-1.5 whitespace-nowrap"
          >
            Volver al mes actual
          </button>
        </div>
      )}

      {/* Selector de mes */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => navigateToMonth(prevMonth)}
          disabled={!canGoPrev || isPending}
          className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" /> Mes anterior
        </button>
        <button
          onClick={() => navigateToMonth(data.currentMonth)}
          disabled={isPending}
          className={`px-3 py-1.5 text-sm rounded-md border ${
            data.isCurrentMonth
              ? "bg-primary text-white border-primary"
              : "border-gray-200 text-gray-700 hover:bg-gray-50"
          }`}
        >
          Mes actual
        </button>
        <button
          onClick={() => navigateToMonth(nextMonth)}
          disabled={!canGoNext || isPending}
          className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Mes siguiente <ChevronRight className="w-4 h-4" />
        </button>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-gray-500">Otro mes:</label>
          <select
            value={data.selectedMonth}
            onChange={(e) => navigateToMonth(e.target.value)}
            disabled={isPending}
            className="border border-gray-200 rounded-md px-2 py-1.5 text-sm text-gray-700 bg-white"
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
                {m === data.currentMonth ? " (actual)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Top Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card
          icon={<Landmark className="w-5 h-5 text-primary-light" />}
          label="Saldo en banco"
          value={formatCurrency(data.bankBalance)}
          sub={data.bankDate ? `al ${formatDate(data.bankDate)}` : "Sin registro"}
          accent="primary"
          href="/registro"
        />
        <Card
          icon={<TrendingUp className="w-5 h-5 text-primary-light" />}
          label={`Ingresos · ${monthLabel(data.selectedMonth)}`}
          value={formatCurrency(monthlyIncome)}
          sub={
            monthHasNoData
              ? "Sin movimientos en este período"
              : data.isPartial
                ? "Ingresos BCP (parcial)"
                : "Ingresos BCP"
          }
          accent="primary"
          href={`/reportes?tab=mensual&breakdown=income${reportMonthQs}`}
          dim={monthHasNoData}
        />
        <Card
          icon={<TrendingDown className="w-5 h-5 text-red-600" />}
          label={`Gastos · ${monthLabel(data.selectedMonth)}`}
          value={formatCurrency(data.monthlyExpenses)}
          sub={
            monthHasNoData
              ? "Sin movimientos en este período"
              : data.isPartial
                ? `Promedio: ${formatCurrency(data.avgDailyExpense)}/día (parcial)`
                : `Promedio: ${formatCurrency(data.avgDailyExpense)}/día`
          }
          accent="red"
          href={`/reportes?tab=mensual&breakdown=expense${reportMonthQs}`}
          dim={monthHasNoData}
        />
        <Card
          icon={<Receipt className="w-5 h-5 text-amber-600" />}
          label="Cuentas por cobrar"
          value={formatCurrency(data.accountsReceivable)}
          sub="Byte total - Cobros BCP"
          accent="amber"
          href="/reportes?tab=antig%C3%BCedad"
        />
        <Card
          icon={<Handshake className="w-5 h-5 text-violet-600" />}
          label="Por cobrar Fonavi"
          value={formatCurrency(data.fonaviReceivables)}
          sub="Gastos compartidos pendientes"
          accent="violet"
          href="/fonavi"
        />
        <Card
          icon={<ShieldCheck className="w-5 h-5 text-primary-light" />}
          label="Cobertura"
          value={`${data.daysCovered > 90 ? "90+" : data.daysCovered} días`}
          sub={
            monthHasNoData
              ? "Sin gasto promedio en este período"
              : data.isPartial
                ? "Días de operación cubiertos (parcial)"
                : "Días de operación cubiertos"
          }
          accent="primary"
        />
      </div>

      {/* Enlaces a reportes detallados */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ReportLink
          href="/reportes?tab=ultimos7"
          title="Últimos 7 días"
          description="Resumen día por día: Byte, ingresos, egresos y saldo"
        />
        <ReportLink
          href="/reportes?tab=conciliacion"
          title="Conciliación bancaria"
          description="Byte esperado vs BCP real por semana, mes o rango"
        />
      </div>
    </div>
  );
}

function Card({
  icon,
  label,
  value,
  sub,
  accent,
  href,
  dim = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accent: "primary" | "amber" | "red" | "violet";
  href?: string;
  dim?: boolean;
}) {
  const borderColor =
    accent === "primary"
      ? "border-l-primary-light"
      : accent === "amber"
        ? "border-l-amber-500"
        : accent === "violet"
          ? "border-l-violet-500"
          : "border-l-red-500";

  const baseClasses = `bg-white rounded-xl border border-gray-200 border-l-4 ${borderColor} p-5`;
  const interactiveClasses = "cursor-pointer hover:shadow-md hover:border-gray-300 hover:-translate-y-0.5 transition-all block";

  const content = (
    <>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-sm text-gray-600">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${dim ? "text-gray-400" : "text-gray-900"}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1">{sub}</div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={`${baseClasses} ${interactiveClasses}`}>
        {content}
      </Link>
    );
  }

  return <div className={baseClasses}>{content}</div>;
}

function ReportLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group bg-white rounded-xl border border-gray-200 p-5 hover:border-primary-light hover:shadow-sm transition-all flex items-center justify-between gap-4"
    >
      <div>
        <div className="font-semibold text-gray-900">{title}</div>
        <div className="text-xs text-gray-500 mt-1">{description}</div>
      </div>
      <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-primary-light group-hover:translate-x-0.5 transition-all shrink-0" />
    </Link>
  );
}
