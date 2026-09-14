"use client";

/**
 * Una observación de supervisión, tal como la ven sus dos protagonistas.
 *
 *   · modo "supervisor" (Juani / dirección): ve lo que corrigió el
 *     administrador y confirma o rechaza con un motivo.
 *   · modo "admin": ve qué encontró Juani, cuánto plazo le queda, sube la
 *     foto de cómo quedó y la envía.
 *
 * Una sola tarjeta para los dos a propósito: los dos miran el MISMO
 * plazo y la MISMA foto, y si cada pantalla lo contara a su manera
 * terminarían discutiendo cuál tiene razón.
 */

import { useState } from "react";
import { Loader2, Check, RotateCcw, Send, Clock, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { SupervisionPhotos } from "@/components/supervision-photos";
import {
  marcarCorregida, confirmarCorreccion, rechazarCorreccion, type ObservacionVista,
} from "@/app/actions/supervisiones";
import { ETIQUETA_GRAVEDAD, textoPlazo, type SituacionObservacion } from "@/lib/supervisiones";

const SITUACION: Record<SituacionObservacion, { label: string; chip: string }> = {
  en_plazo: { label: "En plazo", chip: "bg-amber-50 text-amber-800 border-amber-200" },
  por_confirmar: { label: "Esperando a Juani", chip: "bg-sky-50 text-sky-800 border-sky-200" },
  cumplida: { label: "Corregida a tiempo", chip: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  fuera_de_plazo: { label: "Fuera de plazo", chip: "bg-red-50 text-red-800 border-red-200" },
};

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });

export function ObservacionSupervision({
  o,
  ahora,
  modo,
  mostrarSede = false,
  onCambio,
}: {
  o: ObservacionVista;
  ahora: string;
  modo: "supervisor" | "admin";
  mostrarSede?: boolean;
  onCambio: () => void;
}) {
  const { showToast } = useToast();
  const [comentario, setComentario] = useState("");
  const [motivo, setMotivo] = useState("");
  const [rechazando, setRechazando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [fotosNuevas, setFotosNuevas] = useState(0);
  const s = SITUACION[o.situacion];
  const critica = o.gravedad === "critica";

  async function correr(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, exito: string) {
    setTrabajando(true);
    const r = await fn();
    setTrabajando(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast(exito, "success");
    onCambio();
  }

  return (
    <div className={`rounded-xl border p-3 space-y-3 bg-white ${critica ? "border-red-200" : "border-gray-200"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-900">
            {mostrarSede && <span className="text-gray-500">{o.sede} · </span>}
            {o.titulo}
          </div>
          {o.detalle && <div className="text-xs text-gray-600 mt-0.5">{o.detalle}</div>}
          <div className="text-[11px] text-gray-400 mt-0.5">Visita del {o.fechaVisita.slice(8)}/{o.fechaVisita.slice(5, 7)}</div>
        </div>
        <div className="flex flex-wrap gap-1.5 shrink-0">
          <span className={`text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 border ${critica ? "bg-red-600 text-white border-red-600" : "bg-gray-100 text-gray-600 border-gray-200"}`}>
            {ETIQUETA_GRAVEDAD[o.gravedad]}
          </span>
          <span className={`text-[11px] rounded-full px-2 py-0.5 border ${s.chip}`}>{s.label}</span>
        </div>
      </div>

      {o.estado === "abierta" && (
        <div className={`flex items-center gap-1.5 text-xs ${o.situacion === "fuera_de_plazo" ? "text-red-700" : "text-amber-800"}`}>
          <Clock className="w-3.5 h-3.5" />
          {textoPlazo(o.plazoHasta, ahora)} ({fechaHora(o.plazoHasta)})
        </div>
      )}

      {o.ultimoRechazo && o.estado === "abierta" && (
        <div className="flex gap-1.5 text-xs text-red-800 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>Juani pidió volver a corregir: «{o.ultimoRechazo}»</span>
        </div>
      )}

      <SupervisionPhotos
        observacionId={o.id}
        tipo="supervision_problema"
        titulo="Así lo encontró Juani"
        puedeSubir={modo === "supervisor" && o.estado !== "confirmada"}
        puedeBorrar={modo === "supervisor" && o.estado !== "confirmada"}
      />

      <SupervisionPhotos
        observacionId={o.id}
        tipo="supervision_correccion"
        titulo="Así quedó"
        puedeSubir={modo === "admin" && o.estado === "abierta"}
        puedeBorrar={modo === "admin" && o.estado === "abierta"}
        onCambio={() => setFotosNuevas((n) => n + 1)}
      />

      {o.comentarioCorreccion && o.estado !== "abierta" && (
        <div className="text-xs text-gray-700">
          <span className="text-gray-400">{o.corregidaPor ?? "Administración"}:</span> {o.comentarioCorreccion}
        </div>
      )}
      {o.corregidaEn && o.estado !== "abierta" && (
        <div className="text-[11px] text-gray-400">
          Corregida el {fechaHora(o.corregidaEn)}
          {o.confirmadaEn && <> · confirmada por {o.confirmadaPor} el {fechaHora(o.confirmadaEn)}</>}
        </div>
      )}

      {/* Administrador: enviar la corrección */}
      {modo === "admin" && o.estado === "abierta" && (
        <div className="space-y-2">
          <input
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="¿Qué se hizo? (opcional)"
            className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm"
          />
          <button
            onClick={() => void correr(() => marcarCorregida(o.id, comentario), "Enviado a Juani para que lo confirme")}
            disabled={trabajando}
            className="w-full py-2 rounded-lg bg-primary text-white text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-60"
            title={fotosNuevas === 0 ? "Primero sube la foto de cómo quedó" : undefined}
          >
            {trabajando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Ya está corregido
          </button>
        </div>
      )}
      {modo === "admin" && o.estado === "corregida" && (
        <div className="text-xs text-sky-800">Enviado. Juani lo va a revisar; el plazo ya no corre para ti.</div>
      )}

      {/* Juani: confirmar o rechazar */}
      {modo === "supervisor" && o.estado === "corregida" && (
        rechazando ? (
          <div className="space-y-2">
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="¿Qué falta? El administrador lo verá y tendrá un plazo nuevo."
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm"
            />
            <div className="flex gap-2">
              <button onClick={() => setRechazando(false)} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-700">Cancelar</button>
              <button
                onClick={() => void correr(() => rechazarCorreccion(o.id, motivo), "Devuelto al administrador")}
                disabled={trabajando}
                className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm disabled:opacity-60"
              >
                Devolver
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setRechazando(true)}
              className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" /> Falta corregir
            </button>
            <button
              onClick={() => void correr(() => confirmarCorreccion(o.id), "Corrección confirmada")}
              disabled={trabajando}
              className="flex-1 py-2 rounded-lg bg-emerald-600 text-white text-sm flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              {trabajando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Confirmar
            </button>
          </div>
        )
      )}
    </div>
  );
}
