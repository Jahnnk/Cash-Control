"use client";

import { useRef, useState } from "react";
import { X, Loader2, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { parseVentasReport } from "@/lib/incentives/byte-ventas-parser";
import { importVentasByte } from "@/app/actions/byte-ventas";

type FileResult = { name: string; status: "ok" | "error" | "warn"; detail: string };

/**
 * Subir el reporte semanal "Ventas de <MES>" de Byte (las 3 sedes).
 * Alimenta la diapositiva de ventas del deck de la reunión: acumulado
 * del mes y comparativos contra la semana y el mes pasado. Re-subir un
 * rango lo reemplaza (idempotente) — el reporte oficial siempre manda.
 */
export function VentasImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<FileResult[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [didImport, setDidImport] = useState(false);

  async function handleFiles(files: FileList | File[]) {
    setBusy(true);
    const out: FileResult[] = [];
    for (const file of Array.from(files)) {
      try {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null }) as unknown[][];
        const parsed = parseVentasReport(rows);
        if (parsed.errores.length > 0) {
          out.push({ name: file.name, status: "error", detail: parsed.errores.join(" ") });
          continue;
        }
        const r = await importVentasByte({ days: parsed.days, fileName: file.name });
        if (!r.ok) {
          out.push({ name: file.name, status: "error", detail: r.error });
          continue;
        }
        setDidImport(true);
        const total = parsed.days.reduce((a, d) => a + d.total, 0);
        out.push({
          name: file.name,
          status: "ok",
          detail: `${r.imported} día${r.imported === 1 ? "" : "s"} · ${parsed.periodStart} → ${parsed.periodEnd} · S/${total.toFixed(2)}`,
        });
        // Los warnings del parser (ej. el checksum no cuadra) se muestran
        // aparte: el import se hizo, pero el humano debe saberlo.
        for (const w of parsed.warnings) {
          out.push({ name: file.name, status: "warn", detail: w });
        }
      } catch {
        out.push({ name: file.name, status: "error", detail: "No pude leer el archivo (.xlsx de Byte)." });
      }
    }
    setResults((prev) => [...out, ...prev]);
    setBusy(false);
    if (out.some((r) => r.status === "ok")) showToast("Ventas importadas", "success");
  }

  function close() {
    if (didImport) onImported();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={close}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            Subir ventas de Byte
          </h2>
          <button onClick={close} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-gray-500">
            <strong>Rutina semanal (~2 min)</strong> — exporta de Byte el reporte
            <strong> “Ventas”</strong> con el rango <strong>desde el día 1 del mes hasta hoy</strong> y
            suéltalo aquí. Alimenta el acumulado de ventas del mes y los comparativos del deck de la
            reunión. Re-subirlo <strong>reemplaza</strong> lo anterior (no duplica).
          </p>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
            }}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragActive ? "border-primary bg-primary/5" : "border-gray-300 hover:border-gray-400"
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            {busy ? (
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
            ) : (
              <>
                <Upload className="w-6 h-6 mx-auto text-gray-400 mb-2" />
                <div className="text-sm text-gray-600">Suelta el .xlsx aquí o haz click para elegirlo</div>
              </>
            )}
          </div>

          {results.length > 0 && (
            <div className="space-y-1.5">
              {results.map((r, i) => (
                <div
                  key={`${r.name}-${i}`}
                  className={`text-xs rounded-lg px-3 py-2 border flex gap-2 ${
                    r.status === "ok"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                      : r.status === "warn"
                        ? "bg-amber-50 border-amber-200 text-amber-800"
                        : "bg-red-50 border-red-200 text-red-800"
                  }`}
                >
                  {r.status === "ok" ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                  <span><strong>{r.name}</strong> — {r.detail}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
          <button onClick={close} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">
            {didImport ? "Cerrar y actualizar" : "Cerrar"}
          </button>
        </div>
      </div>
    </div>
  );
}
