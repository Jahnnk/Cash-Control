"use client";

/**
 * Grupo → Recetas y costos → «Producción vs Excel» (Etapa 3c parte 1, 24-nov-2026). Solo mirar.
 * El costo de cada receta de Atelier con los ingredientes de Producción (lo que se pesa y hornea) y los precios
 * de Cash Control, al lado del costo del Excel de pricing. Sirve para ver qué recetas difieren antes de que
 * Producción pase a ser la dueña de los ingredientes. Plegado por defecto; carga al abrir.
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { getComparacionProduccion } from "@/app/actions/recetas-produccion";
import { UMBRAL_DIFERENCIA, type FilaComparacion } from "@/lib/recetas-produccion";
import { Pastilla, Segmentado } from "@/components/productos/ui";

type Datos = Extract<Awaited<ReturnType<typeof getComparacionProduccion>>, { ok: true }>;
type Filtro = "difieren" | "comparables" | "todas" | "faltan";

const LINEA: Record<FilaComparacion["linea"], string> = { panaderia: "Panadería", pasteleria: "Pastelería", empanadas: "Empanadas", sub_recetas: "Sub-recetas (por kg)" };
const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${n > 0 ? "+" : ""}${Math.round(n * 100)}%`;

export function ProduccionVsExcel() {
  const [d, setD] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("difieren");

  async function cargar() {
    if (d || cargando) return;
    setCargando(true);
    const r = await getComparacionProduccion();
    setCargando(false);
    if (r.ok) setD(r); else setError(r.error);
  }

  const filas = (d?.filas ?? []).filter((f) =>
    filtro === "todas" ? true
      : filtro === "faltan" ? f.sinPrecio.length > 0 || !f.pareja
        : filtro === "comparables" ? f.diferencia != null
          : f.diferencia != null && Math.abs(f.diferencia) >= UMBRAL_DIFERENCIA);
  const lineas = [...new Set(filas.map((f) => f.linea))];
  const r = d?.resumen;

  return (
    <details className="group rounded-2xl border border-gray-200/80 bg-white px-4 py-3 sm:px-6" aria-label="Producción vs Excel"
      onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) void cargar(); }}>
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-2 gap-y-1 [&::-webkit-details-marker]:hidden">
        <h2 className="text-[15px] font-semibold text-gray-900">Producción vs Excel</h2>
        <span className="text-xs text-gray-500">
          {r ? `${r.total} recetas · ${r.parecidas} parecidas · ${r.difieren} difieren · ${r.total - r.comparables} sin comparar todavía` : "Atelier: costo con la receta de Producción al lado del Excel. Solo mirar."}
        </span>
      </summary>

      <div className="mt-3 space-y-4">
        <p className="text-xs text-gray-500 max-w-3xl">
          Costo de cada receta con los <b>ingredientes de Producción</b> (lo que se pesa y hornea) y los <b>precios de Cash Control</b>, al lado del costo del Excel.
          Una pareja con «≈» es una sugerencia por nombre: se confirma en la parte 2. Aquí no cambia ningún costo.
        </p>
        {cargando && <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" />Leyendo las recetas de Producción…</p>}
        {error && <p className="text-sm text-red-700">{error}</p>}

        {d && r && <>
          <Segmentado valor={filtro} onChange={setFiltro} tamano="sm" opciones={[
            { valor: "difieren", etiqueta: `Difieren ${UMBRAL_DIFERENCIA * 100}% o más (${r.difieren})` },
            { valor: "comparables", etiqueta: `Comparables (${r.comparables})` },
            { valor: "faltan", etiqueta: `Sin comparar (${r.total - r.comparables})` },
            { valor: "todas", etiqueta: `Todas (${r.total})` },
          ]} />

          {filas.length === 0 ? <p className="text-sm text-gray-500">Nada en este filtro.</p> : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
                    <th className="py-2 pl-4 sm:pl-0 pr-2 font-medium">Producción</th>
                    <th className="py-2 px-2 font-medium text-right">Costo Producción</th>
                    <th className="py-2 px-2 font-medium">Excel</th>
                    <th className="py-2 px-2 font-medium text-right">Costo Excel</th>
                    <th className="py-2 pl-2 pr-4 sm:pr-0 font-medium text-right">Diferencia</th>
                  </tr>
                </thead>
                {lineas.map((l) => (
                  <tbody key={l}>
                    <tr><td colSpan={5} className="pt-3 pb-1 pl-4 sm:pl-0 text-xs font-semibold text-gray-700">{LINEA[l]}</td></tr>
                    {filas.filter((f) => f.linea === l).map((f) => (
                      <tr key={f.clave} className="border-b border-gray-50 align-top">
                        <td className="py-1.5 pl-4 sm:pl-0 pr-2">
                          <div className="text-gray-900">{f.receta}{f.formato && <span className="text-gray-500"> · {f.formato}</span>}</div>
                          {f.sinPrecio.length > 0 && <div className="text-[11px] text-amber-700">Sin precio: {f.sinPrecio.slice(0, 4).join(", ")}{f.sinPrecio.length > 4 ? ` y ${f.sinPrecio.length - 4} más` : ""}</div>}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">
                          {f.costoProduccion != null ? soles(f.costoProduccion) : <span className="text-gray-400" title="Falta el precio de algún insumo">≥ {soles(f.costoParcial)}</span>}
                          <div className="text-[11px] text-gray-400">{f.por === "kg" ? "por kg" : "por unidad"}</div>
                        </td>
                        <td className="py-1.5 px-2 text-gray-700">
                          {f.pareja ? <><span className="text-gray-400 mr-1" title={f.pareja.exacta ? "Mismo nombre" : "Sugerida por nombre"}>{f.pareja.exacta ? "=" : "≈"}</span>{f.pareja.nombre}</> : <span className="text-gray-400">Sin pareja</span>}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">{f.costoExcel != null ? soles(f.costoExcel) : <span className="text-gray-300">—</span>}</td>
                        <td className="py-1.5 pl-2 pr-4 sm:pr-0 text-right">
                          {f.diferencia == null ? <span className="text-gray-300">—</span>
                            : Math.abs(f.diferencia) < UMBRAL_DIFERENCIA ? <Pastilla tono="verde">{pct(f.diferencia)}</Pastilla>
                              : <Pastilla tono={f.diferencia > 0 ? "rojo" : "ambar"}>{pct(f.diferencia)}</Pastilla>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          )}

          {d.sinPrecio.length > 0 && (
            <details className="rounded-xl bg-gray-50 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-gray-700">
                Insumos de Producción sin precio en Cash Control ({d.sinPrecio.length}) · casi siempre es el mismo insumo con otro nombre
              </summary>
              <ul className="mt-2 grid gap-x-6 gap-y-0.5 text-xs text-gray-700 sm:grid-cols-2 lg:grid-cols-3">
                {d.sinPrecio.map((s) => <li key={s.nombre}>{s.nombre} <span className="text-gray-400">· {s.recetas} {s.recetas === 1 ? "receta" : "recetas"}</span></li>)}
              </ul>
            </details>
          )}
        </>}
      </div>
    </details>
  );
}
