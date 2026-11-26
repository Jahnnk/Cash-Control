"use client";

/**
 * Grupo → Recetas y costos → Carta de las cafeterías (fase 2a de «la carta vive en el sistema», 18-nov-2026).
 * La carta por sección con precio, costo y % de costo. Desde el 25-nov-2026 (fase 3 de «unificar pricing») los
 * precios y la sección se cambian en la ficha única («Abrir»): aquí ya no hay «Cambiar», salvo «Corregir» en
 * los productos creados en el sistema (su receta). Retirar usa el mismo «archivar» de Productos.
 * Plegada por defecto.
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Plus, Search } from "lucide-react";
import { getCarta, getOpcionesAlta, type OpcionesAlta, type ProductoCarta } from "@/app/actions/carta";
import { AltaProducto } from "./alta-producto";
import { archivarProductos, restaurarProducto } from "@/app/actions/productos-panorama";
import { Pastilla } from "@/components/productos/ui";
import { FichaProducto } from "@/components/productos/ficha-producto";
import { METAS } from "@/lib/precios-sugeridos";

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** La meta de la ruta de precios sobre lo que paga la cafetería: 55% en lo de Atelier (su precio interno), 30% en el resto. */
const metaPct = (p: ProductoCarta) => (p.origen === "Atelier" ? METAS.foodCostAtelierEnCarta : METAS.foodCostCafeteria) * 100;

const retirado = (p: ProductoCarta) => p.byte.length > 0 && p.byte.every((b) => b.archivado);
const cambiado = (p: ProductoCarta) => p.marca.precio || p.marca.costo || p.marca.seccion || p.marca.nuevo;

