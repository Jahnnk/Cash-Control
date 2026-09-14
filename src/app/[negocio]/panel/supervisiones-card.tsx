"use client";

/**
 * Supervisiones de Juani en el panel del administrador.
 *
 * Responde dos preguntas: ¿qué tengo que corregir y cuánto tiempo me
 * queda?, y ¿cómo va el requisito del bono este mes? Las críticas van
 * primero y con contador: son las únicas que pueden dejar al equipo sin
 * bono, y 24 horas pasan rápido.
 */

import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { conReintento } from "@/lib/con-reintento";
import { ObservacionSupervision } from "@/components/observacion-supervision";
import { getSupervisionDeSede, type SupervisionDeSede } from "@/app/actions/supervisiones";
import { ETIQUETA_ESTADO_MES, type EstadoSupervisionMes } from "@/lib/supervisiones";

const CHIP: Record<EstadoSupervisionMes, string> = {
  sin_visitas: "bg-gray-50 text-gray-500 border-gray-200",
  al_dia: "bg-emerald-50 text-emerald-800 border-emerald-200",
  pendiente: "bg-amber-50 text-amber-800 border-amber-200",
  incumplido: "bg-red-50 text-red-800 border-red-200",
};

export function SupervisionesCard({ month, onCambio }: { month: string; onCambio?: () => void }) {
  const [data, setData] = useState<SupervisionDeSede | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await conReintento(() => getSupervisionDeSede(month));
      setData(r.ok ? r.data : null);
    } catch (e) {
      console.error("[SupervisionesCard] cargar:", e);
      setData(null);
    }
  }, [month]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar/cambiar mes */
    void cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargar]);

  if (!data) return null;
  const r = data.resumen;
  const pendientes = data.observaciones.filter((o) => o.estado !== "confirmada");
  // Sin visitas y sin nada pendiente, la tarjeta no tiene nada que pedir:
  // queda como una línea para que el administrador sepa que existe.
  const compacta = r.visitas === 0 && pendientes.length === 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-primary" /> Supervisiones de Juani
          </div>
          <div className="text-[11px] text-gray-500">
            Crítica: 24 h para corregir · Normal: 7 días. Sube la foto de cómo quedó y Juani lo confirma.
            {data.requisito
              ? " Si una crítica no se corrige a tiempo, este mes no hay bono."
              : " Desde octubre, las críticas corregidas a tiempo son requisito del bono."}
          </div>
        </div>
        <span className={`text-[11px] rounded-full px-2.5 py-1 border ${CHIP[r.estado]}`}>{ETIQUETA_ESTADO_MES[r.estado]}</span>
      </div>

      {!compacta && (
        <div className="text-xs text-gray-600">
          {r.visitas} visita(s) este mes
          {r.puntajePromedio !== null && <> · puntaje promedio <strong>{r.puntajePromedio}%</strong></>}
          {r.criticas.total > 0 && <> · críticas: {r.criticas.cumplidas} corregidas a tiempo{r.criticas.fueraDePlazo > 0 && <>, <strong className="text-red-700">{r.criticas.fueraDePlazo} fuera de plazo</strong></>}</>}
        </div>
      )}

      {pendientes.length > 0 ? (
        <div className="space-y-2">
          {pendientes.map((o) => (
            <ObservacionSupervision key={o.id} o={o} ahora={data.ahora} modo="admin" onCambio={() => { void cargar(); onCambio?.(); }} />
          ))}
        </div>
      ) : r.visitas > 0 ? (
        <div className="text-xs text-emerald-700">Nada pendiente de corregir. 👏</div>
      ) : null}
    </div>
  );
}
