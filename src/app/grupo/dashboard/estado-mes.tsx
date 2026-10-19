"use client";

/**
 * «¿Cómo vamos este mes?» — la cabecera del Resumen rediseñado (UX, 8-oct-2026).
 *
 * Una sola cifra de ventas (la de Byte, la misma de las tarjetas de sede), su meta y el ritmo.
 * Debajo, tres números de apoyo que responden lo siguiente que uno se pregunta: ¿hay plata?,
 * ¿cubrimos los costos?, ¿estamos ganando? Nada más: el detalle vive plegado más abajo.
 */

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Delta } from "./executive-hero";
import { PastelRegla, PARTES } from "@/components/pastel-regla";
import { Segmentado } from "@/components/productos/ui";
import { ETIQUETA_TERMOMETRO, type FilaRegla } from "@/lib/regla-33";

const soles = (n: number) => `S/${Math.round(Math.abs(n)).toLocaleString("es-PE")}`;

export type EstadoMesProps = {
  periodo: string;
  enCurso: boolean;
  /** Día del mes con datos (mes en curso) y días que tiene el mes. */
  dia: number;
  diasDelMes: number;
  ventas: number;
  /** Hasta qué día llegan las ventas («vendido en las 3 sedes hasta el 18/10»); null = no se dice (mes cerrado). */
  hasta?: string | null;
  deltaPct: number | null;
  /** Meta del mes: suma de la venta esperada de los presupuestos aprobados (null = no hay). */
  meta: number | null;
  /** Al ritmo actual, en cuánto cerraría el mes (solo en curso). */
  proyeccion: number | null;
  liquidez: number | null;
  equilibrio: { texto: string; detalle: string; tono: "bien" | "ojo" | "mal" | "neutro" };
  ganancia: { valor: number | null; detalle: string };
  flujo: number | null;
  /** A dónde lleva tocar la liquidez (el detalle de banco y efectivo por sede). */
  liquidezHref?: string;
  /** Qué se vendió: «vendido en las 3 sedes» (Grupo) o «vendido en Fonavi» (sede). */
  etiquetaVentas?: string;
  /** Detalle de la liquidez («Banco + caja hoy, las 3 sedes»). */
  detalleLiquidez?: string;
  /**
   * La regla 33-33-33 con un pastel por cada opción (Grupo y cada sede): se escoge cuál ver. Lleva a
   * Reportes, donde están todas juntas y donde se ajusta la meta. null = aún sin resultado.
   */
  regla?: { href: string; opciones: { etiqueta: string; fila: FilaRegla; /** «El motor que más frena: …» (los cuatro motores del EBITDA). */ frena?: string | null }[] } | null;
};

const TONO = { bien: "text-emerald-700", ojo: "text-amber-700", mal: "text-red-700", neutro: "text-gray-900" };

function Dato({ titulo, valor, detalle, tono = "neutro", href }: { titulo: string; valor: ReactNode; detalle: string; tono?: keyof typeof TONO; href?: string }) {
  const cuerpo = (
    <>
      <div className="text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-gray-500">{titulo}</div>
      <div className={`text-base sm:text-xl font-semibold tabular-nums mt-1 leading-tight ${TONO[tono]}`}>{valor}</div>
      <div className="text-[11px] sm:text-xs text-gray-500 mt-1 leading-snug">{detalle}</div>
    </>
  );
  return href
    ? <Link href={href} className="block text-left min-w-0 rounded-lg -m-2 p-2 hover:bg-gray-50 transition-colors">{cuerpo}</Link>
    : <div className="min-w-0">{cuerpo}</div>;
}

