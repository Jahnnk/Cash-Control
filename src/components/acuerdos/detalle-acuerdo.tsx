"use client";

/**
 * Detalle de un acuerdo en un panel lateral (estilo Asana, 19-nov-2026). Todo en un lugar: estado y botones,
 * los campos (se editan ahí mismo si tienes permiso), la actividad y los comentarios.
 * Reglas de permiso: src/lib/acuerdos.ts → puede (el servidor vuelve a revisarlas).
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  anularAcuerdo, avanzarAcuerdo, comentarAcuerdo, editarAcuerdo, getHistorialAcuerdo, revisarCumplido,
  type Acuerdo, type Evento, type YoSesion,
} from "@/app/actions/acuerdos";
import { AREA_LABEL, AREAS, PRIORIDAD_LABEL, PRIORIDADES, ESTADO_LABEL, estadoVisible, puede, textoPlazo, type EstadoVisible, type Persona } from "@/lib/acuerdos";
import { Pastilla } from "@/components/productos/ui";
import { Avatar, PrioridadIcono, diaCorto } from "./ui";
import { yoPara } from "./fila-acuerdo";

const TONO: Record<EstadoVisible, "gris" | "azul" | "ambar" | "verde" | "rojo"> = {
  pendiente: "gris", en_proceso: "azul", por_confirmar: "ambar", cumplido: "verde", vencido: "rojo", anulado: "gris",
};
const cuando = (ts: string) => new Date(ts).toLocaleString("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const VERBO: Record<string, string> = {
  estado: "", devuelto: "lo devolvió", fecha: "cambió la fecha", responsable: "cambió el responsable",
  confirmado: "confirmó el cumplido", prioridad: "cambió la prioridad", anulado: "lo anuló", editado: "lo editó",
};

const CAMPO = "w-full rounded-lg border border-transparent hover:border-gray-200 focus:border-gray-300 px-2 py-1.5 text-sm bg-transparent disabled:hover:border-transparent";
const BTN = "px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50";
const BTN_PRIM = "px-3 py-1.5 text-xs font-medium rounded-lg text-white bg-primary hover:bg-primary-light disabled:opacity-50";

export function DetalleAcuerdo({ a, yo, hoy, personas, comoResponsable = false, onCambio, onCerrar }: {
  a: Acuerdo;
  yo: YoSesion;
  hoy: string;
  /** Sin personas no se edita (el panel del admin solo avanza lo suyo). */
  personas?: Persona[];
  comoResponsable?: boolean;
  onCambio: () => void;
  onCerrar: () => void;
}) {
  const y = yoPara(yo, a, comoResponsable);
  const puedeEditar = !!personas && puede(y, a, "editar");
  const v = estadoVisible(a, hoy);
  const [historial, setHistorial] = useState<Evento[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [que, setQue] = useState(a.que);
  const [detalle, setDetalle] = useState(a.detalle ?? "");
  const [fechaNueva, setFechaNueva] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [pide, setPide] = useState<null | "devolver" | "anular">(null);
  const [texto, setTexto] = useState("");
  const [comentario, setComentario] = useState("");

  const cargarHistorial = useCallback(async () => {
    const r = await getHistorialAcuerdo(a.id);
    setHistorial(r.ok ? r.eventos : []);
  }, [a.id]);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- historial al abrir */
    void cargarHistorial();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargarHistorial]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onCerrar]);

  async function correr(f: () => Promise<{ ok: boolean; error?: string }>) {
    setOcupado(true);
    setError(null);
    const r = await f();
    setOcupado(false);
    if (!r.ok) { setError(r.error ?? "No se pudo guardar."); return false; }
    setPide(null);
    setTexto("");
    onCambio();
    void cargarHistorial();
    return true;
  }

  const editar = (cambio: Partial<{ que: string; detalle: string; area: string; responsable: string; fechaLimite: string; motivoFecha: string; prioridad: string }>) =>
    correr(() => editarAcuerdo(a.id, { que: a.que, detalle: a.detalle ?? "", area: a.area, responsable: a.responsableClave, fechaLimite: a.fechaLimite, prioridad: a.prioridad, ...cambio }));

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-label="Detalle del acuerdo">
      <div className="absolute inset-0 bg-black/20" onClick={onCerrar} />
      <aside className="relative w-full sm:w-[480px] h-full bg-white shadow-2xl flex flex-col">
        {/* Barra superior: estado y lo que se puede hacer ahora */}
        <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-gray-100">
          <Pastilla tono={TONO[v]}>{ESTADO_LABEL[v]}</Pastilla>
          {puede(y, a, "avanzar") && a.estado === "pendiente" && <button type="button" className={BTN} disabled={ocupado} onClick={() => void correr(() => avanzarAcuerdo(a.id, "en_proceso"))}>Empecé</button>}
          {puede(y, a, "avanzar") && <button type="button" className={BTN_PRIM} disabled={ocupado} onClick={() => void correr(() => avanzarAcuerdo(a.id, "cumplido"))}>Marcar cumplido</button>}
          {puede(y, a, "confirmar") && (
            <>
              <button type="button" className={BTN_PRIM} disabled={ocupado} onClick={() => void correr(() => revisarCumplido(a.id, "confirmar"))}>Confirmar cumplido</button>
              <button type="button" className={BTN} disabled={ocupado} onClick={() => setPide("devolver")}>Devolver</button>
            </>
          )}
          {ocupado && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          <button type="button" onClick={onCerrar} className="ml-auto p-1 text-gray-400 hover:text-gray-700" aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {pide && (
            <div className="flex gap-2">
              <input autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm"
                placeholder={pide === "devolver" ? "¿Por qué lo devuelves?" : "¿Por qué se anula?"} />
              <button type="button" className={BTN_PRIM} disabled={ocupado} onClick={() => void correr(() => (pide === "devolver" ? revisarCumplido(a.id, "devolver", texto) : anularAcuerdo(a.id, texto)))}>
                {pide === "devolver" ? "Devolver" : "Anular"}
              </button>
              <button type="button" className="text-xs text-gray-500" onClick={() => setPide(null)}>Cancelar</button>
            </div>
          )}
          {error && <p className="text-xs text-red-700">{error}</p>}

          {/* Título */}
          <textarea value={que} onChange={(e) => setQue(e.target.value)} disabled={!puedeEditar} rows={2}
            onBlur={() => { if (que.trim() && que.trim() !== a.que) void editar({ que }); }}
            className="w-full rounded-lg border border-transparent hover:border-gray-200 focus:border-gray-300 px-2 py-1 -mx-2 text-lg font-semibold leading-snug text-gray-900 bg-transparent resize-none disabled:hover:border-transparent" aria-label="Qué se hará" />

          {/* Campos */}
          <dl className="grid grid-cols-[110px_1fr] items-center gap-y-1 text-sm">
            <dt className="text-gray-500">Responsable</dt>
            <dd className="flex items-center gap-2 min-w-0">
              <Avatar nombre={a.responsableNombre} clave={a.responsableClave} />
              {puedeEditar ? (
                <select value={a.responsableClave} onChange={(e) => void editar({ responsable: e.target.value })} className={CAMPO}>
                  {!personas!.some((p) => p.clave === a.responsableClave) && <option value={a.responsableClave}>{a.responsableNombre}</option>}
                  {personas!.map((p) => <option key={p.clave} value={p.clave}>{p.nombre} · {p.detalle}</option>)}
                </select>
              ) : <span className="px-2 py-1.5 text-gray-900">{a.responsableNombre}</span>}
            </dd>

            <dt className="text-gray-500">Fecha límite</dt>
            <dd className="min-w-0">
              {puedeEditar ? (
                <input type="date" value={fechaNueva ?? a.fechaLimite} min={hoy} onChange={(e) => setFechaNueva(e.target.value === a.fechaLimite ? null : e.target.value)} className={CAMPO} />
              ) : <span className="px-2 py-1.5 inline-block text-gray-900">{diaCorto(a.fechaLimite)}</span>}
              <span className={`ml-2 text-xs ${v === "vencido" ? "text-red-700 font-medium" : "text-gray-500"}`}>
                {(v === "pendiente" || v === "en_proceso" || v === "vencido") && textoPlazo(a.fechaLimite, hoy)}
              </span>
              {a.fechaLimite !== a.fechaLimiteOriginal && <div className="text-[11px] text-gray-400 px-2">Fecha original: {diaCorto(a.fechaLimiteOriginal)}</div>}
            </dd>
            {fechaNueva && (
              <dd className="col-start-2 flex gap-2 py-1">
                <input autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="¿Por qué cambia la fecha?" className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm" />
                <button type="button" className={BTN_PRIM} disabled={ocupado} onClick={() => void editar({ fechaLimite: fechaNueva, motivoFecha: motivo }).then((ok) => { if (ok) { setFechaNueva(null); setMotivo(""); } })}>Guardar</button>
                <button type="button" className="text-xs text-gray-500" onClick={() => { setFechaNueva(null); setMotivo(""); }}>Cancelar</button>
              </dd>
            )}

            <dt className="text-gray-500">Prioridad</dt>
            <dd className="flex items-center gap-1 min-w-0">
              <PrioridadIcono p={a.prioridad} />
              {puedeEditar ? (
                <select value={a.prioridad} onChange={(e) => void editar({ prioridad: e.target.value })} className={CAMPO}>
                  {PRIORIDADES.map((x) => <option key={x} value={x}>{PRIORIDAD_LABEL[x]}</option>)}
                </select>
              ) : <span className="px-2 py-1.5 text-gray-900">{PRIORIDAD_LABEL[a.prioridad]}</span>}
            </dd>

            <dt className="text-gray-500">Área</dt>
            <dd>
              {puedeEditar ? (
                <select value={a.area} onChange={(e) => void editar({ area: e.target.value })} className={CAMPO}>
                  {AREAS.map((x) => <option key={x} value={x}>{AREA_LABEL[x]}</option>)}
                </select>
              ) : <span className="px-2 py-1.5 inline-block text-gray-900">{AREA_LABEL[a.area]}</span>}
            </dd>

            <dt className="text-gray-500">Origen</dt>
            <dd className="px-2 py-1.5 text-gray-900">{a.reunionTitulo ? `Reunión: ${a.reunionTitulo}` : "Del día a día"}</dd>
          </dl>

          {/* Descripción */}
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">Descripción</div>
            <textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} disabled={!puedeEditar} rows={3}
              placeholder={puedeEditar ? "Agrega detalles: qué se espera, a quién llamar, dónde está el archivo…" : "Sin descripción."}
              onBlur={() => { if (detalle.trim() !== (a.detalle ?? "")) void editar({ detalle }); }}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-600" />
          </div>

          {/* Actividad */}
          <div>
            <div className="text-xs font-medium text-gray-500 mb-2">Actividad</div>
            <ul className="space-y-2.5">
              <li className="text-xs text-gray-500"><span className="font-medium text-gray-700">{a.creadoPor}</span> lo creó · {cuando(a.creadoEl)}</li>
              {!historial ? <li><Loader2 className="w-4 h-4 animate-spin text-gray-300" /></li> : historial.map((e) => e.tipo === "comentario" ? (
                <li key={e.id} className="flex gap-2">
                  <span className="mt-0.5"><Avatar nombre={e.quien} clave={e.quien} /></span>
                  <div className="min-w-0 flex-1 rounded-xl bg-gray-50 px-3 py-2">
                    <div className="text-[11px] text-gray-500"><span className="font-medium text-gray-800">{e.quien}</span> · {cuando(e.cuando)}</div>
                    <div className="text-sm text-gray-800 whitespace-pre-line">{e.detalle}</div>
                  </div>
                </li>
              ) : (
                <li key={e.id} className="text-xs text-gray-500">
                  <span className="font-medium text-gray-700">{e.quien}</span>{VERBO[e.tipo] ? ` ${VERBO[e.tipo]}${e.detalle ? `: ${e.detalle}` : ""}` : e.detalle ? ` · ${e.detalle}` : ""} · {cuando(e.cuando)}
                </li>
              ))}
            </ul>
          </div>

          {puedeEditar && puede(y, a, "anular") && !pide && (
            <button type="button" onClick={() => setPide("anular")} className="text-xs text-red-700 hover:underline">Anular este acuerdo</button>
          )}
        </div>

        {/* Comentar, abajo como en Asana */}
        {puede(y, a, "comentar") && (
          <div className="border-t border-gray-100 px-5 py-3 flex gap-2">
            <input value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Escribe un comentario…"
              onKeyDown={(e) => { if (e.key === "Enter" && comentario.trim()) void correr(() => comentarAcuerdo(a.id, comentario)).then((ok) => ok && setComentario("")); }}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <button type="button" className={BTN_PRIM} disabled={ocupado || !comentario.trim()} onClick={() => void correr(() => comentarAcuerdo(a.id, comentario)).then((ok) => ok && setComentario(""))}>Comentar</button>
          </div>
        )}
      </aside>
    </div>
  );
}
