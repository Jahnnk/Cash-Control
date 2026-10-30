"use client";

/**
 * Grupo → Resumen en cinco secciones (pedido de Jahnn, 30-oct-2026, a partir de su esquema):
 *   1. Ventas por sede (Byte) · 2. Movimiento de dinero (Excel) · 3. Egresos en 4 familias · 4. EBITDA · 5. Alertas gerenciales.
 * Una sede a la vez (el selector de arriba o tocando su tarjeta en la sección 1) o el Grupo entero.
 * Los números: lib/dashboard-cinco.ts (sobre las seis cifras) y lib/cada-100.ts (el EBITDA; estimado si el mes está abierto).
 * Todos los porcentajes son «de lo vendido»: así se comparan de frente con las metas del 33-33-33.
 */

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowDownLeft, ArrowLeftRight, ArrowUpRight, BarChart3, Building2, CalendarDays, CircleCheck, Gauge, Landmark, Lightbulb, Package, TriangleAlert, Wallet,
} from "lucide-react";
import type { SeisCifras } from "@/app/actions/seis-cifras";
import { alcanceDe, alertasDeNumeros, familiasDeEgreso, textoCortes, type ClaveFamilia, type Familia } from "@/lib/dashboard-cinco";
import type { Cada100, Cada100Mes, Tono } from "@/lib/cada-100";
import { ETIQUETA_TERMOMETRO } from "@/lib/regla-33";
import { Delta } from "./executive-hero";
import { CadaCien } from "./cada-100";

