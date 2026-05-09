"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Upload, X, AlertTriangle, CheckCircle2, Loader2, Shield } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  listExcelSheets,
  previewExcelImport,
  executeExcelImport,
  type ImportPreview,
  type ImportResult,
} from "@/app/actions/excel-import";

type Step = "select" | "sheets" | "preview" | "confirm" | "result";

export function ExcelImportModal({
  negocio,
  open,
  onClose,
}: {
  negocio: string;
  open: boolean;
  onClose: () => void;
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

        // Defaults: la pestaña más reciente de cada tipo (última del array)
        const defaultIngGtos = r.candidatesIngGtos[r.candidatesIngGtos.length - 1] ?? null;
        const defaultControlVtas = r.candidatesControlVtas[r.candidatesControlVtas.length - 1] ?? null;
        setSelectedIngGtos(defaultIngGtos);
        setSelectedControlVtas(defaultControlVtas);
        setStep("sheets");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al leer archivo");
      }
    });
  }

  async function loadPreview(b64: string, fName: string, ingGtos: string | null, controlVtas: string | null) {
    setError(null);
    const p = await previewExcelImport(b64, fName, ingGtos, controlVtas);
    if ("error" in p) {
      setError(p.error);
      return;
    }
    setPreview(p);
    setStep("preview");
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
      const r = await executeExcelImport(fileBase64, fileName, selectedIngGtos, selectedControlVtas, {
        aplicarSaldoInicial,
        archivarManualesExistentes,
        crearCategoriasNuevas,
      });
      if (!r.success) {
        setError(r.error);
        return;
      }
      setResult(r);
      setStep("result");
      router.refresh();
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

  return (
    <div className="space-y-4 text-sm">
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
        </Section>
      )}

      {cv && (
        <Section icon="☕" title="De Control de VTAS: 3 capas">
          <Row label="Días de ventas Byte" value={String(cv.ventasDiarias.length)} />
          <Row label="Total ventas (Ef + Yape + POS)" value={formatCurrency(cvTotalVentas)} />
          <Row label="Propinas detectadas" value={`${cv.propinas.length} · ${formatCurrency(cvTotalPropinas)}`} />
          <Row label="Alertas de redondeo" value={String(cv.alertasRedondeo.length)} />
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
        <button onClick={onContinue} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">
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
