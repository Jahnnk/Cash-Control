"use client";

import { useCallback, useEffect, useState } from "react";
import { PiggyBank, Loader2 } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { getMatrizDecision, guardarReservaMinima, type SedeDecision } from "@/app/actions/decision";
import { reservaDe, SEMANAS_RESERVA_POR_DEFECTO } from "@/lib/decisiones";

const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;

/**
 * Reserva mínima por sede para la matriz de decisión (Sistema de Dirección). Por defecto, la
 * del libro: 4 semanas de costos fijos. Jahnn puede cambiar las semanas o fijar un monto
 * (si hay monto, manda el monto).
 */
export function ReservaMinimaAdmin() {
  const { showToast } = useToast();
  const [sedes, setSedes] = useState<SedeDecision[] | null>(null);
  const [draft, setDraft] = useState<Record<number, { semanas: string; monto: string }>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const r = await getMatrizDecision();
    if (!r.ok) { showToast(r.error, "error"); return; }
    setSedes(r.sedes);
    setDraft(Object.fromEntries(r.sedes.map((s) => [s.businessId, {
      semanas: s.reservaConfig?.semanas != null ? String(s.reservaConfig.semanas) : "",
      monto: s.reservaConfig?.monto != null ? String(s.reservaConfig.monto) : "",
    }])));
  }, [showToast]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    load();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load]);

  const aNumero = (t: string) => (t.trim() === "" ? null : Number(t.replace(",", ".")));

  async function guardar(s: SedeDecision, porDefecto = false) {
    const d = draft[s.businessId] ?? { semanas: "", monto: "" };
    const semanas = porDefecto ? null : aNumero(d.semanas);
    const monto = porDefecto ? null : aNumero(d.monto);
    if ((semanas !== null && !Number.isFinite(semanas)) || (monto !== null && !Number.isFinite(monto))) { showToast("Escribe solo números.", "error"); return; }
    setBusyId(s.businessId);
    const r = await guardarReservaMinima({ businessId: s.businessId, semanas, monto });
    setBusyId(null);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast(`Reserva de ${s.sede} guardada.`, "success");
    load();
  }

  if (!sedes) return null;

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <PiggyBank className="w-4 h-4 text-primary" /> Reserva mínima por sede
        </h2>
        <p className="text-[11px] text-gray-500 mt-0.5">
          La plata que la matriz de decisión nunca da por libre. Por defecto, la del libro:{" "}
          <strong>{SEMANAS_RESERVA_POR_DEFECTO} semanas de costos fijos</strong>. Puedes cambiar las semanas o poner un
          monto fijo (si pones monto, manda el monto).
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {sedes.map((s) => {
          const d = draft[s.businessId] ?? { semanas: "", monto: "" };
          const fijos = s.datos?.fijosMes ?? null;
          const semanas = aNumero(d.semanas), monto = aNumero(d.monto);
          const vista = fijos !== null ? reservaDe(fijos, {
            semanas: semanas !== null && Number.isFinite(semanas) ? semanas : null,
            monto: monto !== null && Number.isFinite(monto) ? monto : null,
          }) : null;
          return (
            <div key={s.businessId} className="rounded-lg border border-gray-200 p-3 space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-gray-900">{s.sede}</span>
                {fijos !== null && <span className="text-[11px] text-gray-500">fijos {soles(fijos)}/mes</span>}
              </div>
              <div className="flex gap-2">
                <label className="text-[11px] text-gray-600 flex-1"><span className="block mb-0.5">Semanas</span>
                  <input inputMode="decimal" placeholder={String(SEMANAS_RESERVA_POR_DEFECTO)} value={d.semanas}
                    onChange={(e) => setDraft({ ...draft, [s.businessId]: { ...d, semanas: e.target.value } })}
                    className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm tabular-nums" />
                </label>
                <label className="text-[11px] text-gray-600 flex-1"><span className="block mb-0.5">o monto (S/)</span>
                  <input inputMode="decimal" placeholder="—" value={d.monto}
                    onChange={(e) => setDraft({ ...draft, [s.businessId]: { ...d, monto: e.target.value } })}
                    className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm tabular-nums" />
                </label>
              </div>
              <p className="text-xs text-gray-700">
                {vista ? <>Reserva: <strong className="tabular-nums">{soles(vista.monto)}</strong> ({vista.como})</> : "Sin costos fijos para calcularla."}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => guardar(s)} disabled={busyId === s.businessId}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
                  {busyId === s.businessId && <Loader2 className="w-3 h-3 animate-spin" />} Guardar
                </button>
                {s.reservaConfig && (
                  <button type="button" onClick={() => guardar(s, true)} disabled={busyId === s.businessId}
                    className="rounded-md px-3 py-1 text-xs font-medium text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50">
                    Volver a la del libro
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
