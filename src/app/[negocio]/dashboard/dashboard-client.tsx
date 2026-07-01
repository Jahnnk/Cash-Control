"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { KPICard } from "@/components/ui/KPICard";
import { MonthSelector, monthLabel } from "@/components/ui/MonthSelector";
import { BankBalanceCard } from "@/components/banking/BankBalanceCard";
import { CashBalanceCard } from "@/components/banking/CashBalanceCard";
import { InternalTransferModal } from "@/components/banking/InternalTransferModal";
import { useBankBalance } from "@/hooks/useBankBalance";
import { CommandCenter } from "./command-center";
import type { CommandCenterData } from "@/app/actions/command-center";
import { LiquidityPanel } from "./liquidity-panel";
import type { LiquidityPanelData } from "@/app/actions/liquidity-panel";
import {
  Receipt,
  TrendingDown,
  TrendingUp,
  ArrowRight,
  ArrowRightLeft,
  Handshake,
  Calendar,
  Plus,
  AlertTriangle,
  HandCoins,
} from "lucide-react";

type DashboardData = {
  accountsReceivable: number;
  monthlyExpenses: number;
  daysCovered: number;
  avgDailyExpense: number;
  monthlyByte: Record<string, unknown>;
  fonaviReceivables: number;
  partnerLoanBalance: number;
  selectedMonth: string;
  currentMonth: string;
  isCurrentMonth: boolean;
  isPartial: boolean;
  isFuture: boolean;
  firstMonth: string;
  maxMonth: string;
};

