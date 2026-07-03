"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, FileDown, Loader2, BarChart3 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { getWeeklyKpis, getBoardDeckData, type WeeklyKpisResult } from "@/app/actions/kpis";
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
            <button
              onClick={handleDeck}
              disabled={generating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary border border-primary/30 bg-primary/5 hover:bg-primary hover:text-white rounded-lg transition-colors disabled:opacity-50"
              title="Genera el PPT de la reunión de los lunes (todas las sedes)"
            >
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
              Deck de la reunión
            </button>
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
                <th className="text-right px-3 py-2 font-medium">Tiempo</th>
              </tr>
            </thead>
            <tbody>
              {s.days.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">Sin registros esta semana — se llenan desde &ldquo;Registro del día&rdquo;.</td></tr>
              ) : s.days.map((d) => (
                <tr key={d.date} className="border-t border-gray-50">
                  <td className="px-3 py-1.5 font-medium text-gray-900">{dayShort(d.date)}</td>
                  <td className="px-3 py-1.5 text-right"><span className="mr-1.5">{d.ventas !== null ? formatCurrency(d.ventas) : "—"}</span><Dot t={d.traffic.ventas} /></td>
                  <td className="px-3 py-1.5 text-right"><span className="mr-1.5">{d.ticket !== null ? formatCurrency(d.ticket) : "—"}</span><Dot t={d.traffic.ticket} /></td>
                  <td className="px-3 py-1.5 text-right"><span className="mr-1.5">{d.nps ?? "—"}</span><Dot t={d.traffic.nps} /></td>
                  <td className="px-3 py-1.5 text-right"><span className="mr-1.5">{d.mermasSoles !== null ? formatCurrency(d.mermasSoles) : "—"}</span><Dot t={d.traffic.mermas} /></td>
                  <td className="px-3 py-1.5 text-right"><span className="mr-1.5">{d.tiempoMin !== null ? `${d.tiempoMin} min` : "—"}</span><Dot t={d.traffic.tiempo} /></td>
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
    </div>
  );
}
