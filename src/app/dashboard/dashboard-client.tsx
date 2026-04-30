"use client";

import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Landmark,
  Receipt,
  TrendingDown,
  TrendingUp,
  ShieldCheck,
  ArrowRight,
  Handshake,
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
};

export function DashboardClient({ data }: { data: DashboardData }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

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
          label="Ingresos del mes"
          value={formatCurrency((data.monthlyByte?.month_bank_income as string) || "0")}
          sub="Ingresos BCP"
          accent="primary"
          href="/reportes?tab=mensual&breakdown=income"
        />
        <Card
          icon={<TrendingDown className="w-5 h-5 text-red-600" />}
          label="Gastos del mes"
          value={formatCurrency(data.monthlyExpenses)}
          sub={`Promedio: ${formatCurrency(data.avgDailyExpense)}/día`}
          accent="red"
          href="/reportes?tab=mensual&breakdown=expense"
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
          sub="Días de operación cubiertos"
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
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accent: "primary" | "amber" | "red" | "violet";
  href?: string;
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
      <div className="text-2xl font-bold text-gray-900">{value}</div>
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
