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
  const [sheetCandidates, setSheetCandidates] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
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
    setSheetCandidates([]);
    setSelectedSheet("");
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
        if (r.candidatesIngGtos.length === 0) {
          setError("El archivo no contiene pestañas con formato 'Ing&Gtos'. ¿Es el formato correcto de Kelly?");
          return;
        }
        setSheetCandidates(r.candidatesIngGtos);
        if (r.candidatesIngGtos.length === 1) {
          // 1 sola pestaña: directo a preview
          setSelectedSheet(r.candidatesIngGtos[0]);
          await loadPreview(b64, file.name, r.candidatesIngGtos[0]);
        } else {
          // Default: la última (más reciente)
          setSelectedSheet(r.candidatesIngGtos[r.candidatesIngGtos.length - 1]);
          setStep("sheets");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al leer archivo");
      }
    });
  }

  async function loadPreview(b64: string, fName: string, sheet: string) {
    setError(null);
    const p = await previewExcelImport(b64, fName, sheet);
    if ("error" in p) {
      setError(p.error);
      return;
    }
    setPreview(p);
    setStep("preview");
  }

  function handleSheetSelected() {
    if (!fileBase64 || !selectedSheet) return;
    startTransition(async () => {
      await loadPreview(fileBase64, fileName, selectedSheet);
    });
  }

  function handleExecute() {
    if (!fileBase64 || !selectedSheet) return;
    setError(null);
    startTransition(async () => {
      const r = await executeExcelImport(fileBase64, fileName, selectedSheet, {
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
              candidates={sheetCandidates}
              selected={selectedSheet}
              onSelect={setSelectedSheet}
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
              onBack={() => setStep(sheetCandidates.length > 1 ? "sheets" : "select")}
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
  return (
    <div className="space-y-3">
      <label className={`block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${pending ? "opacity-50 cursor-wait" : "border-gray-300 hover:border-emerald-400 hover:bg-emerald-50/30"}`}>
        <input
          type="file"
          accept=".xlsx"
          className="hidden"
          disabled={pending}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        {pending ? (
          <div className="flex items-center justify-center gap-2 text-gray-600 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Procesando archivo...
          </div>
        ) : (
          <>
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <div className="text-sm font-medium text-gray-700">
              Click o arrastra el archivo .xlsx aquí
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Formato esperado: Excel de Kelly (pestaña Ing&Gtos)
            </div>
          </>
        )}
      </label>
    </div>
  );
}

function SheetsStep({
  candidates, selected, onSelect, onContinue, onBack, pending,
}: {
  candidates: string[];
  selected: string;
  onSelect: (s: string) => void;
  onContinue: () => void;
  onBack: () => void;
  pending: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-2">Selecciona la pestaña a importar</h4>
        <p className="text-xs text-gray-500">Detectamos varias pestañas Ing&Gtos. Default: la más reciente.</p>
      </div>
      <div className="space-y-2">
        {candidates.map((s) => (
          <label key={s} className={`flex items-center gap-3 px-3 py-2.5 border rounded-lg cursor-pointer transition-colors ${selected === s ? "border-emerald-400 bg-emerald-50/50" : "border-gray-200 hover:bg-gray-50"}`}>
            <input
              type="radio"
              checked={selected === s}
              onChange={() => onSelect(s)}
              className="text-emerald-600"
            />
            <span className="text-sm font-medium text-gray-900">{s}</span>
          </label>
        ))}
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <button onClick={onBack} disabled={pending} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-50">
          Atrás
        </button>
        <button onClick={onContinue} disabled={pending} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 inline-flex items-center gap-2">
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
  const totalManuales = preview.manualesEnRango.ingresos + preview.manualesEnRango.egresos;
  const otrosNegocios = Object.values(preview.saldosAntes).filter(
    (s) => s.code.toLowerCase() !== negocioLabel.toLowerCase()
  );

  return (
    <div className="space-y-4 text-sm">
      <Section icon="📅" title="Rango y archivo">
        <Row label="Archivo" value={preview.fileName} />
        <Row label="Pestaña" value={preview.sheetName} />
        <Row label="Rango" value={`${formatDate(p.rangoFechas.start ?? "")} → ${formatDate(p.rangoFechas.end ?? "")}`} />
      </Section>

      {p.saldoInicial.fechaCierre && (p.saldoInicial.efectivo !== null || p.saldoInicial.bcp !== null) && (
        <Section icon="📊" title="Saldo inicial detectado">
          <Row label={`Efectivo al ${formatDate(p.saldoInicial.fechaCierre)}`} value={formatCurrency(p.saldoInicial.efectivo ?? 0)} />
          <Row label={`BCP al ${formatDate(p.saldoInicial.fechaCierre)}`} value={formatCurrency(p.saldoInicial.bcp ?? 0)} />
          <label className="flex items-center gap-2 text-xs text-gray-700 mt-2 cursor-pointer">
            <input type="checkbox" checked={aplicarSaldoInicial} onChange={(e) => setAplicarSaldoInicial(e.target.checked)} />
            Aplicar como saldo inicial del sistema
          </label>
        </Section>
      )}

      <Section icon="📋" title="Movimientos a importar">
        <Row label="Total" value={String(p.movimientos.length)} />
        <Row label="Ingresos / Egresos" value={`${p.ingresos} / ${p.egresos}`} />
        <Row label="Devoluciones" value={String(p.devoluciones)} />
        <Row label="Ventas Byte" value={String(p.ventasByte)} />
      </Section>

      <Section icon="💰" title="Saldos finales calculados">
        <Row label="Efectivo" value={formatCurrency(p.totales.saldoFinalEfectivo)} />
        <Row label="BCP" value={formatCurrency(p.totales.saldoFinalBcp)} />
      </Section>

      {preview.categoriasNuevas.length > 0 && (
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

      {totalManuales > 0 && (
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
          {archivar && (
            <p className="text-xs text-amber-800 mt-2">
              Se archivarán {preview.manualesEnRango.ingresos + preview.manualesEnRango.egresos} movimientos manuales del rango (recuperables).
            </p>
          )}
          <p className="text-xs text-amber-800 mt-2">
            Se importarán <strong>{preview.parseResult.movimientos.length}</strong> movimientos.
          </p>
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