const soles = (n: number) => `S/ ${Math.round(Math.abs(n)).toLocaleString("es-PE")}`;
const solesConSigno = (n: number) => `${n < 0 ? "−" : ""}${soles(n)}`;
const entero = (n: number) => `${n < 0 ? "−" : ""}${Math.round(Math.abs(n)).toLocaleString("es-PE")}`;
const pct1 = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`);
const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

const TEXTO: Record<Tono, string> = { bien: "text-emerald-700", ojo: "text-amber-700", mal: "text-red-700", neutro: "text-gray-900" };

/** Lo que muestra la sección 1 para el grupo o la sede elegida. */
export type VentasAlcance = {
  ventas: number;
  hasta: string | null;
  deltaPct: number | null;
  meta: number | null;
  proyeccion: number | null;
  dia: number;
  diasDelMes: number;
  equilibrio: { texto: string; detalle: string; tono: Tono };
};

export type TarjetaVentas = {
  businessId: number;
  nombre: string;
  ventas: number;
  /** % de las ventas de las 3 sedes. */
  pctGrupo: number | null;
  /** El EBITDA de la sede (de cada 100 vendidos) y si es una estimación. */
  ebitdaPct: number | null;
  ebitdaTono: Tono | null;
  ebitdaEstimado: boolean;
  /** «Faltan 5 días de ventas · llegan al 24/10». */
  aviso: string | null;
};

export type CincoProps = {
  cifras: SeisCifras | null;
  cada: Cada100Mes | null;
  /** null = el grupo. */
  sede: number | null;
  onSede: (id: number | null) => void;
  enCurso: boolean;
  periodo: string;
  ventas: VentasAlcance;
  tarjetas: TarjetaVentas[];
  /** El dinero de hoy en banco y caja del grupo o de la sede (null = no se conoce). */
  saldo: number | null;
  /** A dónde lleva «Ver cómo cuadra con el Excel» (la conciliación en Reportes). */
  cajaHref: string;
};

function Seccion({ n, titulo, fuente, icono, derecha, children }: { n: number; titulo: string; fuente: string; icono: ReactNode; derecha?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-3xl border border-gray-200/80 bg-white p-5 sm:p-7" aria-labelledby={`seccion-${n}`}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`seccion-${n}`} className="text-lg font-semibold tracking-tight text-gray-900 sm:text-xl">{n}. {titulo}</h2>
          <p className="mt-0.5 text-sm text-gray-500">{fuente}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-gray-400">
          {derecha}
          <span aria-hidden>{icono}</span>
        </div>
      </header>
      <div className="mt-4">{children}</div>
    </section>
  );
}

// ─────────────────────────── 1. Ventas por sede ───────────────────────────
const COLOR_SEDE: Record<number, string> = { 1: "#4A7C66", 2: "#8AA89D", 3: "#C0CEC7" };

function SeccionVentas({ v, tarjetas, sede, onSede, enCurso, nombre }: { v: VentasAlcance; tarjetas: TarjetaVentas[]; sede: number | null; onSede: (id: number | null) => void; enCurso: boolean; nombre: string }) {
  const avance = enCurso ? Math.min(100, (v.dia / v.diasDelMes) * 100) : 100;
  const pctMeta = v.meta ? Math.min(100, (v.ventas / v.meta) * 100) : null;
  const final = enCurso ? v.proyeccion : v.ventas;
  const vsMeta = v.meta && final !== null ? final - v.meta : null;
  const total = tarjetas.reduce((t, x) => t + x.ventas, 0);
  return (
    <Seccion n={1} titulo="Ventas por sede" fuente={`Fuente: Byte${v.hasta && enCurso ? ` · hasta el ${ddmm(v.hasta)}` : ""}`} icono={<BarChart3 className="h-5 w-5" />}>
      <div className="rounded-2xl bg-gray-50 p-4 sm:p-5">
        <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{sede === null ? "Ventas totales del mes" : `Ventas de ${nombre} en el mes`}</div>
        <div className="mt-1.5 flex flex-wrap items-end gap-x-3 gap-y-1">
          <span className="text-4xl font-semibold tabular-nums leading-none tracking-tight text-gray-900 sm:text-5xl">{soles(v.ventas)}</span>
          {v.deltaPct !== null && <span className="inline-flex items-center gap-1 pb-1 text-sm text-gray-500"><Delta pct={v.deltaPct} /> <span className="text-xs">vs. mismos días del mes pasado</span></span>}
        </div>
        <p className="mt-1.5 text-sm text-gray-500">{sede === null ? "Consolidado de 3 sedes" : nombre}{v.hasta && enCurso ? ` · vendido hasta el ${ddmm(v.hasta)}` : ""}</p>
        {v.meta !== null && pctMeta !== null && (
          <div className="mt-4">
            <div className="relative h-2.5 overflow-hidden rounded-full bg-gray-200" role="meter" aria-valuemin={0} aria-valuemax={v.meta} aria-valuenow={v.ventas} aria-label="Ventas contra la meta del mes">
              <div className={`absolute inset-y-0 left-0 rounded-full ${v.ventas >= v.meta ? "bg-emerald-600" : "bg-primary"}`} style={{ width: `${pctMeta}%` }} />
              {enCurso && <div className="absolute -inset-y-0.5 w-0.5 bg-gray-800/50" style={{ left: `${avance}%` }} title="Lo que va del mes" />}
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-gray-500">
              <span>{Math.round((v.ventas / v.meta) * 100)}% de la meta de {soles(v.meta)}{enCurso ? ` · va ${Math.round(avance)}% del mes` : ""}</span>
              {vsMeta !== null && (
                <span className={`font-medium ${vsMeta >= 0 ? "text-emerald-700" : "text-amber-700"}`}>
                  {enCurso ? `Al ritmo actual cierra en ${soles(final!)} · ` : ""}{soles(vsMeta)} {vsMeta >= 0 ? "sobre" : "bajo"} la meta
                </span>
              )}
            </div>
          </div>
        )}
        {v.meta === null && enCurso && v.proyeccion !== null && <p className="mt-3 text-xs text-gray-500">Al ritmo actual cierra en {soles(v.proyeccion)}. Sin presupuesto aprobado no hay meta contra la cual medirlo.</p>}
        <p className="mt-3 border-t border-gray-200 pt-2.5 text-xs text-gray-500">
          Mínimo del día: <b className={TEXTO[v.equilibrio.tono]}>{v.equilibrio.texto}</b> · {v.equilibrio.detalle.charAt(0).toLowerCase()}{v.equilibrio.detalle.slice(1)}
        </p>
      </div>

      <p className="mt-4 text-[11px] text-gray-400">Toca una sede para ver las demás secciones solo de ella{sede !== null ? "; toca otra vez para volver al grupo" : ""}.</p>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tarjetas.map((t) => {
          const elegida = sede === t.businessId;
          return (
            <button
              key={t.businessId} type="button" onClick={() => onSede(elegida ? null : t.businessId)} aria-pressed={elegida}
              className={`min-w-0 rounded-2xl border bg-white p-4 text-left transition-colors hover:border-gray-400 focus-visible:outline-2 focus-visible:outline-primary ${elegida ? "border-primary ring-1 ring-primary" : "border-gray-200"}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-medium text-gray-900"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_SEDE[t.businessId] }} aria-hidden />{t.nombre}</span>
                {t.ebitdaPct !== null && t.ebitdaTono && (
                  <span className={`text-[11px] font-semibold tabular-nums ${TEXTO[t.ebitdaTono]}`} title={t.ebitdaEstimado ? "EBITDA estimado al cierre, de cada 100 vendidos" : "EBITDA de cada 100 vendidos"}>EBITDA {entero(t.ebitdaPct)}%{t.ebitdaEstimado ? " est." : ""}</span>
                )}
              </span>
              <span className="mt-1 block text-2xl font-semibold tabular-nums tracking-tight text-gray-900">{soles(t.ventas)}</span>
              <span className="mt-0.5 block text-xs text-gray-500">{t.pctGrupo === null ? "—" : `${pct1(t.pctGrupo)} del grupo`}</span>
              {t.aviso && <span className="mt-1.5 block text-[11px] leading-snug text-amber-700">⚠ {t.aviso}</span>}
            </button>
          );
        })}
      </div>
      {total > 0 && (
        <div className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Qué parte de las ventas del grupo pone cada sede">
          {tarjetas.filter((t) => t.ventas > 0).map((t) => <span key={t.businessId} style={{ width: `${(t.ventas / total) * 100}%`, background: COLOR_SEDE[t.businessId] }} />)}
        </div>
      )}
      {sede === null && <p className="mt-2 text-[11px] text-gray-400">Suma de las 3 sedes: incluye lo que Atelier le vende a Fonavi y Centro. En costos y EBITDA ese monto no se cuenta dos veces.</p>}
    </Seccion>
  );
}

