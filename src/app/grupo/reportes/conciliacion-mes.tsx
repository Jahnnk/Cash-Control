"use client";

/**
 * Conciliación del mes: la que Jahnn hizo a mano con setiembre (16-oct-2026), ahora sola y sede por sede,
 * en sus cuatro pasos. Plegada por defecto, con el resumen a la vista. La cuenta: lib/conciliacion-mes.ts.
 */

import { useState } from "react";
import { SeccionDesplegable } from "@/components/productos/ui";
import { formatCurrency } from "@/lib/utils";
import { conciliacionDelMes, type ConciliacionSede, type Linea } from "@/lib/conciliacion-mes";
import type { SeisCifras } from "@/app/actions/seis-cifras";

const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`);
const conSigno = (n: number) => `${n < 0 ? "−" : ""}${formatCurrency(Math.abs(n))}`;

function Paso({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200/80 p-3 sm:p-4 min-w-0">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-5 h-5 shrink-0 rounded-full bg-primary text-white text-[11px] font-semibold flex items-center justify-center">{n}</span>
        <h4 className="text-sm font-semibold text-gray-900">{titulo}</h4>
      </div>
      {children}
    </div>
  );
}

function Tabla({ inicio, lineas, fin, sinExplicar }: { inicio: Linea; lineas: Linea[]; fin: Linea; sinExplicar?: number }) {
  return (
    <table className="w-full text-xs table-fixed">
      <tbody className="divide-y divide-gray-100">
        <tr><td className="py-1.5 pr-2 font-medium text-gray-800">{inicio.etiqueta}</td><td className="py-1.5 w-28 text-right tabular-nums font-medium text-gray-900">{conSigno(inicio.monto)}</td></tr>
        {lineas.map((l) => (
          <tr key={l.etiqueta}>
            <td className="py-1.5 pr-2 text-gray-600">{l.etiqueta}{l.nota && <span className="block text-[10px] text-gray-400 leading-snug">{l.nota}</span>}</td>
            <td className="py-1.5 w-28 text-right tabular-nums text-gray-700 align-top">{conSigno(l.monto)}</td>
          </tr>
        ))}
        {sinExplicar !== undefined && Math.abs(sinExplicar) >= 0.01 && (
          <tr><td className="py-1.5 pr-2 text-red-700">Sin explicar (avísale a Claude)</td><td className="py-1.5 w-28 text-right tabular-nums text-red-700">{conSigno(sinExplicar)}</td></tr>
        )}
        <tr className="border-t-2 border-gray-200"><td className="py-1.5 pr-2 font-semibold text-gray-900">{fin.etiqueta}</td><td className="py-1.5 w-28 text-right tabular-nums font-semibold text-gray-900">{conSigno(fin.monto)}</td></tr>
      </tbody>
    </table>
  );
}

function Sede({ c }: { c: ConciliacionSede }) {
  const v = c.ventas;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <Paso n={1} titulo="Ventas: Byte contra el Excel">
        {v.estado === "sin-datos" ? <p className="text-xs text-gray-500">Falta la venta de Byte o el grupo «Ventas» del Excel.</p> : (
          <>
            <Tabla inicio={{ etiqueta: "Vendido según Byte", monto: v.byte! }} lineas={[]} fin={{ etiqueta: "Llegó al banco por ventas (Excel)", monto: v.excel! }} />
            <p className={`mt-2 text-xs ${v.estado === "revisar" ? "text-red-700" : "text-gray-600"}`}>
              Diferencia <b className="tabular-nums">{conSigno(v.dif!)}</b> ({pct(v.difPct)}).{" "}
              {v.estado === "credito" ? "Atelier vende a crédito: lo que entra son cobros de otros meses, así que esta diferencia no dice si algo está mal."
                : v.estado === "revisar" ? "Más de 5% en un mes cerrado: revisarlo con Kelly."
                : c.mesCerrado ? "✓ Normal (hasta 5%): abonos del POS que llegan después y comisiones." : "Mes en curso: los abonos del POS llegan con retraso."}
            </p>
          </>
        )}
      </Paso>
      <Paso n={2} titulo="Lo que entró: ventas y lo demás">
        <Tabla inicio={{ etiqueta: "Entró a la cuenta", monto: c.entro.total }} lineas={c.entro.lineas} fin={{ etiqueta: "Ingresos de la operación", monto: c.entro.operacion }} sinExplicar={c.entro.sinExplicar} />
        <p className="mt-2 text-[11px] text-gray-500">Solo las dos primeras líneas son de la operación; el resto entró por otros motivos.</p>
      </Paso>
      <Paso n={3} titulo="Lo que salió: el egreso real">
        <Tabla inicio={{ etiqueta: "Salió de la cuenta", monto: c.salio.total }} lineas={c.salio.lineas} fin={{ etiqueta: "Egreso real de la operación", monto: c.salio.egresoReal }} sinExplicar={c.salio.sinExplicar} />
      </Paso>
      <Paso n={4} titulo="El resultado">
        <table className="w-full text-xs table-fixed">
          <tbody className="divide-y divide-gray-100">
            <tr><td className="py-1.5 pr-2 text-gray-600">Entró − salió (la caja)<span className="block text-[10px] text-gray-400">Incluye ahorro, préstamos y utilidades: no es la ganancia</span></td><td className={`py-1.5 w-28 text-right tabular-nums align-top ${c.resultado.caja < 0 ? "text-red-700" : "text-gray-700"}`}>{conSigno(c.resultado.caja)}</td></tr>
            <tr><td className="py-1.5 pr-2 font-medium text-gray-800">Resultado de la operación<span className="block text-[10px] font-normal text-gray-400">Ingresos de la operación − egreso real</span></td><td className="py-1.5 w-28 text-right tabular-nums font-semibold align-top">{c.resultado.operacion === null ? "—" : <>{conSigno(c.resultado.operacion)}<span className="block text-[10px] font-normal text-gray-500">{pct(c.resultado.operacionPct)}</span></>}</td></tr>
            <tr><td className="py-1.5 pr-2 font-medium text-gray-800">Ganancia real<span className="block text-[10px] font-normal text-gray-400">Vendido en Byte − egreso real</span></td><td className="py-1.5 w-28 text-right tabular-nums font-semibold align-top">{c.resultado.ganancia === null ? "—" : <>{conSigno(c.resultado.ganancia)}<span className="block text-[10px] font-normal text-gray-500">{pct(c.resultado.gananciaPct)}</span></>}</td></tr>
          </tbody>
        </table>
        {!c.mesCerrado && <p className="mt-2 text-[11px] text-amber-700">Mes en curso: falta la planilla y otros pagos de fin de mes; el resultado va a bajar.</p>}
      </Paso>
    </div>
  );
}

export function ConciliacionMes({ cifras, periodo }: { cifras: SeisCifras | null; periodo: string }) {
  const sedes = cifras ? conciliacionDelMes(cifras.sedes, cifras.mes) : [];
  const [i, setI] = useState(0);
  if (sedes.length === 0) return null;
  const c = sedes[Math.min(i, sedes.length - 1)];
  const resumen = (
    <p className="text-xs text-gray-600">
      {sedes.map((s) => `${s.sede}: ${s.resultado.operacion === null ? "sin resultado" : `${conSigno(s.resultado.operacion)} de la operación`}${s.ventas.estado === "revisar" ? " ⚠ ventas" : ""}`).join(" · ")}
    </p>
  );
  return (
    <SeccionDesplegable titulo="Conciliación del mes" subtitulo={`Del Excel a los números del sistema, en cuatro pasos, como la hiciste a mano · ${periodo}`} resumen={resumen}>
      <div className="space-y-3">
        <div role="tablist" aria-label="Sede" className="inline-flex rounded-lg bg-gray-100 p-1">
          {sedes.map((s, k) => (
            <button key={s.businessId} type="button" role="tab" aria-selected={k === i} onClick={() => setI(k)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${k === i ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>{s.sede}</button>
          ))}
        </div>
        <Sede c={c} />
      </div>
    </SeccionDesplegable>
  );
}
