"use client";

/**
 * Historial de Highlights ya cerrados — vista de calendario.
 *
 * Observación de Jahnn (17-ago-2026): "se ve muy cargada la pantalla
 * con las evidencias de días anteriores, día por día, uno tras otro".
 * Tenía razón: cada día pintaba su detalle completo MÁS dos tiras de
 * fotos, y cada tira pedía sus fotos al servidor por su cuenta. Siete
 * días eran catorce llamadas y una pantalla interminable.
 *
 * Ahora los días cerrados son una fila de casillas; se abre UNA a la
 * vez y solo esa carga sus fotos. Dos consecuencias buenas: la pantalla
 * cabe de un vistazo y el panel deja de hacer trabajo que nadie miraba.
 *
 * Lo que NO cambió, a propósito: los días SIN CERRAR no entran acá.
 * Esos siguen desplegados arriba porque piden una acción, y esconderlos
 * detrás de un clic sería volver al hueco que ya costó dos arreglos
 * (Luis no podía cerrar lo de ayer; después no podía subirle la foto).
 */

import { useCallback, useEffect, useState } from "react";
import { Check, X, Camera, CalendarDays } from "lucide-react";
import { HighlightPhotos } from "@/components/highlight-photos";
import { contarFotosHighlights } from "@/app/actions/highlight-photos";
import type { Highlight } from "@/app/actions/highlight";

const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
  "agosto", "setiembre", "octubre", "noviembre", "diciembre"];

function partes(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const f = new Date(Date.UTC(y, m - 1, d));
  return { dow: DIAS_CORTOS[f.getUTCDay()], dia: d, mes: MESES[m - 1] };
}

function fechaLarga(iso: string) {
  const p = partes(iso);
  return `${p.dow} ${p.dia} de ${p.mes}`;
}

export function HistorialHighlights({
  dias,
  esDireccion,
  pct,
}: {
  /** Solo los ya cerrados. Los pendientes van desplegados aparte. */
  dias: Highlight[];
  esDireccion: boolean;
  pct: number | null;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const [fotos, setFotos] = useState<Record<string, { indicacion: number; evidencia: number }>>({});

  const ids = dias.map((d) => d.id).join(",");

  const contar = useCallback(async () => {
    // Una sola consulta para todo el historial: así la fila de casillas
    // puede marcar qué días ya tienen evidencia sin abrir ninguno.
    try {
      setFotos(await contarFotosHighlights(ids ? ids.split(",") : []));
    } catch (e) {
      console.error("[HistorialHighlights] contar:", e);
    }
  }, [ids]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- conteo al montar */
    void contar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [contar]);

  if (dias.length === 0) return null;

  // De izquierda a derecha como se lee un calendario: el más antiguo
  // primero. La lista llega al revés (lo más nuevo arriba).
  const enOrden = [...dias].reverse();
  const elegido = dias.find((d) => d.id === abierto) ?? null;
  const sinEvidencia = dias.filter((d) => (fotos[d.id]?.evidencia ?? 0) === 0).length;

  return (
    <div className="mt-5 pt-4 border-t border-gray-100">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div className="flex items-start gap-2">
          <CalendarDays className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-xs font-semibold text-gray-900">Tus días anteriores</div>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {sinEvidencia > 0
                ? `Toca un día para ver el detalle. ${sinEvidencia === 1 ? "Uno" : sinEvidencia} sin foto de evidencia — todavía puedes subirla.`
                : "Toca un día para ver el detalle y sus fotos."}
            </p>
          </div>
        </div>
        {pct !== null && (
          <div className="text-[11px] text-gray-400 shrink-0">{pct}% cumplido en 30 días</div>
        )}
      </div>

      {/* La fila de días. Se desliza en el celular en vez de apilarse. */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {enOrden.map((d) => {
          const p = partes(d.fecha);
          const logrado = d.estado === "logrado";
          const conEvidencia = (fotos[d.id]?.evidencia ?? 0) > 0;
          const activo = abierto === d.id;
          return (
            <button
              key={d.id}
              onClick={() => setAbierto(activo ? null : d.id)}
              title={`${fechaLarga(d.fecha)} · ${logrado ? "Logrado" : "No se logró"} · ${d.texto}`}
              aria-label={`${fechaLarga(d.fecha)}: ${d.texto}`}
              className={`shrink-0 w-14 rounded-xl border px-1 py-1.5 text-center transition ${
                activo
                  ? "border-primary ring-2 ring-primary/30 bg-white"
                  : logrado
                    ? "border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                    : "border-gray-200 bg-gray-50 hover:bg-gray-100"
              }`}
            >
              <div className={`text-[9px] uppercase font-semibold ${logrado ? "text-emerald-700" : "text-gray-500"}`}>
                {p.dow}
              </div>
              <div className={`text-base font-black leading-none ${logrado ? "text-emerald-800" : "text-gray-600"}`}>
                {p.dia}
              </div>
              <div className="flex items-center justify-center gap-0.5 mt-1 h-3">
                {logrado ? (
                  <Check className="w-3 h-3 text-emerald-600" />
                ) : (
                  <X className="w-3 h-3 text-gray-400" />
                )}
                {conEvidencia && <Camera className="w-3 h-3 text-gray-400" />}
              </div>
            </button>
          );
        })}
      </div>

      {/* El detalle de UN solo día: por eso solo se piden las fotos de ese. */}
      {elegido && (
        <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50/60 p-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-wide font-semibold text-gray-500">
              {fechaLarga(elegido.fecha)}
              {elegido.asignadoPor && <> · te lo dejó {elegido.asignadoPor}</>}
            </span>
            {elegido.estado === "logrado" ? (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase rounded-full px-1.5 py-0.5 bg-emerald-600 text-white">
                <Check className="w-2.5 h-2.5" /> Logrado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase rounded-full px-1.5 py-0.5 bg-gray-500 text-white">
                <X className="w-2.5 h-2.5" /> No se logró
              </span>
            )}
          </div>
          <div className="text-sm font-semibold text-gray-800 mt-0.5">{elegido.texto}</div>
          {elegido.porQue && (
            <div className="text-[11px] text-gray-600 mt-1">{elegido.porQue}</div>
          )}

          <div className="mt-3 space-y-3">
            <HighlightPhotos
              highlightId={elegido.id}
              kind="highlight_indicacion"
              titulo="Foto de dirección"
              puedeSubir={esDireccion}
              puedeBorrar={esDireccion}
              compacto
            />
            <HighlightPhotos
              highlightId={elegido.id}
              kind="highlight_evidencia"
              titulo="Tu evidencia"
              ayuda="Todavía puedes subir la foto de cómo quedó."
              puedeSubir
              puedeBorrar
              compacto
              onCambio={contar}
            />
          </div>
        </div>
      )}
    </div>
  );
}
