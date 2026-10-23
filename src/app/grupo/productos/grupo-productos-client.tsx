"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ControlCargasProductos } from "./control-cargas";
import { ArrowRight, Upload, Loader2, AlertTriangle } from "lucide-react";
import { monthLabel } from "@/lib/utils";
import {
  getPanoramaProductosGrupo, getPanoramaCafeterias, getInformeTrimestral, getCruceFuentes, getCoberturaRotacion,
  getPanoramaProductos, getRepartoCanalAtelier,
  type PanoramaDeSede, type PanoramaCafeterias, type InformeTrimestralSede, type CruceFuentes,
} from "@/app/actions/productos-panorama";
import { CAFETERIAS, NOMBRE_CAFETERIAS } from "@/lib/productos/cafeterias";
import { ATELIER, ATELIER_CAFETERIAS as ATELIER_CAFETERIAS_VISTA, ATELIER_B2B as ATELIER_B2B_VISTA, VISTAS_ATELIER, esCanalAtelier, sedeReal, type RepartoCanal } from "@/lib/productos/canal-atelier";
import type { PeriodoCargado } from "@/lib/productos/cobertura-rotacion";
import { CargasByte } from "./cargas-byte";
import { CandidatosReemplazo } from "./candidatos-reemplazo";
import { RankingPorCategoria, ReglaOchentaVeinte } from "./categorias-y-pareto";
import { ProductosSinVenta } from "./productos-sin-venta";
import { RentabilidadProductos } from "./rentabilidad-productos";
import { PisoPrecios } from "./piso-precios";
import { ManoDeObra } from "./mano-de-obra";
import { DatosCargados } from "./datos-cargados";
import { ImportarReportesModal } from "./importar-reportes";
import { VistaMes } from "@/components/productos/vista-mes";
import { VistaTrimestre } from "@/components/productos/vista-trimestre";
import { fechaCorta, Segmentado } from "@/components/productos/ui";

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
 *
 * UN SOLO CEREBRO (decisión de Jahnn, 8-oct-2026): la página Productos de cada sede es ESTA
 * pantalla con la sede fija (`sedeFija`). Se retiró la vista vieja («Inteligencia Comercial»,
 * Portfolio Health, Star/Plow horse, Board Package) y la pestaña «Decisiones de carta»: conocían
 * el costo de ~49% de lo vendido y podían contradecir a «¿Dónde ganamos plata?» y a «Candidatos
 * a reemplazo», que usan el Excel de pricing (~99%).
 *
 * UX (8-oct-2026): la tira de sedes ES el selector (antes había otro arriba); sin las 4 cifras
 * que repetían la tarjeta elegida; montos sin céntimos.
 */

function currentMonth() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7);
}

type Pestana = "mes" | "trimestre" | "cargas";

/** Las opciones de la tira: «Fonavi + Centro» (las dos cafeterías juntas) y cada sede. */
const OPCIONES_SEDE: { id: number; name: string }[] = [
  { id: CAFETERIAS, name: NOMBRE_CAFETERIAS },
  { id: 2, name: "Fonavi" },
  { id: 3, name: "Centro" },
  { id: 1, name: "Atelier" },
];
const ORDEN_TIRA = OPCIONES_SEDE.map((x) => x.id);
const nombreSede = (id: number) => OPCIONES_SEDE.find((x) => x.id === id)?.name ?? `Sede ${id}`;
const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;

