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
 * IMPORTANTE: si la página muta movimientos (registrar/editar/eliminar
 * ingresos o egresos), llamar SIEMPRE a `refresh()` después del
 * cambio. `router.refresh()` NO basta — solo invalida Server
 * Components, mientras que este hook mantiene `snapshot` en estado
 * local de Client Component y NO se re-monta automáticamente al
 * cambiar caché del router. Sin la llamada explícita, el card del
 * saldo seguirá mostrando el valor anterior hasta que la página
 * se recargue o el componente se desmonte. Ver Prompt B (fix de
 * "Saldo BCP HOY no actualiza tras mutación").
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
