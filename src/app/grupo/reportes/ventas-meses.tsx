"use client";

/**
 * Reportes · «Ventas» (Fase 2, punto 1 de Jahnn, 23-oct-2026): lo vendido según Byte, por sede y del grupo, los últimos 6 meses.
 * En el grupo, lo que Atelier le vende a las cafeterías se cuenta una sola vez («a clientes»). Sale de las seis cifras
 * (getEstadoResultados), la misma fuente que la cascada y el estado de resultados.
 */

import { useEffect, useState } from "react";
import { getEstadoResultados } from "@/app/actions/estado-resultados";
import { armarFilas, SEDES_VENTAS as SEDES, type FilaMes } from "@/lib/ventas-meses";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];
const corto = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const soles = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;
export function VentasMeses({ mes, periodo }: { mes: string; periodo: string }) {
  const [res, setRes] = useState<{ mes: string; filas: FilaMes[] | null } | null>(null);
  useEffect(() => {
    let vivo = true;
    getEstadoResultados(mes)
      .then((r) => { if (vivo) setRes({ mes, filas: r.ok ? armarFilas(r.data) : null }); })
      .catch(() => { if (vivo) setRes({ mes, filas: null }); });
    return () => { vivo = false; };
  }, [mes]);

  return <VistaVentasMeses filas={res?.mes === mes ? res.filas : undefined} mes={mes} periodo={periodo} />;
}

/** Solo dibuja (así se puede ver y probar sin base de datos). `undefined` = cargando; `null` = no se pudo leer. */
export function VistaVentasMeses({ filas, mes, periodo }: { filas: FilaMes[] | null | undefined; mes: string; periodo: string }) {
  const tope = Math.max(1, ...(filas ?? []).map((f) => f.grupo ?? 0));
  return (
    <section className="rounded-2xl border border-gray-200/80 bg-white px-4 py-4 sm:px-6 sm:py-5" aria-label="Ventas por mes">
      <h2 className="text-[15px] font-semibold text-gray-900">Ventas <span className="font-normal text-gray-500">· los últimos 6 meses hasta {periodo}</span></h2>
      <p className="mt-0.5 text-xs text-gray-500">Lo vendido según Byte. En el grupo, lo que Atelier le vende a las cafeterías se cuenta una sola vez.</p>
      {filas === undefined ? (
        <div className="mt-3 h-40 rounded-xl bg-gray-50 motion-safe:animate-pulse" aria-label="Cargando las ventas" />
      ) : filas === null ? (
        <p className="mt-3 text-sm text-gray-500">No se pudieron leer las ventas.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-[11px] font-medium uppercase tracking-wider text-gray-400">
                <th className="py-1.5 pr-3 font-medium">Mes</th>
                {SEDES.map((s) => <th key={s.id} className="py-1.5 pr-3 text-right font-medium">{s.nombre}</th>)}
                <th className="py-1.5 pl-3 font-medium">Grupo (a clientes)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filas.map((f, i) => {
                const antes = i > 0 ? filas[i - 1] : null;
                const delta = !f.enCurso && antes && antes.grupo && f.grupo ? ((f.grupo - antes.grupo) / antes.grupo) * 100 : null;
                return (
                  <tr key={f.mes} className={f.mes === mes ? "bg-primary-50/40" : ""}>
                    <td className="py-2 pr-3 font-medium text-gray-800 whitespace-nowrap">{corto(f.mes)}{f.enCurso && <span className="ml-1 text-[10px] font-normal text-gray-400">en curso</span>}</td>
                    {SEDES.map((s) => <td key={s.id} className="py-2 pr-3 text-right tabular-nums text-gray-700">{f.sedes[s.id] === null ? "—" : soles(f.sedes[s.id]!)}</td>)}
                    <td className="py-2 pl-3">
                      {f.grupo === null ? <span className="text-gray-400">—</span> : (
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 min-w-[3rem] flex-1 rounded-full bg-gray-100">
                            <div className={`h-full rounded-full ${f.enCurso ? "bg-primary/40" : "bg-primary"}`} style={{ width: `${(f.grupo / tope) * 100}%` }} />
                          </div>
                          <span className="w-24 text-right font-semibold tabular-nums text-gray-900">{soles(f.grupo)}</span>
                          <span className={`w-12 text-right text-[11px] tabular-nums ${delta === null ? "text-gray-300" : delta < 0 ? "text-red-600" : "text-emerald-700"}`}>
                            {delta === null ? "" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`}
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
