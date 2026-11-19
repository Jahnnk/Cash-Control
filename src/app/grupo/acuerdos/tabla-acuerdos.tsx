"use client";

/**
 * Acuerdos y tareas → Lista en formato tabla (referencia: Jira, 19-nov-2026): columnas Estado · Tarea ·
 * Responsable · Fecha límite · Área, con el estado como etiqueta de color. Un toque en la fila abre el detalle;
 * el círculo cumple sin abrirla. En el celular se esconden Área y el nombre (queda el avatar).
 */

import { useState } from "react";
import { avanzarAcuerdo, revisarCumplido, type Acuerdo, type YoSesion } from "@/app/actions/acuerdos";
import { ESTADO_LABEL, estadoVisible, puede, type EstadoVisible } from "@/lib/acuerdos";
import { useToast } from "@/components/toast-provider";
import { Avatar, AreaTag, Circulo, FechaChip, PrioridadIcono } from "@/components/acuerdos/ui";

const ETIQUETA: Record<EstadoVisible, string> = {
  pendiente: "bg-gray-100 text-gray-700",
  en_proceso: "bg-blue-50 text-blue-700",
  por_confirmar: "bg-amber-50 text-amber-800",
  cumplido: "bg-emerald-50 text-emerald-700",
  vencido: "bg-red-50 text-red-700",
  anulado: "bg-gray-50 text-gray-400",
};

export function EtiquetaEstado({ estado }: { estado: EstadoVisible }) {
  return <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${ETIQUETA[estado]}`}>{ESTADO_LABEL[estado]}</span>;
}

const COLS = "grid grid-cols-[96px_minmax(0,1fr)_auto_64px] xl:grid-cols-[110px_minmax(0,1fr)_80px_150px_80px_110px] items-center gap-x-3";

export function TablaAcuerdos({ items, yo, hoy, onAbrir, onCambio }: { items: Acuerdo[]; yo: YoSesion; hoy: string; onAbrir: (id: number) => void; onCambio: () => void }) {
  return (
    <div>
      <div className={`${COLS} px-2 py-1.5 text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-200`}>
        <span>Estado</span><span>Tarea</span><span className="hidden xl:block">Prioridad</span><span>Responsable</span><span className="text-right xl:text-left">Fecha</span><span className="hidden xl:block">Área</span>
      </div>
      <ul className="divide-y divide-gray-100">
        {items.map((a) => <Fila key={a.id} a={a} yo={yo} hoy={hoy} onAbrir={() => onAbrir(a.id)} onCambio={onCambio} />)}
      </ul>
    </div>
  );
}

function Fila({ a, yo, hoy, onAbrir, onCambio }: { a: Acuerdo; yo: YoSesion; hoy: string; onAbrir: () => void; onCambio: () => void }) {
  const { showToast } = useToast();
  const [ocupado, setOcupado] = useState(false);
  const puedeConfirmar = puede(yo, a, "confirmar");
  const puedeCumplir = puede(yo, a, "avanzar");

  async function circulo() {
    setOcupado(true);
    const r = puedeConfirmar ? await revisarCumplido(a.id, "confirmar") : await avanzarAcuerdo(a.id, "cumplido");
    setOcupado(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    onCambio();
  }

  return (
    <li role="button" tabIndex={0} onClick={onAbrir} onKeyDown={(e) => { if (e.key === "Enter") onAbrir(); }}
      className={`${COLS} px-2 py-2.5 cursor-pointer hover:bg-gray-50 ${a.estado === "anulado" ? "opacity-50" : ""}`}>
      <span><EtiquetaEstado estado={estadoVisible(a, hoy)} /></span>
      <span className="flex items-center gap-2 min-w-0">
        <Circulo estado={a.estado} puede={puedeCumplir || puedeConfirmar} ocupado={ocupado} onClick={() => void circulo()} />
        <span className="xl:hidden"><PrioridadIcono p={a.prioridad} /></span>
        <span className={`text-sm truncate ${a.estado === "cumplido" || a.estado === "anulado" ? "text-gray-400 line-through" : "text-gray-900"}`}>{a.que}</span>
      </span>
      <span className="hidden xl:block"><PrioridadIcono p={a.prioridad} conTexto /></span>
      <span className="flex items-center gap-2 min-w-0">
        <Avatar nombre={a.responsableNombre} clave={a.responsableClave} />
        <span className="hidden xl:block text-sm text-gray-700 truncate">{a.responsableNombre}</span>
      </span>
      <span className="text-right xl:text-left"><FechaChip fecha={a.fechaLimite} hoy={hoy} estado={a.estado} /></span>
      <span className="hidden xl:block"><AreaTag area={a.area} /></span>
    </li>
  );
}
