"use client";

import { useRef, useState } from "react";
import { X, Loader2, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/components/toast-provider";
import { parseByteRotacion, type ByteRotacionResult } from "@/lib/byte-rotacion-parser";
import {
  importProductSales,
  type ProductSalesImportResult,
} from "@/app/actions/product-sales-import";

/**
 * PIC · Modal de import de ventas por producto. Sube el reporte de Byte
 * "Productos con mayor rotación" del mes → preview con cuadre → importa
 * (idempotente: re-subir un mes lo reemplaza) → reporte de calidad.
 */
export function ImportSalesModal({
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
  const [parsed, setParsed] = useState<Extract<ByteRotacionResult, { ok: true }> | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<Extract<ProductSalesImportResult, { ok: true }> | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  async function handleFile(file: File) {
    setReading(true);
    setParseError(null);
    setParsed(null);
    setResult(null);
    setFileName(file.name);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];
      const r = parseByteRotacion(rows);
      if (!r.ok) {
        setParseError(r.errors.join(" "));
        return;
      }
      setParsed(r);
    } catch {
      setParseError('No pude leer el Excel. ¿Es el reporte de Byte "Productos con mayor rotación" (.xlsx)?');
    } finally {
      setReading(false);
    }
  }

  async function handleImport() {
    if (!parsed || !parsed.month) return;
    setSaving(true);
    setSaveError(null);
    const r = await importProductSales({
      month: parsed.month,
      fileName,
      items: parsed.items,
      declaredTotal: parsed.declaredTotal,
      parseWarnings: parsed.warnings,
    });
    setSaving(false);
    if (!r.ok) {
      setSaveError(r.error);
      return;
    }
    setResult(r);
    showToast(`Ventas de ${parsed.month} importadas: ${r.imported} productos`, "success");
    onImported();
  }

  const previewTop = parsed
    ? [...parsed.items].sort((a, b) => b.revenue - a.revenue).slice(0, 8)
    : [];
  const parsedTotal = parsed
    ? Math.round(parsed.items.reduce((s, it) => s + it.revenue, 0) * 100) / 100
    : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            Importar ventas por producto (Byte)
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {!result && (
            <>
              <p className="text-xs text-gray-500">
                Sube <strong>UN reporte de Byte por mes</strong> (mes calendario completo).
                El ideal es <strong>&ldquo;Productos con mayor rotación&rdquo;</strong> (cuadra ~99% con la
                venta); también acepta <strong>&ldquo;Rentabilidad por Plato&rdquo;</strong> (cubre 87-94% en
                cafeterías) — el sistema detecta el formato solo. No subas ambos del mismo mes:
                re-subir un mes lo <strong>reemplaza</strong> (no duplica). Los costos NO salen de Byte
                sino del pricing-engine. Este import no toca saldos ni movimientos.
              </p>

              {/* Dropzone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFile(f);
                }}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                  dragActive ? "border-primary bg-primary/5" : "border-gray-300 hover:border-gray-400"
                }`}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = "";
                  }}
                />
                {reading ? (
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
                ) : (
                  <>
                    <Upload className="w-6 h-6 mx-auto text-gray-400 mb-2" />
                    <div className="text-sm text-gray-600">
                      {fileName ?? "Arrastra el .xlsx aquí o haz click para elegirlo"}
                    </div>
                  </>
                )}
              </div>

              {parseError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{parseError}</div>
              )}

              {parsed && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-4 text-sm bg-gray-50 rounded-lg px-4 py-3">
                    <div>
                      <span className="text-gray-500 text-xs">Formato detectado</span>
                      <div className="font-semibold">{parsed.format === "rotacion" ? "Rotación ✓" : "Rentabilidad"}</div>
                    </div>
                    <div><span className="text-gray-500 text-xs">Mes</span><div className="font-semibold">{parsed.month ?? "—"}</div></div>
                    <div><span className="text-gray-500 text-xs">Productos</span><div className="font-semibold">{parsed.items.length}</div></div>
                    <div><span className="text-gray-500 text-xs">Total del archivo</span><div className="font-semibold">{formatCurrency(parsedTotal)}</div></div>
                    {parsed.declaredTotal !== null && (
                      <div><span className="text-gray-500 text-xs">TOTAL según Byte</span><div className="font-semibold">{formatCurrency(parsed.declaredTotal)}</div></div>
                    )}
                  </div>

                  {parsed.warnings.length > 0 && (
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-1">
                      {parsed.warnings.map((w, i) => (
                        <div key={i} className="flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{w}</div>
                      ))}
                    </div>
                  )}

                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 text-[11px] font-semibold uppercase text-gray-500 bg-gray-50">Top del mes (preview)</div>
                    {previewTop.map((it) => (
                      <div key={it.name} className="flex justify-between px-3 py-1.5 text-xs border-t border-gray-100">
                        <span className="truncate pr-3 text-gray-700">{it.name}</span>
                        <span className="shrink-0 text-gray-500">{it.units} und · <span className="font-medium text-gray-900">{formatCurrency(it.revenue)}</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {saveError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveError}</div>
              )}
            </>
          )}

          {/* Reporte de calidad post-import */}
          {result && parsed && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium">
                <CheckCircle2 className="w-5 h-5" /> Ventas de {parsed.month} importadas
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-50 rounded-lg px-4 py-3">
                  <div className="text-xs text-gray-500">Productos importados</div>
                  <div className="font-semibold">{result.imported}</div>
                </div>
                <div className="bg-gray-50 rounded-lg px-4 py-3">
                  <div className="text-xs text-gray-500">Con match de catálogo</div>
                  <div className="font-semibold">
                    {result.matchedCount}/{result.imported} ({result.imported ? Math.round((result.matchedCount / result.imported) * 100) : 0}%)
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg px-4 py-3">
                  <div className="text-xs text-gray-500">Total importado</div>
                  <div className="font-semibold">{formatCurrency(result.totalRevenue)}</div>
                </div>
                <div className="bg-gray-50 rounded-lg px-4 py-3">
                  <div className="text-xs text-gray-500">Cuadre vs. ventas del mes en el sistema</div>
                  <div className="font-semibold">
                    {result.systemMonthTotal === null
                      ? "sin registro del mes"
                      : `${formatCurrency(result.systemMonthTotal)} (dif ${formatCurrency(result.deltaVsSystem ?? 0)})`}
                  </div>
                </div>
              </div>
              {result.unmatched.length > 0 && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <div className="font-medium mb-1">
                    Sin match de catálogo ({result.unmatched.length}) — se guardaron igual y se podrán vincular cuando el catálogo los tenga:
                  </div>
                  <div className="text-amber-800">{result.unmatched.join(" · ")}</div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50">
            {result ? "Cerrar" : "Cancelar"}
          </button>
          {!result && (
            <button
              onClick={handleImport}
              disabled={!parsed || !parsed.month || saving}
              className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-light rounded-lg disabled:opacity-50 inline-flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {saving ? "Importando…" : "Importar mes"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
