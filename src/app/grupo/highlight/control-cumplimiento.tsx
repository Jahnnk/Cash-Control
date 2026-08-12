"use client";

/**
 * Control de cumplimiento del Highlight — pedido de Jahnn (12-ago-2026):
 * "el sistema me deberá informar cuando cada administrador cumpla su
 * highlight y cuando no, para llevar un control estricto".
 *
 * Orden deliberado, de lo urgente a lo informativo:
 *
 *   1. SIN RESPUESTA — Highlights de días pasados que nadie cerró. Es
 *      lo primero porque es lo único que exige acción. Un "no lo logré"
 *      es información honesta; el SILENCIO no dice nada, y es
 *      justamente lo que se escapa del control.
 *   2. CÓMO VA HOY — las tres sedes de un vistazo.
 *   3. QUÉ PASÓ — los últimos cierres, con hora.
 *
 * Cuando todo está en orden el bloque 1 desaparece: la pantalla solo
 * levanta la voz cuando hay algo que atender.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, Check, X, Clock, Loader2, ChevronDown, Lightbulb,
} from "lucide-react";
import {
  getControlCumplimiento, type ControlCumplimiento,
} from "@/app/actions/highlight";
import { conReintento } from "@/lib/con-reintento";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

function fechaCorta(iso: string) {
  const [, m, d] = iso.split("-");
  return `${Number(d)} ${MESES[Number(m) - 1]}`;
}

/** "cerró a las 3:42 p.m." — la hora importa para saber si cerró en el día. */
function horaDe(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("es-PE", {
    hour: "numeric", minute: "2-digit", timeZone: "America/Lima",
  });
}

export function ControlCumplimiento({ version = 0 }: { version?: number }) {
  const [data, setData] = useState<ControlCumplimiento | null>(null);
  const [verHistorial, setVerHistorial] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setData(await conReintento(() => getControlCumplimiento()));
    } catch (e) {
      console.error("[ControlCumplimiento] cargar:", e);
    }
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar y ante cambios */
    void cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargar, version]);

  if (!data) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 flex justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-gray-300" />
      </div>
    );
  }
  if (data.faltaMigracion) return null;

  const cerraronHoy = data.estadoHoy.filter((s) => s.estado && s.estado !== "pendiente").length;
  const conHighlightHoy = data.estadoHoy.filter((s) => s.estado !== null).length;

  return (
    <div className="space-y-3">
      {/* 1 · Lo único que exige acción */}
      {data.sinCerrar.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-red-900">
                {data.sinCerrar.length} Highlight{data.sinCerrar.length === 1 ? "" : "s"} sin
                respuesta
              </div>
              <p className="text-[11px] text-red-800/80 mt-0.5 mb-2">
                Se asignaron y nadie los cerró. No sabemos si se hicieron o no — eso es lo que
                hay que preguntar.
              </p>
              <div className="space-y-1">
                {data.sinCerrar.map((s) => (
                  <div key={s.id} className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="text-red-900">
                      <strong>{s.sede}</strong> · {s.texto}
                    </span>
                    <span className="text-red-700 whitespace-nowrap tabular-nums">
                      {fechaCorta(s.fecha)} · {s.diasEnSilencio} día
                      {s.diasEnSilencio === 1 ? "" : "s"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2 · Cómo va hoy */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Cumplimiento de hoy</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {conHighlightHoy === 0
                ? "Todavía no asignaste ningún Highlight para hoy."
                : `${cerraronHoy} de ${conHighlightHoy} ${
                    conHighlightHoy === 1 ? "sede cerró" : "sedes cerraron"
                  } su Highlight.`}
            </p>
          </div>
          {data.sinCerrar.length === 0 && conHighlightHoy > 0 && cerraronHoy === conHighlightHoy && (
            <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
              Todo al día
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
          {data.estadoHoy.map((s) => {
            const hora = horaDe(s.cerradoEn);
            return (
              <div key={s.businessId} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-900">{s.sede}</span>
                  {s.estado === "logrado" && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5">
                      <Check className="w-2.5 h-2.5" /> Logrado
                    </span>
                  )}
                  {s.estado === "no_logrado" && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-600 bg-gray-100 border border-gray-200 rounded-full px-1.5 py-0.5">
                      <X className="w-2.5 h-2.5" /> No se logró
                    </span>
                  )}
                  {s.estado === "pendiente" && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
                      <Clock className="w-2.5 h-2.5" /> En curso
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-600 mt-1 line-clamp-2">
                  {s.texto ?? <span className="text-gray-400">Sin Highlight asignado</span>}
                </p>
                {hora && (
                  <p className="text-[10px] text-gray-400 mt-1">Cerrado a las {hora}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 3 · Qué pasó últimamente */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          onClick={() => setVerHistorial((v) => !v)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
        >
          <div className="text-left">
            <h3 className="text-sm font-semibold text-gray-900">Historial de cumplimiento</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {data.resumen
                .map((r) => `${r.sede} ${r.pct === null ? "—" : r.pct + "%"}`)
                .join(" · ")}{" "}
              · últimos 30 días
            </p>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-gray-400 transition-transform ${verHistorial ? "rotate-180" : ""}`}
          />
        </button>

        {verHistorial && (
          <div className="border-t border-gray-100">
            <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {data.resumen.map((r) => (
                <div key={r.businessId} className="text-xs">
                  <div className="font-semibold text-gray-900 mb-1">{r.sede}</div>
                  <div className="text-gray-600">
                    {r.logrados} logrado{r.logrados === 1 ? "" : "s"} ·{" "}
                    {r.noLogrados} no logrado{r.noLogrados === 1 ? "" : "s"}
                  </div>
                  {r.sinCerrar > 0 && (
                    <div className="text-red-600 font-medium">
                      {r.sinCerrar} sin responder
                    </div>
                  )}
                </div>
              ))}
            </div>

            {data.cierresRecientes.length > 0 && (
              <div className="border-t border-gray-100 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">
                  Últimos cierres
                </div>
                <div className="space-y-1.5">
                  {data.cierresRecientes.map((c) => {
                    const hora = horaDe(c.cerradoEn);
                    return (
                      <div key={c.id} className="flex items-baseline gap-2 text-xs">
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            c.estado === "logrado" ? "bg-emerald-500" : "bg-gray-300"
                          }`}
                        />
                        <span className="text-gray-400 w-12 shrink-0 tabular-nums">
                          {fechaCorta(c.fecha)}
                        </span>
                        <span className="font-medium text-gray-700 w-14 shrink-0">{c.sede}</span>
                        <span className="text-gray-600 truncate flex-1">{c.texto}</span>
                        {c.tieneReflect && (
                          <Lightbulb
                            className="w-3 h-3 text-amber-400 shrink-0"
                            aria-label="Escribió su Reflect"
                          />
                        )}
                        {hora && (
                          <span className="text-[10px] text-gray-400 shrink-0 tabular-nums">
                            {hora}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
