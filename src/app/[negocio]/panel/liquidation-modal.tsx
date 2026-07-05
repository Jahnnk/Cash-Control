"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Lock, Unlock, FileDown, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/components/toast-provider";
import {
  getLiquidation,
  closeLiquidation,
  reopenLiquidation,
  type StoredLiquidation,
} from "@/app/actions/liquidations";
import type { LiquidationResult } from "@/lib/incentives/engine";

const JORNADA: Record<string, string> = {
  tiempo_completo: "Tiempo completo",
  medio_turno: "Medio turno",
  administrador: "Administrador",
};

/**
 * Liquidación del mes — SOLO dirección. Vista previa con candados,
 * selección del mejor vendedor, cierre (congela el acta) y PDF para
 * imprimir con línea de firma por persona.
 */
export function LiquidationModal({
  sede,
  month,
  monthLabel,
  onClose,
}: {
  sede: string;
  month: string;
  monthLabel: string;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState<StoredLiquidation | null>(null);
  const [preview, setPreview] = useState<LiquidationResult | null>(null);
  const [salonStaff, setSalonStaff] = useState<string[]>([]);
  const [mejorVendedor, setMejorVendedor] = useState("");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mv: string) => {
    setLoading(true);
    const r = await getLiquidation(month, mv || null);
    if (r.ok) {
      setClosed(r.closed);
      setPreview(r.preview);
      setSalonStaff(r.salonStaff);
      setError(null);
    } else setError(r.error);
    setLoading(false);
  }, [month]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    load("");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load]);

  async function handleClose() {
    setBusy(true);
    const r = await closeLiquidation({ month, mejorVendedor: mejorVendedor || null, notas: notas || null });
    setBusy(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast("Mes cerrado — el acta quedó congelada", "success");
    await load(mejorVendedor);
  }

  async function handleReopen() {
    setBusy(true);
    const r = await reopenLiquidation(month);
    setBusy(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast("Mes reabierto", "success");
    await load(mejorVendedor);
  }

  async function handlePdf(result: LiquidationResult, mv: string | null, nt: string | null, closedAt: string | null) {
    const { renderLiquidationPdf } = await import("@/lib/incentives/liquidation-pdf");
    const { blob, filename } = renderLiquidationPdf({ sede, monthLabel, result, mejorVendedor: mv, notas: nt, closedAt });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const r = closed?.result ?? preview;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            {closed ? <Lock className="w-5 h-5 text-emerald-600" /> : <Unlock className="w-5 h-5 text-primary" />}
            Liquidación · {monthLabel} {closed && <span className="text-xs font-normal text-emerald-700">(cerrada el {closed.closedAt.slice(0, 10)})</span>}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-500">Calculando…</div>
          ) : error ? (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          ) : r && (
            <>
              {/* Resultado del mes */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <div className="bg-gray-50 rounded-lg px-3 py-2">
                  <div className="text-[11px] text-gray-500">Ticket final</div>
                  <div className="font-bold">{r.ticketFinal !== null ? formatCurrency(r.ticketFinal) : "—"}</div>
                  <div className="text-[10px] text-gray-400">base {formatCurrency(r.ticketBase)}</div>
                </div>
                <div className="bg-gray-50 rounded-lg px-3 py-2">
                  <div className="text-[11px] text-gray-500">Nivel oficial</div>
                  <div className={`font-bold ${r.nivel ? "text-emerald-600" : "text-red-600"}`}>{r.nivel?.nombre ?? "Sin nivel"}</div>
                </div>
                <div className="bg-gray-50 rounded-lg px-3 py-2">
                  <div className="text-[11px] text-gray-500">Piso de tráfico</div>
                  <div className={`font-bold ${r.trafficOk ? "text-emerald-600" : "text-red-600"}`}>{r.trafficOk ? "Cumplido" : "Incumplido"}</div>
                  <div className="text-[10px] text-gray-400">{r.personasPorDia ?? "—"} personas/día</div>
                </div>
                <div className="bg-gray-50 rounded-lg px-3 py-2">
                  <div className="text-[11px] text-gray-500">Total a pagar</div>
                  <div className="font-bold">{formatCurrency(r.totalBonos)}</div>
                  {r.pozo !== null && <div className="text-[10px] text-gray-400">pozo {formatCurrency(r.pozo)}</div>}
                </div>
              </div>

              {/* Candados y avisos */}
              {r.blockers.map((b) => (
                <div key={b} className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {b}
                </div>
              ))}
              {r.warnings.map((wtext) => (
                <div key={wtext} className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {wtext}
                </div>
              ))}

              {/* Tabla de pago */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase text-gray-500 bg-gray-50">
                      <th className="text-left px-3 py-2 font-medium">Colaborador</th>
                      <th className="text-left px-3 py-2 font-medium">Jornada</th>
                      <th className="text-right px-3 py-2 font-medium">Bono</th>
                      <th className="text-right px-3 py-2 font-medium">Premio MV</th>
                      <th className="text-right px-3 py-2 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.lines.map((l) => (
                      <tr key={l.name} className="border-t border-gray-50">
                        <td className="px-3 py-1.5 font-medium text-gray-900">{l.name}</td>
                        <td className="px-3 py-1.5 text-gray-600">{JORNADA[l.jornada]}</td>
                        <td className="px-3 py-1.5 text-right">{formatCurrency(l.bono)}</td>
                        <td className="px-3 py-1.5 text-right">{l.premioMv > 0 ? formatCurrency(l.premioMv) : "—"}</td>
                        <td className="px-3 py-1.5 text-right font-semibold">{formatCurrency(Math.round((l.bono + l.premioMv) * 100) / 100)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                      <td className="px-3 py-2" colSpan={4}>TOTAL</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(r.totalBonos)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Cierre (solo si no está cerrada) */}
              {!closed && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">
                      Mejor vendedor del mes (opcional — usa el ranking como referencia)
                    </label>
                    <select
                      value={mejorVendedor}
                      onChange={(e) => { setMejorVendedor(e.target.value); load(e.target.value); }}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white"
                    >
                      <option value="">Sin asignar (el premio no se paga)</option>
                      {salonStaff.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Notas del cierre (opcional)</label>
                    <input
                      type="text"
                      value={notas}
                      onChange={(e) => setNotas(e.target.value)}
                      placeholder="ej. observación del día 10 resuelta con el verificador"
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
                      maxLength={300}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex flex-wrap justify-end gap-2 sticky bottom-0 bg-white">
          {r && (
            <button
              onClick={() => handlePdf(r, closed?.mejorVendedor ?? (mejorVendedor || null), closed?.notas ?? (notas || null), closed?.closedAt ?? null)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-primary border border-primary/30 bg-primary/5 hover:bg-primary hover:text-white rounded-lg transition-colors"
            >
              <FileDown className="w-4 h-4" /> {closed ? "Acta PDF" : "Borrador PDF"}
            </button>
          )}
          {closed ? (
            <button
              onClick={handleReopen}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-amber-700 border border-amber-300 bg-white hover:bg-amber-50 rounded-lg disabled:opacity-50"
            >
              <Unlock className="w-4 h-4" /> Reabrir mes
            </button>
          ) : (
            <button
              onClick={handleClose}
              disabled={busy || loading || !r || r.blockers.length > 0}
              title={r && r.blockers.length > 0 ? "Resuelve los pendientes en rojo primero" : "Congela el resultado del mes"}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-light rounded-lg disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Cerrar el mes
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
