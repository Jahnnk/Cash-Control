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
import { ArrowRight, CornerDownRight, Loader2, Pencil, SlidersHorizontal } from "lucide-react";
import { METAS } from "@/lib/precios-sugeridos";

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

const pct = (n: number) => `${(n * 100).toLocaleString("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Nodo({ titulo, precio, m, meta, etiquetaMargen, base, fc, campo, onGuardar }: {
  titulo: string; precio: PrecioRuta; m: number | null; meta: number; etiquetaMargen: string;
  /** Lo que le cuesta a quien vende (costo de Atelier o precio interno): para la utilidad en soles. */
  base?: number | null;
  /** Food cost de la sede (interno ÷ carta), solo en el precio al público. */
  fc?: number | null;
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
      {base != null && <div className="text-[11px] text-gray-600">Gana <b className="tabular-nums">{soles(precio.valor - base)}</b>{fc != null && <> · food cost <b className="tabular-nums">{pct(fc)}</b></>}</div>}
      {precio.byte && (
        <div className="mt-0.5 text-[10px] leading-snug text-gray-500">
          Lo cobra Byte · {precio.byte.unidades.toLocaleString("es-PE", { maximumFractionDigits: 0 })} u en 3 meses
          {precio.byte.anterior != null && <> · antes {soles(precio.byte.anterior)}</>}. Se cambia en Byte.
        </div>
      )}
    </div>
  );
}

/**
 * Cuentas de la ruta (las de la hoja PRICING del Excel): utilidad = precio − lo que le cuesta a quien vende,
 * margen = utilidad ÷ precio, food cost de la sede = precio interno ÷ precio de carta.
 */
export function cuentasRuta(costo: number, interno: number | null, carta: number | null, b2b: number | null) {
  const tramo = (precio: number | null, base: number | null) =>
    precio != null && precio > 0 && base != null ? { utilidad: precio - base, margen: (precio - base) / precio } : null;
  return {
    atelierCafeterias: tramo(interno, costo),
    cafeteriaPublico: tramo(carta, interno),
    foodCostSede: interno != null && carta != null && carta > 0 ? interno / carta : null,
    atelierB2B: tramo(b2b, costo),
  };
}

const aNumero = (t: string) => { const n = Number(t.replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : null; };

/** Un precio en modo «jugar»: se escribe y todo se recalcula; con onGuardar, se puede guardar ese precio. */
function NodoSim({ titulo, real, valor, onValor, utilidad, m, meta, etiquetaMargen, fc, campo, onGuardar, byte }: {
  titulo: string; real: number | null; valor: string; onValor: (v: string) => void;
  utilidad: number | null; m: number | null; meta: number; etiquetaMargen: string; fc?: number | null;
  campo: CampoPrecio; onGuardar?: GuardarPrecio; byte?: boolean;
}) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = aNumero(valor);
  const cambio = n != null && (real == null || Math.abs(n - real) >= 0.005);
  async function guardar() {
    if (n == null || !onGuardar) return;
    setGuardando(true); setError(null);
    const e = await onGuardar(campo, n);
    setGuardando(false);
    if (e) setError(e);
  }
  const bajo = m != null && m < meta - 0.005;
  return (
    <div className={`min-w-0 flex-1 rounded-xl border bg-white px-3 py-2 space-y-1 ${cambio ? "border-primary/50" : "border-gray-200"}`}>
      <div className="text-[11px] text-gray-500">{titulo}</div>
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-gray-500">S/</span>
        <input inputMode="decimal" type="number" step="0.10" min="0" value={valor} onChange={(e) => onValor(e.target.value)} aria-label={`Probar precio ${titulo}`}
          className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-right text-sm font-semibold tabular-nums" />
        <span className="text-[10px] text-gray-400">{real != null ? `hoy ${soles(real)}` : "hoy no va"}</span>
      </div>
      <div className="text-[11px] text-gray-600">
        Gana <b className="tabular-nums">{utilidad == null ? "—" : soles(utilidad)}</b>
        {" · "}<span className={bajo ? "text-amber-700" : "text-emerald-700"}>{etiquetaMargen} <b className="tabular-nums">{m == null ? "—" : pct(m)}</b></span>
        <span className="text-gray-400"> · meta {Math.round(meta * 100)}%</span>
      </div>
      {fc !== undefined && <div className="text-[11px] text-gray-600">Food cost de la sede <b className="tabular-nums">{fc == null ? "—" : pct(fc)}</b></div>}
      {cambio && onGuardar && !byte && (
        <button type="button" onClick={() => void guardar()} disabled={guardando}
          className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary-50 disabled:opacity-50">
          {guardando && <Loader2 className="h-3 w-3 animate-spin" />} Guardar {soles(n!)}
        </button>
      )}
      {cambio && byte && <p className="text-[10px] text-gray-400">Lo cobra Byte: se cambia allá.</p>}
      {error && <p className="text-[11px] text-red-700">{error}</p>}
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
  // «Jugar con los precios» (pedido de Jahnn, 26-nov-2026): se escribe un precio y se ven la utilidad, el margen
  // y el food cost al instante. No se guarda nada salvo que se toque «Guardar» en ese precio.
  const [sim, setSim] = useState<Record<CampoPrecio, string> | null>(null);
  const texto = (p: PrecioRuta) => (p ? p.valor.toFixed(2) : "");
  const empezar = () => setSim({ interno: texto(interno), carta: texto(carta), b2b: texto(b2b) });
  const valores = sim
    ? { interno: aNumero(sim.interno), carta: aNumero(sim.carta), b2b: aNumero(sim.b2b) }
    : { interno: interno?.valor ?? null, carta: carta?.valor ?? null, b2b: b2b?.valor ?? null };
  const k = cuentasRuta(costo, valores.interno, valores.carta, valores.b2b);
  const guardarSim = (c: CampoPrecio) => (editables?.[c] && onGuardar ? onGuardar : undefined);
  const poner = (c: CampoPrecio) => (v: string) => setSim((s) => (s ? { ...s, [c]: v } : s));
  return (
    <section className="rounded-xl border border-gray-200/80 bg-gray-50/60 p-3 space-y-2" aria-label="Ruta de precios">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-gray-900">Ruta de precios</h3>
        <div className="flex flex-wrap items-center gap-3">
          {!sim && [interno, carta, b2b].some((p) => p?.sugerido) && (
            <span className="text-[11px] text-gray-500">«sugerido» = todavía no tiene precio guardado; sale de las metas.</span>
          )}
          {sim ? (
            <button type="button" onClick={() => setSim(null)} className="text-[11px] font-medium text-gray-600 underline decoration-dotted">Volver a los precios de hoy</button>
          ) : (
            <button type="button" onClick={empezar} className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-white px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary-50">
              <SlidersHorizontal className="h-3 w-3" /> Jugar con los precios
            </button>
          )}
        </div>
      </div>
      {sim && <p className="text-[11px] text-gray-500">Prueba precios: todo se recalcula al instante. No se guarda nada hasta que toques «Guardar» en un precio.</p>}
      <div className="grid gap-2 sm:grid-cols-[150px_1fr] sm:items-center">
        <div className="rounded-xl border border-primary/30 bg-emerald-50/60 px-3 py-2">
          <div className="text-[11px] text-gray-500">Atelier · costo por unidad</div>
          <div className="text-base font-semibold tabular-nums text-primary">{soles(costo)}</div>
        </div>
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <ArrowRight className="hidden h-4 w-4 shrink-0 text-gray-400 sm:block" />
            {sim ? (
              <NodoSim titulo="Cafeterías Yayi's (precio interno)" real={interno?.valor ?? null} valor={sim.interno} onValor={poner("interno")}
                utilidad={k.atelierCafeterias?.utilidad ?? null} m={k.atelierCafeterias?.margen ?? null} meta={METAS.margenInterno} etiquetaMargen="Margen de Atelier"
                campo="interno" onGuardar={guardarSim("interno")} />
            ) : (
              <Nodo titulo="Cafeterías Yayi's (precio interno)" precio={interno} m={k.atelierCafeterias?.margen ?? null} base={costo}
                meta={METAS.margenInterno} etiquetaMargen="Margen de Atelier" {...ed("interno")} />
            )}
            <ArrowRight className="hidden h-4 w-4 shrink-0 text-gray-400 sm:block" />
            {sim ? (
              <NodoSim titulo="Público final (carta)" real={carta?.valor ?? null} valor={sim.carta} onValor={poner("carta")}
                utilidad={k.cafeteriaPublico?.utilidad ?? null} m={k.cafeteriaPublico?.margen ?? null} meta={metaSede} etiquetaMargen="Margen de la sede"
                fc={k.foodCostSede} campo="carta" onGuardar={guardarSim("carta")} />
            ) : (
              <Nodo titulo="Público final (carta)" precio={carta} m={k.cafeteriaPublico?.margen ?? null} base={interno?.valor ?? null} fc={k.foodCostSede}
                meta={metaSede} etiquetaMargen="Margen de la sede" {...ed("carta")} />
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <CornerDownRight className="hidden h-4 w-4 shrink-0 text-gray-400 sm:block" />
            {sim ? (
              <NodoSim titulo="Clientes B2B" real={b2b?.valor ?? null} valor={sim.b2b} onValor={poner("b2b")}
                utilidad={k.atelierB2B?.utilidad ?? null} m={k.atelierB2B?.margen ?? null} meta={METAS.margenB2B} etiquetaMargen="Margen de Atelier"
                campo="b2b" onGuardar={guardarSim("b2b")} byte={!!b2b?.byte} />
            ) : (
              <Nodo titulo="Clientes B2B" precio={b2b} m={k.atelierB2B?.margen ?? null} base={costo}
                meta={METAS.margenB2B} etiquetaMargen="Margen de Atelier" {...ed("b2b")} />
            )}
            <div className="hidden flex-1 sm:block" />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Producto que se prepara en la cafetería: costo → público, con lo que gana la sede, su margen y el food cost.
 * También con «Jugar con los precios» (27-nov-2026). `meta` = margen meta de la sede (por defecto, cocina propia).
 */
export function RutaPreciosCafeteria({ costo, carta, onGuardar, meta = 1 - METAS.foodCostCafeteria }: {
  costo: number; carta: PrecioRuta; onGuardar?: GuardarPrecio; meta?: number;
}) {
  const [sim, setSim] = useState<string | null>(null);
  const precio = sim !== null ? aNumero(sim) : carta?.valor ?? null;
  const k = cuentasRuta(costo, costo, precio, null).cafeteriaPublico;
  const fc = precio != null && precio > 0 ? costo / precio : null;
  return (
    <section className="rounded-xl border border-gray-200/80 bg-gray-50/60 p-3 space-y-2" aria-label="Ruta de precios">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-gray-900">Ruta de precios</h3>
        {sim !== null ? (
          <button type="button" onClick={() => setSim(null)} className="text-[11px] font-medium text-gray-600 underline decoration-dotted">Volver al precio de hoy</button>
        ) : (
          <button type="button" onClick={() => setSim(carta ? carta.valor.toFixed(2) : "")} className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-white px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary-50">
            <SlidersHorizontal className="h-3 w-3" /> Jugar con los precios
          </button>
        )}
      </div>
      {sim !== null && <p className="text-[11px] text-gray-500">Prueba precios: todo se recalcula al instante. No se guarda nada hasta que toques «Guardar».</p>}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="rounded-xl border border-primary/30 bg-emerald-50/60 px-3 py-2 sm:w-[150px]">
          <div className="text-[11px] text-gray-500">Cafetería · costo</div>
          <div className="text-base font-semibold tabular-nums text-primary">{soles(costo)}</div>
        </div>
        <ArrowRight className="hidden h-4 w-4 shrink-0 text-gray-400 sm:block" />
        {sim !== null ? (
          <NodoSim titulo="Público final (carta)" real={carta && !carta.sugerido ? carta.valor : null} valor={sim} onValor={setSim}
            utilidad={k?.utilidad ?? null} m={k?.margen ?? null} meta={meta} etiquetaMargen="Margen de la sede" fc={fc}
            campo="carta" onGuardar={onGuardar} />
        ) : (
          <Nodo titulo="Público final (carta)" precio={carta} m={k?.margen ?? null} base={costo} fc={fc}
            meta={meta} etiquetaMargen="Margen de la sede" {...(onGuardar ? { campo: "carta" as const, onGuardar } : {})} />
        )}
      </div>
    </section>
  );
}
