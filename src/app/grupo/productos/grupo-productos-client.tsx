"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ControlCargasProductos } from "./control-cargas";
import { ArrowRight, Rocket, ShieldCheck, SlidersHorizontal, Search, FlaskConical, Eye, Upload, Loader2, AlertTriangle } from "lucide-react";
import { formatCurrency, monthLabel } from "@/lib/utils";
import { getPortfolioStoryForSede } from "@/app/actions/portfolio-story";
import type { PortfolioStory, Verdict } from "@/lib/portfolio/types";
import { BUSINESS_THEMES, type ScopeCode } from "@/lib/business-theme";
import {
  getPanoramaProductosGrupo, getInformeTrimestral, getCruceFuentes, getCoberturaRotacion,
  type PanoramaDeSede, type InformeTrimestralSede, type CruceFuentes,
} from "@/app/actions/productos-panorama";
import type { PeriodoCargado } from "@/lib/productos/cobertura-rotacion";
import { CargasByte } from "./cargas-byte";
import { CandidatosReemplazo } from "./candidatos-reemplazo";
import { RankingPorCategoria, ReglaOchentaVeinte } from "./categorias-y-pareto";
import { ImportarReportesModal } from "./importar-reportes";
import { VistaMes } from "@/components/productos/vista-mes";
import { VistaTrimestre } from "@/components/productos/vista-trimestre";
import { Segmentado, fechaCorta } from "@/components/productos/ui";

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

type Pestana = "mes" | "trimestre" | "decisiones" | "cargas";

/** Orden en que se muestran las sedes en el selector (las cafeterías primero). */
const ORDEN_SEDES = [2, 3, 1];

