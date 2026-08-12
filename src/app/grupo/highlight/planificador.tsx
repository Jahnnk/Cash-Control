"use client";

/**
 * Planificador semanal del Highlight: 3 sedes × 7 días.
 *
 * Nace de cómo se trabaja de verdad: el domingo ya está claro qué tiene
 * que hacer cada sede el lunes, el martes y el miércoles. Con la vista
 * de un solo día había que entrar fecha por fecha, y en la práctica no
 * se programaba nada.
 *
 * Ver los huecos es la mitad del valor: una celda vacía en la
 * cuadrícula es un día sin rumbo para esa sede.
 *
 * Lo programado NO le llega al administrador hasta el día que toca.
 */

import { useCallback, useEffect, useState, useTransition } from "react";
import { Loader2, Check, X, CalendarDays, Send } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import {
  getPlanSemana, asignarHighlight, type PlanSemana, type CeldaPlan,
} from "@/app/actions/highlight";
import { MAX_TEXTO } from "@/lib/highlight";
import { conReintento } from "@/lib/con-reintento";

const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

function etiquetaDia(iso: string, hoy: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return {
    dia: iso === hoy ? "hoy" : DIAS_CORTOS[dow],
    fecha: `${d} ${MESES[m - 1]}`,
    esHoy: iso === hoy,
    esFinde: dow === 0,
  };
}

