"use client";

/**
 * "¿El sistema muestra lo que dice el Excel de Kelly?" — la verificación
 * automática de cada sede y mes (pedido de Jahnn, 25-sep-2026: "no puedo
 * hacer siempre el mismo trabajo de comparar"). Plegada por defecto: el
 * resumen dice si todo cuadra; las diferencias además salen en "Acciones de
 * hoy". Motor en lib/verificacion-kelly.ts.
 */

import { useState } from "react";
import { monthLabel } from "@/lib/utils";
import { SeccionDesplegable } from "@/components/productos/ui";
import { DetalleCuadre, EstadoCuadre } from "@/components/cuadre-kelly";
import type { VerificacionSedeMes } from "@/app/actions/verificacion-kelly";

export function CuadreKellySeccion({ items }: { items: VerificacionSedeMes[] | null }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  if (!items) return null;
  const conAlerta = items.filter((v) => v.estado === "alerta");
  const meses = [...new Set(items.map((v) => v.month))];
  // Las recientes (este mes y el anterior) son las MISMAS que cuenta «Necesita tu atención» en el
  // Resumen; las más viejas se nombran aparte. Antes el Resumen decía 3 y esta pestaña 6 (8-oct-2026).
  const recientesMeses = [...meses].sort().reverse().slice(0, 2);
  const recientes = conAlerta.filter((v) => recientesMeses.includes(v.month));
  const viejas = conAlerta.length - recientes.length;
  return (
    <SeccionDesplegable
      titulo="Cuadre con el Excel"
      subtitulo="El sistema compara solo cada carga con el Excel: que no falte ni sobre plata, que cada diferencia tenga su razón y que los datos tengan sentido."
      resumen={
        conAlerta.length === 0
          ? <span className="text-xs font-medium text-emerald-700">✓ Las {items.length} cargas de los últimos {meses.length} meses cuadran con el Excel</span>
          : <span className="text-xs font-medium text-red-700">
              ⚠ {recientes.length > 0
                ? <>{recientes.length} {recientes.length === 1 ? "carga reciente" : "cargas recientes"} con diferencias: {recientes.map((v) => `${v.sede} ${monthLabel(v.month)}`).join(", ")}</>
                : "Sin diferencias en las cargas recientes"}
              {viejas > 0 && <span className="font-normal text-red-700/80"> · y {viejas} de meses anteriores</span>}
            </span>
      }
    >
      <div className="space-y-6">
        {meses.map((m) => (
          <div key={m} className="space-y-2">
            <h4 className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{monthLabel(m)}</h4>
            <div className="divide-y divide-gray-100 rounded-xl border border-gray-200/80">
              {items.filter((v) => v.month === m).map((v) => {
                const k = `${v.businessId}-${v.month}`;
                const abiertoEste = abierto === k;
                return (
                  <div key={k}>
                    <button
                      type="button"
                      onClick={() => setAbierto(abiertoEste ? null : k)}
                      aria-expanded={abiertoEste}
                      className="w-full flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-gray-50/60"
                    >
                      <span className="text-sm font-medium text-gray-900">{v.sede}</span>
                      <span className="flex items-center gap-3">
                        <EstadoCuadre v={v} />
                        <span className="text-xs text-primary">{abiertoEste ? "Cerrar" : "Ver detalle"}</span>
                      </span>
                    </button>
                    {abiertoEste && <div className="px-4 pb-4"><DetalleCuadre v={v} /></div>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </SeccionDesplegable>
  );
}
