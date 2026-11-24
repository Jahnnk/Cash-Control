"use client";

/**
 * Grupo → Recetas y costos → Precios de insumos (fase 1 de «la carta vive en el sistema», 18-nov-2026).
 * El precio de compra de cada insumo, editable aquí sin volver a subir el Excel. Al guardar, el costo de
 * Atelier y de la carta se recalcula solo y el cambio entra al historial de precios. Plegado por defecto.
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Plus, Search } from "lucide-react";
import { archivarInsumo, getPreciosInsumos, guardarPrecioInsumo, type InsumoConUso } from "@/app/actions/precios-insumos";
import { crearInsumoNuevo } from "@/app/actions/nueva-receta";
import { Pastilla, Segmentado } from "@/components/productos/ui";

type Origen = "Atelier" | "Cafetería";

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
const fechaCorta = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });
const MAX_FILAS = 60;

export function PreciosInsumos() {
  const [insumos, setInsumos] = useState<InsumoConUso[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [origen, setOrigen] = useState<Origen>("Atelier");
  const [q, setQ] = useState("");
  const [soloCambiados, setSoloCambiados] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [verArchivados, setVerArchivados] = useState(false);
  const [nuevo, setNuevo] = useState<{ nombre: string; unidad: "kg" | "l" | "und"; precio: string } | null>(null);
  const [errorNuevo, setErrorNuevo] = useState<string | null>(null);

  const cargar = async () => {
    const r = await getPreciosInsumos();
    if (r.ok) setInsumos(r.insumos);
    else setError(r.error);
  };
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    void cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const cambiados = insumos?.filter((i) => i.delSistema && !i.archivado) ?? [];
  const archivados = insumos?.filter((i) => i.archivado) ?? [];
  const lista = useMemo(() => {
    const t = sinTildes(q.trim());
    return (insumos ?? []).filter((i) => i.origen === origen && (!soloCambiados || i.delSistema)
      && (verArchivados ? i.archivado : !i.archivado)
      && (!t || sinTildes(`${i.nombre} ${i.sku}`).includes(t)));
  }, [insumos, origen, q, soloCambiados, verArchivados]);

  const crear = async () => {
    if (!nuevo) return;
    setGuardando(true);
    setErrorNuevo(null);
    const r = await crearInsumoNuevo({ origen, nombre: nuevo.nombre, unidad: nuevo.unidad, precio: Number(nuevo.precio.replace(",", ".")) });
    setGuardando(false);
    if (!r.ok) { setErrorNuevo(r.error); return; }
    setNuevo(null);
    setQ(r.insumo.nombre);
    setVerArchivados(false);
    setAviso(`${r.insumo.nombre}: creado (${r.insumo.sku}). Ya se puede usar en las recetas.`);
    await cargar();
  };

  const archivar = async (i: InsumoConUso, archivar: boolean) => {
    if (archivar && !window.confirm(
      `¿Archivar «${i.nombre}»? Ya no saldrá en los buscadores de recetas.${i.usos.length > 0 ? ` Los ${i.usos.length} productos que ya lo usan conservan su costo.` : ""} Puedes desarchivarlo cuando quieras.`,
    )) return;
    setGuardando(true);
    const r = await archivarInsumo({ origen: i.origen, sku: i.sku, archivar });
    setGuardando(false);
    if (!r.ok) { setAviso(r.error); return; }
    setAviso(`${i.nombre}: ${archivar ? "archivado" : "vuelve a la lista"}.`);
    await cargar();
  };

  const abrir = (i: InsumoConUso, precio = i.precio) => {
    setEditando(`${i.origen}|${i.sku}`);
    setValor(String(precio));
    setAviso(null);
  };

  const guardar = async (i: InsumoConUso) => {
    const precio = Number(valor.replace(",", "."));
    if (!Number.isFinite(precio) || precio <= 0) { setAviso("Escribe un precio mayor que cero."); return; }
    const cambio = (precio / i.precio - 1) * 100;
    if (Math.abs(cambio) >= 50 && !window.confirm(`El precio cambia ${cambio > 0 ? "+" : ""}${cambio.toFixed(0)}%. ¿Está bien?`)) return;
    setGuardando(true);
    const r = await guardarPrecioInsumo({ origen: i.origen, sku: i.sku, precio });
    setGuardando(false);
    if (!r.ok) { setAviso(r.error); return; }
    setEditando(null);
    setAviso(`${i.nombre}: guardado. Los costos ya usan el precio nuevo.`);
    await cargar();
  };

  return (
    <details className="group rounded-2xl border border-gray-200/80 bg-white px-4 py-3 sm:px-6" aria-label="Precios de insumos">
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-2 gap-y-1 [&::-webkit-details-marker]:hidden">
        <h2 className="text-[15px] font-semibold text-gray-900">Precios de insumos</h2>
        <span className="text-xs text-gray-500">
          {insumos ? `${insumos.length - archivados.length} insumos · ${cambiados.length === 0 ? "todos como en el Excel" : `${cambiados.length} cambiados aquí`}${archivados.length > 0 ? ` · ${archivados.length} archivados` : ""}` : "Cargando…"}
        </span>
        <ChevronDown className="ml-auto h-4 w-4 self-center text-gray-400 transition-transform group-open:rotate-180" aria-hidden />
      </summary>

      <div className="mt-3 space-y-3">
        <p className="text-xs text-gray-500 leading-relaxed max-w-2xl">
          Cambia aquí el precio de compra cuando sube o baja un insumo, agrega uno nuevo o archiva el que ya no se compra. No hace falta tocar el Excel. El costo de las recetas de Atelier y de la carta se recalcula solo, y el cambio queda en el historial de precios. Si el insumo está conectado en Proveedores, debajo sale el mejor precio de proveedor: «Usar» lo pone en el campo para que lo confirmes.
        </p>

        {error ? (
          <p className="text-sm text-gray-500">{error}</p>
        ) : !insumos ? (
          <div className="flex justify-center py-6 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Segmentado tamano="sm" valor={origen} onChange={(v) => { setOrigen(v); setEditando(null); }}
                opciones={[
                  { valor: "Atelier", etiqueta: "Compra Atelier" },
                  { valor: "Cafetería", etiqueta: "Compran las cafeterías" },
                ]} />
              <label className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar insumo, ej. mantequilla"
                  className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm" />
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                <input type="checkbox" checked={soloCambiados} onChange={(e) => setSoloCambiados(e.target.checked)} />
                Solo los cambiados aquí
              </label>
              {archivados.length > 0 && (
                <label className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                  <input type="checkbox" checked={verArchivados} onChange={(e) => setVerArchivados(e.target.checked)} />
                  Ver archivados
                </label>
              )}
              <button type="button" onClick={() => { setErrorNuevo(null); setNuevo({ nombre: q.trim(), unidad: "kg", precio: "" }); }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-primary border border-primary/40 bg-white hover:bg-emerald-50 rounded-xl">
                <Plus className="w-3.5 h-3.5" /> Insumo nuevo
              </button>
            </div>

            {nuevo && (
              <div className="rounded-xl border border-primary/30 bg-emerald-50/40 p-3 space-y-2">
                <div className="text-sm font-semibold text-gray-900">Insumo nuevo · {origen === "Atelier" ? "compra Atelier" : "compran las cafeterías"}</div>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <label className="text-[11px] text-gray-500">Nombre
                    <input autoFocus value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="ej. Jengibre en polvo"
                      className="mt-0.5 block w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                  </label>
                  <label className="text-[11px] text-gray-500">Se compra por
                    <select value={nuevo.unidad} onChange={(e) => setNuevo({ ...nuevo, unidad: e.target.value as "kg" | "l" | "und" })}
                      className="mt-0.5 block w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white">
                      <option value="kg">kg</option><option value="l">litro</option><option value="und">unidad</option>
                    </select>
                  </label>
                  <label className="text-[11px] text-gray-500">Precio por {nuevo.unidad === "l" ? "litro" : nuevo.unidad === "und" ? "unidad" : "kg"} (S/)
                    <input inputMode="decimal" value={nuevo.precio} onChange={(e) => setNuevo({ ...nuevo, precio: e.target.value })} placeholder="ej. 12.00"
                      onKeyDown={(e) => { if (e.key === "Enter") void crear(); }}
                      className="mt-0.5 block w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                  </label>
                </div>
                {errorNuevo && <p className="text-xs text-red-700">{errorNuevo}</p>}
                <div className="flex gap-2">
                  <button type="button" disabled={guardando} onClick={() => void crear()}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-primary hover:bg-primary-light rounded-lg disabled:opacity-50">
                    {guardando ? "Creando…" : "Crear insumo"}
                  </button>
                  <button type="button" onClick={() => setNuevo(null)} className="px-3 py-1.5 text-xs text-gray-600">Cancelar</button>
                </div>
              </div>
            )}

            {aviso && <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{aviso}</p>}

            {lista.length === 0 ? (
              <p className="text-sm text-gray-500">No hay insumos con ese filtro.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400">
                      <th className="py-1 pr-3 font-medium">Insumo</th>
                      <th className="py-1 pr-3 text-right font-medium">Precio de compra</th>
                      <th className="py-1 pr-3 font-medium">Desde</th>
                      <th className="py-1 pr-3 font-medium">En la carta</th>
                      <th className="py-1 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {lista.slice(0, MAX_FILAS).map((i) => {
                      const k = `${i.origen}|${i.sku}`;
                      const abierto = editando === k;
                      return (
                        <tr key={k} className="align-top">
                          <td className="py-2 pr-3">
                            <div className="font-medium text-gray-900">{i.nombre}</div>
                            <div className="text-[11px] text-gray-400">{i.sku} · por {i.unidad}</div>
                          </td>
                          <td className="py-2 pr-3 text-right whitespace-nowrap">
                            {abierto ? (
                              <input autoFocus inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") void guardar(i); if (e.key === "Escape") setEditando(null); }}
                                aria-label={`Precio nuevo de ${i.nombre}`}
                                className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-right text-sm" />
                            ) : (
                              <>
                                <div className="font-medium text-gray-900">{soles(i.precio)}</div>
                                {i.delSistema && i.base != null && i.cambioPct !== 0 && (
                                  <div className="text-[11px] text-gray-500">Excel: {soles(i.base)} · <span className={i.cambioPct > 0 ? "text-red-700" : "text-emerald-700"}>{i.cambioPct > 0 ? "+" : ""}{i.cambioPct}%</span></div>
                                )}
                                {/* Proveedores (20-nov-2026): el mejor precio de las sedes que compran este insumo. */}
                                {i.proveedor && (() => {
                                  const dif = i.precio > 0 ? Math.round(((i.proveedor.precioInsumo - i.precio) / i.precio) * 100) : 0;
                                  return (
                                    <div className="mt-0.5 text-[11px] text-sky-800" title={`Precio del ${fechaCorta(i.proveedor.fecha)}`}>
                                      Proveedor: {soles(i.proveedor.precioInsumo)} · {i.proveedor.proveedor}
                                      {dif !== 0 && <span className={dif < 0 ? " font-semibold text-emerald-700" : " font-semibold text-red-700"}> {dif > 0 ? "+" : ""}{dif}%</span>}
                                      {dif !== 0 && (
                                        <button type="button" onClick={() => abrir(i, i.proveedor!.precioInsumo)} className="ml-1 font-medium text-primary underline">Usar</button>
                                      )}
                                    </div>
                                  );
                                })()}
                              </>
                            )}
                          </td>
                          <td className="py-2 pr-3 whitespace-nowrap">
                            <div className="text-gray-700">{fechaCorta(i.fecha)}</div>
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              {i.base == null && i.delSistema ? <Pastilla tono="marca">Creado aquí</Pastilla> : i.delSistema ? <Pastilla tono="azul">Cambiado aquí</Pastilla> : <Pastilla>Excel</Pastilla>}
                              {i.archivado && <Pastilla>Archivado</Pastilla>}
                            </div>
                          </td>
                          <td className="py-2 pr-3 text-gray-600 max-w-[260px]">
                            {i.usos.length === 0 ? <span className="text-gray-400">—</span> : (
                              <span title={i.usos.join(", ")}>{i.usos.length} producto{i.usos.length === 1 ? "" : "s"}: {i.usos.slice(0, 3).join(", ")}{i.usos.length > 3 ? "…" : ""}</span>
                            )}
                          </td>
                          <td className="py-2 text-right whitespace-nowrap">
                            {abierto ? (
                              <span className="inline-flex gap-1">
                                <button type="button" disabled={guardando} onClick={() => void guardar(i)}
                                  className="px-3 py-1 text-xs font-medium text-white bg-primary hover:bg-primary-light rounded-lg disabled:opacity-50">
                                  {guardando ? "Guardando…" : "Guardar"}
                                </button>
                                <button type="button" onClick={() => setEditando(null)} className="px-2 py-1 text-xs text-gray-500">Cancelar</button>
                              </span>
                            ) : i.archivado ? (
                              <button type="button" disabled={guardando} onClick={() => void archivar(i, false)} className="text-xs font-medium text-primary">Desarchivar</button>
                            ) : (
                              <span className="inline-flex flex-col items-end gap-1">
                                <button type="button" onClick={() => abrir(i)} className="text-xs font-medium text-primary">Cambiar precio</button>
                                <button type="button" disabled={guardando} onClick={() => void archivar(i, true)} className="text-[11px] text-gray-400 hover:text-gray-700">Archivar</button>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {lista.length > MAX_FILAS && <p className="text-[11px] text-gray-500 mt-2">Se muestran {MAX_FILAS} de {lista.length}. Usa el buscador para encontrar el resto.</p>}
              </div>
            )}
          </>
        )}
      </div>
    </details>
  );
}
