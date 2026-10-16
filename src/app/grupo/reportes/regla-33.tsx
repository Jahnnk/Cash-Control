"use client";

/**
 * «Regla 33-33-33» — el EBITDA como termómetro (pedido de Jahnn, 15-oct-2026, de una
 * asesoría con su coach). De cada S/ 100 vendidos: un tercio a costos variables, un
 * tercio a costos fijos y un tercio de EBITDA. Cada sede muestra, en un pastel de dos
 * anillos (la regla afuera, cómo va adentro), cómo se reparte su venta y dónde está la diferencia con la meta.
 * Reglas y números: src/lib/regla-33.ts (sale de las seis cifras, nada nuevo que cuadrar).
 */

import { SeccionDesplegable } from "@/components/productos/ui";
import {
  regla33, dondeFalta, ETIQUETA_TERMOMETRO, TOPE_PLANILLA_PCT, EBITDA_FRAGIL_PCT, EBITDA_EFICIENTE_PCT,
  type FilaRegla,
} from "@/lib/regla-33";
import { PastelRegla, PARTES, ESTILO_TERMOMETRO } from "@/components/pastel-regla";
import type { SeisCifras } from "@/app/actions/seis-cifras";

const pct = (n: number) => `${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`;
const soles = (n: number) => `S/${Math.round(Math.abs(n)).toLocaleString("es-PE")}`;
const dd = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;


/** Lo que se dice debajo de la barra: dónde está la diferencia con el tercio de EBITDA. */
function frase(f: FilaRegla): string {
  const d = dondeFalta(f);
  if (!d || !f.ebitda) return "";
  if (d.llegaAlTercio) return `Llega a su tercio: el EBITDA supera la meta por ${soles(f.ebitda.difMeta)}.`;
  const partes: string[] = [];
  if (d.masCostos >= 1) partes.push(`${soles(d.masCostos)} en costos variables`);
  if (d.masFijos >= 1) partes.push(`${soles(d.masFijos)} en costos fijos`);
  return `Para llegar a su tercio faltan ${soles(f.ebitda.difMeta)}: se pasó ${partes.join(" y ")}.`;
}

function Tarjeta({ f, finDeMes }: { f: FilaRegla; finDeMes: string }) {
  const aMedias = !f.mesCompleto && (f.esGrupo || (f.corte !== null && f.corte < finDeMes));
  const t = f.termometro;
  return (
    <div className={`min-w-0 rounded-xl px-4 py-3.5 ${f.esGrupo ? "bg-gray-50" : "border border-gray-100"}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-gray-900">{f.etiqueta}</span>
          {!f.esGrupo && f.corte && aMedias && <span className="text-[10px] text-amber-700">datos hasta el {dd(f.corte)}</span>}
        </div>
        {t && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${ESTILO_TERMOMETRO[t].chip}`}>{ETIQUETA_TERMOMETRO[t]}</span>}
      </div>

      {f.ebitda && f.costos && f.fijos ? (
        <>
          <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
            <PastelRegla f={f} />
            <ul className="w-full min-w-0 space-y-1.5 text-xs tabular-nums">
              {([["costos", f.costos], ["fijos", f.fijos], ["ebitda", f.ebitda]] as const).map(([clave, b]) => {
                // Costos y fijos: pasarse de la meta es malo. EBITDA: quedarse corto es malo.
                const mal = clave === "ebitda" ? b.pct < b.metaPct : b.pct > b.metaPct;
                return (
                  <li key={clave} className="flex items-baseline justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-gray-700"><span className={`h-2 w-2 rounded-full ${PARTES[clave].punto}`} aria-hidden />{PARTES[clave].nombre}</span>
                    <span className="text-right">
                      <b className={mal ? "text-amber-700" : "text-emerald-700"}>{pct(b.pct)}</b>
                      <span className="text-gray-400"> · meta {Math.round(b.metaPct)}%</span>
                      {clave === "ebitda" && <span className="block text-[10px] text-gray-400">{b.monto < 0 ? "−" : ""}{soles(b.monto)}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-gray-600">{frase(f)}</p>
          {f.sueldoSocios > 0 && (
            <p className="mt-1 text-[11px] leading-snug text-gray-500">
              {f.sociosFuera ? `Sin contar el sueldo de los socios (${soles(f.sueldoSocios)}): se paga de la utilidad.` : `Incluye ${soles(f.sueldoSocios)} de sueldo de los socios, dentro de la planilla.`}
            </p>
          )}
          {f.planilla && (
            <p className={`mt-1 text-[11px] leading-snug ${f.planilla.pasaDelTope ? "text-amber-700" : "text-gray-500"}`}>
              Planilla {pct(f.planilla.pct)} de la venta (tope {TOPE_PLANILLA_PCT}%){f.planilla.pasaDelTope ? `: ${soles(f.planilla.monto - (f.ventas! * TOPE_PLANILLA_PCT) / 100)} sobre el tope.` : "."}
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 text-xs text-gray-400">{f.sinResultadoPorque ?? "Sin datos"}: todavía no hay EBITDA.</p>
      )}
    </div>
  );
}

export function Regla33({ cifras, periodo }: { cifras: SeisCifras | null; periodo: string }) {
  if (!cifras) return null;
  const filas = regla33(cifras);
  const [y, m] = cifras.mes.split("-").map(Number);
  const finDeMes = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const g = filas.find((x) => x.esGrupo);
  const resumen = g?.ebitda && g.termometro
    ? <p className="text-xs text-gray-600">Grupo: EBITDA <b className={ESTILO_TERMOMETRO[g.termometro].texto}>{pct(g.ebitda.pct)}</b> de la venta · meta {Math.round(g.ebitda.metaPct)}% · {ETIQUETA_TERMOMETRO[g.termometro].toLowerCase()}</p>
    : <p className="text-xs text-gray-500">Todavía sin EBITDA para {periodo}.</p>;

  return (
    <SeccionDesplegable
      titulo="Regla 33-33-33 · EBITDA"
      subtitulo="De cada S/ 100 que vendes: un tercio a costos variables, un tercio a costos fijos y un tercio de EBITDA (lo ajustas en Profit First)."
      resumen={resumen}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filas.map((f) => <Tarjeta key={f.etiqueta} f={f} finDeMes={finDeMes} />)}
        </div>
        <p className="text-[11px] leading-relaxed text-gray-500">
          El anillo de afuera es la regla (un tercio cada parte); el de adentro, cómo va de verdad: donde se pasa o se queda corto se ve qué parte falla. El EBITDA es lo que queda de la venta después de los costos variables y los fijos, antes de impuestos:
          un termómetro de qué tan eficiente es la operación. Menos de {EBITDA_FRAGIL_PCT}% es una operación frágil; {EBITDA_EFICIENTE_PCT}% o más, un modelo eficiente.
          Costos variables = lo que sube y baja con la venta; costos fijos = planilla, alquiler y servicios (y lo que aún no se clasificó).
          {" "}Cifras de {periodo.toLowerCase()}, las mismas de «Las seis cifras».
        </p>
      </div>
    </SeccionDesplegable>
  );
}
