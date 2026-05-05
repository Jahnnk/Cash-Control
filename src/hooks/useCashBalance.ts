"use client";

import { useState, useEffect, useCallback } from "react";
import { getCashBalance, type CashBalanceSnapshot } from "@/app/actions/bank-balance";

export type UseCashBalance = {
  current: number;
  asOf: string | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
};

/**
 * Hook único para leer el saldo de caja física en efectivo del negocio
 * activo. Mismo patrón que useBankBalance pero para el flujo de efectivo.
 */
export function useCashBalance(): UseCashBalance {
  const [snapshot, setSnapshot] = useState<CashBalanceSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const s = await getCashBalance();
    setSnapshot(s);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState dentro del effect es intencional (sync inicial), igual patrón que useBankBalance
    refresh();
  }, [refresh]);

  return {
    current: snapshot?.current ?? 0,
    asOf: snapshot?.asOf ?? null,
    isLoading,
    refresh,
  };
}
