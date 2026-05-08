"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Settings2, Save, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { updateBusinessInitialConfig, type BusinessInitialConfig } from "@/app/actions/business-config";

/**
 * Sección "Configuración inicial del sistema" — Fonavi y Centro.
 * NO disponible para Atelier (la página padre la oculta por
 * `negocio !== "atelier"`, y el server action tiene guard adicional 403).
 */
export function InitialConfigSection({ initial }: { initial: BusinessInitialConfig }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [systemStartDate, setSystemStartDate] = useState(initial.systemStartDate ?? "2026-04-01");
  const [bcp, setBcp] = useState(String(initial.initialBcpBalance));
  const [cash, setCash] = useState(String(initial.initialCashBalance));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setError(null);
    setSaved(false);
    const bcpNum = parseFloat(bcp);
    const cashNum = parseFloat(cash);
    if (!Number.isFinite(bcpNum) || !Number.isFinite(cashNum)) {
      setError("Saldos inválidos");
      return;
    }
    if (!systemStartDate) {
      setError("La fecha de inicio es obligatoria");
      return;
    }
    startTransition(async () => {
      const r = await updateBusinessInitialConfig({
        systemStartDate,
        initialBcpBalance: bcpNum,
        initialCashBalance: cashNum,
      });
      if (!r.success) {
        setError(r.error);
        return;
      }
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2500);
    });
  }

  // Cierre = día anterior al inicio
  const cierre = (() => {
    if (!systemStartDate) return "";
    const d = new Date(systemStartDate + "T12:00:00");
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
          <Settings2 className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Configuración inicial del sistema
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Define la fecha desde la que este negocio empieza a operar en el sistema y los
            saldos de cierre del día anterior. Los movimientos previos a esta fecha
            quedan archivados (no se borran).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Fecha de inicio del sistema
          </label>
          <input
            type="date"
            value={systemStartDate}
            onChange={(e) => setSystemStartDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          {cierre && (
            <p className="text-[11px] text-gray-400 mt-1">
              Saldos al cierre del {cierre}
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Saldo BCP al cierre
          </label>
          <input
            type="number" step="0.01"
            value={bcp}
            onChange={(e) => setBcp(e.target.value)}
            placeholder="0.00"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <p className="text-[11px] text-gray-400 mt-1">
            Actual: {formatCurrency(initial.initialBcpBalance)}
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Saldo Efectivo al cierre
          </label>
          <input
            type="number" step="0.01"
            value={cash}
            onChange={(e) => setCash(e.target.value)}
            placeholder="0.00"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <p className="text-[11px] text-gray-400 mt-1">
            Actual: {formatCurrency(initial.initialCashBalance)}
          </p>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-sm text-emerald-700">✓ Guardado</span>}
        <button
          onClick={handleSave}
          disabled={pending}
          className="bg-primary text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {pending ? "Guardando..." : "Guardar configuración inicial"}
        </button>
      </div>
    </div>
  );
}
