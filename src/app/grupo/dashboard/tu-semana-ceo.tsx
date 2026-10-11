"use client";

/**
 * «Lo que te toca» — los rastreadores del CEO, estilo pedido de delivery
 * (pedido de Jahnn, 11-oct-2026):
 *   · Tu semana: revisión del lunes → Highlight asignado → pendientes
 *     respondidos → sedes al día.
 *   · Tu mes: presupuesto del mes → cierre del anterior → menor rotación →
 *     presupuesto del siguiente.
 * Debajo, el rastreador de cada administrador en una línea (el mismo que ve
 * él en su panel). Reglas en lib/seguimiento.ts; solo lo ve Jahnn.
 */

import Link from "next/link";
import { useCallback } from "react";
import { ChevronRight } from "lucide-react";
import { getSeguimientoDireccion } from "@/app/actions/seguimiento";
import { SeguimientoMini, SeguimientoTracker, useSeguimientoVivo } from "@/components/seguimiento/tracker";
import { SeccionDesplegable } from "@/components/productos/ui";

const PANEL: Record<number, string> = { 1: "/atelier/panel", 2: "/fonavi/panel", 3: "/centro/panel" };

export function TuSemanaCeo() {
  const leer = useCallback(() => getSeguimientoDireccion(), []);
  const { data, cargando } = useSeguimientoVivo(leer);

  if (!data) return <div className="h-48 rounded-2xl border border-gray-200 bg-white motion-safe:animate-pulse" aria-label="Cargando lo que te toca" />;
  if (!data.ok) return null;

  const alDia = data.sedes.filter((s) => !s.seguimiento.pasos.some((p) => p.alerta)).length;

  return (
    <section className="space-y-3" aria-label="Lo que te toca">
      <h2 className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Lo que te toca</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SeguimientoTracker seguimiento={data.semana} subtitulo={data.semanaTexto} actualizado={data.actualizado} cargando={cargando} />
        <SeguimientoTracker seguimiento={data.mes} subtitulo={data.mesTexto} actualizado={data.actualizado} cargando={cargando} />
      </div>
      <SeccionDesplegable
        titulo="La semana de cada administrador"
        subtitulo="El mismo rastreador que ve cada uno en su panel."
        resumen={<p className="text-xs text-gray-600"><b className={alDia === data.sedes.length ? "text-emerald-700" : "text-amber-700"}>{alDia} de {data.sedes.length}</b> sedes al día</p>}
      >
        <ul className="divide-y divide-gray-100">
          {data.sedes.map((s) => (
            <li key={s.businessId}>
              <Link href={PANEL[s.businessId] ?? "#"} className="flex items-center justify-between gap-3 py-2.5 hover:bg-gray-50/60">
                <span className="w-16 shrink-0 text-sm font-semibold text-gray-900">{s.sede}</span>
                <span className="min-w-0 flex-1"><SeguimientoMini seguimiento={s.seguimiento} /></span>
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
              </Link>
            </li>
          ))}
        </ul>
      </SeccionDesplegable>
    </section>
  );
}
