"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ControlCargasProductos } from "./control-cargas";
import { Package, Upload, ArrowRight, Rocket, ShieldCheck, SlidersHorizontal, Search, FlaskConical, Eye } from "lucide-react";
import { formatCurrency, monthLabel } from "@/lib/utils";
import { getPortfolioStoryForSede } from "@/app/actions/portfolio-story";
import type { PortfolioStory, Verdict } from "@/lib/portfolio/types";
import { ImportSalesModal } from "@/app/[negocio]/productos/import-sales-modal";
import { BUSINESS_THEMES, type ScopeCode } from "@/lib/business-theme";

/**
 * Grupo → Productos · Centro de decisión del portafolio (pedido jul-2026):
 * "saber qué productos impulsar y cuáles sacar de carta, tipo matriz BCG;
 * yo cargo semanalmente el reporte de rotación de Byte".
 *
 * Principios:
 *  - MISMO cerebro que la página Productos de cada sede
 *    (compilePortfolioStory) — esta vista jamás la contradice; aquí solo
 *    se reúne y se resume para decidir.
 *  - El import pide la SEDE explícita (el reporte de Byte no dice de qué
 *    local es — lección /grupo aplicada también al dato).
 *  - Carga semanal ACUMULADA: exportar de Byte SIEMPRE "del 01 del mes a
 *    hoy"; re-subir reemplaza el mes (idempotente), nunca duplica.
 */

const SEDES: { id: number; name: string; code: ScopeCode }[] = [
  { id: 1, name: "Atelier", code: "atelier" },
  { id: 2, name: "Fonavi", code: "fonavi" },
  { id: 3, name: "Centro", code: "centro" },
];

const VERDICT_META: Record<Verdict, { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }> = {
  impulsar: { label: "Impulsar", icon: Rocket, cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  proteger: { label: "Proteger", icon: ShieldCheck, cls: "text-sky-700 bg-sky-50 border-sky-200" },
  ajustar_precio: { label: "Ajustar precio", icon: SlidersHorizontal, cls: "text-amber-700 bg-amber-50 border-amber-200" },
  revisar: { label: "Revisar", icon: Search, cls: "text-red-700 bg-red-50 border-red-200" },
  experimentar: { label: "Experimentar", icon: FlaskConical, cls: "text-violet-700 bg-violet-50 border-violet-200" },
  observar: { label: "Observar", icon: Eye, cls: "text-gray-600 bg-gray-50 border-gray-200" },
};

function currentMonth() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7);
}

type SedeStory = { sede: (typeof SEDES)[number]; story: PortfolioStory | null; error: string | null };

