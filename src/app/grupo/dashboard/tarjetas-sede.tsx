"use client";

/**
 * Grupo → Resumen · una tarjeta por sede, VISUAL (pedido de Jahnn, 19-oct-2026): cuatro barras que se leen de
 * izquierda a derecha como la historia del mes —Ventas, Dinero que entró, Dinero que salió (costos y gastos en una
 * sola barra) y Ganancia— y debajo el termómetro del EBITDA (frágil · en camino · eficiente). El resto (mínimo
 * cubierto, de dónde entró el dinero) se abre con «Ver el detalle».
 * Cada parte de una barra apilada dice su monto al pasar el ratón o tocarla.
 * Los números: lib/tarjeta-sede.ts y lib/regla-33.ts (sobre las seis cifras). Vocabulario único: lib/vocabulario.ts.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, ArrowDownToLine, ArrowUpFromLine, Banknote, ChevronDown, CircleCheck, CircleAlert } from "lucide-react";
import { tarjetasDelMes, type TarjetaSede } from "@/lib/tarjeta-sede";
import { CONFIG_PROFIT_FIRST, EBITDA_EFICIENTE_PCT, EBITDA_FRAGIL_PCT, ETIQUETA_TERMOMETRO, reglaDeSede, type FilaRegla } from "@/lib/regla-33";
import type { SeisCifras } from "@/app/actions/seis-cifras";
import { GLOSARIO } from "@/lib/vocabulario";

/** Lo que el Resumen agrega a cada tarjeta: a dónde lleva, su etiqueta, el mínimo cubierto y el pie. */
export type ExtraSede = { href: string; flag: "atencion" | "mejor" | null; cubiertosPct?: number | null; pie: ReactNode };

const ALTO = 110;
const soles = (n: number) => `${n < 0 ? "−" : ""}S/ ${Math.round(Math.abs(n)).toLocaleString("es-PE")}`;
const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`);

const COLOR = {
  ventas: "#004C40", entroVentas: "#0284C7", entroOtras: "#7DD3FC",
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

function Barras({ t }: { t: TarjetaSede }) {
  const costos = t.costos ?? 0, gastos = t.gastos ?? 0;
  const salio = t.costos === null && t.gastos === null ? null : Math.round((costos + gastos) * 100) / 100;
  const ingresado = t.caja.ingresado ?? 0, otras = t.caja.otras;
  const entro = t.caja.total > 0 ? t.caja.total : null;
  const tope = Math.max(t.ventas ?? 0, salio ?? 0, entro ?? 0, Math.abs(t.ganancia ?? 0), 1);
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
          {etiqueta(t.ventas, "text-[#004C40]")}
          {t.ventas === null ? vacio : <div className="w-full rounded-t-md" style={{ height: h(t.ventas), background: COLOR.ventas }} />}
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
          <span className="text-[10px] leading-tight text-gray-400">lo vendido</span>
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
          <span className="text-[10px] leading-tight text-gray-400">{t.gananciaPct === null ? "después de todo" : `${pct(t.gananciaPct)} de las ventas`}</span>
        </div>
      </div>
    </>
  );
}

const TOPE_TERMOMETRO = 40;
const ZONA = { fragil: "bg-red-400", en_camino: "bg-amber-300", eficiente: "bg-emerald-500" };
const TEXTO = { fragil: "text-red-700", en_camino: "text-amber-700", eficiente: "text-emerald-700" };

/** El EBITDA como termómetro: de cada S/ 100 vendidos, cuánto queda después de costos y gastos (frágil < 10% · eficiente ≥ 30%). */
function TermometroEbitda({ fila }: { fila: FilaRegla | null }) {
  const e = fila?.ebitda ?? null;
  if (!fila || !e || !fila.termometro) {
    return <p className="mt-4 rounded-xl bg-gray-50 px-3 py-2.5 text-[11px] text-gray-400">EBITDA: todavía sin datos{fila?.sinResultadoPorque ? ` (${fila.sinResultadoPorque.toLowerCase()})` : ""}.</p>;
  }
  const t = fila.termometro;
  const marca = Math.max(0, Math.min(TOPE_TERMOMETRO, e.pct));
  const ancho = (a: number, b: number) => `${((b - a) / TOPE_TERMOMETRO) * 100}%`;
  return (
    <div className="mt-4 rounded-xl bg-gray-50 px-3 py-2.5" role="group" aria-label={`EBITDA ${pct(e.pct)}: ${ETIQUETA_TERMOMETRO[t].toLowerCase()}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-gray-500">EBITDA</span>
        <span className="text-[11px] text-gray-500">
          <b className={`text-base font-semibold tabular-nums ${TEXTO[t]}`}>{pct(e.pct)}</b>{" "}
          <span className={`font-medium ${TEXTO[t]}`}>{ETIQUETA_TERMOMETRO[t]}</span>
          {!fila.mesCompleto && <span className="text-gray-400"> · provisional</span>}
        </span>
      </div>
      <div className="relative mt-2">
        <div className="flex h-2.5 overflow-hidden rounded-full">
          <span className={ZONA.fragil} style={{ width: ancho(0, EBITDA_FRAGIL_PCT) }} />
          <span className={ZONA.en_camino} style={{ width: ancho(EBITDA_FRAGIL_PCT, EBITDA_EFICIENTE_PCT) }} />
          <span className={ZONA.eficiente} style={{ width: ancho(EBITDA_EFICIENTE_PCT, TOPE_TERMOMETRO) }} />
        </div>
        <span className="absolute -top-1 h-4.5 w-1 -translate-x-1/2 rounded-full bg-gray-900 ring-2 ring-white" style={{ left: `${(marca / TOPE_TERMOMETRO) * 100}%`, height: 18 }} aria-hidden />
      </div>
      <div className="relative mt-1 h-3 text-[10px] text-gray-400">
        <span className="absolute left-0">0%</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${(EBITDA_FRAGIL_PCT / TOPE_TERMOMETRO) * 100}%` }}>{EBITDA_FRAGIL_PCT}%</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${(EBITDA_EFICIENTE_PCT / TOPE_TERMOMETRO) * 100}%` }}>{EBITDA_EFICIENTE_PCT}%</span>
        <span className="absolute right-0">{TOPE_TERMOMETRO}%+</span>
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-gray-500">{e.pct >= 0
        ? `Por cada S/ 100 vendidos, quedan S/ ${Math.round(e.pct).toLocaleString("es-PE")} después de costos y gastos.`
        : `Por cada S/ 100 vendidos, se pierden S/ ${Math.round(-e.pct).toLocaleString("es-PE")} después de costos y gastos.`}</p>
    </div>
  );
}

