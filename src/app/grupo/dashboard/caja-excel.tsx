"use client";

/**
 * «Caja del mes · según el Excel» — lo primero del Resumen de Grupo
 * (pedido de Jahnn, 14-oct-2026): el mismo resumen que Kelly escribe al pie
 * de cada hoja Ing&Gtos — ingresos con su margen y gastos con su % — que es
 * lo primero que Jahnn mira en los Excel de finanzas.
 *
 * Mismo cálculo que «Los dos márgenes» de Grupo → Reportes (margenesDelMes,
 * sobre totalesMesSede): entró y salió de banco + caja, sin el saldo que
 * arrastra el mes anterior. Verificado oct-2026: Atelier y Fonavi iguales al
 * céntimo al pie de las hojas de Kelly. Es CAJA, no ganancia: la franja lo
 * dice y lleva a la explicación.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { margenesDelMes } from "@/lib/margenes-del-mes";
import { margenDeCaja } from "@/lib/verificacion-kelly";
import type { SeisCifras } from "@/app/actions/seis-cifras";

const pct = (n: number) => `${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function CajaExcel({ cifras, periodo, mesesHref }: { cifras: SeisCifras | null; periodo: string; mesesHref: string }) {
  if (!cifras) return null;
  const filas = margenesDelMes(cifras);
  const cortes = filas.filter((f) => !f.esGrupo && f.corte).map((f) => f.corte!);
  const fechasDistintas = new Set(cortes).size > 1;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white px-4 py-4 sm:px-5" aria-labelledby="caja-excel-titulo">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="caja-excel-titulo" className="text-sm font-semibold text-gray-900">
          Caja del mes <span className="font-normal text-gray-500">· según el Excel · {periodo.toLowerCase()}</span>
        </h2>
        <p className="text-[11px] text-gray-500">Lo que entró y salió de banco y caja, como al pie de cada hoja Ing&amp;Gtos.</p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4 lg:grid-cols-4">
        {filas.map((f) => {
          // Sin gastos cargados, el margen daría +100%: no es un margen, es que falta el Excel.
          const hayGastos = f.salio > 0;
          const margen = hayGastos ? margenDeCaja(f.entro, f.salio) : null;
          const gastosPct = margen !== null ? Math.round((margen - 100) * 100) / 100 : null;
          return (
            <div key={f.etiqueta} className={`min-w-0 ${f.esGrupo ? "rounded-xl bg-gray-50 px-3 py-2 lg:-my-2" : ""}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-sm ${f.esGrupo ? "font-bold" : "font-semibold"} text-gray-900`}>{f.etiqueta}</span>
                {!f.esGrupo && f.corte && (
                  <span className={`text-[10px] ${!f.mesCompleto && f.corte < (cortes.reduce((m, c) => (c > m ? c : m), "")) ? "text-amber-700" : "text-gray-400"}`}>
                    datos al {dm(f.corte)}
                  </span>
                )}
                {f.esGrupo && fechasDistintas && <span className="text-[10px] text-amber-700">fechas distintas</span>}
              </div>
              {f.entro === 0 && !hayGastos ? (
                <p className="mt-1 text-xs text-gray-400">Sin Excel de {periodo.toLowerCase().split(" ")[0]}</p>
              ) : (
                <div className="mt-1 space-y-0.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="text-[11px] text-gray-500">Ingresos</span>
                    <span className="tabular-nums text-sm font-semibold text-gray-900">{formatCurrency(f.entro)}</span>
                  </div>
                  <div className="flex justify-end">
                    <span className={`tabular-nums text-xs font-semibold ${margen === null ? "text-gray-400" : margen < 0 ? "text-red-600" : "text-emerald-700"}`}>
                      {margen === null ? "—" : pct(margen)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="text-[11px] text-gray-500">Gastos</span>
                    <span className="tabular-nums text-sm font-semibold text-gray-900">{formatCurrency(f.salio)}</span>
                  </div>
                  <div className="flex justify-end">
                    <span className="tabular-nums text-xs text-gray-500">{gastosPct === null ? "falta el Excel" : pct(gastosPct)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-3 border-t border-gray-100 pt-2.5 text-[11px] leading-relaxed text-gray-500">
        Es caja, no ganancia: incluye cobros de meses anteriores, cuotas de deuda y ahorro.{" "}
        <Link href={mesesHref} className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">
          ¿Ganó o perdió cada sede? <ArrowRight className="h-3 w-3" />
        </Link>
      </p>
    </section>
  );
}
