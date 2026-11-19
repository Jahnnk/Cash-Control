"use client";

/**
 * Acuerdos y tareas → Lista al estilo Monday (pedido de Jahnn, 19-nov-2026, con una captura de Monday):
 *   · Cada grupo (persona, área o estado) es una tabla con su color en el borde y en el título; se pliega.
 *   · Columnas: Tarea · Estado · Responsable · Fecha límite · Plazo · Prioridad · Área. El Estado va segundo
 *     para que en el celular se vea junto a la tarea sin deslizar.
 *   · El Estado es un bloque de color que se cambia de un toque (No iniciado, En progreso, Hecho).
 *   · El Plazo es una barra de «desde que se asignó» hasta la fecha límite, rellena hasta hoy.
 *   · Al pie de cada grupo, la barra de estados (cuánto hay de cada color) y el plazo total del grupo.
 * Un toque en la fila abre el detalle. En el celular la tabla se desliza de lado, como en Monday.
 */

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Acuerdo, YoSesion } from "@/app/actions/acuerdos";
import { ESTADO_LABEL, estadoVisible, puede } from "@/lib/acuerdos";
import { useCambiarEstado } from "@/components/acuerdos/fila-acuerdo";
import { Avatar, AreaTag, COLOR_ESTADO, EstadoCelda, PrioridadIcono, diaCorto } from "@/components/acuerdos/ui";

const COLS = "grid grid-cols-[minmax(170px,1fr)_118px_150px_104px_150px_92px_120px] sm:grid-cols-[minmax(240px,1fr)_128px_150px_104px_150px_92px_120px]";
const CELDA = "flex items-center h-10 px-3 border-r border-gray-200 min-w-0";
const ROJO = "#DC2626";

const ms = (f: string) => Date.parse(`${f}T12:00:00Z`);

/** Rango corto: «12 – 20 nov» o «28 oct – 4 nov». */
function rango(desde: string, hasta: string) {
  if (desde >= hasta) return diaCorto(hasta);
  return desde.slice(0, 7) === hasta.slice(0, 7) ? `${Number(desde.slice(8, 10))} – ${diaCorto(hasta)}` : `${diaCorto(desde)} – ${diaCorto(hasta)}`;
}

/** La barra de plazo de Monday: de la asignación a la fecha límite, rellena hasta hoy. */
function Plazo({ desde, hasta, hoy, color, lleno }: { desde: string; hasta: string; hoy: string; color: string; lleno?: boolean }) {
  const total = Math.max(1, ms(hasta) - ms(desde));
  const pct = lleno ? 100 : Math.max(0, Math.min(100, ((ms(hoy) - ms(desde)) / total) * 100));
  return (
    <span className="relative flex h-6 w-full items-center justify-center overflow-hidden rounded-full bg-gray-700 text-[11px] font-medium text-white"
      title={`Asignada el ${diaCorto(desde)} · vence el ${diaCorto(hasta)}`}>
      <span className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, backgroundColor: color }} />
      <span className="relative whitespace-nowrap px-2">{rango(desde, hasta)}</span>
    </span>
  );
}

