"use client";

/**
 * Bandeja de propuestas — lo que sugieren los administradores.
 *
 * Pedido de Jahnn (17-ago-2026). Va arriba en la consola porque una
 * propuesta sin responder tiene fecha de vencimiento: si llega el día
 * propuesto y nadie contestó, se pierde.
 *
 * Dos decisiones que sostienen la idea:
 *
 *  1. El choque se avisa ANTES de aprobar. Si ese día ya tiene
 *     Highlight, la tarjeta lo muestra y pregunta a dónde correr el que
 *     estaba. Mover la tarea de otro en silencio es como se pierde la
 *     confianza entre quienes asignan.
 *  2. Las caducadas se muestran. Es el dato incómodo sobre el propio
 *     tiempo de respuesta: si el administrador propone y nadie le
 *     contesta, deja de proponer y esto se muere solo.
 */

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  Lightbulb, Check, X, Loader2, AlertTriangle, CalendarClock, ChevronDown,
} from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { conReintento } from "@/lib/con-reintento";
import {
  getBandejaPropuestas, aprobarPropuesta, rechazarPropuesta,
  type BandejaPropuestas, type PropuestaEnBandeja,
} from "@/app/actions/highlight-propuestas";
import { ETIQUETA_PROPUESTA, MAX_MOTIVO } from "@/lib/highlight-propuestas";

function fechaCorta(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
  return `${d} ${meses[m - 1]}`;
}

function diaRelativo(iso: string, hoy: string) {
  if (iso === hoy) return "hoy";
  const [y, m, d] = hoy.split("-").map(Number);
  const manana = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  if (iso === manana) return "mañana";
  return fechaCorta(iso);
}

