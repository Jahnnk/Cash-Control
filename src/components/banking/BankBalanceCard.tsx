"use client";

import { Landmark } from "lucide-react";
import { useBankBalance } from "@/hooks/useBankBalance";
import { KPICard } from "@/components/ui/KPICard";
import { formatCurrency, formatDate } from "@/lib/utils";

export type BankBalanceCardProps = {
  /** Si se pasa, sobre-escribe el href primario (default: /registro). */
  href?: string;
  /** Tamaño de la tarjeta (compact para Conciliación). */
  size?: "default" | "compact";
};

/**
 * Tarjeta KPI estandarizada del Saldo BCP. Se monta en Dashboard, en
 * Conciliación y en cualquier futuro lugar que necesite mostrar el saldo
 * actual. Lee del hook `useBankBalance()` así que las 3 pantallas siempre
 * muestran el mismo número.
 */
export function BankBalanceCard({ href = "/registro", size = "default" }: BankBalanceCardProps) {
  const { current, anchorDate, hasAnchor, isLoading } = useBankBalance();

  const subtitle = isLoading
    ? "Calculando..."
    : !hasAnchor
      ? "Sin registro"
      : anchorDate
        ? `al ${formatDate(anchorDate)}`
        : "—";

  return (
    <KPICard
      icon={<Landmark className="w-5 h-5 text-primary-light" />}
      title="Saldo en banco"
      value={isLoading ? "—" : formatCurrency(current)}
      subtitle={subtitle}
      variant="default"
      size={size}
      href={href}
      dim={isLoading}
    />
  );
}
