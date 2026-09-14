"use client";

/**
 * ¿Cubrimos los costos del mes? — pedido de Jahnn, 14-sep-2026.
 *
 * El administrador ve el punto de equilibrio de SU sede contra lo que va
 * registrando cada día. Es el mismo número que usa el bono (una sola
 * fuente: `getEntradaCandadoVentas`), así que nunca puede ver una meta y
 * cobrar contra otra.
 *
 * Solo la meta y el avance: los costos fijos y variables de la sede no
 * se muestran acá — el administrador necesita saber cuánto vender, no el
 * detalle de la planilla.
 */

import { Scale } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { EstadoCandadoVentas } from "@/lib/incentives/candado-ventas";

function diasQueQuedan(month: string): number | null {
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  if (hoy.slice(0, 7) !== month) return null;
  const [y, m] = month.split("-").map(Number);
  // Hoy todavía se puede vender: cuenta como día que queda.
  return new Date(y, m, 0).getDate() - Number(hoy.slice(8, 10)) + 1;
}

export function EquilibrioCard({ e, month }: { e: EstadoCandadoVentas | null; month: string }) {
  if (!e) return null;
  const quedan = diasQueQuedan(month);
  const enCurso = quedan !== null;

  if (e.meta === null) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 text-xs text-gray-500">
        <div className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2"><Scale className="w-4 h-4 text-primary" /> Punto de equilibrio</div>
        Aún no se puede calcular: faltan meses completos con ventas y gastos.
      </div>
    );
  }

  const pct = Math.min(100, e.avancePct ?? 0);
  const color = e.cumple ? "bg-emerald-500" : e.enCamino ? "bg-amber-400" : "bg-red-500";
  const porDia = enCurso && !e.cumple && e.falta !== null && quedan! > 0 ? e.falta / quedan! : null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Scale className="w-4 h-4 text-primary" /> ¿Cubrimos los costos del mes?
          </div>
          <div className="text-[11px] text-gray-500">
            Punto de equilibrio: lo mínimo que la sede tiene que vender para no perder plata. Delivery incluido.
          </div>
        </div>
        <span className={`text-[11px] rounded-full px-2.5 py-1 border ${e.vinculante ? "bg-primary/5 border-primary/30 text-primary font-medium" : "bg-gray-50 border-gray-200 text-gray-500"}`}>
          {e.vinculante ? (e.provisional ? "Requisito del bono · meta provisional" : "Requisito del bono") : "Informativo · desde octubre cuenta para el bono"}
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-2xl font-black text-gray-900">{formatCurrency(e.ventas)}</span>
        <span className="text-sm text-gray-500">de {formatCurrency(e.meta)}</span>
        <span className="text-sm font-semibold text-gray-700">({e.avancePct}%)</span>
      </div>

      <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>

      <div className="text-xs text-gray-600">
        {e.cumple ? (
          <strong className="text-emerald-700">Cubierto: la sede ya vendió lo necesario para cubrir sus costos del mes.</strong>
        ) : enCurso ? (
          <>
            Faltan <strong>{formatCurrency(e.falta ?? 0)}</strong>
            {porDia !== null && <> · <strong>{formatCurrency(porDia)}</strong> por día en los {quedan} día(s) que quedan</>}
            {e.proyeccion !== null && (
              <> · al ritmo actual cerramos en <strong className={e.enCamino ? "text-emerald-700" : "text-red-700"}>{formatCurrency(e.proyeccion)}</strong>
                {e.enCamino ? " (alcanza)" : " (no alcanza)"}</>
            )}
          </>
        ) : (
          <strong className="text-red-700">No se cubrió: faltaron {formatCurrency(e.falta ?? 0)}.</strong>
        )}
      </div>
      <div className="text-[11px] text-gray-400">
        Con {e.diasConVenta} día(s) de venta registrados. Si falta registrar algún día, el avance sale más bajo de lo real.
      </div>
    </div>
  );
}