export function BandejaPropuestas({
  version,
  onCambio,
}: {
  version?: number;
  onCambio?: () => void;
}) {
  const { showToast } = useToast();
  const [data, setData] = useState<BandejaPropuestas | null>(null);
  const [verHistorial, setVerHistorial] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setData(await conReintento(() => getBandejaPropuestas()));
    } catch (e) {
      console.error("[BandejaPropuestas] cargar:", e);
    }
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    void cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargar, version]);

  function recargar() {
    void cargar();
    onCambio?.();
  }

  if (!data || !data.esDireccion) return null;

  if (data.faltaMigracion) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        Falta correr la migración de propuestas en la base de datos.
      </div>
    );
  }

  const { pendientes, caducadas, resueltas, hoy } = data;
  const paraHoy = pendientes.filter((p) => p.fecha === hoy).length;

  if (pendientes.length === 0 && caducadas.length === 0 && resueltas.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2.5">
          <Lightbulb className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-bold text-gray-900">
              {pendientes.length > 0
                ? `${pendientes.length} ${pendientes.length === 1 ? "propuesta" : "propuestas"} de tus administradores`
                : "Propuestas de tus administradores"}
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {paraHoy > 0
                ? `${paraHoy} ${paraHoy === 1 ? "es para HOY" : "son para HOY"}: si no respondes, se pierden.`
                : "Ellos ven la operación todos los días. Responder rápido es lo que hace que sigan proponiendo."}
            </p>
          </div>
        </div>
        {caducadas.length > 0 && (
          <div className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
            {caducadas.length} se {caducadas.length === 1 ? "pasó" : "pasaron"} sin respuesta
          </div>
        )}
      </div>

      {pendientes.length > 0 && (
        <div className="divide-y divide-gray-100">
          {pendientes.map((p) => (
            <TarjetaPropuesta
              key={p.id}
              p={p}
              hoy={hoy}
              onListo={recargar}
              showToast={showToast}
            />
          ))}
        </div>
      )}

      {(caducadas.length > 0 || resueltas.length > 0) && (
        <div className="border-t border-gray-100">
          <button
            onClick={() => setVerHistorial((v) => !v)}
            className="w-full px-4 py-2 flex items-center justify-between text-[11px] text-gray-500 hover:bg-gray-50"
          >
            <span>Ver lo ya respondido y lo que se pasó ({caducadas.length + resueltas.length})</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${verHistorial ? "rotate-180" : ""}`} />
          </button>
          {verHistorial && (
            <div className="px-4 pb-3 space-y-1.5">
              {[...caducadas, ...resueltas].map((p) => (
                <div key={p.id} className="text-[11px] flex items-start gap-2">
                  <span
                    className={`shrink-0 px-1.5 py-0.5 rounded font-medium ${
                      p.estadoEfectivo === "aprobada"
                        ? "bg-emerald-50 text-emerald-700"
                        : p.estadoEfectivo === "rechazada"
                          ? "bg-gray-100 text-gray-600"
                          : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {ETIQUETA_PROPUESTA[p.estadoEfectivo]}
                  </span>
                  <span className="text-gray-600 min-w-0">
                    <strong className="text-gray-800">{p.sede}</strong> · {fechaCorta(p.fecha)} ·{" "}
                    {p.texto}
                    {p.motivo && <span className="text-gray-400"> — {p.motivo}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TarjetaPropuesta({
  p, hoy, onListo, showToast,
}: {
  p: PropuestaEnBandeja;
  hoy: string;
  onListo: () => void;
  showToast: (m: string, t?: "success" | "error") => void;
}) {
  const [pendiente, startTransition] = useTransition();
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");
  // Cuando hay choque: a qué día correr el Highlight que ya estaba.
  const [conflicto, setConflicto] = useState<{
    existente: { texto: string; asignadoPor: string | null };
    mover: string;
  } | null>(null);

  function aprobar(moverExistenteA?: string) {
    startTransition(async () => {
      const r = await aprobarPropuesta({ id: p.id, moverExistenteA });
      if (!r.ok) {
        // El choque no es un error: es la pregunta de a dónde correr el
        // Highlight que ya estaba. La base no se tocó todavía.
        if ("conflicto" in r) {
          setConflicto({ existente: r.existente, mover: r.sugerido ?? "" });
          return;
        }
        showToast(r.error, "error");
        return;
      }
      showToast(
        r.movido
          ? `Aprobada. "${r.movido.texto}" se corrió al ${fechaCorta(r.movido.a)}.`
          : "Propuesta aprobada: ya es el Highlight de ese día.",
        "success",
      );
      setConflicto(null);
      onListo();
    });
  }

  function rechazar() {
    startTransition(async () => {
      const r = await rechazarPropuesta({ id: p.id, motivo });
      if (!r.ok) {
        showToast(r.error, "error");
        return;
      }
      showToast("Respuesta enviada al administrador.");
      setRechazando(false);
      onListo();
    });
  }

  const esHoy = p.fecha === hoy;

  return (
    <div className={`px-4 py-3 ${esHoy ? "bg-amber-50/40" : ""}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap text-[11px] mb-1">
            <span className="font-semibold text-gray-900">{p.sede}</span>
            <span className="text-gray-400">·</span>
            <span className={esHoy ? "font-semibold text-amber-700" : "text-gray-500"}>
              para {diaRelativo(p.fecha, hoy)}
            </span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-500">lo propone {p.propuestaPor}</span>
          </div>
          <div className="text-sm text-gray-900 font-medium">{p.texto}</div>
          {p.porQue && <p className="text-xs text-gray-600 mt-1">{p.porQue}</p>}

          {/* El choque se ve ANTES de decidir, no después. */}
          {p.choqueCon && !conflicto && (
            <div className="mt-2 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                Ese día ya tiene Highlight: «{p.choqueCon.texto}»
                {p.choqueCon.asignadoPor && ` (${p.choqueCon.asignadoPor})`}.
                {p.choqueCon.cerrado
                  ? " Ya está cerrado, así que habría que aprobar esta para otro día."
                  : " Si apruebas esta, decides a qué día correr la que estaba."}
              </span>
            </div>
          )}
        </div>

        {!rechazando && !conflicto && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => aprobar()}
              disabled={pendiente}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-primary hover:bg-primary-light rounded-lg disabled:opacity-50"
            >
              {pendiente ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Aprobar
            </button>
            <button
              onClick={() => setRechazando(true)}
              disabled={pendiente}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 hover:bg-gray-50 rounded-lg disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" />
              No
            </button>
          </div>
        )}
      </div>

      {/* Choque: a dónde corro el que ya estaba */}
      {conflicto && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <div className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
            <CalendarClock className="w-4 h-4" />
            ¿A qué día corro «{conflicto.existente.texto}»?
          </div>
          <p className="text-[11px] text-amber-800/90 mt-1">
            Lo asignó {conflicto.existente.asignadoPor ?? "dirección"}. No se pierde: se mueve al día
            que elijas y la propuesta de {p.propuestaPor} toma el {diaRelativo(p.fecha, hoy)}.
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <input
              type="date"
              value={conflicto.mover}
              min={hoy}
              onChange={(e) => setConflicto({ ...conflicto, mover: e.target.value })}
              className="border border-amber-300 rounded-lg px-2 py-1.5 text-xs bg-white"
            />
            <button
              onClick={() => aprobar(conflicto.mover)}
              disabled={pendiente || !conflicto.mover}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-primary hover:bg-primary-light rounded-lg disabled:opacity-50"
            >
              {pendiente ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Aprobar y correr
            </button>
            <button
              onClick={() => setConflicto(null)}
              className="text-[11px] text-amber-800 underline"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Rechazo con motivo */}
      {rechazando && (
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
          <label className="block text-[11px] font-medium text-gray-700 mb-1">
            ¿Por qué no? (opcional, pero ayuda a que la próxima sea mejor)
          </label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value.slice(0, MAX_MOTIVO))}
            rows={2}
            placeholder="Ej. Buena idea, pero esta semana la prioridad es el tiempo de atención."
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white"
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={rechazar}
              disabled={pendiente}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-gray-700 hover:bg-gray-800 rounded-lg disabled:opacity-50"
            >
              {pendiente ? "Enviando…" : "Enviar respuesta"}
            </button>
            <button
              onClick={() => { setRechazando(false); setMotivo(""); }}
              className="text-[11px] text-gray-500 underline"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
