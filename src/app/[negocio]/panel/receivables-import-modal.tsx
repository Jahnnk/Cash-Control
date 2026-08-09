"use client";

import { useRef, useState } from "react";
import { X, Loader2, Upload, FileText, CheckCircle2, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { parseReceivablesFile } from "@/lib/receivables-parser";
import { importReceivablesReport } from "@/app/actions/receivables";
import { formatCurrency } from "@/lib/utils";

type FileResult = { name: string; status: "ok" | "error" | "warn"; detail: string };

const NOMBRE: Record<string, string> = {
  ventas: "Reporte de Ventas",
  facturas: "Consolidado de Facturas",
};

/**
 * Subir los dos reportes de Byte que alimentan cuentas por cobrar.
 *
 * Luis puede soltar los dos archivos a la vez y en cualquier orden: el
 * sistema reconoce cada uno por sus columnas. Re-subir actualiza los
 * documentos que ya existían en vez de duplicarlos.
 */
export function ReceivablesImportModal({
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
    // Los archivos se ordenan para que las ventas entren primero: así el
    // consolidado encuentra los documentos ya creados y solo les agrega
    // el RUC y el IGV.
    const lista = Array.from(files).sort((a, b) =>
      /venta/i.test(a.name) === /venta/i.test(b.name) ? 0 : /venta/i.test(a.name) ? -1 : 1,
    );

    for (const file of lista) {
      try {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
          header: 1,
          defval: null,
        }) as unknown[][];
        const parsed = parseReceivablesFile(rows);

        if (parsed.errores.length > 0) {
          out.push({ name: file.name, status: "error", detail: parsed.errores.join(" ") });
          continue;
        }

        const r = await importReceivablesReport({
          tipoReporte: parsed.tipoReporte,
          docs: parsed.docs,
          periodo: { inicio: parsed.periodo.inicio!, fin: parsed.periodo.fin! },
          archivo: file.name,
        });
        if (!r.ok) {
          out.push({ name: file.name, status: "error", detail: r.error });
          continue;
        }
        setDidImport(true);
        out.push({
          name: file.name,
          status: "ok",
          detail:
            `Reconocido como «${NOMBRE[parsed.tipoReporte]}» · ` +
            `${parsed.periodo.inicio} → ${parsed.periodo.fin} · ` +
            `${r.nuevos} nuevo${r.nuevos === 1 ? "" : "s"}, ${r.actualizados} actualizado${
              r.actualizados === 1 ? "" : "s"
            } · ${formatCurrency(parsed.totales.total)}` +
            (parsed.tipoReporte === "ventas"
              ? ` · ${formatCurrency(parsed.totales.pendiente)} por cobrar`
              : ""),
        });
        for (const w of parsed.warnings) {
          out.push({ name: file.name, status: "warn", detail: w });
        }
      } catch {
        out.push({
          name: file.name,
          status: "error",
          detail: "No pude leer el archivo. ¿Es un .xlsx descargado de Byte?",
        });
      }
    }
    setResults((prev) => [...out, ...prev]);
    setBusy(false);
    if (out.some((r) => r.status === "ok")) showToast("Reportes importados", "success");
  }

  function close() {
    if (didImport) onImported();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={close}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Subir facturas y ventas
          </h2>
          <button
            onClick={close}
            className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="text-xs text-gray-600 space-y-2">
            <p>
              <strong>Rutina semanal (~1 min)</strong> — en Byte descarga estos dos reportes y
              suéltalos acá, los dos juntos y en cualquier orden:
            </p>
            <ul className="space-y-1 pl-1">
              <li className="flex gap-2">
                <span className="text-primary font-bold">1.</span>
                <span>
                  <strong>Reporte de Ventas</strong> — trae toda la venta y, sobre todo,{" "}
                  <strong>quién ya pagó y quién no</strong>.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-bold">2.</span>
                <span>
                  <strong>Consolidado de Facturas</strong> — trae el RUC de cada cliente, el IGV y
                  las facturas anuladas.
                </span>
              </li>
            </ul>
            <p className="text-gray-500">
              El sistema reconoce solo cuál es cuál. Volver a subir un archivo{" "}
              <strong>actualiza</strong> lo que ya estaba (por ejemplo, una factura que ya se cobró),
              nunca lo duplica.
            </p>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
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
                <div className="text-sm text-gray-600">
                  Suelta acá los .xlsx o haz click para elegirlos
                </div>
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
                  {r.status === "ok" ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  )}
                  <span>
                    <strong>{r.name}</strong> — {r.detail}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
          <button
            onClick={close}
            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-light"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
