"use client";

/**
 * Highlight del día — lo primero que ve el administrador en su panel.
 *
 * Diseño inspirado en la app "Make Time" (Knapp/Zeratsky) que usa
 * Jahnn: banda de guía arriba, tarjeta amarilla grande e imposible de
 * ignorar, y el Reflect al cerrarla.
 *
 * Es deliberadamente lo más grande de la pantalla: si compitiera en
 * tamaño con los KPIs, dejaría de ser "lo más importante del día".
 */

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  Sun, Check, X, ChevronDown, Flame, Loader2, PartyPopper, Lightbulb,
} from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { HighlightPhotos } from "@/components/highlight-photos";
import {
  cerrarHighlight, getHighlightSede, type HighlightSede,
} from "@/app/actions/highlight";
import {
  GUIA_HIGHLIGHT, PREGUNTAS_REFLECT, CIERRE_REFLECT, MAX_REFLECT, etiquetaEstado,
} from "@/lib/highlight";

const AMARILLO = "#F5DF4D";

function fechaLarga(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
    "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
  const f = new Date(Date.UTC(y, m - 1, d));
  return `${dias[f.getUTCDay()]} ${d} de ${meses[m - 1]}`;
}

function fechaCorta(iso: string) {
  const [, m, d] = iso.split("-");
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
  return `${Number(d)} ${meses[Number(m) - 1]}`;
}