export function DashboardClient({
  data,
  command,
  liquidity,
  negocio,
  isAtelier,
}: {
  data: DashboardData;
  command: CommandCenterData | null;
  liquidity: LiquidityPanelData | null;
  negocio: string;
  isAtelier: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [transferOpen, setTransferOpen] = useState(false);
  const bank = useBankBalance();

  const dashHref = `/${negocio}/dashboard`;
  const reportesHref = (qs: string) => `/${negocio}/reportes${qs ? `?${qs}` : ""}`;

  const navigateToMonth = (m: string) => {
    startTransition(() => {
      if (m === data.currentMonth) router.push(dashHref);
      else router.push(`${dashHref}?mes=${m}`);
    });
  };

  const monthlyIncome = (data.monthlyByte?.month_bank_income as string) || "0";
  const incomeIsZero = parseFloat(monthlyIncome) === 0;
  const expenseIsZero = data.monthlyExpenses === 0;
  const monthHasNoData = data.isFuture || (incomeIsZero && expenseIsZero);

  const reportMonthQs = `&mes=${data.selectedMonth}`;

  return (
    <div className={`space-y-6 ${isPending ? "opacity-70 transition-opacity" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <button
          onClick={() => setTransferOpen(true)}
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg px-3 py-1.5"
          title="Mover dinero entre la caja efectivo y la cuenta BCP"
        >
          <ArrowRightLeft className="w-4 h-4" />
          Transferencia interna
        </button>
      </div>
      <InternalTransferModal open={transferOpen} onClose={() => setTransferOpen(false)} />

      {/* ── Centro de Comando: Executive Brief + Health Score + alertas ── */}
      {command && <CommandCenter data={command} negocio={negocio} />}

      {/* Alerta de discrepancia (fallback si el Centro de Comando no cargó;
          cuando sí carga, el descuadre ya aparece como tema crítico arriba) */}
      {!command && bank.hasDiscrepancy && bank.discrepancyDate && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-amber-900">
                Alerta de consistencia
              </div>
              <div className="text-xs text-amber-700 mt-0.5">
                El sistema detectó una inconsistencia interna en la cadena de saldos.
                {" "}Diferencia el {formatDate(bank.discrepancyDate)}
                {bank.discrepancyAmount !== null && (
                  <> · {bank.discrepancyAmount > 0 ? "+" : ""}{formatCurrency(bank.discrepancyAmount)}</>
                )}
              </div>
            </div>
          </div>
          <Link
            href={reportesHref("tab=conciliacion")}
            className="text-xs font-medium text-amber-900 bg-white border border-amber-300 hover:bg-amber-100 rounded-md px-3 py-1.5 whitespace-nowrap shrink-0"
          >
            Revisar →
          </Link>
        </div>
      )}

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

      {/* Cards agrupadas en bloques temáticos. Mismos datos, enlaces y
          acciones que antes — solo cambia la organización visual y, en el
          bloque de deudas, el color para que no se lean todas como alerta. */}

      {/* Bloque 1 — Panel Ejecutivo de Liquidez (Saldos repensados: cada
          tarjeta responde una pregunta de negocio). Fallback a las cards
          clásicas si el panel no pudo calcularse. */}
      {liquidity ? (
        <LiquidityPanel data={liquidity} negocio={negocio} />
      ) : (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Saldos
          </h2>
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
          >
            <BankBalanceCard href={`/${negocio}/registro`} />
            <CashBalanceCard href={`/${negocio}/registro`} />
          </div>
        </section>
      )}

      {/* Bloque 2 — Flujo del mes */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Flujo del mes · {monthLabel(data.selectedMonth)}
        </h2>
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
        >
          <KPICard
            icon={<TrendingUp className="w-5 h-5 text-primary-light" />}
            title={`Ingresos · ${monthLabel(data.selectedMonth)}`}
            value={formatCurrency(monthlyIncome)}
            subtitle={
              monthHasNoData
                ? "Sin movimientos en este período"
                : data.isPartial
                  ? "Otros ingresos (parcial)"
                  : "Otros ingresos"
            }
            variant="default"
            href={reportesHref(`tab=mensual&breakdown=income${reportMonthQs}`)}
            dim={monthHasNoData}
            secondaryAction={{
              href: `/${negocio}/registro?tipo=ingreso`,
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
            href={reportesHref(`tab=mensual&breakdown=expense${reportMonthQs}`)}
            dim={monthHasNoData}
            secondaryAction={{
              href: `/${negocio}/registro?tipo=gasto`,
              label: "Registrar nuevo gasto",
              icon: <Plus className="w-4 h-4" />,
            }}
          />
        </div>
      </section>

      {/* Bloque 3 — Por cobrar y deudas: SOLO como fallback. Cuando el
          panel de liquidez está activo, "Por cobrar" vive dentro del panel
          (tarjeta de liquidez futura) y "Deuda con socio" la vigila el
          Centro de Comando como señal — sin tarjetas redundantes. */}
      {!liquidity && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Por cobrar y deudas
          </h2>
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
          >
            <KPICard
              icon={<Receipt className="w-5 h-5 text-amber-600" />}
              title="Cuentas por cobrar"
              value={formatCurrency(data.accountsReceivable)}
              subtitle="Byte total - Cobros BCP"
              variant="warning"
              href={reportesHref("tab=conciliacion")}
            />
            {isAtelier && (
              <KPICard
                icon={<Handshake className="w-5 h-5 text-violet-600" />}
                title="Por cobrar Fonavi"
                value={formatCurrency(data.fonaviReceivables)}
                subtitle="Gastos compartidos pendientes"
                variant="violet"
                href={`/${negocio}/fonavi`}
                secondaryAction={{
                  href: `/${negocio}/fonavi?accion=registrar-reembolso`,
                  label: "Registrar reembolso",
                  icon: <Plus className="w-4 h-4" />,
                }}
              />
            )}
            {isAtelier && data.partnerLoanBalance > 0 && (
              <KPICard
                icon={<HandCoins className="w-5 h-5 text-blue-600" />}
                title="Deuda con socio"
                value={formatCurrency(data.partnerLoanBalance)}
                subtitle="Préstamos personales pendientes"
                variant="info"
                href={`/${negocio}/prestamos-socio`}
              />
            )}
          </div>
        </section>
      )}

      {/* Enlaces a reportes detallados */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ReportLink
          href={reportesHref("tab=semanal")}
          title="Reporte semanal"
          description="Resumen día por día: Byte, ingresos, egresos y saldo · editable últimos 7 días"
        />
        <ReportLink
          href={reportesHref("tab=conciliacion")}
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
