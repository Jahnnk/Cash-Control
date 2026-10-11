"use client";

import { useRef, useState } from "react";
import { X, Loader2, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { parseControlReport } from "@/lib/incentives/byte-control-parsers";
import { parseByteRotacion } from "@/lib/byte-rotacion-parser";
import { importControlReport } from "@/app/actions/incentives";
import { importProductSalesFromPanel } from "@/app/actions/product-sales-import";
import { parseVentasReport } from "@/lib/incentives/byte-ventas-parser";
import { importVentasByte } from "@/app/actions/byte-ventas";
import { detectarTipoReporte, parseReceivablesFile } from "@/lib/receivables-parser";
import { importReceivablesReport } from "@/app/actions/receivables";

function currentMonthLima(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7);
}

const KIND_LABEL: Record<string, string> = {
  anulaciones: "Pedidos anulados (histórico)",
  cortesias: "Cortesías",
  cambios_precio: "Cambios de precio",
  ventas_trabajador: "Ventas por trabajador",
};

type FileResult = { name: string; status: "ok" | "error"; detail: string };

/**
 * Incentivos · Subir los reportes de control de Byte (varios a la vez).
 * Cada archivo se auto-clasifica por su encabezado; re-subir un rango
 * lo reemplaza (idempotente). El admin sube 3 archivos 1-2 veces/semana.
 * Nota jul-2026: Byte eliminó el reporte de Pedidos Anulados (los
 * asesores ya no pueden anular pedidos pagados; las anulaciones de
 * comandas pre-pago no generan reporte). Los exports antiguos de
 * anulados se siguen aceptando como histórico.
 */
