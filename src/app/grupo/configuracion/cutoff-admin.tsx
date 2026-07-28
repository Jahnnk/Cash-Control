"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Loader2, Check } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { listDataCutoffs, setDataCutoff, type SedeCutoff } from "@/app/actions/data-cutoff";
import { formatCutoff } from "@/lib/data-cutoff";

/**
 * "Hasta cuándo son los datos" por sede. El import lo fija solo al
 * último día con movimientos; aquí se ajusta la HORA cuando el corte
 * fue a media tarde (Kelly cierra su Excel un viernes 6:30 p.m. y ese
 * día siguen entrando ventas). Lo que se guarde aquí es lo que dicen
 * los dashboards.
 */
export function CutoffAdmin() {
  const { showToast } = useToast();
  const [sedes, setSedes] = useState<SedeCutoff[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Record<number, { date: string; time: string }>>({});

  const load = useCallback(async () => {
    const r = await listDataCutoffs();
    if (!r.ok) { showToast(r.error, "error"); return; }
    setSedes(r.sedes);
    setDraft(
      Object.fromEntries(
        r.sedes.map((s) => [s.businessId, { date: s.cutoff.date ?? "", time: s.cutoff.time ?? "" }]),
      ),
    );
  }, [showToast]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    load();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load]);

  async function handleSave(s: SedeCutoff) {
    const d = draft[s.businessId];
    if (!d?.date) { showToast("Elige la fecha del corte.", "error"); return; }
    setBusyId(s.businessId);
    const r = await setDataCutoff({ sede: s.businessId, date: d.date, time: d.time });
    setBusyId(null);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast(`Corte de ${s.name.replace("Yayi's ", "")} guardado.`, "success");
    load();
  }

  if (!sedes) return null;

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-primary" /> Hasta cuándo son los datos
        </h2>
        <p className="text-[11px] text-gray-500 mt-0.5">
          Lo que pongas aquí es lo que dicen los dashboards. Se llena solo con cada carga de
          Excel (último día con movimientos); ajusta la <strong>hora</strong> cuando el corte
          fue a media tarde — ej. Kelly cierra el viernes a las <strong>18:30</strong> y ese
          día siguen entrando ventas. Déjala vacía si el día está completo.
        </p>
      </div>

      {sedes[0]?.columnMissing && (
        <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Falta correr la migración <code>2026-07-28-corte-de-datos.sql</code>. Mientras tanto
          los dashboards usan el último día con movimientos registrados.
        </div>
      )}

      <div className="space-y-2">
        {sedes.map((s) => (
          <div key={s.businessId} className="flex flex-wrap items-center gap-2 border border-gray-100 rounded-lg px-3 py-2">
            <span className="text-xs font-medium text-gray-900 w-20 shrink-0">
              {s.name.replace("Yayi's ", "")}
            </span>
            <input
              type="date"
              value={draft[s.businessId]?.date ?? ""}
              onChange={(e) => setDraft((p) => ({ ...p, [s.businessId]: { ...p[s.businessId], date: e.target.value } }))}
              className="border border-gray-300 rounded-lg px-2 py-1 text-xs bg-white"
            />
            <input
              type="time"
              value={draft[s.businessId]?.time ?? ""}
              onChange={(e) => setDraft((p) => ({ ...p, [s.businessId]: { ...p[s.businessId], time: e.target.value } }))}
              className="border border-gray-300 rounded-lg px-2 py-1 text-xs bg-white"
              title="Vacío = día completo"
            />
            <button
              onClick={() => handleSave(s)}
              disabled={busyId === s.businessId || s.columnMissing}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-primary hover:bg-primary-light rounded-lg disabled:opacity-50"
            >
              {busyId === s.businessId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Guardar
            </button>
            <span className="text-[11px] text-gray-400">
              hoy muestra: <strong className="text-gray-600">{formatCutoff(s.cutoff)}</strong>
              {s.cutoff.inferred && " (del último movimiento)"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
