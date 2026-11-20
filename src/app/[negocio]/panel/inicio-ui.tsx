"use client";

/**
 * Inicio del Panel de Sede (pedido de Jahnn, 20-nov-2026, con un diseño de referencia): ordena VISUALMENTE lo que
 * el administrador mira primero. No quita nada: todo lo de antes sigue debajo (Tu semana, el bono con sus 3
 * activadores, el registro del día, banderas, KPIs de la semana y los desplegables).
 *
 *   · Cabecera con la sede, la fecha y el último registro.
 *   · Saludo según la hora («¡Buenos días, Sol!»), con el nombre del administrador y el propósito.
 *   · KPIs del día (el último día registrado): ventas, ticket, NPS, mermas y tiempo de atención contra su meta.
 *   · Evolución de ventas (día, semana, mes), cumplimiento de acuerdos y tareas del día.
 *   · Ticket promedio y plan de incentivos: ticket actual, niveles con su avance y lo que falta.
 */

import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  BarChart3, Check, CheckCircle2, ChevronRight, Circle, Coins, LineChart, ShoppingCart, Star, Target, Timer, Trash2, Trophy, XCircle,
} from "lucide-react";
import type { DashboardDaily, IncentiveDashboard } from "@/app/actions/incentives";
import type { KpiTargets } from "@/lib/kpis/engine";
import { Proposito } from "@/components/proposito";
import { Segmentado } from "@/components/productos/ui";
import { fechaLarga, textoSaludo } from "@/lib/saludo";
import { monthLabel } from "@/lib/utils";

/* ─────────── Formatos ─────────── */

const soles = (n: number, dec = 2) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
const solesCorto = (n: number) => soles(n, n >= 1000 ? 0 : 2);
const dia = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  const s = d.toLocaleDateString("es-PE", { weekday: "short", day: "numeric", timeZone: "UTC" }).replace(".", "");
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const diaMes = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");
const diaLargo = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

function ir(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Ticket presencial del día: sin delivery ni consumo del personal (igual que el ticket del programa). */
function ticketDelDia(d: DashboardDaily): number | null {
  const personas = Math.max(0, (d.personas ?? 0) - Math.max(0, d.deliveryPedidos ?? 0) - Math.max(0, d.personalPedidos ?? 0));
  const venta = Math.max(0, (d.revenue ?? 0) - Math.max(0, d.deliveryVenta ?? 0) - Math.max(0, d.personalVenta ?? 0));
  return personas > 0 ? Math.round((venta / personas) * 100) / 100 : null;
}

/* ─────────── Piezas comunes ─────────── */

export function TarjetaInicio({ icono: Icono, titulo, nota, accion, className = "", children }: {
  icono: ComponentType<{ className?: string }>; titulo: string; nota?: ReactNode; accion?: ReactNode; className?: string; children: ReactNode;
}) {
  return (
    <section className={`flex flex-col rounded-2xl border border-gray-200/80 bg-white p-4 sm:p-5 shadow-sm ${className}`}>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-50 text-primary-light">
            <Icono className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold leading-tight text-gray-900">{titulo}</h2>
            {nota && <p className="truncate text-[11px] text-gray-500">{nota}</p>}
          </div>
        </div>
        {accion && <div className="shrink-0">{accion}</div>}
      </header>
      <div className="flex-1">{children}</div>
    </section>
  );
}

function EnlaceVer({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="inline-flex items-center gap-0.5 rounded-md text-xs font-semibold text-primary-light hover:text-primary focus-visible:outline-2 focus-visible:outline-primary">
      {children}<ChevronRight className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}

/* ─────────── Cabecera y saludo ─────────── */

/** Título de la sede, fecha de hoy y el último día registrado. Las acciones (mes, subir reportes) van a la derecha. */
export function CabeceraSede({ sede, ultimoRegistro, children }: { sede: string; ultimoRegistro: string | null; children?: ReactNode }) {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 5 * 60_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">Panel de Sede · {sede}</h1>
        <p className="mt-0.5 text-sm text-gray-500" suppressHydrationWarning>{fechaLarga(ahora)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        {ultimoRegistro && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />Último registro: {diaMes(ultimoRegistro)}
          </span>
        )}
      </div>
    </div>
  );
}

/** «¡Buenos días, Sol!»: cambia solo con la hora de Lima (mañana, tarde, noche). */
export function BannerSaludo({ nombre, bajada }: { nombre: string | null; bajada: string }) {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return (
    <section className="relative overflow-hidden rounded-2xl border border-amber-100 bg-gradient-to-r from-[#FFF4E6] via-[#FFF8EF] to-[#FDF3E3] px-4 py-4 sm:px-6 sm:py-5">
      <Hojas />
      <div className="relative flex items-center gap-4 sm:gap-6">
        <Tiendita className="hidden sm:block h-20 w-24 shrink-0" />
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-primary" suppressHydrationWarning>{textoSaludo(ahora, nombre)}</h2>
          <p className="mt-1 text-sm text-gray-700">{bajada}</p>
          <Proposito className="mt-2" />
        </div>
      </div>
    </section>
  );
}

/** Ilustración de la tiendita (toldo verde de la marca). Decorativa. */
function Tiendita({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 80" className={className} aria-hidden>
      <ellipse cx="48" cy="76" rx="40" ry="3.5" fill="#004C40" opacity="0.08" />
      <rect x="14" y="30" width="62" height="44" rx="3" fill="#FFFDF8" stroke="#004C40" strokeWidth="2.2" />
      <rect x="10" y="10" width="70" height="8" rx="3" fill="#004C40" />
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} d={`M${12 + i * 14} 18h14v9a7 7 0 0 1-14 0z`} fill={i % 2 ? "#FFFDF8" : "#098B5F"} stroke="#004C40" strokeWidth="2" />
      ))}
      <rect x="21" y="42" width="24" height="18" rx="2" fill="#E6F5F0" stroke="#004C40" strokeWidth="2" />
      <path d="M26 54l5-5 4 3 6-6" fill="none" stroke="#098B5F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="52" y="44" width="16" height="30" rx="2" fill="#F5B638" stroke="#004C40" strokeWidth="2" />
      <circle cx="64" cy="60" r="1.4" fill="#004C40" />
      <path d="M84 74c0-8 0-12 0-16" stroke="#098B5F" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M84 62c-6-1-8-5-8-9 5 0 8 4 8 9zM84 66c5-1 8-5 8-10-5 1-8 5-8 10z" fill="#098B5F" />
      <rect x="79" y="70" width="10" height="6" rx="1.5" fill="#C98B3B" />
    </svg>
  );
}