export function GrupoMonday({ titulo, color, avatar, items, yo, hoy, onAbrir, onCambio }: {
  titulo: string;
  color: string;
  avatar?: { nombre: string; clave: string };
  items: Acuerdo[];
  yo: YoSesion;
  hoy: string;
  onAbrir: (id: number) => void;
  onCambio: () => void;
}) {
  const [abierto, setAbierto] = useState(true);
  const { cambiar, ocupado } = useCambiarEstado(onCambio);
  const vencidos = items.filter((a) => estadoVisible(a, hoy) === "vencido").length;
  const desde = items.reduce((m, a) => (a.creadoDia < m ? a.creadoDia : m), items[0].creadoDia);
  const hasta = items.reduce((m, a) => (a.fechaLimite > m ? a.fechaLimite : m), items[0].fechaLimite);
  const porEstado = (["cumplido", "en_proceso", "pendiente", "anulado"] as const).map((e) => ({ e, n: items.filter((a) => a.estado === e).length })).filter((x) => x.n);

  return (
    <div>
      <button type="button" onClick={() => setAbierto(!abierto)} className="flex items-center gap-2 py-1.5 text-[15px] font-semibold" style={{ color }}>
        <ChevronDown className={`w-4 h-4 transition-transform ${abierto ? "" : "-rotate-90"}`} />
        {avatar && <Avatar nombre={avatar.nombre} clave={avatar.clave} />}
        {titulo}
        <span className="text-xs font-normal text-gray-400">{items.length} {items.length === 1 ? "tarea" : "tareas"}</span>
        {vencidos > 0 && <span className="text-xs font-medium text-red-700">· {vencidos} {vencidos === 1 ? "vencida" : "vencidas"}</span>}
      </button>

      {abierto && (
        <div className="overflow-x-auto">
          <div className="min-w-[909px] sm:min-w-[989px] border-l-[5px] rounded-l-md" style={{ borderColor: color }}>
            <div className={`${COLS} border-y border-gray-200 bg-white text-xs text-gray-500`}>
              <span className={CELDA}>Tarea</span>
              <span className={`${CELDA} justify-center`}>Estado</span>
              <span className={`${CELDA} justify-center`}>Responsable</span>
              <span className={`${CELDA} justify-center`}>Fecha límite</span>
              <span className={`${CELDA} justify-center`}>Plazo</span>
              <span className={`${CELDA} justify-center`}>Prioridad</span>
              <span className={`${CELDA} justify-center`}>Área</span>
            </div>
            <ul>
              {items.map((a) => {
                const v = estadoVisible(a, hoy);
                const cerrado = a.estado === "cumplido" || a.estado === "anulado";
                return (
                  <li key={a.id} role="button" tabIndex={0} onClick={() => onAbrir(a.id)} onKeyDown={(e) => { if (e.key === "Enter") onAbrir(a.id); }}
                    className={`${COLS} border-b border-gray-200 bg-white cursor-pointer hover:bg-gray-50 ${a.estado === "anulado" ? "opacity-50" : ""}`}>
                    <span className={CELDA}>
                      <span className={`text-sm truncate ${cerrado ? "text-gray-400 line-through" : "text-gray-900"}`} title={a.que}>{a.que}</span>
                    </span>
                    <span className="h-10 border-r border-white">
                      <EstadoCelda estado={a.estado} puede={puede(yo, a, "avanzar")} ocupado={ocupado === a.id} onCambiar={(n) => void cambiar(a, n)} />
                    </span>
                    <span className={`${CELDA} gap-2`}>
                      <Avatar nombre={a.responsableNombre} clave={a.responsableClave} />
                      <span className="text-xs text-gray-700 truncate">{a.responsableNombre}</span>
                    </span>
                    <span className={`${CELDA} justify-center text-xs ${v === "vencido" ? "font-semibold text-red-700" : "text-gray-700"}`}>{diaCorto(a.fechaLimite)}</span>
                    <span className={CELDA}>
                      <Plazo desde={a.creadoDia} hasta={a.fechaLimite} hoy={hoy} lleno={cerrado}
                        color={v === "vencido" ? ROJO : a.estado === "cumplido" ? COLOR_ESTADO.cumplido : color} />
                    </span>
                    <span className={`${CELDA} justify-center`}><PrioridadIcono p={a.prioridad} conTexto /></span>
                    <span className={`${CELDA} justify-center`}><AreaTag area={a.area} /></span>
                  </li>
                );
              })}
            </ul>
            {/* Pie del grupo: cuánto hay de cada estado y el plazo de todo el grupo */}
            <div className={`${COLS} text-xs`}>
              <span />
              <span className="flex items-center h-10 px-1.5" title={porEstado.map((x) => `${ESTADO_LABEL[x.e]}: ${x.n}`).join(" · ")}>
                <span className="flex h-6 w-full overflow-hidden rounded">
                  {porEstado.map((x) => <span key={x.e} style={{ width: `${(x.n / items.length) * 100}%`, backgroundColor: COLOR_ESTADO[x.e] }} />)}
                </span>
              </span>
              <span className="col-span-2" />
              <span className="flex items-center h-10 px-3"><Plazo desde={desde} hasta={hasta} hoy={hoy} color={color} /></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
