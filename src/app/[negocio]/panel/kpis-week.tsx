"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, FileDown, Loader2, BarChart3, Settings2, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  getWeeklyKpis,
  getBoardDeckData,
  getKpiTargetsForEdit,
  saveKpiTargets,
  type WeeklyKpisResult,
} from "@/app/actions/kpis";
import { weekStartOf, weekEndOf, type KpiTraffic } from "@/lib/kpis/engine";
import { useToast } from "@/components/toast-provider";

const DOT: Record<KpiTraffic, string> = {
  verde: "bg-emerald-500",
  ambar: "bg-amber-400",
  rojo: "bg-red-500",
  gris: "bg-gray-300",
};

function Dot({ t }: { t: KpiTraffic }) {
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${DOT[t]}`} aria-hidden="true" />;
}

function dayShort(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  return `${dias[d.getUTCDay()]} ${d.getUTCDate()}`;
}

function weekLabel(ws: string): string {
  const we = weekEndOf(ws);
  const d1 = new Date(ws + "T12:00:00Z");
  const d2 = new Date(we + "T12:00:00Z");
  const mes = d2.toLocaleDateString("es-PE", { month: "short", timeZone: "UTC" });
  return `${d1.getUTCDate()} – ${d2.getUTCDate()} ${mes}`;
}

function shiftWeek(ws: string, weeks: number): string {
  const d = new Date(ws + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

/**
 * KPIs de la semana (reemplaza el cuadro de Notion): tabla diaria con
 * semáforos, resumen y WoW. El botón del deck de la reunión solo
 * aparece en sesión completa (Jahnn).
 */
export function KpisWeekSection({ fullSession }: { fullSession: boolean }) {
  const { showToast } = useToast();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const [weekStart, setWeekStart] = useState(weekStartOf(today));
  const [data, setData] = useState<Extract<WeeklyKpisResult, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showTargets, setShowTargets] = useState(false);

  const load = useCallback(async (ws: string) => {
    setLoading(true);
    const r = await getWeeklyKpis(ws);
    if (r.ok) { setData(r); setError(null); }
    else { setData(null); setError(r.error); }
    setLoading(false);
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al cambiar semana */
    load(weekStart);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [weekStart, load]);

  async function handleDeck() {
    setGenerating(true);
    try {
      const r = await getBoardDeckData(weekStart);
      if (!r.ok) { showToast(r.error, "error"); return; }
      const { renderWeeklyKpiDeck } = await import("@/lib/kpis/weekly-deck");
      const { blob, filename } = await renderWeeklyKpiDeck(r.data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Deck de la reunión generado", "success");
    } finally {
      setGenerating(false);
    }
  }

  const s = data?.summary ?? null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4 text-primary" />
          KPIs de la semana
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekStart(shiftWeek(weekStart, -1))} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded" aria-label="Semana anterior">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-medium text-gray-700 w-24 text-center">{weekLabel(weekStart)}</span>
          <button
            onClick={() => setWeekStart(shiftWeek(weekStart, 1))}
            disabled={shiftWeek(weekStart, 1) > today}
            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30"
            aria-label="Semana siguiente"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {fullSession && (
            <>
              <button
                onClick={() => setShowTargets(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 bg-white hover:bg-gray-50 rounded-lg"
                title="Ajustar las metas de esta sede (solo dirección)"
              >
                <Settings2 className="w-3.5 h-3.5" />
                Metas
              </button>
              <button
                onClick={handleDeck}
                disabled={generating}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary border border-primary/30 bg-primary/5 hover:bg-primary hover:text-white rounded-lg transition-colors disabled:opacity-50"
                title="Genera el PPT de la reunión de los lunes (todas las sedes)"
              >
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                Deck de la reunión
              </button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-gray-500">Cargando…</div>
      ) : error || !s ? (
        <div className="p-6 text-center text-sm text-gray-500">{error}</div>
      ) : (
        <>
          {!data!.kpiColumnsReady && (
            <div className="mx-4 mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Falta la migración de KPIs en la base de datos: NPS, mermas y tiempo aparecerán cuando Jahnn la corra.
            </div>
          )}
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-gray-500 bg-gray-50">
                <th className="text-left px-3 py-2 font-medium">Día</th>
                <th className="text-right px-3 py-2 font-medium">Ventas (meta {formatCurrency(data!.targets.ventaDiaria)})</th>
                <th className="text-right px-3 py-2 font-medium">Ticket (ref {formatCurrency(data!.targets.ticketRef)})</th>
                <th className="text-right px-3 py-2 font-medium">NPS (≥{data!.targets.npsMin})</th>
                <th className="text-right px-3 py-2 font-medium">Mermas (≤{Math.round(data!.targets.mermasMaxPct * 100)}%)</th>
                <th className="text-right px-3 py-2 font-medium">T. mostrador{data!.targets.tiempoMaxMin !== null ? ` (<${data!.targets.tiempoMaxMin}m)` : ""}</th>
                <th className="text-right px-3 py-2 font-medium">T. mesa{data!.targets.tiempoMesaMaxMin !== null ? ` (<${data!.targets.tiempoMesaMaxMin}m)` : ""}</th>
              </tr>
            </thead>
            <tbody>
              {s.days.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">Sin registros esta semana — se llenan desde &ldquo;Registro del día&rdquo;.</td></tr>
              ) : s.days.map((d) => (
                <tr key={d.date} className="border-t border-gray-50">
                  <td className="px-3 py-1.5 font-medium text-gray-900">{dayShort(d.date)}</td>
                  <td className="px-3 py-1.5 text-right"><span className="mr-1.5">{d.ventas !== null ? formatCurrency(d.ventas) : "—"}</span><Dot t={d.traffic.ventas} /></td>
                  <td className="px-3 py-1.5 text-right"><span className="mr-1.5">{d.ticket !== null ? formatCurrency(d.ticket) : "—"}</span><Dot t={d.traffic.ticket} /></td>
                  <td className="px-3 py-1.5 text-right"><span className="mr-1.5">{d.nps ?? "—"}</span><Dot t={d.traffic.nps} /></td>
                  <td className="px-3 py-1.5 text-right"><span className="mr-1.5">{d.mermasSoles !== null ? formatCurrency(d.mermasSoles) : "—"}</span><Dot t={d.traffic.mermas} /></td>
                  <td className="px-3 py-1.5 text-right"><span className="mr-1.5">{d.tiempoMin !== null ? `${d.tiempoMin} min` : "—"}</span><Dot t={d.traffic.tiempo} /></td>
                  <td className="px-3 py-1.5 text-right"><span className="mr-1.5">{d.tiempoMesaMin !== null ? `${d.tiempoMesaMin} min` : "—"}</span><Dot t={d.traffic.tiempoMesa} /></td>
                </tr>
              ))}
            </tbody>
            {s.days.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-gray-900">
                  <td className="px-3 py-2">Semana</td>
                  <td className="px-3 py-2 text-right">
                    <span className="mr-1.5">{s.ventasProm !== null ? `${formatCurrency(s.ventasProm)} (${s.ventasPct}%)` : "—"}</span><Dot t={s.traffic.ventas} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="mr-1.5">{s.ticketProm !== null ? `${formatCurrency(s.ticketProm)} (${s.ticketPct}%)` : "—"}</span><Dot t={s.traffic.ticket} />
                  </td>
                  <td className="px-3 py-2 text-right"><span className="mr-1.5">{s.npsProm ?? "—"}</span><Dot t={s.traffic.nps} /></td>
                  <td className="px-3 py-2 text-right">
                    <span className="mr-1.5">{formatCurrency(s.mermasTotal)}{s.mermasPct !== null ? ` (${s.mermasPct}%)` : ""}</span><Dot t={s.traffic.mermas} />
                  </td>
                  <td className="px-3 py-2 text-right"><span className="mr-1.5">{s.tiempoProm !== null ? `${s.tiempoProm} min` : "—"}</span><Dot t={s.traffic.tiempo} /></td>
                  <td className="px-3 py-2 text-right"><span className="mr-1.5">{s.tiempoMesaProm !== null ? `${s.tiempoMesaProm} min` : "—"}</span><Dot t={s.traffic.tiempoMesa} /></td>
                </tr>
              </tfoot>
            )}
          </table>
          {data!.wow.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 flex flex-wrap gap-1.5">
              {data!.wow.map((w) => (
                <span key={w.text} className={`text-[11px] rounded-full px-2.5 py-1 border ${w.direction === "mejoro" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"}`}>
                  {w.direction === "mejoro" ? "✓" : "✗"} {w.text}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {showTargets && (
        <TargetsModal onClose={() => setShowTargets(false)} onSaved={() => { setShowTargets(false); load(weekStart); }} />
      )}
    </div>
  );
}

