"use client";

/**
 * Cómo se ve la verificación automática del Excel de Kelly (motor en
 * lib/verificacion-kelly.ts). Se usa en Grupo → Excel de Kelly y al
 * terminar cada carga.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { formatCurrency, monthLabel } from "@/lib/utils";
import type { LineaPuente } from "@/lib/verificacion-kelly";
import { getVerificacionDeLote, type VerificacionSedeMes } from "@/app/actions/verificacion-kelly";

function Puente({ titulo, lineas, total }: { titulo: string; lineas: LineaPuente[]; total: number }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-2">{titulo}</div>
      <table className="w-full text-sm">
        <tbody>
          {lineas.map((l, i) => (
            <tr key={i} className={l.etiqueta === "Sin explicar" || l.etiqueta.startsWith("Diferencia") ? "text-red-700 font-medium" : "text-gray-700"}>
              <td className="py-1 pr-3">
                {l.etiqueta}
                {l.nota && <div className="text-[11px] text-gray-400">{l.nota}</div>}
              </td>
              <td className="py-1 text-right tabular-nums whitespace-nowrap">{i > 0 ? (l.monto < 0 ? "− " : "+ ") : ""}{formatCurrency(Math.abs(l.monto))}</td>
            </tr>
          ))}
          <tr className="border-t border-gray-200 font-semibold text-gray-900">
            <td className="pt-2 pr-3">Lo que muestra el sistema</td>
            <td className="pt-2 text-right tabular-nums">{formatCurrency(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Estado en una línea: ✓ cuadra, ⚠ N alertas, o sin foto. */
export function EstadoCuadre({ v }: { v: VerificacionSedeMes }) {
  if (v.estado === "alerta") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">
        <AlertTriangle className="w-3.5 h-3.5" /> {v.alertas.length} {v.alertas.length === 1 ? "diferencia" : "diferencias"}
      </span>
    );
  }
  if (v.estado === "sin-foto") {
    return <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">Revisado sin foto del Excel</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
      <CheckCircle2 className="w-3.5 h-3.5" /> Cuadra con el Excel
    </span>
  );
}

/** El detalle de una sede y mes: alertas arriba, puentes abajo. */
export function DetalleCuadre({ v }: { v: VerificacionSedeMes }) {
  return (
    <div className="space-y-4">
      {v.alertas.length > 0 && (
        <ul className="space-y-2">
          {v.alertas.map((a, i) => (
            <li key={i} className="flex gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-900">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <div><div className="font-medium">{a.titulo}</div><div className="text-xs text-red-800 mt-0.5">{a.detalle}</div></div>
            </li>
          ))}
        </ul>
      )}
      <div className={`grid grid-cols-1 gap-6 ${v.puenteVentas ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
        <Puente titulo="Ingresos a cuentas" lineas={v.puenteIngresos} total={v.sistema.ingresos} />
        <Puente titulo="Gastos" lineas={v.puenteGastos} total={v.sistema.gastos} />
        {v.puenteVentas && v.sistema.ventas !== null && <Puente titulo="Ventas (Byte)" lineas={v.puenteVentas} total={v.sistema.ventas} />}
      </div>
      <p className="text-[11px] text-gray-400">Archivo: {v.archivo} · cargado el {v.cargadoEl}</p>
    </div>
  );
}

/** Al terminar una carga: verifica esa carga y dice si cuadró. */
export function CuadreDeCarga({ batchId }: { batchId: string }) {
  const [v, setV] = useState<VerificacionSedeMes | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    getVerificacionDeLote(batchId).then((r) => {
      if (!vivo) return;
      if (r.ok) setV(r.item); else setError(r.error);
    });
    return () => { vivo = false; };
  }, [batchId]);
  if (error) return <p className="text-xs text-gray-500">No se pudo verificar la carga: {error}</p>;
  if (!v) return <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Verificando contra el Excel…</div>;
  return (
    <div className={`rounded-lg border p-3 space-y-3 ${v.estado === "alerta" ? "border-red-200 bg-white" : "border-emerald-200 bg-emerald-50/40"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-900">Verificación · {v.sede} · {monthLabel(v.month)}</span>
        <EstadoCuadre v={v} />
      </div>
      {v.estado === "alerta" ? <DetalleCuadre v={v} /> : (
        <p className="text-xs text-gray-600">
          Lo cargado suma lo mismo que el Excel y cada diferencia con lo que muestra el sistema tiene su razón.
          Ingresos {formatCurrency(v.sistema.ingresos)} · gastos {formatCurrency(v.sistema.gastos)}
          {v.sistema.ventas !== null && <> · ventas {formatCurrency(v.sistema.ventas)}</>}.
        </p>
      )}
    </div>
  );
}