export function CartaCafeterias() {
  const [productos, setProductos] = useState<ProductoCarta[] | null>(null);
  const [secciones, setSecciones] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [soloCambiados, setSoloCambiados] = useState(false);
  const [verRetirados, setVerRetirados] = useState(false);
  // «Abrir» = la ficha única del producto (25-nov-2026).
  const [ficha, setFicha] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);
  /** Formulario de producto nuevo abierto (con el producto creado aquí que se corrige, o null = uno nuevo). */
  const [alta, setAlta] = useState<{ producto: ProductoCarta | null } | null>(null);
  const [opciones, setOpciones] = useState<OpcionesAlta | null>(null);

  const abrirAlta = async (producto: ProductoCarta | null) => {
    setAviso(null);
    if (!opciones) {
      const r = await getOpcionesAlta();
      if (!r.ok) { setAviso({ tono: "error", texto: r.error }); return; }
      setOpciones(r.data);
    }
    setAlta({ producto });
  };

  const cargar = async () => {
    const r = await getCarta();
    if (r.ok) { setProductos(r.productos); setSecciones(r.secciones); } else setError(r.error);
  };
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    void cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const grupos = useMemo(() => {
    const t = sinTildes(q.trim());
    const lista = (productos ?? []).filter((p) => (verRetirados || !retirado(p)) && (!soloCambiados || cambiado(p))
      && (!t || sinTildes(`${p.nombre} ${p.seccion ?? ""} ${p.ref}`).includes(t)));
    const m = new Map<string, ProductoCarta[]>();
    for (const p of lista) {
      const k = p.seccion ?? "Fuera de carta (exhibidor)";
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.entries()];
  }, [productos, q, soloCambiados, verRetirados]);

  const nCambiados = productos?.filter(cambiado).length ?? 0;
  const nRetirados = productos?.filter(retirado).length ?? 0;

  const retirar = async (p: ProductoCarta) => {
    if (!window.confirm(`¿Retirar «${p.nombre}» de la carta? Se archiva en Productos y deja de evaluarse. Puedes volver a ponerlo.`)) return;
    setOcupado(true);
    const r = await archivarProductos(p.byte.filter((x) => !x.archivado).map((x) => ({ nombre: x.nombre, motivo: "sacado-de-carta" as const })));
    setOcupado(false);
    setAviso(r.ok ? { tono: "ok", texto: `${p.nombre}: retirado de la carta.` } : { tono: "error", texto: r.error });
    await cargar();
  };

  const reactivar = async (p: ProductoCarta) => {
    setOcupado(true);
    for (const x of p.byte.filter((y) => y.archivado)) await restaurarProducto(x.clave);
    setOcupado(false);
    setAviso({ tono: "ok", texto: `${p.nombre}: vuelve a la carta.` });
    await cargar();
  };

  return (
    <details className="group rounded-2xl border border-gray-200/80 bg-white px-4 py-3 sm:px-6" aria-label="Carta de las cafeterías">
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-2 gap-y-1 [&::-webkit-details-marker]:hidden">
        <h2 className="text-[15px] font-semibold text-gray-900">Carta de las cafeterías</h2>
        <span className="text-xs text-gray-500">
          {productos ? `${productos.length - nRetirados} productos · ${nCambiados === 0 ? "todo como en el Excel" : `${nCambiados} cambiados aquí`}${nRetirados > 0 ? ` · ${nRetirados} retirados` : ""}` : "Cargando…"}
        </span>
        <ChevronDown className="ml-auto h-4 w-4 self-center text-gray-400 transition-transform group-open:rotate-180" aria-hidden />
      </summary>

      <div className="mt-3 space-y-3">
        <p className="text-xs text-gray-500 leading-relaxed max-w-2xl">
          Toca «Abrir» para ver la ficha del producto y cambiar ahí su precio de carta, su precio interno o su sección. Aquí se crea un producto nuevo con su receta. No hace falta tocar el Excel: el cambio vale también después de subir otro. Productos, Precios y el simulador lo usan al momento.
        </p>

        {error ? (
          <p className="text-sm text-gray-500">{error}</p>
        ) : !productos ? (
          <div className="flex justify-center py-6 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <label className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto o sección, ej. latte"
                  className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm" />
              </label>
              <button type="button" onClick={() => void abrirAlta(null)} disabled={!!alta}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-light rounded-xl whitespace-nowrap disabled:opacity-50">
                <Plus className="w-4 h-4" /> Nuevo producto
              </button>
              <label className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                <input type="checkbox" checked={soloCambiados} onChange={(e) => setSoloCambiados(e.target.checked)} /> Solo los cambiados aquí
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                <input type="checkbox" checked={verRetirados} onChange={(e) => setVerRetirados(e.target.checked)} /> Ver retirados
              </label>
            </div>

            {alta && opciones && (
              <AltaProducto key={alta.producto?.ref ?? "nuevo"} opciones={opciones} secciones={secciones} producto={alta.producto}
                onCancelar={() => setAlta(null)}
                onListo={(m) => { setAlta(null); setAviso({ tono: "ok", texto: m }); void cargar(); }} />
            )}

            {aviso && (
              <p className={`text-xs rounded-lg px-3 py-2 border ${aviso.tono === "ok" ? "text-emerald-800 bg-emerald-50 border-emerald-200" : "text-red-800 bg-red-50 border-red-200"}`}>{aviso.texto}</p>
            )}

            {grupos.length === 0 ? (
              <p className="text-sm text-gray-500">No hay productos con ese filtro.</p>
            ) : (
              <div className="space-y-4">
                {grupos.map(([seccion, lista]) => (
                  <div key={seccion}>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">{seccion} · {lista.length}</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400">
                            <th className="py-1 pr-3 font-medium">Producto</th>
                            <th className="py-1 pr-3 text-right font-medium">Precio de carta</th>
                            <th className="py-1 pr-3 text-right font-medium">Costo para la cafetería</th>
                            <th className="py-1 pr-3 text-right font-medium">% costo</th>
                            <th className="py-1 font-medium" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {lista.map((p) => {
                            const pct = p.precio ? (p.costo / p.precio) * 100 : null;
                            const fuera = retirado(p);
                            return (
                              <tr key={p.ref} className={`align-top ${fuera ? "opacity-60" : ""}`}>
                                <td className="py-2 pr-3">
                                  <div className="font-medium text-gray-900">{p.nombre}</div>
                                  <div className="mt-0.5 flex flex-wrap gap-1">
                                    <Pastilla>{p.origen === "Atelier" ? "Lo hace Atelier" : p.origen === "Externo" ? "Reventa" : p.origen === "Cafetería" ? "Se prepara en tienda" : p.origen ?? "Por definir"}</Pastilla>
                                    {p.marca.nuevo && <Pastilla tono="verde">Nuevo</Pastilla>}
                                    {cambiado(p) && !p.marca.nuevo && <Pastilla tono="azul">Cambiado aquí{p.actualizadoEl ? ` · ${p.actualizadoEl.slice(8, 10)}/${p.actualizadoEl.slice(5, 7)}` : ""}</Pastilla>}
                                    {fuera && <Pastilla tono="ambar">Retirado</Pastilla>}
                                  </div>
                                </td>
                                <td className="py-2 pr-3 text-right whitespace-nowrap">
                                  <div className="font-medium text-gray-900">{p.precio != null ? soles(p.precio) : "—"}</div>
                                  {p.marca.precio && p.excel?.precio != null && <div className="text-[11px] text-gray-500">Excel: {soles(p.excel.precio)}</div>}
                                </td>
                                <td className="py-2 pr-3 text-right whitespace-nowrap">
                                  <div className="text-gray-900">{soles(p.costo)}</div>
                                  <div className="text-[11px] text-gray-500">
                                    {p.marca.nuevo && p.costo === 0 ? <span className="text-amber-700">falta un precio</span> : p.marca.costo && p.excel ? `Excel: ${soles(p.excel.costo)}` : p.origen === "Atelier" ? "precio interno" : p.origen === "Cafetería" ? "su receta" : ""}
                                  </div>
                                </td>
                                <td className={`py-2 pr-3 text-right whitespace-nowrap font-medium ${pct != null && pct > metaPct(p) ? "text-red-700" : "text-gray-700"}`}
                                  title={`Meta: hasta ${metaPct(p).toFixed(0)}%`}>
                                  {pct != null ? `${pct.toFixed(0)}%` : "—"}
                                </td>
                                <td className="py-2 text-right whitespace-nowrap">
                                  {(
                                    <span className="inline-flex flex-col items-end gap-1">
                                      <button type="button" onClick={() => setFicha(p.ref)} className="text-xs font-medium text-gray-700">Abrir</button>
                                      {p.marca.nuevo && <button type="button" onClick={() => void abrirAlta(p)} className="text-xs font-medium text-primary" title="Corregir su receta o quitarlo">Corregir</button>}
                                      {p.byte.length === 0 ? null : fuera ? (
                                        <button type="button" disabled={ocupado} onClick={() => void reactivar(p)} className="text-xs text-gray-600">Volver a la carta</button>
                                      ) : (
                                        <button type="button" disabled={ocupado} onClick={() => void retirar(p)} className="text-xs text-gray-600">Retirar</button>
                                      )}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-gray-500">«Retirar» archiva el producto en Productos, igual que desde «Candidatos a reemplazo». Solo aparece en los productos que Byte vendió en los últimos 3 meses.</p>
          </>
        )}
      </div>
      {ficha && (
        <FichaProducto cartaRef={ficha} onCerrar={() => { setFicha(null); void cargar(); }}
          // Misma página: se recarga con ?editar= para que «Recetas de Atelier» abra el editor.
          onEditarReceta={(ref) => { window.location.href = `/grupo/recetas?editar=${encodeURIComponent(ref)}`; }} />
      )}
    </details>
  );
}
