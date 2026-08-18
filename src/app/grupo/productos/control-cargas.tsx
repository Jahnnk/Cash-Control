"use client";

/**
 * "¿Se está subiendo el reporte de productos?" — pedido de Jahnn
 * (18-ago-2026): "el sistema deberá reportarme los días de subida de
 * este informe, que idealmente son todos los sábados. Así yo estoy
 * seguro que se sube el reporte siempre y estoy al día con los datos".
 *
 * Dos decisiones:
 *
 *  1. Cuando todo está al día es UNA línea verde y nada más. Un panel
 *     que grita todas las semanas deja de mirarse (mismo criterio que
 *     el estado de llenado de reportes).
 *  2. Una carga TRUNCADA se muestra distinta de una atrasada, y pesa
 *     más. Llegó puntual, así que por fecha estaría en verde — pero los
 *     datos no sirven, y eso es lo que hay que ver.
 */

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, CalendarClock, Loader2, ChevronDown } from "lucide-react";
import { getEstadoCargasProductos, type EstadoCargasProductos } from "@/app/actions/product-sales-import";
import { resumenPendientes, type EstadoCarga } from "@/lib/productos/cargas";
import { conReintento } from "@/lib/con-reintento";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

function fechaCorta(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES[m - 1]}`;
}

function diaSemana(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  return dias[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

const TONO: Record<EstadoCarga["estado"], { fila: string; texto: string }> = {
  "al-dia": { fila: "border-emerald-200 bg-emerald-50/50", texto: "text-emerald-800" },
  atrasado: { fila: "border-red-200 bg-red-50/50", texto: "text-red-800" },
  incompleto: { fila: "border-amber-200 bg-amber-50/60", texto: "text-amber-800" },
  nunca: { fila: "border-red-200 bg-red-50/50", texto: "text-red-800" },
};

export function ControlCargasProductos() {
  const [data, setData] = useState<EstadoCargasProductos | null>(null);
  const [abierto, setAbierto] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setData(await conReintento(() => getEstadoCargasProductos()));
    } catch (e) {
      console.error("[ControlCargasProductos] cargar:", e);
    }
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    void cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargar]);

  if (!data) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-300" />
        <span className="text-xs text-gray-400">Revisando las cargas…</span>
      </div>
    );
  }
  if (!data.esDireccion || !data.resumen) return null;

  const { resumen } = data;
  const hayProblema = !resumen.todoAlDia;
  // Con algo pendiente se abre solo: es justo lo que vino a buscar.
  const mostrar = abierto || hayProblema;

  return (
    <div
      className={`rounded-lg border overflow-hidden ${
        hayProblema ? "border-red-200 bg-red-50/40" : "border-emerald-200 bg-emerald-50/40"
      }`}
    >
      <button
        onClick={() => setAbierto((v) => !v)}
        className="w-full px-3 py-2.5 flex items-start justify-between gap-3 text-left"
      >
        <div className="flex items-start gap-2 min-w-0">
          {hayProblema ? (
            <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
          )}
          <div className="min-w-0">
            <div className={`text-xs font-semibold ${hayProblema ? "text-red-900" : "text-emerald-900"}`}>
              {hayProblema
                ? `Reporte de productos: falta subir en ${resumen.pendientes.length} ${resumen.pendientes.length === 1 ? "sede" : "sedes"}`
                : "Reporte de productos al día en las 3 sedes"}
            </div>
            <div className={`text-[11px] mt-0.5 ${hayProblema ? "text-red-800/90" : "text-emerald-800/80"}`}>
              {hayProblema
                ? resumenPendientes(resumen)
                : "Se sube cada sábado. Todas las sedes tienen la semana en curso."}
            </div>
          </div>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${mostrar ? "rotate-180" : ""}`}
        />
      </button>

      {mostrar && (
        <div className="px-3 pb-3 bg-white/70 space-y-1.5">
          {resumen.sedes.map((s) => (
            <div key={s.businessId} className={`rounded-lg border px-2.5 py-2 ${TONO[s.estado].fila}`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-semibold text-gray-900">{s.sede}</span>
                <span className={`text-[11px] font-medium ${TONO[s.estado].texto}`}>
                  {s.ultimaCarga ? (
                    <>
                      <CalendarClock className="w-3 h-3 inline mr-1 -mt-0.5" />
                      {fechaCorta(s.ultimaCarga)} ({diaSemana(s.ultimaCarga)})
                    </>
                  ) : (
                    "sin cargas"
                  )}
                </span>
              </div>
              <div className="text-[11px] text-gray-600 mt-0.5">{s.detalle}</div>
              {s.ultimoMes && (
                <div className="text-[10px] text-gray-400 mt-0.5">
                  Último mes cargado: {s.ultimoMes} · {s.productosUltimaCarga} productos
                  {s.productosHabitual !== null && ` (lo normal: ~${s.productosHabitual})`}
                </div>
              )}
            </div>
          ))}

          <p className="text-[10px] text-gray-400 pt-1">
            Este es el reporte <strong>&ldquo;Productos con mayor rotación&rdquo;</strong> de Byte, que
            alimenta Inteligencia Comercial. Lo sube dirección desde Productos — los administradores
            no tienen acceso a esta pantalla.
          </p>
        </div>
      )}
    </div>
  );
}
