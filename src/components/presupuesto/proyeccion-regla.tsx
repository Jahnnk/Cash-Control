"use client";

/**
 * Proyección del presupuesto con la regla 33-33-33 y Profit First (pedido de Jahnn, 15-oct-2026,
 * de la asesoría con su coach). Con la venta esperada del mes, la regla reparte un tercio a costos
 * variables, un tercio a costos fijos y un tercio de EBITDA, y aparta el 25% para utilidades primero;
 * aquí se ve lo que el plan asigna de verdad contra eso, en soles. Reglas: lib/proyeccion-presupuesto.ts.
 *
 *   · `ProyeccionRegla`: el bloque (pastel + tres filas + una línea de Profit First + detalle a un toque).
 *     En el editor se recalcula en vivo mientras se escriben las categorías.
 *   · `ProyeccionDelPlan`: la sección plegada con el plan GUARDADO de la empresa y de cada sede.
 */

import { useMemo, useState } from "react";
import { PastelRegla, PARTES, ESTILO_TERMOMETRO } from "@/components/pastel-regla";
import { SeccionDesplegable, Segmentado } from "@/components/productos/ui";
import { proyectarGrupo, proyectarPlan, type ProyeccionPlan } from "@/lib/proyeccion-presupuesto";
import { ETIQUETA_TERMOMETRO, PLANILLA_SANA_MIN_PCT, TOPE_PLANILLA_PCT, type ConfigProfitFirst } from "@/lib/regla-33";
import type { Linea } from "@/lib/presupuesto";

const soles = (n: number) => `${n < 0 ? "−" : ""}S/${Math.round(Math.abs(n)).toLocaleString("es-PE")}`;
const pct = (n: number) => `${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`;

