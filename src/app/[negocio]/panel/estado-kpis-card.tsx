"use client";

/**
 * "¿Ya registré los KPIs de hoy?" — lo segundo que ve el administrador
 * en su panel, justo debajo del Highlight.
 *
 * Pedido de Jahnn (16-ago-2026): que a los administradores no se les
 * pase llenar el registro diario. Misma dinámica que el Highlight: un
 * estado claro al entrar, y un botón que lleva directo a hacerlo.
 *
 * Tres decisiones de diseño:
 *
 *  1. Lo VENCIDO manda sobre lo de hoy. Que falte el cierre de hoy a
 *     las 3pm es normal; que falte el del martes no. Si hay las dos
 *     cosas, la tarjeta habla de la deuda vieja primero.
 *  2. Cuando está todo al día NO desaparece: se queda en verde. La
 *     confirmación es la mitad del pedido ("cuando los ingresen verán
 *     una notificación") y es lo que convierte el registro en hábito.
 *  3. La rachita de 7 días se muestra siempre, con los mismos colores
 *     que el cuadro de Grupo. El administrador ve exactamente lo que
 *     ve la dirección: nadie se entera de un reclamo por sorpresa.
 */

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Clock, Flame, Loader2, PenLine } from "lucide-react";
import { getEstadoKpisSede, type EstadoKpisSede } from "@/app/actions/llenado-reportes";
import { etiquetaDia, mensajeEstadoKpis, type EstadoDia } from "@/lib/kpis/llenado";
import { conReintento } from "@/lib/con-reintento";

/** Mismos colores que el cuadro de Grupo: un solo idioma visual. */
const PUNTO: Record<EstadoDia, string> = {
  lleno: "bg-emerald-500",
  incompleto: "bg-amber-400",
  falta: "bg-red-500",
  hoy: "bg-gray-300 ring-2 ring-gray-400 ring-offset-1",
  futuro: "bg-gray-100",
  "dia-libre": "bg-gray-50 border border-gray-200",
  pausado: "bg-sky-100 border border-sky-300",
  "sin-operar": "bg-gray-50 border border-dashed border-gray-200",
};

const TITULO_PUNTO: Record<EstadoDia, string> = {
  lleno: "Registrado",
  incompleto: "Registrado, falta un dato",
  falta: "Sin registrar",
  hoy: "Es hoy: aún puedes registrarlo",
  futuro: "Todavía no llega",
  "dia-libre": "Día libre",
  pausado: "Día no operativo: no cuenta para la meta",
  "sin-operar": "La sede aún no operaba",
};

export function EstadoKpisCard({
  refrescar,
  onRegistrar,
}: {
  /** Cambia de valor tras guardar, para volver a preguntar. */
  refrescar?: number;
  /** Lleva al formulario con esa fecha ya elegida. */
  onRegistrar?: (fecha: string) => void;
}) {
  const [data, setData] = useState<EstadoKpisSede | null>(null);

  const cargar = useCallback(async () => {
    // Esta promesa corre dentro de un useEffect: si se rechaza sin
    // atrapar, tumba la página entera en vez de solo esta tarjeta.
    try {
      setData(await conReintento(() => getEstadoKpisSede()));
    } catch (e) {
      console.error("[EstadoKpisCard] cargar:", e);
    }
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar y tras guardar */
    void cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargar, refrescar]);

  if (!data) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-gray-300" />
        <span className="text-xs text-gray-400">Revisando tu registro…</span>
      </div>
    );
  }
  if (!data.visible) return null;

  // Las palabras las decide la librería, no la pantalla: así el
  // mensaje se puede probar sin abrir un navegador.
  const msg = mensajeEstadoKpis({ hoy: data.hoy, dias: data.dias, modo: data.modo });

  const TONO = {
    verde: { caja: "border-emerald-200 bg-emerald-50", texto: "text-emerald-900", sub: "text-emerald-800/90", icono: "text-emerald-600" },
    ambar: { caja: "border-amber-200 bg-amber-50", texto: "text-amber-900", sub: "text-amber-800/90", icono: "text-amber-600" },
    rojo: { caja: "border-red-200 bg-red-50", texto: "text-red-900", sub: "text-red-800/90", icono: "text-red-600" },
  } as const;
  const tono = TONO[msg.tono];
  const Icono = msg.tono === "rojo" ? AlertTriangle : msg.tono === "ambar" ? Clock : CheckCircle2;

  return (
    <div className={`rounded-xl border ${tono.caja} px-4 py-3`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2.5 min-w-0">
          <Icono className={`w-5 h-5 ${tono.icono} mt-0.5 shrink-0`} />
          <div className="min-w-0">
            <div className={`text-sm font-bold ${tono.texto}`}>{msg.titulo}</div>
            <div className={`text-xs ${tono.sub} mt-0.5`}>{msg.detalle}</div>
            {data.racha >= 3 && msg.tono !== "rojo" && (
              <div className="text-[11px] text-emerald-700 mt-1 flex items-center gap-1">
                <Flame className="w-3 h-3" />
                {data.racha} días seguidos registrando. No cortes la racha.
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* La misma rachita que ve la dirección en Grupo. */}
          <div className="flex items-center gap-1" title="Tus últimos 7 días">
            {data.dias.map((d) => (
              <span
                key={d.fecha}
                className={`inline-block w-3 h-3 rounded ${PUNTO[d.estado]}`}
                title={`${etiquetaDia(d.fecha)} · ${TITULO_PUNTO[d.estado]}${
                  d.estado === "incompleto" && d.faltan.length > 0 ? `: ${d.faltan.join(", ")}` : ""
                }`}
              />
            ))}
          </div>

          {msg.accion && onRegistrar && (
            <button
              onClick={() => onRegistrar(msg.accion!)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-primary hover:bg-primary-light rounded-lg"
            >
              <PenLine className="w-3.5 h-3.5" />
              Registrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
