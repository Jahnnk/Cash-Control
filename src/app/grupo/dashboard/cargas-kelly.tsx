"use client";

/**
 * "Excel de Kelly · qué está cargado" — la grilla sede × mes del dashboard de
 * Grupo (pedido de Jahnn, 22-sep-2026: "quiero lo mismo que hiciste con la
 * carga de Byte… hoy subo los Excel de Kelly desde el dashboard, pero está
 * escondido y desordenado").
 *
 * Cada casilla dice cuánto vendió y gastó la sede ese mes según el Excel,
 * hasta qué día llega y cuándo se subió. Un click abre la carga de esa sede.
 * La regla de cada estado vive en lib/cobertura-kelly.ts.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { formatCurrency, monthLabel } from "@/lib/utils";
import { getCoberturaKelly } from "@/app/actions/cobertura-kelly";
import { celdaKelly, fechaCortaKelly, type CeldaKelly, type MesKelly } from "@/lib/cobertura-kelly";
import { ExcelImportModal } from "@/app/[negocio]/configuracion/excel-import-modal";

type Sede = "atelier" | "fonavi" | "centro";

const SEDES: { id: number; code: Sede; nombre: string }[] = [
  { id: 2, code: "fonavi", nombre: "Fonavi" },
  { id: 3, code: "centro", nombre: "Centro" },
  { id: 1, code: "atelier", nombre: "Atelier" },
];

const TONO: Record<CeldaKelly["estado"], string> = {
  completo: "bg-emerald-50 border-emerald-200 text-emerald-900",
  "al-dia": "bg-emerald-50 border-emerald-200 text-emerald-900",
  atrasado: "bg-amber-50 border-amber-200 text-amber-900",
  parcial: "bg-amber-50 border-amber-200 text-amber-900",
  manual: "bg-slate-50 border-slate-200 text-slate-600",
  vacio: "bg-gray-50 border-gray-200 text-gray-400",
};

/**
 * El botón "Subir Excel de Kelly": primero se elige la sede (los Excel de las
 * tres sedes son idénticos en formato; un import en la sede equivocada sería
 * un incidente de datos silencioso) y recién ahí se abre el cargador de
 * siempre, que ya maneja varios meses a la vez.
 */