export function Planificador({
  onCambio,
  version = 0,
}: {
  onCambio?: () => void;
  /** Sube con cada cambio hecho ARRIBA (tarjetas de sede): fuerza recarga. */
  version?: number;
}) {
  const { showToast } = useToast();
  const [plan, setPlan] = useState<PlanSemana | null>(null);
  const [editando, setEditando] = useState<{ fecha: string; businessId: number } | null>(null);
  const [texto, setTexto] = useState("");
  const [choque, setChoque] = useState<{ asignadoPor: string; textoActual: string } | null>(null);
  const [guardando, startTransition] = useTransition();

  const cargar = useCallback(async () => {
    try {
      setPlan(await conReintento(() => getPlanSemana()));
    } catch (e) {
      // Ya reintentó una vez adentro de conReintento; si sigue fallando,
      // se queda en el spinner en vez de tumbar la página — no hay nada
      // bueno que mostrar todavía, pero tampoco hay que romper nada.
      console.error("[Planificador] cargar:", e);
    }
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar y ante cambios */
    void cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargar, version]);

  function celda(fecha: string, businessId: number): CeldaPlan | undefined {
    return plan?.celdas.find((c) => c.fecha === fecha && c.businessId === businessId);
  }

  function abrir(fecha: string, businessId: number) {
    const c = celda(fecha, businessId);
    setEditando({ fecha, businessId });
    setTexto(c?.texto ?? "");
    setChoque(null);
  }

  function guardar(reemplazar = false) {
    if (!editando || !texto.trim()) return;
    startTransition(async () => {
      const r = await asignarHighlight({
        businessId: editando.businessId,
        fecha: editando.fecha,
        texto,
        reemplazarDe: reemplazar ? "si" : null,
      });
      if (!r.ok) {
        if ("confirmar" in r) {
          setChoque({ asignadoPor: r.asignadoPor, textoActual: r.textoActual });
          return;
        }
        showToast(r.error, "error");
        return;
      }
      showToast("Programado", "success");
      setEditando(null);
      setTexto("");
      setChoque(null);
      await cargar();
      onCambio?.();
    });
  }

  if (!plan) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
      </div>
    );
  }

  const vacias = plan.dias.length * plan.sedes.length - plan.celdas.length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-gray-400" />
            Programar la semana
          </h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Toca una casilla para dejar el Highlight de ese día. Cada sede lo recibe
            recién el día que le toca.
          </p>
        </div>
        {vacias > 0 && (
          <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
            {vacias} día{vacias === 1 ? "" : "s"} sin asignar
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-gray-500 font-semibold w-24">
                Sede
              </th>
              {plan.dias.map((d) => {
                const e = etiquetaDia(d, plan.hoy);
                return (
                  <th
                    key={d}
                    className={`px-2 py-2 text-center text-[10px] font-semibold ${
                      e.esHoy ? "text-primary" : e.esFinde ? "text-gray-400" : "text-gray-500"
                    }`}
                  >
                    <div className="uppercase tracking-wide">{e.dia}</div>
                    <div className="font-normal text-gray-400">{e.fecha}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {plan.sedes.map((s) => (
              <tr key={s.businessId} className="border-t border-gray-100">
                <td className="px-3 py-2 text-xs font-semibold text-gray-900">{s.sede}</td>
                {plan.dias.map((d) => {
                  const c = celda(d, s.businessId);
                  const abierto =
                    editando?.fecha === d && editando?.businessId === s.businessId;
                  return (
                    <td key={d} className="px-1 py-1 align-top">
                      <button
                        onClick={() => abrir(d, s.businessId)}
                        className={`w-full min-h-[62px] rounded-lg border p-1.5 text-left transition-colors ${
                          abierto
                            ? "border-primary ring-2 ring-primary/20 bg-white"
                            : c
                              ? c.estado === "logrado"
                                ? "border-emerald-200 bg-emerald-50 hover:border-emerald-300"
                                : c.estado === "no_logrado"
                                  ? "border-gray-200 bg-gray-50 hover:border-gray-300"
                                  : "border-amber-200 bg-[#FEF9C3] hover:border-amber-300"
                              : "border-dashed border-gray-200 hover:border-primary hover:bg-gray-50"
                        }`}
                      >
                        {c ? (
                          <>
                            <div className="text-[10px] leading-tight text-gray-800 line-clamp-3">
                              {c.texto}
                            </div>
                            <div className="flex items-center gap-1 mt-1">
                              {c.estado === "logrado" && (
                                <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                              )}
                              {c.estado === "no_logrado" && (
                                <X className="w-3 h-3 text-gray-400 shrink-0" />
                              )}
                              {c.asignadoPor && (
                                <span className="text-[9px] text-gray-400 truncate">
                                  {c.asignadoPor}
                                </span>
                              )}
                            </div>
                          </>
                        ) : (
                          <span className="text-[10px] text-gray-300">+</span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Escribir el Highlight de la casilla elegida */}
      {editando && (
        <div className="border-t border-gray-100 p-4 bg-gray-50">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
            {plan.sedes.find((s) => s.businessId === editando.businessId)?.sede} ·{" "}
            {etiquetaDia(editando.fecha, plan.hoy).dia} {etiquetaDia(editando.fecha, plan.hoy).fecha}
          </div>

          {choque && (
            <div className="mb-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              <div className="text-[11px] font-semibold text-amber-900">
                {choque.asignadoPor} ya asignó ese día: «{choque.textoActual}»
              </div>
              <p className="text-[11px] text-amber-800/80 mt-0.5">
                Solo puede haber uno por día. Si lo reemplazas, verán el tuyo.
              </p>
              <div className="flex gap-2 mt-1.5">
                <button
                  onClick={() => guardar(true)}
                  disabled={guardando}
                  className="text-[11px] font-semibold bg-amber-600 text-white rounded px-2.5 py-1 hover:bg-amber-700 disabled:opacity-50"
                >
                  Reemplazarlo igual
                </button>
                <button
                  onClick={() => setChoque(null)}
                  className="text-[11px] text-amber-800 px-2 py-1 hover:underline"
                >
                  Mejor no
                </button>
              </div>
            </div>
          )}

          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value.slice(0, MAX_TEXTO))}
            rows={2}
            autoFocus
            placeholder="Una sola cosa, concreta y verificable"
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          <div className="flex items-center justify-between mt-2">
            <span
              className={`text-[10px] tabular-nums ${
                texto.length > MAX_TEXTO - 20 ? "text-amber-600" : "text-gray-400"
              }`}
            >
              {texto.length}/{MAX_TEXTO}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setEditando(null);
                  setChoque(null);
                }}
                className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
              >
                Cancelar
              </button>
              <button
                onClick={() => guardar()}
                disabled={guardando || !texto.trim()}
                className="inline-flex items-center gap-1.5 bg-primary text-white rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-primary-light disabled:opacity-40"
              >
                {guardando ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                Programar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
