"use client";

/**
 * Una fila de acuerdo al estilo Asana: círculo para cumplir, el título, área, fecha y quién. Un toque en la
 * fila abre el detalle (panel lateral). Se usa en Mis tareas, Lista, Reuniones y el Panel de Sede.
 */

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { avanzarAcuerdo, revisarCumplido, type Acuerdo, type YoSesion } from "@/app/actions/acuerdos";
import { alertaDe, puede, type Yo } from "@/lib/acuerdos";
import { useToast } from "@/components/toast-provider";
import { Avatar, AreaTag, Circulo, FechaChip, PrioridadIcono } from "./ui";

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
  const { showToast } = useToast();
  const [ocupado, setOcupado] = useState(false);
  const y = yoPara(yo, a, comoResponsable);
  const puedeCumplir = puede(y, a, "avanzar");
  const puedeConfirmar = puede(y, a, "confirmar");
  const alerta = alertaDe(a, hoy);

  async function circulo() {
    setOcupado(true);
    const r = puedeConfirmar ? await revisarCumplido(a.id, "confirmar") : await avanzarAcuerdo(a.id, "cumplido");
    setOcupado(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast(puedeConfirmar ? "Cumplido confirmado" : "estado" in r && r.estado === "por_confirmar" ? "Listo: queda esperando confirmación" : "Cumplido", "success");
    onCambio();
  }

  return (
    <li>
      <div role="button" tabIndex={0} onClick={onAbrir} onKeyDown={(e) => { if (e.key === "Enter") onAbrir(); }}
        className={`flex items-center gap-3 px-2 py-2.5 -mx-2 rounded-lg cursor-pointer hover:bg-gray-50 ${a.estado === "anulado" ? "opacity-50" : ""}`}>
        <Circulo estado={a.estado} puede={puedeCumplir || puedeConfirmar} ocupado={ocupado} onClick={() => void circulo()} />
        <div className="min-w-0 flex-1">
          <div className={`text-sm line-clamp-2 sm:line-clamp-1 break-words ${a.estado === "cumplido" || a.estado === "anulado" ? "text-gray-400 line-through" : "text-gray-900"}`}>{a.que}</div>
          {(alerta === "devuelto" || alerta === "nuevo" || a.estado === "por_confirmar" || a.reunionTitulo) && (
            <div className="text-[11px] text-gray-500 truncate">
              {alerta === "devuelto" && <span className="text-red-700 font-medium">Te lo devolvieron · </span>}
              {alerta === "nuevo" && <span className="text-sky-700 font-medium">Nuevo · </span>}
              {a.estado === "por_confirmar" && <span className="text-amber-700 font-medium">Por confirmar · </span>}
              {a.reunionTitulo ?? "Del día a día"}
            </div>
          )}
        </div>
        {a.prioridad !== "media" && <PrioridadIcono p={a.prioridad} />}
        <span className="hidden sm:inline-flex"><AreaTag area={a.area} /></span>
        {a.comentarios > 0 && <span className="hidden sm:inline-flex items-center gap-0.5 text-[11px] text-gray-400"><MessageSquare className="w-3 h-3" />{a.comentarios}</span>}
        <span className="shrink-0 text-right sm:w-20"><FechaChip fecha={a.fechaLimite} hoy={hoy} estado={a.estado} /></span>
        {mostrarResponsable && <Avatar nombre={a.responsableNombre} clave={a.responsableClave} />}
      </div>
    </li>
  );
}