export function ImportControlModal({
  onClose,
  onImported,
  soloRotacion = false,
}: {
  onClose: () => void;
  onImported: () => void;
  /**
   * Atelier (el nombre quedó de cuando solo subía la rotación). Es
   * producción: sube Reporte de Ventas, Consolidado de Facturas y Platos con
   * Mayor Rotación (10-oct-2026). Cortesías y Ventas por Trabajador no
   * existen en su operación. Ver REPORTES_POR_SEDE.
   */
  soloRotacion?: boolean;
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
    // Se leen todos primero para poder ordenarlos: en Atelier el «Reporte de
    // Ventas» entra antes que el «Consolidado», así el consolidado encuentra
    // los documentos ya creados y solo les agrega el RUC.
    const leidos: { file: File; rows: unknown[][] | null }[] = [];
    for (const file of Array.from(files)) {
      try {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
        leidos.push({ file, rows: XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null }) as unknown[][] });
      } catch {
        leidos.push({ file, rows: null });
      }
    }
    const orden = (rows: unknown[][] | null) => {
      const t = soloRotacion && rows ? detectarTipoReporte(rows) : null;
      return t === "ventas" ? 0 : t === "facturas" ? 1 : 2;
    };
    leidos.sort((a, b) => orden(a.rows) - orden(b.rows));

    for (const { file, rows } of leidos) {
      try {
        if (!rows) throw new Error("ilegible");
        // Atelier (10-oct-2026): sus dos reportes de cobros entran por esta
        // misma caja. El «Reporte de Ventas» además actualiza la venta de cada
        // día y el ranking de clientes (ya no se suben «Ventas de <MES>» ni
        // «Ventas por Cliente»).
        if (soloRotacion && detectarTipoReporte(rows)) {
          const rc = parseReceivablesFile(rows);
          if (rc.errores.length > 0 || !rc.periodo.inicio || !rc.periodo.fin) {
            out.push({ name: file.name, status: "error", detail: rc.errores.join(" ") || "No encontré el período del reporte." });
            continue;
          }
          const ri = await importReceivablesReport({
            tipoReporte: rc.tipoReporte, docs: rc.docs,
            periodo: { inicio: rc.periodo.inicio, fin: rc.periodo.fin }, archivo: file.name,
          });
          if (!ri.ok) {
            out.push({ name: file.name, status: "error", detail: ri.error });
            continue;
          }
          setDidImport(true);
          const der = ri.derivado;
          out.push({
            name: file.name,
            status: "ok",
            detail: rc.tipoReporte === "ventas"
              ? `Reporte de Ventas · ${rc.periodo.inicio} → ${rc.periodo.fin} · S/${rc.totales.total.toFixed(2)} · cobros al día` +
                (der && !der.error ? ` · ${der.dias} día${der.dias === 1 ? "" : "s"} de venta${der.semanas > 0 ? ` · clientes de ${der.semanas} semana${der.semanas === 1 ? "" : "s"}` : ""}` : "")
              : `Consolidado de Facturas · ${rc.periodo.inicio} → ${rc.periodo.fin} · RUC y anulaciones al día`,
          });
          if (der?.error) out.push({ name: file.name, status: "error", detail: der.error });
          continue;
        }
        // «Ventas de <MES>» (venta de cada día). Desde el 10-oct-2026 entra por
        // esta misma caja: la sube la sede cada sábado con los demás (antes iba
        // por un botón aparte que la rutina no vigilaba).
        const ventas = parseVentasReport(rows);
        if (ventas.errores.length === 0 && ventas.days.length > 0) {
          const rv = await importVentasByte({ days: ventas.days, fileName: file.name });
          if (!rv.ok) {
            out.push({ name: file.name, status: "error", detail: rv.error });
          } else {
            setDidImport(true);
            const total = ventas.days.reduce((a, d) => a + d.total, 0);
            out.push({
              name: file.name,
              status: "ok",
              detail: `Ventas del mes · ${rv.imported} día${rv.imported === 1 ? "" : "s"} · ${ventas.periodStart} → ${ventas.periodEnd} · S/${total.toFixed(2)}`,
            });
          }
          continue;
        }
        const parsed = parseControlReport(rows);
        if (!parsed.ok) {
          // ¿Es el reporte de Rotación de productos? (4to de la rutina —
          // alimenta el foco del día y la base de Productos del PIC).
          const rot = parseByteRotacion(rows);
          if (rot.ok) {
            if (rot.format !== "rotacion") {
              out.push({ name: file.name, status: "error", detail: "Ese es el reporte de Rentabilidad — sube “Productos con mayor rotación”." });
              continue;
            }
            const current = currentMonthLima();
            if (rot.month && rot.month !== current) {
              out.push({ name: file.name, status: "error", detail: `El reporte de rotación debe ser del mes en curso (rango del 1 al día de hoy). Este es de ${rot.month}.` });
              continue;
            }
            const ri = await importProductSalesFromPanel({
              month: current,
              fileName: file.name,
              items: rot.items,
              declaredTotal: rot.declaredTotal,
              parseWarnings: rot.warnings,
              // El rango viaja para que el servidor pueda rechazar un
              // reporte de una sola semana: subirlo BORRA el resto del mes.
              periodStart: rot.periodStart,
              periodEnd: rot.periodEnd,
            });
            if (!ri.ok) {
              out.push({ name: file.name, status: "error", detail: ri.error });
            } else {
              setDidImport(true);
              const delta = ri.deltaVsSystem !== null ? ` · diferencia vs registro diario S/${Math.abs(ri.deltaVsSystem).toFixed(2)}` : "";
              out.push({
                name: file.name,
                status: "ok",
                detail: `Rotación de productos · ${ri.imported} productos · S/${ri.totalRevenue.toFixed(2)}${delta}`,
              });
            }
            continue;
          }
          out.push({ name: file.name, status: "error", detail: parsed.errors.join(" ") });
          continue;
        }
        const r = await importControlReport({
          kind: parsed.kind,
          fileName: file.name,
          events: parsed.events,
          workers: parsed.workers,
          periodStart: parsed.periodStart,
          periodEnd: parsed.periodEnd,
        });
        if (!r.ok) {
          out.push({ name: file.name, status: "error", detail: r.error });
        } else {
          setDidImport(true);
          out.push({
            name: file.name,
            status: "ok",
            detail: `${KIND_LABEL[parsed.kind]} · ${r.imported} registro${r.imported === 1 ? "" : "s"}${parsed.periodStart ? ` · ${parsed.periodStart} → ${parsed.periodEnd}` : ""}`,
          });
        }
      } catch {
        out.push({ name: file.name, status: "error", detail: "No pude leer el archivo (.xlsx de Byte)." });
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            Subir Reportes Administración (Byte)
          </h2>
          <button onClick={close} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-gray-500">
            <strong>Rutina semanal (~5 min)</strong> —{" "}
            {soloRotacion
              ? "la venta de cada día, los clientes, los cobros y qué productos se venden."
              : "para banderas de control, ranking y el foco de upselling; el avance diario de la meta sale del registro del día, no de estos archivos."} Exporta de Byte {soloRotacion ? "los 3 reportes" : "los 4 reportes"} con el rango{" "}
            <strong>desde el día 1 del mes hasta hoy</strong> y suéltalos aquí todos juntos:{" "}
            <strong>
              {soloRotacion
                ? "Reporte de Ventas · Consolidado de Facturas · Productos con Mayor Rotación"
                : "Ventas del mes · Productos con Mayor Rotación · Cortesías · Ventas por Trabajador"}
            </strong>. Cada subida
            <strong> reemplaza</strong> la anterior (no duplica) y el sistema reconoce cada archivo
            solo. Puedes subirlos más seguido si algo te huele raro.
          </p>
          <p className="text-[11px] text-gray-400">
            Ya no hace falta subir <strong>Cambios de Precio</strong>: los asesores y caja no pueden
            cambiar precios, solo un administrador. Tampoco <strong>Pedidos Anulados</strong>, que
            Byte dejó de generar. Si igual los tienes exportados, el sistema los sigue aceptando.
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
                <div className="text-sm text-gray-600">Suelta los .xlsx aquí o haz click para elegirlos</div>
              </>
            )}
          </div>

          {results.length > 0 && (
            <div className="space-y-1.5">
              {results.map((r, i) => (
                <div
                  key={`${r.name}-${i}`}
                  className={`text-xs rounded-lg px-3 py-2 border flex gap-2 ${
                    r.status === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"
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
            {didImport ? "Cerrar y actualizar tablero" : "Cerrar"}
          </button>
        </div>
      </div>
    </div>
  );
}