function Hojas() {
  return (
    <svg viewBox="0 0 200 120" className="pointer-events-none absolute -right-6 -bottom-6 h-36 w-60 text-amber-200/60" aria-hidden>
      <path d="M150 120C150 70 175 40 200 25c0 45-20 80-50 95z" fill="currentColor" />
      <path d="M110 120c5-35 30-60 60-70-5 40-30 62-60 70z" fill="currentColor" opacity="0.7" />
      <circle cx="40" cy="22" r="5" fill="#F5B638" opacity="0.5" />
    </svg>
  );
}

/* ─────────── KPIs del día ─────────── */

type Tono = "bien" | "mal" | "neutro";
const PASTILLA: Record<Tono, string> = {
  bien: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  mal: "bg-red-50 text-red-700 ring-red-200",
  neutro: "bg-gray-50 text-gray-600 ring-gray-200",
};

function Variacion({ pct, texto }: { pct: number; texto: string }) {
  const sube = pct >= 0;
  return (
    <p className={`text-xs font-medium ${sube ? "text-emerald-700" : "text-red-600"}`}>
      <span aria-hidden>{sube ? "▲" : "▼"}</span> {sube ? "+" : ""}{pct.toLocaleString("es-PE", { maximumFractionDigits: 1 })}% <span className="font-normal text-gray-500">{texto}</span>
    </p>
  );
}

