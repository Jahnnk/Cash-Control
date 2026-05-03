"use client";

import { useState, useEffect, useCallback } from "react";
import { getUnifiedBankBalance, type BankBalanceSnapshot } from "@/app/actions/bank-balance";

export type UseBankBalance = {
  current: number;
  asOf: string | null;
  anchorDate: string | null;
  hasAnchor: boolean;
  hasDiscrepancy: boolean;
  discrepancyDate: string | null;
  discrepancyAmount: number | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
};

/**
 * Hook único para leer el saldo BCP. Lo usan Dashboard, Registro y
 * Conciliación — todos ven el mismo número porque pasan por el mismo
 * server action `getUnifiedBankBalance()`.
 *
 * Si la página opera el saldo (registrar movimientos, editar saldo),
 * llamar a `refresh()` después del cambio para invalidar el snapshot
 * local. router.refresh() del componente padre también basta porque
 * el hook re-monta y vuelve a pedir.
 */
export function useBankBalance(): UseBankBalance {
  const [snapshot, setSnapshot] = useState<BankBalanceSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const s = await getUnifiedBankBalance();
    setSnapshot(s);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    current: snapshot?.current ?? 0,
    asOf: snapshot?.asOf ?? null,
    anchorDate: snapshot?.anchorDate ?? null,
    hasAnchor: snapshot?.hasAnchor ?? false,
    hasDiscrepancy: snapshot?.hasDiscrepancy ?? false,
    discrepancyDate: snapshot?.discrepancyDate ?? null,
    discrepancyAmount: snapshot?.discrepancyAmount ?? null,
    isLoading,
    refresh,
  };
}