export function GrupoProductosClient({ sedeFija = null }: { sedeFija?: number | null } = {}) {
  const [month, setMonth] = useState(currentMonth());
  // Por defecto las dos cafeterías juntas: la carta es la misma y se decide junta (5-oct-2026).
  const [sedeElegida, setSede] = useState(CAFETERIAS);
  const sedeBase = sedeFija ?? sedeElegida;
  // Atelier se mira por canal (22-oct-2026): «Todo», «A las cafeterías (Y-)» o «B2B externo (P-)».
  const [canal, setCanal] = useState(ATELIER);
  const sede = sedeBase === ATELIER ? canal : sedeBase;
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

  const pestanas: [Pestana, string][] = [["mes", "El mes"], ["trimestre", "Últimos 3 meses"]];
  if (sedeFija === null) pestanas.push(["cargas", "Cargas de Byte"]);

  return (
    <div className="space-y-5 max-w-[1400px] min-w-0">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Productos</h1>
          {sedeFija !== null && (
            <Link href="/grupo/productos" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline mt-1">
              Ver las 3 sedes y las cargas de Byte <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
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
            {abriendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Subir reportes de Byte
          </button>
        </div>
      </header>

      {/* Qué fechas cubren los reportes de Byte cargados (4-oct-2026): una línea; el detalle, a un toque. */}
      <DatosCargados version={version} soloSede={sedeFija} />

      <div className="border-b border-gray-200">
        <nav className="flex gap-6 overflow-x-auto -mb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {pestanas.map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setPestana(k)}
              aria-current={pestana === k ? "page" : undefined}
              className={`py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                pestana === k ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {pestana === "mes" && <PestanaMes key={`m-${version}-${month}`} month={month} sede={sede} onSede={sedeFija === null ? setSede : null} onMes={setMonth} onCanal={setCanal} />}
      {pestana === "trimestre" && <PestanaTrimestre key={`t-${version}-${month}-${sede}`} month={month} sede={sede} onSede={sedeFija === null ? setSede : null} onCanal={setCanal} />}
      {pestana === "cargas" && (
        <div className="space-y-5">
          <CargasByte key={`c-${version}`} onImportado={() => setVersion((v) => v + 1)} />
          <ControlCargasProductos />
        </div>
      )}

      {importar && (
        <ImportarReportesModal
          sedeInicial={sede === CAFETERIAS ? 2 : sedeReal(sede)}
          periodos={importar.periodos}
          onClose={() => setImportar(null)}
          onImportado={() => setVersion((v) => v + 1)}
        />
      )}
    </div>
  );
}

/** Las dos cafeterías juntas y cada sede en una tira: se comparan de un vistazo y se elige una. */
function TiraSedes({ items, activa, onSede }: {
  items: { id: number; nombre: string; valor: number | null; detalle: string }[];
  activa: number;
  onSede: (id: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
      {items.map((x) => (
        <button
          key={x.id}
          type="button"
          onClick={() => onSede(x.id)}
          aria-pressed={x.id === activa}
          className={`text-left rounded-2xl border px-3.5 py-3 sm:px-5 sm:py-4 transition-colors min-w-0 ${
            x.id === activa ? "border-primary-light bg-primary-50/60 ring-1 ring-primary-light/30" : "border-gray-200/80 bg-white hover:border-gray-300"
          }`}
        >
          <div className="text-xs font-medium text-gray-500">{x.nombre}</div>
          <div className="text-lg sm:text-xl font-semibold text-gray-900 tabular-nums mt-1">{x.valor === null ? "Sin reporte" : soles(x.valor)}</div>
          <div className="text-[11px] sm:text-xs text-gray-500 mt-1 leading-snug">{x.detalle}</div>
        </button>
      ))}
    </div>
  );
}

/**
 * Atelier por canal (22-oct-2026): el selector y, en el mes, cuánto pesa cada canal y cómo se decide en cada uno. El prefijo
 * de Byte lo dice: «Y-» = a las cafeterías, «P-» = a otros B2B, sin prefijo = sub-recetas (lib/productos/canal-atelier.ts).
 */
function CanalAtelier({ vista, onCanal, reparto }: { vista: number; onCanal: (id: number) => void; reparto: RepartoCanal | null }) {
  const pct = (n: number) => (reparto && reparto.total > 0 ? `${Math.round((n / reparto.total) * 100)}%` : "—");
  return (
    <section className="rounded-2xl border border-gray-200/80 bg-white px-4 py-4 sm:px-5 space-y-3" aria-label="Atelier por canal">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-900">Atelier por canal</h2>
        <Segmentado tamano="sm" valor={vista} onChange={onCanal} opciones={VISTAS_ATELIER.map((v) => ({ valor: v.id, etiqueta: v.corto }))} />
      </div>
      {reparto && (
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { t: "A las cafeterías (Y-)", v: reparto.cafeterias },
            { t: "B2B externo (P-)", v: reparto.b2b },
            { t: "Sub-recetas", v: reparto.subRecetas },
          ].map((x) => (
            <div key={x.t} className="rounded-xl bg-gray-50 px-2 py-2">
              <div className="text-[11px] text-gray-500">{x.t}</div>
              <div className="text-base font-semibold tabular-nums text-gray-900">{soles(x.v)}</div>
              <div className="text-[11px] text-gray-500">{pct(x.v)} de lo vendido</div>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs leading-relaxed text-gray-600">
        <b className="text-gray-800">Cómo decidir:</b>{" "}
        {vista === ATELIER_CAFETERIAS_VISTA
          ? "los productos Y- no se deciden en Atelier sino en la carta de Fonavi y Centro: si las cafeterías dejan de venderlo, Atelier deja de producirlo. Míralos junto con «Fonavi + Centro»."
          : vista === ATELIER_B2B_VISTA
            ? "los productos P- se deciden por su venta a los clientes externos: potenciar lo que crece o deja más, revisar lo que cae."
            : "Y- (a las cafeterías) se decide en la carta de Fonavi y Centro; P- (B2B externo) por su venta B2B. Elige un canal para verlo solo."}
      </p>
    </section>
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

/** El mes anterior a «2026-10» → «2026-09». */
function mesAnterior(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
}

function PestanaMes({ month, sede, onSede, onMes, onCanal }: { month: string; sede: number; onSede: ((id: number) => void) | null; onMes: (m: string) => void; onCanal: (id: number) => void }) {
  const [datos, setDatos] = useState<{ sedes: PanoramaDeSede[]; cafeterias: PanoramaCafeterias | null; reparto: RepartoCanal | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Atelier por canal: el panorama de solo los Y- o solo los P- (se pide aparte, guardado con su vista).
  const [canalDatos, setCanalDatos] = useState<{ vista: number; p: PanoramaDeSede | null } | null>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([getPanoramaProductosGrupo(month), getPanoramaCafeterias(month), getRepartoCanalAtelier(month)]).then(([r, c, a]) => {
      if (!vivo) return;
      if (r.ok) setDatos({ sedes: r.sedes, cafeterias: c.ok ? c.data : null, reparto: a.ok ? a.data : null }); else setError(r.error);
    });
    return () => { vivo = false; };
  }, [month]);

  useEffect(() => {
    if (!esCanalAtelier(sede)) return;
    let vivo = true;
    getPanoramaProductos(month, sede).then((r) => { if (vivo) setCanalDatos({ vista: sede, p: r.ok ? r.data : null }); });
    return () => { vivo = false; };
  }, [month, sede]);

  if (error) return <Vacio>{error}</Vacio>;
  if (!datos) return <Cargando />;
  const { sedes, cafeterias } = datos;
  const porCanal = esCanalAtelier(sede);
  if (porCanal && canalDatos?.vista !== sede) return <Cargando />;
  const sel: PanoramaDeSede | null = porCanal ? canalDatos?.p ?? null : sede === CAFETERIAS ? cafeterias : sedes.find((x) => x.businessId === sede) ?? null;
  // Si las dos cafeterías no llegan al mismo día, lo junto es parcial: se avisa.
  const hastas = (cafeterias?.cubre ?? []).filter((x) => x.hasta);
  const distintas = sede === CAFETERIAS && new Set(hastas.map((x) => x.hasta)).size > 1;

  return (
    <div className="space-y-5">
      {onSede && (
        <TiraSedes
          activa={sedeReal(sede)}
          onSede={onSede}
          items={ORDEN_TIRA.map((id) => {
            const x: PanoramaDeSede | null | undefined = id === CAFETERIAS ? cafeterias : sedes.find((y) => y.businessId === id);
            return {
              id, nombre: nombreSede(id), valor: x?.panorama?.ventas ?? null,
              detalle: x?.panorama ? `${fechaCorta(x.panorama.desde)} al ${fechaCorta(x.panorama.hasta)} · ${soles(x.panorama.ventaPorDia)} por día` : "Falta subir el reporte",
            };
          })}
        />
      )}
      {distintas && (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Ojo: las dos cafeterías no llegan al mismo día ({hastas.map((x) => `${x.sede} al ${fechaCorta(x.hasta!)}`).join(" · ")}), así que lo que ves junto es parcial. Cada sede lo sube los sábados; si urge, súbelo tú con «Subir reportes de Byte».
        </p>
      )}
      {sedeReal(sede) === ATELIER && <CanalAtelier vista={sede} onCanal={onCanal} reparto={datos.reparto} />}
      {/* El reporte del mes no cuadra con la venta de Byte: se ve, pero avisado (22-oct-2026). */}
      {sel?.aviso && (
        <div className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-900">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div><div className="font-semibold">Reporte no confiable</div>{sel.aviso}</div>
        </div>
      )}
      {sel?.panorama
        ? <VistaMes p={sel.panorama} cargadoEl={sel.cargadoEl} conKpis={!onSede || porCanal} />
        : (
          <Vacio>
            {sel?.sede ?? "Esta sede"} todavía no tiene reporte de rotación de {monthLabel(month).toLowerCase()}. Lo sube la sede los sábados (o tú, con «Subir reportes de Byte»)
            {" "}o <button type="button" onClick={() => onMes(mesAnterior(month))} className="font-medium text-primary hover:underline">mira {monthLabel(mesAnterior(month)).toLowerCase()}</button>.
          </Vacio>
        )}
      {/* Por categoría y 80/20 de la sede elegida (pedido de Jahnn, 24-sep-2026). */}
      {sel?.panorama && <RankingPorCategoria key={`cat-${sede}`} p={sel.panorama} sede={sede} month={month} />}
      {/* Lo demás es de la sede entera: en las vistas por canal de Atelier no aplica. */}
      {!porCanal && (
        <>
          <ReglaOchentaVeinte month={month} sede={sede} />
          {/* Precio, costo, margen y lo que deja cada producto (4-oct-2026). */}
          <RentabilidadProductos key={`rent-${sede}-${month}`} month={month} sede={sede} />
          {/* El piso de precios: costo × 3 y margen bruto de 65–70% (15-oct-2026). */}
          <PisoPrecios key={`piso-${sede}-${month}`} month={month} sede={sede} />
          {/* La planilla repartida por ventas: método 1 y 2 del coach (15-oct-2026). */}
          <ManoDeObra key={`mo-${sede}-${month}`} month={month} sede={sede} />
          {/* Del reporte «Platos con menor rotación» que sube dirección (28-sep-2026). */}
          <ProductosSinVenta sede={sede} />
          {/* Fonavi y Centro juntas: no depende de la sede elegida arriba (en Atelier no aplica). */}
          {sede !== ATELIER && <CandidatosReemplazo month={month} />}
        </>
      )}
    </div>
  );
}

function PestanaTrimestre({ month, sede, onSede, onCanal }: { month: string; sede: number; onSede: ((id: number) => void) | null; onCanal: (id: number) => void }) {
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
    <div className="space-y-5">
      {onSede && (
        <TiraSedes
          activa={sedeReal(sede)}
          onSede={onSede}
          items={ORDEN_TIRA.map((id) => {
            const x = data.comparativo.find((y) => y.businessId === id);
            return {
              id, nombre: nombreSede(id), valor: x?.ventas ?? null,
              detalle: x ? `${x.unidades.toLocaleString("es-PE")} unidades · ${monthLabel(meses[0])} a ${monthLabel(meses[meses.length - 1])}` : "Sin reportes en esos meses",
            };
          })}
        />
      )}
      {cruce.length > 0 && (
        <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold">Las dos cargas de {monthLabel(month)} no coinciden</div>
            {cruce.map((c) => <div key={c.businessId}>{c.sede}: {c.aviso}</div>)}
          </div>
        </div>
      )}
      {sedeReal(sede) === ATELIER && <CanalAtelier vista={sede} onCanal={onCanal} reparto={null} />}
      {(data.sede.noConfiables ?? []).length > 0 && (
        <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold">{data.sede.noConfiables!.map((x) => monthLabel(x.mes)).join(" y ")} {data.sede.noConfiables!.length === 1 ? "quedó" : "quedaron"} fuera de esta comparación</div>
            {data.sede.noConfiables!.map((x) => <div key={x.mes}>{x.motivo}</div>)}
          </div>
        </div>
      )}
      {t ? <VistaTrimestre t={t} meses={meses} /> : <Vacio>Esta sede no tiene reportes de rotación en esos meses.</Vacio>}
    </div>
  );
}
