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
import { formatCurrency, monthLabel } from "@/lib/utils";
import { getCoberturaRotacion } from "@/app/actions/productos-panorama";
import { celdaCobertura, marcarSospechosas, type CeldaCobertura, type PeriodoCargado } from "@/lib/productos/cobertura-rotacion";
import { ImportarReportesModal } from "./importar-reportes";

const SEDES = [
  { id: 2, nombre: "Fonavi" },
  { id: 3, nombre: "Centro" },
  { id: 1, nombre: "Atelier" },
];

const TONO: Record<CeldaCobertura["estado"], string> = {
  completo: "bg-emerald-50 border-emerald-200 text-emerald-900",
  "en-curso": "bg-emerald-50 border-emerald-200 text-emerald-900",
  parcial: "bg-amber-50 border-amber-200 text-amber-900",
  vacio: "bg-gray-50 border-gray-200 text-gray-400",
};

const QUIEN: Record<NonNullable<CeldaCobertura["quien"]>, string> = {
  direccion: "subió dirección",
  sede: "subió la sede",
  ambos: "sede + dirección",
};

export function CargasByte({ onImportado }: { onImportado: () => void }) {
  const [datos, setDatos] = useState<{ hoy: string; meses: string[]; periodos: PeriodoCargado[] } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState<{ sede: number | null } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const r = await getCoberturaRotacion(6);
    setDatos(r.ok ? { hoy: r.hoy, meses: r.meses, periodos: r.periodos } : null);
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
        <button type="button" onClick={() => setModal({ sede: null })}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-light rounded-lg shrink-0">
          <Upload className="w-4 h-4" /> Subir reportes
        </button>
      </div>

      {cargando && !datos ? (
        <div className="flex justify-center py-4 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : datos ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="text-left font-medium text-gray-500 px-1">Sede</th>
                {datos.meses.map((m) => (
                  <th key={m} className="text-left font-medium text-gray-500 px-1">
                    {monthLabel(m)}{m === datos.hoy.slice(0, 7) ? " (en curso)" : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SEDES.map((s) => {
                const celdas = marcarSospechosas(datos.meses.map((m) => celdaCobertura(datos.periodos.filter((p) => p.businessId === s.id), m, datos.hoy)));
                return (
                <tr key={s.id}>
                  <td className="px-1 font-semibold text-gray-800 whitespace-nowrap">{s.nombre}</td>
                  {celdas.map((c) => {
                    const m = c.month;
                    return (
                      <td key={m} className="align-top">
                        <button type="button" onClick={() => setModal({ sede: s.id })}
                          className={`w-full min-w-[7.5rem] text-left rounded-lg border px-2 py-1.5 hover:ring-2 hover:ring-primary/30 ${c.sospechosa ? "bg-red-50 border-red-200 text-red-900" : TONO[c.estado]}`}>
                          {c.estado === "vacio" ? (
                            <span>Sin reporte</span>
                          ) : (
                            <>
                              <div className="font-semibold tabular-nums">{formatCurrency(c.ventas)}</div>
                              <div className="text-[10px]">
                                {c.estado === "completo" ? "mes completo" : c.estado === "en-curso" ? `al día (${c.diasCubiertos} días)` : `${c.diasCubiertos} de ${c.diasMes} días`}
                                {c.quien ? ` · ${QUIEN[c.quien]}` : ""}
                              </div>
                              {c.faltan && <div className="text-[10px]">falta: {c.faltan}</div>}
                              {c.sospechosa && <div className="text-[10px] font-semibold">vende muy poco: ¿carga parcial? vuelve a subirlo</div>}
                            </>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-gray-500">No se pudo leer qué está cargado.</p>
      )}

      {modal && datos && (
        <ImportarReportesModal
          sedeInicial={modal.sede}
          periodos={datos.periodos}
          onClose={() => setModal(null)}
          onImportado={() => { void cargar(); onImportado(); }}
        />
      )}
    </section>
  );
}