// ─────────────────────────── 2. Movimiento de dinero ───────────────────────────
function SeccionDinero({ caja, cortes, saldo, enCurso, cajaHref }: { caja: { entro: number; salio: number; flujo: number }; cortes: string | null; saldo: number | null; enCurso: boolean; cajaHref: string }) {
  const sinExcel = cortes === null;
  return (
    <Seccion n={2} titulo="Movimiento de dinero" fuente={`Fuente: Excel de Finanzas · flujo de caja${cortes ? ` · ${cortes}` : ""}`} icono={<ArrowLeftRight className="h-5 w-5" />}>
      {sinExcel ? <p className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-500">Todavía no hay Excel de Finanzas de este mes.</p> : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-emerald-50/60 p-4">
              <div className="flex items-center gap-1.5 text-sm text-gray-600"><ArrowDownLeft className="h-4 w-4 text-emerald-600" aria-hidden />Ingresos</div>
              <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-gray-900">{soles(caja.entro)}</div>
            </div>
            <div className="rounded-2xl bg-orange-50/60 p-4">
              <div className="flex items-center gap-1.5 text-sm text-gray-600"><ArrowUpRight className="h-4 w-4 text-red-600" aria-hidden />Egresos</div>
              <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-gray-900">{soles(caja.salio)}</div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-gray-50 p-4">
            <div>
              <div className="text-base font-semibold text-gray-900">Flujo neto del mes</div>
              <div className="text-sm text-gray-500">Ingresos menos egresos</div>
            </div>
            <div className={`text-2xl font-semibold tabular-nums sm:text-3xl ${caja.flujo < 0 ? "text-red-600" : "text-emerald-600"}`}>{solesConSigno(caja.flujo)}</div>
          </div>
        </>
      )}
      {saldo !== null && enCurso && (
        <div className="mt-3 flex items-center justify-between gap-3 px-1 text-sm">
          <span className="text-gray-600">Saldo disponible hoy en banco y caja</span>
          <b className="tabular-nums text-gray-900">{soles(saldo)}</b>
        </div>
      )}
      {!sinExcel && <Link href={cajaHref} className="mt-3 inline-block text-xs font-medium text-primary hover:underline">Ver cómo cuadra con el Excel →</Link>}
    </Seccion>
  );
}

