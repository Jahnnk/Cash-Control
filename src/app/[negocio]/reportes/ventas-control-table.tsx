"use client";

/**
 * Ventas de Byte por día, conciliadas con el crédito y contado de Kelly.
 *
 * Mismas columnas y mismo orden que la pestaña "CONTROL VENTAS" del Excel
 * de Kelly, a propósito: si Jahnn la tiene abierta al lado, tiene que
 * poder comparar fila por fila sin traducir nada. Lo que cambia es que el
 * sistema resalta los días con variación y distingue un día que Kelly aún
 * no clasificó ("pendiente") de uno que cuadra.
 */

import { AlertTriangle } from "lucide-react";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import type { ConciliacionVentasMes } from "@/lib/ventas-control-conciliacion";

const monto = (n: number | null) => (n === null ? null : formatCurrency(n));

export function VentasControlTable({ c }: { c: ConciliacionVentasMes }) {
  const pendientes = c.dias.filter((d) => d.total === null);
  return (
    <div>
      <div className="px-6 py-3 text-xs text-gray-600 bg-gray-50 border-b border-gray-100 space-y-1">
        <div>
          <strong>Total vendido</strong>: Byte{c.byteHasta && <> (cargado hasta el {formatDateShort(c.byteHasta)})</>}.{" "}
          <strong>Crédito y contado</strong>: Excel de Kelly
          {c.kellyHasta ? <> (hasta el {formatDateShort(c.kellyHasta)})</> : <> (todavía no cargado)</>}.{" "}
          <strong>Variación</strong> = total vendido − (crédito + contado).
        </div>
        {c.diasConVariacion > 0 && (
          <div className="text-amber-800">
            {c.diasConVariacion} día(s) con variación, por {formatCurrency(c.conciliado.variacion)} en total: venta que no está clasificada, o contado que Byte no registró. Hay que revisarlos con Kelly.
          </div>
        )}
        {c.diasCopiaDistinta > 0 && (
          <div className="text-red-700">
            {c.diasCopiaDistinta} día(s) donde el total de Byte que copió Kelly no coincide con el que subió Luis.
          </div>
        )}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase text-gray-500 bg-gray-50">
            <th className="text-left px-3 py-2 font-medium">Día</th>
            <th className="text-right px-3 py-2 font-medium"># Pedidos</th>
            <th className="text-right px-3 py-2 font-medium">Descuentos</th>
            <th className="text-right px-3 py-2 font-medium">Total vendido</th>
            <th className="text-right px-3 py-2 font-medium">Vta. crédito</th>
            <th className="text-right px-3 py-2 font-medium">Vta. contado</th>
            <th className="text-right px-3 py-2 font-medium">Total</th>
            <th className="text-right px-3 py-2 font-medium">Variación</th>
            <th className="text-left px-3 py-2 font-medium">Nota</th>
          </tr>
        </thead>
        <tbody>
          {c.dias.map((d) => {
            const conVariacion = d.variacion !== null && Math.abs(d.variacion) >= 0.01;
            return (
              <tr key={d.date} className={`border-t border-gray-100 ${conVariacion ? "bg-amber-50/70" : ""}`}>
                <td className="px-3 py-2 font-medium whitespace-nowrap">{formatDateShort(d.date)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{d.pedidos}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-500">{formatCurrency(d.descuentos)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">
                  {d.copiaDistinta && (
                    <span title={`Luis subió ${formatCurrency(d.copiaDistinta.byte)}; Kelly copió ${formatCurrency(d.copiaDistinta.kelly)}`}>
                      <AlertTriangle className="inline w-3.5 h-3.5 text-red-600 mr-1" />
                    </span>
                  )}
                  {formatCurrency(d.totalVendido)}
                </td>
                {d.total === null ? (
                  <td colSpan={4} className="px-3 py-2 text-right text-xs text-gray-400">Pendiente del Excel de Kelly</td>
                ) : (
                  <>
                    <td className="px-3 py-2 text-right tabular-nums">{monto(d.ventaCredito)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{monto(d.ventaContado)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{monto(d.total)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${conVariacion ? "text-amber-700" : "text-gray-400"}`}>
                      {monto(d.variacion)}
                    </td>
                  </>
                )}
                <td className="px-3 py-2 text-xs text-gray-500">{d.nota ?? ""}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 font-semibold border-t border-gray-200">
            <td className="px-3 py-3">Total</td>
            <td className="px-3 py-3 text-right tabular-nums">{c.dias.reduce((t, d) => t + d.pedidos, 0)}</td>
            <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(c.dias.reduce((t, d) => t + d.descuentos, 0))}</td>
            <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(c.totalVendido)}</td>
            <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(c.conciliado.ventaCredito)}</td>
            <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(c.conciliado.ventaContado)}</td>
            <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(c.conciliado.total)}</td>
            <td className={`px-3 py-3 text-right tabular-nums ${Math.abs(c.conciliado.variacion) >= 0.01 ? "text-amber-700" : ""}`}>
              {formatCurrency(c.conciliado.variacion)}
            </td>
            <td />
          </tr>
          {pendientes.length > 0 && (
            <tr>
              <td colSpan={9} className="px-3 py-2 text-[11px] text-gray-500">
                Crédito, contado y variación suman solo los días que Kelly ya clasificó. Faltan {pendientes.length} día(s) por{" "}
                {formatCurrency(pendientes.reduce((t, d) => t + d.totalVendido, 0))} de venta.
              </td>
            </tr>
          )}
        </tfoot>
      </table>
    </div>
  );
}
