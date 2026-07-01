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
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start justify-between gap-2 text-left"
      >
        <div className="flex items-start gap-2 min-w-0">
          <span className="mt-0.5 shrink-0">{s.icon}</span>
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-900">{insight.title}</div>
            <div className="text-xs text-gray-600 mt-0.5">{insight.what}</div>
          </div>
        </div>
        <span className="shrink-0 text-gray-400 mt-0.5">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
      </button>
      {open && (
        <div className="mt-2 pl-6 space-y-1.5 text-xs text-gray-700">
          {insight.why && (
            <div><span className="font-semibold text-gray-800">¿Por qué?</span> {insight.why}</div>
          )}
          {insight.consequence && (
            <div><span className="font-semibold text-gray-800">Si continúa:</span> {insight.consequence}</div>
          )}
        </div>
      )}
      {insight.action && (
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

            {/* Hoy te recomiendo: las acciones del día, en orden de prioridad */}
            {brief.recommendations.length > 0 && (
              <div className="mt-3 bg-white/70 border border-white rounded-lg px-3 py-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                  Hoy te recomiendo
                </div>
                <ul className="space-y-1">
                  {brief.recommendations.map((r, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-sm text-gray-800">
                      <span className="text-gray-400 mt-0.5">{i + 1}.</span>
                      {r.href ? (
                        <Link href={`/${negocio}/${r.href}`} className="text-primary font-medium hover:underline inline-flex items-center gap-1">
                          {r.label} <ArrowRight className="w-3 h-3" />
                        </Link>
                      ) : (
                        <span>{r.label}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Desglose de los 5 componentes */}
        {showBreakdown && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-5 gap-2">
            {health.components.map((c) => (
              <div key={c.key} className="bg-white/80 border border-gray-200 rounded-lg p-2.5" title={c.detail}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-medium text-gray-600">{c.label}</span>
                  <span className={`text-sm font-bold ${scoreColor(c.score)}`}>{c.score}</span>
                </div>
                <div className="text-[10px] text-gray-500 mt-1 leading-snug">{c.detail}</div>
              </div>
            ))}
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
