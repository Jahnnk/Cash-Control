"use client";

/**
 * «Profit First» — apartar la utilidad ANTES de gastar el resto (pedido de Jahnn,
 * 15-oct-2026, de la asesoría con su coach). Del EBITDA, el 25% de la venta se aparta
 * primero para utilidades; el remanente va a impuestos y reinversión. Cada sede muestra
 * la meta, lo que la operación dejó y lo que de verdad se apartó (fondos mutuos).
 * Reglas y números: src/lib/regla-33.ts (profitFirst); nada nuevo que llenar.
 */

import { SeccionDesplegable } from "@/components/productos/ui";
import { profitFirst, UTILIDAD_META_PCT, type EstadoApartado, type FilaProfitFirst } from "@/lib/regla-33";
import type { SeisCifras } from "@/app/actions/seis-cifras";

const soles = (n: number) => `${n < 0 ? "−" : ""}S/${Math.round(Math.abs(n)).toLocaleString("es-PE")}`;
const pct = (n: number) => `${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`;
const dd = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const ESTADO: Record<EstadoApartado, { texto: string; chip: string; barra: string; num: string }> = {
  cumple: { texto: "Cumple", chip: "bg-emerald-50 text-emerald-800 ring-emerald-200", barra: "bg-emerald-600", num: "text-emerald-700" },
  parcial: { texto: "A medias", chip: "bg-amber-50 text-amber-800 ring-amber-200", barra: "bg-amber-400", num: "text-amber-700" },
  sin_apartar: { texto: "Sin apartar", chip: "bg-red-50 text-red-700 ring-red-200", barra: "bg-red-400", num: "text-red-700" },
};

/** La frase que une las tres cifras: ¿se apartó?, ¿alcanzaba la operación? */
function frase(f: FilaProfitFirst): string {
  if (!f.apartado || f.meta === null || f.ebitda === null) return "";
  const partes: string[] = [];
  if (f.estado === "cumple") partes.push("Apartaste la utilidad completa.");
  else partes.push(`Faltaron ${soles(f.falta ?? 0)} para el ${UTILIDAD_META_PCT}%.`);
  if (f.operacionAlcanza === false) partes.push(`La operación tampoco alcanzaba (dejó ${soles(f.ebitda)}): primero hay que subir el EBITDA.`);
  else if (f.apartado.neto > f.ebitda) partes.push("Apartaste más de lo que dejó la operación este mes: salió de plata que ya había.");
  return partes.join(" ");
}

function Tarjeta({ f, finDeMes }: { f: FilaProfitFirst; finDeMes: string }) {
  const aMedias = !f.mesCompleto && (f.esGrupo || (f.corte !== null && f.corte < finDeMes));
  const e = f.estado;
  const ap = f.apartado;
  const avance = ap && f.meta ? Math.max(0, Math.min(100, (ap.neto / f.meta) * 100)) : 0;
  const detalle = ap && (ap.rescates > 0 || ap.utilidadesPagadas > 0)
    ? `${soles(ap.ahorro)} a fondos mutuos${ap.rescates > 0 ? ` − ${soles(ap.rescates)} que se sacaron` : ""}${ap.utilidadesPagadas > 0 ? ` + ${soles(ap.utilidadesPagadas)} de utilidades ya pagadas` : ""}`
    : null;
  return (
    <div className={`min-w-0 rounded-xl px-4 py-3.5 ${f.esGrupo ? "bg-gray-50" : "border border-gray-100"}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-gray-900">{f.etiqueta}</span>
          {!f.esGrupo && f.corte && aMedias && <span className="text-[10px] text-amber-700">datos hasta el {dd(f.corte)}</span>}
        </div>
        {e && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${ESTADO[e].chip}`}>{ESTADO[e].texto}</span>}
      </div>

      {ap && e && f.meta !== null && f.ebitda !== null && f.ventas ? (
        <>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-2xl font-bold tabular-nums leading-none ${ESTADO[e].num}`}>{soles(ap.neto)}</span>
            <span className="text-xs text-gray-500">apartados · meta {soles(f.meta)} ({UTILIDAD_META_PCT}% de la venta)</span>
          </div>
          <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-gray-100" role="meter" aria-valuemin={0} aria-valuemax={f.meta} aria-valuenow={Math.max(0, ap.neto)} aria-label={`Apartado contra la meta de ${soles(f.meta)}`}>
            <div className={`h-full rounded-full ${ESTADO[e].barra}`} style={{ width: `${avance}%` }} />
          </div>
          <dl className="mt-2 space-y-0.5 text-xs text-gray-600">
            <div className="flex justify-between gap-2"><dt>Apartado</dt><dd className="tabular-nums">{pct(ap.pct)} de la venta</dd></div>
            <div className="flex justify-between gap-2"><dt>La operación dejó (EBITDA)</dt><dd className="tabular-nums">{soles(f.ebitda)} · {pct((f.ebitda / f.ventas) * 100)}</dd></div>
          </dl>
          {detalle && <p className="mt-1 text-[11px] leading-snug text-gray-400">{detalle}.</p>}
          <p className="mt-2 text-[11px] leading-snug text-gray-600">{frase(f)}</p>
        </>
      ) : (
        <p className="mt-2 text-xs text-gray-400">{f.sinResultadoPorque ?? "Sin datos"}: todavía no se puede medir.</p>
      )}
    </div>
  );
}

export function ProfitFirst({ cifras, periodo }: { cifras: SeisCifras | null; periodo: string }) {
  if (!cifras) return null;
  const filas = profitFirst(cifras);
  const [y, m] = cifras.mes.split("-").map(Number);
  const finDeMes = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const g = filas.find((x) => x.esGrupo);
  const resumen = g?.apartado && g.estado
    ? <p className="text-xs text-gray-600">Grupo: apartaste <b className={ESTADO[g.estado].num}>{soles(g.apartado.neto)}</b> de {soles(g.meta ?? 0)} · {pct(g.apartado.pct)} de la venta (meta {UTILIDAD_META_PCT}%)</p>
    : <p className="text-xs text-gray-500">Todavía sin datos para {periodo}.</p>;

  return (
    <SeccionDesplegable
      titulo="Profit First · apartar la utilidad primero"
      subtitulo={`Del EBITDA, el ${UTILIDAD_META_PCT}% de la venta se aparta antes de gastar el resto; lo demás va a impuestos y reinversión.`}
      resumen={resumen}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filas.map((f) => <Tarjeta key={f.etiqueta} f={f} finDeMes={finDeMes} />)}
        </div>
        <p className="text-[11px] leading-relaxed text-gray-500">
          «Apartado» es lo que de verdad quedó guardado para los socios en {periodo.toLowerCase()}: lo mandado a fondos mutuos, menos lo que se sacó de ahí, más las utilidades ya pagadas
          (esas salen de un rescate del ahorro, por eso se suman). Sale de las filas del Excel, no hay nada nuevo que llenar. La idea de Profit First: separar la utilidad primero, no esperar a ver qué sobra.
        </p>
      </div>
    </SeccionDesplegable>
  );
}
