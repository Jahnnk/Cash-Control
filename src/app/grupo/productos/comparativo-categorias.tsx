"use client";

/**
 * Comparativo de ventas por sedes y categorías en un periodo de meses elegido (pedido de Jahnn, 13-nov-2026: «¿bajó
 * pastelería desde que trabaja una sola persona, o bajó toda la sede?»). Rediseño del 14-nov-2026 según su maqueta:
 * tarjetas de resumen, gráfico de evolución (día · semana · mes), tabla mes a mes y «antes y después» en tarjetas.
 * Solo lee: historial del buscador de producto + lib/productos/comparativo.ts. Empieza cerrada y carga al abrirse.
 *
 * Qué permite cada vista del gráfico (se dice en pantalla, no se rellena):
 *   · Mes: todo.  · Semana: desde que hay cargas semanales del reporte de productos (hasta 8 por sede).
 *   · Día: solo «Toda la venta» — Byte no entrega ventas por producto y por día.
 */

import { useMemo, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, BarChart3, Clock, Download, Info, Loader2, Store, TrendingUp } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getHistorialProductos, getSeriesFinas, type SeriesFinas } from "@/app/actions/productos-panorama";
import type { HistorialProductos } from "@/lib/productos/historial-producto";
import { FAMILIAS } from "@/lib/productos/panorama";
import {
  antesDespues, comparativo, productosQueCambian, TODAS, tramoCompleto,
  type CeldaMes, type FilaComparativo, type FiltroFamilia, type ProductoCambio,
} from "@/lib/productos/comparativo";
import { SeccionDesplegable, Segmentado } from "@/components/productos/ui";
import { mesLargo } from "@/lib/productos/texto-tramo";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];
const corto = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const diaCorto = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1].toLowerCase()}`;
const soles = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;
const unid = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 1, minimumFractionDigits: n < 100 ? 1 : 0 });
const pct = (n: number) => `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`;
const conSigno = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("es-PE", { maximumFractionDigits: 1 })}`;
const mesAntes = (m: string, n: number) => { const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 - n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

type Medida = "venta" | "unidades" | "parte";
type Vista = "sedes" | "categorias";
type Grano = "dia" | "semana" | "mes";
const fmt = (n: number, medida: Medida) => (medida === "venta" ? soles(n) : medida === "unidades" ? unid(n) : pct(n));
const NOMBRE_MEDIDA: Record<Medida, string> = { venta: "venta por día", unidades: "unidades por día", parte: "parte de la sede" };
const campo = "w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900";
const COLOR_SEDE: Record<number, string> = { 2: "#3B82F6", 3: "#8B5CF6", 1: "#F0743C" };
const COLORES = ["#111827", "#3B82F6", "#8B5CF6", "#F0743C", "#10B981", "#EAB308", "#EC4899", "#14B8A6", "#9CA3AF"];

function valorDe(c: CeldaMes, medida: Medida): number | null {
  if (c.dias === 0) return null;
  return medida === "venta" ? c.ventaDia : medida === "unidades" ? c.unidadesDia : c.pctSede ?? 100;
}

/** La píldora verde, roja o gris del cambio. */
function Cambio({ n, grande = false }: { n: number | null; grande?: boolean }) {
  if (n === null) return null;
  const plano = Math.abs(n) < 0.05, sube = n > 0;
  const tono = plano ? "bg-gray-100 text-gray-600" : sube ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600";
  const Icono = sube ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-lg font-semibold tabular-nums ${tono} ${grande ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs"}`}>
      {!plano && <Icono className={grande ? "h-3.5 w-3.5" : "h-3 w-3"} aria-hidden />}{conSigno(n)}%
    </span>
  );
}

function Tarjeta({ icono, titulo, nota, children }: { icono: React.ReactNode; titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-200/80 bg-white p-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-primary">{icono}</span>
      <div className="min-w-0">
        <div className="text-xs text-gray-600">{titulo}{nota && <span className="block text-[11px] text-gray-400">{nota}</span>}</div>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">{children}</div>
      </div>
    </div>
  );
}

type Linea = { id: string; nombre: string; color: string };
type Punto = { x: string; nombre: string } & Record<string, number | string | null>;

function Globo({ active, payload, label, lineas, medida }: { active?: boolean; payload?: { dataKey?: string | number; value?: number | null }[]; label?: string; lineas: Linea[]; medida: Medida }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <div className="mb-1 text-[11px] text-gray-500">{label}</div>
      {lineas.map((l) => {
        const v = payload.find((p) => p.dataKey === l.id)?.value;
        return v == null ? null : (
          <div key={l.id} className="flex items-center justify-between gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-gray-600"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />{l.nombre}</span>
            <b className="tabular-nums text-gray-900">{fmt(v, medida)}</b>
          </div>
        );
      })}
    </div>
  );
}

