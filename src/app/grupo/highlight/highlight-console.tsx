"use client";

/**
 * Consola del Highlight — donde Jahnn asigna "lo más importante del día"
 * a cada sede y verifica que se cumpla.
 *
 * Una columna por sede, siempre las tres a la vista: el trabajo de
 * Jahnn acá es decidir tres cosas, y verlas juntas obliga a preguntarse
 * si de verdad son LAS más importantes.
 *
 * Hoy / Mañana en un toque, porque el Highlight se piensa la noche
 * antes: si hay que asignarlo a las 6 a.m., no se asigna.
 */

import { useState, useTransition } from "react";
import {
  Flame, Check, X, Loader2, Send, Trash2, Pencil, Lightbulb, ChevronDown,
} from "lucide-react";
import { useToast } from "@/components/toast-provider";
import {
  asignarHighlight, borrarHighlight, getHighlightGrupo,
  type HighlightGrupo, type HighlightGrupoSede,
} from "@/app/actions/highlight";
import {
  GUIA_HIGHLIGHT, PREGUNTAS_REFLECT, MAX_TEXTO, MAX_POR_QUE, etiquetaEstado,
} from "@/lib/highlight";

function fechaLarga(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
    "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
  return `${dias[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} de ${meses[m - 1]}`;
}

