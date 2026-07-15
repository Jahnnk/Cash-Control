"use client";

import { useEffect, useState } from "react";
import { Settings2, X, Loader2 } from "lucide-react";
import { formatCurrency, monthLabel } from "@/lib/utils";
import { getBaseEditor, saveIncentiveBase, type BaseEditorData } from "@/app/actions/incentives";
import { useToast } from "@/components/toast-provider";

/**
 * Base del programa de incentivos.
 *
 * La base es el punto de partida: cada nivel es base + delta. Moverla
 * mueve TODAS las metas a la vez, por eso el modal muestra en vivo cómo
 * quedan y desde qué mes rige (los meses anteriores no se re-miden).
 * Solo dirección — el bono del admin depende de este número.
 */
export function BaseModal({
  month,
  onClose,
  onSaved,
}: {
  month: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<BaseEditorData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [effectiveMonth, setEffectiveMonth] = useState(month);
  const [base, setBase] = useState("");

  useEffect(() => {
    (async () => {
      const r = await getBaseEditor(month);
      if (r.ok) {
        setData(r.data);
        setBase(String(r.data.ticketBase));
      } else {
        setError(r.error);
      }
      setLoading(false);
    })();
  }, [month]);

  const nueva = Number(base);
  const valida = Number.isFinite(nueva) && nueva > 0 && nueva <= 200;
  const cambio = data && valida ? Math.round((nueva - data.ticketBase) * 100) / 100 : 0;

  async function handleSave() {
    setSaving(true);
    const r = await saveIncentiveBase({ effectiveMonth, ticketBase: nueva });
    setSaving(false);
    if (!r.ok) {
      showToast(r.error, "error");
      return;
    }
    showToast(`Base actualizada a ${formatCurrency(nueva)} desde ${monthLabel(effectiveMonth)}`, "success");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-primary" /> Base del programa
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="p-6 text-center text-sm text-gray-500">Cargando…</div>
        ) : error || !data ? (
          <div className="p-6 text-center text-sm text-gray-500">{error}</div>
        ) : (
          <>
            <p className="text-xs text-gray-500 mb-3">
              El ticket base es el punto de partida del programa: cada nivel es{" "}
              <strong>base + su premio</strong>. Si mueves la base, se mueven todas las metas.
            </p>

            {data.reference.length > 0 && (
              <div className="text-xs bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 mb-3 text-gray-700">
                📊 Ticket real de los meses cerrados:{" "}
                {data.reference.map((r, i) => (
                  <span key={r.month}>
                    {i > 0 && " · "}
                    {monthLabel(r.month)} <strong>{formatCurrency(r.ticket)}</strong>
                  </span>
                ))}
                . El sistema informa — la base la decides tú.
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] uppercase text-gray-500">Ticket base (S/)</label>
                <input
                  type="number"
                  step="0.01"
                  value={base}
                  onChange={(e) => setBase(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
                {data && valida && cambio !== 0 && (
                  <div className={`text-[11px] mt-1 font-medium ${cambio < 0 ? "text-emerald-600" : "text-amber-600"}`}>
                    {cambio > 0 ? "+" : ""}
                    {formatCurrency(cambio)} vs la base de hoy ({formatCurrency(data.ticketBase)})
                    {cambio < 0 ? " — metas más fáciles" : " — metas más exigentes"}
                  </div>
                )}
              </div>
              <div>
                <label className="text-[11px] uppercase text-gray-500">Vigente desde (mes)</label>
                <input
                  type="month"
                  value={effectiveMonth}
                  onChange={(e) => setEffectiveMonth(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
                <div className="text-[11px] text-gray-400 mt-1">Los meses anteriores no se re-miden.</div>
              </div>
            </div>

            {/* Cómo quedan las metas — el efecto real del cambio */}
            {data.levels.length > 0 && (
              <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 text-[11px] uppercase text-gray-500 font-medium">
                  Así quedan las metas
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {data.levels.map((l) => {
                      const antes = Math.round((data.ticketBase + l.delta) * 100) / 100;
                      const despues = Math.round((nueva + l.delta) * 100) / 100;
                      return (
                        <tr key={l.nombre} className="border-t border-gray-100">
                          <td className="px-3 py-2 text-gray-700">
                            {l.nombre} <span className="text-gray-400">(+{formatCurrency(l.delta)})</span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            {valida && despues !== antes ? (
                              <>
                                <span className="text-gray-400 line-through mr-1.5">{formatCurrency(antes)}</span>
                                <strong className="text-gray-900">{formatCurrency(despues)}</strong>
                              </>
                            ) : (
                              <strong className="text-gray-900">{formatCurrency(antes)}</strong>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {data.liquidated && effectiveMonth === month && (
              <div className="mt-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                🔒 {monthLabel(month)} ya está liquidado: su base quedó congelada en el acta. Elige un mes
                posterior o reabre la liquidación.
              </div>
            )}

            <div className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ⚠️ Cambiar la base <strong>vuelve a medir el mes desde {monthLabel(effectiveMonth)}</strong>: el nivel
              alcanzado y los bonos se recalculan con las metas nuevas.
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !valida}
                className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Guardar base
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
