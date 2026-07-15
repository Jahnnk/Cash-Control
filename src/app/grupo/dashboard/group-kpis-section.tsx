"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, ChevronLeft, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { getBoardDeckData, type BoardDeckData } from "@/app/actions/kpis";
import { weekStartOf, weekEndOf, type KpiTraffic } from "@/lib/kpis/engine";
import { KpiDeckButton } from "@/components/kpi-deck-button";
import Link from "next/link";

const DOT: Record<KpiTraffic, string> = {
  verde: "bg-emerald-500",
  ambar: "bg-amber-400",
  rojo: "bg-red-500",
  gris: "bg-gray-300",
};

function Dot({ t }: { t: KpiTraffic }) {
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${DOT[t]}`} aria-hidden="true" />;
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
 * KPIs de la semana en el panel del GRUPO (pedido de Jahnn): la salud de
 * las 3 sedes sin tener que entrar a cada una. Misma fuente que el deck
 * (getBoardDeckData, solo dirección) + botón del deck con rango
 * personalizado.
 */
export function GroupKpisSection({ showDeck = true }: { showDeck?: boolean } = {}) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const [weekStart, setWeekStart] = useState(weekStartOf(today));
  const [data, setData] = useState<BoardDeckData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (ws: string) => {
    setLoading(true);
    const r = await getBoardDeckData(ws);
    if (r.ok) { setData(r.data); setError(null); }
    else { setData(null); setError(r.error); }
    setLoading(false);
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al cambiar semana */
    load(weekStart);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [weekStart, load]);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5" />
          KPIs de la semana · las 3 sedes
        </h2>
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
          {showDeck ? (
            <KpiDeckButton defaultStart={weekStart} defaultEnd={weekEndOf(weekStart)} />
          ) : (
            <Link href="/grupo/reportes" className="text-xs font-medium text-primary hover:underline">
              Generar reporte →
            </Link>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-sm text-gray-400">Cargando…</div>
        ) : error || !data ? (
          <div className="p-6 text-center text-sm text-gray-500">{error}</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-gray-500 bg-gray-50">
                <th className="text-left px-4 py-2 font-medium">Sede</th>
                <th className="text-right px-4 py-2 font-medium">Ventas prom./día</th>
                <th className="text-right px-4 py-2 font-medium">% meta</th>
                <th className="text-right px-4 py-2 font-medium">Ticket prom.</th>
                <th className="text-right px-4 py-2 font-medium">% ref.</th>
                <th className="text-right px-4 py-2 font-medium">NPS</th>
                <th className="text-right px-4 py-2 font-medium">Mermas</th>
              </tr>
            </thead>
            <tbody>
              {data.cafeterias.map((cf) => (
                <tr key={cf.sede} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-medium text-gray-900">{cf.sede}</td>
                  <td className="px-4 py-2 text-right">{cf.summary.ventasProm !== null ? formatCurrency(cf.summary.ventasProm) : "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <span className="mr-1.5 font-semibold">{cf.summary.ventasPct ?? "—"}%</span>
                    <Dot t={cf.summary.traffic.ventas} />
                  </td>
                  <td className="px-4 py-2 text-right">{cf.summary.ticketProm !== null ? formatCurrency(cf.summary.ticketProm) : "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <span className="mr-1.5 font-semibold">{cf.summary.ticketPct ?? "—"}%</span>
                    <Dot t={cf.summary.traffic.ticket} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className="mr-1.5">{cf.summary.npsProm ?? "—"}</span>
                    <Dot t={cf.summary.traffic.nps} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className="mr-1.5">{cf.summary.mermasPct !== null ? `${cf.summary.mermasPct}%` : "—"}</span>
                    <Dot t={cf.summary.traffic.mermas} />
                  </td>
                </tr>
              ))}
              <tr className="border-t border-gray-100">
                <td className="px-4 py-2 font-medium text-gray-900">Atelier (B2B)</td>
                {data.atelier ? (
                  <>
                    <td className="px-4 py-2 text-right">{formatCurrency(data.atelier.ventasProm ?? 0)}</td>
                    <td className="px-4 py-2 text-right text-gray-400" colSpan={4}>
                      vendido {formatCurrency(data.atelier.ventasTotal)} en {data.atelier.daysWithData} día{data.atelier.daysWithData === 1 ? "" : "s"}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-300">—</td>
                  </>
                ) : (
                  <td className="px-4 py-2 text-right text-gray-400" colSpan={6}>sin registro esta semana</td>
                )}
              </tr>
            </tbody>
          </table>
        )}
        {data?.priorityRed && (
          <div className="px-4 py-2 border-t border-gray-100 text-[11px] text-red-800 bg-red-50">
            🔴 KPI priorizado: <strong>{data.priorityRed.sede} — {data.priorityRed.kpi}</strong> ({data.priorityRed.detail})
          </div>
        )}
      </div>
    </section>
  );
}
