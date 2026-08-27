"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Upload, X, AlertTriangle, CheckCircle2, Loader2, Shield } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  listExcelSheets,
  previewExcelImport,
  executeExcelImport,
  getMonthsLoadStatus,
  executeMultiMonthImport,
  type ImportPreview,
  type ImportResult,
  type MonthLoadDetection,
  type MultiMonthResult,
} from "@/app/actions/excel-import";
import { pairSheetsByMonth, type MonthPair } from "@/lib/excel-month-pairing";
import { mensajeFechasFueraDelMes } from "@/lib/filas-fuera-del-mes";

type Step = "select" | "months" | "sheets" | "preview" | "confirm" | "result" | "multiresult";

const MONTH_NAMES_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];
function monthKeyLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-");
  const idx = parseInt(m, 10) - 1;
  return `${MONTH_NAMES_SHORT[idx] ?? m} ${y}`;
}

export function ExcelImportModal({
  negocio,
  open,
  onClose,
  sedeCentral,
}: {
  negocio: string;
  open: boolean;
  onClose: () => void;
  /** Import CENTRAL desde Grupo (solo dirección): la sede va explícita
   * a las actions — jamás adivinada de la cookie. */
  sedeCentral?: "atelier" | "fonavi" | "centro";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [step, setStep] = useState<Step>("select");
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [ingGtosCandidates, setIngGtosCandidates] = useState<string[]>([]);
  const [controlVtasCandidates, setControlVtasCandidates] = useState<string[]>([]);
  const [selectedIngGtos, setSelectedIngGtos] = useState<string | null>(null);
  const [selectedControlVtas, setSelectedControlVtas] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<ImportResult, { success: true }> | null>(null);

  const [aplicarSaldoInicial, setAplicarSaldoInicial] = useState(true);
  const [archivarManualesExistentes, setArchivarManualesExistentes] = useState(true);
  const [crearCategoriasNuevas, setCrearCategoriasNuevas] = useState(true);

  // Multi-mes
  const [monthPairs, setMonthPairs] = useState<MonthPair[]>([]);
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());
  const [loadStatus, setLoadStatus] = useState<Record<string, MonthLoadDetection>>({});
  // Para meses YA cargados: "import" = reemplazar, "skip" = no tocar.
  // Default seguro: meses cargados → "skip" (no se pisan sin elección explícita).
  const [monthActions, setMonthActions] = useState<Record<string, "import" | "skip">>({});
  const [multiResult, setMultiResult] = useState<MultiMonthResult | null>(null);

  const negocioLabel = negocio.charAt(0).toUpperCase() + negocio.slice(1);

  function reset() {
    setStep("select");
    setFileBase64(null);
    setFileName("");
    setIngGtosCandidates([]);
    setControlVtasCandidates([]);
    setSelectedIngGtos(null);
    setSelectedControlVtas(null);
    setPreview(null);
    setError(null);
    setResult(null);
    setMonthPairs([]);
    setSelectedMonths(new Set());
    setLoadStatus({});
    setMonthActions({});
    setMultiResult(null);
  }

  function handleClose() {
    if (pending) return;
    reset();
    onClose();
  }

  async function handleFile(file: File) {
    setError(null);
    if (!file.name.endsWith(".xlsx")) {
      setError("El archivo debe ser .xlsx");
      return;
    }
    const buf = await file.arrayBuffer();
    const b64 = Buffer.from(buf).toString("base64");
    setFileBase64(b64);
    setFileName(file.name);

    startTransition(async () => {
      try {
        const r = await listExcelSheets(b64);
        if (r.candidatesIngGtos.length === 0 && r.candidatesControlVtas.length === 0) {
          setError("El archivo no contiene pestañas 'Ing&Gtos' ni 'Control de VTAS'. ¿Es el formato correcto de Kelly?");
          return;
        }
        setIngGtosCandidates(r.candidatesIngGtos);
        setControlVtasCandidates(r.candidatesControlVtas);

        // Emparejar por mes (tolerante a capitalización). Cada mes arrastra
        // su par Ing&Gtos + Control de VTAS.
        const { months } = pairSheetsByMonth(r.candidatesIngGtos, r.candidatesControlVtas);
        setMonthPairs(months);
        // Selección inicial: los meses completos (con ambas pestañas).
        const completeKeys = months.filter((m) => m.status === "complete").map((m) => m.monthKey);
        const initial = new Set(completeKeys.length ? completeKeys : months.map((m) => m.monthKey));
        setSelectedMonths(initial);

        // Detección READ-ONLY de meses ya cargados (conteos) — para todos los
        // meses, así toggles no requieren refetch.
        const det = await getMonthsLoadStatus(months.map((m) => m.monthKey), sedeCentral);
        const map: Record<string, MonthLoadDetection> = {};
        const acts: Record<string, "import" | "skip"> = {};
        for (const d of det) {
          map[d.monthKey] = d;
          acts[d.monthKey] = d.loaded ? "skip" : "import"; // cargado → skip por defecto (seguro)
        }
        setLoadStatus(map);
        setMonthActions(acts);
        setStep("months");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al leer archivo");
      }
    });
  }

  function buildPlan() {
    return monthPairs
      .filter((m) => selectedMonths.has(m.monthKey))
      .map((m) => {
        const loaded = loadStatus[m.monthKey]?.loaded ?? false;
        const action: "import" | "skip" = loaded ? (monthActions[m.monthKey] ?? "skip") : "import";
        return {
          monthKey: m.monthKey,
          ingGtosSheet: m.ingGtosSheet,
          controlVtasSheet: m.controlVtasSheet,
          action,
        };
      });
  }

  function handleExecuteMulti() {
    if (!fileBase64) return;
    const plan = buildPlan();
    const toImport = plan.filter((p) => p.action === "import");
    if (toImport.length === 0) {
      setError("No hay meses para importar. Marca al menos un mes (y elige Reemplazar en los ya cargados).");
      return;
    }
    setError(null);
    startTransition(async () => {
      // Un error del servidor se muestra AQUÍ, nunca como pantalla rota
      // (lección del import central: la pantalla "Algo salió mal" no le
      // dice nada a nadie).
      try {
        const r = await executeMultiMonthImport(fileBase64, fileName, plan, {
          aplicarSaldoInicial,
          archivarManualesExistentes,
          crearCategoriasNuevas,
        }, sedeCentral);
        setMultiResult(r);
        setStep("multiresult");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error inesperado al importar. Reintenta o avísale a Jahnn.");
      }
    });
  }

  async function loadPreview(b64: string, fName: string, ingGtos: string | null, controlVtas: string | null) {
    setError(null);
    try {
      const p = await previewExcelImport(b64, fName, ingGtos, controlVtas, sedeCentral);
      if ("error" in p) {
        setError(p.error);
        return;
      }
      setPreview(p);
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado al leer el archivo.");
    }
  }

  function handleSheetSelected() {
    if (!fileBase64) return;
    if (!selectedIngGtos && !selectedControlVtas) {
      setError("Debes seleccionar al menos una pestaña a importar.");
      return;
    }
    startTransition(async () => {
      await loadPreview(fileBase64, fileName, selectedIngGtos, selectedControlVtas);
    });
  }

  function handleExecute() {
    if (!fileBase64) return;
    if (!selectedIngGtos && !selectedControlVtas) return;
    setError(null);
    startTransition(async () => {
      try {
        const r = await executeExcelImport(fileBase64, fileName, selectedIngGtos, selectedControlVtas, {
          aplicarSaldoInicial,
          archivarManualesExistentes,
          crearCategoriasNuevas,
        }, sedeCentral);
        if (!r.success) {
          setError(r.error);
          return;
        }
        setResult(r);
        setStep("result");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error inesperado al importar. Reintenta o avísale a Jahnn.");
      }
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={handleClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Importar desde Excel · {negocioLabel}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Solo se afectarán datos de <strong>{negocioLabel}</strong>. Los otros 2 negocios no serán modificados.
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 shrink-0" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {step === "select" && (
            <SelectStep onFile={handleFile} pending={pending} />
          )}

          {step === "months" && (
            <MonthsStep
              negocioLabel={negocioLabel}
              monthPairs={monthPairs}
              selectedMonths={selectedMonths}
              setSelectedMonths={setSelectedMonths}
              loadStatus={loadStatus}
              monthActions={monthActions}
              setMonthActions={setMonthActions}
              aplicarSaldoInicial={aplicarSaldoInicial}
              setAplicarSaldoInicial={setAplicarSaldoInicial}
              archivarManualesExistentes={archivarManualesExistentes}
              setArchivarManualesExistentes={setArchivarManualesExistentes}
              crearCategoriasNuevas={crearCategoriasNuevas}
              setCrearCategoriasNuevas={setCrearCategoriasNuevas}
              onBack={() => setStep("select")}
              onExecute={handleExecuteMulti}
              pending={pending}
            />
          )}

          {step === "sheets" && (
            <SheetsStep
              ingGtosCandidates={ingGtosCandidates}
              controlVtasCandidates={controlVtasCandidates}
              selectedIngGtos={selectedIngGtos}
              selectedControlVtas={selectedControlVtas}
              onSelectIngGtos={setSelectedIngGtos}
              onSelectControlVtas={setSelectedControlVtas}
              onContinue={handleSheetSelected}
              onBack={() => setStep("select")}
              pending={pending}
            />
          )}

          {step === "preview" && preview && (
            <PreviewStep
              preview={preview}
              negocioLabel={negocioLabel}
              aplicarSaldoInicial={aplicarSaldoInicial}
              setAplicarSaldoInicial={setAplicarSaldoInicial}
              archivarManualesExistentes={archivarManualesExistentes}
              setArchivarManualesExistentes={setArchivarManualesExistentes}
              crearCategoriasNuevas={crearCategoriasNuevas}
              setCrearCategoriasNuevas={setCrearCategoriasNuevas}
              onBack={() => setStep("sheets")}
              onContinue={() => setStep("confirm")}
              onCancel={handleClose}
            />
          )}

          {step === "confirm" && preview && (
            <ConfirmStep
              preview={preview}
              negocioLabel={negocioLabel}
              archivar={archivarManualesExistentes}
              onBack={() => setStep("preview")}
              onCancel={handleClose}
              onConfirm={handleExecute}
              pending={pending}
            />
          )}

          {step === "result" && result && (
            <ResultStep result={result} onClose={handleClose} />
          )}

          {step === "multiresult" && multiResult && (
            <MultiResultStep result={multiResult} onClose={handleClose} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Step components
// ─────────────────────────────────────────────────────────────────

function SelectStep({ onFile, pending }: { onFile: (f: File) => void; pending: boolean }) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragError, setDragError] = useState<string | null>(null);

  const XLSX_MIME = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ];

  function isXlsx(file: File): boolean {
    if (file.name.toLowerCase().endsWith(".xlsx")) return true;
    return XLSX_MIME.includes(file.type);
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    setIsDragging(true);
    setDragError(null);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Solo desactivar si el cursor realmente salió del contenedor (no
    // si pasa sobre un hijo).
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    setIsDragging(false);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (pending) return;
    const files = Array.from(e.dataTransfer.files ?? []);
    const xlsx = files.find(isXlsx);
    if (!xlsx) {
      setDragError("Tipo de archivo no soportado. Solo se acepta .xlsx (Excel de Kelly).");
      return;
    }
    onFile(xlsx);
  }

  return (
    <div className="space-y-3">
      <label
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`relative block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          pending
            ? "opacity-50 cursor-wait border-gray-300"
            : isDragging
              ? "border-emerald-600 bg-emerald-50"
              : "border-gray-300 hover:border-emerald-400 hover:bg-emerald-50/30"
        }`}
      >
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="hidden"
          disabled={pending}
          onChange={(e) => {
            setDragError(null);
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        <div className="pointer-events-none">
          {pending ? (
            <div className="flex items-center justify-center gap-2 text-gray-600 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Procesando archivo...
            </div>
          ) : (
            <>
              <Upload className={`w-8 h-8 mx-auto mb-2 ${isDragging ? "text-emerald-600" : "text-gray-400"}`} />
              <div className="text-sm font-medium text-gray-700">
                {isDragging ? "Suelta el archivo aquí" : "Click o arrastra el archivo .xlsx aquí"}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Formato esperado: Excel de Kelly (pestaña Ing&Gtos)
              </div>
            </>
          )}
        </div>
      </label>
      {dragError && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{dragError}</span>
        </div>
      )}
    </div>
  );
}

function SheetsStep({
  ingGtosCandidates, controlVtasCandidates,
  selectedIngGtos, selectedControlVtas,
  onSelectIngGtos, onSelectControlVtas,
  onContinue, onBack, pending,
}: {
  ingGtosCandidates: string[];
  controlVtasCandidates: string[];
  selectedIngGtos: string | null;
  selectedControlVtas: string | null;
  onSelectIngGtos: (s: string | null) => void;
  onSelectControlVtas: (s: string | null) => void;
  onContinue: () => void;
  onBack: () => void;
  pending: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-1">Pestañas detectadas</h4>
        <p className="text-xs text-gray-500">
          Marca las pestañas a importar. Las dos del mes más reciente vienen pre-seleccionadas.
        </p>
      </div>

      {ingGtosCandidates.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Ing&amp;Gtos · ingresos / egresos / saldo inicial
          </div>
          <div className="space-y-2">
            {ingGtosCandidates.map((s) => (
              <label key={s} className={`flex items-center gap-3 px-3 py-2.5 border rounded-lg cursor-pointer transition-colors ${selectedIngGtos === s ? "border-emerald-400 bg-emerald-50/50" : "border-gray-200 hover:bg-gray-50"}`}>
                <input
                  type="checkbox"
                  checked={selectedIngGtos === s}
                  onChange={(e) => onSelectIngGtos(e.target.checked ? s : null)}
                  className="text-emerald-600"
                />
                <span className="text-sm font-medium text-gray-900">{s}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {controlVtasCandidates.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Control de VTAS · ventas Byte / propinas / alertas
          </div>
          <div className="space-y-2">
            {controlVtasCandidates.map((s) => (
              <label key={s} className={`flex items-center gap-3 px-3 py-2.5 border rounded-lg cursor-pointer transition-colors ${selectedControlVtas === s ? "border-blue-400 bg-blue-50/50" : "border-gray-200 hover:bg-gray-50"}`}>
                <input
                  type="checkbox"
                  checked={selectedControlVtas === s}
                  onChange={(e) => onSelectControlVtas(e.target.checked ? s : null)}
                  className="text-blue-600"
                />
                <span className="text-sm font-medium text-gray-900">{s}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {ingGtosCandidates.length === 0 && controlVtasCandidates.length === 0 && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          No se detectaron pestañas con formato esperado.
        </div>
      )}

      <div className="flex gap-2 justify-end pt-2">
        <button onClick={onBack} disabled={pending} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-50">
          Atrás
        </button>
        <button
          onClick={onContinue}
          disabled={pending || (!selectedIngGtos && !selectedControlVtas)}
          className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 inline-flex items-center gap-2"
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          Continuar
        </button>
      </div>
    </div>
  );
}

function PreviewStep({
  preview, negocioLabel,
  aplicarSaldoInicial, setAplicarSaldoInicial,
  archivarManualesExistentes, setArchivarManualesExistentes,
  crearCategoriasNuevas, setCrearCategoriasNuevas,
  onBack, onContinue, onCancel,
}: {
  preview: ImportPreview;
  negocioLabel: string;
  aplicarSaldoInicial: boolean;
  setAplicarSaldoInicial: (v: boolean) => void;
  archivarManualesExistentes: boolean;
  setArchivarManualesExistentes: (v: boolean) => void;
  crearCategoriasNuevas: boolean;
  setCrearCategoriasNuevas: (v: boolean) => void;
  onBack: () => void;
  onContinue: () => void;
  onCancel: () => void;
}) {
  const p = preview.parseResult;
  const cv = preview.controlVtasResult;
  const totalManuales = preview.manualesEnRango.ingresos + preview.manualesEnRango.egresos;
  const otrosNegocios = Object.values(preview.saldosAntes).filter(
    (s) => s.code.toLowerCase() !== negocioLabel.toLowerCase()
  );

  const cvTotalVentas = cv
    ? cv.ventasDiarias.reduce((s, v) => s + v.total, 0)
    : 0;
  const cvTotalPropinas = cv
    ? cv.propinas.reduce((s, t) => s + t.amount, 0)
    : 0;

  // Warnings estructurados del parser (Prompt 18 — Casos A/B/C +
  // ajustes Prompt 18.1: silenced para saldos acumulados, info para
  // fwd-fill desfasado).
  const parseWarnings = p?.parseWarnings ?? [];
  const blockingWarnings = parseWarnings.filter((w) => w.severity === "blocking_error");
  const autocorrectedWarnings = parseWarnings.filter((w) => w.severity === "autocorrected");
  const silencedWarnings = parseWarnings.filter((w) => w.severity === "silenced");
  const infoWarnings = parseWarnings.filter((w) => w.severity === "info");
  // Filas con fecha de otro mes: bloquean igual que un warning del
  // parser. Se acumulan una copia por importación (ver
  // lib/filas-fuera-del-mes.ts), así que no se pueden dejar pasar.
  const fueraDelMes = preview.fechasFueraDelMes;
  const hasBlocking = blockingWarnings.length > 0 || fueraDelMes !== null;

  return (
    <div className="space-y-4 text-sm">
      {/* Va PRIMERO, antes que cualquier otro dato: si el Excel tiene
          fechas de otro mes, todo lo que sigue está descuadrado. */}
      {fueraDelMes && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3">
          <div className="font-semibold text-red-900 mb-1">
            ⚠ Hay fechas de otro mes en esta pestaña — no se puede importar
          </div>
          <p className="text-xs text-red-800 mb-2">
            {mensajeFechasFueraDelMes(fueraDelMes)}
          </p>
          <div className="max-h-40 overflow-y-auto rounded border border-red-200 bg-white">
            <table className="w-full text-[11px]">
              <thead className="bg-red-100/60 text-red-900">
                <tr>
                  <th className="text-left px-2 py-1">Fila</th>
                  <th className="text-left px-2 py-1">Fecha</th>
                  <th className="text-left px-2 py-1">Concepto</th>
                  <th className="text-right px-2 py-1">Monto</th>
                </tr>
              </thead>
              <tbody>
                {fueraDelMes.filas.map((f) => (
                  <tr key={`${f.excelRow}-${f.fecha}-${f.monto}`} className="border-t border-red-100">
                    <td className="px-2 py-1 text-gray-500">{f.excelRow}</td>
                    <td className="px-2 py-1 font-medium text-red-700">{f.fecha}</td>
                    <td className="px-2 py-1 text-gray-700">
                      {f.nota || f.categoria}
                    </td>
                    <td className="px-2 py-1 text-right font-medium">
                      {f.tipo === "expense" ? "−" : "+"}{formatCurrency(f.monto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Section icon="📅" title="Rango y archivo">
        <Row label="Archivo" value={preview.fileName} />
        {preview.ingGtosSheet && <Row label="Pestaña Ing&Gtos" value={preview.ingGtosSheet} />}
        {preview.controlVtasSheet && <Row label="Pestaña Control de VTAS" value={preview.controlVtasSheet} />}
        <Row label="Rango" value={
          preview.rangoUnificado.start && preview.rangoUnificado.end
            ? `${formatDate(preview.rangoUnificado.start)} → ${formatDate(preview.rangoUnificado.end)}`
            : "—"
        } />
      </Section>

      {parseWarnings.length > 0 && (
        <ParseWarningsSection
          autocorrected={autocorrectedWarnings}
          blocking={blockingWarnings}
          silenced={silencedWarnings}
          info={infoWarnings}
        />
      )}

      {p && p.saldoInicial.fechaCierre && (p.saldoInicial.efectivo !== null || p.saldoInicial.bcp !== null) && (
        <Section icon="📊" title="Saldo inicial detectado (Ing&Gtos)">
          <Row label={`Efectivo al ${formatDate(p.saldoInicial.fechaCierre)}`} value={formatCurrency(p.saldoInicial.efectivo ?? 0)} />
          <Row label={`BCP al ${formatDate(p.saldoInicial.fechaCierre)}`} value={formatCurrency(p.saldoInicial.bcp ?? 0)} />
          <label className="flex items-center gap-2 text-xs text-gray-700 mt-2 cursor-pointer">
            <input type="checkbox" checked={aplicarSaldoInicial} onChange={(e) => setAplicarSaldoInicial(e.target.checked)} />
            Aplicar como saldo inicial del sistema
          </label>
        </Section>
      )}

      {p && (
        <Section icon="📋" title="De Ing&Gtos: movimientos a importar">
          <Row label="Total" value={String(p.movimientos.length)} />
          <Row label="Ingresos / Egresos" value={`${p.ingresos} / ${p.egresos}`} />
          <Row label="Devoluciones" value={String(p.devoluciones)} />
          <Row label="Saldos finales (calculados)" value={`Ef ${formatCurrency(p.totales.saldoFinalEfectivo)} · BCP ${formatCurrency(p.totales.saldoFinalBcp)}`} />

          {/* El saldo REAL del banco que anotó Kelly. Se busca por
              encabezado y por el saldo que lo acompaña, no por celda fija
              (pedido de Jahnn, 17-ago-2026: "no necesariamente el importe
              del banco va a estar siempre en el mismo número de celda"). */}
          {p.saldoBancoReal ? (
            <>
              <Row
                label="Saldo real del banco (del Excel)"
                value={`${formatCurrency(p.saldoBancoReal.valor)}  ·  fila ${p.saldoBancoReal.fila}`}
              />
              <p
                className={`text-[11px] mt-1 ${
                  Math.abs(p.saldoBancoReal.diferencia) < 0.01 ? "text-emerald-700" : "text-amber-700"
                }`}
              >
                {Math.abs(p.saldoBancoReal.diferencia) < 0.01
                  ? "✓ Cuadra exacto con el libro de Kelly."
                  : `⚠ El libro de Kelly da ${formatCurrency(p.saldoBancoReal.saldoLibro)}: le falta cuadrar ${formatCurrency(Math.abs(p.saldoBancoReal.diferencia))} contra su banco.`}
                {p.saldoBancoReal.lecturasEncontradas > 1 &&
                  ` La columna traía ${p.saldoBancoReal.lecturasEncontradas} lecturas (las otras son de meses anteriores).`}
              </p>
            </>
          ) : (
            p.saldoBancoMotivo && (
              <p className="text-[11px] text-amber-700 mt-1">⚠ Saldo del banco: {p.saldoBancoMotivo}</p>
            )
          )}
        </Section>
      )}

      {cv && (
        <Section icon="☕" title="De Control de VTAS: 3 capas">
          <Row label="Días de ventas Byte" value={String(cv.ventasDiarias.length)} />
          <Row label="Total ventas (Ef + Yape + POS)" value={formatCurrency(cvTotalVentas)} />
          <Row label="Propinas detectadas" value={`${cv.propinas.length} · ${formatCurrency(cvTotalPropinas)}`} />
          <Row label="Alertas de redondeo" value={String(cv.alertasRedondeo.length)} />

          {/* Fechas que Kelly escribió con el mes del mes anterior. Se
              corrigen solo cuando el día de la semana lo prueba (pedido
              de Jahnn, 17-ago-2026). Antes se descartaban en silencio y
              esos días simplemente no entraban. */}
          {cv.fechasCorregidas.length > 0 && (
            <div className="mt-2 text-[11px] text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-2">
              📅 <strong>{cv.fechasCorregidas.length} fechas corregidas</strong> al mes de la pestaña.
              Kelly escribió el mes anterior, pero el día de la semana que puso confirma cuál era el
              bueno.
              <div className="mt-1 text-blue-700/90">
                {cv.fechasCorregidas.slice(0, 3).map((f) => `${f.original} → ${f.fecha}`).join(" · ")}
                {cv.fechasCorregidas.length > 3 && ` · y ${cv.fechasCorregidas.length - 3} más`}
              </div>
            </div>
          )}
          {(preview.byteSalesDailyEnRango > 0 || preview.tipsPendingEnRango > 0 || preview.roundingAlertsEnRango > 0) && (
            <p className="text-[11px] text-amber-700 mt-2">
              ⚠ Existen registros previos en el rango ({preview.byteSalesDailyEnRango} ventas Byte, {preview.tipsPendingEnRango} propinas pending, {preview.roundingAlertsEnRango} alertas pending) que serán reemplazados.
            </p>
          )}
        </Section>
      )}

      {p && preview.categoriasNuevas.length > 0 && (
        <Section icon="🏷️" title={`Categorías nuevas a crear: ${preview.categoriasNuevas.length}`}>
          <div className="text-xs text-gray-600 mb-2 break-words">
            {preview.categoriasNuevas.join(", ")}
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
            <input type="checkbox" checked={crearCategoriasNuevas} onChange={(e) => setCrearCategoriasNuevas(e.target.checked)} />
            Crear automáticamente
          </label>
        </Section>
      )}

      {p && totalManuales > 0 && (
        <Section icon="⚠️" title={`En ${negocioLabel}, movimientos manuales del rango`} variant="warning">
          <Row label="Ingresos" value={String(preview.manualesEnRango.ingresos)} />
          <Row label="Egresos" value={String(preview.manualesEnRango.egresos)} />
          <label className="flex items-center gap-2 text-xs text-gray-700 mt-2 cursor-pointer">
            <input type="checkbox" checked={archivarManualesExistentes} onChange={(e) => setArchivarManualesExistentes(e.target.checked)} />
            Archivar y reemplazar con Excel
          </label>
        </Section>
      )}

      <Section icon="🛡️" title="Otros negocios NO afectados" variant="success">
        {otrosNegocios.map((s) => (
          <Row
            key={s.code}
            label={s.code.charAt(0).toUpperCase() + s.code.slice(1)}
            value={`BCP ${formatCurrency(s.bcp)} · Efectivo ${formatCurrency(s.cash)}`}
          />
        ))}
        <p className="text-[11px] text-gray-500 mt-2">
          Estos saldos serán verificados POST-import. Si cambian → rollback automático.
        </p>
      </Section>

      <div className="flex gap-2 justify-end pt-2 border-t border-gray-100 -mx-6 px-6 -mb-6 pb-6 sticky bottom-0 bg-white">
        <button onClick={onBack} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">
          Atrás
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">
          Cancelar
        </button>
        <button
          onClick={onContinue}
          disabled={hasBlocking}
          title={
            fueraDelMes
              ? "Hay filas con fecha de otro mes. Corrige las fechas en el Excel antes de importar."
              : hasBlocking
                ? "Hay filas bloqueantes que el parser no puede autocorregir. Pídele a Kelly que arregle el Excel antes de importar."
                : undefined
          }
          className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Importar
        </button>
      </div>
    </div>
  );
}

function ConfirmStep({
  preview, negocioLabel, archivar, onBack, onCancel, onConfirm, pending,
}: {
  preview: ImportPreview;
  negocioLabel: string;
  archivar: boolean;
  onBack: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  const otros = Object.values(preview.saldosAntes)
    .filter((s) => s.code.toLowerCase() !== negocioLabel.toLowerCase())
    .map((s) => s.code.charAt(0).toUpperCase() + s.code.slice(1))
    .join(" y ");
  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-semibold text-amber-900 mb-1">Confirmar importación</h4>
          <p className="text-xs text-amber-800">
            Solo <strong>{negocioLabel}</strong> será modificado. <strong>{otros}</strong> intactos.
          </p>
          {archivar && preview.parseResult && (
            <p className="text-xs text-amber-800 mt-2">
              Se archivarán {preview.manualesEnRango.ingresos + preview.manualesEnRango.egresos} movimientos manuales del rango (recuperables).
            </p>
          )}
          {preview.protegidosEnRango !== undefined &&
            preview.protegidosEnRango.ingresos + preview.protegidosEnRango.egresos > 0 && (
            <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5 mt-2 flex items-start gap-1.5">
              <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                <strong>{preview.protegidosEnRango.ingresos + preview.protegidosEnRango.egresos} registros especiales protegidos</strong>{" "}
                (clientes B2B, préstamos socio, compartidos, clasificaciones): NO se archivan ni se
                reemplazan — el Excel no sabe expresarlos. Siguen intactos después del import.
              </span>
            </p>
          )}
          {preview.parseResult && (
            <p className="text-xs text-amber-800 mt-2">
              Se importarán <strong>{preview.parseResult.movimientos.length}</strong> movimientos de Ing&Gtos.
            </p>
          )}
          {preview.controlVtasResult && (
            <p className="text-xs text-amber-800 mt-2">
              Se importarán <strong>{preview.controlVtasResult.ventasDiarias.length}</strong> días de ventas Byte,
              <strong> {preview.controlVtasResult.propinas.length}</strong> propinas y
              <strong> {preview.controlVtasResult.alertasRedondeo.length}</strong> alertas de redondeo.
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <button onClick={onBack} disabled={pending} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-50">
          Atrás
        </button>
        <button onClick={onCancel} disabled={pending} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-50">
          Cancelar
        </button>
        <button onClick={onConfirm} disabled={pending} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 inline-flex items-center gap-2">
          {pending ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Importando...</>
          ) : (
            "Sí, continuar"
          )}
        </button>
      </div>
    </div>
  );
}

function ResultStep({
  result, onClose,
}: {
  result: Extract<ImportResult, { success: true }>;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-semibold text-emerald-900 mb-1">Importación completada</h4>
          <p className="text-xs text-emerald-800">
            {result.movementsCount} movimientos importados, {result.archivedCount} manuales archivados.
          </p>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Shield className="w-3 h-3" />
          Cross-check de aislamiento ✓ (saldos de otros negocios verificados)
        </div>
        <div className="bg-gray-50 rounded-lg p-3 space-y-1">
          {Object.values(result.saldosDespues).map((s) => (
            <div key={s.code} className="flex items-baseline justify-between">
              <span className="text-gray-700 capitalize">{s.code}</span>
              <span className="text-gray-900 text-xs">
                BCP {formatCurrency(s.bcp)} · Efectivo {formatCurrency(s.cash)}
              </span>
            </div>
          ))}
        </div>
        <div className="text-[11px] text-gray-400">
          Batch ID: {result.batchId}
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">
          Cerrar
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Atomic UI helpers
// ─────────────────────────────────────────────────────────────────

function Section({
  icon, title, children, variant = "default",
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
  variant?: "default" | "warning" | "success";
}) {
  const cls =
    variant === "warning" ? "bg-amber-50/50 border-amber-200"
    : variant === "success" ? "bg-blue-50/40 border-blue-100"
    : "bg-gray-50 border-gray-200";
  return (
    <div className={`border rounded-lg p-3 ${cls}`}>
      <div className="text-xs font-semibold text-gray-700 mb-2">{icon} {title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between text-xs">
      <span className="text-gray-600">{label}</span>
      <span className="text-gray-900 font-medium">{value}</span>
    </div>
  );
}

// ParseWarning estructura — duplicada acá para evitar import circular
type ParseWarningRow = {
  rowNumber: number;
  date: string | null;
  amount: number;
  column: "ie" | "ic" | "ge" | "gc" | "mixed" | "none";
  description: string;
  reason:
    | "empty_type"
    | "type_mismatch"
    | "empty_date"
    | "balance_row"
    | "stale_forward_fill";
  originalType?: string | null;
  correctedType?: "I" | "G";
  originalDate?: null;
  correctedDate?: string;
  message?: string;
  severity: "autocorrected" | "blocking_error" | "silenced" | "info";
};

function ParseWarningsSection({
  autocorrected,
  blocking,
  silenced,
  info,
}: {
  autocorrected: ParseWarningRow[];
  blocking: ParseWarningRow[];
  silenced: ParseWarningRow[];
  info: ParseWarningRow[];
}) {
  // Agrupar por rowNumber para mostrar 1 fila aunque tenga múltiples
  // warnings (combo Caso A + Caso C, o Caso A + stale_forward_fill).
  const all = [...autocorrected, ...blocking, ...silenced, ...info];
  const grouped = new Map<number, ParseWarningRow[]>();
  for (const w of all) {
    if (!grouped.has(w.rowNumber)) grouped.set(w.rowNumber, []);
    grouped.get(w.rowNumber)!.push(w);
  }
  const rowsSorted = Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]);

  const headerCls = blocking.length > 0 ? "text-red-600" : "text-amber-600";
  const headerIcon = blocking.length > 0 ? "⛔" : "⚠️";

  // Resumen del header: counts por severity
  const counts: string[] = [];
  if (autocorrected.length) counts.push(`${autocorrected.length} autocorregidas`);
  if (blocking.length) counts.push(`${blocking.length} bloqueantes`);
  if (silenced.length) counts.push(`${silenced.length} silenciadas`);
  if (info.length) counts.push(`${info.length} para revisar`);

  return (
    <div className="border rounded-lg border-amber-200 bg-amber-50/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-amber-100">
        <div className={`text-sm font-semibold ${headerCls}`}>
          {headerIcon} Advertencias del parser ({counts.join(", ")})
        </div>
        {blocking.length > 0 && (
          <p className="text-xs text-red-700 mt-1">
            Hay errores que el parser no puede resolver. Pídele a Kelly que arregle estas filas antes de importar.
          </p>
        )}
        {info.length > 0 && (
          <p className="text-xs text-blue-700 mt-1">
            Hay {info.length} fila(s) marcadas para revisar — el parser las importa pero conviene verificar fechas o conceptos antes de confirmar.
          </p>
        )}
        <p className="text-[11px] text-gray-600 mt-1">
          El parser detecta: tipo vacío con monto en una sola columna (autocorregido),
          tipo que no coincide con la columna del monto (autocorregido),
          fecha vacía con monto/descripción (asignada al último día del mes),
          filas de saldo acumulado de meses anteriores (silenciadas),
          y filas con fecha forward-filled desfasada (info para revisar).
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-amber-100/40 text-gray-700">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Fila Excel</th>
              <th className="text-left px-3 py-2 font-medium">Fecha</th>
              <th className="text-left px-3 py-2 font-medium">Concepto</th>
              <th className="text-right px-3 py-2 font-medium">Monto</th>
              <th className="text-left px-3 py-2 font-medium">Problema</th>
              <th className="text-left px-3 py-2 font-medium">Acción del parser</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-100">
            {rowsSorted.map(([rn, wars]) => {
              const anyBlocking = wars.some((w) => w.severity === "blocking_error");
              const anySilenced = wars.some((w) => w.severity === "silenced");
              const anyInfo = wars.some((w) => w.severity === "info");
              const bg =
                anyBlocking ? "bg-red-50" :
                anySilenced ? "bg-gray-50" :
                anyInfo ? "bg-blue-50" :
                "bg-amber-50";
              const actionCls =
                anyBlocking ? "text-red-700" :
                anySilenced ? "text-gray-600" :
                anyInfo ? "text-blue-700" :
                "text-emerald-700";
              const w0 = wars[0];
              const fechaShow = w0.correctedDate ?? w0.date;
              const problemas = wars.map(describeProblem).join(" + ");
              const acciones = wars.map(describeAction).join(" + ");
              const tooltip = wars.map((w) => w.message).filter(Boolean).join("\n");
              return (
                <tr key={rn} className={bg} title={tooltip || undefined}>
                  <td className="px-3 py-2 font-medium text-gray-900">R{rn}</td>
                  <td className="px-3 py-2">{fechaShow ? formatDate(fechaShow) : "—"}</td>
                  <td className="px-3 py-2 text-gray-700 max-w-[20rem] truncate" title={w0.description}>
                    {w0.description || "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {formatCurrency(w0.amount)}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{problemas}</td>
                  <td className={`px-3 py-2 ${actionCls}`}>
                    {acciones}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function describeProblem(w: ParseWarningRow): string {
  if (w.reason === "empty_type") {
    return w.severity === "blocking_error"
      ? "Tipo vacío + montos en columnas mixtas"
      : `Tipo vacío con monto en columna ${columnLabel(w.column)}`;
  }
  if (w.reason === "type_mismatch") {
    return w.severity === "blocking_error"
      ? `Tipo='${w.originalType}' + montos contradictorios en ambos lados`
      : `Tipo='${w.originalType}' pero monto en columna de ${w.correctedType === "G" ? "egreso" : "ingreso"}`;
  }
  if (w.reason === "balance_row") {
    return "Fila de saldo acumulado de meses anteriores";
  }
  if (w.reason === "stale_forward_fill") {
    return "Fecha heredada por forward-fill — posiblemente desfasada";
  }
  return "Fecha vacía";
}

function describeAction(w: ParseWarningRow): string {
  if (w.severity === "blocking_error") return "❌ NO importable";
  if (w.severity === "silenced") return "⏸ Silenciada (no se importa)";
  if (w.severity === "info") return "👁 Importada — revisar fecha";
  if (w.reason === "empty_type") {
    return `✅ Tratado como ${w.correctedType === "G" ? "egreso (G)" : "ingreso (I)"}`;
  }
  if (w.reason === "type_mismatch") {
    return `✅ Corregido a ${w.correctedType === "G" ? "egreso" : "ingreso"}`;
  }
  return `✅ Fecha asignada al último día del mes`;
}

function columnLabel(c: ParseWarningRow["column"]): string {
  switch (c) {
    case "ie": return "ingreso efectivo";
    case "ic": return "ingreso cuenta";
    case "ge": return "egreso efectivo";
    case "gc": return "egreso cuenta";
    case "mixed": return "mixta";
    case "none": return "—";
  }
}

// ═══════════════════════════════════════════════════════════════════
// Paso MULTI-MES: selección de meses + idempotencia (Reemplazar/Saltar)
// ═══════════════════════════════════════════════════════════════════

function MonthsStep({
  negocioLabel,
  monthPairs,
  selectedMonths,
  setSelectedMonths,
  loadStatus,
  monthActions,
  setMonthActions,
  aplicarSaldoInicial,
  setAplicarSaldoInicial,
  archivarManualesExistentes,
  setArchivarManualesExistentes,
  crearCategoriasNuevas,
  setCrearCategoriasNuevas,
  onBack,
  onExecute,
  pending,
}: {
  negocioLabel: string;
  monthPairs: MonthPair[];
  selectedMonths: Set<string>;
  setSelectedMonths: (s: Set<string>) => void;
  loadStatus: Record<string, MonthLoadDetection>;
  monthActions: Record<string, "import" | "skip">;
  setMonthActions: (r: Record<string, "import" | "skip">) => void;
  aplicarSaldoInicial: boolean;
  setAplicarSaldoInicial: (b: boolean) => void;
  archivarManualesExistentes: boolean;
  setArchivarManualesExistentes: (b: boolean) => void;
  crearCategoriasNuevas: boolean;
  setCrearCategoriasNuevas: (b: boolean) => void;
  onBack: () => void;
  onExecute: () => void;
  pending: boolean;
}) {
  function toggleMonth(key: string) {
    const next = new Set(selectedMonths);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedMonths(next);
  }
  function setAction(key: string, action: "import" | "skip") {
    setMonthActions({ ...monthActions, [key]: action });
  }

  const incomplete = monthPairs.filter((m) => m.status !== "complete" && selectedMonths.has(m.monthKey));
  // Cuántos meses realmente se importarán (incluidos + nuevos, o cargados con Reemplazar)
  const willImport = monthPairs.filter((m) => {
    if (!selectedMonths.has(m.monthKey)) return false;
    const loaded = loadStatus[m.monthKey]?.loaded ?? false;
    return loaded ? (monthActions[m.monthKey] ?? "skip") === "import" : true;
  }).length;

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-gray-900">Elige los meses a importar · {negocioLabel}</h4>
        <p className="text-xs text-gray-500 mt-1">
          Cada mes incluye su par <strong>Ing&amp;Gtos</strong> + <strong>Control de VTAS</strong>. Los meses ya cargados
          se marcan abajo: elige <strong>Reemplazar</strong> o <strong>Saltar</strong> antes de continuar.
        </p>
      </div>

      {incomplete.length > 0 && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            {incomplete.length} mes(es) seleccionado(s) tienen solo una pestaña (falta Ing&amp;Gtos o Control de VTAS).
            Se importará solo el lado disponible.
          </span>
        </div>
      )}

      <div className="space-y-2">
        {monthPairs.map((m) => {
          const sel = selectedMonths.has(m.monthKey);
          const det = loadStatus[m.monthKey];
          const loaded = det?.loaded ?? false;
          const action = monthActions[m.monthKey] ?? "skip";
          return (
            <div key={m.monthKey} className={`border rounded-lg p-3 ${sel ? "border-emerald-200 bg-emerald-50/40" : "border-gray-200"}`}>
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={sel} onChange={() => toggleMonth(m.monthKey)} className="mt-1" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">{monthKeyLabel(m.monthKey)}</span>
                    {m.status === "complete" ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">par completo</span>
                    ) : m.status === "only-inggtos" ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">solo Ing&amp;Gtos</span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">solo Control de VTAS</span>
                    )}
                    {loaded && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                        ya cargado: {det.total} registros
                      </span>
                    )}
                    {!loaded && det && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">nuevo</span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5 truncate">
                    {m.ingGtosSheet ?? "—"} · {m.controlVtasSheet ?? "—"}
                  </div>
                  {loaded && (
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      {det.ingresos} ingresos · {det.egresos} egresos · {det.byteSales} días Byte
                    </div>
                  )}

                  {sel && loaded && (
                    <div className="flex items-center gap-3 mt-2">
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="radio" name={`act-${m.monthKey}`} checked={action === "import"} onChange={() => setAction(m.monthKey, "import")} />
                        <span className="text-red-700 font-medium">Reemplazar</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="radio" name={`act-${m.monthKey}`} checked={action === "skip"} onChange={() => setAction(m.monthKey, "skip")} />
                        <span className="text-gray-700">Saltar</span>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {monthPairs.length === 0 && (
          <p className="text-sm text-gray-500">No se detectaron meses en el archivo.</p>
        )}
      </div>

      {/* Opciones */}
      <div className="border-t border-gray-100 pt-3 space-y-2">
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={archivarManualesExistentes} onChange={(e) => setArchivarManualesExistentes(e.target.checked)} />
          <span>Archivar movimientos manuales del mismo mes (recuperables)</span>
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={crearCategoriasNuevas} onChange={(e) => setCrearCategoriasNuevas(e.target.checked)} />
          <span>Crear categorías de egreso nuevas</span>
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={aplicarSaldoInicial} onChange={(e) => setAplicarSaldoInicial(e.target.checked)} />
          <span>Aplicar saldo inicial del Excel (si lo trae)</span>
        </label>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        <button onClick={onBack} disabled={pending} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50">
          Atrás
        </button>
        <button onClick={onExecute} disabled={pending || willImport === 0}
          className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 inline-flex items-center gap-2 disabled:opacity-50">
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Importar {willImport} mes{willImport === 1 ? "" : "es"}
        </button>
      </div>
    </div>
  );
}

function MultiResultStep({ result, onClose }: { result: MultiMonthResult; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
        <h4 className="text-sm font-semibold text-gray-900">
          Importación terminada — {result.importedMonths} importado(s), {result.skippedMonths} saltado(s)
          {result.errorMonths > 0 ? `, ${result.errorMonths} con error` : ""}
        </h4>
      </div>
      <div className="space-y-1.5">
        {result.perMonth.map((p) => (
          <div key={p.monthKey} className="flex items-center justify-between text-xs border border-gray-100 rounded-lg px-3 py-2">
            <span className="font-medium text-gray-800">{monthKeyLabel(p.monthKey)}</span>
            {p.status === "imported" && (
              <span className="text-emerald-700">✓ {p.movementsCount ?? 0} movimientos · {p.byteSalesDays ?? 0} días Byte</span>
            )}
            {p.status === "skipped" && <span className="text-gray-500">Saltado</span>}
            {p.status === "error" && <span className="text-red-600">Error: {p.error}</span>}
          </div>
        ))}
      </div>
      <div className="flex justify-end pt-2">
        <button onClick={onClose} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-light">
          Cerrar
        </button>
      </div>
    </div>
  );
}
