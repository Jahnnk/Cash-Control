"use client";

/**
 * Los dos márgenes por sede y por mes (pedido de Jahnn, 4-oct-2026): el de
 * ganancia (¿ganó o perdió?) y el de caja (¿alcanzó el dinero?, el que Kelly
 * escribe en su Excel), con una cartilla para leerlos. Números y fórmulas:
 * src/lib/margenes-del-mes.ts. UX (8-oct-2026): plegado como los otros reportes, con los dos
 * márgenes del Grupo a la vista; montos sin céntimos; la cartilla, a un toque dentro.
 */

import { Scale, Wallet } from "lucide-react";
import { SeccionDesplegable } from "@/components/productos/ui";
import { formatCurrency } from "@/lib/utils";
import { margenesDelMes, porQueDifieren, type FilaMargenes } from "@/lib/margenes-del-mes";
import type { SeisCifras } from "@/app/actions/seis-cifras";

/** El de ganancia con 1 decimal (16.7%); el de caja con 2, como lo escribe el Excel (10.59%). */
const pct = (n: number | null, dec = 1, signo = true) =>
  n === null ? "—" : `${signo && n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: dec, maximumFractionDigits: dec })}%`;
const dd = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const color = (n: number | null) => (n === null ? "text-gray-400" : n < 0 ? "text-red-600" : "text-gray-900");
const soles = (n: number) => `S/${Math.round(Math.abs(n)).toLocaleString("es-PE")}`;

function Fila({ f, finDeMes }: { f: FilaMargenes; finDeMes: string }) {
  const aMedias = !f.mesCompleto && (f.esGrupo || (f.corte !== null && f.corte < finDeMes));
  return (
    <tr className={f.esGrupo ? "bg-gray-50/70 font-semibold" : ""}>
      <td className="py-3 pl-4 pr-3 align-top">
        <div className="text-gray-900">{f.etiqueta}</div>
        {!f.esGrupo && f.corte && aMedias && <div className="text-[10px] font-normal text-amber-700">datos hasta el {dd(f.corte)}</div>}
      </td>
      <td className="py-3 px-3 text-right align-top">
        <div className={`tabular-nums ${f.gananciaPct === null ? "text-gray-400" : f.gananciaPct < 0 ? "text-red-600" : "text-emerald-700"}`}>{pct(f.gananciaPct)}</div>
        <div className="text-[10px] font-normal text-gray-400 leading-tight">
          {f.gananciaPct === null
            ? (f.sinGananciaPorque ?? "Sin datos")
            : f.ganancia !== null && f.ventas !== null ? `${f.ganancia < 0 ? "−" : ""}${soles(f.ganancia)} de ${soles(f.ventas)} vendidos` : ""}
        </div>
      </td>
      <td className="py-3 px-3 text-right align-top">
        <div className={`tabular-nums ${color(f.margenCajaPct)}`}>{pct(f.margenCajaPct, 2)}</div>
        <div className="text-[10px] font-normal text-gray-400 leading-tight">
          {f.margenCajaPct === null ? (f.sinGananciaPorque ?? "Sin ingresos") : `${f.flujo < 0 ? "−" : "+"}${soles(f.flujo)} de ${soles(f.entro)} que entraron`}
        </div>
      </td>
      <td className="py-3 pl-3 pr-4 text-right align-top tabular-nums text-gray-600 font-normal hidden sm:table-cell">
        {f.salioPor100 === null ? "—" : `S/${f.salioPor100.toFixed(2)}`}
      </td>
    </tr>
  );
}

