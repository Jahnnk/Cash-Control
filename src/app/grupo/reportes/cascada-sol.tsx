"use client";

/**
 * Reportes · «Del sol vendido a la utilidad» (Fase 2, pedido de Jahnn, 23-oct-2026). Sus puntos 2 a 7 en una sola cascada:
 * Ventas → − costos variables → − costos fijos → = EBITDA (el termómetro, contra la regla 33-33-33) → − impuestos → = ganancia,
 * y debajo qué se hace con el EBITDA: 25% de la venta para la utilidad (Profit First) y el resto para impuestos y ahorro.
 * No calcula nada propio: sale de las seis cifras, lib/regla-33.ts (regla33, profitFirst).
 */

import { useState } from "react";
import { PastelRegla } from "@/components/pastel-regla";
import { Segmentado } from "@/components/productos/ui";
import { ETIQUETA_TERMOMETRO, profitFirst, regla33 } from "@/lib/regla-33";
import type { SeisCifras } from "@/app/actions/seis-cifras";

const soles = (n: number) => `${n < 0 ? "−" : ""}S/ ${Math.round(Math.abs(n)).toLocaleString("es-PE")}`;
const pct = (n: number) => `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`;
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const TONO_TERMOMETRO = { fragil: "bg-red-50 text-red-700 ring-red-200", en_camino: "bg-amber-50 text-amber-800 ring-amber-200", eficiente: "bg-emerald-50 text-emerald-800 ring-emerald-200" };

type Paso = { nombre: string; ayuda: string; monto: number; desde: number; hasta: number; color: string; pctVenta: number | null; meta?: number; mejorSiMenor?: boolean; total?: boolean };

/** Una fila de la cascada: la barra va de `desde` a `hasta` sobre la escala de la venta. */
function Fila({ p, escala }: { p: Paso; escala: number }) {
  const izq = (Math.min(p.desde, p.hasta) / escala) * 100;
  const ancho = Math.max((Math.abs(p.hasta - p.desde) / escala) * 100, p.monto !== 0 ? 0.8 : 0);
  const fuera = p.meta !== undefined && p.pctVenta !== null && (p.mejorSiMenor ? p.pctVenta > p.meta + 0.05 : p.pctVenta < p.meta - 0.05);
  return (
    <div className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-1.5 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_7rem_7.5rem]">
      <div className="min-w-0">
        <div className={`text-sm leading-tight ${p.total ? "font-semibold text-gray-900" : "text-gray-700"}`}>{p.nombre}</div>
        <div className="text-[10px] leading-tight text-gray-400">{p.ayuda}</div>
      </div>
      <div className="relative h-5 rounded bg-gray-50">
        <div className="absolute inset-y-0 rounded" style={{ left: `${Math.max(0, izq)}%`, width: `${Math.min(100, ancho)}%`, background: p.color }} />
      </div>
      <div className={`text-right text-sm tabular-nums ${p.total ? "font-semibold" : ""} ${p.monto < 0 && p.total ? "text-red-700" : "text-gray-900"}`}>{soles(p.monto)}</div>
      <div className="col-span-3 -mt-1 text-right text-[11px] tabular-nums text-gray-500 sm:col-span-1 sm:mt-0">
        {p.pctVenta !== null && <span className={fuera ? "font-semibold text-amber-700" : ""}>{pct(Math.abs(p.pctVenta))}</span>}
        {p.meta !== undefined && <span className="text-gray-400"> · meta {Math.round(p.meta)}%</span>}
      </div>
    </div>
  );
}

