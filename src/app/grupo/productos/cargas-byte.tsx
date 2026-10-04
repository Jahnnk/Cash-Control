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
import { Upload, Loader2, Table2 } from "lucide-react";
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
    <section className="bg-white rounded-xl border-2 border-primary/30 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
            <Table2 className="w-4 h-4 text-primary" /> Reportes de Byte · rotación de productos
          </h2>
          <p className="text-[11px] text-gray-500 mt-0.5 max-w-3xl">
            Qué días de cada mes están cargados y quién los subió. Sube varios archivos a la vez —meses completos o lo
            que va del mes—; antes de guardar te dice qué va a pasar con cada uno. Click en una casilla para subir a esa sede.
          </p>
        </div>
        <button type="button" onClick={() => setModal({ sede: null, mes: null })}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-light rounded-lg shrink-0">
          <Upload className="w-4 h-4" /> Subir Reportes Gerencia
        </button>
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