/**
 * Metas de la sede — SOLO dirección. El sistema muestra la referencia
 * real (promedios de las últimas 4 semanas) como consejo con evidencia;
 * la decisión de la meta es del CEO, nunca del sistema.
 */
function TargetsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reference, setReference] = useState<{ ventasProm: number | null; ticketProm: number | null; weeks: number } | null>(null);
  const [effectiveMonth, setEffectiveMonth] = useState("");
  const [venta, setVenta] = useState("");
  const [ticket, setTicket] = useState("");
  const [npsMin, setNpsMin] = useState("");
  const [mermasMax, setMermasMax] = useState("");
  const [tiempoMax, setTiempoMax] = useState("");         // mostrador
  const [tiempoMesaMax, setTiempoMesaMax] = useState(""); // mesa

  useEffect(() => {
     
    (async () => {
      const r = await getKpiTargetsForEdit();
      if (r.ok) {
        setReference(r.data.reference);
        setEffectiveMonth(r.data.effectiveMonth);
        setVenta(String(r.data.targets.ventaDiaria));
        setTicket(String(r.data.targets.ticketRef));
        setNpsMin(String(r.data.targets.npsMin));
        setMermasMax(String(Math.round(r.data.targets.mermasMaxPct * 10000) / 100));
        setTiempoMax(r.data.targets.tiempoMaxMin !== null ? String(r.data.targets.tiempoMaxMin) : "");
        setTiempoMesaMax(r.data.targets.tiempoMesaMaxMin !== null ? String(r.data.targets.tiempoMesaMaxMin) : "");
      }
      setLoading(false);
    })();
     
  }, []);

  async function handleSave() {
    setSaving(true);
    const r = await saveKpiTargets({
      effectiveMonth,
      ventaDiaria: Number(venta),
      ticketRef: Number(ticket),
      npsMin: Number(npsMin),
      mermasMaxPct: Number(mermasMax),
      tiempoMaxMin: tiempoMax.trim() === "" ? null : Number(tiempoMax),
      tiempoMesaMaxMin: tiempoMesaMax.trim() === "" ? null : Number(tiempoMesaMax),
    });
    setSaving(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast("Metas actualizadas", "success");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-primary" /> Metas de la sede
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>
        {loading ? (
          <div className="p-6 text-center text-sm text-gray-500">Cargando…</div>
        ) : (
          <>
            {reference && (reference.ventasProm !== null || reference.ticketProm !== null) && (
              <div className="text-xs bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 mb-3 text-gray-700">
                📊 Referencia real (últimas {reference.weeks} semanas):{" "}
                {reference.ventasProm !== null && <>venta prom. <strong>{formatCurrency(reference.ventasProm)}</strong>/día</>}
                {reference.ventasProm !== null && reference.ticketProm !== null && " · "}
                {reference.ticketProm !== null && <>ticket <strong>{formatCurrency(reference.ticketProm)}</strong></>}
                . El sistema informa — la meta la decides tú.
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Vigente desde (mes)</label>
                <input type="month" value={effectiveMonth} onChange={(e) => setEffectiveMonth(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Meta venta diaria S/</label>
                <input type="number" min="1" step="1" value={venta} onChange={(e) => setVenta(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Meta ticket promedio S/</label>
                <input type="number" min="1" step="0.01" value={ticket} onChange={(e) => setTicket(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">NPS mínimo (0-10)</label>
                <input type="number" min="0" max="10" step="0.1" value={npsMin} onChange={(e) => setNpsMin(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Mermas máx. (% de ventas)</label>
                <input type="number" min="0.5" max="50" step="0.5" value={mermasMax} onChange={(e) => setMermasMax(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Tiempo máx. mostrador (min)</label>
                <input type="number" min="0" step="0.5" value={tiempoMax} onChange={(e) => setTiempoMax(e.target.value)}
                  placeholder="ej. 6 (sin meta = vacío)" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Tiempo máx. mesa (min)</label>
                <input type="number" min="0" step="0.5" value={tiempoMesaMax} onChange={(e) => setTiempoMesaMax(e.target.value)}
                  placeholder="ej. 15 (sin meta = vacío)" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
              </div>
            </div>
            <div className="text-[11px] text-gray-400 mt-2">
              Las metas rigen desde el mes elegido; los meses anteriores conservan las suyas (el pasado no se re-mide).
            </div>
            <div className="flex gap-2 justify-end pt-4">
              <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-50">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !venta || !ticket}
                className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-light rounded-lg disabled:opacity-50"
              >
                {saving ? "Guardando…" : "Guardar metas"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
