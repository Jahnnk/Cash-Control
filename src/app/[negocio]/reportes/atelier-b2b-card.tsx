"use client";

/**
 * Atelier B2B: clientes y cobranza. Vivía en el Resumen de Grupo; el 19-oct-2026 Jahnn lo pasó a Atelier → Reportes
 * (pestaña «Clientes») porque lo debe vigilar el administrador de Atelier, no él. Sigue siendo resumen con detalle
 * detrás de un botón.
 *
 * El detalle NO se carga con la página: se pide al abrirlo. Así el
 * dashboard no paga por datos que casi nunca se miran.
 */

import { useEffect, useState, useTransition } from "react";
import { Users, ChevronDown, Loader2, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { getAtelierB2BResumen, type AtelierB2BResumen } from "@/app/actions/atelier-b2b";
import { getClientSalesAnalisis, type ClientSalesAnalisis } from "@/app/actions/client-sales";
import { getReceivables, type ReceivablesData } from "@/app/actions/receivables";
import { ClientSalesSection } from "@/app/[negocio]/panel/client-sales-section";
import { ReceivablesSection } from "@/app/[negocio]/panel/receivables-section";
import { CobranzaEnviosCard } from "@/components/cobranza-envios";
import { getCobranzaEnvios, type CobranzaEnvios } from "@/app/actions/cobranza-envios";

/** Desde el 20-nov-2026 «Te deben» y «Atrasado» salen de Finanzas de Envíos; el detalle de Byte queda oculto, no borrado. */
const MOSTRAR_CUENTAS_POR_COBRAR_BYTE = false;

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
  const [envios, setEnvios] = useState<CobranzaEnvios | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    void getCobranzaEnvios().then((r) => { if (vivo) setEnvios(r.ok ? r.datos : null); });
    return () => { vivo = false; };
  }, []);

  function alternar() {
    if (abierto) {
      setAbierto(false);
      return;
    }
    setAbierto(true);
    // Se trae una sola vez; al volver a abrir ya está en memoria.
    if (clientes) return;
    startTransition(async () => {
      const [c, r] = await Promise.all([getClientSalesAnalisis(), MOSTRAR_CUENTAS_POR_COBRAR_BYTE ? getReceivables() : Promise.resolve(null)]);
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

          {envios && (
            <>
              <div className="px-4 py-3">
                <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">
                  Te deben
                </div>
                <div className="text-lg font-bold text-gray-900 mt-0.5 tabular-nums">
                  {formatCurrency(envios.total)}
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  Fonavi, Centro y {envios.b2b.clientes} cliente{envios.b2b.clientes === 1 ? "" : "s"} · Finanzas de Envíos
                </div>
              </div>

              <div className={`px-4 py-3 ${envios.masDe30 > 0 ? "bg-red-50" : ""}`}>
                <div
                  className={`text-[10px] uppercase tracking-wide font-semibold ${
                    envios.masDe30 > 0 ? "text-red-700" : "text-gray-500"
                  }`}
                >
                  Atrasado
                </div>
                <div
                  className={`text-lg font-bold mt-0.5 tabular-nums flex items-center gap-1.5 ${
                    envios.masDe30 > 0 ? "text-red-700" : "text-gray-900"
                  }`}
                >
                  {envios.masDe30 > 0 && <AlertTriangle className="w-4 h-4" />}
                  {formatCurrency(envios.masDe30)}
                </div>
                <div
                  className={`text-[11px] mt-0.5 ${
                    envios.masDe30 > 0 ? "text-red-700/80" : "text-gray-500"
                  }`}
                >
                  {envios.masDe30 > 0
                    ? "con más de 30 días"
                    : "nada con más de 30 días"}
                </div>
              </div>
            </>
          )}
        </div>

        {abierto && (
          <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-4 space-y-6">
            {cargando && !clientes ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Cargando el detalle…
              </div>
            ) : (
              <>
                {clientes?.hayDatos && <ClientSalesSection data={clientes} />}
                <CobranzaEnviosCard datos={envios ?? null} />
                {MOSTRAR_CUENTAS_POR_COBRAR_BYTE && cobranza?.hayDatos && <ReceivablesSection data={cobranza} />}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** La pestaña «Clientes» de los Reportes de Atelier: pide su propio resumen al abrirse. */
export function ClientesAtelier() {
  const [resumen, setResumen] = useState<AtelierB2BResumen | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    getAtelierB2BResumen().then((r) => { if (vivo) setResumen(r); }).catch(() => { if (vivo) setResumen(null); });
    return () => { vivo = false; };
  }, []);
  if (resumen === undefined) return <p className="py-8 text-center text-sm text-gray-400">Cargando clientes…</p>;
  if (!resumen) {
    return <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">Todavía no hay clientes ni cuentas por cobrar: aparecen cuando el administrador sube los reportes de Byte del sábado.</p>;
  }
  return <AtelierB2BCard resumen={resumen} />;
}