function Cartilla({ cifras }: { cifras: SeisCifras }) {
  const dif = porQueDifieren(cifras);
  const filaEjemplo = margenesDelMes(cifras).find((f) => !f.esGrupo && f.gananciaPct !== null && f.margenCajaPct !== null) ?? null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-emerald-900"><Scale className="w-4 h-4" />Margen de ganancia</h4>
          <p className="mt-1 text-xs font-medium text-emerald-800">¿Ganó o perdió la sede?</p>
          <p className="mt-2 text-xs text-gray-700 leading-relaxed">
            Lo que de verdad le queda al negocio de cada S/ 100 que vendió, después de pagar lo que cuesta vender (costos), lo que cuesta funcionar (gastos) y los impuestos.
          </p>
          <p className="mt-2 rounded-md bg-white/70 px-2.5 py-1.5 text-[11px] text-gray-700">(Ventas − Costos − Gastos − Impuestos) ÷ Ventas</p>
          <p className="mt-2 text-[11px] text-gray-600 leading-relaxed"><strong>No cuenta:</strong> cuotas de deuda, préstamos, ahorro a fondos mutuos, utilidades a socios ni compra de equipos: eso no es ganar ni perder.</p>
          {filaEjemplo && filaEjemplo.gananciaPct !== null && (
            <p className="mt-2 text-[11px] text-emerald-900">Ejemplo del mes: {filaEjemplo.etiqueta} {filaEjemplo.gananciaPct < 0 ? "perdió" : "se quedó con"} <strong>S/ {Math.abs(filaEjemplo.gananciaPct).toLocaleString("es-PE", { maximumFractionDigits: 1 })}</strong> de cada S/ 100 que vendió.</p>
          )}
          <p className="mt-2 text-[11px] text-gray-600"><strong>Úsalo para:</strong> saber si una sede es rentable y comparar sedes entre sí.</p>
        </div>

        <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-4">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-sky-900"><Wallet className="w-4 h-4" />Margen de caja</h4>
          <p className="mt-1 text-xs font-medium text-sky-800">¿Alcanzó el dinero?</p>
          <p className="mt-2 text-xs text-gray-700 leading-relaxed">
            Cuánto sobró (o faltó) en el banco y la caja, comparado con lo que entró. Es el margen que Kelly escribe en cada hoja del Excel.
          </p>
          <p className="mt-2 rounded-md bg-white/70 px-2.5 py-1.5 text-[11px] text-gray-700">(Entró − Salió) ÷ Entró</p>
          <p className="mt-2 text-[11px] text-gray-600 leading-relaxed"><strong>Cuenta todo</strong> lo que entró y salió: ventas, préstamos recibidos, rescates, cuotas de deuda, ahorro, utilidades a socios y equipos.</p>
          {filaEjemplo && filaEjemplo.salioPor100 !== null && (
            <p className="mt-2 text-[11px] text-sky-900">Ejemplo del mes: {filaEjemplo.etiqueta} gastó <strong>S/ {filaEjemplo.salioPor100.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> por cada S/ 100 que le entraron (la última columna).</p>
          )}
          <p className="mt-2 text-[11px] text-gray-600"><strong>Úsalo para:</strong> saber si hubo plata para pagar, no si ganaste. Va junto con la liquidez.</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h4 className="text-sm font-semibold text-gray-900">¿Por qué no coinciden?</h4>
        <p className="mt-1.5 text-xs text-gray-600 leading-relaxed">
          Porque hay plata que sale (o entra) de la caja sin ser ganancia ni pérdida: pagar una deuda reduce la caja pero no es un gasto del negocio; recibir un préstamo la aumenta pero no es una venta; mandar plata a fondos mutuos no es perderla.
        </p>
        {dif && (
          <p className="mt-2 text-xs text-gray-800 leading-relaxed">
            <strong>En este mes:</strong> {dif.sede} {dif.gananciaPct >= 0 ? "ganó" : "perdió"} {pct(dif.gananciaPct, 1, false)} pero su caja quedó en {pct(dif.cajaPct, 2)}.
            {dif.motivos.length > 0 && <> De su caja salieron {dif.motivos.map((m) => `${formatCurrency(m.monto)} en ${m.etiqueta}`).join(", ")}, que no cuentan como gasto.</>}
            {" "}Además pudieron entrar préstamos o rescates, que tampoco son ventas.
          </p>
        )}
        <p className="mt-2 text-[11px] text-gray-500 leading-relaxed">
          <strong>Regla simple:</strong> para saber si una sede va bien y compararlas, mira el margen de ganancia. Para saber si alcanza el dinero este mes, mira el margen de caja y la liquidez.
        </p>
      </div>
    </div>
  );
}

export function DosMargenes({ cifras, periodo }: { cifras: SeisCifras | null; periodo: string }) {
  if (!cifras) return null;
  const filas = margenesDelMes(cifras);
  const [y, m] = cifras.mes.split("-").map(Number);
  const finDeMes = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const provisional = filas.some((f) => !f.esGrupo && f.corte !== null && f.corte < finDeMes);
  const g = filas.find((f) => f.esGrupo);
  const resumen = g && (g.gananciaPct !== null || g.margenCajaPct !== null)
    ? <p className="text-xs text-gray-600">Grupo: ganancia <b className={g.gananciaPct !== null && g.gananciaPct < 0 ? "text-red-700" : "text-gray-900"}>{pct(g.gananciaPct)}</b> · caja <b className={g.margenCajaPct !== null && g.margenCajaPct < 0 ? "text-red-700" : "text-gray-900"}>{pct(g.margenCajaPct, 2)}</b></p>
    : <p className="text-xs text-gray-500">Todavía sin márgenes para {periodo}.</p>;
  return (
    <SeccionDesplegable titulo="Los dos márgenes" subtitulo="Uno dice si la sede ganó; el otro, si alcanzó el dinero." resumen={resumen}>
      <div className="space-y-3">
        <div className="-mx-4 sm:mx-0 sm:rounded-xl sm:border sm:border-gray-200/80 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] sm:text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
                <th className="text-left font-medium py-2.5 pl-4 pr-3">Sede</th>
                <th className="text-right font-medium py-2.5 px-3">De ganancia</th>
                <th className="text-right font-medium py-2.5 px-3">De caja <span className="hidden sm:inline normal-case tracking-normal text-gray-400">(el del Excel)</span></th>
                <th className="text-right font-medium py-2.5 pl-3 pr-4 hidden sm:table-cell">Salió por cada S/ 100</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filas.map((f) => <Fila key={f.etiqueta} f={f} finDeMes={finDeMes} />)}
            </tbody>
          </table>
        </div>
        {provisional && <p className="text-[11px] text-amber-700">Mes a medias: ambos márgenes llegan hasta el último día con Excel de cada sede.</p>}
        <details className="group">
          <summary className="cursor-pointer list-none text-xs font-medium text-primary hover:underline">
            <span className="group-open:hidden">¿Cómo leer los dos márgenes?</span><span className="hidden group-open:inline">Ocultar la explicación</span>
          </summary>
          <div className="mt-3"><Cartilla cifras={cifras} /></div>
        </details>
      </div>
    </SeccionDesplegable>
  );
}
