"use client";

/**
 * Un acuerdo o tarea, con sus botones según quién mira (src/lib/acuerdos.ts → puede).
 * Se usa en Grupo → Acuerdos y tareas y en el Panel de Sede («Mis acuerdos»).
 */

import { useState } from "react";
import { History, Loader2, MessageSquare } from "lucide-react";
import {
  avanzarAcuerdo, anularAcuerdo, comentarAcuerdo, editarAcuerdo, getHistorialAcuerdo, revisarCumplido,
  type Acuerdo, type Evento, type YoSesion,
} from "@/app/actions/acuerdos";
import { ALERTA_LABEL, alertaDe, AREA_LABEL, AREAS, ESTADO_LABEL, estadoVisible, puede, textoPlazo, type EstadoVisible, type Persona } from "@/lib/acuerdos";
import { Pastilla } from "@/components/productos/ui";

const TONO: Record<EstadoVisible, "gris" | "azul" | "ambar" | "verde" | "rojo"> = {
  pendiente: "gris", en_proceso: "azul", por_confirmar: "ambar", cumplido: "verde", vencido: "rojo", anulado: "gris",
};

export function PastillaEstado({ estado }: { estado: EstadoVisible }) {
  return <Pastilla tono={TONO[estado]}>{ESTADO_LABEL[estado]}</Pastilla>;
}