export function CascadaSol({ cifras, periodo }: { cifras: SeisCifras | null; periodo: string }) {
  const [vista, setVista] = useState("Grupo");
  if (!cifras) return null;
  const reglas = regla33(cifras);
  const pf = profitFirst(cifras);
  const opciones = [...reglas.filter((r) => r.esGrupo), ...reglas.filter((r) => !r.esGrupo)];
  const fila = opciones.find((r) => r.etiqueta === vista) ?? opciones[0];
  const p = pf.find((x) => x.etiqueta === fila.etiqueta);
  const sede = fila.esGrupo ? null : cifras.sedes.find((s) => s.sede === fila.etiqueta) ?? null;
  const impuestos = fila.esGrupo ? cifras.grupo.impuestos : sede?.impuestos ?? 0;
  const extraordinario = fila.esGrupo ? cifras.grupo.extraordinario : sede?.extraordinario?.total ?? 0;

  const titulo = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-[15px] font-semibold text-gray-900">Del sol vendido a la utilidad <span className="font-normal text-gray-500">· {periodo}</span></h2>
        <p className="mt-0.5 text-xs text-gray-500">Qué pasa con cada sol vendido, contra la regla 33-33-33 y Profit First.</p>
      </div>
      <Segmentado tamano="sm" valor={fila.etiqueta} onChange={setVista} opciones={opciones.map((o) => ({ valor: o.etiqueta, etiqueta: o.etiqueta }))} />
    </div>
  );

  if (!fila.ebitda || !fila.costos || !fila.fijos || !fila.ventas) {
    return (
      <section className="space-y-3 rounded-2xl border border-gray-200/80 bg-white px-4 py-4 sm:px-6 sm:py-5">
        {titulo}
        <p className="text-sm text-gray-500">{fila.etiqueta}: {fila.sinResultadoPorque ?? "sin datos"}. Todavía no hay resultado de {periodo}.</p>
      </section>
    );
  }

  const V = fila.ventas, C = fila.costos.monto, F = fila.fijos.monto, E = fila.ebitda.monto;
  const G = E - impuestos;
  const escala = Math.max(V, C + F);
  const pasos: Paso[] = [
    { nombre: "Ventas", ayuda: "lo vendido (Byte)", monto: V, desde: 0, hasta: V, color: "#004C40", pctVenta: 100, total: true },
    { nombre: "− Costos variables", ayuda: "insumos, productos de Atelier, empaques", monto: -C, desde: V, hasta: V - C, color: "#F2A56B", pctVenta: fila.costos.pct, meta: fila.costos.metaPct, mejorSiMenor: true },
    { nombre: "− Costos fijos", ayuda: "planilla, alquiler, servicios…", monto: -F, desde: V - C, hasta: E, color: "#94A3B8", pctVenta: fila.fijos.pct, meta: fila.fijos.metaPct, mejorSiMenor: true },
    { nombre: "= EBITDA", ayuda: "lo que deja la operación", monto: E, desde: 0, hasta: E, color: E < 0 ? "#DC2626" : "#059669", pctVenta: fila.ebitda.pct, meta: fila.ebitda.metaPct, total: true },
    { nombre: "− Impuestos", ayuda: "IR del mes", monto: -impuestos, desde: E, hasta: G, color: "#CBD5E1", pctVenta: V > 0 ? (impuestos / V) * 100 : null },
    { nombre: "= Ganancia real", ayuda: "después de todo", monto: G, desde: 0, hasta: G, color: G < 0 ? "#DC2626" : "#D9A441", pctVenta: V > 0 ? (G / V) * 100 : null, total: true },
  ];
  const t = fila.termometro;

  return (
    <section className="space-y-4 rounded-2xl border border-gray-200/80 bg-white px-4 py-4 sm:px-6 sm:py-5" aria-label="Del sol vendido a la utilidad">
      {titulo}
      {!fila.mesCompleto && fila.corte && (
        <p className="text-[11px] text-amber-700">Mes a medias: llega hasta el {dm(fila.corte)} (último día con Excel). La planilla y el alquiler se pagan a fin de mes: todavía no es el resultado del mes.</p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="min-w-0 divide-y divide-gray-50">
          {pasos.map((x) => <Fila key={x.nombre} p={x} escala={escala} />)}
        </div>
        <div className="flex flex-col items-center gap-2 rounded-xl bg-gray-50 px-3 py-4 text-center">
          <PastelRegla f={fila} className="h-32 w-32" />
          {t && <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONO_TERMOMETRO[t]}`}>EBITDA {pct(fila.ebitda.pct)} · {ETIQUETA_TERMOMETRO[t]}</span>}
          <p className="text-[11px] leading-snug text-gray-500">Anillo de afuera: cómo se repartió cada sol. De adentro: la regla (un tercio cada uno). Menos de 10% es frágil; 30% o más, eficiente.</p>
        </div>
      </div>

      {extraordinario > 0 && (
        <p className="text-[11px] text-gray-500">Los costos fijos incluyen {soles(extraordinario)} de gasto extraordinario (reparaciones grandes). Sin él, el EBITDA sería {soles(E + extraordinario)}.</p>
      )}

      {/* Qué se hace con el EBITDA: la utilidad primero (Profit First) y el resto para impuestos y ahorro. */}
      {p && p.meta !== null && (
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-100 px-3 py-2.5">
            <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Utilidad · Profit First</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-gray-900">{soles(p.meta)}</div>
            <div className="text-[11px] text-gray-500">el {Math.round(p.utilidadPct)}% de la venta, a separar primero</div>
          </div>
          <div className="rounded-xl border border-gray-100 px-3 py-2.5">
            <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Separado de verdad</div>
            <div className={`mt-1 text-lg font-semibold tabular-nums ${p.estado === "cumple" ? "text-emerald-700" : p.estado === "parcial" ? "text-amber-700" : "text-red-700"}`}>{soles(p.apartado?.neto ?? 0)}</div>
            <div className="text-[11px] text-gray-500">{p.estado === "cumple" ? "se cumplió" : `faltó separar ${soles(p.falta ?? 0)}`} · fondos mutuos y utilidades</div>
          </div>
          <div className="rounded-xl border border-gray-100 px-3 py-2.5">
            <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Para impuestos y ahorro</div>
            {E >= p.meta ? (
              <>
                <div className="mt-1 text-lg font-semibold tabular-nums text-gray-900">{soles(E - p.meta)}</div>
                <div className="text-[11px] text-gray-500">lo que queda del EBITDA tras la utilidad (meta {pct(p.restoPct)} de la venta)</div>
              </>
            ) : (
              <>
                <div className="mt-1 text-lg font-semibold tabular-nums text-red-700">{soles(E - p.meta)}</div>
                <div className="text-[11px] text-gray-500">el EBITDA no alcanza para la utilidad: hay que bajar costos</div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