export function HighlightCard({
  data,
  onRecargar,
}: {
  data: HighlightSede;
  onRecargar?: () => void;
}) {
  const { showToast } = useToast();
  const [verGuia, setVerGuia] = useState(false);
  const [guiaAbierta, setGuiaAbierta] = useState<number | null>(null);
  const [reflectAbierto, setReflectAbierto] = useState(false);
  const [ayudo, setAyudo] = useState("");
  const [distrajo, setDistrajo] = useState("");
  const [manana, setManana] = useState("");
  const [pendiente, startTransition] = useTransition();

  if (data.faltaMigracion) return null;

  const h = data.hoy;

  function guardar(estado: "logrado" | "no_logrado") {
    if (!h) return;
    startTransition(async () => {
      const r = await cerrarHighlight({ id: h.id, estado, ayudo, distrajo, manana });
      if (!r.ok) {
        showToast(r.error, "error");
        return;
      }
      showToast(
        estado === "logrado" ? "¡Highlight logrado!" : "Anotado. Mañana es otro día.",
        "success",
      );
      setReflectAbierto(false);
      onRecargar?.();
    });
  }

  return (
    <div className="rounded-2xl overflow-hidden border border-gray-200 bg-white">
      {/* Banda de guía — como la app de Make Time */}
      <div className="bg-[#CFF0EA] px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-[#004C40] tracking-tight">Highlight</h2>
            <p className="text-[11px] text-[#004C40]/70 mt-0.5">
              Lo más importante del día · {fechaLarga(data.fecha)}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {data.racha > 0 && (
              <span
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#004C40] bg-white/70 rounded-full px-2.5 py-1"
                title={`${data.racha} día${data.racha === 1 ? "" : "s"} seguidos cumpliendo tu Highlight`}
              >
                <Flame className="w-3.5 h-3.5" /> {data.racha}
              </span>
            )}
            <button
              onClick={() => setVerGuia((v) => !v)}
              className="text-[11px] font-medium text-[#004C40]/80 hover:text-[#004C40] underline decoration-dotted underline-offset-4"
            >
              {verGuia ? "Ocultar guía" : "¿Qué es esto?"}
            </button>
          </div>
        </div>

        {verGuia && (
          <div className="mt-3 space-y-1.5">
            {GUIA_HIGHLIGHT.map((g, i) => (
              <div key={g.titulo} className="bg-white rounded-lg overflow-hidden">
                <button
                  onClick={() => setGuiaAbierta((a) => (a === i ? null : i))}
                  className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left"
                >
                  <span className="text-xs font-semibold text-gray-900">{g.titulo}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${
                      guiaAbierta === i ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {guiaAbierta === i && (
                  <p className="px-3 pb-3 text-[11px] leading-relaxed text-gray-600">{g.cuerpo}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* El Highlight en sí */}
      <div className="px-5 py-6">
        {!h ? (
          <div className="text-center py-8">
            <Sun className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <div className="text-sm font-medium text-gray-500">
              Todavía no hay Highlight para hoy
            </div>
            <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
              Dirección lo asigna cada mañana. Mientras tanto, sigue con tu rutina normal.
            </p>
          </div>
        ) : (
          <>
            <div
              className="rounded-xl px-5 py-6 relative"
              style={{ backgroundColor: h.estado === "pendiente" ? AMARILLO : "#F3F4F6" }}
            >
              {h.estado !== "pendiente" && (
                <span
                  className={`absolute top-3 right-3 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-1 ${
                    h.estado === "logrado"
                      ? "bg-emerald-600 text-white"
                      : "bg-gray-500 text-white"
                  }`}
                >
                  {h.estado === "logrado" ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                  {etiquetaEstado(h.estado)}
                </span>
              )}
              {h.asignadoPor && (
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-700/70 mb-1.5">
                  Te lo dejó {h.asignadoPor}
                </div>
              )}
              <p
                className={`text-2xl font-bold leading-snug ${
                  h.estado === "pendiente" ? "text-gray-900" : "text-gray-500 line-through"
                }`}
              >
                {h.texto}
              </p>
              {h.porQue && (
                <p
                  className={`text-sm mt-3 leading-relaxed ${
                    h.estado === "pendiente" ? "text-gray-800/80" : "text-gray-400"
                  }`}
                >
                  {h.porQue}
                </p>
              )}
            </div>

            {/* Lo que dirección quiere que veas */}
            <div className="mt-4">
              <HighlightPhotos
                highlightId={h.id}
                kind="highlight_indicacion"
                titulo="Foto de dirección"
                ayuda="Dirección puede adjuntar una foto para explicar mejor el encargo."
                puedeSubir={data.esDireccion}
                puedeBorrar={data.esDireccion}
              />
            </div>

            {/* Tu evidencia de que se hizo */}
            <div className="mt-4">
              <HighlightPhotos
                highlightId={h.id}
                kind="highlight_evidencia"
                titulo="Tu evidencia"
                ayuda="Cuando termines, toma una foto de cómo quedó. Dirección la ve al instante."
                puedeSubir
                puedeBorrar
              />
            </div>

            {/* Cerrar el día */}
            {h.estado === "pendiente" && !reflectAbierto && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => setReflectAbierto(true)}
                  disabled={pendiente}
                  className="flex-1 min-w-[160px] inline-flex items-center justify-center gap-2 bg-primary text-white rounded-xl px-4 py-3 text-sm font-semibold hover:bg-primary-light disabled:opacity-50"
                >
                  <Check className="w-4 h-4" /> Cerrar mi Highlight
                </button>
              </div>
            )}

            {/* Reflect */}
            {(reflectAbierto || (h.estado !== "pendiente" && !h.tieneReflect)) && (
              <div className="mt-4 border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Lightbulb className="w-4 h-4 text-amber-500" />
                  <h3 className="text-sm font-semibold text-gray-900">Reflect · mejora continua</h3>
                </div>
                <p className="text-[11px] text-gray-500 mb-3">
                  Toma un minuto. Responde lo que te salga; en blanco también vale.
                </p>

                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  {PREGUNTAS_REFLECT.ayudo}
                </label>
                <textarea
                  value={ayudo}
                  onChange={(e) => setAyudo(e.target.value.slice(0, MAX_REFLECT))}
                  rows={2}
                  placeholder="Ej: bloqueé la primera hora antes de abrir"
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />

                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  {PREGUNTAS_REFLECT.distrajo}
                </label>
                <textarea
                  value={distrajo}
                  onChange={(e) => setDistrajo(e.target.value.slice(0, MAX_REFLECT))}
                  rows={2}
                  placeholder="Ej: llegaron proveedores sin avisar"
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />

                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  {PREGUNTAS_REFLECT.manana}
                </label>
                <textarea
                  value={manana}
                  onChange={(e) => setManana(e.target.value.slice(0, MAX_REFLECT))}
                  rows={2}
                  placeholder="Ej: empezar 30 minutos antes"
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />

                <p className="text-[11px] text-gray-400 mt-3 mb-3 italic">{CIERRE_REFLECT}</p>

                <div className="text-xs font-medium text-gray-700 mb-2">
                  {PREGUNTAS_REFLECT.logrado}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => guardar("logrado")}
                    disabled={pendiente}
                    className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 bg-emerald-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {pendiente ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <PartyPopper className="w-4 h-4" />
                    )}
                    Sí, lo logré
                  </button>
                  <button
                    onClick={() => guardar("no_logrado")}
                    disabled={pendiente}
                    className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 bg-white text-gray-700 border border-gray-300 rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
                  >
                    No esta vez
                  </button>
                </div>
                {reflectAbierto && h.estado === "pendiente" && (
                  <button
                    onClick={() => setReflectAbierto(false)}
                    className="w-full text-[11px] text-gray-400 hover:text-gray-600 mt-2"
                  >
                    Todavía no, sigo en eso
                  </button>
                )}
              </div>
            )}

            {/* Ya cerrado y con Reflect escrito */}
            {h.estado !== "pendiente" && h.tieneReflect && (
              <div className="mt-4 bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
                <div className="text-xs font-semibold text-gray-700">Tu Reflect de hoy</div>
                {h.reflectAyudo && (
                  <div className="text-xs">
                    <span className="text-gray-500">{PREGUNTAS_REFLECT.ayudo} </span>
                    <span className="text-gray-900">{h.reflectAyudo}</span>
                  </div>
                )}
                {h.reflectDistrajo && (
                  <div className="text-xs">
                    <span className="text-gray-500">{PREGUNTAS_REFLECT.distrajo} </span>
                    <span className="text-gray-900">{h.reflectDistrajo}</span>
                  </div>
                )}
                {h.reflectManana && (
                  <div className="text-xs">
                    <span className="text-gray-500">{PREGUNTAS_REFLECT.manana} </span>
                    <span className="text-gray-900">{h.reflectManana}</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Historial corto: los últimos días, para ver la constancia */}
        {data.historial.length > 0 && (
          <div className="mt-5 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Días anteriores
              </span>
              {data.cumplimiento.pct !== null && (
                <span className="text-[11px] text-gray-500">
                  {data.cumplimiento.pct}% cumplido
                </span>
              )}
            </div>
            <div className="space-y-1">
              {data.historial.map((d) => (
                <div key={d.fecha} className="flex items-center gap-2 text-xs">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      d.estado === "logrado"
                        ? "bg-emerald-500"
                        : d.estado === "no_logrado"
                          ? "bg-gray-300"
                          : "bg-amber-400"
                    }`}
                  />
                  <span className="text-gray-400 w-12 shrink-0">{fechaCorta(d.fecha)}</span>
                  <span
                    className={`truncate ${
                      d.estado === "logrado" ? "text-gray-700" : "text-gray-400"
                    }`}
                  >
                    {d.texto}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Envoltorio que se trae sus propios datos, para que cada panel de sede
 * lo inserte con una sola línea. La sede sale de la ruta (la resuelve
 * `activeBusinessId()` dentro del action), así el mismo componente sirve
 * igual en Atelier, Fonavi y Centro.
 */
export function HighlightSlot() {
  const [data, setData] = useState<HighlightSede | null>(null);

  const cargar = useCallback(async () => {
    setData(await getHighlightSede());
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargar]);

  // Mientras carga se reserva el alto para que el resto del panel no
  // salte cuando aparezca la tarjeta.
  if (!data) {
    return <div className="rounded-2xl border border-gray-200 bg-white h-48 animate-pulse" />;
  }
  return <HighlightCard data={data} onRecargar={cargar} />;
}
