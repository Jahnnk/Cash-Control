"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  Info,
  Sparkles,
  ChevronDown,
  ChevronRight,
  ArrowRight,
} from "lucide-react";
import type { CommandCenterData } from "@/app/actions/command-center";
import type { Insight } from "@/lib/decision-intelligence";

/**
 * Centro de Comando — capa de Decision Intelligence del Dashboard.
 * Executive Brief (estado + 3 temas del día) · Health Score 0-100 con
 * desglose · alertas priorizadas por impacto con acción recomendada.
 */

const LEVEL_STYLE: Record<string, { bar: string; text: string; chip: string }> = {
  sano:     { bar: "bg-emerald-500", text: "text-emerald-700", chip: "bg-emerald-50 border-emerald-200" },
  estable:  { bar: "bg-lime-500",    text: "text-lime-700",    chip: "bg-lime-50 border-lime-200" },
  atencion: { bar: "bg-amber-500",   text: "text-amber-700",   chip: "bg-amber-50 border-amber-200" },
  critico:  { bar: "bg-red-500",     text: "text-red-700",     chip: "bg-red-50 border-red-200" },
};

const SEV_STYLE: Record<Insight["severity"], { icon: React.ReactNode; box: string; label: string }> = {
  critico:     { icon: <AlertOctagon className="w-4 h-4 text-red-600" />,     box: "border-red-200 bg-red-50/60",     label: "Crítico" },
  aviso:       { icon: <AlertTriangle className="w-4 h-4 text-amber-600" />,  box: "border-amber-200 bg-amber-50/60", label: "Aviso" },
  info:        { icon: <Info className="w-4 h-4 text-blue-500" />,            box: "border-blue-100 bg-blue-50/50",   label: "Info" },
  oportunidad: { icon: <Sparkles className="w-4 h-4 text-emerald-600" />,     box: "border-emerald-200 bg-emerald-50/60", label: "Oportunidad" },
};

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-lime-600";
  if (score >= 40) return "text-amber-600";
  return "text-red-600";
}

