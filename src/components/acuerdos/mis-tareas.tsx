"use client";

/**
 * «Mis tareas» por urgencia, como «My tasks» de Asana (19-nov-2026): Vencidas, Hoy y mañana, Próximos 7 días,
 * Más adelante. La misma vista en Grupo → Acuerdos y tareas y en el Panel de Sede de cada administrador.
 */

import type { Acuerdo, YoSesion } from "@/app/actions/acuerdos";
import { diasRestantes } from "@/lib/acuerdos";
import { FilaAcuerdo } from "./fila-acuerdo";

export function MisTareasPorUrgencia({ items, yo, hoy, comoResponsable = false, onAbrir, onCambio }: {
  /** Solo las abiertas (sin hechas ni anuladas), ya ordenadas. */
  items: Acuerdo[];
  yo: YoSesion;
  hoy: string;
  comoResponsable?: boolean;
  onAbrir: (id: number) => void;
  onCambio: () => void;
}) {
  const dias = (a: Acuerdo) => diasRestantes(a.fechaLimite, hoy);
  const grupos: { titulo: string; items: Acuerdo[]; tono?: string }[] = [
    { titulo: "Vencidas", items: items.filter((a) => dias(a) < 0), tono: "text-red-700" },
    { titulo: "Hoy y mañana", items: items.filter((a) => dias(a) >= 0 && dias(a) <= 1), tono: "text-amber-700" },
    { titulo: "Próximos 7 días", items: items.filter((a) => dias(a) > 1 && dias(a) <= 7) },
    { titulo: "Más adelante", items: items.filter((a) => dias(a) > 7) },
  ];
  return (
    <section className="bg-white rounded-2xl border border-gray-200/80 px-4 py-3 sm:px-5">
      {items.length === 0 ? <p className="text-sm text-gray-500 py-2">No tienes tareas abiertas.</p> : grupos.filter((g) => g.items.length).map((g) => (
        <div key={g.titulo} className="mt-2 first:mt-0">
          <h2 className={`text-xs font-semibold uppercase tracking-wide ${g.tono ?? "text-gray-500"}`}>{g.titulo} <span className="text-gray-400 font-normal">{g.items.length}</span></h2>
          <ul>
            {g.items.map((a) => (
              <FilaAcuerdo key={a.id} a={a} yo={yo} hoy={hoy} comoResponsable={comoResponsable} mostrarResponsable={false} onAbrir={() => onAbrir(a.id)} onCambio={onCambio} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