function sumarDias(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const f = new Date(Date.UTC(y, m - 1, d + n));
  return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, "0")}-${String(
    f.getUTCDate(),
  ).padStart(2, "0")}`;
}

export function HighlightConsole({
  inicial,
  hoy,
}: {
  inicial: HighlightGrupo;
  hoy: string;
}) {
  const [data, setData] = useState(inicial);
  const [fecha, setFecha] = useState(inicial.fecha);
  const [verGuia, setVerGuia] = useState(false);
  const [cargando, startTransition] = useTransition();

  const manana = sumarDias(hoy, 1);

  function irA(nuevaFecha: string) {
    setFecha(nuevaFecha);
    startTransition(async () => setData(await getHighlightGrupo(nuevaFecha)));
  }

  function recargar() {
    startTransition(async () => setData(await getHighlightGrupo(fecha)));
  }

  if (data.faltaMigracion) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        Falta preparar la base de datos para el Highlight. Corre la migración{" "}
        <code className="text-xs">2026-08-10-highlight.sql</code>.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Encabezado con la idea de fondo */}
      <div className="bg-[#CFF0EA] rounded-2xl px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#004C40] tracking-tight">Highlight</h1>
            <p className="text-xs text-[#004C40]/80 mt-1 max-w-xl">
              No se trata de hacer más cosas; se trata de asegurarte de hacer las que más importan.
              Asigna a cada sede <strong>una sola</strong> actividad para el día.
            </p>
          </div>
          <button
            onClick={() => setVerGuia((v) => !v)}
            className="text-[11px] font-medium text-[#004C40]/80 hover:text-[#004C40] underline decoration-dotted underline-offset-4 shrink-0"
          >
            {verGuia ? "Ocultar guía" : "¿Cómo funciona?"}
          </button>
        </div>

        {verGuia && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {GUIA_HIGHLIGHT.map((g) => (
              <div key={g.titulo} className="bg-white rounded-lg px-3 py-2.5">
                <div className="text-xs font-semibold text-gray-900">{g.titulo}</div>
                <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">{g.cuerpo}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Qué día estoy asignando */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => irA(hoy)}
          className={`text-xs font-medium rounded-lg px-3 py-1.5 border transition-colors ${
            fecha === hoy
              ? "bg-primary text-white border-primary"
              : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
          }`}
        >
          Hoy
        </button>
        <button
          onClick={() => irA(manana)}
          className={`text-xs font-medium rounded-lg px-3 py-1.5 border transition-colors ${
            fecha === manana
              ? "bg-primary text-white border-primary"
              : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
          }`}
        >
          Mañana
        </button>
        <input
          type="date"
          value={fecha}
          onChange={(e) => e.target.value && irA(e.target.value)}
          className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <span className="text-xs text-gray-500 ml-1">{fechaLarga(fecha)}</span>
        {cargando && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
        {data.sinAsignar > 0 && (
          <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1 ml-auto">
            Falta asignar en {data.sinAsignar} sede{data.sinAsignar === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {/* Las tres sedes, siempre juntas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {data.sedes.map((s) => (
          <SedeCard key={s.businessId} sede={s} fecha={fecha} onCambio={recargar} />
        ))}
      </div>
    </div>
  );
}

function SedeCard({
  sede,
  fecha,
  onCambio,
}: {
  sede: HighlightGrupoSede;
  fecha: string;
  onCambio: () => void;
}) {
  const { showToast } = useToast();
  const h = sede.highlight;
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(h?.texto ?? "");
  const [porQue, setPorQue] = useState(h?.porQue ?? "");
  const [verReflect, setVerReflect] = useState(false);
  const [pendiente, startTransition] = useTransition();

  function guardar() {
    startTransition(async () => {
      const r = await asignarHighlight({
        businessId: sede.businessId,
        fecha,
        texto,
        porQue,
      });
      if (!r.ok) {
        showToast(r.error, "error");
        return;
      }
      showToast(`Highlight enviado a ${sede.sede}`, "success");
      setEditando(false);
      onCambio();
    });
  }

  function quitar() {
    if (!h) return;
    startTransition(async () => {
      const r = await borrarHighlight(h.id);
      if (!r.ok) {
        showToast(r.error, "error");
        return;
      }
      showToast("Highlight quitado", "success");
      setTexto("");
      setPorQue("");
      onCambio();
    });
  }

  const enBlanco = !h || editando;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Cabecera de la sede */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{sede.sede}</h3>
          <p className="text-[11px] text-gray-500">
            {sede.cumplimiento.pct !== null
              ? `${sede.cumplimiento.pct}% cumplido · ${sede.cumplimiento.cerrados} día${sede.cumplimiento.cerrados === 1 ? "" : "s"}`
              : "sin historial todavía"}
          </p>
        </div>
        {sede.racha > 0 && (
          <span
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#004C40] bg-[#CFF0EA] rounded-full px-2 py-1 shrink-0"
            title={`${sede.racha} días seguidos cumpliendo`}
          >
            <Flame className="w-3.5 h-3.5" /> {sede.racha}
          </span>
        )}
      </div>

      <div className="p-4">
        {enBlanco ? (
          <>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
              Lo más importante del día
            </label>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value.slice(0, MAX_TEXTO))}
              rows={3}
              autoFocus={editando}
              placeholder="Ej: Llamar a los 5 clientes que no compraron esta semana"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            <div className="flex justify-between items-center mt-1 mb-3">
              <span className="text-[10px] text-gray-400">
                Una sola cosa, concreta y verificable
              </span>
              <span
                className={`text-[10px] tabular-nums ${
                  texto.length > MAX_TEXTO - 20 ? "text-amber-600" : "text-gray-400"
                }`}
              >
                {texto.length}/{MAX_TEXTO}
              </span>
            </div>

            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
              Por qué importa hoy <span className="normal-case font-normal">(opcional)</span>
            </label>
            <textarea
              value={porQue}
              onChange={(e) => setPorQue(e.target.value.slice(0, MAX_POR_QUE))}
              rows={2}
              placeholder="El contexto ayuda a que lo haga bien, no solo a que lo haga"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />

            <div className="flex gap-2">
              <button
                onClick={guardar}
                disabled={pendiente || !texto.trim()}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-primary text-white rounded-lg px-3 py-2 text-sm font-semibold hover:bg-primary-light disabled:opacity-40"
              >
                {pendiente ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                {h ? "Guardar cambios" : "Enviar"}
              </button>
              {editando && (
                <button
                  onClick={() => {
                    setEditando(false);
                    setTexto(h?.texto ?? "");
                    setPorQue(h?.porQue ?? "");
                  }}
                  className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancelar
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div
              className="rounded-lg px-4 py-4"
              style={{ backgroundColor: h.estado === "pendiente" ? "#F5DF4D" : "#F3F4F6" }}
            >
              <p
                className={`text-base font-bold leading-snug ${
                  h.estado === "pendiente" ? "text-gray-900" : "text-gray-500 line-through"
                }`}
              >
                {h.texto}
              </p>
              {h.porQue && (
                <p
                  className={`text-xs mt-2 leading-relaxed ${
                    h.estado === "pendiente" ? "text-gray-800/80" : "text-gray-400"
                  }`}
                >
                  {h.porQue}
                </p>
              )}
            </div>

            {/* Estado del cumplimiento */}
            <div className="mt-3 flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-1 ${
                  h.estado === "logrado"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : h.estado === "no_logrado"
                      ? "bg-gray-100 text-gray-600 border border-gray-200"
                      : "bg-amber-50 text-amber-700 border border-amber-200"
                }`}
              >
                {h.estado === "logrado" ? (
                  <Check className="w-3 h-3" />
                ) : h.estado === "no_logrado" ? (
                  <X className="w-3 h-3" />
                ) : null}
                {etiquetaEstado(h.estado)}
              </span>

              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => setEditando(true)}
                  disabled={pendiente}
                  title="Corregir el texto"
                  className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100 disabled:opacity-50"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                {h.estado === "pendiente" && (
                  <button
                    onClick={quitar}
                    disabled={pendiente}
                    title="Quitar el Highlight"
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* El Reflect del administrador */}
            {h.tieneReflect && (
              <div className="mt-3 border-t border-gray-100 pt-3">
                <button
                  onClick={() => setVerReflect((v) => !v)}
                  className="w-full flex items-center justify-between gap-2 text-left"
                >
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-700">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                    Lo que escribió {sede.sede}
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-gray-400 transition-transform ${
                      verReflect ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {verReflect && (
                  <div className="mt-2 space-y-2">
                    {h.reflectAyudo && (
                      <div className="text-[11px]">
                        <div className="text-gray-500">{PREGUNTAS_REFLECT.ayudo}</div>
                        <div className="text-gray-900">{h.reflectAyudo}</div>
                      </div>
                    )}
                    {h.reflectDistrajo && (
                      <div className="text-[11px]">
                        <div className="text-gray-500">{PREGUNTAS_REFLECT.distrajo}</div>
                        <div className="text-gray-900">{h.reflectDistrajo}</div>
                      </div>
                    )}
                    {h.reflectManana && (
                      <div className="text-[11px]">
                        <div className="text-gray-500">{PREGUNTAS_REFLECT.manana}</div>
                        <div className="text-gray-900">{h.reflectManana}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
