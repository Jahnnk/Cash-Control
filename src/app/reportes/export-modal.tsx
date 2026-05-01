"use client";

import { useState } from "react";
import { X, Loader2, FileSpreadsheet, FileText, Download } from "lucide-react";
import { getReportData, type ExportPeriod } from "@/app/actions/export-report";

const MONTH_NAMES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function pad(n: number) { return String(n).padStart(2, "0"); }

function defaultPrevMonth(): { year: number; month: number } {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

function buildMonthPeriod(year: number, month: number): ExportPeriod {
  const start = `${year}-${pad(month + 1)}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const end = `${year}-${pad(month + 1)}-${pad(lastDay)}`;
  const label = `${MONTH_NAMES[month]} ${year}`;
  return { start, end, label, isMonth: true };
}

function buildRangePeriod(start: string, end: string): ExportPeriod {
  return { start, end, label: `${start} al ${end}`, isMonth: false };
}

function buildYearPeriod(year: number): ExportPeriod {
  return { start: `${year}-01-01`, end: `${year}-12-31`, label: `Año ${year}`, isMonth: false };
}

function safeFilename(label: string): string {
  return label.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "");
}

export function ExportModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"month" | "range" | "year">("month");
  const def = defaultPrevMonth();
  const [year, setYear] = useState(def.year);
  const [month, setMonth] = useState(def.month);
  const [rangeStart, setRangeStart] = useState(`${def.year}-${pad(def.month + 1)}-01`);
  const [rangeEnd, setRangeEnd] = useState(`${def.year}-${pad(def.month + 1)}-${pad(new Date(def.year, def.month + 1, 0).getDate())}`);
  const [yearOnly, setYearOnly] = useState(def.year);
  const [doExcel, setDoExcel] = useState(true);
  const [doPdf, setDoPdf] = useState(true);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function buildPeriod(): ExportPeriod {
    if (mode === "month") return buildMonthPeriod(year, month);
    if (mode === "range") return buildRangePeriod(rangeStart, rangeEnd);
    return buildYearPeriod(yearOnly);
  }

  async function handleGenerate() {
    setError(null);
    setStatus(null);
    if (!doExcel && !doPdf) { setError("Selecciona al menos un formato"); return; }
    const period = buildPeriod();
    if (mode === "range" && rangeEnd < rangeStart) { setError("La fecha hasta debe ser mayor o igual a desde"); return; }

    setWorking(true);
    setStatus("Recopilando datos...");
    const data = await getReportData(period);

    if (!data.hasData) {
      setError("No hay datos en el período seleccionado");
      setWorking(false);
      return;
    }

    const baseName = `Yayis-Atelier-Reporte-${safeFilename(period.label)}`;

    if (doExcel) {
      setStatus("Generando Excel...");
      const { generateExcel } = await import("./export/excel");
      await generateExcel(data, `${baseName}.xlsx`);
    }
    if (doPdf) {
      setStatus("Generando PDF ejecutivo...");
      const { generatePdf } = await import("./export/pdf");
      await generatePdf(data, `${baseName.replace("Reporte", "Reporte-Ejecutivo")}.pdf`);
    }

    setStatus("✅ Listo. Archivo(s) descargado(s).");
    setWorking(false);
    setTimeout(onClose, 1500);
  }

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Exportar reporte</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Período */}
          <div>
            <div className="text-xs font-medium text-gray-700 mb-2">Período</div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" checked={mode === "month"} onChange={() => setMode("month")} />
                <span>Mes específico</span>
              </label>
              {mode === "month" && (
                <div className="grid grid-cols-2 gap-2 ml-6">
                  <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
                    {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                  </select>
                  <select value={year} onChange={(e) => setYear(parseInt(e.target.value))}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
                    {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" checked={mode === "range"} onChange={() => setMode("range")} />
                <span>Rango personalizado</span>
              </label>
              {mode === "range" && (
                <div className="grid grid-cols-2 gap-2 ml-6">
                  <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                  <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                </div>
              )}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" checked={mode === "year"} onChange={() => setMode("year")} />
                <span>Año completo</span>
              </label>
              {mode === "year" && (
                <div className="ml-6">
                  <select value={yearOnly} onChange={(e) => setYearOnly(parseInt(e.target.value))}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
                    {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Formato */}
          <div>
            <div className="text-xs font-medium text-gray-700 mb-2">Formato</div>
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={doExcel} onChange={(e) => setDoExcel(e.target.checked)} />
                <FileSpreadsheet className="w-4 h-4 text-green-600" />
                <span>Excel (.xlsx) — data cruda en pestañas</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={doPdf} onChange={(e) => setDoPdf(e.target.checked)} />
                <FileText className="w-4 h-4 text-red-600" />
                <span>PDF ejecutivo — reporte con marca</span>
              </label>
            </div>
          </div>

          {status && <div className="text-xs text-primary-light bg-green-50 border border-green-100 rounded-lg px-3 py-2">{status}</div>}
          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={working} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={handleGenerate} disabled={working}
            className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-light flex items-center gap-2 disabled:opacity-50">
            {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Generar y descargar
          </button>
        </div>
      </div>
    </div>
  );
}
