"use client";

/**
 * Atelier B2B en el dashboard de Grupo — resumen, no operación.
 *
 * Antes esta zona traía enteras las dos secciones de Luis (ranking de
 * clientes, tabla de deudores, documento por documento). Jahnn pidió
 * (10-ago-2026) que el dashboard quede limpio: acá van los tres números
 * que sirven para decidir y el detalle vive detrás de un botón.
 *
 * El detalle NO se carga con la página: se pide al abrirlo. Así el
 * dashboard no paga por datos que casi nunca se miran.
 */

import { useState, useTransition } from "react";
import { Users, ChevronDown, Loader2, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { AtelierB2BResumen } from "@/app/actions/atelier-b2b";
import { getClientSalesAnalisis, type ClientSalesAnalisis } from "@/app/actions/client-sales";
import { getReceivables, type ReceivablesData } from "@/app/actions/receivables";
import { ClientSalesSection } from "@/app/[negocio]/panel/client-sales-section";
import { ReceivablesSection } from "@/app/[negocio]/panel/receivables-section";

function fechaCorta(iso: string) {
  const [, m, d] = iso.split("-");
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
  return `${d} ${meses[Number(m) - 1]}`;
}

export function AtelierB2BCard({ resumen }: { resumen: AtelierB2BResumen }) {
  const [abierto, setAbierto] = useState(false);
  const [clientes, setClientes] = useState<ClientSalesAnalisis | null>(null);
  const [cobranza, setCobranza] = useState<ReceivablesData | null>(null);
  const [cargando, startTransition] = useTransition();

  if (!resumen.hayDatos) return null;

  function alternar() {
    if (abierto) {
      setAbierto(false);
      return;
    }
    setAbierto(true);
    // Se trae una sola vez; al volver a abrir ya está en memoria.
    if (clientes && cobranza) return;
    startTransition(async () => {
      const [c, r] = await Promise.all([getClientSalesAnalisis(), getReceivables()]);
      setClientes(c);
      setCobranza(r);
    });
  }

  return (
    <div className="pt-1">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-400" />
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Atelier B2B</h3>
              <p className="text-[11px] text-gray-500">
                Clientes y cobranza
                {resumen.periodoFin && <> · semana al {fechaCorta(resumen.periodoFin)}</>}
              </p>
            </div>
          </div>

          <button
            onClick={alternar}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary-light"
          >
            {abierto ? "Ocultar detalle" : "Ver detalle"}
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${abierto ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        {/* Los tres números que sirven para decidir */}
        <div className="grid grid-cols-1 sm:grid-cols-3 border-t border-gray-100 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
          {resumen.hayClientes && (
            <div className="px-4 py-3">
              <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">
                Venta a clientes
              </div>
              <div className="text-lg font-bold text-gray-900 mt-0.5 tabular-nums">
                {formatCurrency(resumen.ventaClientes)}
              </div>
              <div className="text-[11px] mt-0.5">
                {resumen.variacionPct === null ? (
                  <span className="text-gray-400">
                    {resumen.clientesExternos} cliente
                    {resumen.clientesExternos === 1 ? "" : "s"}
                  </span>
                ) : (
                  <span
                    className={resumen.variacionPct >= 0 ? "text-emerald-700" : "text-red-600"}
                  >
                    {resumen.variacionPct >= 0 ? "▲" : "▼"}{" "}
                    {Math.abs(resumen.variacionPct).toFixed(1)}% vs semana anterior
                  </span>
                )}
              </div>
            </div>
          )}

          {resumen.hayCobranza && (
            <>
              <div className="px-4 py-3">
                <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">
                  Te deben
                </div>
                <div className="text-lg font-bold text-gray-900 mt-0.5 tabular-nums">
                  {formatCurrency(resumen.porCobrar)}
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  {resumen.porCobrarDocs} documento{resumen.porCobrarDocs === 1 ? "" : "s"}
                </div>
              </div>

              <div className={`px-4 py-3 ${resumen.atrasado > 0 ? "bg-red-50" : ""}`}>
                <div
                  className={`text-[10px] uppercase tracking-wide font-semibold ${
                    resumen.atrasado > 0 ? "text-red-700" : "text-gray-500"
                  }`}
                >
                  Atrasado
                </div>
                <div
                  className={`text-lg font-bold mt-0.5 tabular-nums flex items-center gap-1.5 ${
                    resumen.atrasado > 0 ? "text-red-700" : "text-gray-900"
                  }`}
                >
                  {resumen.atrasado > 0 && <AlertTriangle className="w-4 h-4" />}
                  {formatCurrency(resumen.atrasado)}
                </div>
                <div
                  className={`text-[11px] mt-0.5 ${
                    resumen.atrasado > 0 ? "text-red-700/80" : "text-gray-500"
                  }`}
                >
                  {resumen.atrasado > 0
                    ? `${resumen.atrasadoDocs} documento${resumen.atrasadoDocs === 1 ? "" : "s"} por cobrar`
                    : "nada vencido"}
                </div>
              </div>
            </>
          )}
        </div>

        {abierto && (
          <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-4 space-y-6">
            {cargando && !clientes && !cobranza ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Cargando el detalle…
              </div>
            ) : (
              <>
                {clientes?.hayDatos && <ClientSalesSection data={clientes} />}
                {cobranza?.hayDatos && <ReceivablesSection data={cobranza} />}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