function Lista({ titulo, items }: { titulo: string; items: ProductoCambio[] }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{titulo}</p>
      {items.length === 0 ? <p className="mt-1 text-xs text-gray-400">Ninguno.</p> : (
        <ul className="mt-1 space-y-0.5">
          {items.map((p) => (
            <li key={p.clave} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-gray-700">{p.nombre}</span>
              <span className="shrink-0 tabular-nums text-gray-500">{soles(p.antesDia)} → {soles(p.despuesDia)} <b className={p.cambioDia > 0 ? "text-emerald-700" : "text-red-600"}>({conSigno(p.cambioDia)})</b></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Productos({ h, fila, desde, hasta, corte, titulo }: { h: HistorialProductos; fila: FilaComparativo; desde: string; hasta: string; corte: string; titulo: string }) {
  const lista = useMemo(() => productosQueCambian(h, fila.sedeId, fila.familia, desde, hasta, corte), [h, fila.sedeId, fila.familia, desde, hasta, corte]);
  return (
    <div className="mt-3 rounded-2xl bg-gray-50 p-4">
      <p className="mb-2 text-sm font-medium text-gray-900">{titulo} · qué productos cambiaron</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Lista titulo="Los que más bajaron · S/ por día" items={lista.filter((p) => p.cambioDia < 0).slice(0, 5)} />
        <Lista titulo="Los que más subieron · S/ por día" items={lista.filter((p) => p.cambioDia > 0).slice(-5).reverse()} />
      </div>
    </div>
  );
}

export function ComparativoCategorias({ month }: { month: string }) {
  const [h, setH] = useState<HistorialProductos | null>(null);
  const [finas, setFinas] = useState<SeriesFinas | "cargando" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("sedes");
  const [familia, setFamilia] = useState<FiltroFamilia>("Postres y pastelería");
  const [sede, setSede] = useState<number>(2);
  const [medida, setMedida] = useState<Medida>("venta");
  const [grano, setGrano] = useState<Grano>("mes");
  const [rango, setRango] = useState<{ desde: string; hasta: string } | null>(null);
  const [corteElegido, setCorte] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<string | null>(null);

  function cargar() {
    if (h) return;
    getHistorialProductos(month, 12).then((r) => { if (r.ok) setH(r.data); else setError(r.error); }).catch(() => setError("No se pudo leer el historial de productos."));
  }
  function elegirGrano(g: Grano) {
    setGrano(g);
    if (g !== "mes" && finas === null) {
      setFinas("cargando");
      getSeriesFinas(month, 12).then((r) => setFinas(r.ok ? r.data : { dias: [], semanas: [] })).catch(() => setFinas({ dias: [], semanas: [] }));
    }
  }

  // Solo los meses en que alguna sede tiene reporte de productos.
  const conDatos = useMemo(() => (h ? h.meses.filter((m) => h.sedes.some((s) => s.meses.some((x) => x.mes === m && x.total > 0))) : []), [h]);
  const desde = rango?.desde ?? conDatos[Math.max(0, conDatos.length - 6)] ?? month;
  const hasta = rango?.hasta ?? conDatos[conDatos.length - 1] ?? month;
  const comp = useMemo(() => (h ? comparativo(h, desde, hasta) : null), [h, desde, hasta]);
  const meses = useMemo(() => comp?.meses ?? [], [comp]);
  const corte = corteElegido && meses.includes(corteElegido) && corteElegido !== meses[0] ? corteElegido : meses[Math.ceil(meses.length / 2)] ?? null;
  const mesActual = h?.hoy.slice(0, 7) ?? "";

  const filas = useMemo(() => (comp?.filas ?? []).filter((f) => (vista === "sedes" ? f.familia === familia : f.sedeId === sede)), [comp, vista, familia, sede]);
  const totalDe = (sedeId: number) => comp?.filas.find((f) => f.sedeId === sedeId && f.familia === TODAS)?.serie ?? null;
  const etiqueta = (f: FilaComparativo) => (vista === "sedes" ? f.sede : f.familia === TODAS ? "Toda la sede" : f.familia);
  const idFila = (f: FilaComparativo) => `${f.sedeId}|${f.familia}`;
  const hayMarcados = filas.some((f) => f.serie.some((c) => c.dias > 0 && (!c.confiable || c.aMedias)));
  const lineas: Linea[] = filas.map((f, i) => ({ id: idFila(f), nombre: etiqueta(f), color: vista === "sedes" ? COLOR_SEDE[f.sedeId] ?? COLORES[i % COLORES.length] : COLORES[i % COLORES.length] }));

  // ── Resumen del periodo ──
  const resumen = useMemo(() => {
    if (!h || filas.length === 0) return null;
    const tramos = filas.map((f) => ({ f, t: tramoCompleto(f.serie, f.familia === TODAS ? null : totalDe(f.sedeId)) })).filter((x) => x.t.dias > 0);
    if (tramos.length === 0) return null;
    // Sedes: el promedio entre las sedes. Categorías: toda la sede.
    const base = (lista: typeof tramos) => {
      if (lista.length === 0) return null;
      if (vista === "sedes") return lista.reduce((s, x) => s + x.t.ventaDia, 0) / lista.length;
      return lista.find((x) => x.f.familia === TODAS)?.t.ventaDia ?? null;
    };
    const ahora = base(tramos);
    // El periodo anterior del mismo largo, si el historial lo tiene. Se compara SOLO con las mismas filas que tienen
    // datos en los dos periodos: si una sede no tenía reportes antes, no entra (cambiaría el promedio sin que nada cambie).
    const pd = mesAntes(desde, meses.length), ph = mesAntes(desde, 1);
    const compPrevio = h.meses.includes(pd) ? comparativo(h, pd, ph).filas : [];
    const totalPrevio = (sedeId: number) => compPrevio.find((f) => f.sedeId === sedeId && f.familia === TODAS)?.serie ?? null;
    const previos = compPrevio.filter((f) => (vista === "sedes" ? f.familia === familia : f.sedeId === sede))
      .map((f) => ({ f, t: tramoCompleto(f.serie, f.familia === TODAS ? null : totalPrevio(f.sedeId)) })).filter((x) => x.t.dias > 0);
    const enAmbos = (lista: typeof tramos, otra: typeof tramos) => lista.filter((x) => otra.some((y) => y.f.sedeId === x.f.sedeId && y.f.familia === x.f.familia));
    const ahoraComparable = base(enAmbos(tramos, previos)), antes = base(enAmbos(previos, tramos));
    const sinTotal = tramos.filter((x) => vista === "sedes" || x.f.familia !== TODAS);
    const mayor = [...sinTotal].sort((a, b) => b.t.ventaDia - a.t.ventaDia)[0] ?? null;
    return { ahora, cambio: ahoraComparable !== null && antes !== null && antes > 0 ? Math.round(((ahoraComparable - antes) / antes) * 1000) / 10 : null, mayor };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h, filas, vista, familia, sede, desde, meses.length]);

  const cambios = corte ? filas.map((f) => ({ f, ad: antesDespues(f.serie, corte, f.familia === TODAS ? null : totalDe(f.sedeId)), sedeEntera: f.familia === TODAS ? null : (() => { const t = totalDe(f.sedeId); return t ? antesDespues(t, corte, null) : null; })() })) : [];
  const mayorCrecimiento = [...cambios].filter((c) => c.ad.cambioVentaPct !== null && (vista === "sedes" || c.f.familia !== TODAS)).sort((a, b) => (b.ad.cambioVentaPct ?? 0) - (a.ad.cambioVentaPct ?? 0))[0] ?? null;

  // ── Gráfico ──
  const diaPosible = vista === "sedes" && familia === TODAS && medida === "venta";
  const granoReal: Grano = grano === "dia" && !diaPosible ? "mes" : grano;
  const { puntos, notaGrafico } = useMemo((): { puntos: Punto[]; notaGrafico: string | null } => {
    if (granoReal === "mes") {
      return { puntos: meses.map((m, i) => ({ x: corto(m).split(" ")[0], nombre: mesLargo(m), ...Object.fromEntries(filas.map((f) => [idFila(f), valorDe(f.serie[i], medida)])) })), notaGrafico: null };
    }
    if (!finas || finas === "cargando") return { puntos: [], notaGrafico: null };
    const ini = `${desde}-01`, fin = `${hasta}-31`;
    if (granoReal === "dia") {
      const porDia = new Map<string, Punto>();
      for (const d of finas.dias) {
        if (d.fecha < ini || d.fecha > fin) continue;
        const p = porDia.get(d.fecha) ?? { x: diaCorto(d.fecha), nombre: diaCorto(d.fecha) };
        p[`${d.sedeId}|${TODAS}`] = d.total; porDia.set(d.fecha, p);
      }
      return { puntos: [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, p]) => p), notaGrafico: "Venta total de cada día según Byte." };
    }
    const porSemana = new Map<string, Punto>();
    // Una semana de un mes cuyo reporte no cuadra con Byte (†) tampoco es de fiar: no se dibuja.
    const noCuadra = new Set((h?.sedes ?? []).flatMap((s) => s.meses.filter((m) => !m.confiable).map((m) => `${s.id}|${m.mes}`)));
    for (const w of finas.semanas) {
      if (w.hasta < ini || w.desde > fin || !filas.some((f) => f.sedeId === w.sedeId) || noCuadra.has(`${w.sedeId}|${w.hasta.slice(0, 7)}`)) continue;
      const p = porSemana.get(w.hasta) ?? { x: diaCorto(w.hasta), nombre: `Semana que termina el ${diaCorto(w.hasta)}` };
      const total = w.porFamilia[TODAS]?.r ?? 0;
      for (const f of filas) {
        if (f.sedeId !== w.sedeId) continue;
        const c = w.porFamilia[f.familia] ?? { u: 0, r: 0 };
        p[idFila(f)] = medida === "venta" ? c.r / w.dias : medida === "unidades" ? c.u / w.dias : total > 0 ? (c.r / total) * 100 : null;
      }
      porSemana.set(w.hasta, p);
    }
    return { puntos: [...porSemana.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, p]) => p), notaGrafico: "Semanas armadas con las cargas semanales del reporte de productos: existen desde fines de septiembre de 2026 y se guardan las 8 últimas por sede. No se dibujan las semanas de un mes cuyo reporte no cuadra con Byte (†)." };
     
  }, [granoReal, meses, filas, medida, finas, desde, hasta, h]);

  // ── Promedio de las sedes (última fila de la tabla) ──
  const promedio = vista === "sedes" && filas.length > 1 ? meses.map((_, i) => { const v = filas.map((f) => valorDe(f.serie[i], medida)).filter((x): x is number => x !== null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; }) : null;

  function exportar() {
    const celda = (v: number | null) => (v === null ? "" : medida === "venta" ? v.toFixed(2) : v.toFixed(1));
    const lineasCsv = [
      [vista === "sedes" ? "Sede" : "Categoría", ...meses.map(corto)],
      ...filas.map((f) => [etiqueta(f), ...f.serie.map((c) => celda(valorDe(c, medida)))]),
      ...(promedio ? [["Promedio de las sedes", ...promedio.map(celda)]] : []),
    ];
    const csv = "﻿" + lineasCsv.map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `comparativo-${vista === "sedes" ? String(familia).toLowerCase().replace(/[^a-z0-9]+/gi, "-") : etiquetaSede(h, sede).toLowerCase()}-${NOMBRE_MEDIDA[medida].replace(/ /g, "-")}-${desde}-a-${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const abierta = detalle ? cambios.find((c) => idFila(c.f) === detalle) ?? null : null;

  return (
    <SeccionDesplegable
      titulo="Comparativo de ventas por sedes y categorías"
      subtitulo="Analiza cómo se mueve una categoría en cada sede y su evolución en el tiempo."
      resumen="Venta por día, unidades por día y parte de la venta. Con gráfico por día, semana o mes, y antes y después de un mes."
      onAbrir={cargar}
    >
      {error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : !h || !comp ? <p className="inline-flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Leyendo los reportes de productos…</p> : conDatos.length < 2 ? <p className="text-sm text-gray-500">Hace falta tener al menos dos meses con reportes de productos.</p> : (
        <div className="space-y-4">
          {/* ── Qué comparar ── */}
          <div className="grid grid-cols-1 items-end gap-3 lg:grid-cols-[auto_1fr_1fr_1fr_auto]">
            <Segmentado valor={vista} onChange={(v) => { setVista(v); setDetalle(null); }} opciones={[{ valor: "sedes" as Vista, etiqueta: "Una categoría en cada sede" }, { valor: "categorias" as Vista, etiqueta: "Las categorías de una sede" }]} />
            {vista === "sedes" ? (
              <label className="text-xs text-gray-600"><span className="mb-1 block">Categoría</span>
                <select value={familia} onChange={(e) => { setFamilia(e.target.value as FiltroFamilia); setDetalle(null); }} className={campo}>
                  <option value={TODAS}>Toda la venta</option>
                  {FAMILIAS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select></label>
            ) : (
              <label className="text-xs text-gray-600"><span className="mb-1 block">Sede</span>
                <select value={sede} onChange={(e) => { setSede(Number(e.target.value)); setDetalle(null); }} className={campo}>
                  {h.sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select></label>
            )}
            <label className="text-xs text-gray-600"><span className="mb-1 block">Desde</span>
              <select value={desde} onChange={(e) => setRango({ desde: e.target.value, hasta: e.target.value > hasta ? e.target.value : hasta })} className={campo}>
                {conDatos.map((m) => <option key={m} value={m}>{mesLargo(m)}</option>)}
              </select></label>
            <label className="text-xs text-gray-600"><span className="mb-1 block">Hasta</span>
              <select value={hasta} onChange={(e) => setRango({ desde: e.target.value < desde ? e.target.value : desde, hasta: e.target.value })} className={campo}>
                {conDatos.map((m) => <option key={m} value={m}>{mesLargo(m)}</option>)}
              </select></label>
            <button type="button" onClick={exportar} disabled={filas.length === 0} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"><Download className="h-4 w-4" aria-hidden />Exportar</button>
          </div>
          <Segmentado tamano="sm" valor={medida} onChange={setMedida} opciones={[{ valor: "venta" as Medida, etiqueta: "Venta por día" }, { valor: "unidades" as Medida, etiqueta: "Unidades por día" }, { valor: "parte" as Medida, etiqueta: "Parte de la sede" }]} />

          {filas.length === 0 ? <p className="text-sm text-gray-500">No hay ventas de esa categoría en esos meses.</p> : (
            <>
              {/* ── Resumen ── */}
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <Tarjeta icono={<Store className="h-5 w-5" aria-hidden />} titulo="Venta promedio por día" nota={vista === "sedes" ? (familia === TODAS ? "promedio de las sedes" : "solo la categoría · promedio de las sedes") : "toda la sede"}>
                  <b className="text-2xl font-semibold tabular-nums text-gray-900">{resumen?.ahora != null ? soles(resumen.ahora) : "—"}</b>
                  {resumen?.cambio != null && <span className="flex flex-col items-start"><Cambio n={resumen.cambio} /><span className="mt-0.5 text-[11px] text-gray-400">vs. periodo anterior</span></span>}
                </Tarjeta>
                <Tarjeta icono={<BarChart3 className="h-5 w-5" aria-hidden />} titulo={vista === "sedes" ? "Sede con mayor venta" : "Categoría con mayor venta"}>
                  <b className="text-xl font-semibold text-gray-900">{resumen?.mayor ? etiqueta(resumen.mayor.f) : "—"}</b>
                  {resumen?.mayor && <span className="text-sm tabular-nums text-gray-500">{soles(resumen.mayor.t.ventaDia)} por día</span>}
                </Tarjeta>
                <Tarjeta icono={<TrendingUp className="h-5 w-5" aria-hidden />} titulo="Mayor crecimiento" nota={corte ? `desde ${mesLargo(corte).toLowerCase()}` : undefined}>
                  <b className="text-xl font-semibold text-gray-900">{mayorCrecimiento ? etiqueta(mayorCrecimiento.f) : "—"}</b>
                  {mayorCrecimiento && <Cambio n={mayorCrecimiento.ad.cambioVentaPct} grande />}
                </Tarjeta>
              </div>

              {/* ── Gráfico y tabla ── */}
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                <div className="rounded-2xl border border-gray-200/80 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-[15px] font-semibold text-gray-900">Evolución de la {NOMBRE_MEDIDA[medida]}</h4>
                    <Segmentado tamano="sm" valor={granoReal} onChange={elegirGrano} opciones={[{ valor: "dia" as Grano, etiqueta: "Día", deshabilitado: !diaPosible }, { valor: "semana" as Grano, etiqueta: "Semana" }, { valor: "mes" as Grano, etiqueta: "Mes" }]} />
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">{granoReal === "mes" ? "Promedio diario de cada mes" : granoReal === "semana" ? "Promedio diario de cada semana" : "Venta de cada día"}</p>
                  {granoReal !== "mes" && finas === "cargando" ? <p className="flex h-64 items-center justify-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Leyendo…</p>
                    : puntos.length === 0 ? <p className="flex h-64 items-center justify-center px-6 text-center text-sm text-gray-500">{granoReal === "semana" ? "No hay cargas semanales del reporte de productos en estos meses." : "Sin datos para este periodo."}</p> : (
                    <div className="mt-2 h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={puntos} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                          <CartesianGrid stroke="#E5E7EB" strokeDasharray="4 4" vertical={false} />
                          <XAxis dataKey="x" tick={{ fontSize: 11, fill: "#6B7280" }} tickLine={false} axisLine={{ stroke: "#E5E7EB" }} minTickGap={24} />
                          <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => fmt(v, medida)} />
                          <Tooltip cursor={{ stroke: "#D1D5DB" }} labelFormatter={(_, p) => String(p?.[0]?.payload?.nombre ?? "")} content={<Globo lineas={lineas} medida={medida} />} />
                          {lineas.map((l) => <Line key={l.id} type="linear" dataKey={l.id} name={l.nombre} stroke={l.color} strokeWidth={2} dot={puntos.length <= 31 ? { r: 3, fill: l.color, strokeWidth: 0 } : false} activeDot={{ r: 5 }} connectNulls isAnimationActive={false} />)}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-gray-600">
                    {lineas.map((l) => <span key={l.id} className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />{l.nombre}</span>)}
                  </div>
                  {notaGrafico && <p className="mt-2 text-[11px] text-gray-400">{notaGrafico}</p>}
                  {!diaPosible && <p className="mt-1 text-[11px] text-gray-400">«Día» funciona solo con «Toda la venta» y venta por día: Byte no entrega ventas por producto y por día.</p>}
                </div>

                <div className="overflow-x-auto rounded-2xl border border-gray-200/80 bg-white p-2">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-600">
                        <th className="rounded-l-lg bg-gray-50 px-3 py-2.5 font-medium">{vista === "sedes" ? "Sede" : "Categoría"}</th>
                        {meses.map((m, i) => <th key={m} className={`whitespace-nowrap px-2 py-2.5 text-right font-medium ${m === mesActual ? "bg-emerald-50 text-primary" : "bg-gray-50"} ${i === meses.length - 1 ? "rounded-r-lg" : ""} ${corte && m === corte ? "border-l-2 border-primary/40" : ""}`}>{corto(m)}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filas.map((f, n) => (
                        <tr key={idFila(f)} className={f.familia === TODAS && vista === "categorias" ? "font-semibold" : ""}>
                          <td className="whitespace-nowrap px-3 py-2.5 text-gray-800"><span className="inline-flex items-center gap-2"><i className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: lineas[n].color }} />{etiqueta(f)}</span></td>
                          {f.serie.map((c) => {
                            const v = valorDe(c, medida);
                            return (
                              <td key={c.mes} className={`whitespace-nowrap px-2 py-2.5 text-right tabular-nums ${c.mes === mesActual ? "bg-emerald-50/50" : ""} ${corte && c.mes === corte ? "border-l-2 border-primary/40" : ""} ${c.dias > 0 && (!c.confiable || c.aMedias) ? "text-gray-400" : "text-gray-900"}`} title={c.dias > 0 ? `${mesLargo(c.mes)}: ${soles(c.venta)} · ${Math.round(c.unidades).toLocaleString("es-PE")} u · ${c.dias} días` : "Sin reporte de productos"}>
                                {v === null ? "—" : fmt(v, medida)}{c.dias > 0 && c.aMedias ? "*" : c.dias > 0 && !c.confiable ? "†" : ""}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                    {promedio && (
                      <tfoot>
                        <tr className="font-semibold text-gray-900">
                          <td className="whitespace-nowrap rounded-l-lg bg-emerald-50 px-3 py-2.5">Promedio <span className="font-normal text-gray-500">(sedes)</span></td>
                          {promedio.map((v, i) => <td key={meses[i]} className={`whitespace-nowrap bg-emerald-50 px-2 py-2.5 text-right tabular-nums ${meses[i] === mesActual ? "text-primary" : ""} ${i === meses.length - 1 ? "rounded-r-lg" : ""}`}>{v === null ? "—" : fmt(v, medida)}</td>)}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              {/* ── Antes y después ── */}
              {corte && (
                <div className="rounded-2xl border border-gray-200/80 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-primary" aria-hidden />
                      <div>
                        <h4 className="text-[15px] font-semibold text-gray-900">Antes y después</h4>
                        <p className="text-xs text-gray-500">Promedio por día de los meses anteriores vs. desde {mesLargo(corte).toLowerCase()}.</p>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-gray-600">El cambio empezó en
                      <select value={corte} onChange={(e) => setCorte(e.target.value)} className={`${campo} w-auto`}>
                        {meses.slice(1).map((m) => <option key={m} value={m}>{mesLargo(m)}</option>)}
                      </select></label>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {cambios.map(({ f, ad, sedeEntera }) => (
                      <div key={idFila(f)} className={`rounded-2xl border p-4 ${detalle === idFila(f) ? "border-primary/50" : "border-gray-200/80"}`}>
                        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900"><Store className="h-4 w-4 text-primary" aria-hidden />{etiqueta(f)}</div>
                        {ad.cambioVentaPct === null ? <p className="mt-2 text-sm text-gray-400">Faltan meses para comparar.</p> : (
                          <>
                            <div className="mt-1.5 flex items-center justify-between gap-2">
                              <span className="text-lg tabular-nums text-gray-900"><b className="font-semibold">{soles(ad.antes.ventaDia)}</b> → <b className="font-semibold">{soles(ad.despues.ventaDia)}</b> <span className="text-sm text-gray-600">por día</span></span>
                              <Cambio n={ad.cambioVentaPct} grande />
                            </div>
                            <ul className="mt-2 space-y-0.5 text-xs tabular-nums text-gray-600">
                              <li>Unidades por día: {unid(ad.antes.unidadesDia)} → {unid(ad.despues.unidadesDia)}{ad.cambioUnidadesPct !== null && <> ({conSigno(ad.cambioUnidadesPct)}%)</>}</li>
                              {sedeEntera?.cambioVentaPct != null && <li>Toda la sede: {conSigno(sedeEntera.cambioVentaPct)}%</li>}
                              {ad.antes.pctSede !== null && ad.despues.pctSede !== null && <li>Parte de la sede: {pct(ad.antes.pctSede)} → {pct(ad.despues.pctSede)}</li>}
                              <li className="text-gray-400">Compara {ad.antes.meses.length} {ad.antes.meses.length === 1 ? "mes" : "meses"} contra {ad.despues.meses.length}.</li>
                            </ul>
                            <button type="button" onClick={() => setDetalle(detalle === idFila(f) ? null : idFila(f))} aria-expanded={detalle === idFila(f)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                              {detalle === idFila(f) ? "Cerrar" : "Ver qué productos cambiaron"}{detalle !== idFila(f) && <ArrowRight className="h-3.5 w-3.5" aria-hidden />}
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                  {abierta && <Productos h={h} fila={abierta.f} desde={desde} hasta={hasta} corte={corte} titulo={etiqueta(abierta.f)} />}
                  <p className="mt-3 flex flex-wrap items-start gap-x-4 gap-y-1 text-[11px] text-gray-500">
                    <span className="inline-flex items-center gap-1"><Info className="h-3.5 w-3.5" aria-hidden />Si la categoría baja y su parte de la sede se mantiene, bajó toda la sede.</span>
                    {hayMarcados && <><span>* Mes en curso: lleva pocos días.</span><span>† El reporte de productos no cuadra con la venta de Byte: no entra al antes y después.</span></>}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </SeccionDesplegable>
  );
}

function etiquetaSede(h: HistorialProductos | null, id: number): string {
  return h?.sedes.find((s) => s.id === id)?.nombre ?? "sede";
}
