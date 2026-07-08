"use client";

import { useCallback, useEffect, useState } from "react";
import { Trophy, Users, Loader2, Settings2, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  getMejorVendedor,
  getWorkerShifts,
  saveWorkerShifts,
  type MejorVendedorView,
  type WorkerShiftRow,
  type Turno,
} from "@/app/actions/mejor-vendedor";
import { useToast } from "@/components/toast-provider";

const TURNO_LABEL: Record<Turno, string> = {
  "mañana": "Mañana",
  "tarde": "Tarde",
  "completo": "Todo el día",
};

/**
 * Mejor vendedor por TURNO (hándicap). Gana quien más levanta su ticket
 * sobre lo normal de su turno, no quien vende más en bruto. Alimentado
 * por el reporte de Ventas por Trabajador + el turno de cada uno.
 */
export function MejorVendedorSection({ month }: { month: string }) {
  const [data, setData] = useState<MejorVendedorView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTurnos, setShowTurnos] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await getMejorVendedor(month);
    if (r.ok) { setData(r.data); setError(null); }
    else { setData(null); setError(r.error); }
    setLoading(false);
  }, [month]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch por mes
    load();
  }, [load]);

  const elegibles = data?.result.ranking.filter((s) => s.elegible) ?? [];
  const noElegibles = data?.result.ranking.filter((s) => !s.elegible) ?? [];

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
          <Trophy className="w-4 h-4 text-primary" />
          Mejor vendedor por turno (hándicap)
        </div>
        <button
          onClick={() => setShowTurnos(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 bg-white hover:bg-gray-50 rounded-lg"
        >
          <Settings2 className="w-3.5 h-3.5" />
          Asignar turnos
        </button>
      </div>

      <div className="px-4 py-2.5 bg-primary/5 border-b border-gray-100 text-[11px] text-gray-600 leading-relaxed">
        No gana quien vende más en total, sino <strong>quien más levanta su ticket sobre lo normal de SU turno</strong>.
        Así el de la mañana no compite contra el pico de la tarde. El <strong>full time</strong> (cubre mañana y tarde) compite
        entre full times; el <strong>medio turno</strong>, dentro de su franja. Se mide por ticket por mesa; pide un mínimo de{" "}
        <strong>{data?.minMesas ?? 60} mesas</strong> en el mes para calificar. El pago sigue asignándose a mano en la liquidación — esto es el ganador sugerido.
      </div>

      {loading ? (
        <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" /></div>
      ) : error ? (
        <div className="p-6 text-center text-sm text-gray-500">{error}</div>
      ) : !data || data.sinDatos ? (
        <div className="p-6 text-center text-sm text-gray-500">
          Aún no hay reporte de Ventas por Trabajador este mes. Súbelo desde &ldquo;Subir reportes de control&rdquo;.
        </div>
      ) : (
        <>
          {data.sinTurnos && (
            <div className="mx-4 mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Nadie tiene turno asignado todavía — por ahora todos se comparan como &ldquo;Todo el día&rdquo;.
              Asigna los turnos para que el hándicap sea justo por horario.
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase text-gray-500 bg-gray-50">
                <th className="text-left px-4 py-2 font-medium">Vendedor</th>
                <th className="text-left px-4 py-2 font-medium">Turno</th>
                <th className="text-right px-4 py-2 font-medium">Ticket/mesa</th>
                <th className="text-right px-4 py-2 font-medium">Normal del turno</th>
                <th className="text-right px-4 py-2 font-medium">Levanta</th>
                <th className="text-right px-4 py-2 font-medium">Mesas</th>
              </tr>
            </thead>
            <tbody>
              {elegibles.map((s, i) => {
                const f = s.porFranja[0];
                return (
                  <tr key={s.seller} className={`border-t border-gray-100 ${i === 0 ? "bg-emerald-50/60" : ""}`}>
                    <td className="px-4 py-2 font-medium text-gray-900">{i === 0 ? "🏆 " : ""}{s.seller}</td>
                    <td className="px-4 py-2 text-gray-600">{TURNO_LABEL[(f?.franja as Turno) ?? "completo"]}</td>
                    <td className="px-4 py-2 text-right text-gray-700">{s.ticketGlobal !== null ? formatCurrency(s.ticketGlobal) : "—"}</td>
                    <td className="px-4 py-2 text-right text-gray-500">{f?.baseline !== null && f?.baseline !== undefined ? formatCurrency(f.baseline) : "—"}</td>
                    <td className={`px-4 py-2 text-right font-bold ${(s.liftPromedio ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {s.liftPromedio !== null ? `${s.liftPromedio >= 0 ? "+" : ""}${formatCurrency(s.liftPromedio)}` : "—"}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-500">{s.totalClientes}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {elegibles.length === 0 && (
            <div className="px-4 py-3 text-xs text-gray-500">
              Nadie califica todavía (falta acumular mesas en el mes, o falta con quién comparar en cada turno).
            </div>
          )}

          {noElegibles.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100">
              <div className="text-[11px] text-gray-400 mb-1">No califican aún:</div>
              <div className="flex flex-wrap gap-1.5">
                {noElegibles.map((s) => (
                  <span key={s.seller} className="text-[11px] rounded-full px-2.5 py-1 bg-gray-50 border border-gray-200 text-gray-500"
                    title={s.notas.join(" ")}>
                    {s.seller} · {s.totalClientes} mesas
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {showTurnos && (
        <TurnosModal month={month} onClose={() => setShowTurnos(false)} onSaved={() => { setShowTurnos(false); load(); }} />
      )}
    </div>
  );
}

function TurnosModal({ month, onClose, onSaved }: { month: string; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<WorkerShiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tableReady, setTableReady] = useState(true);

  useEffect(() => {
    (async () => {
      const r = await getWorkerShifts(month);
      if (r.ok) { setRows(r.rows); setTableReady(r.tableReady); }
      setLoading(false);
    })();
  }, [month]);

  function setTurno(nombre: string, turno: Turno) {
    setRows((prev) => prev.map((r) => (r.nombre === nombre ? { ...r, turno } : r)));
  }

  async function handleSave() {
    setSaving(true);
    const r = await saveWorkerShifts({ assignments: rows.map((r) => ({ nombre: r.nombre, turno: r.turno })) });
    setSaving(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast("Turnos guardados", "success");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" /> Turno de cada vendedor
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-3">
          <p className="text-xs text-gray-500">
            <strong>Full time</strong> (turno partido: cubre mañana Y tarde) → &ldquo;Todo el día&rdquo;.{" "}
            <strong>Medio turno</strong> (solo una franja) → &ldquo;Mañana&rdquo; o &ldquo;Tarde&rdquo;.
            Se compara a cada vendedor contra lo normal de SU turno.
          </p>
          {!tableReady && (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Falta la migración de turnos (tabla worker_shifts) — avísale a Jahnn.
            </div>
          )}
          {loading ? (
            <div className="p-6 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" /></div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-gray-500 text-center py-4">Sube primero el reporte de Ventas por Trabajador del mes.</div>
          ) : (
            <div className="space-y-1.5">
              {rows.map((r) => (
                <div key={r.nombre} className="flex items-center gap-2">
                  <span className="flex-1 text-sm text-gray-800 truncate">{r.nombre}</span>
                  <span className="text-[11px] text-gray-400 w-14 text-right">{r.mesas} mesas</span>
                  <select
                    value={r.turno}
                    onChange={(e) => setTurno(r.nombre, e.target.value as Turno)}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white"
                  >
                    <option value="mañana">Mañana (medio turno)</option>
                    <option value="tarde">Tarde (medio turno)</option>
                    <option value="completo">Todo el día (full time)</option>
                  </select>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-50">Cancelar</button>
            <button onClick={handleSave} disabled={saving || loading || !tableReady || rows.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-light rounded-lg disabled:opacity-50">
              {saving ? "Guardando…" : "Guardar turnos"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
