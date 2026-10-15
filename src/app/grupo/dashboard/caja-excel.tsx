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
import { ArrowRight } from "lucide-react";
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
        <p className="text-[11px] text-gray-500">Como al pie de cada hoja Ing&amp;Gtos, separando lo que no es gasto del negocio.</p>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
        {filas.map((f) => {
          const sinExcel = f.entro === 0 && f.salio === 0;
          return (
            <div key={f.etiqueta} className={`min-w-0 ${f.esGrupo ? "rounded-xl bg-gray-50 px-3 py-2 lg:-my-2" : ""}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-sm ${f.esGrupo ? "font-bold" : "font-semibold"} text-gray-900`}>{f.etiqueta}</span>
                {!f.esGrupo && f.corte && (
                  <span className={`text-[10px] ${f.corte < masReciente ? "text-amber-700" : "text-gray-400"}`}>datos al {dm(f.corte)}</span>
                )}
                {f.esGrupo && fechasDistintas && <span className="text-[10px] text-amber-700">fechas distintas</span>}
              </div>

              {sinExcel ? (
                <p className="mt-1 text-xs text-gray-400">Sin Excel de {periodo.toLowerCase().split(" ")[0]}</p>
              ) : (
                <div className="mt-1 space-y-0.5">
                  {f.margenPct !== null && f.ingresos !== null && f.gastos !== null ? (
                    <>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] text-gray-500">Ingresos</span>
                        <span className="tabular-nums text-sm font-semibold text-gray-900">{formatCurrency(f.ingresos)}</span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] text-gray-500">Gastos</span>
                        <span className="tabular-nums text-sm font-semibold text-gray-900">{formatCurrency(f.gastos)}</span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2 border-t border-gray-100 pt-0.5">
                        <span className="text-[11px] font-medium text-gray-700">Margen de la operación</span>
                        <span className={`tabular-nums text-sm font-bold ${f.margenPct < 0 ? "text-red-600" : "text-emerald-700"}`}>{pct(f.margenPct)}</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-gray-400">Sin gastos cargados todavía: aún no hay margen.</p>
                  )}

                  {f.salioFuera > 0 && (
                    <p className="pt-1 text-[11px] leading-snug text-gray-600">
                      Salió además <b className="tabular-nums text-gray-800">{formatCurrency(f.salioFuera)}</b> que no es gasto del negocio:{" "}
                      {f.detalleFuera.map((d) => `${d.etiqueta} ${formatCurrency(d.monto)}`).join(" · ")}.
                    </p>
                  )}

                  <p className="pt-1 text-[10px] leading-snug text-gray-400">
                    Excel de Kelly (caja): entró {formatCurrency(f.entro)} · salió {formatCurrency(f.salio)}
                    {f.margenCajaPct !== null && <> · <span className="tabular-nums">{pct(f.margenCajaPct)}</span></>}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-3 border-t border-gray-100 pt-2.5 text-[11px] leading-relaxed text-gray-500">
        Margen de la operación = (ingresos − gastos del negocio) ÷ ingresos, con lo que entró y salió según el Excel. La ganancia real, con las ventas de Byte, es la barra 3 de arriba.{" "}
        <Link href={mesesHref} className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">
          Ver los dos márgenes <ArrowRight className="h-3 w-3" />
        </Link>
      </p>
    </section>
  );
}