export function GrupoProductosClient() {
  const [month, setMonth] = useState(currentMonth());
  const [sede, setSede] = useState(2);
  const [pestana, setPestana] = useState<Pestana>("mes");
  // Sube cuando se importan reportes: fuerza a recargar todo.
  const [version, setVersion] = useState(0);
  const [importar, setImportar] = useState<{ periodos: PeriodoCargado[] } | null>(null);
  const [abriendo, setAbriendo] = useState(false);

  async function abrirImportador() {
    setAbriendo(true);
    const r = await getCoberturaRotacion(6);
    setAbriendo(false);
    setImportar({ periodos: r.ok ? r.periodos : [] });
  }

  const sedesOrdenadas = ORDEN_SEDES.map((id) => SEDES.find((x) => x.id === id)!);

  return (
    <div className="space-y-6 max-w-[1400px] min-w-0">
      {/* Cabecera: lo que se elige una sola vez para toda la pantalla */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Productos</h1>
          <p className="text-sm text-gray-500 mt-1">Qué se vende en cada sede, cómo viene cambiando y qué decidir con la carta.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <Segmentado
            lleno
            valor={sede}
            onChange={setSede}
            opciones={sedesOrdenadas.map((x) => ({ valor: x.id, etiqueta: x.name }))}
          />
          <div className="flex gap-3 w-full sm:w-auto">
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              aria-label="Mes"
              className="flex-1 sm:flex-none min-w-0 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
            />
            <button
              type="button"
              onClick={abrirImportador}
              disabled={abriendo}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-light rounded-xl disabled:opacity-60 whitespace-nowrap"
            >
              {abriendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Subir reportes
            </button>
          </div>
        </div>
      </header>

      <div className="border-b border-gray-200">
        <nav className="flex gap-6 overflow-x-auto -mb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {([
            ["mes", "El mes"],
            ["trimestre", "Últimos 3 meses"],
            ["decisiones", "Decisiones de carta"],
            ["cargas", "Cargas de Byte"],
          ] as [Pestana, string][]).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setPestana(k)}
              className={`py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                pestana === k ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {pestana === "mes" && <PestanaMes key={`m-${version}-${month}`} month={month} sede={sede} onSede={setSede} />}
      {pestana === "trimestre" && <PestanaTrimestre key={`t-${version}-${month}-${sede}`} month={month} sede={sede} onSede={setSede} />}
      {pestana === "decisiones" && <PestanaDecisiones key={`d-${version}-${month}`} month={month} />}
      {pestana === "cargas" && (
        <div className="space-y-5">
          <CargasByte key={`c-${version}`} onImportado={() => setVersion((v) => v + 1)} />
          <ControlCargasProductos />
        </div>
      )}

      {importar && (
        <ImportarReportesModal
          sedeInicial={sede}
          periodos={importar.periodos}
          onClose={() => setImportar(null)}
          onImportado={() => setVersion((v) => v + 1)}
        />
      )}
    </div>
  );
}

/** Las tres sedes en una tira: se comparan de un vistazo y se elige una. */
function TiraSedes({ items, activa, onSede }: {
  items: { id: number; nombre: string; valor: number | null; detalle: string }[];
  activa: number;
  onSede: (id: number) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {items.map((x) => (
        <button
          key={x.id}
          type="button"
          onClick={() => onSede(x.id)}
          className={`text-left rounded-2xl border px-5 py-4 transition-colors ${
            x.id === activa ? "border-primary-light bg-primary-50/60 ring-1 ring-primary-light/30" : "border-gray-200/80 bg-white hover:border-gray-300"
          }`}
        >
          <div className="text-xs font-medium text-gray-500">{x.nombre}</div>
          <div className="text-xl font-semibold text-gray-900 tabular-nums mt-1">{x.valor === null ? "Sin reporte" : formatCurrency(x.valor)}</div>
          <div className="text-xs text-gray-500 mt-1">{x.detalle}</div>
        </button>
      ))}
    </div>
  );
}

function Cargando() {
  return (
    <div className="flex items-center justify-center py-20 text-gray-400">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  );
}

function Vacio({ children }: { children: React.ReactNode }) {
  return <div className="bg-white rounded-2xl border border-gray-200/80 px-6 py-12 text-center text-sm text-gray-500">{children}</div>;
}

function PestanaMes({ month, sede, onSede }: { month: string; sede: number; onSede: (id: number) => void }) {
  const [sedes, setSedes] = useState<PanoramaDeSede[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    getPanoramaProductosGrupo(month).then((r) => {
      if (!vivo) return;
      if (r.ok) setSedes(r.sedes); else setError(r.error);
    });
    return () => { vivo = false; };
  }, [month]);

  if (error) return <Vacio>{error}</Vacio>;
  if (!sedes) return <Cargando />;
  const sel = sedes.find((x) => x.businessId === sede);

  return (
    <div className="space-y-6">
      <TiraSedes
        activa={sede}
        onSede={onSede}
        items={ORDEN_SEDES.map((id) => {
          const x = sedes.find((y) => y.businessId === id)!;
          return {
            id, nombre: x.sede, valor: x.panorama?.ventas ?? null,
            detalle: x.panorama ? `${fechaCorta(x.panorama.desde)} al ${fechaCorta(x.panorama.hasta)} · ${formatCurrency(x.panorama.ventaPorDia)} por día` : "Falta subir el reporte de este mes",
          };
        })}
      />
      {sel?.panorama
        ? <VistaMes p={sel.panorama} cargadoEl={sel.cargadoEl} />
        : <Vacio>{sel?.sede ?? "Esta sede"} no tiene reporte de rotación de {monthLabel(month)}. Súbelo con «Subir reportes».</Vacio>}
      {/* Por categoría y 80/20 de la sede elegida (pedido de Jahnn, 24-sep-2026). */}
      {sel?.panorama && <RankingPorCategoria key={`cat-${sede}`} p={sel.panorama} sede={sede} month={month} />}
      <ReglaOchentaVeinte month={month} sede={sede} />
      {/* Fonavi y Centro juntas: no depende de la sede elegida arriba. */}
      <CandidatosReemplazo month={month} />
    </div>
  );
}

function PestanaTrimestre({ month, sede, onSede }: { month: string; sede: number; onSede: (id: number) => void }) {
  const [data, setData] = useState<{ sede: InformeTrimestralSede; comparativo: { businessId: number; sede: string; ventas: number; unidades: number }[] } | null>(null);
  const [cruce, setCruce] = useState<CruceFuentes[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([getInformeTrimestral(month, sede), getCruceFuentes(month)]).then(([r, c]) => {
      if (!vivo) return;
      if (r.ok) setData({ sede: r.sede, comparativo: r.comparativo }); else setError(r.error);
      if (c.ok) setCruce(c.sedes.filter((x) => x.aviso));
    });
    return () => { vivo = false; };
  }, [month, sede]);

  if (error) return <Vacio>{error}</Vacio>;
  if (!data) return <Cargando />;
  const t = data.sede.informe;
  const meses = data.sede.meses;

  return (
    <div className="space-y-6">
      <TiraSedes
        activa={sede}
        onSede={onSede}
        items={ORDEN_SEDES.map((id) => {
          const x = data.comparativo.find((y) => y.businessId === id);
          return {
            id, nombre: SEDES.find((s) => s.id === id)!.name, valor: x?.ventas ?? null,
            detalle: x ? `${x.unidades.toLocaleString("es-PE")} unidades · ${monthLabel(meses[0])} a ${monthLabel(meses[meses.length - 1])}` : "Sin reportes en esos meses",
          };
        })}
      />
      {cruce.length > 0 && (
        <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold">Las dos cargas de {monthLabel(month)} no coinciden</div>
            {cruce.map((c) => <div key={c.businessId}>{c.sede}: {c.aviso}</div>)}
          </div>
        </div>
      )}
      {t ? <VistaTrimestre t={t} meses={meses} /> : <Vacio>Esta sede no tiene reportes de rotación en esos meses.</Vacio>}
    </div>
  );
}

function PestanaDecisiones({ month }: { month: string }) {
  const [stories, setStories] = useState<SedeStory[] | null>(null);

  const load = useCallback(async (m: string) => {
    const results = await Promise.all(
      ORDEN_SEDES.map((id) => SEDES.find((x) => x.id === id)!).map(async (sede) => {
        const r = await getPortfolioStoryForSede(sede.id, m);
        return r.ok ? { sede, story: r.story, error: null } : { sede, story: null, error: r.error };
      }),
    );
    setStories(results);
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar/cambiar mes */
    void load(month);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [month, load]);

  if (!stories) return <Cargando />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 max-w-3xl">
        Qué impulsar, qué proteger y qué revisar en la carta de cada sede, cruzando lo que se vende con lo que cuesta.
        Es el mismo análisis de la página Productos de cada sede, reunido para decidir.
      </p>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {stories.map(({ sede, story, error }) => (
          <SedeColumn key={sede.id} sede={sede} story={story} error={error} month={month} />
        ))}
      </div>
    </div>
  );
}

function SedeColumn({ sede, story, error, month }: SedeStory & { month: string }) {
  const theme = BUSINESS_THEMES[sede.code];
  if (!story) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200/80 p-5" style={{ borderTopColor: theme.color, borderTopWidth: 3 }}>
        <div className="text-base font-semibold text-gray-900">{sede.name}</div>
        <div className="mt-3 text-sm text-gray-500">{error ?? `Sin ventas por producto cargadas para ${monthLabel(month)}.`}</div>
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
    <div className="bg-white rounded-2xl border border-gray-200/80 p-5 space-y-4" style={{ borderTopColor: theme.color, borderTopWidth: 3 }}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-base font-semibold text-gray-900">{sede.name}</div>
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${healthCls}`}>
          Salud {health.total}/100 · {health.level}
        </span>
      </div>

      <p className="text-sm text-gray-600 leading-relaxed">{narrative.headline}</p>

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
            <div key={v} className={`border rounded-xl px-3.5 py-3 ${meta.cls}`}>
              <div className="text-xs font-semibold flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5" /> {meta.label} ({list.length})
              </div>
              <div className="mt-2 space-y-1.5">
                {list.slice(0, 5).map((p) => (
                  <div key={p.key} className="text-xs flex justify-between gap-3">
                    <span className="leading-snug">{p.name}</span>
                    <span className="shrink-0 opacity-70 tabular-nums">{formatCurrency(p.revenue)}</span>
                  </div>
                ))}
                {list.length > 5 && <div className="text-[11px] opacity-60">…y {list.length - 5} más</div>}
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
