"use client";

/**
 * «Resultado del mes · según el Excel» — lo primero del Resumen de Grupo después
 * de las barras por sede (pedido de Jahnn, 14-oct-2026; ajustado el 15-oct).
 *
 * Es lo que Kelly escribe al pie de cada hoja Ing&Gtos (ingresos con su margen,
 * gastos con su %), pero leído bien: su margen es de CAJA y cuenta como gasto el
 * ahorro a fondos mutuos, las utilidades a socios, las cuotas y los equipos. Por
 * eso cada sede muestra primero la OPERACIÓN (ingresos − gastos del negocio, con
 * su margen), debajo lo que salió sin ser gasto, y al final la cifra de Kelly.
 * Reglas: lib/margenes-del-mes.ts (resultadoOperativo). Verificado oct-2026
 * contra los Excel: Atelier y Fonavi iguales al céntimo.
 */

import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { resultadoOperativo } from "@/lib/margenes-del-mes";
import type { SeisCifras } from "@/app/actions/seis-cifras";

const pct = (n: number) => `${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function CajaExcel({ cifras, periodo, mesesHref }: { cifras: SeisCifras | null; periodo: string; mesesHref: string }) {
  if (!cifras) return null;
  const filas = resultadoOperativo(cifras);
  const cortes = filas.filter((f) => !f.esGrupo && f.corte).map((f) => f.corte!);
  const masReciente = cortes.reduce((m, c) => (c > m ? c : m), "");
  const fechasDistintas = new Set(cortes).size > 1;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white px-4 py-4 sm:px-5" aria-labelledby="caja-excel-titulo">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="caja-excel-titulo" className="text-sm font-semibold text-gray-900">
          Resultado del mes <span className="font-normal text-gray-500">· según el Excel · {periodo.toLowerCase()}</span>
        </h2>
        <Link href={mesesHref} className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary hover:underline">
          Ver los dos márgenes <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {filas.map((f) => {
          const sinExcel = f.entro === 0 && f.salio === 0;
          const conMargen = f.margenPct !== null && f.ingresos !== null && f.gastos !== null;
          return (
            <div key={f.etiqueta} className={`min-w-0 rounded-xl px-3 py-3 ${f.esGrupo ? "bg-gray-50" : "border border-gray-100"}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-gray-900">{f.etiqueta}</span>
                {!f.esGrupo && f.corte && (
                  <span className={`text-[10px] ${f.corte < masReciente ? "text-amber-700" : "text-gray-400"}`}>al {dm(f.corte)}</span>
                )}
                {f.esGrupo && fechasDistintas && <span className="text-[10px] text-amber-700">fechas distintas</span>}
              </div>
              {sinExcel ? (
                <p className="mt-2 text-xs text-gray-400">Sin Excel de {periodo.toLowerCase().split(" ")[0]}</p>
              ) : conMargen ? (
                <>
                  <div className={`mt-1.5 text-2xl font-bold tabular-nums leading-none ${f.margenPct! < 0 ? "text-red-600" : "text-emerald-700"}`}>{pct(f.margenPct!)}</div>
                  <div className="mt-1 text-[11px] text-gray-500">margen de la operación</div>
                  <dl className="mt-2.5 space-y-0.5 text-xs text-gray-600">
                    <div className="flex justify-between gap-2"><dt>Ingresos</dt><dd className="tabular-nums">{formatCurrency(f.ingresos!)}</dd></div>
                    <div className="flex justify-between gap-2"><dt>Gastos</dt><dd className="tabular-nums">{formatCurrency(f.gastos!)}</dd></div>
                  </dl>
                </>
              ) : (
                <p className="mt-2 text-xs text-gray-400">Sin gastos cargados todavía: aún no hay margen.</p>
              )}
            </div>
          );
        })}
      </div>

      <details className="group mt-3 border-t border-gray-100 pt-2.5">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[11px] font-medium text-gray-600 hover:text-gray-900 [&::-webkit-details-marker]:hidden">
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
          Ver qué más salió y la caja del Excel
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {filas.filter((f) => f.entro !== 0 || f.salio !== 0).map((f) => (
            <div key={f.etiqueta} className="min-w-0 space-y-1.5">
              <div className="text-xs font-semibold text-gray-900">{f.etiqueta}</div>
              {f.salioFuera > 0 ? (
                <p className="text-[11px] leading-snug text-gray-600">
                  Salió además <b className="tabular-nums text-gray-800">{formatCurrency(f.salioFuera)}</b> que no es gasto del negocio:
                  <span className="mt-0.5 block text-gray-500">{f.detalleFuera.map((d) => `${d.etiqueta} ${formatCurrency(d.monto)}`).join(" · ")}</span>
                </p>
              ) : (
                <p className="text-[11px] text-gray-500">Todo lo que salió es gasto del negocio.</p>
              )}
              {f.recuperado >= 1 && (
                <p className="text-[11px] leading-snug text-gray-600">
                  Otras sedes le devolvieron <b className="tabular-nums text-gray-800">{formatCurrency(f.recuperado)}</b> por gastos que pagó enteros: ya está restado de sus gastos.
                </p>
              )}
              <p className="text-[11px] leading-snug text-gray-400">
                Caja del Excel: entró {formatCurrency(f.entro)} · salió {formatCurrency(f.salio)}
                {f.margenCajaPct !== null && <> · <span className="tabular-nums">{pct(f.margenCajaPct)}</span></>}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
          Margen de la operación = (ingresos − gastos del negocio) ÷ ingresos. La ganancia real, con las ventas de Byte, es la barra 3 de arriba.
        </p>
      </details>
    </section>
  );
}
