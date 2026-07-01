"use client";

import { useMemo, useRef, useState } from "react";
import { X, Loader2, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatCurrency, getToday } from "@/lib/utils";
import { useToast } from "@/components/toast-provider";
import { parseCajaChica, type CajaChicaItem } from "@/lib/caja-chica-parser";
import {
  importCajaChica,
  getReposicionStatus,
} from "@/app/actions/caja-chica-import";

type Parsed = {
  items: CajaChicaItem[];
  total: number;
  generado: string | null;
  periodo: string | null;
  warnings: string[];
};

/**
 * Sube el Excel de "Gastos Pendientes por Reponer", lo entiende, muestra un
 * preview agrupado por categoría, y —tras confirmar— registra cada gasto como
 * egreso por transferencia en la fecha de reposición elegida.
 */
export function CajaChicaImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [reposicionDate, setReposicionDate] = useState(getToday());
  const [alreadyCount, setAlreadyCount] = useState<number | null>(null);
  const [force, setForce] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const grouped = useMemo(() => {
    if (!parsed) return [];
    const map = new Map<string, { items: CajaChicaItem[]; subtotal: number }>();
    for (const it of parsed.items) {
      if (!map.has(it.category)) map.set(it.category, { items: [], subtotal: 0 });
      const g = map.get(it.category)!;
      g.items.push(it);
      g.subtotal = Math.round((g.subtotal + it.amount) * 100) / 100;
    }
    return [...map.entries()];
  }, [parsed]);

  async function handleFile(file: File) {
    setReading(true);
    setParseError(null);
    setParsed(null);
    setAlreadyCount(null);
    setForce(false);
    setFileName(file.name);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as unknown[][];
      const r = parseCajaChica(rows);
      if (!r.ok) {
        setParseError(r.errors.join(" "));
        return;
      }
      setParsed({ items: r.items, total: r.total, generado: r.generado, periodo: r.periodo, warnings: r.warnings });
      // Preflight anti-duplicados
      const status = await getReposicionStatus(r.generado);
      if (status.alreadyImported) setAlreadyCount(status.count);
    } catch {
      setParseError("No pude leer el Excel. ¿Es el archivo de reposición correcto (.xlsx)?");
    } finally {
      setReading(false);
    }
  }

  async function handleImport() {
    if (!parsed) return;
    setSaving(true);
    setSaveError(null);
    const r = await importCajaChica({
      items: parsed.items.map((it) => ({ category: it.category, concept: it.concept, itemDate: it.itemDate, amount: it.amount })),
      reposicionDate,
      generado: parsed.generado,
      force: alreadyCount != null ? force : false,
    });
    setSaving(false);
    if (!r.ok) {
      if (r.alreadyImported) setAlreadyCount(r.alreadyCount ?? 0);
      setSaveError(r.error);
      return;
    }
    showToast(`Reposición registrada: ${r.inserted} gastos · ${formatCurrency(r.total)}`, "success");
    onImported();
    onClose();
  }

  const blockedByDupe = alreadyCount != null && !force;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            Subir reposición de caja chica (Excel)
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Selector de archivo */}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
          />
          <div
            role="button"
            tabIndex={0}
            onClick={() => { if (!reading) fileRef.current?.click(); }}
            onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !reading) fileRef.current?.click(); }}
            onDragEnter={(e) => { e.preventDefault(); if (!reading) setDragActive(true); }}
            onDragOver={(e) => { e.preventDefault(); if (!reading) setDragActive(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              if (reading) return;
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFile(f);
            }}
            className={`w-full cursor-pointer border-2 border-dashed rounded-lg px-4 py-6 text-sm flex flex-col items-center justify-center gap-2 transition-colors ${
              dragActive
                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                : "border-gray-300 text-gray-600 hover:border-emerald-400 hover:text-emerald-700"
            } ${reading ? "opacity-50 pointer-events-none" : ""}`}
          >
            {reading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
            <span className="text-center">
              {reading
                ? "Leyendo…"
                : fileName
                  ? <>Archivo: <strong>{fileName}</strong> · arrastra o haz click para cambiarlo</>
                  : <>Arrastra el Excel aquí, o haz <strong>click</strong> para elegirlo</>}
            </span>
          </div>

          {parseError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{parseError}</div>
          )}

          {parsed && (
            <>
              {/* Fecha de reposición */}
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                <label className="block text-xs font-medium text-blue-900 mb-1">
                  Fecha de reposición (el día que transferiste al administrador)
                </label>
                <input
                  type="date"
                  value={reposicionDate}
                  max={getToday()}
                  onChange={(e) => setReposicionDate(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <p className="text-[11px] text-blue-800 mt-1">
                  Todos los gastos se registran como <strong>transferencia</strong> (salen del banco) en esta fecha,
                  categorizados. La fecha original de cada gasto queda en la nota.
                </p>
              </div>

              {parsed.warnings.length > 0 && (
                <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-1">
                  {parsed.warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
                </div>
              )}

              {alreadyCount != null && (
                <div className="bg-amber-50 border border-amber-300 rounded-lg p-3">
                  <div className="text-sm text-amber-900 font-medium flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> Esta reposición ya fue subida antes ({alreadyCount} gastos).
                  </div>
                  <label className="flex items-center gap-2 text-sm text-amber-900 mt-2 cursor-pointer">
                    <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="accent-amber-600" />
                    Sí, subirla de nuevo (registrará los gastos otra vez)
                  </label>
                </div>
              )}

              {/* Preview agrupado */}
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                <div className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-600 flex justify-between">
                  <span>{parsed.periodo ? `Periodo: ${parsed.periodo}` : "Vista previa"} · {parsed.items.length} gastos</span>
                  <span>Total: {formatCurrency(parsed.total)}</span>
                </div>
                {grouped.map(([cat, g]) => (
                  <div key={cat} className="px-4 py-2">
                    <div className="flex justify-between text-sm font-medium text-gray-800">
                      <span>{cat}</span>
                      <span>{formatCurrency(g.subtotal)}</span>
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {g.items.map((it, i) => (
                        <li key={i} className="flex justify-between text-xs text-gray-500">
                          <span className="truncate pr-2">{it.concept}{it.itemDate ? ` · ${it.itemDate}` : ""}</span>
                          <span className="shrink-0">{formatCurrency(it.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              {saveError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveError}</div>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50">
            Cancelar
          </button>
          {parsed && (
            <button
              onClick={handleImport}
              disabled={saving || blockedByDupe}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 inline-flex items-center gap-1.5"
              title={blockedByDupe ? "Marca 'subirla de nuevo' para continuar" : undefined}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Registrar {parsed.items.length} gastos ({formatCurrency(parsed.total)})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
