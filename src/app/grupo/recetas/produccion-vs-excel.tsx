"use client";

/**
 * Grupo → Recetas y costos → «Producción vs Excel» (Etapa 3c, 24-nov-2026). No cambia costos.
 * Parte 2: cada receta e insumo puede tener su pareja guardada («Cambiar pareja»), con su equivalencia.
 * El costo de cada receta de Atelier con los ingredientes de Producción (lo que se pesa y hornea) y los precios
 * de Cash Control, al lado del costo del Excel de pricing. Sirve para ver qué recetas difieren antes de que
 * Producción pase a ser la dueña de los ingredientes. Plegado por defecto; carga al abrir.
 */

import { Fragment, useState } from "react";
import { Loader2 } from "lucide-react";
import { getComparacionProduccion, guardarParejaProduccion, type OpcionCC } from "@/app/actions/recetas-produccion";
import { factorInsumoPorDefecto, UMBRAL_DIFERENCIA, type FilaComparacion } from "@/lib/recetas-produccion";
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

  const [editando, setEditando] = useState<string | null>(null);

  async function cargar(otraVez = false) {
    if ((d && !otraVez) || cargando) return;
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
                      <Fragment key={f.clave}>
                      <tr className="border-b border-gray-50 align-top">
                        <td className="py-1.5 pl-4 sm:pl-0 pr-2">
                          <div className="text-gray-900">{f.receta}{f.formato && <span className="text-gray-500"> · {f.formato}</span>}</div>
                          {f.sinPrecio.length > 0 && <div className="text-[11px] text-amber-700">Sin precio: {f.sinPrecio.slice(0, 4).join(", ")}{f.sinPrecio.length > 4 ? ` y ${f.sinPrecio.length - 4} más` : ""}</div>}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">
                          {f.costoProduccion != null ? soles(f.costoProduccion) : <span className="text-gray-400" title="Falta el precio de algún insumo">≥ {soles(f.costoParcial)}</span>}
                          <div className="text-[11px] text-gray-400">{f.por === "kg" ? "por kg" : "por unidad"}</div>
                        </td>
                        <td className="py-1.5 px-2 text-gray-700">
                          {f.pareja ? <><span className="text-gray-400 mr-1" title={f.pareja.guardada ? "Pareja confirmada" : f.pareja.exacta ? "Mismo nombre" : "Sugerida por nombre"}>{f.pareja.guardada ? "✓" : f.pareja.exacta ? "=" : "≈"}</span>{f.pareja.nombre}</> : <span className="text-gray-400">Sin pareja</span>}
                          {f.pareja?.factor != null && f.pareja.factor !== 1 && f.por === "und" && <div className="text-[11px] text-gray-400">1 del Excel = {f.pareja.factor.toLocaleString("es-PE")} de Producción</div>}
                          <button type="button" onClick={() => setEditando(editando === f.clave ? null : f.clave)} className="block text-[11px] text-primary hover:underline">
                            {editando === f.clave ? "Cerrar" : "Cambiar pareja"}
                          </button>
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">{f.costoExcel != null ? soles(f.costoExcel) : <span className="text-gray-300">—</span>}</td>
                        <td className="py-1.5 pl-2 pr-4 sm:pr-0 text-right">
                          {f.diferencia == null ? <span className="text-gray-300">—</span>
                            : Math.abs(f.diferencia) < UMBRAL_DIFERENCIA ? <Pastilla tono="verde">{pct(f.diferencia)}</Pastilla>
                              : <Pastilla tono={f.diferencia > 0 ? "rojo" : "ambar"}>{pct(f.diferencia)}</Pastilla>}
                        </td>
                      </tr>
                      {editando === f.clave && (
                        <tr><td colSpan={5} className="px-4 sm:px-0 pb-3">
                          <EditorPareja tipo="receta" prodClave={f.clave} prodNombre={`${f.receta}${f.formato ? ` · ${f.formato}` : ""}`}
                            opciones={d.opciones.filter((o) => o.tipo !== "insumo")} refActual={f.pareja?.guardada ? f.pareja.ref : f.pareja?.ref ?? null}
                            factorActual={f.pareja?.factor ?? 1} guardada={!!f.pareja?.guardada}
                            ayudaFactor={(u) => u === "und" ? "¿Cuántas unidades de Producción hacen 1 del Excel? (paquete de 5 = 5; 1 cuarto de bandeja = 0.25)" : null}
                            onListo={() => { setEditando(null); void cargar(true); }} />
                        </td></tr>
                      )}
                      </Fragment>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          )}

          <details className="rounded-xl bg-gray-50 px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-gray-700">
              Insumos: {d.sinPrecio.length} sin precio · {d.insumosEmparejados.length} con pareja confirmada
            </summary>
            <p className="mt-1 text-[11px] text-gray-500">Casi siempre es el mismo insumo con otro nombre. Elige con cuál va en Cash Control y cómo se mide.</p>
            <ul className="mt-2 divide-y divide-gray-200/70">
              {[...d.sinPrecio.map((s) => ({ id: s.id, nombre: s.nombre, base: s.base, detalle: `${s.recetas} ${s.recetas === 1 ? "receta" : "recetas"} · sin precio`, refCC: null as string | null, factor: null as number | null })),
                ...d.insumosEmparejados.map((s) => ({ id: s.id, nombre: s.nombre, base: s.base, detalle: s.refCC ? `✓ ${d.opciones.find((o) => o.ref === s.refCC)?.nombre ?? s.refCC}` : "Sin pareja a propósito", refCC: s.refCC, factor: s.factor }))]
                .map((s) => (
                  <li key={s.id} className="py-1.5 text-xs">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-gray-900">{s.nombre}</span>
                      <span className="text-gray-500">{s.detalle}</span>
                      <button type="button" onClick={() => setEditando(editando === `i${s.id}` ? null : `i${s.id}`)} className="ml-auto text-primary hover:underline">
                        {editando === `i${s.id}` ? "Cerrar" : s.refCC !== null || s.factor !== null ? "Cambiar pareja" : "Elegir pareja"}
                      </button>
                    </div>
                    {editando === `i${s.id}` && (
                      <div className="mt-2">
                        <EditorPareja tipo="insumo" prodClave={String(s.id)} prodNombre={s.nombre}
                          opciones={d.opciones.filter((o) => o.tipo !== "producto")} refActual={s.refCC} factorActual={s.factor} guardada={s.factor !== null}
                          ayudaFactor={(u) => `1 ${s.base === "unidad" ? "unidad" : s.base === "volumen" ? "ml" : "g"} de Producción = ¿cuántos ${u} en Cash Control?`}
                          factorPorDefecto={factorInsumoPorDefecto}
                          onListo={() => { setEditando(null); void cargar(true); }} />
                      </div>
                    )}
                  </li>
                ))}
            </ul>
          </details>
        </>}
      </div>
    </details>
  );
}

