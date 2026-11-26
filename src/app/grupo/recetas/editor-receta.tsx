"use client";

/**
 * Editor de una receta del sistema: crear una nueva (la masa del Pie de
 * Manzana) o modificar una del Excel sin volver a subirlo. El costo se ve
 * mientras se escribe, con los precios vigentes de la lista.
 */

import { useMemo, useState } from "react";
import { X, Plus, Trash2, Loader2, Save, RotateCcw } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { TablaOrdenable, TbodyOrdenable } from "@/components/filas-ordenables";
import { BuscadorCosto, TIPO_COSTO, soles4 } from "@/components/buscador-costo";
import { guardarReceta, eliminarReceta } from "@/app/actions/recetas";
import { crearInsumoNuevo } from "@/app/actions/nueva-receta";
import { costoDeReceta, costoIngrediente, refDeReceta, type RecetaSistema } from "@/lib/recetas";
import type { CostoPreparacion, DetalleReceta } from "@/lib/costos-preparaciones";
import { Segmentado } from "@/components/productos/ui";
import { CamposPrecio, EditarInsumo } from "./insumo-en-receta";
import { RutaPreciosAtelier, type PrecioRuta, rutaB2B } from "@/components/productos/ruta-precios";
import { sugeridosAtelier } from "@/lib/precios-sugeridos";
import type { PreciosVenta } from "@/app/actions/recetas";
import { guardarPrecioVenta } from "@/app/actions/carta";
import { comprasPara, precioPorBase, type PrecioCompra } from "@/lib/precio-compra";

/** Lo que abre el editor. */
export type Borrador = {
  id: number | null;
  nombre: string;
  tipo: RecetaSistema["tipo"];
  categoria: string | null;
  detalle: DetalleReceta;
  /** Ítem del Excel que esta receta reemplaza (y su costo, para comparar). */
  reemplaza: CostoPreparacion | null;
};

type Fila = { id: string; texto: string; item: CostoPreparacion | null; ref: string | null; cantidad: string; unidad: string };

const UNIDADES: Record<CostoPreparacion["unidad"], string[]> = { kg: ["g", "kg"], l: ["ml", "l"], und: ["und"] };

