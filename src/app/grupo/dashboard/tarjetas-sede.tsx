"use client";

/**
 * Grupo → Resumen · una tarjeta por sede. Divulgación progresiva (19-oct-2026): a primera vista solo lo que un
 * dueño mira cada día (Ventas, Ganancia, Plata que entró y el Mínimo cubierto); las barras de ventas → costos y
 * gastos → ganancia y el desglose de la plata se abren con «Ver el detalle». Costos y gastos van en UNA barra
 * apilada (17-oct-2026): el total arriba y cada parte con su monto al pasar el ratón.
 * Los números: lib/tarjeta-sede.ts (sobre las seis cifras). Vocabulario único: lib/vocabulario.ts.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, Banknote, Building2, ChevronDown, CircleCheck, CircleAlert, Package } from "lucide-react";
import { tarjetasDelMes, type TarjetaSede } from "@/lib/tarjeta-sede";
import type { SeisCifras } from "@/app/actions/seis-cifras";
import { GLOSARIO } from "@/lib/vocabulario";

/** Lo que el Resumen agrega a cada tarjeta: a dónde lleva, su etiqueta, los costos cubiertos y el pie. */
export type ExtraSede = { href: string; flag: "atencion" | "mejor" | null; cubiertosPct?: number | null; pie: ReactNode };