export function ProyeccionRegla({ p, titulo }: { p: ProyeccionPlan; titulo?: string }) {
  const t = p.termometro;
  const filas = [
    { clave: "costos" as const, b: p.costos, malo: p.costos.monto > p.costos.meta },
    { clave: "fijos" as const, b: p.fijos, malo: p.fijos.monto > p.fijos.meta },
    { clave: "ebitda" as const, b: p.ebitda, malo: p.ebitda.monto < p.ebitda.meta },
  ];
  const pf = p.profitFirst;
  return (
    <div className="rounded-xl border border-gray-100 px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-semibold text-gray-900">{titulo ?? "Proyección 33-33-33"} <span className="font-normal text-gray-500">· de {soles(p.venta)} esperados</span></span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${ESTILO_TERMOMETRO[t].chip}`}>EBITDA {pct(p.ebitda.pct)} · {ETIQUETA_TERMOMETRO[t].toLowerCase()}</span>
      </div>

      <div className="mt-3 flex flex-col items-center gap-3 sm:flex-row sm:gap-5">
        <PastelRegla f={{ costos: p.costos, fijos: p.fijos, ebitda: p.ebitda, termometro: t }} className="h-32 w-32" />
        <table className="w-full min-w-0 table-fixed text-xs tabular-nums sm:table-auto">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-gray-400">
              <th className="w-[40%] text-left font-medium pb-1 sm:w-auto">Bloque</th>
              <th className="text-right font-medium pb-1">Tu plan</th>
              <th className="text-right font-medium pb-1">La regla</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(({ clave, b, malo }) => (
              <tr key={clave} className="border-t border-gray-50">
                <td className="py-1.5 pr-2"><span className="inline-flex items-center gap-1.5 whitespace-nowrap text-gray-700"><span className={`h-2 w-2 rounded-full ${PARTES[clave].punto}`} aria-hidden />{PARTES[clave].nombre}</span></td>
                <td className="py-1.5 text-right whitespace-nowrap">
                  <b className={malo ? "text-amber-700" : "text-emerald-700"}>{soles(b.monto)}</b>
                  <div className="text-[10px] text-gray-400">{pct(b.pct)}</div>
                </td>
                <td className="py-1.5 pl-3 text-right whitespace-nowrap text-gray-500">
                  {soles(b.meta)}
                  <div className="text-[10px] text-gray-400">{pct(b.metaPct)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] leading-snug text-gray-700">
        <b>Profit First:</b> aparta primero <b>{soles(pf.utilidad)}</b> ({pct(pf.utilidadPct)} de la venta) para utilidades; del EBITDA objetivo quedan {soles(pf.resto)} ({pct(pf.restoPct)}) para impuestos y reinversión.{" "}
        {pf.cabe
          ? <>La operación del plan ({soles(pf.operacionPlan)}) cabe en el {pct(100 - pf.utilidadPct)} restante ({soles(pf.limiteOperacion)}).</>
          : <span className="text-amber-800">La operación del plan ({soles(pf.operacionPlan)}) se pasa {soles(pf.exceso)} del {pct(100 - pf.utilidadPct)} que queda tras apartar la utilidad ({soles(pf.limiteOperacion)}): hay que corregir costos, no vender más.</span>}
      </p>

      <details className="group mt-2">
        <summary className="cursor-pointer list-none text-[11px] font-medium text-primary hover:underline">
          <span className="group-open:hidden">Ver el detalle: qué ajustar, planilla y piso diario</span><span className="hidden group-open:inline">Ocultar el detalle</span>
        </summary>
        <ul className="mt-2 space-y-1 text-[11px] leading-snug text-gray-600">
          {(p.ajuste.costos >= 1 || p.ajuste.fijos >= 1)
            ? <li><b>Para llegar a la regla</b> el plan tendría que bajar {[p.ajuste.costos >= 1 ? `${soles(p.ajuste.costos)} en costos variables` : null, p.ajuste.fijos >= 1 ? `${soles(p.ajuste.fijos)} en costos fijos` : null].filter(Boolean).join(" y ")}.</li>
            : <li><b>El plan cumple la regla:</b> costos y fijos están dentro de su tercio.</li>}
          <li><b>Planilla:</b> {soles(p.planilla.monto)} = {pct(p.planilla.pct)} de la venta (sano {PLANILLA_SANA_MIN_PCT}–{TOPE_PLANILLA_PCT}%){p.planilla.estado === "alta" ? ": por encima del tope." : p.planilla.estado === "baja" ? ": por debajo de lo sano." : "."}</li>
          {p.piso && <li><b>Piso diario con este plan:</b> ({soles(p.piso.fijos)} de fijos + {soles(p.piso.foodCost)} de insumos) ÷ 30 = <b>{soles(p.piso.dia)} por día</b>.</li>}
          {(p.impuestos > 0 || p.fueraDeLaRegla > 0) && <li>Fuera de la regla (no son costo del negocio): {[p.impuestos > 0 ? `impuestos ${soles(p.impuestos)}` : null, p.fueraDeLaRegla > 0 ? `deudas, inversión y ahorro ${soles(p.fueraDeLaRegla)}` : null].filter(Boolean).join(" · ")}.</li>}
        </ul>
      </details>
    </div>
  );
}

/** El plan GUARDADO de cada sede y de la empresa, contra la regla (sección plegada de la pantalla de Presupuesto). */
export function ProyeccionDelPlan({ sedes, config, sueldoSocios, sedeFija, periodo }: {
  sedes: { businessId: number; sede: string; venta: number | null; lineas: Linea[] }[];
  config: ConfigProfitFirst; sueldoSocios: Record<number, number>; sedeFija: boolean; periodo: string;
}) {
  const conPlan = sedes.filter((s) => s.venta && s.venta > 0 && s.lineas.length > 0);
  const opciones = useMemo(() => {
    const porSede = conPlan.map((s) => ({ etiqueta: s.sede, p: proyectarPlan({ venta: s.venta, lineas: s.lineas, config, sueldoSocios: sueldoSocios[s.businessId] ?? 0 }) }));
    const grupo = !sedeFija && conPlan.length > 1
      ? { etiqueta: "Grupo", p: proyectarGrupo(conPlan, config, conPlan.reduce((t, s) => t + (sueldoSocios[s.businessId] ?? 0), 0)) }
      : null;
    return [...(grupo ? [grupo] : []), ...porSede].filter((o): o is { etiqueta: string; p: ProyeccionPlan } => !!o.p);
  }, [conPlan, config, sueldoSocios, sedeFija]);
  const [elegida, setElegida] = useState(opciones[0]?.etiqueta ?? "");
  const actual = opciones.find((o) => o.etiqueta === elegida) ?? opciones[0];
  const sinPlan = sedes.filter((s) => !(s.venta && s.venta > 0 && s.lineas.length > 0)).map((s) => s.sede);

  const resumen = actual
    ? <p className="text-xs text-gray-600">{actual.etiqueta}: EBITDA del plan <b className={ESTILO_TERMOMETRO[actual.p.termometro].texto}>{pct(actual.p.ebitda.pct)}</b> ({soles(actual.p.ebitda.monto)}) · regla {soles(actual.p.ebitda.meta)} · aparta {soles(actual.p.profitFirst.utilidad)} para utilidades</p>
    : <p className="text-xs text-gray-500">Escribe la venta esperada y las categorías del plan de {periodo} para ver la proyección.</p>;

  return (
    <SeccionDesplegable
      titulo="Proyección 33-33-33 del plan"
      subtitulo="Con la venta esperada del mes: un tercio a costos variables, un tercio a fijos y un tercio de EBITDA, y el 25% apartado primero para utilidades. Tu plan guardado, contra la regla."
      resumen={resumen}
    >
      {!actual ? (
        <p className="text-sm text-gray-500">Ninguna sede tiene todavía venta esperada y categorías guardadas para {periodo}.</p>
      ) : (
        <div className="space-y-3">
          {opciones.length > 1 && <Segmentado tamano="sm" valor={actual.etiqueta} onChange={setElegida} opciones={opciones.map((o) => ({ valor: o.etiqueta, etiqueta: o.etiqueta }))} />}
          <ProyeccionRegla p={actual.p} titulo={actual.etiqueta} />
          {sinPlan.length > 0 && <p className="text-[11px] text-amber-700">Sin plan guardado en {sinPlan.join(", ")}: no entran a esta proyección.</p>}
          <p className="text-[11px] leading-relaxed text-gray-500">
            «Tu plan» son las categorías guardadas (variables en % de la venta esperada, fijos en soles). El EBITDA del plan es la venta esperada menos costos variables y fijos, antes de impuestos, igual que en la regla del dashboard.
            En el Grupo, lo que Atelier le vende a las cafeterías se cuenta una sola vez. Las metas siguen los ajustes de Reportes → Profit First.
          </p>
        </div>
      )}
    </SeccionDesplegable>
  );
}