export function EditorReceta({ borrador, catalogo, archivados = [], precios: preciosIniciales, onCerrar, onGuardada, onPrecioGuardado }: {
  /** Avisa a la lista que un precio de venta cambió (para no recargar todo). */
  onPrecioGuardado?: () => void;
  /** Precios de venta guardados de este producto (los que falten salen sugeridos). */
  precios?: PreciosVenta;
  /** SKUs de insumos archivados: no se ofrecen para agregar (24-nov-2026). */
  archivados?: string[];
  borrador: Borrador;
  /** Lista vigente (Excel + recetas del sistema). */
  catalogo: CostoPreparacion[];
  onCerrar: () => void;
  onGuardada: () => void;
}) {
  const { showToast } = useToast();
  const [nombre, setNombre] = useState(borrador.nombre);
  const [tipo, setTipo] = useState(borrador.tipo);
  const [rendimiento, setRendimiento] = useState(borrador.detalle.rendimiento ? String(borrador.detalle.rendimiento) : "");
  const [merma, setMerma] = useState(borrador.detalle.merma ? String(Math.round(borrador.detalle.merma * 1000) / 10) : "");
  const [busy, setBusy] = useState<"guardando" | "borrando" | null>(null);
  // Precios de venta: se cambian aquí mismo en la ruta (fase 2, 25-nov-2026).
  const [precios, setPrecios] = useState<PreciosVenta | undefined>(preciosIniciales);
  // El B2B va en la receta del Excel si esta la reemplaza; si no, en la receta del sistema.
  const b2bRef = borrador.reemplaza?.ref ?? (borrador.id !== null ? refDeReceta(borrador.id) : null);
  // Insumos creados aquí mismo (faltaba uno al editar, 25-nov-2026): se suman a la lista sin recargar.
  const [creados, setCreados] = useState<CostoPreparacion[]>([]);
  const [nuevo, setNuevo] = useState<{ fila: number; nombre: string; precio: PrecioCompra } | null>(null);
  // Nombre y precio editados aquí mismo (25-nov-2026): se aplican sobre la lista sin recargar.
  const [editados, setEditados] = useState<Map<string, { nombre: string; costo: number }>>(new Map());
  const [creando, setCreando] = useState(false);
  const [errorNuevo, setErrorNuevo] = useState<string | null>(null);

  // Una receta del sistema que reemplaza a una del Excel se usa por la ref
  // del Excel: si un día se borra, quien la usaba vuelve a la del Excel.
  // La receta no puede usarse a sí misma (ni a la del Excel que reemplaza).
  const lista = useMemo(() => [...catalogo, ...creados].map((i) => {
    const e = i.tipo === "insumo" ? editados.get(i.ref) : undefined;
    return e ? { ...i, ...e } : i;
  }), [catalogo, creados, editados]);
  const elegibles = useMemo(() => {
    const propias = new Set([borrador.id !== null ? refDeReceta(borrador.id) : null, borrador.reemplaza?.ref ?? null].filter(Boolean));
    const arch = new Set(archivados.map((s) => s.toUpperCase()));
    return lista.filter((i) => !propias.has(i.ref) && !(i.reemplaza && propias.has(i.reemplaza))
      && !(i.tipo === "insumo" && arch.has(i.ref.trim().toUpperCase())));
  }, [lista, archivados, borrador.id, borrador.reemplaza?.ref]);
  const porRef = useMemo(() => {
    const m = new Map<string, CostoPreparacion>();
    for (const i of lista) { m.set(i.ref, i); if (i.reemplaza) m.set(i.reemplaza, i); }
    return m;
  }, [lista]);

  const [filas, setFilas] = useState<Fila[]>(() => {
    const f = borrador.detalle.ingredientes.map((g) => {
      const item = g.ref ? porRef.get(g.ref) ?? null : null;
      return { id: crypto.randomUUID(), texto: item?.nombre ?? g.nombre, item, ref: item ? g.ref : null, cantidad: String(g.cantidad), unidad: g.unidad };
    });
    return f.length > 0 ? f : [{ id: crypto.randomUUID(), texto: "", item: null, ref: null, cantidad: "", unidad: "g" }];
  });

  const setFila = (i: number, p: Partial<Fila>) => setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, ...p } : f)));

  /** Crea el insumo (Atelier) y lo pone en la fila que lo pedía. */
  async function crearNuevo() {
    if (!nuevo) return;
    const base = precioPorBase(nuevo.precio);
    if (!base) { setErrorNuevo(nuevo.precio.compra === "g" ? "Escribe cuántos g trae y su precio." : "Escribe un precio mayor que cero."); return; }
    setCreando(true);
    setErrorNuevo(null);
    const r = await crearInsumoNuevo({ origen: "Atelier", nombre: nuevo.nombre, unidad: base.unidad, precio: base.precio });
    setCreando(false);
    if (!r.ok) { setErrorNuevo(r.error); return; }
    const item: CostoPreparacion = { ref: r.insumo.sku, tipo: "insumo", nombre: r.insumo.nombre, categoria: "Insumos nuevos", unidad: r.insumo.unidad as CostoPreparacion["unidad"], costo: r.insumo.precio };
    setCreados((prev) => [...prev, item]);
    setFilas((prev) => prev.map((f, j) => (j !== nuevo.fila ? f : {
      ...f, texto: item.nombre, item, ref: item.ref, unidad: UNIDADES[item.unidad].includes(f.unidad) ? f.unidad : UNIDADES[item.unidad][0],
    })));
    setNuevo(null);
    showToast(`${item.nombre}: creado y agregado a la receta.`);
  }

  /** Guardó nombre/precio de un insumo: se ve ya en todas las filas que lo usan. */
  function alEditar(ref: string, cambio: { nombre: string; costo: number }) {
    setEditados((prev) => new Map(prev).set(ref, cambio));
    setFilas((prev) => prev.map((f) => (f.item?.tipo === "insumo" && f.item.ref === ref ? { ...f, texto: cambio.nombre, item: { ...f.item, ...cambio } } : f)));
    showToast(`${cambio.nombre}: guardado. Ya vale en todo el sistema.`);
  }

  const detalle: DetalleReceta = {
    rendimiento: Number(rendimiento) > 0 ? Number(rendimiento) : null,
    merma: Math.min(Math.max(Number(merma) || 0, 0), 95) / 100,
    ingredientes: filas
      .filter((f) => f.texto.trim() || f.cantidad)
      .map((f) => ({ ref: f.ref, nombre: f.item?.nombre ?? f.texto.trim(), unidad: f.unidad, cantidad: Number(f.cantidad) })),
  };
  const c = costoDeReceta(tipo, detalle, (ref) => porRef.get(ref) ?? null);
  const unidadCosto = tipo === "preparacion" ? "kg" : "und";
  const excel = borrador.reemplaza;
  const dif = excel && c.costo !== null && excel.costo > 0 ? (c.costo - excel.costo) / excel.costo : null;
  // Ruta de precios: el guardado si lo hay; si no, el sugerido con el costo de ahora.
  const sug = tipo === "producto" && c.costo !== null && c.faltantes.length === 0 ? sugeridosAtelier(c.costo, precios?.interno ?? null) : null;
  const ruta = (guardado: number | undefined, sugerido: number): PrecioRuta =>
    guardado && guardado > 0 ? { valor: guardado, sugerido: false } : sugerido > 0 ? { valor: sugerido, sugerido: true } : null;

  async function guardar() {
    setBusy("guardando");
    const r = await guardarReceta({
      id: borrador.id, nombre, tipo, categoria: borrador.categoria, detalle, reemplaza: excel?.ref ?? null,
    });
    setBusy(null);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast(`"${nombre.trim()}" guardada: ya se usa en las mermas.`, "success");
    onGuardada();
  }

  async function borrar() {
    if (borrador.id === null) return;
    const msg = excel
      ? `¿Volver a la receta del Excel? Se borra tu versión de "${nombre}".`
      : `¿Borrar la receta "${nombre}"? Las mermas ya registradas no cambian.`;
    if (!window.confirm(msg)) return;
    setBusy("borrando");
    const r = await eliminarReceta(borrador.id);
    setBusy(null);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast(excel ? "Se volvió a la receta del Excel." : "Receta borrada.", "success");
    onGuardada();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {borrador.id !== null ? "Editar receta" : excel ? "Modificar receta del Excel" : "Nueva receta"}
            </h2>
            {excel && (
              <p className="text-xs text-gray-500 mt-0.5">
                Tu versión reemplaza a la del Excel ({soles4(excel.costo)} por {excel.unidad}) también cuando vuelvas a subir el Excel.
              </p>
            )}
          </div>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-gray-500">Nombre</span>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="ej. Masa de Pie de Manzana"
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
            <div>
              <span className="text-[11px] uppercase tracking-wide text-gray-500">Se costea</span>
              <div className="mt-1">
                <Segmentado
                  tamano="sm"
                  valor={tipo}
                  onChange={(v) => { setTipo(v); setRendimiento(""); }}
                  opciones={[
                    { valor: "preparacion", etiqueta: "Por kilo (preparación)" },
                    { valor: "producto", etiqueta: "Por unidad (producto)" },
                  ]}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-gray-500">
                {tipo === "producto" ? "Unidades que rinde la receta" : "Kg que salen (opcional)"}
              </span>
              <input type="number" min="0" step="any" value={rendimiento} onChange={(e) => setRendimiento(e.target.value)}
                placeholder={tipo === "producto" ? "ej. 20" : `${(c.kilos * (1 - detalle.merma)).toFixed(3)} (la mezcla)`}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              {tipo === "preparacion" && (
                <span className="block text-[11px] text-gray-400 mt-1">
                  Vacío = el peso de la mezcla menos la merma. Llénalo cuando cambia al cocinar (carnes, reducciones).
                </span>
              )}
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-gray-500">Merma de preparación (%)</span>
              <input type="number" min="0" max="95" step="any" value={merma} onChange={(e) => setMerma(e.target.value)} placeholder="0"
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </label>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">Ingredientes (cantidades para toda la receta)</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase text-gray-500 bg-gray-50">
                    <th className="w-6" />
                    <th className="text-left px-2 py-2 font-medium min-w-[240px]">Insumo, preparación o producto</th>
                    <th className="text-right px-2 py-2 font-medium w-24">Cantidad</th>
                    <th className="text-left px-2 py-2 font-medium w-20">Unidad</th>
                    <th className="text-right px-2 py-2 font-medium w-24">Costo</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <TablaOrdenable items={filas} idDe={(f) => f.id} onMover={setFilas}>
                  {filas.map((f, i) => {
                    const costoFila = f.item && Number(f.cantidad) > 0 ? costoIngrediente(f.item, Number(f.cantidad), f.unidad) : null;
                    const opciones = f.item ? UNIDADES[f.item.unidad] : ["g", "kg", "ml", "l", "und"];
                    return (
                      <TbodyOrdenable key={f.id} id={f.id}>{(asa) => (
                      <tr className="border-t border-gray-100 align-top">
                        <td className="pl-0.5 pt-1.5 align-top">{asa}</td>
                        <td className="px-1 py-1">
                          <BuscadorCosto
                            value={f.texto}
                            elegido={!!f.item}
                            catalogo={elegibles}
                            placeholder="ej. Harina pastelera"
                            onTexto={(t) => setFila(i, { texto: t, item: null, ref: null })}
                            onElegir={(item) => setFila(i, {
                              texto: item.nombre, item, ref: item.reemplaza ?? item.ref,
                              unidad: UNIDADES[item.unidad].includes(f.unidad) ? f.unidad : UNIDADES[item.unidad][0],
                            })}
                          />
                          {f.item ? (
                            <div className="text-[10px] text-primary mt-0.5 px-0.5">
                              {TIPO_COSTO[f.item.tipo]} · {soles4(f.item.costo)} por {f.item.unidad}
                              {f.item.tipo === "insumo" && (
                                <>{" · "}<EditarInsumo key={`${f.item.ref}-${f.item.nombre}-${f.item.costo}`} item={f.item} origen="Atelier" onGuardado={(c) => alEditar(f.item!.ref, c)} /></>
                              )}
                            </div>
                          ) : f.texto.trim() ? (
                            <button type="button" onClick={() => { setErrorNuevo(null); setNuevo({ fila: i, nombre: f.texto.trim(), precio: { compra: "kg", gramos: "", precio: "" } }); }}
                              className="text-[11px] text-amber-800 mt-0.5 px-0.5 underline decoration-dotted">
                              ¿No está en la lista? Créalo como insumo nuevo
                            </button>
                          ) : null}
                        </td>
                        <td className="px-1 py-1">
                          <input type="number" min="0" step="any" value={f.cantidad} onChange={(e) => setFila(i, { cantidad: e.target.value })}
                            className="w-full border border-gray-200 rounded px-2 py-1 text-right" />
                        </td>
                        <td className="px-1 py-1">
                          <select value={f.unidad} onChange={(e) => setFila(i, { unidad: e.target.value })}
                            className="w-full border border-gray-200 rounded px-1.5 py-1 bg-white">
                            {[...new Set([...opciones, f.unidad])].map((u) => <option key={u}>{u}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-gray-800">
                          {costoFila !== null ? soles4(costoFila) : "—"}
                        </td>
                        <td className="px-1 py-1 text-center">
                          <button onClick={() => setFilas((p) => p.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-500 p-0.5" aria-label="Quitar ingrediente">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                      )}</TbodyOrdenable>
                    );
                  })}
                </TablaOrdenable>
              </table>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => setFilas((p) => [...p, { id: crypto.randomUUID(), texto: "", item: null, ref: null, cantidad: "", unidad: "g" }])}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 bg-white hover:bg-gray-50 rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar ingrediente
              </button>
              <button
                onClick={() => {
                  const vacia = filas.findIndex((f) => !f.item);
                  if (vacia === -1) setFilas((p) => [...p, { id: crypto.randomUUID(), texto: "", item: null, ref: null, cantidad: "", unidad: "g" }]);
                  setErrorNuevo(null);
                  setNuevo({ fila: vacia === -1 ? filas.length : vacia, nombre: vacia === -1 ? "" : filas[vacia].texto.trim(), precio: { compra: "kg", gramos: "", precio: "" } });
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary border border-primary/40 bg-white hover:bg-emerald-50 rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" /> Insumo nuevo
              </button>
            </div>

            {nuevo && (
              <div className="mt-3 rounded-xl border border-primary/30 bg-emerald-50/40 p-3 space-y-2">
                <div className="text-sm font-semibold text-gray-900">Insumo o packaging nuevo de Atelier</div>
                <p className="text-[11px] text-gray-500">Queda en Grupo → Insumos y packaging y sirve para todas las recetas. El precio es por la unidad de compra.</p>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
                  <label className="text-[11px] text-gray-500">Nombre
                    <input autoFocus value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="ej. Caja para casita"
                      className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
                  </label>
                  <CamposPrecio valor={nuevo.precio} onCambio={(v) => setNuevo({ ...nuevo, precio: v })} opciones={comprasPara(null)} onEnter={() => void crearNuevo()} />
                </div>
                {errorNuevo && <p className="text-xs text-red-700">{errorNuevo}</p>}
                <div className="flex gap-2">
                  <button onClick={() => void crearNuevo()} disabled={creando}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-lg disabled:opacity-50">
                    {creando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Crear y usar
                  </button>
                  <button onClick={() => setNuevo(null)} className="px-3 py-1.5 text-xs text-gray-600">Cancelar</button>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl bg-primary-50/60 border border-primary-100 px-4 py-3 grid gap-3 sm:grid-cols-3 text-sm">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-gray-500">Ingredientes</div>
              <div className="font-semibold tabular-nums text-gray-900">{soles4(c.total)}</div>
              <div className="text-[11px] text-gray-500">{(c.kilos * 1000).toLocaleString("es-PE", { maximumFractionDigits: 0 })} g de mezcla</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-gray-500">Costo por {unidadCosto}</div>
              <div className="text-lg font-semibold tabular-nums text-primary">{c.costo !== null ? soles4(c.costo) : "—"}</div>
              {tipo === "preparacion" && c.costo !== null && (
                <div className="text-[11px] text-gray-500">500 g = {soles4(c.costo / 2)}</div>
              )}
            </div>
            {excel && (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-gray-500">En el Excel</div>
                <div className="font-semibold tabular-nums text-gray-700">{soles4(excel.costo)} / {excel.unidad}</div>
                {dif !== null && Math.abs(dif) >= 0.005 && (
                  <div className={`text-[11px] ${Math.abs(dif) > 0.1 ? "text-amber-700" : "text-gray-500"}`}>
                    {dif > 0 ? "+" : ""}{(dif * 100).toFixed(1)}% con tu versión
                  </div>
                )}
              </div>
            )}
          </div>
          {sug && c.costo !== null && (
            <RutaPreciosAtelier costo={c.costo} interno={ruta(precios?.interno, sug.interno)} carta={ruta(precios?.carta, sug.carta)} b2b={rutaB2B(precios?.b2bByte, precios?.b2b, sug.b2b)}
              editables={{ interno: !!precios?.cartaRef, carta: !!precios?.cartaRef, b2b: !!b2bRef }}
              onGuardar={async (campo, precio) => {
                const r = await guardarPrecioVenta({ campo, precio, cartaRef: precios?.cartaRef ?? null, b2bRef });
                if (!r.ok) return r.error;
                setPrecios((p) => ({ ...p, [campo]: precio }));
                onPrecioGuardado?.();
                return null;
              }} />
          )}
          {c.faltantes.length > 0 && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Sin precio: {c.faltantes.join(", ")}. Elige cada uno de la lista (o quítalo) para poder guardar.
            </p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
          <div>
            {borrador.id !== null && (
              <button onClick={() => void borrar()} disabled={!!busy}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 rounded-lg disabled:opacity-50">
                {busy === "borrando" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : excel ? <RotateCcw className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                {excel ? "Volver a la del Excel" : "Borrar receta"}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onCerrar} disabled={!!busy} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-50">Cancelar</button>
            <button onClick={() => void guardar()} disabled={!!busy || c.costo === null || c.faltantes.length > 0 || !nombre.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-light rounded-lg disabled:opacity-50">
              {busy === "guardando" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar receta
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