const ALTO = 110;
const soles = (n: number) => `${n < 0 ? "−" : ""}S/ ${Math.round(Math.abs(n)).toLocaleString("es-PE")}`;
const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`);

const COLOR = { ventas: "#004C40", costos: "#F2A56B", gastos: "#A78BFA", ganancia: "#D9A441", perdida: "#DC2626" };

/** Una parte de la barra apilada: al pasar el ratón (o tocarla en el celular) muestra su nombre y monto. */
function Segmento({ alto, color, nombre, monto, ayuda, arriba }: { alto: number; color: string; nombre: string; monto: number; ayuda: string; arriba?: boolean }) {
  return (
    <button type="button" className="group/seg relative block w-full focus:outline-none" style={{ height: alto }} aria-label={`${nombre}: ${soles(monto)}`}>
      <span className={`block h-full w-full transition-opacity group-hover/seg:opacity-80 group-focus/seg:opacity-80 ${arriba ? "rounded-t-md" : ""}`} style={{ background: color }} />
      <span role="tooltip" className="pointer-events-none absolute left-1/2 top-1/2 z-20 hidden -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-2 py-1 text-center text-[11px] leading-tight text-white shadow-lg group-hover/seg:block group-focus/seg:block">
        <b className="block tabular-nums">{soles(monto)}</b>
        {nombre}<span className="block text-[10px] text-gray-300">{ayuda}</span>
      </span>
    </button>
  );
}

function Barras({ t }: { t: TarjetaSede }) {
  const costos = t.costos ?? 0, gastos = t.gastos ?? 0;
  const salidas = t.costos === null && t.gastos === null ? null : Math.round((costos + gastos) * 100) / 100;
  const tope = Math.max(t.ventas ?? 0, salidas ?? 0, Math.abs(t.ganancia ?? 0), 1);
  const h = (v: number) => Math.max(Math.round((Math.abs(v) / tope) * ALTO), v !== 0 ? 4 : 0);
  const neg = t.ganancia !== null && t.ganancia < 0;
  const etiqueta = (v: number | null, cls: string) => (
    <span className={`mb-1 text-[12px] sm:text-[13px] font-semibold tabular-nums whitespace-nowrap ${cls}`}>{v === null ? "—" : soles(v)}</span>
  );
  const vacio = <div className="w-full rounded-t-md border border-dashed border-gray-300" style={{ height: 20 }} />;
  return (
    <>
      <div className="mt-4 grid grid-cols-3 gap-3 items-end" style={{ height: ALTO + 28 }}>
        <div className="flex h-full min-w-0 flex-col items-center justify-end">
          {etiqueta(t.ventas, "text-[#004C40]")}
          {t.ventas === null ? vacio : <div className="w-full rounded-t-md" style={{ height: h(t.ventas), background: COLOR.ventas }} />}
        </div>
        {/* Costos y gastos en UNA barra (pedido de Jahnn, 17-oct-2026): el total arriba; cada parte dice su monto al pasar el ratón. */}
        <div className="flex h-full min-w-0 flex-col items-center justify-end">
          {etiqueta(salidas, "text-gray-700")}
          {salidas === null ? vacio : (
            <div className="flex w-full flex-col">
              <Segmento alto={h(gastos)} color={COLOR.gastos} nombre="Gastos" monto={gastos} ayuda="fijos del mes" arriba />
              <Segmento alto={h(costos)} color={COLOR.costos} nombre="Costos" monto={costos} ayuda="suben con la venta" arriba={gastos === 0} />
            </div>
          )}
        </div>
        <div className="flex h-full min-w-0 flex-col items-center justify-end">
          {etiqueta(t.ganancia, neg ? "text-red-600" : "text-[#A7771B]")}
          {t.ganancia === null ? vacio : <div className="w-full rounded-t-md" style={{ height: neg ? 6 : h(t.ganancia), background: neg ? COLOR.perdida : COLOR.ganancia }} />}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 border-t border-gray-300 pt-2">
        <div className="flex min-w-0 flex-col items-center gap-0.5 text-center">
          <Banknote className="h-4 w-4" style={{ color: COLOR.ventas }} aria-hidden />
          <span className="text-[11px] font-medium leading-tight text-gray-800">Ventas</span>
          <span className="text-[10px] leading-tight text-gray-400">lo vendido (Byte)</span>
        </div>
        <div className="flex min-w-0 flex-col items-center gap-0.5 text-center">
          <span className="flex items-center gap-1"><Package className="h-4 w-4" style={{ color: COLOR.costos }} aria-hidden /><Building2 className="h-4 w-4" style={{ color: COLOR.gastos }} aria-hidden /></span>
          <span className="text-[11px] font-medium leading-tight text-gray-800">Costos y gastos</span>
          <span className="flex flex-wrap justify-center gap-x-2 text-[10px] leading-tight text-gray-500">
            <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm" style={{ background: COLOR.costos }} />costos</span>
            <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm" style={{ background: COLOR.gastos }} />gastos</span>
          </span>
        </div>
        <div className="flex min-w-0 flex-col items-center gap-0.5 text-center">
          {neg ? <CircleAlert className="h-4 w-4 text-red-600" aria-hidden /> : <CircleCheck className="h-4 w-4" style={{ color: COLOR.ganancia }} aria-hidden />}
          <span className="text-[11px] font-medium leading-tight text-gray-800">Ganancia</span>
          <span className="text-[10px] leading-tight text-gray-400">después de todo</span>
        </div>
      </div>
    </>
  );
}

function Grande({ nombre, valor, sub, tono }: { nombre: string; valor: string; sub?: ReactNode; tono?: "mal" | "bien" }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{nombre}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums leading-none ${tono === "mal" ? "text-red-600" : tono === "bien" ? "text-emerald-700" : "text-gray-900"}`}>{valor}</div>
      {sub && <div className="mt-1 text-[11px] leading-snug text-gray-500">{sub}</div>}
    </div>
  );
}

