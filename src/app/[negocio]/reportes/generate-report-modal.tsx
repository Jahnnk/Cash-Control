"use client";

import { useState } from "react";
import { X, Loader2, FileText, Presentation, Table2, Sparkles } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { getReportStory } from "@/app/actions/report-story";

/**
 * EIRS · Modal "Generar Reporte" — el Board Meeting Package con un clic.
 * PR 2: PDF Ejecutivo. PPT y Excel llegan en el PR 3 (mismo Story).
 */

type ScopeChoice = "atelier" | "fonavi" | "centro" | "grupo";

const SCOPES: { key: ScopeChoice; label: string; unitId?: number }[] = [
  { key: "atelier", label: "Atelier", unitId: 1 },
  { key: "fonavi", label: "Fonavi", unitId: 2 },
  { key: "centro", label: "Centro", unitId: 3 },
  { key: "grupo", label: "Grupo Yayi's" },
];

/** Últimos 6 meses cerrados (el mes en curso no se reporta: está incompleto). */
function closedMonths(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 1; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("es-PE", { month: "long", year: "numeric" });
    out.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return out;
}

export function GenerateReportModal({
  isAtelier,
  activeUnitId,
  onClose,
}: {
  isAtelier: boolean;
  activeUnitId: number;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const months = closedMonths();
  const [scope, setScope] = useState<ScopeChoice>(
    isAtelier ? "atelier" : activeUnitId === 2 ? "fonavi" : "centro",
  );
  const [month, setMonth] = useState(months[0].value);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const chosen = SCOPES.find((s) => s.key === scope)!;
      // 1) Un solo cerebro: el Story se compila UNA vez en el servidor.
      const story = await getReportStory({
        scope: scope === "grupo" ? "group" : "unit",
        unitId: chosen.unitId,
        month,
      });
      // 2) Renderers tontos en el cliente (import dinámico: jsPDF solo aquí).
      const { renderPdf } = await import("@/lib/report/renderers/pdf");
      const { blob, filename } = renderPdf(story);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Reporte Ejecutivo generado", "success");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el reporte");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary-light" />
            Generar Reporte Ejecutivo
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-gray-500">
            Análisis del mes escrito por el motor de inteligencia: qué ocurrió, por qué,
            riesgos, oportunidades y el plan de acción. Cada cifra es rastreable a tus registros.
          </p>

          {/* Sede */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Sede</label>
            <div className="grid grid-cols-2 gap-2">
              {SCOPES.filter((s) => isAtelier || s.unitId === activeUnitId).map((s) => (
                <button
                  key={s.key}
                  onClick={() => setScope(s.key)}
                  className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                    scope === s.key
                      ? "bg-primary text-white border-primary"
                      : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mes (solo cerrados) */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Mes (cerrado)</label>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              {months.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Formatos del paquete */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Formato</label>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm text-gray-800 border border-primary/30 bg-primary/5 rounded-lg px-3 py-2">
                <FileText className="w-4 h-4 text-primary" /> PDF Ejecutivo (Board Report)
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg px-3 py-2">
                <Presentation className="w-4 h-4" /> PowerPoint — próxima entrega
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg px-3 py-2">
                <Table2 className="w-4 h-4" /> Excel Gerencial — próxima entrega
              </div>
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} disabled={generating} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50">
            Cancelar
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-light rounded-lg disabled:opacity-50 inline-flex items-center gap-2"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {generating ? "Generando…" : "Generar Reporte"}
          </button>
        </div>
      </div>
    </div>
  );
}