export const fechaLarga = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short" });
const cuandoCorto = (ts: string) => new Date(ts).toLocaleString("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const BTN = "px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50";
const BTN_PRIM = "px-2.5 py-1 text-xs font-medium rounded-lg text-white bg-primary hover:bg-primary-light disabled:opacity-50";
const INPUT = "w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm";

type Modo = null | "editar" | "anular" | "devolver" | "comentar" | "cumplir";

export function AcuerdoItem({ a, yo, hoy, personas, mostrarResponsable = true, onCambio }: {
  a: Acuerdo;
  yo: YoSesion;
  hoy: string;
  /** Sin personas no se puede editar (el panel del admin no edita). */
  personas?: Persona[];
  mostrarResponsable?: boolean;
  onCambio: () => void;
}) {
  const [modo, setModo] = useState<Modo>(null);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historial, setHistorial] = useState<Evento[] | null>(null);
  const [verHistorial, setVerHistorial] = useState(false);
  const [form, setForm] = useState({ que: a.que, detalle: a.detalle ?? "", area: a.area as string, responsable: a.responsableClave, fechaLimite: a.fechaLimite, motivoFecha: "" });

  const v = estadoVisible(a, hoy);
  const alerta = alertaDe(a, hoy);
  // El admin con contraseña de sede actúa como el responsable de lo que le llega.
  const yoAqui = personas ? yo : { ...yo, clave: a.responsableClave };
  const p = (acc: Parameters<typeof puede>[2]) => puede(yoAqui, a, acc);

  async function correr(f: () => Promise<{ ok: boolean; error?: string }>) {
    setOcupado(true);
    setError(null);
    const r = await f();
    setOcupado(false);
    if (!r.ok) { setError(r.error ?? "No se pudo guardar."); return; }
    setModo(null);
    setTexto("");
    setHistorial(null);
    setVerHistorial(false);
    onCambio();
  }

  async function abrirHistorial() {
    if (verHistorial) { setVerHistorial(false); return; }
    setVerHistorial(true);
    if (!historial) {
      const r = await getHistorialAcuerdo(a.id);
      setHistorial(r.ok ? r.eventos : []);
    }
  }

  const abrir = (m: Modo) => { setModo(modo === m ? null : m); setTexto(""); setError(null); };

  return (
    <li className={`py-3 ${v === "anulado" ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <div className={`text-sm font-medium text-gray-900 ${v === "anulado" ? "line-through" : ""}`}>{a.que}</div>
          {a.detalle && <div className="text-xs text-gray-600 mt-0.5 whitespace-pre-line">{a.detalle}</div>}
          <div className="text-[11px] text-gray-500 mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
            {mostrarResponsable && <span className="font-medium text-gray-700">{a.responsableNombre}</span>}
            <span>{AREA_LABEL[a.area]}</span>
            <span>· {a.reunionTitulo ? `Reunión: ${a.reunionTitulo}` : "Del día a día"}</span>
            <span>· asignó {a.creadoPor}</span>
            {a.comentarios > 0 && <span className="inline-flex items-center gap-0.5">· <MessageSquare className="w-3 h-3" />{a.comentarios}</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="flex flex-wrap justify-end gap-1">
            {(alerta === "devuelto" || alerta === "nuevo") && <Pastilla tono={alerta === "devuelto" ? "rojo" : "azul"}>{ALERTA_LABEL[alerta]}</Pastilla>}
            <PastillaEstado estado={v} />
          </div>
          <div className={`text-[11px] mt-1 ${v === "vencido" ? "text-red-700 font-medium" : "text-gray-500"}`}>
            {fechaLarga(a.fechaLimite)}
            {(v === "pendiente" || v === "en_proceso" || v === "vencido") && ` · ${textoPlazo(a.fechaLimite, hoy)}`}
          </div>
          {a.fechaLimite !== a.fechaLimiteOriginal && <div className="text-[11px] text-gray-400">Fecha original: {fechaLarga(a.fechaLimiteOriginal)}</div>}
          {a.tarde && (v === "cumplido" || v === "por_confirmar") && <div className="text-[11px] text-amber-700">Entregado tarde</div>}
          {v === "cumplido" && a.confirmadoPor && <div className="text-[11px] text-gray-400">Confirmó {a.confirmadoPor}</div>}
        </div>
      </div>

      {v !== "anulado" && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {p("avanzar") && a.estado === "pendiente" && (
            <button type="button" className={BTN} disabled={ocupado} onClick={() => void correr(() => avanzarAcuerdo(a.id, "en_proceso"))}>Empecé</button>
          )}
          {p("avanzar") && <button type="button" className={BTN_PRIM} disabled={ocupado} onClick={() => abrir("cumplir")}>Marcar cumplido</button>}
          {p("confirmar") && (
            <>
              <button type="button" className={BTN_PRIM} disabled={ocupado} onClick={() => void correr(() => revisarCumplido(a.id, "confirmar"))}>Confirmar cumplido</button>
              <button type="button" className={BTN} disabled={ocupado} onClick={() => abrir("devolver")}>Devolver</button>
            </>
          )}
          {personas && p("editar") && <button type="button" className={BTN} onClick={() => abrir("editar")}>Editar</button>}
          {p("comentar") && <button type="button" className={BTN} onClick={() => abrir("comentar")}>Comentar</button>}
          <button type="button" className={`${BTN} inline-flex items-center gap-1`} onClick={() => void abrirHistorial()}><History className="w-3 h-3" />Historial</button>
          {personas && p("anular") && <button type="button" className={`${BTN} text-red-700`} onClick={() => abrir("anular")}>Anular</button>}
          {ocupado && <Loader2 className="w-4 h-4 animate-spin text-gray-400 self-center" />}
        </div>
      )}

      {(modo === "cumplir" || modo === "comentar" || modo === "devolver" || modo === "anular") && (
        <div className="mt-2 flex flex-col sm:flex-row gap-2">
          <input autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} className={INPUT}
            placeholder={modo === "cumplir" ? "Nota opcional: qué se hizo" : modo === "comentar" ? "Escribe el comentario" : modo === "devolver" ? "¿Por qué lo devuelves?" : "¿Por qué se anula?"} />
          <button type="button" className={BTN_PRIM} disabled={ocupado} onClick={() => void correr(() =>
            modo === "cumplir" ? avanzarAcuerdo(a.id, "cumplido", texto)
              : modo === "comentar" ? comentarAcuerdo(a.id, texto)
                : modo === "devolver" ? revisarCumplido(a.id, "devolver", texto)
                  : anularAcuerdo(a.id, texto))}>
            {modo === "cumplir" ? "Listo, cumplido" : modo === "comentar" ? "Guardar" : modo === "devolver" ? "Devolver" : "Anular"}
          </button>
          <button type="button" className="px-2 py-1 text-xs text-gray-500" onClick={() => setModo(null)}>Cancelar</button>
        </div>
      )}

      {modo === "editar" && personas && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2 bg-gray-50 rounded-xl p-3">
          <label className="sm:col-span-2 text-xs text-gray-600">Qué se hará
            <input value={form.que} onChange={(e) => setForm({ ...form, que: e.target.value })} className={INPUT} />
          </label>
          <label className="sm:col-span-2 text-xs text-gray-600">Detalle (opcional)
            <textarea value={form.detalle} onChange={(e) => setForm({ ...form, detalle: e.target.value })} rows={2} className={INPUT} />
          </label>
          <label className="text-xs text-gray-600">Responsable
            <select value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })} className={INPUT}>
              {!personas.some((x) => x.clave === a.responsableClave) && <option value={a.responsableClave}>{a.responsableNombre}</option>}
              {personas.map((x) => <option key={x.clave} value={x.clave}>{x.nombre} · {x.detalle}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-600">Área
            <select value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} className={INPUT}>
              {AREAS.map((x) => <option key={x} value={x}>{AREA_LABEL[x]}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-600">Fecha límite
            <input type="date" value={form.fechaLimite} min={hoy} onChange={(e) => setForm({ ...form, fechaLimite: e.target.value })} className={INPUT} />
          </label>
          {form.fechaLimite !== a.fechaLimite && (
            <label className="text-xs text-gray-600">¿Por qué cambia la fecha?
              <input value={form.motivoFecha} onChange={(e) => setForm({ ...form, motivoFecha: e.target.value })} className={INPUT} placeholder="Queda en el historial" />
            </label>
          )}
          <div className="sm:col-span-2 flex gap-2">
            <button type="button" className={BTN_PRIM} disabled={ocupado} onClick={() => void correr(() => editarAcuerdo(a.id, form))}>Guardar cambios</button>
            <button type="button" className="px-2 py-1 text-xs text-gray-500" onClick={() => setModo(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}

      {verHistorial && (
        <div className="mt-2 rounded-xl bg-gray-50 px-3 py-2">
          {!historial ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : historial.length === 0 ? (
            <p className="text-xs text-gray-500">Sin cambios desde que se creó ({cuandoCorto(a.creadoEl)}).</p>
          ) : (
            <ul className="space-y-1">
              <li className="text-[11px] text-gray-500">{cuandoCorto(a.creadoEl)} · {a.creadoPor} lo creó</li>
              {historial.map((e) => (
                <li key={e.id} className="text-[11px] text-gray-700">
                  <span className="text-gray-500">{cuandoCorto(e.cuando)} · {e.quien}</span>
                  {" "}{e.tipo === "comentario" ? "comentó" : e.tipo === "devuelto" ? "lo devolvió" : e.tipo === "fecha" ? "cambió la fecha" : e.tipo === "responsable" ? "cambió el responsable" : e.tipo === "confirmado" ? "confirmó" : e.tipo === "anulado" ? "lo anuló" : ""}
                  {e.detalle && <>: {e.detalle}</>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
