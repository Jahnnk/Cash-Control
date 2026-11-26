"use client";

/**
 * Ruta de precios de un producto (boceto de Jahnn, 25-nov-2026): del costo en Atelier a las cafeterías Yayi's
 * (precio interno) y de ahí al público (precio de carta), y aparte a los clientes B2B. Cada precio con su margen.
 * Si el producto todavía no tiene un precio guardado, se muestra el sugerido (marcado «sugerido»).
 *
 *   margen de Atelier a la cafetería = (interno − costo) ÷ interno            meta 60 %
 *   margen de la sede                = (carta − interno) ÷ carta              meta 45 % (food cost de sede ~55 %)
 *   margen B2B                       = (B2B − costo) ÷ B2B                    meta 75 %
 *   producto de cafetería: margen    = (carta − costo) ÷ carta                meta 70 % (food cost 30 %)
 */

import { ArrowRight, CornerDownRight } from "lucide-react";
import { METAS, margen } from "@/lib/precios-sugeridos";

export type PrecioRuta = { valor: number; sugerido: boolean } | null;

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Nodo({ titulo, precio, m, meta, etiquetaMargen }: {
  titulo: string; precio: PrecioRuta; m: number | null; meta: number; etiquetaMargen: string;
}) {
  if (!precio) {
    return (
      <div className="min-w-0 flex-1 rounded-xl border border-dashed border-gray-200 px-3 py-2">
        <div className="text-[11px] text-gray-500">{titulo}</div>
        <div className="text-sm text-gray-400">No va</div>
      </div>
    );
  }
  const bajo = m != null && m < meta - 0.005;
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
        {titulo}
        {precio.sugerido && <span className="rounded bg-amber-50 px-1 text-[10px] font-medium text-amber-800">sugerido</span>}
      </div>
      <div className="text-base font-semibold tabular-nums text-gray-900">{soles(precio.valor)}</div>
      <div className={`text-[11px] ${bajo ? "text-amber-700" : "text-emerald-700"}`}>
        {etiquetaMargen} <b className="tabular-nums">{m == null ? "—" : `${Math.round(m * 100)}%`}</b>
        <span className="text-gray-400"> · meta {Math.round(meta * 100)}%</span>
      </div>
    </div>
  );
}

/** Producto de Atelier: costo → cafeterías → público, y costo → B2B. */
export function RutaPreciosAtelier({ costo, interno, carta, b2b }: {
  costo: number; interno: PrecioRuta; carta: PrecioRuta; b2b: PrecioRuta;
}) {
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
              meta={METAS.margenInterno} etiquetaMargen="Margen de Atelier" />
            <ArrowRight className="hidden h-4 w-4 shrink-0 text-gray-400 sm:block" />
            <Nodo titulo="Público final (carta)" precio={carta} m={carta && interno ? margen(carta.valor, interno.valor) : null}
              meta={metaSede} etiquetaMargen="Margen de la sede" />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <CornerDownRight className="hidden h-4 w-4 shrink-0 text-gray-400 sm:block" />
            <Nodo titulo="Clientes B2B" precio={b2b} m={b2b ? margen(b2b.valor, costo) : null}
              meta={METAS.margenB2B} etiquetaMargen="Margen de Atelier" />
            <div className="hidden flex-1 sm:block" />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Producto que se prepara en la cafetería: costo → público. */
export function RutaPreciosCafeteria({ costo, carta }: { costo: number; carta: PrecioRuta }) {
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
          meta={1 - METAS.foodCostCafeteria} etiquetaMargen="Margen de la sede" />
      </div>
    </section>
  );
}
