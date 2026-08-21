"use client";

/**
 * "¿Están todos al día?" — el control de dirección, en una tarjeta.
 *
 * Pedido de Jahnn (19-ago-2026): "para mí es muy importante corroborar
 * que los administradores están al día subiendo su información, los
 * KPIs diarios y los 4 archivos que da Byte todos los sábados…
 * ¿podría tener una mejora visual para saber de manera fácil e
 * intuitiva si está faltando información?".
 *
 * Junta las DOS mitades que antes vivían separadas: los KPIs diarios
 * (que se veían en Reportes) y los 4 archivos del sábado (que solo veía
 * cada admin en su panel — a dirección le llegaba uno de los cuatro).
 *
 * Tres decisiones:
 *
 *  1. Con todo al día es UNA línea verde. Se abre sola SOLO cuando hay
 *     algo pendiente. Un panel que grita todos los días deja de mirarse
 *     — el mismo criterio del Highlight y del estado de llenado.
 *  2. Se distingue lo URGENTE de lo que puede esperar. Un día de KPI
 *     sin registrar no vuelve nunca; un archivo del sábado se recupera
 *     el sábado. Pintarlos igual haría que lo grave se pierda entre lo
 *     leve.
 *  3. Cada sede dice QUÉ le falta y DESDE CUÁNDO, con nombre y fecha.
 *     "Fonavi tiene pendientes" no sirve para llamar a nadie.
 */

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2, AlertTriangle, Clock, Loader2, ChevronDown, ClipboardCheck,
} from "lucide-react";
import { getCumplimientoEquipo, type EstadoCumplimiento } from "@/app/actions/llenado-reportes";
import { type SedeEvaluada } from "@/lib/control-cumplimiento";
import { conReintento } from "@/lib/con-reintento";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** "jue 20 ago" — con el día de la semana, que es como uno lo piensa. */
function fechaCorta(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DIAS[dow]} ${d} ${MESES[m - 1]}`;
}

const TONO: Record<SedeEvaluada["severidad"], { fila: string; texto: string; Icono: typeof CheckCircle2 }> = {
  "al-dia": { fila: "border-emerald-200 bg-emerald-50/50", texto: "text-emerald-800", Icono: CheckCircle2 },
  atencion: { fila: "border-amber-200 bg-amber-50/60", texto: "text-amber-800", Icono: Clock },
  urgente: { fila: "border-red-200 bg-red-50/50", texto: "text-red-800", Icono: AlertTriangle },
};

export function CumplimientoEquipo() {
  const [data, setData] = useState<EstadoCumplimiento | null>(null);
  const [abierto, setAbierto] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setData(await conReintento(() => getCumplimientoEquipo()));
    } catch (e) {
      console.error("[CumplimientoEquipo] cargar:", e);
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
        <span className="text-xs text-gray-400">Revisando el cumplimiento…</span>
      </div>
    );
  }
  if (!data.esDireccion || !data.control) return null;

  const { control } = data;
  const hayUrgente = control.pendientes.some((p) => p.severidad === "urgente");
  const hayAlgo = !control.todoAlDia;
  // Con algo pendiente se abre solo: es justo lo que vino a buscar.
  const mostrar = abierto || hayAlgo;

  return (
    <div
      className={`rounded-lg border overflow-hidden ${
        hayUrgente
          ? "border-red-200 bg-red-50/40"
          : hayAlgo
            ? "border-amber-200 bg-amber-50/40"
            : "border-emerald-200 bg-emerald-50/40"
      }`}
    >
      <button
        onClick={() => setAbierto((v) => !v)}
        className="w-full px-3 py-2.5 flex items-start justify-between gap-3 text-left"
      >
        <div className="flex items-start gap-2 min-w-0">
          {hayAlgo ? (
            <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${hayUrgente ? "text-red-600" : "text-amber-600"}`} />
          ) : (
            <ClipboardCheck className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
          )}
          <div className="min-w-0">
            <div
              className={`text-xs font-semibold ${
                hayUrgente ? "text-red-900" : hayAlgo ? "text-amber-900" : "text-emerald-900"
              }`}
            >
              {hayAlgo
                ? `${control.pendientes.length} ${control.pendientes.length === 1 ? "sede" : "sedes"} con información pendiente`
                : "Las 3 sedes al día"}
            </div>
            <div
              className={`text-[11px] mt-0.5 ${
                hayUrgente ? "text-red-800/90" : hayAlgo ? "text-amber-800/90" : "text-emerald-800/80"
              }`}
            >
              {hayAlgo
                ? control.pendientes.map((p) => p.sede).join(" · ")
                : "KPIs diarios al día y los 4 reportes de Byte de esta semana subidos."}
            </div>
          </div>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${mostrar ? "rotate-180" : ""}`}
        />
      </button>

      {mostrar && (
        <div className="px-3 pb-3 bg-white/70 space-y-1.5">
          {control.sedes.map((s) => {
            const t = TONO[s.severidad];
            return (
              <div key={s.businessId} className={`rounded-lg border px-2.5 py-2 ${t.fila}`}>
                <div className="flex items-center gap-1.5">
                  <t.Icono className={`w-3.5 h-3.5 shrink-0 ${t.texto}`} />
                  <span className="text-xs font-semibold text-gray-900">{s.sede}</span>
                  <span className={`text-[11px] ${t.texto}`}>· {s.resumen}</span>
                </div>

                {/* Qué falta, con nombre y fecha: sin esto no se puede
                    llamar a nadie a pedirle algo concreto. */}
                {s.diasKpiFaltantes.length > 0 && (
                  <div className="text-[11px] text-gray-600 mt-1 pl-5">
                    <span className="font-medium text-gray-700">KPIs sin registrar:</span>{" "}
                    {s.diasKpiFaltantes.map(fechaCorta).join(", ")}
                  </div>
                )}
                {s.archivosFaltantes.length > 0 && (
                  <div className="text-[11px] text-gray-600 mt-0.5 pl-5">
                    <span className="font-medium text-gray-700">Reportes de Byte:</span>{" "}
                    {s.archivosFaltantes.map((a) => (
                      <span key={a}>
                        {a}
                        {s.archivosNunca.includes(a) && (
                          <span className="text-red-700 font-medium"> (nunca subido)</span>
                        )}
                        {a !== s.archivosFaltantes[s.archivosFaltantes.length - 1] && ", "}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <p className="text-[10px] text-gray-400 pt-1">
            KPIs de los últimos 7 días · los 4 reportes de Byte se suben cada sábado. Es lo mismo
            que ve cada administrador en su panel.
          </p>
        </div>
      )}
    </div>
  );
}
