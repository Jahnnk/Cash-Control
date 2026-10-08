"use client";

/**
 * Clientes de Atelier para dirección (UX, 8-oct-2026, decisión de Jahnn): lo REAL, de los reportes
 * de Byte que sube Luis — quién compra, quién cayó y cuánto te deben —, con las mismas secciones de
 * su panel. Antes esta pantalla solo listaba Centro, Fonavi y Otros con saldo S/0 (la lista del
 * registro manual), que contradecía el «Te deben» de Byte. Esa lista queda plegada al final.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { getClientSalesAnalisis, type ClientSalesAnalisis } from "@/app/actions/client-sales";
import { getReceivables, type ReceivablesData } from "@/app/actions/receivables";
import { ClientSalesSection } from "../panel/client-sales-section";
import { ClientSalesImportModal } from "../panel/client-sales-import-modal";
import { ReceivablesSection } from "../panel/receivables-section";
import { ReceivablesImportModal } from "../panel/receivables-import-modal";
import { SeccionDesplegable } from "@/components/productos/ui";

const Cargando = ({ que }: { que: string }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">Cargando {que}…</div>
);

export function ClientesAtelier({ listaManual }: { listaManual: ReactNode }) {
  const [clientes, setClientes] = useState<ClientSalesAnalisis | null>(null);
  const [cobranza, setCobranza] = useState<ReceivablesData | null>(null);
  const [subirClientes, setSubirClientes] = useState(false);
  const [subirCobranza, setSubirCobranza] = useState(false);
  const cargarClientes = useCallback(async () => setClientes(await getClientSalesAnalisis()), []);
  const cargarCobranza = useCallback(async () => setCobranza(await getReceivables()), []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    void cargarClientes();
    void cargarCobranza();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargarClientes, cargarCobranza]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
        <p className="text-sm text-gray-500 mt-1">Quién le compra a Atelier y cuánto te deben, con los reportes de Byte que sube la sede.</p>
      </div>
      {cobranza ? <ReceivablesSection data={cobranza} onSubir={() => setSubirCobranza(true)} onRecargar={cargarCobranza} /> : <Cargando que="las cuentas por cobrar" />}
      {clientes ? <ClientSalesSection data={clientes} onSubir={() => setSubirClientes(true)} /> : <Cargando que="los clientes" />}
      <SeccionDesplegable titulo="Lista del registro manual" subtitulo="Centro, Fonavi y Otros: los clientes que se usaban al anotar ingresos a mano. Ya no se usa a diario.">
        {listaManual}
      </SeccionDesplegable>
      {subirClientes && <ClientSalesImportModal onClose={() => setSubirClientes(false)} onImported={cargarClientes} />}
      {subirCobranza && <ReceivablesImportModal onClose={() => setSubirCobranza(false)} onImported={cargarCobranza} />}
    </div>
  );
}
