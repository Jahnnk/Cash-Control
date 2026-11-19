"use client";

/**
 * Nuevo producto de la carta (fase 2b de «la carta vive en el sistema», 18-nov-2026). Tres clases:
 * se prepara en tienda (receta con insumos de la cafetería y lo que se le compra a Atelier), lo hace Atelier
 * (enlazado a su receta, con precio interno) o reventa (precio de compra). El costo se ve mientras se arma.
 * También corrige o quita un producto creado aquí.
 */

import { useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { guardarProductoNuevo, quitarProductoNuevo, type OpcionesAlta, type ProductoCarta } from "@/app/actions/carta";
import { Segmentado } from "@/components/productos/ui";
import { costoTienda, erroresDeAlta, type LineaTienda, type RecetaCarta } from "@/lib/productos/receta-carta";

type Tipo = RecetaCarta["tipo"];

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(",", ".")));
const UNIDAD_RECETA: Record<string, string> = { kg: "g", l: "ml", und: "und" };
const ALTO = 35;

type Linea = LineaTienda & { cantidadTxt: string };

export function AltaProducto({ opciones, secciones, producto, onListo, onCancelar }: {
  opciones: OpcionesAlta;
  secciones: string[];
  /** Producto creado en el sistema que se corrige; null = uno nuevo. */
  producto: ProductoCarta | null;
  onListo: (mensaje: string) => void;
  onCancelar: () => void;
}) {
  const r0 = producto?.receta ?? null;
  const [tipo, setTipo] = useState<Tipo>(r0?.tipo ?? "tienda");
  const [nombre, setNombre] = useState(producto?.nombre ?? "");
  const [seccion, setSeccion] = useState(producto?.seccion ?? "");
  const [precio, setPrecio] = useState(producto?.precio != null ? String(producto.precio) : "");
  const [costo, setCosto] = useState(producto && r0?.tipo !== "tienda" ? String(producto.costo) : "");
  const [porciones, setPorciones] = useState(r0?.tipo === "tienda" ? String(r0.porciones) : "1");
  const [merma, setMerma] = useState(r0?.tipo === "tienda" ? String(Math.round(r0.merma * 100)) : "0");
  const [lineas, setLineas] = useState<Linea[]>(r0?.tipo === "tienda" ? r0.lineas.map((l) => ({ ...l, cantidadTxt: String(l.cantidad) })) : []);
  const [recetaRef, setRecetaRef] = useState<string | null>(r0?.tipo === "atelier" ? r0.recetaRef : null);
  const [buscar, setBuscar] = useState("");
  const [buscarReceta, setBuscarReceta] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const insumos = useMemo(() => new Map(opciones.insumos.map((i) => [i.sku, i])), [opciones]);
  const internos = useMemo(() => new Map(opciones.deAtelier.map((a) => [a.ref, a.costo])), [opciones]);

  const receta: RecetaCarta = tipo === "tienda"
    ? { tipo, porciones: num(porciones), merma: (num(merma) || 0) / 100, lineas: lineas.map(({ cantidadTxt, ...l }) => ({ ...l, cantidad: num(cantidadTxt) })) }
    : tipo === "atelier" ? { tipo, recetaRef } : { tipo };
  const calc = receta.tipo === "tienda" ? costoTienda(receta, (s) => insumos.get(s) ?? null, (r) => internos.get(r) ?? null) : null;
  const costoUnidad = receta.tipo === "tienda" ? calc?.costo ?? null : num(costo) > 0 ? num(costo) : null;
  const pv = num(precio) > 0 ? num(precio) : null;
  const pct = costoUnidad != null && pv ? (costoUnidad / pv) * 100 : null;
  const recetaElegida = opciones.recetasAtelier.find((r) => r.ref === recetaRef) ?? null;

  const resultados = useMemo(() => {
    const t = sinTildes(buscar.trim());
    if (t.length < 2) return [];
    const a = opciones.insumos.filter((i) => sinTildes(`${i.nombre} ${i.sku}`).includes(t)).slice(0, 6)
      .map((i) => ({ tipo: "insumo" as const, ref: i.sku, nombre: i.nombre, detalle: `${soles(i.precio)} por ${i.unidad}`, unidad: UNIDAD_RECETA[i.unidad] ?? "g" }));
    const b = opciones.deAtelier.filter((x) => sinTildes(`${x.nombre} ${x.ref}`).includes(t)).slice(0, 4)
      .map((x) => ({ tipo: "atelier" as const, ref: x.ref, nombre: x.nombre, detalle: `de Atelier · ${soles(x.costo)} c/u`, unidad: "und" }));
    return [...a, ...b];
  }, [buscar, opciones]);

  const recetasFiltradas = useMemo(() => {
    const t = sinTildes(buscarReceta.trim());
    return (t ? opciones.recetasAtelier.filter((r) => sinTildes(r.nombre).includes(t)) : opciones.recetasAtelier).slice(0, 8);
  }, [buscarReceta, opciones]);

  const agregar = (x: (typeof resultados)[number]) => {
    setLineas([...lineas, { tipo: x.tipo, ref: x.ref, nombre: x.nombre, cantidad: NaN, unidad: x.unidad, cantidadTxt: "" }]);
    setBuscar("");
  };

  const guardar = async () => {
    const errores = erroresDeAlta({ nombre, precio: pv, costo: receta.tipo === "tienda" ? null : costoUnidad, receta });
    if (errores.length > 0) { setError(errores[0]); return; }
    if (calc && calc.costo === null) { setError(`Falta el precio de: ${calc.faltantes.join(", ")}.`); return; }
    setOcupado(true);
    const r = await guardarProductoNuevo({ ref: producto?.ref ?? null, nombre, seccion: seccion || null, precio: pv, costo: receta.tipo === "tienda" ? null : costoUnidad, receta });
    setOcupado(false);
    if (!r.ok) { setError(r.error); return; }
    onListo(`${nombre.trim()}: ${producto ? "corregido" : "creado"}. Ya aparece en la carta, en Productos y en Precios.`);
  };

  const quitar = async () => {
    if (!producto || !window.confirm(`¿Quitar «${producto.nombre}»? Solo se borra lo creado aquí; las ventas de Byte no se tocan.`)) return;
    setOcupado(true);
    const r = await quitarProductoNuevo(producto.ref);
    setOcupado(false);
    if (!r.ok) { setError(r.error); return; }
    onListo(`${producto.nombre}: quitado.`);
  };

  const campo = "mt-0.5 block w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900";

  return (
    <div className="rounded-xl border border-primary/30 bg-emerald-50/40 p-3 sm:p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">{producto ? `Corregir «${producto.nombre}»` : "Nuevo producto"}</h3>
        <Segmentado tamano="sm" valor={tipo} onChange={(v) => { setTipo(v); setError(null); }}
          opciones={[
            { valor: "tienda", etiqueta: "Se prepara en tienda" },
            { valor: "atelier", etiqueta: "Lo hace Atelier" },
            { valor: "reventa", etiqueta: "Reventa" },
          ]} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-[11px] text-gray-500 sm:col-span-1">Nombre en la carta
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Sánguche de lomo" className={campo} />
        </label>
        <label className="text-[11px] text-gray-500">Sección
          <input list="secciones-alta" value={seccion} onChange={(e) => setSeccion(e.target.value)} placeholder="Ej. Sánguches" className={campo} />
        </label>
        <label className="text-[11px] text-gray-500">Precio de carta (S/)
          <input inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="Ej. 16.90" className={campo} />
        </label>
      </div>
      <datalist id="secciones-alta">{secciones.map((s) => <option key={s} value={s} />)}</datalist>

      {tipo === "tienda" && (
        <div className="space-y-2">
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            <label className="text-[11px] text-gray-500">Porciones que salen
              <input inputMode="decimal" value={porciones} onChange={(e) => setPorciones(e.target.value)} className={campo} />
            </label>
            <label className="text-[11px] text-gray-500">Merma (%)
              <input inputMode="decimal" value={merma} onChange={(e) => setMerma(e.target.value)} className={campo} />
            </label>
          </div>
          {lineas.length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400">
                  <th className="py-1 pr-2 font-medium">Ingrediente</th><th className="py-1 pr-2 font-medium">Cantidad</th>
                  <th className="py-1 pr-2 text-right font-medium">Costo</th><th />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lineas.map((l, i) => {
                  const c = calc?.lineas[i]?.costo ?? null;
                  return (
                    <tr key={`${l.tipo}-${l.ref}-${i}`}>
                      <td className="py-1.5 pr-2">
                        <div className="text-gray-900">{l.nombre}</div>
                        <div className="text-[11px] text-gray-400">{l.tipo === "atelier" ? "de Atelier, a precio interno" : l.ref}</div>
                      </td>
                      <td className="py-1.5 pr-2 whitespace-nowrap">
                        <input inputMode="decimal" value={l.cantidadTxt} aria-label={`Cantidad de ${l.nombre}`}
                          onChange={(e) => setLineas(lineas.map((x, j) => (j === i ? { ...x, cantidadTxt: e.target.value } : x)))}
                          className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-right text-sm" />
                        {l.tipo === "atelier" ? <span className="ml-1 text-gray-500">und</span> : (
                          <select value={l.unidad} aria-label={`Unidad de ${l.nombre}`}
                            onChange={(e) => setLineas(lineas.map((x, j) => (j === i ? { ...x, unidad: e.target.value } : x)))}
                            className="ml-1 border border-gray-300 rounded-lg px-1 py-1 text-sm">
                            {["g", "kg", "ml", "l", "und"].map((u) => <option key={u} value={u}>{u}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 text-right whitespace-nowrap text-gray-700">{c != null ? soles(c) : <span className="text-amber-700">sin precio</span>}</td>
                      <td className="py-1.5 text-right">
                        <button type="button" onClick={() => setLineas(lineas.filter((_, j) => j !== i))} aria-label={`Quitar ${l.nombre}`} className="text-gray-400 hover:text-red-600">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Agregar ingrediente: insumo de la cafetería o pan de Atelier"
              className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm bg-white" />
            {resultados.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg max-h-64 overflow-auto">
                {resultados.map((x) => (
                  <li key={`${x.tipo}-${x.ref}`}>
                    <button type="button" onClick={() => agregar(x)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2">
                      <Plus className="w-3.5 h-3.5 text-primary" />
                      <span className="text-gray-900">{x.nombre}</span>
                      <span className="ml-auto text-[11px] text-gray-500">{x.detalle}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tipo === "atelier" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="text-[11px] text-gray-500">Receta de Atelier (para el costo en insumos)
            <input value={buscarReceta} onChange={(e) => setBuscarReceta(e.target.value)} placeholder="Buscar receta, ej. brownie" className={campo} />
            <div className="mt-1 max-h-40 overflow-auto rounded-lg border border-gray-200 bg-white">
              {recetasFiltradas.map((r) => (
                <button key={r.ref} type="button" onClick={() => setRecetaRef(r.ref)}
                  className={`w-full text-left px-2 py-1.5 text-xs flex gap-2 ${recetaRef === r.ref ? "bg-emerald-50 font-medium" : "hover:bg-gray-50"}`}>
                  <span className="text-gray-900">{r.nombre}</span><span className="ml-auto text-gray-500">{soles(r.costo)}</span>
                </button>
              ))}
            </div>
            <span className="mt-1 block">{recetaElegida ? `Elegida: ${recetaElegida.nombre} (insumos ${soles(recetaElegida.costo)})` : "Si la receta todavía no existe, créala abajo en «Recetas de Atelier»."}</span>
          </div>
          <label className="text-[11px] text-gray-500">Precio interno: lo que paga la cafetería a Atelier (S/)
            <input inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="Ej. 4.50" className={campo} />
          </label>
        </div>
      )}

      {tipo === "reventa" && (
        <label className="block max-w-xs text-[11px] text-gray-500">Precio de compra por unidad (S/)
          <input inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="Ej. 1.80" className={campo} />
        </label>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="text-gray-600">Costo para la cafetería: <b className="text-gray-900">{costoUnidad != null ? soles(costoUnidad) : "—"}</b></span>
        <span className={pct != null && pct > ALTO ? "text-red-700" : "text-gray-600"}>% costo: <b>{pct != null ? `${pct.toFixed(0)}%` : "—"}</b></span>
        {pct != null && pv != null && costoUnidad != null && <span className="text-gray-600">Deja {soles(pv - costoUnidad)} por unidad</span>}
      </div>

      {error && <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={ocupado} onClick={() => void guardar()}
          className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-light rounded-xl disabled:opacity-50">
          {ocupado ? "Guardando…" : producto ? "Guardar cambios" : "Crear producto"}
        </button>
        <button type="button" onClick={onCancelar} className="px-3 py-2 text-sm text-gray-600">Cancelar</button>
        {producto && (
          <button type="button" disabled={ocupado} onClick={() => void quitar()} className="ml-auto px-3 py-2 text-sm text-red-700">Quitar producto</button>
        )}
      </div>
    </div>
  );
}
