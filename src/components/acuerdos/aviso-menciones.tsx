"use client";

/**
 * «Te mencionaron» (23-nov-2026): las menciones con «@» que todavía no viste. Tocar una abre la tarea (aunque no
 * sea tuya, para que puedas responder) y el aviso desaparece. Sin menciones, no aparece nada.
 * Se usa en el Panel de Sede y en Grupo → Acuerdos y tareas.
 */

import { useCallback, useEffect, useState } from "react";
import { AtSign } from "lucide-react";
import { getMisMenciones, type Acuerdo, type Mencion, type YoSesion } from "@/app/actions/acuerdos";
import type { Persona } from "@/lib/acuerdos";
import { DetalleAcuerdo } from "./detalle-acuerdo";
import { TextoComentario } from "./caja-comentario";

const cuando = (ts: string) => new Date(ts).toLocaleString("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function AvisoMenciones({ personas, onCambio, className = "" }: { personas?: Persona[]; onCambio?: () => void; className?: string }) {
  const [d, setD] = useState<{ hoy: string; yo: YoSesion; menciones: Mencion[]; acuerdos: Acuerdo[] } | null>(null);
  const [abierto, setAbierto] = useState<number | null>(null);
  const cargar = useCallback(async () => {
    const r = await getMisMenciones();
    setD(r.ok ? r : null);
  }, []);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    void cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargar]);

  const enDetalle = abierto !== null ? d?.acuerdos.find((a) => a.id === abierto) ?? null : null;
  if (!d || (d.menciones.length === 0 && !enDetalle)) return null;
  // Una línea por tarea: la mención más reciente.
  const porTarea = d.menciones.filter((m, i, l) => l.findIndex((x) => x.acuerdoId === m.acuerdoId) === i);

  return (
    <>
      {porTarea.length > 0 && (
        <section className={`rounded-2xl border border-sky-200 bg-sky-50/60 px-4 py-3 ${className}`} aria-label="Te mencionaron">
          <div className="flex items-center gap-2 text-sm font-semibold text-sky-900">
            <AtSign className="w-4 h-4" aria-hidden />
            Te mencionaron <span className="font-normal text-sky-700">{porTarea.length}</span>
          </div>
          <ul className="mt-2 space-y-1.5">
            {porTarea.map((m) => {
              const a = d.acuerdos.find((x) => x.id === m.acuerdoId);
              return (
                <li key={m.id}>
                  <button type="button" onClick={() => setAbierto(m.acuerdoId)}
                    className="w-full rounded-xl bg-white/80 px-3 py-2 text-left hover:bg-white focus-visible:outline-2 focus-visible:outline-primary">
                    <div className="text-xs text-gray-500"><span className="font-medium text-gray-800">{m.por}</span> en «{a?.que ?? "una tarea"}» · {cuando(m.cuando)}</div>
                    {m.comentario && <div className="text-sm text-gray-800 line-clamp-2 break-words"><TextoComentario texto={m.comentario} /></div>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {enDetalle && (
        <DetalleAcuerdo key={enDetalle.id} a={enDetalle} yo={d.yo} hoy={d.hoy} personas={personas} mencionado
          onCambio={() => { onCambio?.(); }} onCerrar={() => { setAbierto(null); void cargar(); }} />
      )}
    </>
  );
}