export function EstadoMes(p: EstadoMesProps) {
  const avance = p.enCurso ? Math.min(100, (p.dia / p.diasDelMes) * 100) : 100;
  const pctMeta = p.meta ? Math.min(100, (p.ventas / p.meta) * 100) : null;
  const final = p.enCurso ? p.proyeccion : p.ventas;
  const vsMeta = p.meta && final !== null ? final - p.meta : null;

  return (
    <section className="bg-white rounded-3xl border border-gray-200/80 p-5 sm:p-7 min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
        {p.periodo} · {p.enCurso ? `día ${p.dia} de ${p.diasDelMes}` : "mes cerrado"}
      </div>

      <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
        <div className="text-4xl sm:text-5xl font-semibold tracking-tight tabular-nums text-gray-900 leading-none">{soles(p.ventas)}</div>
        <div className="pb-1 text-sm text-gray-500 flex flex-wrap items-center gap-2">
          {p.etiquetaVentas ?? "vendido en las 3 sedes"}{p.hasta ? ` hasta el ${p.hasta.slice(8, 10)}/${p.hasta.slice(5, 7)}` : ""}
          {p.deltaPct !== null && <span className="inline-flex items-center gap-1"><Delta pct={p.deltaPct} /> <span className="text-xs">vs. mismos días del mes pasado</span></span>}
        </div>
      </div>

      {p.meta !== null && pctMeta !== null && (
        <div className="mt-5">
          <div className="relative h-2.5 rounded-full bg-gray-100 overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={p.meta} aria-valuenow={p.ventas} aria-label="Ventas contra la meta del mes">
            <div className={`absolute inset-y-0 left-0 rounded-full ${p.ventas >= p.meta ? "bg-emerald-600" : "bg-primary"}`} style={{ width: `${pctMeta}%` }} />
            {p.enCurso && <div className="absolute -inset-y-0.5 w-0.5 bg-gray-800/50" style={{ left: `${avance}%` }} title="Lo que va del mes" />}
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-gray-500">
            <span>{Math.round((p.ventas / p.meta) * 100)}% de la meta de {soles(p.meta)}{p.enCurso ? ` · va ${Math.round(avance)}% del mes` : ""}</span>
            {vsMeta !== null && (
              <span className={vsMeta >= 0 ? "text-emerald-700 font-medium" : "text-amber-700 font-medium"}>
                {p.enCurso ? `Al ritmo actual cierra en ${soles(final!)} · ` : ""}{soles(vsMeta)} {vsMeta >= 0 ? "sobre" : "bajo"} la meta
              </span>
            )}
          </div>
        </div>
      )}
      {p.meta === null && p.enCurso && p.proyeccion !== null && (
        <p className="mt-4 text-xs text-gray-500">Al ritmo actual cierra en {soles(p.proyeccion)}. Sin presupuesto aprobado no hay meta contra la cual medirlo.</p>
      )}

      <div className="mt-6 pt-5 border-t border-gray-100 grid grid-cols-3 gap-3 sm:gap-5">
        {p.enCurso ? (
          <Dato titulo="Dinero hoy" valor={p.liquidez !== null ? soles(p.liquidez) : "—"} detalle={p.detalleLiquidez ?? "En banco y caja, las 3 sedes"} href={p.liquidezHref} />
        ) : (
          <Dato titulo="Dinero del mes" valor={p.flujo !== null ? `${p.flujo < 0 ? "−" : ""}${soles(p.flujo)}` : "—"} tono={p.flujo !== null && p.flujo < 0 ? "mal" : "neutro"} detalle="Lo que entró menos lo que salió" />
        )}
        <Dato titulo="Mínimo del día" valor={p.equilibrio.texto} detalle={p.equilibrio.detalle} tono={p.equilibrio.tono} />
        <Dato titulo="Ganancia"
          valor={p.ganancia.valor !== null ? `${p.ganancia.valor < 0 ? "−" : ""}${soles(p.ganancia.valor)}` : <span className="text-gray-400">—</span>}
          tono={p.ganancia.valor === null ? "neutro" : p.ganancia.valor < 0 ? "mal" : "bien"} detalle={p.ganancia.detalle} />
      </div>

      {p.regla && <ReglaDelMes regla={p.regla} />}
    </section>
  );
}

const TONO_TERMOMETRO = { fragil: "mal", en_camino: "ojo", eficiente: "bien" } as const;

/** El pastel de la regla 33-33-33, con selector de sede (Grupo por defecto). */
function ReglaDelMes({ regla }: { regla: NonNullable<EstadoMesProps["regla"]> }) {
  const [elegida, setElegida] = useState(regla.opciones[0]?.etiqueta ?? "");
  const actual = regla.opciones.find((o) => o.etiqueta === elegida) ?? regla.opciones[0];
  if (!actual) return null;
  const f = actual.fila;
  const t = f.termometro;
  return (
    <div className="mt-5 border-t border-gray-100 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="font-medium uppercase tracking-wider text-[10px] sm:text-[11px] text-gray-500">Regla 33-33-33 · real / meta</span>
        <Segmentado
          tamano="sm" valor={actual.etiqueta} onChange={setElegida}
          opciones={regla.opciones.map((o) => ({ valor: o.etiqueta, etiqueta: o.etiqueta, deshabilitado: !o.fila.ebitda }))}
        />
      </div>
      {f.ebitda && f.costos && f.fijos ? (
        <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
          <PastelRegla f={f} className="h-24 w-24 sm:h-32 sm:w-32" />
          <div className="min-w-0 flex-1">
            {t && <div className={`text-sm font-semibold ${TONO[TONO_TERMOMETRO[t]]}`}>{actual.etiqueta}: {ETIQUETA_TERMOMETRO[t].toLowerCase()}</div>}
            <ul className="mt-2 max-w-xs space-y-1 tabular-nums">
              {([["costos", f.costos], ["fijos", f.fijos], ["ebitda", f.ebitda]] as const).map(([clave, b]) => (
                <li key={clave} className="flex items-baseline justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-gray-700"><span className={`h-2 w-2 rounded-full ${PARTES[clave].punto}`} aria-hidden />{PARTES[clave].nombre}</span>
                  <span className="whitespace-nowrap"><b className={(clave === "ebitda" ? b.pct < b.metaPct : b.pct > b.metaPct) ? "text-amber-700" : "text-emerald-700"}>{b.pct.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%</b><span className="text-gray-400"> / {Math.round(b.metaPct)}%</span></span>
                </li>
              ))}
            </ul>
            {actual.frena && <p className="mt-2 text-[11px] font-medium leading-snug text-gray-800">{actual.frena}</p>}
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
              <Link href={regla.href} className="text-primary hover:underline">Ver la regla completa →</Link>
              <Link href={regla.href} className="text-gray-500 hover:underline" title="En Reportes → Profit First → Ajustar los porcentajes">Cambiar la meta</Link>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-gray-400">{actual.etiqueta}: {f.sinResultadoPorque ?? "sin datos"}. Todavía no hay EBITDA.</p>
      )}
    </div>
  );
}