export function SubirExcelKelly({ sede, onCerrar, className = "" }: {
  sede?: Sede | null;
  onCerrar?: () => void;
  className?: string;
}) {
  const [eligiendo, setEligiendo] = useState(false);
  const [elegida, setElegida] = useState<Sede | null>(null);
  const router = useRouter();
  const abierta = elegida ?? sede ?? null;

  function cerrar() {
    setElegida(null);
    router.refresh();
    onCerrar?.();
  }

  return (
    <>
      {sede === undefined && (
        <button
          type="button"
          onClick={() => setEligiendo(true)}
          className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-light rounded-xl whitespace-nowrap ${className}`}
        >
          <Upload className="w-4 h-4" /> Subir Excel de Kelly
        </button>
      )}

      {eligiendo && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setEligiendo(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-primary" /> ¿De qué sede es el Excel?
                </h2>
                <p className="text-xs text-gray-500 mt-1">Los tres Excel tienen el mismo formato: elegirla evita cargar datos en la sede equivocada.</p>
              </div>
              <button type="button" onClick={() => setEligiendo(false)} className="text-gray-400 hover:text-gray-600 p-1" aria-label="Cerrar">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {SEDES.map((s) => (
                <button
                  key={s.code}
                  type="button"
                  onClick={() => { setEligiendo(false); setElegida(s.code); }}
                  className="rounded-xl border border-gray-200 hover:border-primary-light hover:bg-primary-50/50 py-4 text-sm font-semibold text-gray-800"
                >
                  {s.nombre}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {abierta && <ExcelImportModal negocio={abierta} sedeCentral={abierta} open onClose={cerrar} />}
    </>
  );
}

type DatosKelly = { hoy: string; meses: string[]; celdas: MesKelly[] };

export function CargasKelly({ inicial = null }: { inicial?: DatosKelly | null } = {}) {
  const [datos, setDatos] = useState<DatosKelly | null>(inicial);
  const [error, setError] = useState<string | null>(null);
  const [sede, setSede] = useState<Sede | null>(null);

  const cargar = useCallback(async () => {
    const r = await getCoberturaKelly(6);
    if (r.ok) setDatos({ hoy: r.hoy, meses: r.meses, celdas: r.celdas }); else setError(r.error);
  }, []);

  useEffect(() => {
    if (inicial) return;
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    void cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargar, inicial]);

  return (
    <section className="bg-white rounded-2xl border border-gray-200/80 p-4 sm:p-6 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-gray-900">Excel de Kelly · qué está cargado</h2>
          <p className="text-xs text-gray-500 mt-1 max-w-3xl leading-relaxed">
            Cuánto vendió y gastó cada sede según el Excel, hasta qué día llega y cuándo se subió. El Excel puede traer varios meses:
            al subirlo eliges cuáles importar. Click en una casilla para subir el Excel de esa sede.
          </p>
        </div>
        <SubirExcelKelly onCerrar={() => void cargar()} />
      </header>

      {error ? (
        <p className="text-sm text-gray-500">{error}</p>
      ) : !datos ? (
        <div className="flex justify-center py-8 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <div className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6">
          <table className="w-full text-xs border-separate border-spacing-1.5 min-w-[880px] table-fixed">
            <thead>
              <tr>
                <th className="text-left font-medium text-gray-500 px-1 w-16">Sede</th>
                {datos.meses.map((m) => (
                  <th key={m} className="text-left font-medium text-gray-500 px-1">
                    {monthLabel(m)}{m === datos.hoy.slice(0, 7) ? " · en curso" : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SEDES.map((s) => (
                <tr key={s.id}>
                  <td className="px-1 font-semibold text-gray-800 whitespace-nowrap">{s.nombre}</td>
                  {datos.meses.map((m) => {
                    const base = datos.celdas.find((c) => c.businessId === s.id && c.month === m);
                    if (!base) return <td key={m} />;
                    const c = celdaKelly(base, datos.hoy, s.id !== 1);
                    const conDatos = c.estado !== "vacio" && c.estado !== "manual";
                    return (
                      <td key={m} className="align-top h-px">
                        <button
                          type="button"
                          onClick={() => setSede(s.code)}
                          className={`w-full h-full text-left rounded-xl border px-3 py-2.5 hover:ring-2 hover:ring-primary/30 ${TONO[c.estado]}`}
                        >
                          {conDatos ? (
                            <>
                              <div className="text-sm font-semibold tabular-nums">{formatCurrency(c.ventas)}</div>
                              <div className="text-[11px] opacity-80 tabular-nums">gastos {formatCurrency(c.gastos)}</div>
                              <div className="text-[11px] font-medium mt-1.5">{c.texto}</div>
                              {c.cargadoEl && <div className="text-[10px] opacity-70">subido el {fechaCortaKelly(c.cargadoEl)}</div>}
                            </>
                          ) : (
                            <>
                              <div className="text-sm">{c.estado === "manual" ? "A mano" : "Sin cargar"}</div>
                              {c.estado === "manual" ? (
                                <>
                                  <div className="text-[11px] opacity-80 tabular-nums">gastos {formatCurrency(c.gastosManuales ?? 0)}</div>
                                  <div className="text-[11px] font-medium mt-1.5">antes del Excel</div>
                                </>
                              ) : (
                                <div className="text-[11px] opacity-80">click para subir</div>
                              )}
                            </>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sede && <SubirExcelKelly sede={sede} onCerrar={() => { setSede(null); void cargar(); }} />}
    </section>
  );
}
