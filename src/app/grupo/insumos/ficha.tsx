"use client";

/**
 * Grupo → Insumos → ficha de un insumo (panel lateral). Todo de un insumo en un solo lugar: precio y su historia,
 * cuánto pesa en el gasto, qué pasa si sube, dónde se usa, mejor proveedor, Producción, y lo que se decide de él
 * (crítico, categoría, nombre, archivar). Motor: lib/insumos-ficha.ts.
 */

import { useEffect, useState } from "react";
import { Archive, ArchiveRestore, Pencil, Star, X } from "lucide-react";
import type { FichaInsumo } from "@/app/actions/insumos";
import { Pastilla } from "@/components/productos/ui";
import { diasEntre, tonoEdad, type PuntoPrecio } from "@/lib/insumos-ficha";
import { fechaCorta, soles, solesRedondo, TONO_EDAD, textoEdad } from "./piezas";

export type AccionesFicha = {
  guardarPrecio: (i: FichaInsumo, precio: number) => Promise<string | null>;
  guardarFicha: (i: FichaInsumo, cambio: { categoria?: string | null; critico?: boolean | null; nombre?: string | null }) => Promise<string | null>;
  archivar: (i: FichaInsumo, archivar: boolean) => Promise<string | null>;
};

export function Ficha({ insumo: i, hoy, categorias, acciones, onCerrar }: {
  insumo: FichaInsumo;
  hoy: string;
  categorias: string[];
  acciones: AccionesFicha;
  onCerrar: () => void;
}) {
  const [precio, setPrecio] = useState<string | null>(null);
  const [nombre, setNombre] = useState<string | null>(null);
  const [nuevaCategoria, setNuevaCategoria] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onCerrar]);

  const correr = async (f: () => Promise<string | null>) => {
    setGuardando(true);
    setError(null);
    const e = await f();
    setGuardando(false);
    if (e) setError(e);
    return !e;
  };

  const guardarPrecio = async (valor: string) => {
    const n = Number(valor.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) { setError("Escribe un precio mayor que cero."); return; }
    const cambio = (n / i.precio - 1) * 100;
    if (Math.abs(cambio) >= 50 && !window.confirm(`El precio cambia ${cambio > 0 ? "+" : ""}${cambio.toFixed(0)}%. ¿Está bien?`)) return;
    if (await correr(() => acciones.guardarPrecio(i, n))) setPrecio(null);
  };

  const dias = diasEntre(i.fecha, hoy);
  const usos = i.recetas.length + i.productos.length;
  const dif = i.proveedor && i.precio > 0 ? Math.round(((i.proveedor.precioInsumo - i.precio) / i.precio) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Ficha de ${i.nombre}`}>
      <button type="button" aria-label="Cerrar" onClick={onCerrar} className="absolute inset-0 bg-gray-900/30" />
      <aside className="relative h-full w-full max-w-[460px] overflow-y-auto bg-white shadow-2xl">
        {/* Encabezado */}
        <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/95 px-5 pb-4 pt-5 backdrop-blur">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{i.categoria} · {i.origen === "Atelier" ? "compra Atelier" : "compran las cafeterías"}</div>
              {nombre === null ? (
                <h2 className="mt-1 text-lg font-semibold leading-snug text-gray-900">
                  {i.nombre}
                  <button type="button" onClick={() => setNombre(i.nombre)} className="ml-1.5 inline-flex align-middle text-gray-300 hover:text-primary" aria-label="Corregir el nombre">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </h2>
              ) : (
                <div className="mt-1 flex gap-1.5">
                  <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} aria-label="Nombre del insumo"
                    onKeyDown={(e) => { if (e.key === "Enter") void correr(() => acciones.guardarFicha(i, { nombre })).then((ok) => ok && setNombre(null)); if (e.key === "Escape") setNombre(null); }}
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-1 text-sm" />
                  <button type="button" disabled={guardando} onClick={() => void correr(() => acciones.guardarFicha(i, { nombre })).then((ok) => ok && setNombre(null))}
                    className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-white disabled:opacity-50">Guardar</button>
                </div>
              )}
              <div className="mt-0.5 text-xs text-gray-400">
                {i.sku} · por {i.unidad}
                {i.nombreExcel && (
                  <> · en el Excel: «{i.nombreExcel}» <button type="button" className="text-primary underline" onClick={() => void correr(() => acciones.guardarFicha(i, { nombre: null }))}>volver</button></>
                )}
              </div>
            </div>
            <button type="button" onClick={onCerrar} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Cerrar ficha">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Crítico */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" disabled={guardando} onClick={() => void correr(() => acciones.guardarFicha(i, { critico: !i.critico }))}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors ${
                i.critico ? "bg-amber-50 text-amber-900 ring-amber-300" : "bg-white text-gray-600 ring-gray-200 hover:bg-gray-50"}`}>
              <Star className={`h-3.5 w-3.5 ${i.critico ? "fill-amber-400 text-amber-500" : "text-gray-400"}`} />
              {i.critico ? "Crítico" : "Marcar como crítico"}
            </button>
            <span className="text-[11px] text-gray-500">
              {i.criticoManual === null
                ? (i.criticoSugerido ? "Lo propone el sistema: está entre los que hacen el 80% del gasto." : "")
                : <>Puesto a mano{i.criticoManual !== i.criticoSugerido && <> · <button type="button" className="text-primary underline" onClick={() => void correr(() => acciones.guardarFicha(i, { critico: null }))}>que decida el sistema</button></>}</>}
            </span>
          </div>
          {i.archivado && <div className="mt-2"><Pastilla>Archivado: no sale en los buscadores de recetas</Pastilla></div>}
        </div>

        <div className="space-y-5 px-5 py-5">
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}

          {/* Precio */}
          <section className="rounded-2xl border border-gray-200/80 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Precio de compra</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{soles(i.precio)}<span className="text-sm font-normal text-gray-400"> / {i.unidad}</span></div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                  desde {fechaCorta(i.fecha)} <Pastilla tono={TONO_EDAD[tonoEdad(dias)]}>{textoEdad(dias)}</Pastilla>
                  {i.creadoAqui ? <Pastilla tono="marca">Creado aquí</Pastilla> : i.delSistema ? <Pastilla tono="azul">Cambiado aquí</Pastilla> : <Pastilla>Excel</Pastilla>}
                </div>
              </div>
              {precio === null && !i.archivado && (
                <button type="button" onClick={() => { setPrecio(String(i.precio)); setError(null); }}
                  className="shrink-0 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-white hover:bg-primary-light">Cambiar precio</button>
              )}
            </div>
            {precio !== null && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-sm text-gray-500">S/</span>
                <input autoFocus inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} aria-label={`Precio nuevo de ${i.nombre}`}
                  onKeyDown={(e) => { if (e.key === "Enter") void guardarPrecio(precio); if (e.key === "Escape") setPrecio(null); }}
                  className="w-28 rounded-lg border border-gray-300 px-2 py-1.5 text-right text-sm" />
                <span className="text-xs text-gray-400">por {i.unidad}</span>
                <button type="button" disabled={guardando} onClick={() => void guardarPrecio(precio)}
                  className="ml-auto rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">{guardando ? "Guardando…" : "Guardar"}</button>
                <button type="button" onClick={() => setPrecio(null)} className="text-xs text-gray-500">Cancelar</button>
              </div>
            )}
            {i.proveedor && (
              <div className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-900">
                Mejor proveedor: <b>{soles(i.proveedor.precioInsumo)}</b> · {i.proveedor.proveedor}
                {dif !== 0 && <span className={`font-semibold ${dif < 0 ? "text-emerald-700" : "text-red-700"}`}> ({dif > 0 ? "+" : ""}{dif}%)</span>}
                {dif !== 0 && !i.archivado && (
                  <button type="button" onClick={() => setPrecio(String(i.proveedor!.precioInsumo))} className="ml-1.5 font-medium text-primary underline">Usar</button>
                )}
                <div className="text-[11px] text-sky-700/80">Precio del {fechaCorta(i.proveedor.fecha)}</div>
              </div>
            )}
            <Historia puntos={i.historial} />
            {i.cambio && (
              <p className="mt-1 text-xs text-gray-600">
                Último cambio el {fechaCorta(i.cambio.fecha)}: antes {soles(i.cambio.anterior)}{" "}
                <span className={`font-semibold ${i.cambio.pct > 0 ? "text-red-700" : "text-emerald-700"}`}>({i.cambio.pct > 0 ? "+" : ""}{i.cambio.pct}%)</span>
              </p>
            )}
          </section>

          {/* Peso en el gasto */}
          <section>
            <h3 className="text-[13px] font-semibold text-gray-900">Cuánto pesa</h3>
            {i.gastoMes > 0 ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-[11px] text-gray-500">Gasto al mes</div>
                  <div className="text-base font-semibold tabular-nums text-gray-900">{solesRedondo(i.gastoMes)}</div>
                  <div className="text-[11px] text-gray-500">{i.pctGasto}% del gasto en insumos del grupo</div>
                </div>
                <div className="rounded-xl bg-amber-50 p-3">
                  <div className="text-[11px] text-amber-800">Si sube 10%</div>
                  <div className="text-base font-semibold tabular-nums text-amber-900">+{solesRedondo(i.gastoMes * 0.1)} al mes</div>
                  <div className="text-[11px] text-amber-800/80">+{solesRedondo(i.gastoMes * 1.2)} al año</div>
                </div>
              </div>
            ) : (
              <p className="mt-1 text-xs text-gray-500">No sale en lo que venden las cafeterías. Lo que Atelier vende a clientes B2B todavía no entra en esta cuenta.</p>
            )}
          </section>

          {/* Dónde se usa */}
          <section>
            <h3 className="text-[13px] font-semibold text-gray-900">Dónde se usa</h3>
            {usos === 0 ? (
              <p className="mt-1 text-xs text-gray-500">
                En ninguna receta ni producto de la carta. Si ya no se compra, archívalo: deja de salir en los buscadores.
              </p>
            ) : (
              <div className="mt-2 space-y-3">
                {i.recetas.length > 0 && <Lista titulo={`${i.recetas.length} receta${i.recetas.length === 1 ? "" : "s"} de Atelier`} items={i.recetas} />}
                {i.productos.length > 0 && <Lista titulo={`${i.productos.length} producto${i.productos.length === 1 ? "" : "s"} de la carta`} items={i.productos} />}
              </div>
            )}
          </section>

          {/* Categoría */}
          <section>
            <h3 className="text-[13px] font-semibold text-gray-900">Categoría</h3>
            {nuevaCategoria === null ? (
              <div className="mt-2 flex items-center gap-2">
                <select value={i.categoria} disabled={guardando} aria-label="Categoría"
                  onChange={(e) => {
                    if (e.target.value === "__nueva") { setNuevaCategoria(""); return; }
                    void correr(() => acciones.guardarFicha(i, { categoria: e.target.value }));
                  }}
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm">
                  {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
                  <option value="__nueva">+ Nueva categoría…</option>
                </select>
                {i.categoriaElegida && (
                  <button type="button" className="text-xs text-primary underline" onClick={() => void correr(() => acciones.guardarFicha(i, { categoria: null }))}>la del Excel</button>
                )}
              </div>
            ) : (
              <div className="mt-2 flex gap-2">
                <input autoFocus value={nuevaCategoria} onChange={(e) => setNuevaCategoria(e.target.value)} placeholder="ej. Masas congeladas" aria-label="Nueva categoría"
                  className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                <button type="button" disabled={guardando || nuevaCategoria.trim().length < 2}
                  onClick={() => void correr(() => acciones.guardarFicha(i, { categoria: nuevaCategoria })).then((ok) => ok && setNuevaCategoria(null))}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">Guardar</button>
                <button type="button" onClick={() => setNuevaCategoria(null)} className="text-xs text-gray-500">Cancelar</button>
              </div>
            )}
          </section>

          {/* Producción */}
          {i.produccion !== null && (
            <section className="flex items-center justify-between gap-3 rounded-xl border border-gray-200/80 px-3 py-2.5">
              <div>
                <div className="text-[13px] font-semibold text-gray-900">Producción</div>
                <div className="text-[11px] text-gray-500">{i.produccion ? "Conectado con su insumo de Producción." : "Sin conectar. Se conecta en «Conectar insumos de Producción», al final de esta pantalla."}</div>
              </div>
              <Pastilla tono={i.produccion ? "verde" : "gris"}>{i.produccion ? "Conectado" : "Sin conectar"}</Pastilla>
            </section>
          )}

          {/* Archivar */}
          <section className="border-t border-gray-100 pt-4">
            {i.archivado ? (
              <button type="button" disabled={guardando} onClick={() => void correr(() => acciones.archivar(i, false))}
                className="inline-flex items-center gap-1.5 rounded-xl border border-primary/40 px-3 py-2 text-xs font-medium text-primary hover:bg-emerald-50">
                <ArchiveRestore className="h-4 w-4" /> Desarchivar: vuelve a los buscadores
              </button>
            ) : (
              <button type="button" disabled={guardando}
                onClick={() => {
                  if (!window.confirm(`¿Archivar «${i.nombre}»? Ya no saldrá en los buscadores de recetas.${usos > 0 ? " Las recetas y productos que ya lo usan conservan su costo." : ""} Puedes desarchivarlo cuando quieras.`)) return;
                  void correr(() => acciones.archivar(i, true));
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">
                <Archive className="h-4 w-4" /> Archivar: ya no se compra
              </button>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

function Lista({ titulo, items }: { titulo: string; items: string[] }) {
  const [todos, setTodos] = useState(false);
  const MAX = 8;
  const ver = todos ? items : items.slice(0, MAX);
  return (
    <div>
      <div className="text-[11px] font-medium text-gray-500">{titulo}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {ver.map((n) => <span key={n} className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700">{n}</span>)}
        {items.length > MAX && (
          <button type="button" onClick={() => setTodos(!todos)} className="px-1 text-[11px] font-medium text-primary">{todos ? "ver menos" : `y ${items.length - MAX} más`}</button>
        )}
      </div>
    </div>
  );
}

/** La historia del precio: una línea simple con el primer y el último precio. */
function Historia({ puntos }: { puntos: PuntoPrecio[] }) {
  if (puntos.length < 2) return <p className="mt-3 text-[11px] text-gray-400">Todavía no tiene historial de precios: es su primer precio.</p>;
  const W = 400, H = 64, P = 6;
  const min = Math.min(...puntos.map((p) => p.precio));
  const max = Math.max(...puntos.map((p) => p.precio));
  const t0 = Date.parse(puntos[0].fecha), t1 = Date.parse(puntos[puntos.length - 1].fecha);
  const x = (f: string) => (t1 > t0 ? P + ((Date.parse(f) - t0) / (t1 - t0)) * (W - 2 * P) : W / 2);
  const y = (v: number) => (max > min ? H - P - ((v - min) / (max - min)) * (H - 2 * P) : H / 2);
  // Escalones: el precio vale hasta que cambia.
  const d = puntos.map((p, k) => (k === 0 ? `M${x(p.fecha)},${y(p.precio)}` : `H${x(p.fecha)} V${y(p.precio)}`)).join(" ");
  const sube = puntos[puntos.length - 1].precio > puntos[0].precio;
  const color = max === min ? "#9ca3af" : sube ? "#b91c1c" : "#098B5F";
  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full" role="img" aria-label="Historia del precio">
        <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {puntos.map((p) => <circle key={p.fecha} cx={x(p.fecha)} cy={y(p.precio)} r="2.5" fill={color} />)}
      </svg>
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>{fechaCorta(puntos[0].fecha)} · {soles(puntos[0].precio)}</span>
        <span>{fechaCorta(puntos[puntos.length - 1].fecha)} · {soles(puntos[puntos.length - 1].precio)}</span>
      </div>
    </div>
  );
}
