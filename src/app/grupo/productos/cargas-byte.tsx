"use client";

/**
 * "Reportes de Byte · qué está cargado" — la grilla sede × mes de Grupo →
 * Productos (pedido de Jahnn, 22-sep-2026) y la puerta al cargador de varios
 * archivos.
 *
 * Cada casilla responde de un vistazo: ¿ese mes está completo?, ¿qué días
 * faltan?, ¿lo subió la sede, dirección o los dos? Un click en la casilla
 * abre el cargador con esa sede ya elegida.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Table2 } from "lucide-react";
import { getCoberturaRotacion } from "@/app/actions/productos-panorama";
import { GrillaCobertura, FaltaSubir, type DatosCobertura } from "./grilla-cobertura";
import { ImportarReportesModal } from "./importar-reportes";

export function CargasByte({ onImportado }: { onImportado: () => void }) {
  const [datos, setDatos] = useState<DatosCobertura | null>(null);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState<{ sede: number | null; mes: string | null } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const r = await getCoberturaRotacion(12);
    setDatos(r.ok ? { hoy: r.hoy, periodos: r.periodos, ventas: r.ventas, menor: r.menor } : null);
    setCargando(false);
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    void cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargar]);

  return (
    <section className="bg-white rounded-2xl border border-gray-200/80 p-4 sm:p-5 space-y-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
          <Table2 className="w-4 h-4 text-primary" /> Qué reportes de Byte están cargados
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">Toca una casilla para subir los reportes de esa sede y ese mes.</p>
      </div>

      {cargando && !datos ? (
        <div className="flex justify-center py-4 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : datos ? (
        <div className="space-y-3">
          <GrillaCobertura datos={datos} onCelda={(id, mes) => setModal({ sede: id, mes })} />
          <FaltaSubir datos={datos} />
        </div>
      ) : (
        <p className="text-xs text-gray-500">No se pudo leer qué está cargado.</p>
      )}

      {modal && datos && (
        <ImportarReportesModal
          sedeInicial={modal.sede}
          mesInicial={modal.mes}
          periodos={datos.periodos}
          onClose={() => setModal(null)}
          onImportado={() => { void cargar(); onImportado(); }}
        />
      )}
    </section>
  );
}