function Tarjeta({ t, extra, cajaHref }: { t: TarjetaSede; extra?: ExtraSede; cajaHref: string }) {
  const sinNada = t.ventas === null || t.ventas <= 0;
  const cubiertos = extra?.cubiertosPct ?? null;
  const pierde = t.ganancia !== null && t.ganancia < 0;
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-gray-200/80 bg-white p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2">
        {extra ? (
          <Link href={extra.href} className="group inline-flex items-center gap-1 text-base font-semibold text-gray-900 hover:text-primary">
            {t.sede}<ArrowUpRight className="h-4 w-4 text-gray-300 group-hover:text-primary" aria-hidden />
          </Link>
        ) : <h4 className="text-base font-semibold text-gray-900">{t.sede}</h4>}
        {extra?.flag === "mejor" && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Mejor rendimiento</span>}
        {extra?.flag === "atencion" && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">Atención</span>}
      </div>

      {sinNada ? <p className="mt-6 mb-2 text-sm text-gray-400">Sin ventas cargadas.</p> : (
        <>
          {/* Lo de cada día: cuatro datos y nada más. */}
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
            <Grande nombre="Ventas" valor={soles(t.ventas!)} />
            <Grande nombre="Ganancia" valor={t.ganancia === null ? "—" : soles(t.ganancia)} tono={t.ganancia === null ? undefined : pierde ? "mal" : "bien"}
              sub={t.ganancia === null ? (t.porque ? `Todavía no: ${t.porque.toLowerCase()}` : undefined) : `${pct(t.gananciaPct)} de las ventas`} />
            <Grande nombre="Plata que entró" valor={soles(t.caja.total)} />
            <Grande nombre="Mínimo cubierto" valor={cubiertos === null ? "—" : `${cubiertos}%`} tono={cubiertos !== null && cubiertos < 100 ? "mal" : undefined}
              sub={cubiertos === null ? undefined : cubiertos >= 100 ? "ya no se pierde" : "falta para no perder"} />
          </div>

          {/* El detalle, solo si se pide (divulgación progresiva). */}
          <details className="group mt-4 border-t border-gray-100 pt-3">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-primary hover:underline [&::-webkit-details-marker]:hidden">
              Ver el detalle <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <Barras t={t} />
            {t.impuestos >= 1 && <p className="mt-2 text-[11px] text-gray-400">La ganancia también resta {soles(t.impuestos)} de impuestos.</p>}
            <dl className="mt-3 space-y-1 text-xs text-gray-600">
              <div className="flex justify-between gap-2"><dt>Plata por ventas</dt><dd className="tabular-nums">{t.caja.ingresado === null ? "—" : soles(t.caja.ingresado)}</dd></div>
              <div className="flex justify-between gap-2"><dt>Otras entradas</dt><dd className="tabular-nums">{soles(t.caja.otras)}</dd></div>
            </dl>
            <Link href={cajaHref} className="mt-3 inline-flex items-center gap-0.5 text-[11px] font-medium text-primary hover:underline">Ver el cuadre en Reportes →</Link>
          </details>
        </>
      )}
      {extra?.pie && <div className="mt-3 border-t border-gray-100 pt-2.5 text-[11px] leading-relaxed text-gray-500">{extra.pie}</div>}
    </div>
  );
}

/** Las tres tarjetas de sede. `cajaHref`: a dónde lleva «Ver el cuadre» (la conciliación en Reportes). */
export function TarjetasSede({ cifras, periodo, extras, cajaHref }: { cifras: SeisCifras | null; periodo: string; extras?: Record<number, ExtraSede>; cajaHref: string }) {
  const tarjetas = cifras ? tarjetasDelMes(cifras.sedes) : [];
  if (tarjetas.length === 0) return <p className="text-sm text-gray-500">No se pudieron calcular las cifras de {periodo}.</p>;
  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">{tarjetas.map((t) => <Tarjeta key={t.businessId} t={t} extra={extras?.[t.businessId]} cajaHref={cajaHref} />)}</div>
      <details className="group mt-3">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-800 [&::-webkit-details-marker]:hidden">
          ¿Qué significa cada palabra? <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-gray-500">
          {GLOSARIO.map((g) => <li key={g.palabra}><b className="font-semibold text-gray-700">{g.palabra}</b> · {g.significa}</li>)}
        </ul>
      </details>
    </>
  );
}
