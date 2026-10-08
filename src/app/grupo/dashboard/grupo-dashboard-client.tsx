"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import type { BusinessSummary } from "@/app/actions/grupo";
import type { GroupBreakeven } from "@/app/actions/breakeven";
import { GroupKpisSection } from "./group-kpis-section";
import { AtelierB2BCard } from "./atelier-b2b-card";
import type { AtelierB2BResumen } from "@/app/actions/atelier-b2b";
import { BandaFrescura } from "@/components/banda-frescura";
import { DIAS_SALDO_FRESCO, type LiquidezGrupo } from "@/lib/liquidez";
import type { FrescuraGrupo } from "@/lib/frescura-datos";
import { CargasKelly, SubirExcelKelly } from "./cargas-kelly";
import { SelloClasificacionGrupo } from "@/components/sello-clasificacion";
import { InformeGastosGrupo } from "./informe-gastos";
import { SelectorMes } from "./selector-mes";
import { CuadreKellySeccion } from "./cuadre-kelly-seccion";
import type { VerificacionSedeMes } from "@/app/actions/verificacion-kelly";
import { fechaLarga } from "@/lib/frescura-datos";
import type { HeroStats } from "./executive-hero";
import { SeisCifrasPanel } from "./seis-cifras-panel";
import type { SeisCifras } from "@/app/actions/seis-cifras";
import { SedePulseCard, type SedePulse } from "./sede-pulse-card";
import { AtencionCard } from "./atencion-card";
import { EstadoMes } from "./estado-mes";
import { SeccionDesplegable } from "@/components/productos/ui";
import type { ResumenExtra } from "@/app/actions/resumen-grupo";
import { CumplimientoEquipo } from "./cumplimiento-equipo";
import { construirAtencion } from "@/lib/grupo/atencion";
import type { GroupVentasSede } from "@/app/actions/group-ventas";
import type { ScopeCode } from "@/lib/business-theme";

/**
 * Executive Command Center del Grupo (rediseño 28-jul-2026; reorganizado en
 * pestañas el 22-sep-2026 porque "lo noto desordenado": la carga del Excel de
 * Kelly estaba escondida en "Ver detalle operativo" y el corte de datos se
 * repetía en dos lugares).
 *
 * Cabecera: dónde estamos, hasta cuándo hay datos (una pastilla) y "Subir
 * Excel de Kelly", siempre a mano. Pestañas: Resumen · Equipo ·
 * Gastos · Excel (8-oct-2026: «Finanzas» se quitó; su punto de equilibrio y su caja ya estaban en Reportes).
 *
 * La pantalla responde CUATRO preguntas en este orden, y nada más:
 *   1. ¿Cómo estamos?          → el hero, un número dominante.
 *   2. ¿Qué debo hacer hoy?    → máximo tres frases accionables.
 *   3. ¿Qué negocio preocupa / cuál va mejor? → sedes ORDENADAS por
 *      desempeño, con la peor y la mejor etiquetadas.
 *   4. El detalle              → plegado, para el contador, no el CEO.
 *
 * Disciplina de color: gris por defecto. Verde/ámbar/rojo SOLO cuando
 * significan algo (variación real, riesgo real). Si todo tiene color,
 * nada destaca.
 */

