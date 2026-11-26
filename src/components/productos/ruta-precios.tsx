"use client";

/**
 * Ruta de precios de un producto (boceto de Jahnn, 25-nov-2026): del costo en Atelier a las cafeterías Yayi's
 * (precio interno) y de ahí al público (precio de carta), y aparte a los clientes B2B. Cada precio con su margen.
 * Si el producto todavía no tiene un precio guardado, se muestra el sugerido (marcado «sugerido»). Con onGuardar,
 * cada precio se cambia ahí mismo («cambiar», o «fijar» el sugerido): fase 2, una sola puerta para los precios.
 *
 *   margen de Atelier a la cafetería = (interno − costo) ÷ interno            meta 60 %
 *   margen de la sede                = (carta − interno) ÷ carta              meta 45 % (food cost de sede ~55 %)
 *   margen B2B                       = (B2B − costo) ÷ B2B                    meta 75 %
 *   producto de cafetería: margen    = (carta − costo) ÷ carta                meta 70 % (food cost 30 %)
 */

import { useState } from "react";
import { ArrowRight, CornerDownRight, Loader2, Pencil } from "lucide-react";
import { METAS, margen } from "@/lib/precios-sugeridos";

/**
 * Un precio de la ruta. `byte` = el precio B2B real que cobra Byte (fase 4, 26-nov-2026): se muestra tal cual y
 * no se cambia aquí, porque su dueño es Byte.
 */
export type PrecioRuta = {
  valor: number;
  sugerido: boolean;
  byte?: { mes: string; unidades: number; anterior: number | null; nombreByte: string };
} | null;
/** El precio B2B de la ruta: el de Byte si se vende ahí; si no, el guardado; si no, el sugerido. */
export function rutaB2B(byte: { precio: number; mes: string; unidades: number; anterior: number | null; nombreByte: string } | null | undefined,
  guardado: number | null | undefined, sugerido: number): PrecioRuta {
  if (byte && byte.precio > 0) return { valor: byte.precio, sugerido: false, byte: { mes: byte.mes, unidades: byte.unidades, anterior: byte.anterior, nombreByte: byte.nombreByte } };
  if (guardado && guardado > 0) return { valor: guardado, sugerido: false };
  return sugerido > 0 ? { valor: sugerido, sugerido: true } : null;
}

export type CampoPrecio = "interno" | "carta" | "b2b";
/** Guarda un precio (fase 2, 25-nov-2026: una sola puerta para los precios de venta). Devuelve el error o null. */
export type GuardarPrecio = (campo: CampoPrecio, precio: number) => Promise<string | null>;

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Nodo({ titulo, precio, m, meta, etiquetaMargen, campo, onGuardar }: {
  titulo: string; precio: PrecioRuta; m: number | null; meta: number; etiquetaMargen: string;
  /** Con campo y onGuardar, el precio se cambia aquí mismo. */
  campo?: CampoPrecio; onGuardar?: GuardarPrecio;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = !!campo && !!onGuardar && !precio?.byte;
  const abrir = () => { setValor(precio ? precio.valor.toFixed(2) : ""); setError(null); setEditando(true); };
  async function guardar() {
    const n = Number(valor.replace(",", "."));
    if (!(n > 0)) { setError("Escribe un precio mayor que cero."); return; }
    setGuardando(true);
    const e = await onGuardar!(campo!, n);
    setGuardando(false);
    if (e) { setError(e); return; }
    setEditando(false);
  }
  if (editando) {
    return (
      <div className="min-w-0 flex-1 rounded-xl border border-primary/40 bg-white px-3 py-2 space-y-1.5">
        <div className="text-[11px] text-gray-500">{titulo}</div>
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-gray-500">S/</span>
          <input autoFocus inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} aria-label={`Precio ${titulo}`}
            onKeyDown={(e) => { if (e.key === "Enter") void guardar(); if (e.key === "Escape") setEditando(false); }}
            className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-right text-sm tabular-nums" />
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button type="button" onClick={() => void guardar()} disabled={guardando}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 font-medium text-white disabled:opacity-50">
            {guardando && <Loader2 className="h-3 w-3 animate-spin" />} Guardar
          </button>
          <button type="button" onClick={() => setEditando(false)} className="text-gray-500">Cancelar</button>
        </div>
        {error && <p className="text-[11px] text-red-700">{error}</p>}
        <p className="text-[10px] text-gray-400">Vale desde ya en Recetas, Productos y Precios.</p>
      </div>
    );
  }
  if (!precio) {
    return (
      <div className="min-w-0 flex-1 rounded-xl border border-dashed border-gray-200 px-3 py-2">
        <div className="text-[11px] text-gray-500">{titulo}</div>
        <div className="text-sm text-gray-400">No va</div>
        {editable && <button type="button" onClick={abrir} className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] text-primary underline decoration-dotted"><Pencil className="h-3 w-3" /> poner precio</button>}
      </div>
    );
  }
  const bajo = m != null && m < meta - 0.005;
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
        {titulo}
        {precio.sugerido && <span className="rounded bg-amber-50 px-1 text-[10px] font-medium text-amber-800">sugerido</span>}
        {precio.byte && <span className="rounded bg-sky-50 px-1 text-[10px] font-medium text-sky-800" title={`En Byte: ${precio.byte.nombreByte}`}>en Byte</span>}
        {editable && (
          <button type="button" onClick={abrir} className="ml-auto inline-flex items-center gap-0.5 text-primary underline decoration-dotted" title={precio.sugerido ? "Guardar este precio o cambiarlo" : "Cambiar el precio"}>
            <Pencil className="h-3 w-3" /> {precio.sugerido ? "fijar" : "cambiar"}
          </button>
        )}
      </div>
      <div className="text-base font-semibold tabular-nums text-gray-900">{soles(precio.valor)}</div>
      <div className={`text-[11px] ${bajo ? "text-amber-700" : "text-emerald-700"}`}>
        {etiquetaMargen} <b className="tabular-nums">{m == null ? "—" : `${Math.round(m * 100)}%`}</b>
        <span className="text-gray-400"> · meta {Math.round(meta * 100)}%</span>
      </div>
      {precio.byte && (
        <div className="mt-0.5 text-[10px] leading-snug text-gray-500">
          Lo cobra Byte · {precio.byte.unidades.toLocaleString("es-PE", { maximumFractionDigits: 0 })} u en 3 meses
          {precio.byte.anterior != null && <> · antes {soles(precio.byte.anterior)}</>}. Se cambia en Byte.
        </div>
      )}
    </div>
  );
}