function Pastilla({ tono, children }: { tono: Tono; children: ReactNode }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${PASTILLA[tono]}`}>{children}</span>;
}

function Kpi({ icono: Icono, fondo, titulo, valor, ancho = "corto", children }: {
  icono: ComponentType<{ className?: string }>; fondo: string; titulo: string; valor: ReactNode; ancho?: "corto" | "largo" | "ultimo"; children?: ReactNode;
}) {
  // 5 tarjetas sin huecos: en tablet van 3 arriba y 2 abajo (más anchas); en computadora, las 5 en una fila.
  const span = ancho === "corto" ? "md:col-span-2" : ancho === "largo" ? "md:col-span-3" : "col-span-2 md:col-span-3";
  return (
    <div className={`${span} xl:col-span-1 flex flex-col items-start gap-2 rounded-xl border border-gray-100 bg-gradient-to-b from-white to-gray-50/60 p-3 sm:flex-row sm:gap-3 sm:p-4 xl:flex-col xl:gap-2 2xl:flex-row 2xl:gap-3`}>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${fondo}`}><Icono className="h-5 w-5" /></span>
      <div className="min-w-0 space-y-1">
        <p className="text-xs font-medium text-gray-600">{titulo}</p>
        <p className="text-xl sm:text-2xl font-extrabold tabular-nums leading-none text-gray-900 whitespace-nowrap">{valor}</p>
        {children}
      </div>
    </div>
  );
}

export function KpisDelDia({ dailies, targets, ticketBase }: { dailies: DashboardDaily[]; targets: KpiTargets | null; ticketBase: number }) {
  const conVenta = useMemo(() => [...dailies].filter((d) => d.revenue !== null).sort((a, b) => a.date.localeCompare(b.date)), [dailies]);
  const ultimo = conVenta.at(-1) ?? null;

  if (!ultimo) {
    return (
      <TarjetaInicio icono={BarChart3} titulo="KPIs del día">
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <p className="text-sm text-gray-600">Aún no hay días registrados este mes.</p>
          <button type="button" onClick={() => ir("registro-diario")}
            className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-light">Registrar el día</button>
        </div>
      </TarjetaInicio>
    );
  }

  const otros = conVenta.slice(0, -1);
  const promedio = otros.length ? otros.reduce((t, d) => t + (d.revenue ?? 0), 0) / otros.length : null;
  const venta = ultimo.revenue ?? 0;
  const ticket = ticketDelDia(ultimo);
  const mermasPct = ultimo.mermasSoles !== null && venta > 0 ? ultimo.mermasSoles / venta : null;
  const tMeta = targets?.tiempoMaxMin ?? null;

  return (
    <TarjetaInicio icono={BarChart3} titulo="KPIs del día" nota={`Último día registrado: ${diaLargo(ultimo.date)}`}
      accion={<EnlaceVer onClick={() => ir("kpis-semana")}>Ver detalle</EnlaceVer>}>
      <div className="grid grid-cols-2 md:grid-cols-6 xl:grid-cols-5 gap-2.5 sm:gap-3">
        <Kpi icono={Coins} fondo="bg-emerald-50 text-primary-light" titulo="Ventas" valor={solesCorto(venta)}>
          {promedio ? <Variacion pct={((venta - promedio) / promedio) * 100} texto="vs. promedio del mes" />
            : <p className="text-xs text-gray-500">Primer día del mes</p>}
        </Kpi>
        <Kpi icono={ShoppingCart} fondo="bg-emerald-50 text-primary-light" titulo="Ticket promedio" valor={ticket !== null ? soles(ticket) : "—"}>
          {ticket !== null && ticketBase > 0 ? <Variacion pct={((ticket - ticketBase) / ticketBase) * 100} texto="vs. base" />
            : <p className="text-xs text-gray-500">{ultimo.personas ?? 0} personas</p>}
        </Kpi>
        <Kpi icono={Star} fondo="bg-amber-50 text-amber-500" titulo="NPS" valor={ultimo.nps !== null ? ultimo.nps.toLocaleString("es-PE", { maximumFractionDigits: 1 }) : "—"}>
          {ultimo.nps === null ? <Pastilla tono="neutro">Sin dato</Pastilla>
            : targets ? (ultimo.nps >= targets.npsMin ? <Pastilla tono="bien">{ultimo.nps >= 9.5 ? "Excelente" : "En meta"}</Pastilla> : <Pastilla tono="mal">Meta ≥ {targets.npsMin}</Pastilla>)
              : null}
        </Kpi>
        <Kpi icono={Trash2} ancho="largo" fondo="bg-emerald-50 text-primary-light" titulo="Mermas" valor={ultimo.mermasSoles !== null ? soles(ultimo.mermasSoles) : "—"}>
          {mermasPct === null ? <Pastilla tono="neutro">Sin dato</Pastilla>
            : <Pastilla tono={targets ? (mermasPct <= targets.mermasMaxPct ? "bien" : "mal") : "neutro"}>
              {(mermasPct * 100).toLocaleString("es-PE", { maximumFractionDigits: 1 })}% de la venta{targets ? ` · meta ≤ ${Math.round(targets.mermasMaxPct * 1000) / 10}%` : ""}
            </Pastilla>}
        </Kpi>
        <Kpi icono={Timer} ancho="ultimo" fondo="bg-emerald-50 text-primary-light" titulo="Tiempo de atención" valor={ultimo.tiempoMin !== null ? `${ultimo.tiempoMin.toLocaleString("es-PE", { maximumFractionDigits: 1 })} min` : "—"}>
          {ultimo.tiempoMin === null ? <Pastilla tono="neutro">Sin dato</Pastilla>
            : tMeta !== null ? <Pastilla tono={ultimo.tiempoMin < tMeta ? "bien" : "mal"}>{ultimo.tiempoMin < tMeta ? "Dentro del objetivo" : `Meta < ${tMeta} min`}</Pastilla>
              : null}
          {ultimo.tiempoMesaMin !== null && <p className="text-[11px] text-gray-500">Mostrador · mesa {ultimo.tiempoMesaMin.toLocaleString("es-PE", { maximumFractionDigits: 1 })} min</p>}
        </Kpi>
      </div>
    </TarjetaInicio>
  );
}