export function GrupoProductosClient() {
  const [month, setMonth] = useState(currentMonth());
  const [stories, setStories] = useState<SedeStory[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [importSede, setImportSede] = useState<{ id: number; name: string } | null>(null);

  const load = useCallback(async (m: string) => {
    setLoading(true);
    const results = await Promise.all(
      SEDES.map(async (sede) => {
        const r = await getPortfolioStoryForSede(sede.id, m);
        return r.ok
          ? { sede, story: r.story, error: null }
          : { sede, story: null, error: r.error };
      }),
    );
    setStories(results);
    setLoading(false);
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar/cambiar mes */
    load(month);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [month, load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="w-6 h-6 text-primary" /> Productos del Grupo
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Qué impulsar y qué revisar en cada carta — mismo análisis que la página Productos
            de cada sede, reunido para decidir.
          </p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-xs bg-white"
        />
      </div>

      {/* ¿Se está subiendo el reporte que alimenta todo esto? Va arriba
          porque un análisis con datos viejos es peor que no tenerlo:
          parece actual y no lo es. */}
      <ControlCargasProductos />

      {/* Carga semanal del reporte de Byte */}
      <section className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">📥 Carga semanal del reporte de Byte</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Exporta de Byte <strong>&ldquo;Platos con mayor rotación&rdquo;</strong> con rango
              <strong> del 01 del mes hasta hoy</strong> (acumulado) y súbelo aquí eligiendo la sede.
              Re-subir el mismo mes lo reemplaza con la foto más completa — nunca duplica.
            </p>
          </div>
          <div className="flex gap-2">
            {SEDES.map((s) => (
              <button
                key={s.id}
                onClick={() => setImportSede({ id: s.id, name: s.name })}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-primary hover:bg-primary-light rounded-lg"
              >
                <Upload className="w-3.5 h-3.5" /> {s.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      {loading || !stories ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">Analizando…</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {stories.map(({ sede, story, error }) => (
            <SedeColumn key={sede.id} sede={sede} story={story} error={error} month={month} />
          ))}
        </div>
      )}

      {importSede && (
        <ImportSalesModal
          sede={importSede}
          onClose={() => setImportSede(null)}
          onImported={() => load(month)}
        />
      )}
    </div>
  );
}

function SedeColumn({ sede, story, error, month }: SedeStory & { month: string }) {
  const theme = BUSINESS_THEMES[sede.code];
  if (!story) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4" style={{ borderTopColor: theme.color, borderTopWidth: 3 }}>
        <div className="text-sm font-semibold text-gray-900">{sede.name}</div>
        <div className="mt-3 text-xs text-gray-500">{error ?? `Sin ventas por producto cargadas para ${monthLabel(month)}.`}</div>
      </div>
    );
  }
  const { intelligence: intel, narrative } = story;
  const byVerdict = new Map<Verdict, typeof intel.products>();
  for (const p of intel.products) {
    const list = byVerdict.get(p.verdict) ?? [];
    list.push(p);
    byVerdict.set(p.verdict, list);
  }
  const health = intel.health;
  const healthCls =
    health.level === "saludable" ? "text-emerald-700 bg-emerald-50" :
    health.level === "estable" ? "text-sky-700 bg-sky-50" :
    health.level === "fragil" ? "text-amber-700 bg-amber-50" : "text-red-700 bg-red-50";

  // Orden de decisión: primero lo accionable, "observar" al final.
  const ORDER: Verdict[] = ["impulsar", "ajustar_precio", "revisar", "experimentar", "proteger", "observar"];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3" style={{ borderTopColor: theme.color, borderTopWidth: 3 }}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-900">{sede.name}</div>
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${healthCls}`}>
          Salud {health.total}/100 · {health.level}
        </span>
      </div>

      <p className="text-xs text-gray-600">{narrative.headline}</p>

      {intel.bcgSummary ? (
        <div className="grid grid-cols-4 gap-1.5 text-center">
          {([
            ["⭐", "Estrellas", intel.bcgSummary.estrellas],
            ["🐄", "Vacas", intel.bcgSummary.vacas],
            ["❓", "Interrog.", intel.bcgSummary.interrogantes],
            ["🐶", "Perros", intel.bcgSummary.perros],
          ] as const).map(([emoji, label, n]) => (
            <div key={label} className="bg-gray-50 rounded-lg py-1.5">
              <div className="text-sm">{emoji} <span className="font-semibold">{n}</span></div>
              <div className="text-[9px] uppercase text-gray-400">{label}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[11px] text-gray-400 bg-gray-50 rounded-lg px-2.5 py-1.5">
          Matriz BCG disponible con ≥3 meses de historia cargada.
        </div>
      )}

      <div className="space-y-2">
        {ORDER.map((v) => {
          const list = byVerdict.get(v);
          if (!list || list.length === 0 || v === "observar") return null;
          const meta = VERDICT_META[v];
          const Icon = meta.icon;
          return (
            <div key={v} className={`border rounded-lg px-2.5 py-2 ${meta.cls}`}>
              <div className="text-[11px] font-semibold flex items-center gap-1">
                <Icon className="w-3.5 h-3.5" /> {meta.label} ({list.length})
              </div>
              <div className="mt-1 space-y-0.5">
                {list.slice(0, 3).map((p) => (
                  <div key={p.key} className="text-[11px] flex justify-between gap-2">
                    <span className="truncate">{p.name}</span>
                    <span className="shrink-0 opacity-70">{formatCurrency(p.revenue)}</span>
                  </div>
                ))}
                {list.length > 3 && <div className="text-[10px] opacity-60">…y {list.length - 3} más</div>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-[10px] text-gray-400">
        Costos conocidos: {Math.round(health.costCoveragePct)}% de la venta
      </div>

      <Link
        href={`/${sede.code}/productos`}
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        Ver análisis completo de {sede.name} <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}
