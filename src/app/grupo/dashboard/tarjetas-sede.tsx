"use client";

/**
 * Grupo → Resumen · una tarjeta por sede, VISUAL (pedido de Jahnn, 19-oct-2026): cuatro barras que se leen de
 * izquierda a derecha como la historia del mes —Ventas, Dinero que entró, Dinero que salió (costos y gastos en una
 * sola barra) y Ganancia— y debajo «De cada S/ 100 que vendes» (29-oct-2026: la regla 33-33-33 y Profit First, con el EBITDA
 * estimado mientras el mes está abierto; lib/cada-100.ts). El resto (mínimo cubierto, de dónde entró el dinero) se abre
 * con «Ver el detalle».
 * Cada parte de una barra apilada dice su monto al pasar el ratón o tocarla.
 * Los números: lib/tarjeta-sede.ts y lib/regla-33.ts (sobre las seis cifras). Vocabulario único: lib/vocabulario.ts.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, ArrowDownToLine, ArrowUpFromLine, Banknote, ChevronDown, CircleCheck, CircleAlert } from "lucide-react";
import { tarjetasDelMes, type TarjetaSede } from "@/lib/tarjeta-sede";
import { cada100DelMes, type Cada100, type Cada100Mes } from "@/lib/cada-100";
import { CadaCien } from "./cada-100";
import type { SeisCifras } from "@/app/actions/seis-cifras";
import { GLOSARIO } from "@/lib/vocabulario";

/** Lo que el Resumen agrega a cada tarjeta: a dónde lleva, su etiqueta, el mínimo cubierto y el pie. */
export type ExtraSede = { href: string; flag: "atencion" | "mejor" | null; cubiertosPct?: number | null; pie: ReactNode; /** Último día con venta cargada: la fecha pequeña bajo «Ventas». */ ventasHasta?: string | null };