/* ─────────── Evolución de ventas ─────────── */

type Modo = "dia" | "semana" | "mes";

function lunesDe(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function EvolucionVentas({ dailies, metaDiaria, className = "" }: { dailies: DashboardDaily[]; metaDiaria: number | null; className?: string }) {
  const [modo, setModo] = useState<Modo>("dia");
  const conVenta = useMemo(() => [...dailies].filter((d) => d.revenue !== null).sort((a, b) => a.date.localeCompare(b.date)), [dailies]);
  const puntos = useMemo(() => {
    if (modo === "semana") {
      const porSemana = new Map<string, number>();
      for (const d of conVenta) porSemana.set(lunesDe(d.date), (porSemana.get(lunesDe(d.date)) ?? 0) + (d.revenue ?? 0));
      return [...porSemana].map(([lunes, venta]) => ({ etiqueta: `Sem ${diaMes(lunes)}`, venta: Math.round(venta * 100) / 100 }));
    }
    const lista = modo === "dia" ? conVenta.slice(-7) : conVenta;
    return lista.map((d) => ({ etiqueta: modo === "dia" ? dia(d.date) : String(Number(d.date.slice(8))), venta: d.revenue ?? 0 }));
  }, [conVenta, modo]);
  const total = puntos.reduce((t, p) => t + p.venta, 0);
  const ultimo = puntos.at(-1);
  const verMeta = metaDiaria !== null && modo !== "semana";

  return (
    <TarjetaInicio className={className} icono={LineChart} titulo="Evolución de ventas"
      nota={puntos.length ? `${modo === "dia" ? "Últimos días registrados" : modo === "semana" ? "Por semana del mes" : "Cada día del mes"} · ${solesCorto(total)}` : undefined}
      accion={<Segmentado valor={modo} onChange={setModo} tamano="sm" opciones={[
        { valor: "dia", etiqueta: "Día" }, { valor: "semana", etiqueta: "Semana" }, { valor: "mes", etiqueta: "Mes" },
      ]} />}>
      {puntos.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500">Las ventas aparecen aquí cuando registres el primer día.</p>
      ) : (
        <div className="relative h-56">
          {ultimo && (
            <span className="absolute right-1 top-0 z-10 rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-white shadow-sm">{solesCorto(ultimo.venta)}</span>
          )}
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={puntos} margin={{ top: 28, right: 8, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="relleno-ventas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#098B5F" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#098B5F" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#EEF2F0" />
              <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#6B7280" }} interval="preserveStartEnd" minTickGap={8} />
              <YAxis tickLine={false} axisLine={false} width={52}
                domain={[(min: number) => Math.max(0, Math.floor((min * 0.85) / 500) * 500), (max: number) => Math.ceil((Math.max(max, metaDiaria ?? 0) * 1.05) / 500) * 500]} tick={{ fontSize: 11, fill: "#6B7280" }}
                tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString("es-PE", { maximumFractionDigits: 1 })}k` : String(v))} />
              <Tooltip
                formatter={(v) => [soles(Number(v)), "Venta"]}
                contentStyle={{ borderRadius: 12, border: "1px solid #E5E7EB", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,.06)" }} />
              {verMeta && <ReferenceLine y={metaDiaria!} stroke="#F5B638" strokeDasharray="4 4"
                label={{ value: `Meta ${solesCorto(metaDiaria!)}`, position: "insideBottomLeft", fontSize: 10, fill: "#B7791F" }} />}
              <Area type="monotone" dataKey="venta" stroke="#004C40" strokeWidth={2.5} fill="url(#relleno-ventas)"
                dot={{ r: 3.5, fill: "#fff", stroke: "#004C40", strokeWidth: 2 }} activeDot={{ r: 5, fill: "#004C40" }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </TarjetaInicio>
  );
}

/* ─────────── Ticket promedio y plan de incentivos ─────────── */

export function TicketIncentivos({ data, month }: { data: IncentiveDashboard; month: string }) {
  const p = data.progress;
  const base = data.config.ticketBase;
  const actual = p.ticketActual;
  const deltaPct = actual !== null && base > 0 ? ((actual - base) / base) * 100 : null;
  const alcanzado = p.nivelAlcanzado ? p.porNivel.find((n) => n.level.nombre === p.nivelAlcanzado!.nombre) ?? null : null;
  const metaSiguiente = p.proximoNivel ? base + p.proximoNivel.level.delta : null;
  const mes = monthLabel(month).replace(/ de /i, " ").replace(/^./, (c) => c.toUpperCase());

  return (
    <section className="rounded-2xl border border-gray-200/80 bg-white p-4 sm:p-5 shadow-sm">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-light"><Target className="h-5 w-5" /></span>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Ticket promedio y plan de incentivos</h2>
            <p className="text-xs text-gray-500">Mes en curso: avance por nivel y bono proyectado del equipo de la sede.</p>
          </div>
        </div>
        <EnlaceVer onClick={() => ir("bono-del-mes")}>Ver plan completo</EnlaceVer>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Ticket actual */}
        <div className="rounded-xl border border-gray-100 bg-gradient-to-b from-primary-50/60 to-white p-4 lg:col-span-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <ShoppingCart className="h-4 w-4 text-primary-light" aria-hidden />Ticket promedio actual
          </div>
          <p className="mt-2 text-3xl font-extrabold tabular-nums text-gray-900">{actual !== null ? soles(actual) : "—"}</p>
          {deltaPct !== null && <Variacion pct={deltaPct} texto="vs. base" />}
          <p className="mt-1 text-xs text-gray-500">Base {soles(base)} · {p.daysLoaded} día{p.daysLoaded === 1 ? "" : "s"} registrado{p.daysLoaded === 1 ? "" : "s"}</p>
          {p.itemsPorPersona !== null && <p className="text-xs text-gray-500">{p.itemsPorPersona} ítems por persona</p>}
        </div>

        {/* Niveles */}
        <div className="overflow-hidden rounded-xl border border-gray-100 lg:col-span-5">
          {/* En celular, una fila por nivel (la tabla no entra sin cortar los montos). */}
          <ul className="divide-y divide-gray-100 sm:hidden">
            {p.porNivel.map((n) => {
              const meta = base + n.level.delta;
              const pct = avanceNivel(actual, base, n.level.delta);
              const esActual = p.nivelAlcanzado?.nombre === n.level.nombre;
              return (
                <li key={n.level.nombre} className={`px-3 py-3 ${esActual ? "bg-emerald-50/70" : ""}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-gray-900">{esActual && <Check className="mr-1 inline h-3.5 w-3.5 text-primary-light" aria-label="Nivel alcanzado" />}{n.level.nombre}</span>
                    <span className="text-sm font-bold tabular-nums text-gray-900">{soles(n.sumaBonos)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-xs text-gray-500">
                    <span>Ticket meta {soles(meta)}</span><span>Bono equipo</span>
                  </div>
                  <BarraAvance pct={pct} logrado={actual !== null && actual >= meta} />
                </li>
              );
            })}
          </ul>
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="bg-primary text-left text-xs font-semibold text-white">
                  <th className="px-3 py-2.5">Nivel</th>
                  <th className="px-3 py-2.5 text-right">Ticket meta</th>
                  <th className="px-3 py-2.5 text-right">Bono equipo</th>
                  <th className="px-3 py-2.5 w-[36%]">Avance</th>
                </tr>
              </thead>
              <tbody>
                {p.porNivel.map((n) => {
                  const meta = base + n.level.delta;
                  const pct = avanceNivel(actual, base, n.level.delta);
                  const logrado = actual !== null && actual >= meta;
                  const esActual = p.nivelAlcanzado?.nombre === n.level.nombre;
                  return (
                    <tr key={n.level.nombre} className={`border-t border-gray-100 ${esActual ? "bg-emerald-50/70" : ""}`}>
                      <td className="px-3 py-2.5 font-medium text-gray-900 whitespace-nowrap">
                        {esActual && <Check className="mr-1 inline h-3.5 w-3.5 text-primary-light" aria-label="Nivel alcanzado" />}{n.level.nombre}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums text-gray-700">{soles(meta)}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap font-semibold tabular-nums text-gray-900">{soles(n.sumaBonos)}</td>
                      <td className="px-3 py-2.5"><BarraAvance pct={pct} logrado={logrado} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-gray-100 px-3 py-2 text-[11px] text-gray-500">Avance: cuánto del aumento sobre la base ya se logró. 100% = nivel ganado.</p>
        </div>

        {/* Plan */}
        <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 lg:col-span-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-bold text-gray-900"><Trophy className="h-4 w-4 text-amber-500" aria-hidden />Plan de incentivos</p>
            <span className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-gray-600">{mes}</span>
          </div>
          <ul className="space-y-2.5 text-sm">
            <ItemPlan hecho={!!p.nivelAlcanzado}>
              {p.nivelAlcanzado
                ? <>Nivel alcanzado: <b>{p.nivelAlcanzado.nombre}</b> (meta {soles(base + p.nivelAlcanzado.delta)})</>
                : <>Aún sin nivel. Primera meta: <b>{p.porNivel[0] ? soles(base + p.porNivel[0].level.delta) : "—"}</b></>}
            </ItemPlan>
            <ItemPlan hecho={!!alcanzado && alcanzado.sumaBonos > 0}>
              Bono proyectado del equipo: <b>{soles(alcanzado?.sumaBonos ?? 0)}</b>
            </ItemPlan>
            {p.proximoNivel && metaSiguiente !== null ? (
              <ItemPlan hecho={false}>
                Falta <b>{soles(p.proximoNivel.faltaSoles)}</b> de ticket para {p.proximoNivel.level.nombre} ({soles(metaSiguiente)})
              </ItemPlan>
            ) : p.nivelAlcanzado ? (
              <ItemPlan hecho>Nivel más alto alcanzado. 🎉</ItemPlan>
            ) : null}
            {p.traffic.floor !== null && (
              <ItemPlan hecho={p.traffic.cumple} falla={!p.traffic.cumple}>
                Piso de tráfico: <b>{p.traffic.personasPorDia ?? "—"}</b> personas/día (mínimo {p.traffic.floor})
              </ItemPlan>
            )}
          </ul>
          <p className="mt-3 text-[11px] text-gray-500">Para cobrar también cuentan la meta de ventas y las supervisiones: míralos en «Tu bono de este mes».</p>
        </div>
      </div>
    </section>
  );
}

/** Avance = cuánto del aumento sobre la base ya se logró (0% = ticket base, 100% = meta del nivel). */
function avanceNivel(actual: number | null, base: number, delta: number): number {
  if (actual === null || delta <= 0) return actual !== null && actual >= base + delta ? 100 : 0;
  return Math.max(0, Math.min(100, ((actual - base) / delta) * 100));
}

function BarraAvance({ pct, logrado }: { pct: number; logrado: boolean }) {
  return (
    <div className="mt-1.5 flex items-center gap-2 sm:mt-0">
      <div className="h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full transition-[width] duration-700 ${logrado ? "bg-primary-light" : "bg-amber-400"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right text-xs font-semibold tabular-nums text-gray-700">{Math.round(pct)}%</span>
    </div>
  );
}

function ItemPlan({ hecho, falla = false, children }: { hecho: boolean; falla?: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-gray-700">
      {falla ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-label="No cumple" />
        : hecho ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary-light" aria-label="Cumplido" />
          : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" aria-label="Pendiente" />}
      <span className="[&_b]:whitespace-nowrap">{children}</span>
    </li>
  );
}

