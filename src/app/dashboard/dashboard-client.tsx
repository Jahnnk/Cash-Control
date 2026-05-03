"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { KPICard, type KPIVariant } from "@/components/ui/KPICard";
import { MonthSelector, monthLabel } from "@/components/ui/MonthSelector";
import {
  Landmark,
  Receipt,
  TrendingDown,
  TrendingUp,
  ShieldCheck,
  ArrowRight,
  Handshake,
  Calendar,
  Plus,
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

export function DashboardClient({ data }: { data: DashboardData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

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

  // Cobertura inteligente: la tarjeta solo aparece cuando aporta señal accionable.
  // > 90 días o sin datos → no se muestra. 30-90 verde, 15-30 amarillo, < 15 rojo.
  const coverageHasData =
    !monthHasNoData && data.avgDailyExpense > 0 && data.daysCovered < 999;
  const coverage: { variant: KPIVariant; iconColor: string; label: string } | null = (() => {
    if (!coverageHasData) return null;
    const d = data.daysCovered;
    if (d > 90) return null;
    if (d >= 30) return { variant: "default", iconColor: "text-primary-light", label: "Días de operación cubiertos" };
    if (d >= 15) return { variant: "warning", iconColor: "text-amber-600", label: "⚠️ Cobertura baja" };
    return { variant: "danger", iconColor: "text-red-600", label: "🔴 Cobertura crítica" };
  })();

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
      <MonthSelector
        value={data.selectedMonth}
        onChange={navigateToMonth}
        minMonth={data.firstMonth}
        maxMonth={data.maxMonth}
        currentMonth={data.currentMonth}
        loading={isPending}
      />

      {/* Top Cards — auto-fit para que el grid se reacomode si una card se oculta */}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
      >
        <KPICard
          icon={<Landmark className="w-5 h-5 text-primary-light" />}
          title="Saldo en banco"
          value={formatCurrency(data.bankBalance)}
          subtitle={data.bankDate ? `al ${formatDate(data.bankDate)}` : "Sin registro"}
          variant="default"
          href="/registro"
        />
        <KPICard
          icon={<TrendingUp className="w-5 h-5 text-primary-light" />}
          title={`Ingresos · ${monthLabel(data.selectedMonth)}`}
          value={formatCurrency(monthlyIncome)}
          subtitle={
            monthHasNoData
              ? "Sin movimientos en este período"
              : data.isPartial
                ? "Ingresos BCP (parcial)"
                : "Ingresos BCP"
          }
          variant="default"
          href={`/reportes?tab=mensual&breakdown=income${reportMonthQs}`}
          dim={monthHasNoData}
          secondaryAction={{
            href: "/registro?tipo=ingreso",
            label: "Registrar nuevo ingreso",
            icon: <Plus className="w-4 h-4" />,
          }}
        />
        <KPICard
          icon={<TrendingDown className="w-5 h-5 text-red-600" />}
          title={`Gastos · ${monthLabel(data.selectedMonth)}`}
          value={formatCurrency(data.monthlyExpenses)}
          subtitle={
            monthHasNoData
              ? "Sin movimientos en este período"
              : data.isPartial
                ? `Promedio: ${formatCurrency(data.avgDailyExpense)}/día (parcial)`
                : `Promedio: ${formatCurrency(data.avgDailyExpense)}/día`
          }
          variant="danger"
          href={`/reportes?tab=mensual&breakdown=expense${reportMonthQs}`}
          dim={monthHasNoData}
          secondaryAction={{
            href: "/registro?tipo=gasto",
            label: "Registrar nuevo gasto",
            icon: <Plus className="w-4 h-4" />,
          }}
        />
        <KPICard
          icon={<Receipt className="w-5 h-5 text-amber-600" />}
          title="Cuentas por cobrar"
          value={formatCurrency(data.accountsReceivable)}
          subtitle="Byte total - Cobros BCP"
          variant="warning"
          href="/reportes?tab=conciliacion"
        />
        <KPICard
          icon={<Handshake className="w-5 h-5 text-violet-600" />}
          title="Por cobrar Fonavi"
          value={formatCurrency(data.fonaviReceivables)}
          subtitle="Gastos compartidos pendientes"
          variant="violet"
          href="/fonavi"
          secondaryAction={{
            href: "/fonavi?accion=registrar-reembolso",
            label: "Registrar reembolso",
            icon: <Plus className="w-4 h-4" />,
          }}
        />
        {coverage && (
          <KPICard
            icon={<ShieldCheck className={`w-5 h-5 ${coverage.iconColor}`} />}
            title="Cobertura"
            value={`${data.daysCovered} días`}
            subtitle={data.isPartial ? `${coverage.label} (parcial)` : coverage.label}
            variant={coverage.variant}
          />
        )}
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
