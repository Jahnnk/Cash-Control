"use client";

/**
 * "Propongo un Highlight" — el administrador sugiere, dirección aprueba.
 *
 * Pedido de Jahnn (17-ago-2026): "quién mejor que ellos que están en la
 * operación diaria para darse cuenta en lo que se debe mejorar".
 *
 * Va DEBAJO del Highlight del día y cerrado por defecto: proponer es
 * importante, pero no puede competir en tamaño con la tarea que ya
 * tiene asignada para hoy.
 *
 * Lo que más cuida esta pantalla es la respuesta: el administrador ve
 * en qué quedó cada propuesta suya, y con el motivo cuando fue que no.
 * Un "no" sin explicación es la forma más rápida de que deje de
 * proponer.
 */

import { useCallback, useEffect, useState, useTransition } from "react";
import { Lightbulb, ChevronDown, Loader2, Send, Trash2, Check, X, Clock } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { conReintento } from "@/lib/con-reintento";
import {
  getPropuestasSede, proponerHighlight, retirarPropuesta,
  type PropuestasSede,
} from "@/app/actions/highlight-propuestas";
import {
  ETIQUETA_PROPUESTA, MAX_TEXTO, MAX_POR_QUE, type EstadoPropuesta,
} from "@/lib/highlight-propuestas";

function sumarDias(fecha: string, n: number) {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function fechaCorta(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
  return `${d} ${meses[m - 1]}`;
}

const TONO: Record<EstadoPropuesta, string> = {
  pendiente: "bg-amber-50 text-amber-800 border-amber-200",
  aprobada: "bg-emerald-50 text-emerald-800 border-emerald-200",
  rechazada: "bg-gray-100 text-gray-600 border-gray-200",
  caducada: "bg-gray-50 text-gray-500 border-gray-200",
};

const ICONO: Record<EstadoPropuesta, typeof Clock> = {
  pendiente: Clock, aprobada: Check, rechazada: X, caducada: Clock,
};

export function ProponerHighlight({ onCambio }: { onCambio?: () => void }) {
  const { showToast } = useToast();
  const [data, setData] = useState<PropuestasSede | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [porQue, setPorQue] = useState("");
  const [fecha, setFecha] = useState("");
  const [pendiente, startTransition] = useTransition();

  const cargar = useCallback(async () => {
    try {
      const d = await conReintento(() => getPropuestasSede());
      setData(d);
      // Sugerir mañana: es el caso normal y le da tiempo a dirección de
      // responder. Para hoy también se puede, pero lo elige él.
      setFecha((f) => f || sumarDias(d.hoy, 1));
    } catch (e) {
      console.error("[ProponerHighlight] cargar:", e);
    }
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    void cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargar]);

  if (!data || !data.puedeProponer) return null;

  if (data.faltaMigracion) return null;

  function enviar() {
    startTransition(async () => {
      const r = await proponerHighlight({ fecha, texto, porQue });
      if (!r.ok) {
        showToast(r.error, "error");
        return;
      }
      showToast("Propuesta enviada. Dirección la revisará.", "success");
      setTexto(""); setPorQue("");
      await cargar();
      onCambio?.();
    });
  }

  function retirar(id: string) {
    startTransition(async () => {
      const r = await retirarPropuesta(id);
      if (!r.ok) {
        showToast(r.error, "error");
        return;
      }
      showToast("Propuesta retirada.");
      await cargar();
      onCambio?.();
    });
  }

  const esperando = data.mias.filter((p) => p.estadoEfectivo === "pendiente");
  const recientes = data.mias.filter((p) => p.estadoEfectivo !== "pendiente").slice(0, 4);

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-gray-50"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Lightbulb className="w-4 h-4 text-amber-500 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900">Propón un Highlight</div>
            <div className="text-[11px] text-gray-500">
              {esperando.length > 0
                ? `${esperando.length} ${esperando.length === 1 ? "propuesta esperando" : "propuestas esperando"} respuesta de dirección`
                : "Tú ves el local todos los días: si algo hay que mejorar, propónlo"}
            </div>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>

      {abierto && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
          <div>
            <label className="block text-[11px] font-medium text-gray-700 mb-1">
              ¿Qué es lo más importante que deberíamos mejorar?
            </label>
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value.slice(0, MAX_TEXTO))}
              placeholder="Ej. Reordenar la vitrina antes de las 8am"
              className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-xs"
            />
            <div className="text-[10px] text-gray-400 mt-0.5">
              Una sola cosa. {MAX_TEXTO - texto.length} caracteres.
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-700 mb-1">
              ¿Por qué importa? (opcional)
            </label>
            <textarea
              value={porQue}
              onChange={(e) => setPorQue(e.target.value.slice(0, MAX_POR_QUE))}
              rows={2}
              placeholder="Ej. A esa hora entran los clientes de oficina y la vitrina se ve vacía."
              className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-xs"
            />
          </div>

          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <label className="block text-[11px] font-medium text-gray-700 mb-1">¿Para qué día?</label>
              <input
                type="date"
                value={fecha}
                min={data.hoy}
                onChange={(e) => setFecha(e.target.value)}
                className="border border-gray-300 rounded-lg px-2.5 py-2 text-xs"
              />
            </div>
            <button
              onClick={enviar}
              disabled={pendiente || texto.trim() === ""}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-light rounded-lg disabled:opacity-50"
            >
              {pendiente ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Enviar propuesta
            </button>
          </div>
          <p className="text-[10px] text-gray-400">
            Dirección la revisa y decide. Si ese día ya tenía otro Highlight, ellos deciden cuál va
            primero.
          </p>

          {(esperando.length > 0 || recientes.length > 0) && (
            <div className="pt-2 border-t border-gray-100 space-y-1.5">
              <div className="text-[11px] font-medium text-gray-500">Tus propuestas</div>
              {[...esperando, ...recientes].map((p) => {
                const Icono = ICONO[p.estadoEfectivo];
                return (
                  <div
                    key={p.id}
                    className={`rounded-lg border px-2.5 py-2 text-[11px] ${TONO[p.estadoEfectivo]}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-medium">
                          <Icono className="w-3 h-3 shrink-0" />
                          {ETIQUETA_PROPUESTA[p.estadoEfectivo]} · {fechaCorta(p.fecha)}
                        </div>
                        <div className="mt-0.5 opacity-90">{p.texto}</div>
                        {p.motivo && <div className="mt-0.5 opacity-75">Respuesta: {p.motivo}</div>}
                        {p.resueltaPor && p.estadoEfectivo !== "caducada" && (
                          <div className="mt-0.5 opacity-60">— {p.resueltaPor}</div>
                        )}
                      </div>
                      {p.estadoEfectivo === "pendiente" && (
                        <button
                          onClick={() => retirar(p.id)}
                          disabled={pendiente}
                          title="Retirar propuesta"
                          className="shrink-0 p-1 opacity-60 hover:opacity-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
