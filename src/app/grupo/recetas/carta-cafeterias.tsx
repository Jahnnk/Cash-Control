"use client";

/**
 * Grupo → Recetas y costos → Carta de las cafeterías (fase 2a de «la carta vive en el sistema», 18-nov-2026).
 * La carta por sección con precio, costo y % de costo. Se cambia aquí el precio de carta, el precio interno de
 * lo que hace Atelier y la sección, sin tocar el Excel. Retirar usa el mismo «archivar» de Productos.
 * Plegada por defecto.
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Plus, Search } from "lucide-react";
import { getCarta, getOpcionesAlta, guardarCambioCarta, type OpcionesAlta, type ProductoCarta } from "@/app/actions/carta";
import { AltaProducto } from "./alta-producto";
import { archivarProductos, restaurarProducto } from "@/app/actions/productos-panorama";
import { Pastilla } from "@/components/productos/ui";

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (s: string) => Number(s.replace(",", "."));
const ALTO = 35;

type Borrador = { precio: string; costo: string; seccion: string };

const retirado = (p: ProductoCarta) => p.byte.length > 0 && p.byte.every((b) => b.archivado);
const cambiado = (p: ProductoCarta) => p.marca.precio || p.marca.costo || p.marca.seccion || p.marca.nuevo;

export function CartaCafeterias() {
  const [productos, setProductos] = useState<ProductoCarta[] | null>(null);
  const [secciones, setSecciones] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [soloCambiados, setSoloCambiados] = useState(false);
  const [verRetirados, setVerRetirados] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [b, setB] = useState<Borrador>({ precio: "", costo: "", seccion: "" });
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);
  /** Formulario de producto nuevo abierto (con el producto creado aquí que se corrige, o null = uno nuevo). */
  const [alta, setAlta] = useState<{ producto: ProductoCarta | null } | null>(null);
  const [opciones, setOpciones] = useState<OpcionesAlta | null>(null);

  const abrirAlta = async (producto: ProductoCarta | null) => {
    setAviso(null);
    setEditando(null);
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

  const abrir = (p: ProductoCarta) => {
    setEditando(p.ref);
    setB({ precio: p.precio != null ? String(p.precio) : "", costo: String(p.costo), seccion: p.seccion ?? "" });
    setAviso(null);
  };

  const guardar = async (p: ProductoCarta, volverAlExcel = false) => {
    let precio: number | null = null, costo: number | null = null, seccion: string | null = null;
    if (!volverAlExcel) {
      const pr = num(b.precio);
      if (!(pr > 0)) { setAviso({ tono: "error", texto: "Escribe un precio de carta mayor que cero." }); return; }
      precio = p.excel?.precio != null && Math.abs(pr - p.excel.precio) < 0.005 ? null : pr;
      if (p.origen !== "Cafetería") {
        const c = num(b.costo);
        if (!(c > 0)) { setAviso({ tono: "error", texto: "Escribe un precio interno mayor que cero." }); return; }
        costo = p.excel && Math.abs(c - p.excel.costo) < 0.00005 ? null : c;
      }
      seccion = b.seccion.trim() && b.seccion.trim() !== (p.excel?.seccion ?? "") ? b.seccion.trim() : null;
      const cambio = p.precio ? (pr / p.precio - 1) * 100 : 0;
      if (Math.abs(cambio) >= 30 && !window.confirm(`El precio de carta cambia ${cambio > 0 ? "+" : ""}${cambio.toFixed(0)}%. ¿Está bien?`)) return;
    }
    setOcupado(true);
    const r = await guardarCambioCarta({ ref: p.ref, precio, costo, seccion });
    setOcupado(false);
    if (!r.ok) { setAviso({ tono: "error", texto: r.error }); return; }
    setEditando(null);
    setAviso({ tono: "ok", texto: volverAlExcel ? `${p.nombre}: vuelve a lo del Excel.` : `${p.nombre}: guardado. Productos y Precios ya usan el cambio.` });
    await cargar();
  };

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
          Cambia aquí el precio de carta, el precio interno de lo que hace Atelier o la sección, o crea un producto nuevo con su receta. No hace falta tocar el Excel: el cambio vale también después de subir otro. Productos, Precios y el simulador lo usan al momento.
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
                            const abierto = editando === p.ref;
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
                                  {abierto && (
                                    <label className="mt-2 block text-[11px] text-gray-500">Sección
                                      <input list="secciones-carta" value={b.seccion} onChange={(e) => setB({ ...b, seccion: e.target.value })}
                                        className="mt-0.5 block w-48 border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-900" />
                                    </label>
                                  )}
                                </td>
                                <td className="py-2 pr-3 text-right whitespace-nowrap">
                                  {abierto ? (
                                    <input autoFocus inputMode="decimal" value={b.precio} onChange={(e) => setB({ ...b, precio: e.target.value })}
                                      aria-label={`Precio de carta de ${p.nombre}`} className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-right text-sm" />
                                  ) : (
                                    <>
                                      <div className="font-medium text-gray-900">{p.precio != null ? soles(p.precio) : "—"}</div>
                                      {p.marca.precio && p.excel?.precio != null && <div className="text-[11px] text-gray-500">Excel: {soles(p.excel.precio)}</div>}
                                    </>
                                  )}
                                </td>
                                <td className="py-2 pr-3 text-right whitespace-nowrap">
                                  {abierto && p.origen !== "Cafetería" ? (
                                    <input inputMode="decimal" value={b.costo} onChange={(e) => setB({ ...b, costo: e.target.value })}
                                      aria-label={`Precio interno de ${p.nombre}`} className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-right text-sm" />
                                  ) : (
                                    <>
                                      <div className="text-gray-900">{soles(p.costo)}</div>
                                      <div className="text-[11px] text-gray-500">
                                        {p.marca.nuevo && p.costo === 0 ? <span className="text-amber-700">falta un precio</span> : p.marca.costo && p.excel ? `Excel: ${soles(p.excel.costo)}` : p.origen === "Atelier" ? "precio interno" : p.origen === "Cafetería" ? "su receta" : ""}
                                      </div>
                                    </>
                                  )}
                                </td>
                                <td className={`py-2 pr-3 text-right whitespace-nowrap font-medium ${pct != null && pct > ALTO ? "text-red-700" : "text-gray-700"}`}>
                                  {pct != null ? `${pct.toFixed(0)}%` : "—"}
                                </td>
                                <td className="py-2 text-right whitespace-nowrap">
                                  {abierto ? (
                                    <span className="inline-flex flex-wrap justify-end gap-1">
                                      <button type="button" disabled={ocupado} onClick={() => void guardar(p)}
                                        className="px-3 py-1 text-xs font-medium text-white bg-primary hover:bg-primary-light rounded-lg disabled:opacity-50">
                                        {ocupado ? "Guardando…" : "Guardar"}
                                      </button>
                                      {cambiado(p) && !p.marca.nuevo && (
                                        <button type="button" disabled={ocupado} onClick={() => void guardar(p, true)} className="px-2 py-1 text-xs text-gray-600 underline decoration-dotted">Volver al Excel</button>
                                      )}
                                      <button type="button" onClick={() => setEditando(null)} className="px-2 py-1 text-xs text-gray-500">Cancelar</button>
                                    </span>
                                  ) : (
                                    <span className="inline-flex flex-col items-end gap-1">
                                      <button type="button" onClick={() => (p.marca.nuevo ? void abrirAlta(p) : abrir(p))} className="text-xs font-medium text-primary">Cambiar</button>
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
            <datalist id="secciones-carta">{secciones.map((s) => <option key={s} value={s} />)}</datalist>
            <p className="text-[11px] text-gray-500">«Retirar» archiva el producto en Productos, igual que desde «Candidatos a reemplazo». Solo aparece en los productos que Byte vendió en los últimos 3 meses.</p>
          </>
        )}
      </div>
    </details>
  );
}
