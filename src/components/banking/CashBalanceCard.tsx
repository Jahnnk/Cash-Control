"use client";

import { Wallet } from "lucide-react";
import { useCashBalance } from "@/hooks/useCashBalance";
import { KPICard } from "@/components/ui/KPICard";
import { formatCurrency, formatDate } from "@/lib/utils";

export type CashBalanceCardProps = {
  /** Href al hacer click. Requerido — el caller pasa la ruta con prefijo
   *  de negocio (ej: `/atelier/registro`). */
  href: string;
  size?: "default" | "compact";
};

/**
 * Tarjeta KPI del saldo de caja física en efectivo. Complementa a
 * BankBalanceCard. Acumulado histórico = ingresos efectivo − egresos
 * efectivo, excluyendo préstamos del socio (is_special_loan=true).
 */
export function CashBalanceCard({ href, size = "default" }: CashBalanceCardProps) {
  const { current, asOf, isLoading } = useCashBalance();

  const subtitle = isLoading
    ? "Calculando..."
    : asOf
      ? `al ${formatDate(asOf.slice(0, 10))}`
      : "—";

  return (
    <KPICard
      icon={<Wallet className="w-5 h-5 text-emerald-500" />}
      title="Saldo en efectivo"
      value={isLoading ? "—" : formatCurrency(current)}
      subtitle={subtitle}
      variant="emerald"
      size={size}
      href={href}
      dim={isLoading}
    />
  );
}
