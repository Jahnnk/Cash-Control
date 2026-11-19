"use client";

/**
 * Acuerdos y tareas → Tablero (estilo Trello, 19-nov-2026). Tres columnas por estado (No iniciado, En progreso,
 * Hecho); las tarjetas se
 * arrastran de una a otra (en computadora). En el celular, un toque abre el detalle con los mismos botones.
 * Los vencidos se quedan en su columna con la fecha en rojo: «vencido» no es un lugar, es una fecha pasada.
 * Mover respeta las reglas de siempre (lib/acuerdos.ts → puede); el servidor las vuelve a revisar.
 */

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { avanzarAcuerdo, type Acuerdo, type YoSesion } from "@/app/actions/acuerdos";
import { ESTADO_LABEL, estadoVisible, puede, type EstadoGuardado } from "@/lib/acuerdos";
import { useToast } from "@/components/toast-provider";
import { Avatar, AreaTag, COLOR_ESTADO, FechaChip, PrioridadIcono } from "@/components/acuerdos/ui";

const COLUMNAS: { estado: "pendiente" | "en_proceso" | "cumplido" }[] = [
  { estado: "pendiente" }, { estado: "en_proceso" }, { estado: "cumplido" },
];
/** Cumplidos que se ven en el tablero: los de las últimas dos semanas (lo demás está en Lista). */
const DIAS_CUMPLIDOS = 14;

export function Kanban({ acuerdos, yo, hoy, onAbrir, onCambio }: {
  acuerdos: Acuerdo[];
  yo: YoSesion;
  hoy: string;
  onAbrir: (id: number) => void;
  onCambio: () => void;
}) {
  const { showToast } = useToast();
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<EstadoGuardado | null>(null);
  const limite = new Date(Date.parse(`${hoy}T12:00:00Z`) - DIAS_CUMPLIDOS * 86_400_000).toISOString().slice(0, 10);
  const visibles = acuerdos.filter((a) => a.estado !== "anulado" && (a.estado !== "cumplido" || (a.confirmadoEl ?? a.creadoEl).slice(0, 10) >= limite));

  async function mover(a: Acuerdo, destino: "pendiente" | "en_proceso" | "cumplido") {
    if (a.estado === destino) return;
    if (!puede(yo, a, "avanzar")) { showToast("Solo el responsable o la dirección pueden moverlo.", "error"); return; }
    const r = await avanzarAcuerdo(a.id, destino);
    if (!r.ok) { showToast(r.error ?? "No se pudo mover.", "error"); return; }
    onCambio();
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 snap-x lg:grid lg:grid-cols-3 lg:overflow-visible">
      {COLUMNAS.map((col) => {
        const items = visibles.filter((a) => a.estado === col.estado)
          .sort((a, b) => (col.estado === "cumplido" ? b.fechaLimite.localeCompare(a.fechaLimite) : a.fechaLimite.localeCompare(b.fechaLimite)) || a.id - b.id);
        return (
          <section key={col.estado}
            onDragOver={(e) => { e.preventDefault(); setSobre(col.estado); }}
            onDragLeave={() => setSobre((s) => (s === col.estado ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              setSobre(null);
              const a = acuerdos.find((x) => x.id === arrastrando);
              setArrastrando(null);
              if (a) void mover(a, col.estado);
            }}
            className={`snap-start shrink-0 w-[80%] sm:w-72 lg:w-auto rounded-2xl p-2 transition-colors ${sobre === col.estado ? "bg-primary/10" : "bg-gray-100/70"}`}>
            <h3 className="flex items-center gap-2 px-1.5 py-1 text-xs font-semibold text-gray-700">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLOR_ESTADO[col.estado] }} />{ESTADO_LABEL[col.estado]}
              <span className="text-gray-400 font-normal">{items.length}</span>
            </h3>
            <ul className="mt-1 space-y-2 min-h-12">
              {items.map((a) => {
                const vencido = estadoVisible(a, hoy) === "vencido";
                return (
                  <li key={a.id} draggable onDragStart={() => setArrastrando(a.id)} onDragEnd={() => setArrastrando(null)}
                    onClick={() => onAbrir(a.id)}
                    className={`cursor-pointer rounded-xl bg-white p-3 shadow-sm border hover:shadow transition-shadow ${vencido ? "border-red-200" : "border-gray-200/80"} ${arrastrando === a.id ? "opacity-50" : ""}`}>
                    <AreaTag area={a.area} />
                    <p className={`mt-1.5 text-sm leading-snug ${a.estado === "cumplido" ? "text-gray-500" : "text-gray-900"}`}>{a.que}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <PrioridadIcono p={a.prioridad} />
                      <FechaChip fecha={a.fechaLimite} hoy={hoy} estado={a.estado} />
                      {a.comentarios > 0 && <span className="inline-flex items-center gap-0.5 text-[11px] text-gray-400"><MessageSquare className="w-3 h-3" />{a.comentarios}</span>}
                      <span className="ml-auto"><Avatar nombre={a.responsableNombre} clave={a.responsableClave} /></span>
                    </div>
                  </li>
                );
              })}
              {items.length === 0 && <li className="px-2 py-3 text-xs text-gray-400">{col.estado === "cumplido" ? `Nada hecho en ${DIAS_CUMPLIDOS} días.` : "Vacío"}</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
