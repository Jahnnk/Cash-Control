"use client";

/**
 * Acuerdos y tareas → Cronograma (referencia: línea de tiempo de Jira, 19-nov-2026). Cada tarea abierta es una
 * barra desde que se asignó hasta su fecha límite, por semanas, con la línea de HOY. Si venció, la barra se
 * pone roja y una línea punteada muestra el atraso hasta hoy. Sin dependencias entre tareas: no hacen falta.
 */

import type { Acuerdo } from "@/app/actions/acuerdos";
import { estadoVisible, type EstadoVisible } from "@/lib/acuerdos";
import { Avatar, diaCorto } from "@/components/acuerdos/ui";

const DIA = 86_400_000;
const ms = (f: string) => Date.parse(`${f}T12:00:00Z`);
const fecha = (t: number) => new Date(t).toISOString().slice(0, 10);
const lunes = (f: string) => { const d = new Date(ms(f)); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return fecha(d.getTime()); };

const COLOR: Partial<Record<EstadoVisible, string>> = { pendiente: "#94A3B8", en_proceso: "#3B82F6", por_confirmar: "#F59E0B", vencido: "#DC2626" };
const SEMANAS_ATRAS = 8;
const SEMANAS_ADELANTE = 12;

export function Cronograma({ acuerdos, hoy, onAbrir }: { acuerdos: Acuerdo[]; hoy: string; onAbrir: (id: number) => void }) {
  const filas = acuerdos
    .filter((a) => a.estado === "pendiente" || a.estado === "en_proceso" || a.estado === "por_confirmar")
    .sort((a, b) => a.fechaLimite.localeCompare(b.fechaLimite) || a.id - b.id);
  if (filas.length === 0) return <section className="bg-white rounded-2xl border border-gray-200/80 px-4 py-4 sm:px-6"><p className="text-sm text-gray-500">No hay tareas abiertas para mostrar.</p></section>;

  // El rango: desde la semana más antigua que hace falta (máx. 8 atrás) hasta la última fecha (máx. 12 adelante).
  const minimo = Math.max(ms(hoy) - SEMANAS_ATRAS * 7 * DIA, Math.min(ms(hoy) - 7 * DIA, ...filas.map((a) => ms(a.creadoDia))));
  const maximo = Math.min(ms(hoy) + SEMANAS_ADELANTE * 7 * DIA, Math.max(ms(hoy) + 21 * DIA, ...filas.map((a) => ms(a.fechaLimite))));
  const inicio = ms(lunes(fecha(minimo)));
  const semanas = Math.ceil((maximo - inicio) / (7 * DIA)) + 1;
  const total = semanas * 7 * DIA;
  const pos = (t: number) => Math.max(0, Math.min(100, ((t - inicio) / total) * 100));
  const xHoy = pos(ms(hoy) + DIA / 2);

  return (
    <section className="bg-white rounded-2xl border border-gray-200/80 py-3 overflow-x-auto">
      <div className="min-w-[760px] px-4 sm:px-6">
        {/* Cabecera de semanas */}
        <div className="grid grid-cols-[220px_1fr] border-b border-gray-200">
          <div className="text-[10px] uppercase tracking-wide text-gray-400 py-2">Tarea</div>
          <div className="relative grid" style={{ gridTemplateColumns: `repeat(${semanas}, 1fr)` }}>
            {Array.from({ length: semanas }, (_, i) => (
              <div key={i} className="text-[10px] uppercase tracking-wide text-gray-500 py-2 pl-1.5 border-l border-gray-100">{diaCorto(fecha(inicio + i * 7 * DIA))}</div>
            ))}
          </div>
        </div>

        <ul>
          {filas.map((a) => {
            const v = estadoVisible(a, hoy);
            const desde = Math.max(ms(a.creadoDia), inicio);
            const x1 = pos(desde), x2 = pos(ms(a.fechaLimite) + DIA);
            return (
              <li key={a.id} className="grid grid-cols-[220px_1fr] items-center border-b border-gray-50 hover:bg-gray-50/70 cursor-pointer" onClick={() => onAbrir(a.id)}>
                <div className="flex items-center gap-2 py-2 pr-3 min-w-0">
                  <Avatar nombre={a.responsableNombre} clave={a.responsableClave} />
                  <span className="text-xs text-gray-900 truncate" title={a.que}>{a.que}</span>
                </div>
                <div className="relative h-9">
                  {/* Rejilla de semanas y la línea de hoy */}
                  <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${semanas}, 1fr)` }}>
                    {Array.from({ length: semanas }, (_, i) => <div key={i} className="border-l border-gray-100" />)}
                  </div>
                  <div className="absolute inset-y-0 w-px bg-primary/60" style={{ left: `${xHoy}%` }} />
                  {/* Atraso: de la fecha límite a hoy */}
                  {v === "vencido" && (
                    <div className="absolute top-1/2 border-t-2 border-dashed border-red-400" style={{ left: `${x2}%`, width: `${Math.max(0, xHoy - x2)}%` }} />
                  )}
                  <div className="absolute top-1/2 -translate-y-1/2 h-4 rounded-full" title={`${diaCorto(fecha(desde))} → ${diaCorto(a.fechaLimite)}`}
                    style={{ left: `${x1}%`, width: `${Math.max(1.2, x2 - x1)}%`, backgroundColor: COLOR[v] ?? "#94A3B8" }} />
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap gap-3 pt-3 text-[11px] text-gray-500">
          {(["pendiente", "en_proceso", "por_confirmar", "vencido"] as const).map((e) => (
            <span key={e} className="inline-flex items-center gap-1"><span className="w-3 h-2 rounded-full" style={{ backgroundColor: COLOR[e] }} />{e === "pendiente" ? "Pendiente" : e === "en_proceso" ? "En proceso" : e === "por_confirmar" ? "Por confirmar" : "Vencido (la línea punteada es el atraso)"}</span>
          ))}
          <span className="inline-flex items-center gap-1"><span className="w-px h-3 bg-primary/60" />Hoy</span>
        </div>
      </div>
    </section>
  );
}