const ALTO = 110;
const soles = (n: number) => `${n < 0 ? "−" : ""}S/ ${Math.round(Math.abs(n)).toLocaleString("es-PE")}`;
const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`);

const COLOR = {
  ventas: "#004C40", ventasPosterior: "#5E9C8F", entroVentas: "#0284C7", entroOtras: "#7DD3FC",
  costos: "#F2A56B", gastos: "#A78BFA", ganancia: "#D9A441", perdida: "#DC2626",
};

/** Una parte de la barra: al pasar el ratón (o tocarla en el celular) muestra su nombre y monto. */
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

function Barras({ t, ventasHasta, estimado }: { t: TarjetaSede; ventasHasta?: string | null; estimado?: boolean }) {
  const costos = t.costos ?? 0, gastos = t.gastos ?? 0;
  const salio = t.costos === null && t.gastos === null ? null : Math.round((costos + gastos) * 100) / 100;
  const ingresado = t.caja.ingresado ?? 0, otras = t.caja.otras;
  const entro = t.caja.total > 0 ? t.caja.total : null;
  // «Ventas» = lo vendido hasta el último día con venta cargada: la parte oscura llega hasta el corte del Excel (comparable con
  // lo que salió y la ganancia) y la clara son los días que el Excel todavía no cubre.
  const hastaCorte = t.ventas ?? 0, despues = t.ventasPosteriores;
  const ventasTotal = t.ventas === null && despues <= 0 ? null : Math.round((hastaCorte + despues) * 100) / 100;
  const tope = Math.max(ventasTotal ?? 0, salio ?? 0, entro ?? 0, Math.abs(t.ganancia ?? 0), 1);
  const h = (v: number) => Math.max(Math.round((Math.abs(v) / tope) * ALTO), v !== 0 ? 4 : 0);
  const neg = t.ganancia !== null && t.ganancia < 0;
  const etiqueta = (v: number | null, cls: string) => (
    <span className={`mb-1 text-[11px] sm:text-[12px] font-semibold tabular-nums whitespace-nowrap ${cls}`}>{v === null ? "—" : soles(v)}</span>
  );
  const vacio = <div className="w-full rounded-t-md border border-dashed border-gray-300" style={{ height: 20 }} />;
  const col = "flex h-full min-w-0 flex-col items-center justify-end";
  const pie = "flex min-w-0 flex-col items-center gap-0.5 text-center";
  return (
    <>
      <div className="mt-4 grid grid-cols-4 gap-2 items-end" style={{ height: ALTO + 28 }}>
        <div className={col}>
          {etiqueta(ventasTotal, "text-[#004C40]")}
          {ventasTotal === null ? vacio : (
            <div className="flex w-full flex-col">
              {despues > 0 && <Segmento alto={h(despues)} color={COLOR.ventasPosterior} nombre="Ventas más recientes" monto={despues} ayuda="días que el Excel aún no cubre" arriba />}
              <Segmento alto={h(hastaCorte)} color={COLOR.ventas} nombre="Ventas hasta el corte" monto={hastaCorte} ayuda="comparables con costos y gastos" arriba={despues <= 0} />
            </div>
          )}
        </div>
        {/* Dinero que entró: lo que llegó por ventas y lo que llegó por otros motivos, en una barra. */}
        <div className={col}>
          {etiqueta(entro, "text-sky-700")}
          {entro === null ? vacio : (
            <div className="flex w-full flex-col">
              {otras > 0 && <Segmento alto={h(otras)} color={COLOR.entroOtras} nombre="Otras entradas" monto={otras} ayuda="préstamos, devoluciones, otros" arriba />}
              <Segmento alto={h(ingresado)} color={COLOR.entroVentas} nombre="Por ventas" monto={ingresado} ayuda="lo que llegó a la cuenta" arriba={otras <= 0} />
            </div>
          )}
        </div>
        {/* Dinero que salió: costos y gastos en UNA barra; cada parte dice su monto. */}
        <div className={col}>
          {etiqueta(salio, "text-gray-700")}
          {salio === null ? vacio : (
            <div className="flex w-full flex-col">
              <Segmento alto={h(gastos)} color={COLOR.gastos} nombre="Gastos" monto={gastos} ayuda="fijos del mes" arriba />
              <Segmento alto={h(costos)} color={COLOR.costos} nombre="Costos" monto={costos} ayuda="suben con la venta" arriba={gastos === 0} />
            </div>
          )}
        </div>
        <div className={col}>
          {etiqueta(t.ganancia, neg ? "text-red-600" : "text-[#A7771B]")}
          {t.ganancia === null ? vacio : <div className="w-full rounded-t-md" style={{ height: neg ? 6 : h(t.ganancia), background: neg ? COLOR.perdida : COLOR.ganancia }} />}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 border-t border-gray-300 pt-2">
        <div className={pie}>
          <Banknote className="h-4 w-4" style={{ color: COLOR.ventas }} aria-hidden />
          <span className="text-[11px] font-medium leading-tight text-gray-800">Ventas</span>
          <span className="text-[10px] leading-tight text-gray-400">{ventasHasta ? `al ${ventasHasta.slice(8, 10)}/${ventasHasta.slice(5, 7)}` : "lo vendido"}</span>
        </div>
        <div className={pie}>
          <ArrowDownToLine className="h-4 w-4" style={{ color: COLOR.entroVentas }} aria-hidden />
          <span className="text-[11px] font-medium leading-tight text-gray-800">Dinero que entró</span>
          <span className="text-[10px] leading-tight text-gray-400">a la cuenta</span>
        </div>
        <div className={pie}>
          <ArrowUpFromLine className="h-4 w-4 text-gray-500" aria-hidden />
          <span className="text-[11px] font-medium leading-tight text-gray-800">Dinero que salió</span>
          <span className="flex flex-wrap justify-center gap-x-1.5 text-[10px] leading-tight text-gray-500">
            <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm" style={{ background: COLOR.costos }} />costos</span>
            <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm" style={{ background: COLOR.gastos }} />gastos</span>
          </span>
        </div>
        <div className={pie}>
          {neg ? <CircleAlert className="h-4 w-4 text-red-600" aria-hidden /> : <CircleCheck className="h-4 w-4" style={{ color: COLOR.ganancia }} aria-hidden />}
          <span className="text-[11px] font-medium leading-tight text-gray-800">Ganancia</span>
          {/* Mes abierto: el % a la fecha sale inflado (faltan la planilla y el alquiler); la estimación está abajo, en «De cada S/ 100». */}
          <span className="text-[10px] leading-tight text-gray-400">{t.gananciaPct === null ? "después de todo" : estimado ? "a la fecha · faltan pagos de fin de mes" : `${pct(t.gananciaPct)} de las ventas`}</span>
        </div>
      </div>
    </>
  );
}

/** «hasta el 13/10 · último día con Excel» (mes en curso) o «mes completo»: hasta qué día cuentan el dinero, los costos y la ganancia. */
function periodoDeLaTarjeta(corte: string | null, mes: string): string | null {
  if (!corte) return null;
  const [y, m] = mes.split("-").map(Number);
  const fin = `${mes}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
  return corte >= fin ? "mes completo" : `Dinero, costos y ganancia hasta el ${corte.slice(8, 10)}/${corte.slice(5, 7)} · último día con Excel`;
}

