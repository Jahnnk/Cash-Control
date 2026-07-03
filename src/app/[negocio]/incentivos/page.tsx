"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Trophy, Upload, AlertTriangle, CheckCircle2, XCircle, Loader2, Save, Users, Flag,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  getIncentiveDashboard,
  saveDailyEntry,
  type IncentiveDashboard,
} from "@/app/actions/incentives";
import { useToast } from "@/components/toast-provider";
import { ImportControlModal } from "./import-control-modal";

/**
 * Incentivos por Upselling · Tablero del administrador (política jun-2026).
 * Responde las preguntas del admin: ¿cómo va el ticket vs la meta?
 * ¿qué nivel alcanzamos y cuánto falta? ¿el bono cabe en el pozo?
 * ¿cumplimos el piso de tráfico? ¿qué banderas hay que revisar?
 */

function currentMonth() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7);
}
function todayLima() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}
export default function IncentivosPage() {
  const { showToast } = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<IncentiveDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);

  // Registro diario
  const [fecha, setFecha] = useState(todayLima());
  const [personas, setPersonas] = useState("");
  const [venta, setVenta] = useState("");
  const [items, setItems] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (m: string) => {
    setLoading(true);
    const r = await getIncentiveDashboard(m);
    if (r.ok) { setData(r.data); setError(null); }
    else { setData(null); setError(r.error); }
    setLoading(false);
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar/cambiar mes */
    load(month);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [month, load]);

  async function handleSaveDay() {
    setSaving(true);
    const r = await saveDailyEntry({
      date: fecha,
      personas: Number(personas),
      revenue: Number(venta),
      items: items.trim() === "" ? null : Number(items),
    });
    setSaving(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast("Día registrado", "success");
    setPersonas(""); setVenta(""); setItems("");
    await load(month);
  }

  const p = data?.progress ?? null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" />
            Incentivos por Upselling
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Meta: subir el ticket promedio por persona. El bono se paga solo con la venta nueva — nunca con la utilidad de hoy.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-xs bg-white"
          />
          <button
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-primary hover:bg-primary-light rounded-lg"
          >
            <Upload className="w-3.5 h-3.5" />
            Subir reportes de control
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">Cargando…</div>
      ) : error || !data || !p ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">{error}</div>
      ) : (
        <>
          {/* 1 · Avance del ticket */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-[11px] uppercase text-gray-500">Ticket promedio ({p.daysLoaded} día{p.daysLoaded === 1 ? "" : "s"})</div>
              <div className="text-2xl font-black text-gray-900">
                {p.ticketActual !== null ? formatCurrency(p.ticketActual) : "—"}
              </div>
              <div className="text-[11px] text-gray-500">
                Base {formatCurrency(data.config.ticketBase)}
                {p.deltaActual !== null && (
                  <span className={`ml-1 font-semibold ${p.deltaActual > 0 ? "text-emerald-600" : "text-red-600"}`}>
                    ({p.deltaActual >= 0 ? "+" : ""}{formatCurrency(p.deltaActual)})
                  </span>
                )}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-[11px] uppercase text-gray-500">Nivel alcanzado</div>
              <div className={`text-lg font-bold ${p.nivelAlcanzado ? "text-emerald-600" : "text-gray-400"}`}>
                {p.nivelAlcanzado?.nombre ?? "Aún sin nivel"}
              </div>
              {p.proximoNivel && (
                <div className="text-[11px] text-gray-500">
                  Para {p.proximoNivel.level.nombre}: faltan <strong>{formatCurrency(p.proximoNivel.faltaSoles)}</strong> de ticket
                </div>
              )}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-[11px] uppercase text-gray-500">Piso de tráfico</div>
              <div className={`text-lg font-bold flex items-center gap-1.5 ${p.traffic.cumple ? "text-emerald-600" : "text-red-600"}`}>
                {p.traffic.cumple ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {p.traffic.personasPorDia ?? "—"} personas/día
              </div>
              <div className="text-[11px] text-gray-500">
                Mínimo {p.traffic.floor}/día — {p.traffic.cumple ? "cumple: la meta cuenta" : "sin el piso, la meta NO cuenta"}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-[11px] uppercase text-gray-500">Items por persona</div>
              <div className="text-2xl font-black text-gray-900">{p.itemsPorPersona ?? "—"}</div>
              <div className="text-[11px] text-gray-500">El upselling real sube ticket E items</div>
            </div>
          </div>

          {/* 2 · Tabla de niveles y pozo */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">
              Niveles y pozo (proyección al cierre con el ritmo actual)
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase text-gray-500 bg-gray-50">
                  <th className="text-left px-4 py-2 font-medium">Nivel</th>
                  <th className="text-right px-4 py-2 font-medium">Ticket meta</th>
                  <th className="text-right px-4 py-2 font-medium">Bonos a pagar</th>
                  <th className="text-right px-4 py-2 font-medium">Pozo (techo 40%)</th>
                  <th className="text-right px-4 py-2 font-medium">Colchón</th>
                </tr>
              </thead>
              <tbody>
                {p.porNivel.map((n) => {
                  const isCurrent = p.nivelAlcanzado?.nombre === n.level.nombre;
                  return (
                    <tr key={n.level.nombre} className={`border-t border-gray-100 ${isCurrent ? "bg-emerald-50/60" : ""}`}>
                      <td className="px-4 py-2 font-medium text-gray-900">
                        {isCurrent && "✅ "}{n.level.nombre} <span className="text-gray-400">(+{formatCurrency(n.level.delta)})</span>
                      </td>
                      <td className="px-4 py-2 text-right text-gray-700">{formatCurrency(data.config.ticketBase + n.level.delta)}</td>
                      <td className="px-4 py-2 text-right font-semibold">{formatCurrency(n.sumaBonos)}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{n.pozoNivel !== null ? formatCurrency(n.pozoNivel) : "—"}</td>
                      <td className={`px-4 py-2 text-right font-medium ${n.colchon !== null && n.colchon >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {n.colchon !== null ? formatCurrency(n.colchon) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-100">
              El pozo es el techo; se paga la tabla fija por rol. Equipo: {data.staff.filter((s) => s.jornada === "tiempo_completo").length} tiempo completo · {data.staff.filter((s) => s.jornada === "medio_turno").length} medio turno · 1 admin.
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 3 · Registro diario */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-sm font-semibold text-gray-900 mb-3">Registro del día (del cierre de Byte)</div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Fecha</label>
                  <input type="date" value={fecha} max={todayLima()} onChange={(e) => setFecha(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Personas atendidas</label>
                  <input type="number" min="1" value={personas} onChange={(e) => setPersonas(e.target.value)}
                    placeholder="ej. 52" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Venta del día S/</label>
                  <input type="number" min="0" step="0.01" value={venta} onChange={(e) => setVenta(e.target.value)}
                    placeholder="ej. 1450.50" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Items vendidos (opcional)</label>
                  <input type="number" min="0" value={items} onChange={(e) => setItems(e.target.value)}
                    placeholder="ej. 140" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
                </div>
              </div>
              <button
                onClick={handleSaveDay}
                disabled={saving || !personas || !venta}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-primary hover:bg-primary-light rounded-lg disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Guardar día (re-guardar corrige)
              </button>
              {data.dailies.length > 0 && (
                <div className="mt-3 max-h-44 overflow-y-auto border border-gray-100 rounded-lg">
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr className="text-gray-500 uppercase">
                        <th className="text-left px-2 py-1">Día</th>
                        <th className="text-right px-2 py-1">Personas</th>
                        <th className="text-right px-2 py-1">Venta</th>
                        <th className="text-right px-2 py-1">Ticket</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...data.dailies].reverse().map((d) => (
                        <tr key={d.date} className="border-t border-gray-50">
                          <td className="px-2 py-1">{d.date.slice(8)}/{d.date.slice(5, 7)}</td>
                          <td className="px-2 py-1 text-right">{d.personas ?? "—"}</td>
                          <td className="px-2 py-1 text-right">{d.revenue !== null ? formatCurrency(d.revenue) : "—"}</td>
                          <td className="px-2 py-1 text-right font-medium">
                            {d.personas && d.revenue ? formatCurrency(Math.round((d.revenue / d.personas) * 100) / 100) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 4 · Banderas */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-1.5">
                <Flag className="w-4 h-4 text-red-600" />
                Banderas de control ({data.flags.length})
              </div>
              <div className="text-[11px] text-gray-400 mb-2">
                Eventos del mes: {data.eventCounts.anulaciones} anulaciones · {data.eventCounts.cortesias} cortesías · {data.eventCounts.cambiosPrecio} cambios de precio
              </div>
              {data.flags.length === 0 ? (
                <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  Sin banderas con los reportes cargados. 👏
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {data.flags.map((f) => (
                    <div key={f.id} className={`text-xs rounded-lg px-3 py-2 border ${f.severity === "alta" ? "bg-red-50 border-red-200 text-red-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                      <div className="font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        {f.usuario ? `${f.usuario}: ` : ""}{f.title}
                      </div>
                      <div className="mt-0.5 opacity-80">{f.detail}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 5 · Ranking de vendedores */}
          {data.workers.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-primary" />
                Ventas por trabajador (último reporte subido{data.workers[0].periodEnd ? ` · al ${data.workers[0].periodEnd.slice(8)}/${data.workers[0].periodEnd.slice(5, 7)}` : ""})
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase text-gray-500 bg-gray-50">
                    <th className="text-left px-4 py-2 font-medium">Trabajador</th>
                    <th className="text-right px-4 py-2 font-medium">Mesas</th>
                    <th className="text-right px-4 py-2 font-medium">Venta</th>
                    <th className="text-right px-4 py-2 font-medium">Ticket por mesa</th>
                  </tr>
                </thead>
                <tbody>
                  {data.workers.map((w, i) => (
                    <tr key={w.nombre} className="border-t border-gray-100">
                      <td className="px-4 py-2 font-medium text-gray-900">{i === 0 ? "🏆 " : ""}{w.nombre}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{w.mesas}</td>
                      <td className="px-4 py-2 text-right font-semibold">{formatCurrency(w.total)}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{w.ticketMesa !== null ? formatCurrency(w.ticketMesa) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-100">
                Referencial (por mesa). El premio oficial al mejor vendedor se calcula por ticket POR PERSONA y franja horaria cuando el registro individual esté activo (Fase B).
              </div>
            </div>
          )}
        </>
      )}

      {showImport && (
        <ImportControlModal onClose={() => setShowImport(false)} onImported={() => load(month)} />
      )}
    </div>
  );
}
