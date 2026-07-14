"use client";

import { useState } from "react";
import { FileDown, Loader2, X, CalendarRange } from "lucide-react";
import { getBoardDeckData } from "@/app/actions/kpis";
import { getToday } from "@/lib/utils";
import { useToast } from "@/components/toast-provider";

/**
 * Botón "Deck de la reunión" con RANGO PERSONALIZADO (pedido de Jahnn):
 * por defecto genera la semana que está viendo, pero puede elegir
 * cualquier rango de fechas (ej. 05–11 jul) antes de generar.
 * Solo dirección: getBoardDeckData exige sesión completa.
 */
export function KpiDeckButton({ defaultStart, defaultEnd }: { defaultStart: string; defaultEnd: string }) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    if (!start || !end) { showToast("Elige las dos fechas del rango", "error"); return; }
    if (end < start) { showToast("La fecha final no puede ser anterior a la inicial", "error"); return; }
    setGenerating(true);
    try {
      const r = await getBoardDeckData(start, end);
      if (!r.ok) { showToast(r.error, "error"); return; }
      const { renderWeeklyKpiDeck } = await import("@/lib/kpis/weekly-deck");
      const { blob, filename } = await renderWeeklyKpiDeck(r.data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Deck generado", "success");
      setOpen(false);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <button
        onClick={() => { setStart(defaultStart); setEnd(defaultEnd); setOpen(true); }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary border border-primary/30 bg-primary/5 hover:bg-primary hover:text-white rounded-lg transition-colors"
        title="Genera el PPT de la reunión (todas las sedes) — puedes elegir el rango de fechas"
      >
        <FileDown className="w-3.5 h-3.5" />
        Deck de la reunión
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !generating && setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <CalendarRange className="w-4 h-4 text-primary" /> Rango del reporte
              </h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Por defecto es la semana en pantalla (dom→sáb). Cambia las fechas para un rango personalizado.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Desde</label>
                <input type="date" value={start} max={getToday()} onChange={(e) => setStart(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Hasta</label>
                <input type="date" value={end} max={getToday()} onChange={(e) => setEnd(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <button onClick={() => setOpen(false)} disabled={generating}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={handleGenerate} disabled={generating}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-light rounded-lg disabled:opacity-50">
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                Generar deck
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