/** «hasta el 13/10 · último día con Excel» (mes en curso) o «mes completo»: de qué día a qué día cuentan las barras. */
function periodoDeLaTarjeta(corte: string | null, mes: string): string | null {
  if (!corte) return null;
  const [y, m] = mes.split("-").map(Number);
  const fin = `${mes}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
  return corte >= fin ? "mes completo" : `hasta el ${corte.slice(8, 10)}/${corte.slice(5, 7)} · último día con Excel`;
}

function Tarjeta({ t, fila, extra, cajaHref, mes }: { t: TarjetaSede; fila: FilaRegla | null; extra?: ExtraSede; cajaHref: string; mes: string }) {
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
          {/* Las barras cuentan ventas, dinero y gastos hasta el MISMO día: el último con Excel (si no, la ganancia saldría inflada). */}
          {periodo && <p className="mt-0.5 text-[11px] text-gray-500">{periodo}</p>}
          <Barras t={t} />
          {t.porque && <p className="mt-2 text-xs text-gray-500">Sin ganancia todavía: {t.porque.toLowerCase()}.</p>}
          <TermometroEbitda fila={fila} />

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
export function TarjetasSede({ cifras, periodo, extras, cajaHref }: { cifras: SeisCifras | null; periodo: string; extras?: Record<number, ExtraSede>; cajaHref: string }) {
  const tarjetas = cifras ? tarjetasDelMes(cifras.sedes) : [];
  if (tarjetas.length === 0 || !cifras) return <p className="text-sm text-gray-500">No se pudieron calcular las cifras de {periodo}.</p>;
  const cfg = cifras.config ?? CONFIG_PROFIT_FIRST;
  const filas = new Map(cifras.sedes.map((s) => [s.businessId, reglaDeSede(s, cfg)]));
  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">{tarjetas.map((t) => <Tarjeta key={t.businessId} t={t} fila={filas.get(t.businessId) ?? null} extra={extras?.[t.businessId]} cajaHref={cajaHref} mes={cifras.mes} />)}</div>
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
