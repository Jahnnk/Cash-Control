"use client";

/**
 * "¿Están al día los reportes?" — lo primero que Jahnn quiere saber al
 * mirar los KPIs de la semana (pedido del 16-ago-2026).
 *
 * Diseño: cuando todo está al día es UNA línea verde y nada más. La
 * cuadrícula sede × día solo se abre si hay algo que reclamar, o si él
 * la pide. Un panel que grita todos los días deja de mirarse.
 */

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, ChevronDown, Loader2, Clock } from "lucide-react";
import { getLlenadoReportes } from "@/app/actions/llenado-reportes";
import { resumenFaltantes, etiquetaDia, type EstadoLlenado, type EstadoDia } from "@/lib/kpis/llenado";
import { conReintento } from "@/lib/con-reintento";

/** Cómo se ve cada casilla. El gris claro es "no aplica", no "mal". */
const CELDA: Record<EstadoDia, { clase: string; titulo: string }> = {
  lleno: { clase: "bg-emerald-500", titulo: "Registrado" },
  incompleto: { clase: "bg-amber-400", titulo: "Registrado, falta un dato" },
  falta: { clase: "bg-red-500", titulo: "Sin registrar" },
  hoy: { clase: "bg-gray-300 ring-2 ring-gray-400 ring-offset-1", titulo: "Es hoy: aún puede registrarse" },
  futuro: { clase: "bg-gray-100", titulo: "Todavía no llega" },
  "dia-libre": {
    clase: "bg-gray-50 border border-gray-200",
    titulo: "Día libre: esta sede no reporta ese día",
  },
  "sin-operar": { clase: "bg-gray-50 border border-dashed border-gray-200", titulo: "La sede aún no operaba" },
};

const DIAS = ["D", "L", "M", "M", "J", "V", "S"];

export function EstadoLlenadoReportes({ weekStart }: { weekStart: string }) {
  const [data, setData] = useState<EstadoLlenado | null>(null);
  const [abierto, setAbierto] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setData(await conReintento(() => getLlenadoReportes(weekStart)));
    } catch (e) {
      console.error("[EstadoLlenado] cargar:", e);
    }
  }, [weekStart]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar y al cambiar de semana */
    void cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargar]);

  if (!data) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-300" />
        <span className="text-xs text-gray-400">Revisando los reportes…</span>
      </div>
    );
  }
  if (data.sedes.length === 0) return null;

  const faltan = data.totalFaltan;
  const resumen = resumenFaltantes(data);
  // Si hay deuda se abre solo: es justo lo que vino a buscar.
  const mostrarTabla = abierto || faltan > 0;

  return (
    <div
      className={`rounded-lg border overflow-hidden ${
        faltan > 0 ? "border-red-200 bg-red-50/50" : "border-emerald-200 bg-emerald-50/40"
      }`}
    >
      <button
        onClick={() => setAbierto((v) => !v)}
        className="w-full px-3 py-2.5 flex items-start justify-between gap-3 text-left"
      >
        <div className="flex items-start gap-2 min-w-0">
          {faltan > 0 ? (
            <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
          )}
          <div className="min-w-0">
            <div
              className={`text-xs font-semibold ${
                faltan > 0 ? "text-red-900" : "text-emerald-900"
              }`}
            >
              {faltan > 0
                ? `Faltan ${faltan} ${faltan === 1 ? "reporte" : "reportes"} de esta semana`
                : "Reportes al día en las 3 sedes"}
            </div>
            {faltan > 0 && (
              <div className="text-[11px] text-red-800/90 mt-0.5">{resumen}</div>
            )}
            {faltan === 0 && data.pendientesHoy.length > 0 && (
              <div className="text-[11px] text-emerald-800/80 mt-0.5 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Falta el cierre de hoy en {data.pendientesHoy.join(", ")} — normal hasta la noche
              </div>
            )}
            {faltan === 0 && data.totalIncompletos > 0 && (
              <div className="text-[11px] text-amber-700 mt-0.5">
                {data.totalIncompletos}{" "}
                {data.totalIncompletos === 1 ? "día registrado" : "días registrados"} sin NPS o mermas
              </div>
            )}
          </div>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${
            mostrarTabla ? "rotate-180" : ""
          }`}
        />
      </button>

      {mostrarTabla && (
        <div className="px-3 pb-3 bg-white/70">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="text-left font-medium text-gray-400 pb-1 w-20"></th>
                {DIAS.map((d, i) => (
                  <th key={i} className="pb-1 text-[10px] font-semibold text-gray-400 text-center">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.sedes.map((s) => (
                <tr key={s.businessId}>
                  <td className="py-1 pr-2 text-[11px] font-medium text-gray-700 whitespace-nowrap">
                    {s.sede}
                  </td>
                  {s.dias.map((d) => {
                    const c = CELDA[d.estado];
                    const detalle =
                      d.estado === "incompleto" && d.faltan.length > 0
                        ? `${c.titulo}: ${d.faltan.join(", ")}`
                        : c.titulo;
                    return (
                      <td key={d.fecha} className="py-1 text-center">
                        <span
                          className={`inline-block w-4 h-4 rounded ${c.clase}`}
                          title={`${etiquetaDia(d.fecha)} · ${detalle}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px] text-gray-500">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded bg-emerald-500" /> registrado
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded bg-amber-400" /> falta un dato
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded bg-red-500" /> sin registrar
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded bg-gray-300 ring-1 ring-gray-400" /> hoy
            </span>
          </div>

          <p className="text-[10px] text-gray-400 mt-1.5">
            Atelier se llena con el reporte de Byte y no reporta domingos (día libre);
            Fonavi y Centro, con el registro diario del administrador.
          </p>
        </div>
      )}
    </div>
  );
}