const SEDE_CODE: Record<number, ScopeCode> = { 1: "atelier", 2: "fonavi", 3: "centro" };
/** "2026-09" → "2026-08". */
const mesAnterior = (m: string) => {
  const [y, mm] = m.split("-").map(Number);
  return mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, "0")}`;
};
/** Orden de la liquidez por sede bajo el número del grupo. */
const ORDEN_LIQUIDEZ = [2, 3, 1];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

type Props = {
  selectedMonth: string;
  /** El mes en curso (para el selector y para saber qué es "hoy"). */
  mesActual: string;
  isCurrentMonth: boolean;
  summaries: BusinessSummary[];
  totals: { bankBalance: number; monthlyIncome: number; monthlyExpenses: number; margin: number };
  breakeven: GroupBreakeven | null;
  frescura: FrescuraGrupo | null;
  liquidez: LiquidezGrupo | null;
  ventas: GroupVentasSede[] | null;
  atelierB2B: AtelierB2BResumen;
  /** Verificación automática contra el Excel de Kelly; null si falló. */
  cuadreKelly: VerificacionSedeMes[] | null;
  /** Las seis cifras del mes (ventas, costos, gastos, caja, margen, ganancia real); null si falló. */
  cifras: SeisCifras | null;
  /** Metas de venta del presupuesto, revisión semanal pendiente y cobros de Atelier. */
  extra: ResumenExtra;
  /** Pestaña con la que abre (?pestana=equipo, p. ej. desde Reportes). */
  pestanaInicial?: "resumen" | "equipo" | "gastos" | "kelly";
};

export function GrupoDashboardClient({
  selectedMonth, mesActual, isCurrentMonth, summaries, totals: t, breakeven, frescura, liquidez, ventas,
  atelierB2B, cuadreKelly, cifras, extra, pestanaInicial = "resumen",
}: Props) {
  const [pestana, setPestana] = useState<"resumen" | "equipo" | "gastos" | "kelly">(pestanaInicial);

  const [y, m] = selectedMonth.split("-").map(Number);
  const periodo = `${MESES[m - 1]} ${y}`;

  // Solo cuentan las sedes con ventas DEL MES elegido: una sede cuyo último
  // dato es del mes anterior (Atelier a inicios de mes) no aporta su venta
  // vieja bajo el nombre del mes nuevo.
  const ventasDelMes = (ventas ?? []).filter((v) => v.hasta?.slice(0, 7) === selectedMonth);
  const byId = new Map(ventasDelMes.map((v) => [v.businessId, v]));
  const beById = new Map((breakeven?.sedes ?? []).map((s) => [s.businessId, s.result]));

  // ── Hero: la venta del grupo y su tendencia agregada por día ──
  const ventasMes = ventasDelMes.reduce((s, v) => s + v.mes, 0);
  const largo = Math.max(0, ...ventasDelMes.map((v) => v.serie14.length));
  const serieGrupo = Array.from({ length: largo }, (_, i) =>
    ventasDelMes.reduce((s, v) => {
      // Alinear por el FINAL: el último punto de cada sede es su último día.
      const off = largo - v.serie14.length;
      return s + (i >= off ? v.serie14[i - off] : 0);
    }, 0),
  );
  // Δ del grupo: suma de los tramos emparejados de cada sede (no un
  // promedio de porcentajes, que pesaría igual a una sede chica).
  const cmpCur = ventasDelMes.reduce((s, v) => s + (v.mesCmp?.sameDay.current ?? 0), 0);
  const cmpPrev = ventasDelMes.reduce((s, v) => s + (v.mesCmp?.sameDay.previous ?? 0), 0);
  const deltaGrupo = cmpPrev > 0 ? Math.round(((cmpCur - cmpPrev) / cmpPrev) * 1000) / 10 : null;

  const hero: HeroStats = {
    // La liquidez sale de getLiquidezGrupo (única fuente). Si falla, se
    // cae al total del resumen para no dejar la tarjeta en blanco.
    liquidez: liquidez ? liquidez.total : t.bankBalance,
    liquidezProcedencia: liquidez ? liquidez.procedencia : null,
    liquidezConfiable: liquidez ? liquidez.confiable : false,
    liquidezSedes: ORDEN_LIQUIDEZ
      .map((id) => liquidez?.sedes.find((x) => x.businessId === id))
      .filter((x): x is NonNullable<typeof x> => !!x)
      .map((x) => ({
        businessId: x.businessId, nombre: x.nombre.replace("Yayi's ", ""),
        total: x.total, banco: x.banco, caja: x.caja,
        // Alerta solo si el saldo no está declarado o ya está viejo; lo que a
        // Kelly le falta cuadrar se muestra aparte, como dato.
        alerta: x.origen !== "declarado" || (x.antiguedadDias ?? 0) > DIAS_SALDO_FRESCO,
        descuadre: x.descuadreKelly !== null && Math.abs(x.descuadreKelly) >= 0.01 ? x.descuadreKelly : null,
      })),
    ventasMes: ventasMes > 0 ? ventasMes : t.monthlyIncome,
    ventasDeltaPct: deltaGrupo,
    margen: t.margin,
    equilibrioPct: breakeven?.grupo.avancePct ?? null,
    serie: serieGrupo,
    periodo,
    mesCerrado: !isCurrentMonth,
  };

  // ── Sedes ordenadas por desempeño (mejor arriba) ──
  const liqById = new Map((liquidez?.sedes ?? []).map((x) => [x.businessId, x]));
  // ¿Los ingresos y gastos de la sede son los del Excel de Kelly de este mes?
  const excelDe = (bId: number) => {
    const v = (cuadreKelly ?? []).find((x) => x.businessId === bId && x.month === selectedMonth);
    if (!v?.caja || v.caja.esperadoEntro === null || v.caja.esperadoSalio === null) return null;
    const igual = Math.abs(v.caja.entro - v.caja.esperadoEntro) < 0.01 && Math.abs(v.caja.salio - v.caja.esperadoSalio) < 0.01;
    return { igual, ingresos: v.caja.esperadoEntro, gastos: v.caja.esperadoSalio };
  };

  const pulses: SedePulse[] = summaries
    .map((s): SedePulse => {
      const v = byId.get(s.businessId);
      const be = beById.get(s.businessId);
      return {
        businessId: s.businessId,
        code: SEDE_CODE[s.businessId] ?? "grupo",
        nombre: s.name.replace("Yayi's ", ""),
        // Sin ventas cargadas de este mes: 0, no los ingresos (son otra cosa).
        ventasMes: v?.mes ?? (ventas ? 0 : s.monthlyIncome),
        deltaPct: v?.mesCmp?.sameDay.pct ?? null,
        diasComparados: v?.mesCmp?.sameDay.daysCompared ?? 0,
        coberturaBaja: v?.mesCmp?.lowCoverage ?? false,
        // Misma fuente que la liquidez del hero; si no cargó, el saldo del resumen.
        saldo: liqById.get(s.businessId)?.total ?? s.bankBalance,
        ingresosMes: s.monthlyIncome,
        gastosMes: s.monthlyExpenses,
        deudaAhorro: s.monthlyDebtSavings ?? 0,
        excelKelly: excelDe(s.businessId),
        equilibrioPct: be?.avancePct ?? null,
        serie: v?.serie14 ?? [],
        // "Al día hasta…" solo vale para el mes en curso.
        hasta: isCurrentMonth ? v?.hasta ?? null : null,
        meta: extra.metas[s.businessId] ?? null,
        flag: null,
      };
    })
    .sort((a, b) => (b.deltaPct ?? -999) - (a.deltaPct ?? -999));

  // Etiquetar solo cuando hay contraste real y comparativo confiable.
  const confiables = pulses.filter((p) => p.deltaPct !== null && !p.coberturaBaja);
  if (confiables.length >= 2) {
    const mejor = confiables[0], peor = confiables[confiables.length - 1];
    if ((mejor.deltaPct ?? 0) > (peor.deltaPct ?? 0)) {
      if ((peor.deltaPct ?? 0) < 0) peor.flag = "atencion";
      if ((mejor.deltaPct ?? 0) > (peor.deltaPct ?? 0) + 5) mejor.flag = "mejor";
    }
  }

  const alDia = frescura?.estado === "al_dia";

  // ── ¿Cómo vamos? Una sola cifra de ventas (Byte, la misma de las sedes), su meta y su ritmo ──
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const diasDelMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const diaHoy = isCurrentMonth ? Number(hoy.slice(8, 10)) : diasDelMes;
  const metas = [1, 2, 3].map((id) => extra.metas[id] ?? null);
  const metaGrupo = metas.every((x) => x !== null) ? metas.reduce((t, x) => t + (x ?? 0), 0) : null;
  // Al ritmo actual: con menos de 7 días del mes, el de los últimos 7 días con venta (el inicio de mes engaña).
  const proyeccion = isCurrentMonth && ventasDelMes.length ? Math.round(ventasDelMes.reduce((t, v) => {
    const dia = Number(v.hasta!.slice(8, 10));
    const ult7 = v.serie14.slice(-7);
    return t + (dia >= 7 || ult7.length < 7 ? (v.mes / dia) * diasDelMes : (ult7.reduce((a, x) => a + x, 0) / 7) * diasDelMes);
  }, 0)) : null;
  const g = breakeven?.grupo ?? null;
  const equilibrio = !g || g.estado === "sin_datos" ? { texto: "—", detalle: "Sin datos suficientes", tono: "neutro" as const }
    : g.estado === "superado" ? { texto: "Cubierto", detalle: isCurrentMonth ? "Las ventas ya pagan los costos del mes" : "Las ventas pagaron los costos del mes", tono: "bien" as const }
    : g.estado === "en_riesgo" ? { texto: isCurrentMonth ? "En riesgo" : "No se cubrió", detalle: isCurrentMonth ? `Al ritmo actual no se cubre (va en ${Math.round(g.avancePct ?? 0)}%)` : `Se llegó al ${Math.round(g.avancePct ?? 0)}%`, tono: "mal" as const }
    : { texto: g.diaEstimadoCruce ? `Se cubre el día ${g.diaEstimadoCruce}` : `${Math.round(g.avancePct ?? 0)}% cubierto`, detalle: `Va en ${Math.round(g.avancePct ?? 0)}% al ritmo actual`, tono: "neutro" as const };
  const cg = cifras?.grupo ?? null;
  const ganancia = {
    valor: cg?.ganancia ?? null,
    detalle: cg?.ganancia == null ? "Se calcula con el Excel desde el día 10"
      : `${cg.gananciaPct !== null ? `${cg.gananciaPct.toLocaleString("es-PE", { maximumFractionDigits: 1 })}% de lo vendido` : ""}${cg.provisional ? " · provisional" : ""}`,
  };

  // ── Necesita tu atención: lo que pide una acción, agrupado y ordenado ──
  const diasSinRegistrar = (hasta: string | null) => hasta
    ? Math.max(0, Math.round((Date.parse(`${hoy}T12:00:00Z`) - Date.parse(`${hasta}T12:00:00Z`)) / 86_400_000) - 1) : null;
  const atencion = isCurrentMonth ? construirAtencion({
    hoy,
    sedes: pulses.map((p) => ({
      nombre: p.nombre, code: p.code, deltaPct: p.deltaPct, diasComparados: p.diasComparados, coberturaBaja: p.coberturaBaja,
      diasSinRegistrar: diasSinRegistrar(p.hasta), equilibrioPct: p.equilibrioPct,
      diasConDatos: p.hasta?.startsWith(selectedMonth) ? Number(p.hasta.slice(8, 10)) : 0,
      equilibrioEnRiesgo: beById.get(p.businessId)?.estado === "en_riesgo",
    })),
    cuadres: (cuadreKelly ?? []).filter((v) => v.month >= mesAnterior(selectedMonth)).map((v) => ({ sede: v.sede, mes: v.month, alertas: v.alertas.length })),
    excelPendiente: frescura && !alDia ? frescura.accion ?? frescura.titular : null,
    revisionSemanal: extra.revisionSemanal,
    cobrosAtelier: extra.cobrosAtelier,
  }) : [];
  // Los avisos que se resuelven en esta misma pantalla no navegan: cambian de pestaña o bajan a las sedes.
  const irA = (href: string) => {
    if (href === "#excel") { setPestana("kelly"); return true; }
    if (href.endsWith("#sedes")) { document.getElementById("sedes")?.scrollIntoView({ behavior: "smooth" }); return true; }
    return false;
  };
  const chipFrescura = frescura?.hasta
    ? `Excel al ${fechaLarga(frescura.hasta)}`
    : "Sin datos cargados";

  return (
    <div className="space-y-6 pb-4 max-w-[1400px] min-w-0">
      {/* Cabecera: identidad, hasta cuándo hay datos y la acción de siempre */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Grupo Yayi&apos;s</h1>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <SelectorMes mes={selectedMonth} mesActual={mesActual} />
          {isCurrentMonth && frescura && (
            <button
              type="button"
              onClick={() => setPestana("kelly")}
              title="Ver qué Excel están cargados"
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs sm:text-sm ${
                alDia ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              {alDia ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              {chipFrescura}
            </button>
          )}
          <SubirExcelKelly />
        </div>
      </header>

      <div className="border-b border-gray-200">
        <nav className="flex gap-6 overflow-x-auto -mb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {([
            ["resumen", "Resumen"],
            ["equipo", "Equipo"],
            ["gastos", "Gastos"],
            ["kelly", "Excel"],
          ] as const).map(([k, label]) => (
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

      {pestana === "resumen" && (
        <div className="space-y-6">
          {/* ¿Cómo vamos?  ·  ¿Qué necesita mi atención? */}
          <div className={`grid grid-cols-1 gap-5 items-start ${isCurrentMonth ? "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" : ""}`}>
            <EstadoMes
              periodo={periodo} enCurso={isCurrentMonth} dia={diaHoy} diasDelMes={diasDelMes}
              ventas={ventasMes} deltaPct={deltaGrupo} meta={metaGrupo} proyeccion={proyeccion}
              liquidez={liquidez ? liquidez.total : null} equilibrio={equilibrio} ganancia={ganancia}
              flujo={cg?.caja.flujo ?? null} liquidezHref="/grupo/direccion"
            />
            {isCurrentMonth && <AtencionCard items={atencion} onIr={irA} />}
          </div>

          {/* ¿Cómo va cada sede? — ordenadas por desempeño; cada tarjeta abre su sede */}
          <section id="sedes" className="space-y-3 scroll-mt-4">
            <h2 className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Las sedes</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {pulses.map((p) => <SedePulseCard key={p.businessId} s={p} />)}
            </div>
          </section>

          {/* El detalle, para cuando se pide (revelación progresiva) */}
          <SeccionDesplegable
            titulo={`Las seis cifras de ${periodo.toLowerCase()}`}
            subtitulo="Ventas, costos, gastos, caja, margen y ganancia real, sede por sede."
            resumen={!isCurrentMonth ? (
              <div className="text-xs text-gray-500">Los saldos de liquidez son los de hoy: el saldo al cierre de cada mes no se guarda.</div>
            ) : undefined}
          >
            <SeisCifrasPanel
              cifras={cifras}
              periodo={periodo}
              apoyo={{
                serie: hero.serie,
                ventasDeltaPct: hero.ventasDeltaPct,
                liquidez: hero.liquidez,
                liquidezSedes: hero.liquidezSedes.map((x) => ({ businessId: x.businessId, nombre: x.nombre, total: x.total })),
                equilibrioPct: hero.equilibrioPct,
                mesCerrado: !isCurrentMonth,
              }}
            />
          </SeccionDesplegable>

          {/* Atelier B2B — lo que se debe HOY: no tiene versión por mes. */}
          {isCurrentMonth && (
            <SeccionDesplegable titulo="Clientes de Atelier" subtitulo="Venta a empresas y lo que te deben.">
              <AtelierB2BCard resumen={atelierB2B} />
            </SeccionDesplegable>
          )}
        </div>
      )}

      {pestana === "equipo" && (
        <div className="space-y-6">
          {/* ¿Está todo el equipo al día con sus registros? */}
          <CumplimientoEquipo />
          {/* Los KPIs de la semana de cada sede */}
          <GroupKpisSection />
        </div>
      )}

      {pestana === "gastos" && <InformeGastosGrupo mes={isCurrentMonth ? undefined : selectedMonth} />}

      {pestana === "kelly" && (
        <div className="space-y-6">
          {frescura && <BandaFrescura frescura={frescura} />}
          {/* ¿Cuánto confiar en la clasificación de los gastos del Excel? (venía de la pestaña Finanzas) */}
          <SelloClasificacionGrupo month={selectedMonth} />
          <CuadreKellySeccion items={cuadreKelly} />
          <CargasKelly />
        </div>
      )}
    </div>
  );
}