function Tarjeta({ t, cada, extra, cajaHref, mes }: { t: TarjetaSede; cada: Cada100 | null; extra?: ExtraSede; cajaHref: string; mes: string }) {
  const sinNada = t.ventas === null || t.ventas <= 0;
  const periodo = periodoDeLaTarjeta(t.corte, mes);
  const cubiertos = extra?.cubiertosPct ?? null;
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
          {/* Dinero, costos y ganancia se cuentan hasta el último día con Excel (si no, la ganancia saldría inflada); las ventas llegan
              hasta el último día cargado y la parte clara de su barra es lo que el Excel todavía no cubre. */}
          {periodo && <p className="mt-0.5 text-[11px] text-gray-500">{periodo}</p>}
          <Barras t={t} ventasHasta={extra?.ventasHasta ?? null} estimado={cada?.modo === "estimado"} />
          {t.porque && <p className="mt-2 text-xs text-gray-500">Sin ganancia todavía: {t.porque.toLowerCase()}.</p>}
          {t.extraordinario > 0 && t.ganancia !== null && (
            <p className="mt-2 text-[11px] leading-snug text-gray-500">
              Incluye <b className="text-gray-700">{soles(t.extraordinario)}</b> de gasto extraordinario (reparaciones grandes). Sin él, la ganancia sería <b className="text-gray-700">{soles(t.ganancia + t.extraordinario)}</b>.
            </p>
          )}
          {cada && <CadaCien c={cada} />}

          {/* El detalle, solo si se pide (divulgación progresiva). */}
          <details className="group mt-3 border-t border-gray-100 pt-3">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-primary hover:underline [&::-webkit-details-marker]:hidden">
              Ver el detalle <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <dl className="mt-3 space-y-1 text-xs text-gray-600">
              <div className="flex justify-between gap-2"><dt>Mínimo cubierto</dt><dd className={`tabular-nums ${cubiertos !== null && cubiertos < 100 ? "font-semibold text-red-700" : ""}`}>{cubiertos === null ? "—" : `${cubiertos}%`}</dd></div>
              <div className="flex justify-between gap-2"><dt>Dinero que entró por ventas</dt><dd className="tabular-nums">{t.caja.ingresado === null ? "—" : soles(t.caja.ingresado)}</dd></div>
              <div className="flex justify-between gap-2"><dt>Otras entradas</dt><dd className="tabular-nums">{soles(t.caja.otras)}</dd></div>
              {t.impuestos >= 1 && <div className="flex justify-between gap-2"><dt>Impuestos (ya restados de la ganancia)</dt><dd className="tabular-nums">{soles(t.impuestos)}</dd></div>}
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
export function TarjetasSede({ cifras, periodo, extras, cajaHref, cada }: {
  cifras: SeisCifras | null; periodo: string; extras?: Record<number, ExtraSede>; cajaHref: string;
  /** «De cada S/ 100» ya calculado (con los fijos esperados del mes abierto). Sin él, se calcula con lo real. */
  cada?: Cada100Mes | null;
}) {
  const tarjetas = cifras ? tarjetasDelMes(cifras.sedes) : [];
  if (tarjetas.length === 0 || !cifras) return <p className="text-sm text-gray-500">No se pudieron calcular las cifras de {periodo}.</p>;
  const c100 = cada ?? cada100DelMes(cifras);
  return (
    <>
      {/* El Grupo primero: de cada S/ 100 que vende, dónde se queda y dónde se fuga. */}
      {c100.grupo.modo !== "sin-datos" && (
        <div className="mb-4 max-w-2xl rounded-2xl border border-gray-200/80 bg-white p-4 sm:p-5">
          <h4 className="text-base font-semibold text-gray-900">Grupo</h4>
          <CadaCien c={c100.grupo} />
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">{tarjetas.map((t) => <Tarjeta key={t.businessId} t={t} cada={c100.sedes[t.businessId] ?? null} extra={extras?.[t.businessId]} cajaHref={cajaHref} mes={cifras.mes} />)}</div>
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
