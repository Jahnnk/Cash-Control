"use client";

/**
 * Una fila de acuerdo al estilo Asana: el título, área, fecha, quién y el estado como botón de color (Monday):
 * No iniciado, En progreso o Hecho, de un toque. Un toque en la fila abre el detalle (panel lateral).
 * Se usa en Mis tareas, Reuniones y el Panel de Sede.
 */

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { avanzarAcuerdo, type Acuerdo, type YoSesion } from "@/app/actions/acuerdos";
import { alertaDe, ESTADO_LABEL, puede, type Yo } from "@/lib/acuerdos";
import { useToast } from "@/components/toast-provider";
import { AvanceSubtareas, ParteDe, AreaTag, EstadoCelda, FechaChip, PrioridadIcono, type EstadoCambiable, Responsables } from "./ui";

/**
 * Cambiar el estado desde cualquier fila, tarjeta o el detalle, con su aviso. El aviso trae «Deshacer» (Jahnn,
 * 19-nov-2026: si se marca Hecho sin querer, se vuelve al estado de antes con un toque).
 */
export function useCambiarEstado(onCambio: () => void) {
  const { showToast } = useToast();
  const [ocupado, setOcupado] = useState<number | null>(null);
  async function cambiar(a: { id: number; estado: string }, nuevo: EstadoCambiable, deshaciendo = false): Promise<boolean> {
    if (a.estado === nuevo) return true;
    const antes = a.estado;
    setOcupado(a.id);
    const r = await avanzarAcuerdo(a.id, nuevo);
    setOcupado(null);
    if (!r.ok) { showToast(r.error, "error"); return false; }
    const volver = antes === "pendiente" || antes === "en_proceso" || antes === "cumplido" ? antes : null;
    showToast(deshaciendo ? `Listo: volvió a ${ESTADO_LABEL[nuevo]}` : `Estado: ${ESTADO_LABEL[nuevo]}`, "success",
      !deshaciendo && volver ? { label: "Deshacer", onClick: () => void cambiar({ id: a.id, estado: nuevo }, volver, true) } : undefined);
    onCambio();
    return true;
  }
  return { cambiar, ocupado };
}

/** El admin con la contraseña de su sede actúa como el responsable de lo que le llega (lista «mía»). */
export const yoPara = (yo: YoSesion, a: Acuerdo, comoResponsable: boolean): Yo => (comoResponsable ? { ...yo, clave: a.responsableClave } : yo);

export function FilaAcuerdo({ a, yo, hoy, comoResponsable = false, mostrarResponsable = true, onAbrir, onCambio }: {
  a: Acuerdo;
  yo: YoSesion;
  hoy: string;
  comoResponsable?: boolean;
  mostrarResponsable?: boolean;
  onAbrir: () => void;
  onCambio: () => void;
}) {
  const { cambiar, ocupado } = useCambiarEstado(onCambio);
  const y = yoPara(yo, a, comoResponsable);
  const alerta = alertaDe(a, hoy);
  // En mi lista, una tarea donde solo ayudo lleva la etiqueta «Apoyo».
  const soyApoyo = a.soyApoyo ?? a.apoyoClaves.includes(yo.clave);

  return (
    <li>
      <div role="button" tabIndex={0} onClick={onAbrir} onKeyDown={(e) => { if (e.key === "Enter") onAbrir(); }}
        className={`flex items-center gap-2 sm:gap-3 px-2 py-2.5 -mx-2 rounded-lg cursor-pointer hover:bg-gray-50 ${a.estado === "anulado" ? "opacity-50" : ""}`}>
        <div className="min-w-0 flex-1">
          <div className={`text-sm line-clamp-2 sm:line-clamp-1 break-words ${a.estado === "cumplido" || a.estado === "anulado" ? "text-gray-400 line-through" : "text-gray-900"}`}>{a.que}</div>
          {(alerta === "nuevo" || a.reunionTitulo) && (
            <div className="text-[11px] text-gray-500 truncate">
              {alerta === "nuevo" && <span className="text-sky-700 font-medium">Nuevo · </span>}
              {a.reunionTitulo ?? "Del día a día"}
            </div>
          )}
          <ParteDe a={a} className="max-w-full" />
          {soyApoyo && <div className="text-[11px] text-gray-500 truncate"><span className="font-medium text-violet-700">Apoyo</span> · responde {a.responsableNombre}</div>}
        </div>
        <AvanceSubtareas a={a} />
        {a.prioridad !== "media" && <PrioridadIcono p={a.prioridad} />}
        <span className="hidden sm:inline-flex"><AreaTag area={a.area} /></span>
        {a.comentarios > 0 && <span className="hidden sm:inline-flex items-center gap-0.5 text-[11px] text-gray-400"><MessageSquare className="w-3 h-3" />{a.comentarios}</span>}
        <span className="shrink-0 text-right sm:w-20"><FechaChip fecha={a.fechaLimite} hoy={hoy} estado={a.estado} /></span>
        {mostrarResponsable && <span className="hidden sm:inline-flex"><Responsables a={a} /></span>}
        <span className="shrink-0 w-[88px] sm:w-[104px] h-8 rounded-md overflow-hidden">
          <EstadoCelda estado={a.estado} puede={puede(y, a, "avanzar")} ocupado={ocupado === a.id} onCambiar={(n) => void cambiar(a, n)} />
        </span>
      </div>
    </li>
  );
}
