"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CircleDot, Search, RefreshCw } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { BankRealCheckModal } from "./BankRealCheckModal";
import { BankInvestigationModal } from "./BankInvestigationModal";
import { getLatestBankRealCheck, type BankRealCheck } from "@/app/actions/bank-real-checks";

function todayLima(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from + "T00:00:00Z").getTime();
  const b = new Date(to + "T00:00:00Z").getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

/**
 * Conciliación compacta "vs banco real" para la franja de resumen de
 * Reportes → Movimientos. Misma maquinaria del Dashboard
 * (bank_real_checks + modales de registro e investigación): registra
 * el saldo que Jahnn ve en su app BCP, el sistema calcula la
 * diferencia server-side y la muestra al lado del saldo del sistema.
 * Pedido de Jahnn (jul-2026): "que el sistema calcule estas
 * diferencias y las coloque de manera visual en esta misma pantalla".
 */
export function BankCheckInline({ onSaved }: { onSaved?: () => void }) {
  const [check, setCheck] = useState<BankRealCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [invOpen, setInvOpen] = useState(false);

  const refresh = useCallback(async () => {
    const c = await getLatestBankRealCheck();
    setCheck(c);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch al montar
    refresh();
  }, [refresh]);

  const body = (() => {
    if (loading) return <div className="text-gray-400 text-base font-semibold">—</div>;
    if (!check) {
      return (
        <button
          onClick={() => setModalOpen(true)}
          className="text-xs font-medium text-primary hover:underline"
          title="Registra el saldo que ves en tu app del banco; el sistema calcula la diferencia"
        >
          Registrar saldo real →
        </button>
      );
    }
    const diff = Number(check.difference);
    const cuadrado = Math.abs(diff) < 0.01;
    const daysSince = daysBetween(check.checkDate, todayLima());
    const when = daysSince === 0 ? "hoy" : daysSince === 1 ? "ayer" : formatDate(check.checkDate);
    const sign = diff >= 0 ? "+" : "";

    if (cuadrado) {
      return (
        <div>
          <div className="font-semibold text-base text-emerald-600 flex items-center gap-1">
            <Check className="w-4 h-4" /> Cuadrado
          </div>
          <button onClick={() => setModalOpen(true)} className="text-[11px] text-gray-400 hover:text-gray-600 hover:underline">
            {when} · actualizar
          </button>
        </div>
      );
    }

    const attended = check.status === "resolved" || check.status === "accepted";
    return (
      <div>
        <div
          className={`font-semibold text-base flex items-center gap-1 ${attended ? "text-gray-500" : ""}`}
          style={attended ? undefined : { color: "#B45309" }}
          title={`Tu banco: ${formatCurrency(check.realBalance)} · sistema: ${formatCurrency(check.systemBalanceAtCheck)} (al ${formatDate(check.checkDate)})`}
        >
          <CircleDot className="w-3.5 h-3.5" />
          {sign}{formatCurrency(diff)}
          {attended && <span className="text-[10px] font-normal">({check.status === "resolved" ? "resuelta" : "aceptada"})</span>}
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className={daysSince >= 3 ? "text-amber-700" : "text-gray-400"}>{when}</span>
          {!attended && (
            <button onClick={() => setInvOpen(true)} className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">
              <Search className="w-3 h-3" /> Investigar
            </button>
          )}
          <button onClick={() => setModalOpen(true)} className="inline-flex items-center gap-0.5 text-gray-400 hover:text-gray-600 hover:underline" title="Registrar el saldo real de hoy">
            <RefreshCw className="w-3 h-3" /> Actualizar
          </button>
        </div>
      </div>
    );
  })();

  return (
    <>
      <div title="Diferencia entre el saldo real de tu app BCP (tú lo registras) y el saldo calculado por el sistema">
        <div className="text-gray-500 text-xs uppercase tracking-wide">Vs banco real</div>
        {body}
      </div>
      <BankRealCheckModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => { refresh(); onSaved?.(); }}
      />
      <BankInvestigationModal
        open={invOpen}
        onClose={() => setInvOpen(false)}
        onResolved={() => { refresh(); onSaved?.(); }}
      />
    </>
  );
}
