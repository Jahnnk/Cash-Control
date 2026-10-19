"use client";

import { useState } from "react";
import type { BusinessSummary } from "@/app/actions/grupo";
import type { GroupBreakeven } from "@/app/actions/breakeven";
import { GroupKpisSection } from "./group-kpis-section";
import { BandaFrescura } from "@/components/banda-frescura";
import type { LiquidezGrupo } from "@/lib/liquidez";
import type { FrescuraGrupo } from "@/lib/frescura-datos";
import { CargasKelly, SubirExcelKelly } from "./cargas-kelly";
import { BotonSubirByte, DatosCargados } from "./importables";
import { SelloClasificacionGrupo } from "@/components/sello-clasificacion";
import { InformeGastosGrupo } from "./informe-gastos";
import { SelectorMes } from "./selector-mes";
import { CuadreKellySeccion } from "./cuadre-kelly-seccion";
import type { VerificacionSedeMes } from "@/app/actions/verificacion-kelly";
import type { SeisCifras } from "@/app/actions/seis-cifras";
import { ddmm, type SedePulse } from "./sede-pulse-card";
import { TarjetasSede, type ExtraSede } from "./tarjetas-sede";
import { VentasAlDiaVista } from "./ventas-al-dia";
import { AtencionCard } from "./atencion-card";
import { EstadoMes } from "./estado-mes";
import { SeccionDesplegable } from "@/components/productos/ui";
import type { ResumenExtra } from "@/app/actions/resumen-grupo";
import { CumplimientoEquipo } from "./cumplimiento-equipo";
import { construirAtencion } from "@/lib/grupo/atencion";
import { proyeccionSede, textoEquilibrio, textoGanancia } from "@/lib/grupo/estado-mes";
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
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/** Tres pestañas (19-oct-2026): lo de cada día, el equipo y los datos (gastos y Excel). Rentabilidad pasó a Reportes → Para el contador. */
export type Pestana = "resumen" | "equipo" | "datos";

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
  /** Verificación automática contra el Excel de Kelly; null si falló. */
  cuadreKelly: VerificacionSedeMes[] | null;
  /** Las seis cifras del mes (ventas, costos, gastos, caja, margen, ganancia real); null si falló. */
  cifras: SeisCifras | null;
  /** Metas de venta del presupuesto, revisión semanal pendiente y cobros de Atelier. */
  extra: ResumenExtra;
  /** Pestaña con la que abre (?pestana=equipo, p. ej. desde Reportes). */
  pestanaInicial?: Pestana;
};

