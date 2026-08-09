"use client";

import { useRef, useState } from "react";
import { X, Loader2, Upload, Users, CheckCircle2, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { parseClientSales } from "@/lib/client-sales-parser";
import { importClientSales } from "@/app/actions/client-sales";
import { formatCurrency } from "@/lib/utils";

type FileResult = { name: string; status: "ok" | "error" | "warn"; detail: string };

/**
 * Subir el "Reporte Ventas por Cliente" de Byte (solo Atelier).
 * Alimenta el seguimiento de mejores clientes B2B. Re-subir el mismo
 * rango de fechas lo REEMPLAZA — Luis puede corregir sin duplicar.
 */
export function ClientSalesImportModal({
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
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
          header: 1,
          defval: null,
        }) as unknown[][];
        const parsed = parseClientSales(rows);

        if (parsed.errores.length > 0) {
          out.push({ name: file.name, status: "error", detail: parsed.errores.join(" ") });
          continue;
        }
        const r = await importClientSales({
          filas: parsed.filas,
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
            `${r.periodo.inicio} → ${r.periodo.fin} · ${parsed.totales.clientes} clientes · ` +
            `${formatCurrency(parsed.totales.ventasExternas)} de clientes externos` +
            (parsed.totales.ventasSedes > 0
              ? ` · ${formatCurrency(parsed.totales.ventasSedes)} a Fonavi y Centro (aparte)`
              : "") +
            (r.reemplazo ? " · reemplazó lo que había de esa semana" : ""),
        });
        for (const w of parsed.warnings) {
          out.push({ name: file.name, status: "warn", detail: w });
        }
      } catch {
        out.push({
          name: file.name,
          status: "error",
          detail: "No pude leer el archivo. ¿Es el .xlsx que descargaste de Byte?",
        });
      }
    }
    setResults((prev) => [...out, ...prev]);
    setBusy(false);
    if (out.some((r) => r.status === "ok")) showToast("Reporte de clientes importado", "success");
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
            <Users className="w-5 h-5 text-primary" />
            Subir ventas por cliente
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
          <p className="text-xs text-gray-500">
            <strong>Rutina semanal (~1 min)</strong> — en Byte exporta el reporte{" "}
            <strong>“Ventas por Cliente”</strong> de la semana y suéltalo aquí. El sistema arma
            solo el ranking de mejores clientes, quién creció, quién dejó de comprar. Las ventas a{" "}
            <strong>Fonavi y Centro se cuentan aparte</strong>, para que no tapen a los clientes de
            afuera. Re-subir la misma semana <strong>reemplaza</strong> lo anterior (no duplica).
          </p>

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
                  Suelta el .xlsx aquí o haz click para elegirlo
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