// ─────────────────────────── 3. Egresos ───────────────────────────
const FAMILIA: Record<ClaveFamilia, { color: string; icono: ReactNode }> = {
  fijos: { color: "#5B7FB0", icono: <CalendarDays className="h-5 w-5" /> },
  variables: { color: "#DCA64F", icono: <Package className="h-5 w-5" /> },
  inversiones: { color: "#9B84BE", icono: <Building2 className="h-5 w-5" /> },
  financiamiento: { color: "#7F8C99", icono: <Landmark className="h-5 w-5" /> },
};

function SeccionEgresos({ familias, hayResultado, porque, impuestos, noEsGasto, cajaHref, estimado }: {
  familias: Familia[]; hayResultado: boolean; porque: string | null; impuestos: number; noEsGasto: number; cajaHref: string; estimado: boolean;
}) {
  const [elegida, setElegida] = useState<ClaveFamilia>("fijos");
  const actual = familias.find((f) => f.clave === elegida) ?? familias[0];
  const total = familias.reduce((t, f) => t + f.monto, 0);
  return (
    <Seccion n={3} titulo="Egresos" fuente="Fuente: Excel de Finanzas · 4 familias · % de lo vendido" icono={<Package className="h-5 w-5" />}
      derecha={hayResultado ? <span className="text-sm font-medium tabular-nums text-gray-700">{soles(total)}</span> : undefined}>
      {!hayResultado ? <p className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-500">Todavía sin egresos clasificados: {porque ? porque.charAt(0).toLowerCase() + porque.slice(1) : "falta el Excel del mes"}.</p> : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {familias.map((f) => {
              const sel = f.clave === actual.clave;
              return (
                <button
                  key={f.clave} type="button" onClick={() => setElegida(f.clave)} aria-pressed={sel}
                  className={`relative min-w-0 rounded-2xl border bg-white p-4 text-left transition-colors hover:border-gray-400 focus-visible:outline-2 focus-visible:outline-primary ${sel ? "border-primary bg-gray-50 ring-1 ring-primary" : "border-gray-200"}`}
                >
                  <span className="block h-1.5 w-8 rounded-full" style={{ background: FAMILIA[f.clave].color }} aria-hidden />
                  <span className="absolute right-4 top-4 text-gray-400" aria-hidden>{FAMILIA[f.clave].icono}</span>
                  <span className="mt-3 block text-sm font-medium text-gray-900">{f.etiqueta}</span>
                  <span className="mt-0.5 block text-2xl font-semibold tabular-nums tracking-tight text-gray-900">{soles(f.monto)}</span>
                  <span className="mt-0.5 block text-xs text-gray-500">{pct1(f.pctVentas)} de lo vendido</span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 rounded-2xl bg-gray-50 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold text-gray-900">Detalle · {actual.etiqueta}</h3>
              <span className="text-[11px] text-gray-400">Selecciona una familia arriba</span>
            </div>
            {actual.detalle.length === 0 ? <p className="mt-2 text-sm text-gray-500">Sin movimientos este mes.</p> : (
              <ul className="mt-2 divide-y divide-gray-200/70">
                {actual.detalle.map((d) => (
                  <li key={d.nombre} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 text-gray-800">{d.nombre}</span>
                    <span className="shrink-0 tabular-nums text-gray-900">{soles(d.monto)}<span className="ml-2 text-xs text-gray-400">{actual.monto > 0 ? `${Math.round((d.monto / actual.monto) * 100)}%` : ""}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="mt-3 text-[11px] leading-snug text-gray-500">
            {estimado ? "Hasta la fecha: faltan pagos de fin de mes, así que los porcentajes de arriba todavía no son los del mes completo. " : ""}
            Además: {impuestos >= 1 ? <>impuestos <b className="text-gray-700">{soles(impuestos)}</b> (ya restados de la ganancia)</> : "sin impuestos registrados"}
            {noEsGasto >= 1 ? <> y <b className="text-gray-700">{soles(noEsGasto)}</b> que salió y no es gasto (préstamos entre sedes, ahorro, reparto a socios)</> : null}.{" "}
            <Link href={cajaHref} className="font-medium text-primary hover:underline">Ver cómo cuadra con el Excel →</Link>
          </p>
        </>
      )}
    </Seccion>
  );
}

// ─────────────────────────── 4. EBITDA ───────────────────────────
const COLOR_MODELO = { variables: "#DCA64F", fijos: "#5B7FB0", utilidad: "#4A8B72", bolsa: "#9B84BE" };
const TONO_TERMOMETRO = { fragil: "mal", en_camino: "ojo", eficiente: "bien" } as const;

function SeccionEbitda({ cada }: { cada: Cada100 }) {
  const lin = (k: string) => cada.lineas.find((l) => l.clave === k);
  const e = lin("ebitda"), v = lin("variables"), f = lin("fijos"), u = lin("utilidad"), b = lin("bolsa");
  const estimado = cada.modo === "estimado";
  const modelo = v && f && u && b ? [
    { clave: "variables", nombre: "Costos variables", meta: v.meta, color: COLOR_MODELO.variables },
    { clave: "fijos", nombre: "Costos fijos", meta: f.meta, color: COLOR_MODELO.fijos },
    { clave: "utilidad", nombre: "Utilidad", meta: u.meta, color: COLOR_MODELO.utilidad },
    { clave: "bolsa", nombre: "Impuestos, inversión y deudas", meta: b.meta, color: COLOR_MODELO.bolsa },
  ] : [];
  return (
    <Seccion n={4} titulo="EBITDA · Eficiencia operativa" fuente="Lo que deja la operación después de costos variables y fijos" icono={<Gauge className="h-5 w-5" />}>
      {cada.modo === "sin-datos" || !e ? (
        <p className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-500">Todavía sin EBITDA{cada.porque ? `: ${cada.porque.charAt(0).toLowerCase()}${cada.porque.slice(1)}` : ""}.</p>
      ) : (
        <>
          <div className="rounded-2xl bg-gray-50 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                  {estimado ? "EBITDA estimado al cierre" : "EBITDA"}
                  {estimado && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">estimado</span>}
                  {!estimado && cada.provisional && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">provisional</span>}
                </div>
                <div className={`mt-1 text-4xl font-semibold tabular-nums tracking-tight sm:text-5xl ${TEXTO[e.tono]}`}>{solesConSigno(e.monto)}</div>
              </div>
              <div className="text-right">
                <div className={`text-3xl font-semibold tabular-nums sm:text-4xl ${TEXTO[e.tono]}`}>{pct1(e.cien)}</div>
                <div className="text-xs text-gray-500">Margen EBITDA</div>
                {cada.termometro && <div className={`mt-1 text-xs font-semibold ${TEXTO[TONO_TERMOMETRO[cada.termometro]]}`}>{ETIQUETA_TERMOMETRO[cada.termometro]}</div>}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900">Modelo financiero Yayi&apos;s</h3>
              <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-gray-700 ring-1 ring-inset ring-gray-200">Objetivo</span>
            </div>
            <div className="mt-2 flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="De cada S/ 100: costos variables, costos fijos y el EBITDA, que se reparte en utilidad e impuestos, inversión y deudas">
              {modelo.map((m) => <span key={m.clave} style={{ width: `${m.meta}%`, background: m.color }} />)}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
              {modelo.map((m) => (
                <li key={m.clave} className="flex items-start gap-2 text-xs text-gray-500">
                  <i className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: m.color }} aria-hidden />
                  <span><b className="block text-lg font-semibold leading-none tabular-nums text-gray-900">{Math.round(m.meta)}%</b>{m.nombre}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] leading-snug text-gray-500">
              De cada S/ 100: {Math.round(v!.meta)} a costos variables, {Math.round(f!.meta)} a costos fijos y {Math.round(e.meta)} de EBITDA. Ese EBITDA se reparte en {Math.round(u!.meta)} de utilidad y {Math.round(b!.meta)} para impuestos, inversión y deudas.
            </p>
          </div>
          <CadaCien c={cada} />
        </>
      )}
    </Seccion>
  );
}

// ─────────────────────────── 5. Alertas gerenciales ───────────────────────────
function SeccionAlertas({ alertas }: { alertas: ReturnType<typeof alertasDeNumeros> }) {
  return (
    <Seccion n={5} titulo="Alertas gerenciales" fuente="Lo que dicen los números, con lo que más pesa" icono={<Lightbulb className="h-5 w-5" />}>
      {alertas.length === 0 ? <p className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-500">Todavía no hay números para alertar.</p> : (
        <ul className="divide-y divide-gray-100">
          {alertas.map((a) => (
            <li key={a.id} className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0">
              {a.id === "flujo" && a.tono === "bien" ? <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                : a.tono === "bien" ? <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                  : <TriangleAlert className={`mt-0.5 h-5 w-5 shrink-0 ${a.tono === "mal" ? "text-red-600" : "text-amber-600"}`} aria-hidden />}
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900 sm:text-base">{a.titulo}</div>
                <p className="mt-0.5 text-sm leading-snug text-gray-500">{a.detalle}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Seccion>
  );
}

// ─────────────────────────── Las cinco juntas ───────────────────────────
export function CincoSecciones(p: CincoProps) {
  if (!p.cifras || !p.cada) return <p className="text-sm text-gray-500">No se pudieron calcular las cifras de {p.periodo}.</p>;
  const a = alcanceDe(p.cifras, p.sede);
  const cada = p.sede === null ? p.cada.grupo : p.cada.sedes[p.sede] ?? p.cada.grupo;
  const familias = familiasDeEgreso(a);
  const alertas = alertasDeNumeros(a, cada, familias, p.saldo);
  const nombre = p.tarjetas.find((t) => t.businessId === p.sede)?.nombre ?? a.nombre;
  return (
    <div className="space-y-5">
      <SeccionVentas v={p.ventas} tarjetas={p.tarjetas} sede={p.sede} onSede={p.onSede} enCurso={p.enCurso} nombre={nombre} />
      <SeccionDinero caja={a.caja} cortes={textoCortes(a.cortes)} saldo={p.saldo} enCurso={p.enCurso} cajaHref={p.cajaHref} />
      <SeccionEgresos key={`${p.sede}`} familias={familias} hayResultado={a.hayResultado} porque={a.porque} impuestos={a.impuestos} noEsGasto={a.noEsGasto} cajaHref={p.cajaHref} estimado={p.enCurso} />
      <SeccionEbitda cada={cada} />
      <SeccionAlertas alertas={alertas} />
    </div>
  );
}