export function GrupoDashboardClient({
  selectedMonth, mesActual, isCurrentMonth, summaries, breakeven, frescura, liquidez, ventas,
  cuadreKelly, cifras, extra, pestanaInicial = "resumen",
}: Props) {
  const [pestana, setPestana] = useState<Pestana>(pestanaInicial);
  // Sube con cada carga (Byte o Excel) para que la franja «Datos cargados» se actualice sola.
  const [versionCargas, setVersionCargas] = useState(0);
  const [y, m] = selectedMonth.split("-").map(Number);
  const periodo = `${MESES[m - 1]} ${y}`;

  // Solo cuentan las sedes con ventas DEL MES elegido: una sede cuyo último
  // dato es del mes anterior (Atelier a inicios de mes) no aporta su venta
  // vieja bajo el nombre del mes nuevo.
  const ventasDelMes = (ventas ?? []).filter((v) => v.hasta?.slice(0, 7) === selectedMonth);
  const byId = new Map(ventasDelMes.map((v) => [v.businessId, v]));
  const beById = new Map((breakeven?.sedes ?? []).map((s) => [s.businessId, s.result]));

  // ── Ventas del grupo ──
  const ventasMes = ventasDelMes.reduce((s, v) => s + v.mes, 0);
  // Δ del grupo: suma de los tramos emparejados de cada sede (no un
  // promedio de porcentajes, que pesaría igual a una sede chica).
  const cmpCur = ventasDelMes.reduce((s, v) => s + (v.mesCmp?.sameDay.current ?? 0), 0);
  const cmpPrev = ventasDelMes.reduce((s, v) => s + (v.mesCmp?.sameDay.previous ?? 0), 0);
  const deltaGrupo = cmpPrev > 0 ? Math.round(((cmpCur - cmpPrev) / cmpPrev) * 1000) / 10 : null;

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
  const diasSinRegistrar = (hasta: string | null) => hasta
    ? Math.max(0, Math.round((Date.parse(`${hoy}T12:00:00Z`) - Date.parse(`${hasta}T12:00:00Z`)) / 86_400_000) - 1) : null;

  // Lo que la tarjeta de cada sede dice al pie: hasta qué día está al día, la meta y el equilibrio.
  const extrasSede: Record<number, ExtraSede> = Object.fromEntries(pulses.map((p) => {
    const faltan = diasSinRegistrar(p.hasta);
    const meta = p.meta ? Math.round((p.ventasMes / p.meta) * 100) : null;
    const eq = p.equilibrioPct !== null ? Math.round(p.equilibrioPct) : null;
    return [p.businessId, {
      href: `/${p.code}/dashboard`,
      flag: p.flag === "atencion" || p.flag === "mejor" ? p.flag : null,
      cubiertosPct: eq,
      pie: (
        <>
          {p.hasta && (
            <span className={`block ${faltan ? "text-amber-700" : ""}`}>
              {`Ventas hasta el ${ddmm(p.hasta)}: `}<b className="text-gray-700">S/ {Math.round(p.ventasMes).toLocaleString("es-PE")}</b>
              {faltan ? ` · ⚠ ${faltan === 1 ? "falta 1 día" : `faltan ${faltan} días`}` : ""}
            </span>
          )}
          {meta !== null && <span className="block">Meta de ventas: <b className="text-gray-700">{meta}%</b></span>}
          {p.deltaPct !== null && <span className="block">Ventas vs mes pasado: <b className={p.deltaPct < 0 ? "text-red-700" : "text-emerald-700"}>{p.deltaPct > 0 ? "+" : ""}{p.deltaPct}%</b></span>}
        </>
      ),
    }];
  }));

  // Hasta qué día llegan las ventas que suma el número grande (la sede más adelantada).
  const ultimaVenta = ventasDelMes.reduce<string | null>((mx, v) => (v.hasta && (!mx || v.hasta > mx) ? v.hasta : mx), null);
  const diasDelMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const diaHoy = isCurrentMonth ? Number(hoy.slice(8, 10)) : diasDelMes;
  const metas = [1, 2, 3].map((id) => extra.metas[id] ?? null);
  const metaGrupo = metas.every((x) => x !== null) ? metas.reduce((t, x) => t + (x ?? 0), 0) : null;
  // Al ritmo actual: con menos de 7 días del mes, el de los últimos 7 días con venta (el inicio de mes engaña).
  const proyeccion = isCurrentMonth && ventasDelMes.length ? Math.round(ventasDelMes.reduce((t, v) => t + proyeccionSede(v, diasDelMes), 0)) : null;
  const equilibrio = textoEquilibrio(breakeven?.grupo ?? null, isCurrentMonth);
  const cg = cifras?.grupo ?? null;
  const ganancia = textoGanancia(cg);
  // ── Necesita tu atención: lo que pide una acción, agrupado y ordenado ──
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
    highlightsSinAsignar: extra.highlightsSinAsignar,
    presupuesto: extra.presupuesto,
    utilidadPorSeparar: extra.utilidadPorSeparar,
    cobrosAtelier: extra.cobrosAtelier,
  }) : [];
  // Los avisos que se resuelven en esta misma pantalla no navegan: cambian de pestaña o bajan a las sedes.
  const irA = (href: string) => {
    if (href === "#excel") { setPestana("datos"); return true; }
    if (href.endsWith("#sedes")) { document.getElementById("sedes")?.scrollIntoView({ behavior: "smooth" }); return true; }
    return false;
  };

  return (
    <div className="space-y-6 pb-4 max-w-[1400px] min-w-0">
      {/* Cabecera: identidad, hasta cuándo hay datos y la acción de siempre */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Grupo Yayi&apos;s</h1>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <SelectorMes mes={selectedMonth} mesActual={mesActual} />
          {/* Los dos importables (15-oct-2026): Byte, que Jahnn sube cada semana, y el Excel de finanzas. */}
          <BotonSubirByte onCambio={() => setVersionCargas((v) => v + 1)} />
          <SubirExcelKelly onCerrar={() => setVersionCargas((v) => v + 1)} />
        </div>
      </header>

      <DatosCargados version={versionCargas} onVerExcel={() => setPestana("datos")} />

      <div className="border-b border-gray-200">
        <nav className="flex gap-6 overflow-x-auto -mb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {([
            ["resumen", "Resumen"],
            ["equipo", "Equipo"],
            ["datos", "Datos"],
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
          {/* Capa 1: lo que se mira cada día. Primero cómo vamos y qué hacer hoy; después cada sede con cuatro datos.
              El detalle de cada sede se abre con «Ver el detalle»; lo de contador vive en Reportes → Para el contador. */}
          <div className={`grid grid-cols-1 gap-5 items-start ${isCurrentMonth ? "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" : ""}`}>
            <EstadoMes
              periodo={periodo} enCurso={isCurrentMonth} dia={diaHoy} diasDelMes={diasDelMes}
              ventas={ventasMes} hasta={isCurrentMonth ? ultimaVenta : null} deltaPct={deltaGrupo} meta={metaGrupo} proyeccion={proyeccion}
              liquidez={liquidez ? liquidez.total : null} equilibrio={equilibrio} ganancia={ganancia}
              flujo={cg?.caja.flujo ?? null} liquidezHref="/grupo/direccion"
            />
            {isCurrentMonth && <AtencionCard items={atencion} onIr={irA} />}
          </div>

          <section id="sedes" className="space-y-3 scroll-mt-4" aria-label="Ventas, ganancia y plata por sede">
            <h2 className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Por sede · {periodo.toLowerCase()}</h2>
            <TarjetasSede cifras={cifras} periodo={periodo} extras={extrasSede} cajaHref={`/grupo/reportes${isCurrentMonth ? "" : `?mes=${selectedMonth}`}`} />
          </section>

          {/* Entre una carga de Byte y la siguiente: la venta diaria que anotan los administradores, contrastada con Byte. */}
          <VentasAlDiaVista mes={selectedMonth} />
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

      {/* Datos: los gastos del mes y, plegado, todo lo del Excel (antes eran las pestañas «Gastos» y «Excel»). */}
      {pestana === "datos" && (
        <div className="space-y-6">
          <InformeGastosGrupo mes={isCurrentMonth ? undefined : selectedMonth} />
          <SeccionDesplegable titulo="El Excel de finanzas" subtitulo="Hasta qué día llega, si cuadra con el sistema y qué se cargó.">
            <div className="space-y-6">
              {frescura && <BandaFrescura frescura={frescura} />}
              {/* ¿Cuánto confiar en la clasificación de los gastos del Excel? */}
              <SelloClasificacionGrupo month={selectedMonth} />
              <CuadreKellySeccion items={cuadreKelly} />
              <CargasKelly />
            </div>
          </SeccionDesplegable>
        </div>
      )}
    </div>
  );
}
