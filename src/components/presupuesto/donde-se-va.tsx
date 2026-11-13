"use client";

/**
 * «¿Dónde se va la plata?» · Fase 3 del centro de mando del EBITDA (pedido de Jahnn, 13-nov-2026).
 * Los 3 focos, los 5 gastos fijos que más pesan y el mapa de fugas (mermas, sobreproducción, descuentos).
 * Solo lee; el cálculo vive en lib/fugas.ts. Empieza cerrada (regla de orden visual).
 */

import { TrendingUp } from "lucide-react";
import { SeccionDesplegable } from "@/components/productos/ui";
import { nombreMes } from "@/lib/financiamientos";
import type { Diagnostico } from "@/lib/fugas";

const soles = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;
const conSigno = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}S/ ${Math.abs(Math.round(n)).toLocaleString("es-PE")}`;
const pct = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString("es-PE")}%`;
const nombre = (c: string) => c.charAt(0) + c.slice(1).toLowerCase();
const tramo = (meses: string[]) => (meses.length === 0 ? "" : meses.length === 1 ? nombreMes(meses[0]) : `${nombreMes(meses[0]).split(" ")[0]} a ${nombreMes(meses[meses.length - 1])}`);
const CUANTOS_FOCOS = 3, CUANTOS_FIJOS = 5;

export function DondeSeVa({ d, sede }: { d: Diagnostico; sede: string }) {
  const tresFocos = d.focos.slice(0, CUANTOS_FOCOS);
  const fijos = d.fijos.slice(0, CUANTOS_FIJOS);
  const { merma, sobreproduccion, descuentos } = d.fugas;
  const hayAntes = d.mesesAntes.length > 0;
  return (
    <SeccionDesplegable
      titulo="¿Dónde se va la plata?"
      subtitulo={`${sede} · promedio al mes de ${tramo(d.meses)}${hayAntes ? `, comparado con ${tramo(d.mesesAntes)}` : ""}`}
      resumen={tresFocos[0] ? <>Foco 1: <b className="text-gray-900">{tresFocos[0].titulo}</b> · {soles(tresFocos[0].soles)} al mes</> : "Sin focos: nada pasa de su meta ni subió."}
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* ── Los 3 focos ── */}
        <div>
          <h4 className="text-sm font-semibold text-gray-900">Los {CUANTOS_FOCOS} focos</h4>
          <p className="text-[11px] text-gray-500">Lo que más plata devuelve al mes si se corrige.</p>
          {tresFocos.length === 0 ? <p className="mt-2 text-sm text-gray-500">Nada pasa de su meta ni subió contra los meses anteriores.</p> : (
            <ol className="mt-2 space-y-2">
              {tresFocos.map((f, i) => (
                <li key={f.clave} className="rounded-xl bg-gray-50 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-gray-900">{i + 1}. {f.titulo}</span>
                    <b className="shrink-0 text-base font-semibold tabular-nums text-gray-900">{soles(f.soles)}</b>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-gray-500">{f.porque} Vale {(Math.round(f.puntos * 10) / 10).toLocaleString("es-PE")} {f.puntos === 1 ? "punto" : "puntos"} de EBITDA.{f.dentroDeOtro && " Ya está dentro del costo variable."}</p>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-2 text-[11px] text-gray-400">Costo variable y planilla: lo que pasan de su meta. Lo demás: lo que subió.</p>
        </div>

        {/* ── Radiografía de fijos ── */}
        <div>
          <h4 className="text-sm font-semibold text-gray-900">Los {CUANTOS_FIJOS} gastos fijos que más pesan</h4>
          <p className="text-[11px] text-gray-500">Promedio al mes y % de la venta.</p>
          <ul className="mt-2 divide-y divide-gray-100">
            {fijos.map((f) => (
              <li key={f.categoria} className="py-2">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-gray-700">{nombre(f.categoria)}</span>
                  <span className="shrink-0 tabular-nums"><b className="font-semibold text-gray-900">{soles(f.monto)}</b> <span className="text-xs text-gray-500">· {pct(f.pctVenta)}</span></span>
                </div>
                {f.cambio !== null && f.antes !== null && (
                  <p className={`mt-0.5 inline-flex items-center gap-1 text-[11px] tabular-nums ${f.sube ? "font-medium text-red-600" : "text-gray-500"}`}>
                    {f.sube && <TrendingUp className="h-3 w-3" aria-hidden />}
                    {f.sube ? "Subió" : "Antes"} {f.sube ? conSigno(f.cambio) : soles(f.antes)}{f.sube ? ` (antes ${soles(f.antes)})` : ` (${conSigno(f.cambio)})`}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* ── Mapa de fugas ── */}
        <div>
          <h4 className="text-sm font-semibold text-gray-900">Mapa de fugas</h4>
          <p className="text-[11px] text-gray-500">Plata que se pierde sin que nadie la decida.</p>
          <ul className="mt-2 divide-y divide-gray-100">
            <li className="py-2">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-gray-700">Mermas</span>
                {merma ? <span className="tabular-nums"><b className={`font-semibold ${merma.exceso > 0 ? "text-red-600" : "text-gray-900"}`}>{soles(merma.monto)}</b> <span className="text-xs text-gray-500">· {pct(merma.pctVenta)}</span></span> : <span className="text-sm text-gray-400">sin registro</span>}
              </div>
              {merma && <p className="mt-0.5 text-[11px] text-gray-500">Tope de la sede: {pct(merma.metaPct)} de la venta. {merma.exceso > 0 ? `Se pasa por ${soles(merma.exceso)} al mes.` : "Está dentro."}</p>}
              {merma && merma.motivos.length > 0 && <p className="mt-0.5 text-[11px] text-gray-500">{merma.motivos.slice(0, 3).map((m) => `${m.motivo} ${pct(m.parte)}`).join(" · ")}</p>}
            </li>
            <li className="py-2">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-gray-700">Sobreproducción</span>
                {sobreproduccion ? <b className="font-semibold tabular-nums text-gray-900">{soles(sobreproduccion.monto)}</b> : <span className="text-sm text-gray-400">{merma ? "S/ 0" : "sin registro"}</span>}
              </div>
              <p className="mt-0.5 text-[11px] text-gray-500">{sobreproduccion ? `Lo que se venció sin venderse: ${pct(sobreproduccion.parte)} de las mermas.` : "Mermas con motivo «Vencimiento»: lo que se venció sin venderse."}</p>
            </li>
            <li className="py-2">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-gray-700">Descuentos</span>
                {descuentos && descuentos.monto > 0 ? <span className="tabular-nums"><b className={`font-semibold ${descuentos.sube ? "text-red-600" : "text-gray-900"}`}>{soles(descuentos.monto)}</b> <span className="text-xs text-gray-500">· {pct(descuentos.pctVenta)}</span></span> : <span className="text-sm text-gray-400">{descuentos ? "S/ 0" : "sin reporte"}</span>}
              </div>
              {descuentos && descuentos.monto > 0 && descuentos.antes !== null && descuentos.cambio !== null && <p className={`mt-0.5 text-[11px] ${descuentos.sube ? "font-medium text-red-600" : "text-gray-500"}`}>Antes {soles(descuentos.antes)} al mes ({conSigno(descuentos.cambio)}).</p>}
              <p className="mt-0.5 text-[11px] text-gray-500">Del reporte de ventas de Byte.</p>
            </li>
          </ul>
          <p className="mt-1 text-[11px] text-gray-400">Las mermas ya están dentro del costo variable: no se suman encima.</p>
        </div>
      </div>
    </SeccionDesplegable>
  );
}
