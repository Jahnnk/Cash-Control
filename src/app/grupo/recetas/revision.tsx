"use client";

/**
 * Revisión de recetas una por una (27-nov-2026, pedido de Jahnn: «así como en Insumos hay un marcador de revisado»):
 * la barra de avance con «Solo sin revisar» y el botón de cada fila. Mismo aspecto que en Grupo → Insumos.
 */

import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import type { Revisada } from "@/app/actions/recetas";

const fechaCorta = (iso: string) => { const [, m, d] = iso.split("-"); return `${Number(d)}/${Number(m)}`; };

export function BarraRevision({ total, revisadas, solo, onSolo }: { total: number; revisadas: number; solo: boolean; onSolo: (v: boolean) => void }) {
  const pct = total ? Math.round((revisadas / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Revisión
          <span className="text-xs font-normal text-gray-600">{revisadas} de {total} revisadas</span>
        </span>
        <label className="flex items-center gap-1.5 text-xs text-gray-700">
          <input type="checkbox" checked={solo} onChange={(e) => onSolo(e.target.checked)} /> Solo sin revisar
        </label>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function BotonRevisado({ revisada, cargando, onCambiar, nombre }: { revisada: Revisada | undefined; cargando: boolean; onCambiar: (v: boolean) => void; nombre: string }) {
  return (
    <button type="button" disabled={cargando} onClick={() => onCambiar(!revisada)}
      title={revisada ? `Revisada por ${revisada.por} el ${fechaCorta(revisada.el)}. Clic para desmarcar.` : "Marcar como revisada"}
      aria-label={revisada ? `Desmarcar ${nombre} como revisada` : `Marcar ${nombre} como revisada`} aria-pressed={!!revisada}
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium whitespace-nowrap disabled:opacity-50 ${
        revisada ? "text-emerald-700 hover:bg-emerald-50" : "text-gray-400 hover:bg-gray-100 hover:text-gray-700"}`}>
      {cargando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : revisada ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
      {revisada ? "Revisada" : "Revisar"}
    </button>
  );
}
