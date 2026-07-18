"use client";

import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { monthLabel } from "@/lib/utils";
import type { IncentiveProgress } from "@/lib/incentives/engine";
import { getMejorVendedor } from "@/app/actions/mejor-vendedor";
import { buildSedeShareLines, buildShareHeader, SHARE_FOOTER } from "@/lib/incentives/share-text";

/**
 * "📣 Compartir con el equipo" en el Panel de Sede — para los ADMINS,
 * que son la cara del programa ante los asesores (pedido de Jahnn,
 * jul-2026). Usa la MISMA lib de texto que el panel central del Grupo:
 * el mensaje del admin y el de la dirección jamás pueden diferir.
 */

function todayLima() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}
const ddmm = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function ShareSummary({
  sedeLabel,
  month,
  progress,
  ticketBase,
}: {
  sedeLabel: string;
  month: string;
  progress: IncentiveProgress;
  ticketBase: number;
}) {
  const [copied, setCopied] = useState(false);
  const [mv, setMv] = useState<{ ganador: string | null; periodEnd: string | null }>({ ganador: null, periodEnd: null });

  useEffect(() => {
    (async () => {
      const r = await getMejorVendedor(month);
      if (r.ok) setMv({ ganador: r.data.result.ganador, periodEnd: r.data.periodEnd });
    })();
  }, [month]);

  const text = [
    buildShareHeader(monthLabel(month), ddmm(todayLima())),
    "",
    ...buildSedeShareLines({
      sede: sedeLabel,
      daysLoaded: progress.daysLoaded,
      ticketActual: progress.ticketActual,
      ticketBase,
      nivelAlcanzado: progress.nivelAlcanzado?.nombre ?? null,
      proximoNivel: progress.proximoNivel
        ? { nombre: progress.proximoNivel.level.nombre, faltaSoles: progress.proximoNivel.faltaSoles }
        : null,
      trafficFloor: progress.traffic.floor,
      personasPorDia: progress.traffic.personasPorDia,
      trafficCumple: progress.traffic.cumple,
      mejorVendedor: mv.ganador,
      mvPeriodEnd: mv.periodEnd,
    }),
    "",
    SHARE_FOOTER,
  ].join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* sin clipboard — queda la selección manual */ }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <div className="text-sm font-semibold text-gray-900">📣 Compartir con el equipo</div>
          <div className="text-[11px] text-gray-400">
            El avance de hoy, listo para el grupo de los chicos — mismos números que este panel y que
            la dirección. La transparencia es parte del programa.
          </div>
        </div>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-primary hover:bg-primary-light rounded-lg"
        >
          {copied ? <><Check className="w-3.5 h-3.5" /> Copiado</> : <><Copy className="w-3.5 h-3.5" /> Copiar resumen</>}
        </button>
      </div>
      <pre className="text-xs text-gray-700 bg-gray-50 border border-gray-100 rounded-lg p-3 whitespace-pre-wrap font-sans">
        {text}
      </pre>
    </div>
  );
}