function InsightCard({ insight, negocio }: { insight: Insight; negocio: string }) {
  const [open, setOpen] = useState(false);
  const s = SEV_STYLE[insight.severity];
  return (
    <div className={`border rounded-lg p-3 ${s.box}`}>
      {/* Cerrada: SOLO el título (la decisión). El detalle, al expandir. */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0">{s.icon}</span>
          <div className="text-sm font-medium text-gray-900 truncate">{insight.title}</div>
        </div>
        <span className="shrink-0 text-gray-400">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
      </button>
      {open && (
        <div className="mt-2 pl-6 space-y-1.5 text-xs text-gray-700">
          <div>{insight.what}</div>
          {insight.why && (
            <div><span className="font-semibold text-gray-800">¿Por qué?</span> {insight.why}</div>
          )}
          {insight.consequence && (
            <div><span className="font-semibold text-gray-800">Si continúa:</span> {insight.consequence}</div>
          )}
        </div>
      )}
      {open && insight.action && (
        <div className="mt-2 pl-6">
          <Link
            href={`/${negocio}/${insight.action.href}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {insight.action.label} <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}
    </div>
  );
}

export function CommandCenter({ data, negocio }: { data: CommandCenterData; negocio: string }) {
  const { brief, health, insights } = data;
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const style = LEVEL_STYLE[health.level];

  // El brief ya trae los 3 temas + oportunidades; el resto queda plegado.
  const featuredIds = new Set([
    ...brief.topIssues.map((i) => i.id),
    ...brief.opportunities.map((i) => i.id),
  ]);
  const remaining = insights.filter((i) => !featuredIds.has(i.id));

  return (
    <div className="space-y-4">
      {/* ── Executive Brief + Health Score ── */}
      <div className={`border rounded-xl p-5 ${style.chip}`}>
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          {/* Score */}
          <button
            onClick={() => setShowBreakdown((v) => !v)}
            className="flex sm:flex-col items-center gap-2 sm:gap-0 shrink-0 sm:w-24 text-center"
            title="Ver el desglose del puntaje"
          >
            <div className={`text-4xl font-extrabold ${scoreColor(health.total)}`}>{health.total}</div>
            <div className="text-[11px] text-gray-500 leading-tight">Salud del negocio<br className="hidden sm:block" /> /100</div>
          </button>
          {/* Brief */}
          <div className="min-w-0 flex-1">
            <div className={`flex items-center gap-2 text-base font-semibold ${style.text}`}>
              <ShieldCheck className="w-5 h-5 shrink-0" />
              {brief.headline}
            </div>
            <p className="text-sm text-gray-700 mt-1.5 leading-relaxed">{brief.summary}</p>
            <div className="mt-2 h-1.5 bg-white/70 rounded-full overflow-hidden">
              <div className={`h-full ${style.bar}`} style={{ width: `${health.total}%` }} />
            </div>

            {/* LA ACCIÓN DE HOY: la #1 destacada (beneficio + por qué es la
                primera + costo de no actuar), el resto compacto debajo. */}
            {brief.recommendations.length > 0 && (
              <div className="mt-3 bg-white/80 border border-white rounded-lg px-3.5 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  La acción de hoy
                </div>
                <div className="mt-1">
                  {brief.recommendations[0].href ? (
                    <Link
                      href={`/${negocio}/${brief.recommendations[0].href}`}
                      className="text-base font-bold text-primary hover:underline inline-flex items-center gap-1.5"
                    >
                      {brief.recommendations[0].label} <ArrowRight className="w-4 h-4" />
                    </Link>
                  ) : (
                    <span className="text-base font-bold text-gray-900">{brief.recommendations[0].label}</span>
                  )}
                  <div className="mt-1 space-y-0.5 text-xs">
                    {brief.recommendations[0].benefit && (
                      <div className="text-emerald-700">✓ Beneficio: {brief.recommendations[0].benefit}</div>
                    )}
                    {brief.recommendations[0].inactionCost && (
                      <div className="text-red-700">✗ Si no actúas: {brief.recommendations[0].inactionCost}</div>
                    )}
                    {brief.topActionReason && (
                      <div className="text-gray-500">{brief.topActionReason}</div>
                    )}
                  </div>
                </div>
                {brief.recommendations.length > 1 && (
                  <div className="mt-2.5 pt-2 border-t border-gray-100">
                    <div className="text-[11px] font-medium text-gray-400 mb-1">Después:</div>
                    <ul className="space-y-1">
                      {brief.recommendations.slice(1).map((r, i) => (
                        <li key={i} className="text-sm text-gray-700">
                          <span className="text-gray-400 mr-1">{i + 2}.</span>
                          {r.href ? (
                            <Link href={`/${negocio}/${r.href}`} className="text-primary font-medium hover:underline">
                              {r.label}
                            </Link>
                          ) : (
                            <span>{r.label}</span>
                          )}
                          {r.benefit && <span className="text-xs text-gray-500"> — {r.benefit}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Desglose 100% auditable: dato de entrada, escala, peso y aporte */}
        {showBreakdown && (
          <div className="mt-4 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
              {health.components.map((c) => (
                <div key={c.key} className="bg-white/80 border border-gray-200 rounded-lg p-2.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px] font-medium text-gray-600">{c.label}</span>
                    <span className={`text-sm font-bold ${scoreColor(c.score)}`}>{c.score}</span>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1 leading-snug">{c.detail}</div>
                  <div className="text-[10px] text-gray-400 mt-1.5 pt-1.5 border-t border-gray-100 leading-snug font-mono">
                    {c.formula}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1">
                    Aporte: {c.score} × {Math.round(c.weight * 100)}% = <strong>{Math.round(c.score * c.weight)}</strong> pts
                  </div>
                </div>
              ))}
            </div>
            <div className="text-[11px] text-gray-500 text-right pr-1">
              Total = {health.components.map((c) => Math.round(c.score * c.weight)).join(" + ")} ={" "}
              <strong className={scoreColor(health.total)}>{health.total}/100</strong>
              <span className="text-gray-400"> (suma redondeada)</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Los temas del día ── */}
      {(brief.topIssues.length > 0 || brief.opportunities.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {brief.topIssues.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Lo importante hoy
              </div>
              {brief.topIssues.map((i) => (
                <InsightCard key={i.id} insight={i} negocio={negocio} />
              ))}
            </div>
          )}
          {brief.opportunities.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Oportunidades
              </div>
              {brief.opportunities.map((i) => (
                <InsightCard key={i.id} insight={i} negocio={negocio} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Resto de señales (plegado) ── */}
      {remaining.length > 0 && (
        <div>
          <button
            onClick={() => setShowAll((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700"
          >
            {showAll ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Otras señales ({remaining.length})
          </button>
          {showAll && (
            <div className="mt-2 grid grid-cols-1 lg:grid-cols-2 gap-2">
              {remaining.map((i) => (
                <InsightCard key={i.id} insight={i} negocio={negocio} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
