"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Package, Upload, Database, ChevronDown, ChevronRight, Shield, TrendingUp,
  Tag, FlaskConical, SearchCheck, Eye, AlertTriangle, CircleHelp, Star,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  getProductDataStatus,
  type ProductDataStatus,
} from "@/app/actions/product-sales-import";
import { getPortfolioStory } from "@/app/actions/portfolio-story";
import type { PortfolioStory, ProductIntel, Verdict } from "@/lib/portfolio/types";
import { ImportSalesModal } from "./import-sales-modal";

/**
 * PIC · Inteligencia Comercial — el Director Comercial digital.
 * Fase 1: Health Score, resumen ejecutivo, recomendaciones, veredictos
 * por producto (con evidencia expandible), evidencia metodológica,
 * calidad de datos y cierre para decisión. Un solo cerebro (Story).
 */

const VERDICT_ORDER: Verdict[] = ["proteger", "ajustar_precio", "impulsar", "experimentar", "revisar", "observar"];

const VERDICT_UI: Record<Verdict, { label: string; Icon: typeof Shield; cls: string }> = {
  proteger: { label: "Proteger", Icon: Shield, cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  ajustar_precio: { label: "Ajustar precio", Icon: Tag, cls: "text-amber-700 bg-amber-50 border-amber-200" },
  impulsar: { label: "Impulsar", Icon: TrendingUp, cls: "text-blue-700 bg-blue-50 border-blue-200" },
  experimentar: { label: "Experimentar", Icon: FlaskConical, cls: "text-violet-700 bg-violet-50 border-violet-200" },
  revisar: { label: "Revisión estratégica", Icon: SearchCheck, cls: "text-red-700 bg-red-50 border-red-200" },
  observar: { label: "Observar", Icon: Eye, cls: "text-gray-600 bg-gray-50 border-gray-200" },
};

const QUADRANT_LABEL: Record<string, string> = {
  star: "⭐ Star",
  plow_horse: "🐴 Plow horse",
  puzzle: "🧩 Puzzle",
  dog: "🐶 Dog",
};

function monthLabel(m: string) {
  const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1);
  const s = d.toLocaleDateString("es-PE", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function ProductosPage() {
  const [status, setStatus] = useState<ProductDataStatus | null>(null);
  const [story, setStory] = useState<PortfolioStory | null>(null);
  const [storyError, setStoryError] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [showFoundation, setShowFoundation] = useState(false);

  const load = useCallback(async (pickMonth?: string | null) => {
    setLoading(true);
    const st = await getProductDataStatus();
    setStatus(st);
    const m = pickMonth ?? st.months[0]?.month ?? null;
    setMonth(m);
    if (m) {
      const r = await getPortfolioStory(m);
      if (r.ok) { setStory(r.story); setStoryError(null); }
      else { setStory(null); setStoryError(r.error); }
    } else {
      setStory(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    load();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load]);

  const intel = story?.intelligence ?? null;
  const grouped = useMemo(() => {
    if (!intel) return [];
    return VERDICT_ORDER.map((v) => ({
      verdict: v,
      products: intel.products.filter((p) => p.verdict === v).sort((a, b) => b.revenue - a.revenue),
    })).filter((g) => g.products.length > 0);
  }, [intel]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Inteligencia Comercial
          </h1>
          {story && <p className="text-xs text-gray-500 mt-1">{story.narrative.headline}</p>}
        </div>
        <div className="flex items-center gap-2">
          {status && status.months.length > 0 && (
            <select
              value={month ?? ""}
              onChange={(e) => load(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-xs bg-white"
            >
              {status.months.map((m) => (
                <option key={m.month} value={m.month}>{monthLabel(m.month)}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-primary hover:bg-primary-light rounded-lg"
          >
            <Upload className="w-3.5 h-3.5" />
            Importar mes (Byte)
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">Analizando…</div>
      ) : !story ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center space-y-3">
          <div className="text-sm text-gray-600">
            {storyError ?? "Sube el reporte de Byte “Productos con mayor rotación” de un mes cerrado para encender el análisis."}
          </div>
          <button
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-primary hover:bg-primary-light rounded-lg"
          >
            <Upload className="w-3.5 h-3.5" /> Importar ventas del mes
          </button>
        </div>
      ) : intel && (
        <>
          {/* 1 · Health Score */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex flex-wrap items-center gap-6">
              <div className="text-center">
                <div className={`text-4xl font-black ${intel.health.total >= 75 ? "text-emerald-600" : intel.health.total >= 55 ? "text-primary" : intel.health.total >= 35 ? "text-amber-600" : "text-red-600"}`}>
                  {intel.health.total}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-gray-500">Portfolio Health</div>
                <div className="text-xs font-semibold text-gray-700 capitalize">{intel.health.level}</div>
              </div>
              <div className="flex-1 min-w-[260px] grid grid-cols-2 md:grid-cols-3 gap-2">
                {intel.health.components.map((c) => (
                  <div key={c.id} className="rounded-lg border border-gray-100 px-3 py-2" title={c.formula}>
                    <div className="flex items-center justify-between text-[11px] text-gray-500">
                      <span>{c.label}</span>
                      <span className={`font-semibold ${c.score === null ? "text-gray-400" : "text-gray-800"}`}>
                        {c.score === null ? "—" : Math.round(c.score)}
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                      {c.score !== null && (
                        <div
                          className={`h-full rounded-full ${c.score >= 70 ? "bg-emerald-500" : c.score >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                          style={{ width: `${Math.round(c.score)}%` }}
                        />
                      )}
                    </div>
                    {c.unavailableReason && (
                      <div className="text-[10px] text-gray-400 mt-0.5">{c.unavailableReason}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="text-[11px] text-gray-400 mt-3">
              Pasa el mouse sobre cada componente para ver su fórmula. Cobertura de costos: {intel.health.costCoveragePct}% de la venta.
            </div>
          </div>

          {/* 2 · Resumen del Director Comercial */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <div className="text-sm font-semibold text-gray-900">Resumen del Director Comercial</div>
            {story.narrative.executiveSummary.map((p, i) => (
              <p key={i} className={`text-sm leading-relaxed ${p.tone === "riesgo" ? "text-red-800" : p.tone === "atencion" ? "text-amber-800" : "text-gray-700"}`}>
                {p.text}
              </p>
            ))}
            {story.narrative.dataCaveat && (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                {story.narrative.dataCaveat.text}
              </div>
            )}
          </div>

          {/* 3 · Qué hacer este mes */}
          {intel.recommendations.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">
                Qué hacer este mes
              </div>
              {intel.recommendations.map((r) => (
                <div key={r.id} className="px-5 py-3 border-b border-gray-50 last:border-0 flex gap-4">
                  <div className="text-2xl font-black text-primary-light w-8 shrink-0">{r.priority}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900">{r.action}</div>
                    <div className="text-xs text-gray-600 mt-0.5">{r.why}</div>
                    <div className="text-[11px] text-gray-400 mt-1">
                      Beneficio ~{formatCurrency(r.expectedBenefit)}/mes · No actuar: {r.inactionCost} · {r.timeframe} · confianza {r.confidence}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 4 · Veredictos por producto */}
          <div className="space-y-4">
            {grouped.map(({ verdict, products }) => {
              const ui = VERDICT_UI[verdict];
              return (
                <div key={verdict} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className={`px-5 py-3 border-b flex items-center gap-2 ${ui.cls}`}>
                    <ui.Icon className="w-4 h-4" />
                    <span className="text-sm font-semibold">{ui.label}</span>
                    <span className="text-xs opacity-70">· {products.length} producto{products.length === 1 ? "" : "s"}</span>
                  </div>
                  <div className="px-5 py-2 text-[11px] text-gray-500 border-b border-gray-50">
                    {story.narrative.verdictIntro[verdict]}
                  </div>
                  {products.map((p) => (
                    <ProductRow key={p.key} p={p} />
                  ))}
                </div>
              );
            })}
          </div>

          {/* 5 · Evidencia metodológica */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-xs font-semibold text-gray-900 mb-2 flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-primary" /> Menu Engineering
              </div>
              <div className="text-xs text-gray-600 space-y-1">
                <div>⭐ Stars: <strong>{intel.menuEngSummary.stars}</strong> · 🐴 Plow horses: <strong>{intel.menuEngSummary.plowHorses}</strong></div>
                <div>🧩 Puzzles: <strong>{intel.menuEngSummary.puzzles}</strong> · 🐶 Dogs: <strong>{intel.menuEngSummary.dogs}</strong></div>
                {intel.menuEngSummary.healthyContributionShare !== null && (
                  <div className="text-[11px] text-gray-400 mt-1">
                    {intel.menuEngSummary.healthyContributionShare}% de la utilidad viene de productos populares.
                  </div>
                )}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-xs font-semibold text-gray-900 mb-2">Pareto (ABC)</div>
              <div className="text-xs text-gray-600 space-y-1">
                <div>Clase A: <strong>{intel.abcSummary.aCount}</strong> productos → {intel.abcSummary.aRevenueShare}% de la venta</div>
                <div>Clase B: <strong>{intel.abcSummary.bCount}</strong> · Clase C: <strong>{intel.abcSummary.cCount}</strong></div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-xs font-semibold text-gray-900 mb-2">Concentración</div>
              <div className="text-xs text-gray-600 space-y-1">
                <div>Top 1: <strong>{intel.concentration.top1Share}%</strong> · Top 3: <strong>{intel.concentration.top3Share}%</strong> de la venta</div>
                {intel.concentration.topCategory && (
                  <div>Categoría líder: {intel.concentration.topCategory.name} ({intel.concentration.topCategory.share}%)</div>
                )}
                <div className={`font-medium ${intel.concentration.severity === "alta" ? "text-red-600" : intel.concentration.severity === "media" ? "text-amber-600" : "text-emerald-600"}`}>
                  Riesgo {intel.concentration.severity}
                </div>
              </div>
            </div>
          </div>
          {intel.inactiveMethodologies.length > 0 && (
            <div className="text-[11px] text-gray-400">
              Análisis aún inactivos (honestidad): {intel.inactiveMethodologies.map((m) => `${m.id} — ${m.reason}`).join(" · ")}
            </div>
          )}

          {/* 6 · Calidad de datos */}
          {intel.dataQuality.costCoveragePct < 95 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="text-sm font-semibold text-gray-900 mb-2">Calidad de datos — la tarea que más rinde</div>
              <div className="text-xs text-gray-600 mb-2">
                {formatCurrency(intel.dataQuality.uncostedRevenue)}/mes de venta sin costo conocido
                ({intel.dataQuality.productsTotal - intel.dataQuality.productsWithCost} productos). Costear estos primero:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {intel.dataQuality.topUncosted.map((u) => (
                  <span key={u.name} className="text-[11px] bg-gray-100 text-gray-700 rounded-full px-2.5 py-1">
                    {u.name} · {formatCurrency(u.revenue)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 7 · Para Decisión del Directorio */}
          <div className="bg-primary rounded-xl p-5 text-white space-y-3">
            <div className="text-sm font-bold uppercase tracking-wide">Para Decisión del Directorio</div>
            <div className="space-y-1.5">
              {intel.boardDecisions.map((d, i) => (
                <div key={d.id} className="text-sm"><strong>{i + 1}.</strong> {d.decision} <span className="opacity-70">(~{formatCurrency(d.impact)}/mes)</span></div>
              ))}
            </div>
            {intel.boardQuestions.length > 0 && (
              <div className="pt-2 border-t border-white/20 space-y-1.5">
                {intel.boardQuestions.map((q) => (
                  <div key={q.id} className="text-xs flex gap-2">
                    <CircleHelp className="w-4 h-4 shrink-0 mt-0.5 opacity-70" />
                    <span><strong>{q.question}</strong> <span className="opacity-70">{q.context}</span></span>
                  </div>
                ))}
              </div>
            )}
            <div className="pt-2 border-t border-white/20 text-xs opacity-90">{story.narrative.boardClose.expectedOutcome.text}</div>
            <div className="text-xs opacity-90">{story.narrative.boardClose.inactionRisk.text}</div>
          </div>
        </>
      )}

      {/* 8 · Cimiento de datos (plegable) */}
      {status && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => setShowFoundation((v) => !v)}
            className="w-full px-5 py-3 flex items-center gap-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            {showFoundation ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <Database className="w-4 h-4 text-primary" />
            Cimiento de datos ({status.catalog.active} productos en catálogo · {status.months.length} mes{status.months.length === 1 ? "" : "es"} cargado{status.months.length === 1 ? "" : "s"})
          </button>
          {showFoundation && (
            <div className="border-t border-gray-100">
              {status.months.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-500">Sin meses importados todavía.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase text-gray-500 bg-gray-50">
                      <th className="text-left px-4 py-2 font-medium">Mes</th>
                      <th className="text-right px-4 py-2 font-medium">Productos</th>
                      <th className="text-right px-4 py-2 font-medium">Match catálogo</th>
                      <th className="text-right px-4 py-2 font-medium">Ventas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.months.map((m) => {
                      const pct = m.products ? Math.round((m.matched / m.products) * 100) : 0;
                      return (
                        <tr key={m.month} className="border-t border-gray-100">
                          <td className="px-4 py-2 font-medium text-gray-900">{monthLabel(m.month)}</td>
                          <td className="px-4 py-2 text-right text-gray-700">{m.products}</td>
                          <td className={`px-4 py-2 text-right font-medium ${pct >= 80 ? "text-emerald-600" : pct >= 40 ? "text-amber-600" : "text-gray-500"}`}>
                            {m.matched}/{m.products} ({pct}%)
                          </td>
                          <td className="px-4 py-2 text-right font-semibold text-gray-900">{formatCurrency(m.totalRevenue)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {showImport && (
        <ImportSalesModal onClose={() => setShowImport(false)} onImported={() => load(month)} />
      )}
    </div>
  );
}

/** Fila de producto con evidencia expandible (por qué su veredicto). */
function ProductRow({ p }: { p: ProductIntel }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-50 last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-2 flex items-center justify-between gap-3 hover:bg-gray-50 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
          <span className="text-xs font-medium text-gray-900 truncate">{p.name}</span>
          <span className="text-[10px] text-gray-400 shrink-0 hidden md:inline">{p.category ?? ""}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0 text-[11px] text-gray-500">
          {p.menuEng && <span>{QUADRANT_LABEL[p.menuEng]}</span>}
          <span className="font-mono bg-gray-100 rounded px-1.5 py-0.5">{p.abcClass}</span>
          <span>{p.units} und</span>
          <span className="font-semibold text-gray-800">{formatCurrency(p.revenue)}</span>
          <span className={`w-14 text-right font-medium ${p.marginPct === null ? "text-gray-400" : p.marginPct >= 55 ? "text-emerald-600" : p.marginPct >= 35 ? "text-amber-600" : "text-red-600"}`}>
            {p.marginPct === null ? "s/costo" : `${p.marginPct}%`}
          </span>
        </div>
      </button>
      {open && (
        <div className="px-11 pb-3 text-xs text-gray-600 space-y-1">
          <div>{p.verdictReason}</div>
          {p.menuEngReason && <div className="text-[11px] text-gray-400">Evidencia ME: {p.menuEngReason}</div>}
          {p.hasCost && (
            <div className="text-[11px] text-gray-400">
              Precio prom. {formatCurrency(p.avgPrice)} · costo {formatCurrency(p.unitCogs!)} · contribución {formatCurrency(p.unitContribution!)}/und · utilidad del mes {formatCurrency(p.contribution!)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