/** Producto de Atelier: costo → cafeterías → público, y costo → B2B. */
export function RutaPreciosAtelier({ costo, interno, carta, b2b, editables, onGuardar }: {
  costo: number; interno: PrecioRuta; carta: PrecioRuta; b2b: PrecioRuta;
  /** Qué precios se pueden cambiar aquí (interno y carta solo si está en la carta). */
  editables?: Partial<Record<CampoPrecio, boolean>>; onGuardar?: GuardarPrecio;
}) {
  const ed = (c: CampoPrecio) => (editables?.[c] && onGuardar ? { campo: c, onGuardar } : {});
  const metaSede = 1 - METAS.foodCostAtelierEnCarta;
  return (
    <section className="rounded-xl border border-gray-200/80 bg-gray-50/60 p-3 space-y-2" aria-label="Ruta de precios">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-gray-900">Ruta de precios</h3>
        {[interno, carta, b2b].some((p) => p?.sugerido) && (
          <span className="text-[11px] text-gray-500">«sugerido» = todavía no tiene precio guardado; sale de las metas.</span>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-[150px_1fr] sm:items-center">
        <div className="rounded-xl border border-primary/30 bg-emerald-50/60 px-3 py-2">
          <div className="text-[11px] text-gray-500">Atelier · costo por unidad</div>
          <div className="text-base font-semibold tabular-nums text-primary">{soles(costo)}</div>
        </div>
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <ArrowRight className="hidden h-4 w-4 shrink-0 text-gray-400 sm:block" />
            <Nodo titulo="Cafeterías Yayi's (precio interno)" precio={interno} m={interno ? margen(interno.valor, costo) : null}
              meta={METAS.margenInterno} etiquetaMargen="Margen de Atelier" {...ed("interno")} />
            <ArrowRight className="hidden h-4 w-4 shrink-0 text-gray-400 sm:block" />
            <Nodo titulo="Público final (carta)" precio={carta} m={carta && interno ? margen(carta.valor, interno.valor) : null}
              meta={metaSede} etiquetaMargen="Margen de la sede" {...ed("carta")} />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <CornerDownRight className="hidden h-4 w-4 shrink-0 text-gray-400 sm:block" />
            <Nodo titulo="Clientes B2B" precio={b2b} m={b2b ? margen(b2b.valor, costo) : null}
              meta={METAS.margenB2B} etiquetaMargen="Margen de Atelier" {...ed("b2b")} />
            <div className="hidden flex-1 sm:block" />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Producto que se prepara en la cafetería: costo → público. */
export function RutaPreciosCafeteria({ costo, carta, onGuardar }: { costo: number; carta: PrecioRuta; onGuardar?: GuardarPrecio }) {
  return (
    <section className="rounded-xl border border-gray-200/80 bg-gray-50/60 p-3 space-y-2" aria-label="Ruta de precios">
      <h3 className="text-[13px] font-semibold text-gray-900">Ruta de precios</h3>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="rounded-xl border border-primary/30 bg-emerald-50/60 px-3 py-2 sm:w-[150px]">
          <div className="text-[11px] text-gray-500">Cafetería · costo</div>
          <div className="text-base font-semibold tabular-nums text-primary">{soles(costo)}</div>
        </div>
        <ArrowRight className="hidden h-4 w-4 shrink-0 text-gray-400 sm:block" />
        <Nodo titulo="Público final (carta)" precio={carta} m={carta ? margen(carta.valor, costo) : null}
          meta={1 - METAS.foodCostCafeteria} etiquetaMargen="Margen de la sede" {...(onGuardar ? { campo: "carta" as const, onGuardar } : {})} />
      </div>
    </section>
  );
}