/** Elegir la pareja en Cash Control y su equivalencia. «Sin pareja» la marca a propósito; «Quitar» vuelve a la sugerencia. */
function EditorPareja({ tipo, prodClave, prodNombre, opciones, refActual, factorActual, guardada, ayudaFactor, factorPorDefecto, onListo }: {
  tipo: "insumo" | "receta"; prodClave: string; prodNombre: string; opciones: OpcionCC[];
  refActual: string | null; factorActual: number | null; guardada: boolean;
  ayudaFactor: (unidadCC: string) => string | null;
  factorPorDefecto?: (unidadCC: string) => number;
  onListo: () => void;
}) {
  const [ref, setRef] = useState(refActual ?? "");
  const unidad = opciones.find((o) => o.ref === ref)?.unidad ?? "";
  const porDefecto = (u: string) => (factorPorDefecto ? factorPorDefecto(u) : 1);
  const [factor, setFactor] = useState(String(factorActual ?? (refActual ? porDefecto(opciones.find((o) => o.ref === refActual)?.unidad ?? "") : 1)));
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ayuda = ref && ref !== "-" ? ayudaFactor(unidad) : null;

  async function guardar(borrar = false) {
    const n = Number(factor.replace(",", "."));
    setOcupado(true);
    setError(null);
    const r = await guardarParejaProduccion({ tipo, prodClave, prodNombre, refCC: ref && ref !== "-" ? ref : null, factor: ayuda ? n : 1, borrar });
    setOcupado(false);
    if (r.ok) onListo(); else setError(r.error);
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-white p-2">
      <label className="flex min-w-[220px] flex-1 flex-col gap-0.5 text-[11px] text-gray-500">
        Con qué va en Cash Control
        <select value={ref} onChange={(e) => { setRef(e.target.value); const u = opciones.find((o) => o.ref === e.target.value)?.unidad; if (u) setFactor(String(porDefecto(u))); }}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-900">
          <option value="">Elige…</option>
          <option value="-">Sin pareja (no comparar)</option>
          {opciones.map((o) => <option key={o.ref} value={o.ref}>{o.nombre} · {o.unidad}</option>)}
        </select>
      </label>
      {ayuda && (
        <label className="flex w-[260px] flex-col gap-0.5 text-[11px] text-gray-500">
          {ayuda}
          <input value={factor} onChange={(e) => setFactor(e.target.value)} inputMode="decimal" className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-gray-900" />
        </label>
      )}
      <button type="button" disabled={ocupado || !ref} onClick={() => void guardar()}
        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-light disabled:opacity-50">
        {ocupado ? "Guardando…" : "Guardar"}
      </button>
      {guardada && <button type="button" disabled={ocupado} onClick={() => void guardar(true)} className="text-xs text-gray-500 hover:underline">Quitar pareja</button>}
      {error && <p className="w-full text-xs text-red-700">{error}</p>}
    </div>
  );
}
