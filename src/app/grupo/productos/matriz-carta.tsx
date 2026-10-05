"use client";

/**
 * Matriz de la carta: estrella, vaca, interrogante, perro (pedido de Jahnn, 5-oct-2026).
 * Vive dentro de «Candidatos a reemplazo» y usa sus mismos datos (abril → hoy).
 * La regla está en lib/productos/matriz-carta.ts; aquí solo se dibuja.
 */

import { useMemo, useState } from "react";
import type { Familia } from "@/lib/productos/panorama";
import { armarMatriz, buscarProductos, CUADRANTES, escalasMatriz, fichaDeProducto, ORDEN_CUADRANTES, type CartaSede, type FichaProducto, type Cuadrante, type ProductoMatriz, type PuntoMatriz, type PuntoPrueba, type SenalPrueba } from "@/lib/productos/matriz-carta";
import { TEXTO_TENDENCIA, type ClaseTendencia } from "@/lib/productos/tendencia";
import type { Veredicto } from "@/lib/productos/candidatos";
import { GraficoDemanda } from "@/components/productos/grafico-demanda";
import { Pastilla, PuntoFamilia, Segmentado } from "@/components/productos/ui";
import { formatCurrency } from "@/lib/utils";

const COLOR: Record<Cuadrante, string> = { estrella: "#098B5F", vaca: "#4A7FB5", interrogante: "#C98A12", perro: "#C0392B" };
const TITULO_VEREDICTO: Record<Veredicto, string> = { sacar: "Sacar de carta", preparar: "Preparar reemplazo", revisar: "Revisar en una sede", confirmar: "Confirmar si ya salió", observar: "En observación" };

const soles = (n: number) => formatCurrency(n);
const soles0 = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;
const un = (n: number) => (n >= 10 ? n.toFixed(0) : n.toFixed(1));

// ── El gráfico de puntos ────────────────────────────────────────────────
const W = 720, H = 400, PL = 50, PR = 16, PT = 14, PB = 44;

function Dispersion({ puntos, cortes, elegido, onElegir, veredictos, enPrueba }: {
  puntos: PuntoMatriz[];
  /** Productos nuevos: se dibujan como rombos huecos, sin caja. */
  enPrueba: PuntoPrueba[];
  cortes: { unidadesSemana: number; margenUnidad: number };
  elegido: string | null;
  onElegir: (clave: string) => void;
  veredictos: Map<string, Veredicto>;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const g = useMemo(() => {
    const e = escalasMatriz(puntos, cortes);
    return { ...e, lx: (v: number) => PL + e.xFrac(v) * (W - PL - PR), ly: (v: number) => H - PB - e.yFrac(v) * (H - PT - PB) };
  }, [puntos, cortes]);
  if (puntos.length === 0) return null;
  const cx = g.lx(cortes.unidadesSemana), cy = g.ly(cortes.margenUnidad);
  const h = puntos.find((p) => p.clave === hover);
  const hp = enPrueba.find((p) => p.clave === hover);

  const forma = (p: PuntoMatriz, x: number, y: number, sel: boolean) => {
    const c = COLOR[p.cuadrante];
    const stroke = sel ? "#111827" : "white";
    const sw = sel ? 2 : 1.2;
    if (p.tendencia.clase === "cayendo") return <path d={`M${x - 5.5},${y - 4} L${x + 5.5},${y - 4} L${x},${y + 5.5} Z`} fill={c} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />;
    if (p.tendencia.clase === "subiendo") return <path d={`M${x - 5.5},${y + 4} L${x + 5.5},${y + 4} L${x},${y - 5.5} Z`} fill={c} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />;
    return <circle cx={x} cy={y} r={4.8} fill={c} stroke={stroke} strokeWidth={sw} />;
  };
  const etiqueta = (q: Cuadrante, x: number, y: number, anchor: "start" | "end") => (
    <text x={x} y={y} textAnchor={anchor} fontSize="11" fontWeight="700" letterSpacing="0.06em" fill={COLOR[q]} stroke="white" strokeWidth="3.5" paintOrder="stroke" strokeLinejoin="round">
      {CUADRANTES[q].nombre.toUpperCase()}<tspan fontWeight="500" letterSpacing="0"> · {CUADRANTES[q].accion}</tspan>
    </text>
  );

  return (
    <div>
      <div className="h-5 text-xs tabular-nums text-gray-700" aria-live="polite">
        {h ? <><b>{h.nombre}</b> · {un(h.unidadesSemana)} por semana · deja {soles(h.margenUnidad)} por venta · {TEXTO_TENDENCIA[h.tendencia.clase].corto}</>
          : hp ? <><b>{hp.nombre}</b> · producto nuevo en prueba (día {hp.dia} de {hp.de}) · {un(hp.unidadesSemana)} por semana{hp.margenUnidad !== null ? ` · deja ${soles(hp.margenUnidad)} por venta` : ""}</>
          : <span className="text-gray-400">Toca un producto para ver su historia.</span>}
      </div>
      <div className="overflow-x-auto -mx-1 px-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[620px]" role="img"
        aria-label={`Matriz de la carta: ${puntos.length} productos. ${ORDEN_CUADRANTES.map((q) => `${CUADRANTES[q].nombre} ${puntos.filter((p) => p.cuadrante === q).length}`).join(", ")}.`}>
        {/* Cajas */}
        <rect x={PL} y={PT} width={cx - PL} height={cy - PT} fill={COLOR.interrogante} fillOpacity="0.07" />
        <rect x={cx} y={PT} width={W - PR - cx} height={cy - PT} fill={COLOR.estrella} fillOpacity="0.08" />
        <rect x={PL} y={cy} width={cx - PL} height={H - PB - cy} fill={COLOR.perro} fillOpacity="0.07" />
        <rect x={cx} y={cy} width={W - PR - cx} height={H - PB - cy} fill={COLOR.vaca} fillOpacity="0.08" />
        {g.yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={PL} x2={W - PR} y1={g.ly(t)} y2={g.ly(t)} stroke="#E5E7EB" strokeWidth="0.8" />
            <text x={PL - 6} y={g.ly(t) + 3} textAnchor="end" fontSize="10" fill="#6B7280">S/{t}</text>
          </g>
        ))}
        {g.xTicks.map((t) => (
          <g key={`x${t}`}>
            <line x1={g.lx(t)} x2={g.lx(t)} y1={PT} y2={H - PB} stroke="#E5E7EB" strokeWidth="0.8" />
            <text x={g.lx(t)} y={H - PB + 14} textAnchor="middle" fontSize="10" fill="#6B7280">{t}</text>
          </g>
        ))}
        <line x1={cx} x2={cx} y1={PT} y2={H - PB} stroke="#6B7280" strokeWidth="1.2" strokeDasharray="5 4" />
        <line x1={PL} x2={W - PR} y1={cy} y2={cy} stroke="#6B7280" strokeWidth="1.2" strokeDasharray="5 4" />
        <text x={(PL + W - PR) / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="#4B5563">Ventas: unidades por semana (más a la derecha, más se vende) →</text>
        <text transform={`translate(12 ${(PT + H - PB) / 2}) rotate(-90)`} textAnchor="middle" fontSize="11" fill="#4B5563">Atractivo: lo que deja cada venta →</text>
        {/* Productos: los elegidos van encima. */}
        {[...puntos].sort((a, b) => Number(a.clave === elegido) - Number(b.clave === elegido)).map((p) => {
          const x = g.lx(p.unidadesSemana), y = g.ly(Math.min(p.margenUnidad, g.yMax)) + (p.margenUnidad > g.yMax ? 5 : 0);
          const sel = p.clave === elegido;
          return (
            <g key={p.clave} onMouseEnter={() => setHover(p.clave)} onMouseLeave={() => setHover(null)} onClick={() => onElegir(p.clave)} style={{ cursor: "pointer" }}
              role="button" tabIndex={0} aria-label={`${p.nombre}: ${CUADRANTES[p.cuadrante].nombre}, ${TEXTO_TENDENCIA[p.tendencia.clase].corto}`}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onElegir(p.clave); } }}>
              <circle cx={x} cy={y} r={10} fill="transparent" />
              {forma(p, x, y, sel)}
              {veredictos.get(p.clave) === "sacar" && <circle cx={x} cy={y} r={9} fill="none" stroke="#111827" strokeWidth="1" strokeDasharray="2 2" />}
            </g>
          );
        })}
        {enPrueba.filter((p) => p.margenUnidad !== null && p.unidadesSemana > 0).map((p) => {
          const x = g.lx(p.unidadesSemana), y = g.ly(Math.min(p.margenUnidad!, g.yMax));
          return (
            <g key={`n-${p.clave}`} onMouseEnter={() => setHover(p.clave)} onMouseLeave={() => setHover(null)}>
              <circle cx={x} cy={y} r={10} fill="transparent" />
              <path d={`M${x},${y - 6} L${x + 6},${y} L${x},${y + 6} L${x - 6},${y} Z`} fill="white" stroke="#6B7280" strokeWidth="1.6" strokeDasharray="2.5 1.5" />
            </g>
          );
        })}
        {etiqueta("interrogante", PL + 8, PT + 15, "start")}
        {etiqueta("estrella", W - PR - 8, PT + 15, "end")}
        {etiqueta("perro", PL + 8, H - PB - 8, "start")}
        {etiqueta("vaca", W - PR - 8, H - PB - 8, "end")}
      </svg>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-600 mt-1">
        <span className="inline-flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M1,2 L11,2 L6,11 Z" fill="#6B7280" /></svg> la demanda cae</span>
        <span className="inline-flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M1,10 L11,10 L6,1 Z" fill="#6B7280" /></svg> sube</span>
        <span className="inline-flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><circle cx="6" cy="6" r="4.5" fill="#6B7280" /></svg> estable, poco o sin historia</span>
        <span className="inline-flex items-center gap-1"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><circle cx="7" cy="7" r="5" fill="none" stroke="#111827" strokeDasharray="2 2" /></svg> ya está en «Sacar de carta»</span>
        {enPrueba.length > 0 && <span className="inline-flex items-center gap-1"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M7,1 L13,7 L7,13 L1,7 Z" fill="white" stroke="#6B7280" strokeWidth="1.5" strokeDasharray="2.5 1.5" /></svg> producto nuevo en prueba (no se juzga)</span>}
        {g.arriba > 0 && <span>{g.arriba} que dejan más de S/{Math.round(g.yMax)} se dibujan en el borde de arriba</span>}
      </div>
    </div>
  );
}

// ── El producto elegido ─────────────────────────────────────────────────
function Detalle({ p, veredicto, acciones }: { p: PuntoMatriz; veredicto: Veredicto | null; acciones?: AccionesLanzamiento }) {
  const t = TEXTO_TENDENCIA[p.tendencia.clase];
  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white p-4 space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h5 className="text-sm font-semibold text-gray-900 flex items-center gap-2"><PuntoFamilia familia={p.familia} /><span className="break-words">{p.nombre}</span></h5>
          <p className="text-[11px] text-gray-500 mt-0.5 pl-[18px]">{p.familia}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ backgroundColor: COLOR[p.cuadrante] }}>{CUADRANTES[p.cuadrante].nombre} · {CUADRANTES[p.cuadrante].accion}</span>
          <Pastilla tono={t.tono}>{t.corto}</Pastilla>
          {veredicto && <Pastilla tono={veredicto === "sacar" ? "rojo" : "ambar"}>En candidatos: {TITULO_VEREDICTO[veredicto]}</Pastilla>}
        </div>
      </header>
      <p className="text-[13px] font-medium text-gray-900 leading-relaxed">{p.lectura}</p>
      {veredicto === "sacar" && p.cuadrante !== "perro" && (
        <p className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 leading-relaxed">
          Los candidatos a reemplazo lo marcan «Sacar de carta» porque se vende muy poco y aporta solo {soles0(p.gananciaMes)} al mes. La matriz mira cuánto deja <i>cada</i> venta; los candidatos miran además cuánto suma en total.
        </p>
      )}
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-[11px]">
        {[
          ["Vende por semana (3 últimos meses)", `${un(p.unidadesSemana)} und`],
          ["Deja por venta", `${soles(p.margenUnidad)}${p.margenPct !== null ? ` · ${p.margenPct}%` : ""}`],
          ["Gana al mes", soles0(p.gananciaMes)],
          ["Vende al mes", soles0(p.ventaMes)],
        ].map(([k, v]) => (
          <div key={k}><dt className="text-gray-500">{k}</dt><dd className="text-gray-900 font-medium tabular-nums">{v}</dd></div>
        ))}
      </dl>
      <GraficoDemanda series={[{ nombre: "Demanda", color: "#004C40", forma: "circulo", puntos: p.serie.map((x) => ({ month: x.month, completo: x.completo, porSemana: x.porDia * 7 })) }]} />
      <p className="text-[11px] text-gray-600 leading-snug">{p.tendencia.resumen}</p>
      {acciones && <div className="pt-2 border-t border-gray-100"><Lanzamiento nombre={p.nombre} anotada={p.lanzamiento} estimada={null} acciones={acciones} compacto /></div>}
    </div>
  );
}

// ── Fecha exacta de lanzamiento ─────────────────────────────────────────
export type AccionesLanzamiento = {
  guardar: (nombre: string, fecha: string) => Promise<boolean>;
  quitar: (nombre: string) => Promise<boolean>;
};

/**
 * Cuándo salió el producto: la fecha exacta que anota Jahnn, o la estimada por los
 * reportes mensuales (el 15 del primer mes con ventas). Con la exacta, los 90 días de
 * prueba y la señal desde las 2 semanas se cuentan al día.
 */
function Lanzamiento({ nombre, anotada, estimada, acciones, compacto = false }: {
  nombre: string;
  /** La fecha que anotó Jahnn (null = no hay). */
  anotada: string | null;
  /** La fecha estimada que se está usando (solo si no hay anotada). */
  estimada: string | null;
  acciones: AccionesLanzamiento;
  compacto?: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [fecha, setFecha] = useState(anotada ?? "");
  const [ocupado, setOcupado] = useState(false);
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

  async function guardar() {
    if (!fecha) return;
    setOcupado(true);
    const ok = await acciones.guardar(nombre, fecha);
    setOcupado(false);
    if (ok) setEditando(false);
  }
  async function quitar() {
    setOcupado(true);
    await acciones.quitar(nombre);
    setOcupado(false);
    setEditando(false);
  }

  if (editando) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="inline-flex items-center gap-1.5 text-gray-700">
          Salió a la venta el
          <input type="date" value={fecha} max={hoy} min="2024-01-01" onChange={(e) => setFecha(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900" />
        </label>
        <button type="button" disabled={ocupado || !fecha} onClick={() => void guardar()}
          className="px-2.5 py-1 rounded-lg bg-primary text-white font-medium disabled:opacity-50">{ocupado ? "Guardando…" : "Guardar"}</button>
        <button type="button" disabled={ocupado} onClick={() => { setEditando(false); setFecha(anotada ?? ""); }}
          className="px-2.5 py-1 rounded-lg border border-gray-300 text-gray-700 bg-white">Cancelar</button>
      </div>
    );
  }
  if (anotada) {
    return (
      <p className="text-[11px] text-gray-600 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>Salió el <b>{fechaLarga(anotada)}</b> (fecha anotada).</span>
        <button type="button" onClick={() => setEditando(true)} className="text-primary font-medium hover:underline">Cambiar</button>
        <button type="button" disabled={ocupado} onClick={() => void quitar()} className="text-gray-500 hover:underline">Quitar</button>
      </p>
    );
  }
  return (
    <p className="text-[11px] text-gray-600 flex flex-wrap items-center gap-x-2 gap-y-1">
      {estimada ? <span>Salió hacia el {fechaLarga(estimada)} <i>(estimada: los reportes son mensuales)</i>.</span>
        : compacto ? null : <span>¿Es un producto nuevo?</span>}
      <button type="button" onClick={() => setEditando(true)} className="text-primary font-medium hover:underline">
        {estimada ? "Anotar la fecha exacta" : "Anotar su fecha de lanzamiento"}
      </button>
    </p>
  );
}

// ── Productos nuevos ────────────────────────────────────────────────────
const SENAL_TEXTO: Record<SenalPrueba, { corto: string; tono: "verde" | "ambar" | "rojo" | "gris" }> = {
  pronto: { corto: "muy pronto", tono: "gris" },
  destaca: { corto: "va muy bien", tono: "verde" },
  buena: { corto: "buena acogida", tono: "verde" },
  regular: { corto: "acogida regular", tono: "ambar" },
  poca: { corto: "poca acogida", tono: "rojo" },
};

function EnPrueba({ items, acciones, anotadas }: { items: PuntoPrueba[]; acciones?: AccionesLanzamiento; /** clave → fecha anotada */ anotadas: Map<string, string> }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-2xl border border-gray-200/80 bg-gray-50/60 p-4 space-y-3">
      <div>
        <h5 className="text-sm font-semibold text-gray-900">En período de prueba ({items.length})</h5>
        <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
          Productos que salieron hace menos de 3 meses. No se les pone caja ni se les dice «reemplazar»: no es lo mismo uno que en 6 meses no vende que uno de pocas semanas.
          Aquí se ve qué señal dan, y el veredicto llega a los 90 días. Lo flojo espera (puede ser solo el arranque), pero si uno va muy bien se destaca desde las 2 semanas.
        </p>
      </div>
      <ul className="space-y-2.5">
        {items.map((p) => {
          const sg = SENAL_TEXTO[p.senal];
          return (
            <li key={p.clave} className={`rounded-xl bg-white border px-3.5 py-3 space-y-1.5 ${p.senal === "destaca" ? "border-emerald-300 ring-1 ring-emerald-200" : "border-gray-200/80"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="text-sm font-medium text-gray-900 inline-flex items-center gap-2"><PuntoFamilia familia={p.familia} />{p.nombre}</span>
                <Pastilla tono={sg.tono}>{sg.corto}</Pastilla>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden" role="img" aria-label={`Día ${p.dia} de ${p.de} de prueba`}>
                  <div className="h-full rounded-full bg-primary-light" style={{ width: `${Math.min(100, Math.round((p.dia / p.de) * 100))}%` }} />
                </div>
                <span className="text-[11px] text-gray-600 tabular-nums whitespace-nowrap">Día {p.dia} de {p.de}</span>
              </div>
              <p className="text-xs text-gray-700 leading-relaxed">{p.texto}</p>
              <p className="text-[11px] text-gray-500">Se evalúa a partir del {fechaLarga(p.evaluarEl)}.</p>
              {acciones && <Lanzamiento nombre={p.nombre} anotada={anotadas.get(p.clave) ?? null} estimada={p.fechaAnotada ? null : p.inicio} acciones={acciones} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const fechaLarga = (iso: string) => `${Number(iso.slice(8, 10))} de ${MESES_LARGOS[Number(iso.slice(5, 7)) - 1]}`;

// ── Buscador: la ficha de un producto ───────────────────────────────────
const ETIQUETA_SITUACION: Record<FichaProducto["situacion"], string> = { ubicado: "", prueba: "En período de prueba", "sin-costo": "Sin costo cargado", fuera: "Fuera de la matriz" };
const COLOR_SEDE_FICHA: Record<number, { color: string; forma: "circulo" | "cuadrado" }> = { 2: { color: "#098B5F", forma: "circulo" }, 3: { color: "#6B4FA0", forma: "cuadrado" } };

function Ficha({ f, veredicto, acciones, anotadas, onCerrar }: {
  f: FichaProducto; veredicto: Veredicto | null; acciones?: AccionesLanzamiento; anotadas: Map<string, string>; onCerrar: () => void;
}) {
  const p = f.punto;
  const t = p ? TEXTO_TENDENCIA[p.tendencia.clase] : null;
  return (
    <div className="rounded-2xl border border-gray-300 bg-white p-4 space-y-3.5" aria-label={`Ficha de ${f.nombre}`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h5 className="text-sm font-semibold text-gray-900 flex items-center gap-2"><PuntoFamilia familia={f.familia} /><span className="break-words">{f.nombre}</span></h5>
          <p className="text-[11px] text-gray-500 mt-0.5 pl-[18px]">{f.familia} · con Fonavi y Centro juntas</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {p && <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ backgroundColor: COLOR[p.cuadrante] }}>{CUADRANTES[p.cuadrante].nombre} · {CUADRANTES[p.cuadrante].accion}</span>}
          {f.situacion !== "ubicado" && <Pastilla tono={f.situacion === "prueba" ? "azul" : "gris"}>{ETIQUETA_SITUACION[f.situacion]}</Pastilla>}
          {t && <Pastilla tono={t.tono}>{t.corto}</Pastilla>}
          {veredicto && <Pastilla tono={veredicto === "sacar" ? "rojo" : "ambar"}>En candidatos: {TITULO_VEREDICTO[veredicto]}</Pastilla>}
          <button type="button" onClick={onCerrar} className="text-xs text-gray-500 hover:text-gray-800 underline decoration-dotted ml-1">Cerrar ficha</button>
        </div>
      </header>

      {p && f.puestos && (
        <>
          <p className="text-[13px] font-medium text-gray-900 leading-relaxed">{p.lectura}</p>
          <p className="text-xs text-gray-700 leading-relaxed">{f.porQue}</p>
          <p className={`text-xs leading-relaxed ${p.tendencia.ultimoMes ? "text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" : "text-gray-700"}`}><b>Demanda (las dos sedes juntas):</b> {p.tendencia.resumen}</p>
          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {[
              ["Vende por semana", `${un(p.unidadesSemana)} und`, `n.º ${f.puestos.unidades.n} de ${f.puestos.unidades.de} en unidades`],
              ["Deja por venta", `${soles(p.margenUnidad)}${p.margenPct !== null ? ` · ${p.margenPct}%` : ""}`, `n.º ${f.puestos.margen.n} de ${f.puestos.margen.de} en margen`],
              ["Gana al mes", soles0(p.gananciaMes), `n.º ${f.puestos.ganancia.n} de ${f.puestos.ganancia.de} · ${f.puestos.pctGanancia}% de la ganancia`],
              ["Vende al mes", soles0(p.ventaMes), `n.º ${f.puestos.enFamilia.n} de ${f.puestos.enFamilia.de} en su familia (por ganancia)`],
            ].map(([k, v, sub]) => (
              <div key={k} className="rounded-xl bg-gray-50 px-3 py-2.5">
                <dt className="text-[11px] text-gray-500">{k}</dt>
                <dd className="text-sm font-semibold text-gray-900 tabular-nums">{v}</dd>
                <dd className="text-[10px] text-gray-500 mt-0.5 leading-snug">{sub}</dd>
              </div>
            ))}
          </dl>
          {p.precio !== null && <p className="text-[11px] text-gray-500">Precio promedio {soles(p.precio)} · lo que deja cada venta es precio menos costo.</p>}
        </>
      )}

      {f.situacion === "prueba" && f.prueba && <EnPrueba items={[f.prueba]} acciones={acciones} anotadas={anotadas} />}
      {f.situacion === "sin-costo" && (
        <p className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 leading-relaxed">
          Vende ~{un(f.unidadesSemana)} por semana, pero <b>no tiene costo en el Excel de pricing</b>: sin costo no se sabe cuánto deja por venta y no se puede ubicar en la matriz. Vincula su costo en «Costos sin vincular», más abajo.
        </p>
      )}
      {f.situacion === "fuera" && <p className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 leading-relaxed">{f.motivoFuera}</p>}

      <div>
        <h6 className="text-xs font-semibold text-gray-800 mb-1.5">Por sede</h6>
        <div className="overflow-x-auto rounded-xl border border-gray-200/80">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr><th className="px-3 py-2 font-medium">Sede</th><th className="px-2 py-2 font-medium text-right">Por semana</th><th className="px-2 py-2 font-medium text-right">Vende al mes</th><th className="px-2 py-2 font-medium text-right">Gana al mes</th><th className="px-3 py-2 font-medium">Demanda</th></tr>
            </thead>
            <tbody>
              {f.porSede.map((s) => (
                <tr key={s.businessId} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-gray-900 font-medium">{s.sede}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{un(s.unidadesSemana)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{soles0(s.ventaMes)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{s.gananciaMes !== null ? soles0(s.gananciaMes) : "sin costo"}</td>
                  <td className="px-3 py-2"><Pastilla tono={TEXTO_TENDENCIA[s.tendencia.clase].tono}>{TEXTO_TENDENCIA[s.tendencia.clase].corto}{s.tendencia.cambioPct !== null && s.tendencia.clase !== "poco-siempre" ? ` ${s.tendencia.cambioPct > 0 ? "+" : ""}${s.tendencia.cambioPct}%` : ""}</Pastilla></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <GraficoDemanda series={f.porSede.map((s) => ({
        nombre: s.sede, ...(COLOR_SEDE_FICHA[s.businessId] ?? { color: "#004C40", forma: "circulo" as const }),
        puntos: s.serie.map((x) => ({ month: x.month, completo: x.completo, porSemana: x.porDia * 7 })),
      }))} />
      <div className="space-y-1">
        {f.porSede.map((s) => <p key={s.businessId} className="text-[11px] text-gray-600 leading-snug"><b>{s.sede}:</b> {s.tendencia.resumen}</p>)}
      </div>
      {f.situacion !== "prueba" && acciones && <div className="pt-2 border-t border-gray-100"><Lanzamiento nombre={f.nombre} anotada={f.lanzamiento} estimada={null} acciones={acciones} compacto /></div>}
    </div>
  );
}

// ── Lo principal ────────────────────────────────────────────────────────
const URGENCIA: Record<ClaseTendencia, number> = { cayendo: 0, "poco-siempre": 1, estable: 2, "sin-datos": 3, subiendo: 4 };

export function MatrizCarta({ matriz, cartas, veredictos, elegidoInicial = null, buscadoInicial = null, lanzamiento }: {
  matriz: ProductoMatriz[]; cartas: CartaSede[]; veredictos: Map<string, Veredicto>;
  /** Producto con cuya ficha se abre (para saltar desde un aviso). */
  buscadoInicial?: string | null;
  /** Producto con el que se abre (para saltar desde un aviso). */
  elegidoInicial?: string | null;
  /** Cómo anotar o quitar la fecha de lanzamiento (si no se da, no se muestra el editor). */
  lanzamiento?: AccionesLanzamiento;
}) {
  const [sede, setSede] = useState<number | null>(null);
  const [familia, setFamilia] = useState<Familia | "">("");
  const [cuadrante, setCuadrante] = useState<Cuadrante>("perro");
  const [elegido, setElegido] = useState<string | null>(elegidoInicial);
  const [todos, setTodos] = useState(false);
  const [texto, setTexto] = useState("");
  const [buscado, setBuscado] = useState<string | null>(buscadoInicial);

  const familias = useMemo(() => [...new Set(matriz.map((p) => p.familia))].sort(), [matriz]);
  const m = useMemo(() => armarMatriz(matriz, cartas, { sedeId: sede, familia: familia || null }), [matriz, cartas, sede, familia]);
  const lista = useMemo(() => {
    const xs = m.puntos.filter((p) => p.cuadrante === cuadrante);
    return xs.sort(cuadrante === "perro"
      ? (a, b) => URGENCIA[a.tendencia.clase] - URGENCIA[b.tendencia.clase] || a.gananciaMes - b.gananciaMes
      : (a, b) => b.gananciaMes - a.gananciaMes);
  }, [m, cuadrante]);
  const visibles = todos ? lista : lista.slice(0, 10);
  const sel = m.puntos.find((p) => p.clave === elegido) ?? null;
  const resultados = useMemo(() => buscarProductos(matriz, texto), [matriz, texto]);
  const ficha = useMemo(() => (buscado ? fichaDeProducto(matriz, cartas, buscado) : null), [matriz, cartas, buscado]);
  const anotadas = useMemo(() => new Map(matriz.filter((p) => p.lanzamiento).map((p) => [p.clave, p.lanzamiento!] as const)), [matriz]);
  const destacados = m.enPrueba.filter((p) => p.senal === "destaca");
  const alarmas = m.puntos.filter((p) => (p.cuadrante === "estrella" || p.cuadrante === "vaca") && p.tendencia.clase === "cayendo");

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-gray-900">Matriz de la carta</h4>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">
          Cada producto según lo que <b>vende</b> y lo que <b>deja por cada venta</b>, con todos los meses cargados (desde abril). La línea punteada es la mediana: la mitad de la carta queda de cada lado.
        </p>
      </div>

      <div className="relative">
        <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="buscar-producto">Buscar un producto</label>
        <input id="buscar-producto" type="search" value={texto} autoComplete="off" placeholder="Por ejemplo: roast beef, matcha, croissant…"
          onChange={(e) => setTexto(e.target.value)}
          className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-2 focus:outline-primary" />
        {texto.trim() !== "" && (
          <ul className="absolute z-10 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg divide-y divide-gray-100" role="listbox" aria-label="Productos encontrados">
            {resultados.length === 0
              ? <li className="px-3.5 py-3 text-sm text-gray-500">Ningún producto se llama así. Prueba con otra palabra.</li>
              : resultados.map((r) => {
                return (
                  <li key={r.clave} role="option" aria-selected={false}>
                    <button type="button" onClick={() => { setBuscado(r.clave); setElegido(null); setTexto(""); }}
                      className="w-full text-left px-3.5 py-2.5 text-sm hover:bg-gray-50 flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-2 min-w-0"><PuntoFamilia familia={r.familia} /><span className="truncate">{r.nombre}</span></span>
                      <span className="text-[11px] text-gray-500 whitespace-nowrap">{r.familia}</span>
                    </button>
                  </li>
                );
              })}
          </ul>
        )}
      </div>

      {ficha && <Ficha f={ficha} veredicto={veredictos.get(ficha.clave) ?? null} acciones={lanzamiento} anotadas={anotadas} onCerrar={() => setBuscado(null)} />}

      <div className="flex flex-wrap items-center gap-3">
        <Segmentado tamano="sm" valor={sede === null ? 0 : sede} onChange={(v) => setSede(v === 0 ? null : v)}
          opciones={[{ valor: 0, etiqueta: "Fonavi + Centro" }, { valor: 2, etiqueta: "Fonavi" }, { valor: 3, etiqueta: "Centro" }]} />
        <label className="text-xs text-gray-600 inline-flex items-center gap-2">
          Familia
          <select value={familia} onChange={(e) => setFamilia(e.target.value as Familia | "")} className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-800">
            <option value="">Toda la carta</option>
            {familias.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
      </div>

      {m.puntos.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">No hay productos con costo para ubicar en esta vista.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {ORDEN_CUADRANTES.map((q) => {
              const r = m.cuadrantes[q];
              const activo = cuadrante === q;
              return (
                <button key={q} type="button" aria-pressed={activo} onClick={() => { setCuadrante(q); setTodos(false); }}
                  className={`text-left rounded-xl border px-3.5 py-3 transition-colors ${activo ? "bg-white ring-2" : "border-gray-200 bg-white hover:border-gray-300"}`}
                  style={activo ? { borderColor: COLOR[q], boxShadow: `0 0 0 1px ${COLOR[q]}` } : undefined}>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLOR[q] }} />
                    <span className="text-xs font-semibold text-gray-800">{CUADRANTES[q].nombre}</span>
                  </div>
                  <div className="text-2xl font-semibold text-gray-900 tabular-nums mt-1 leading-none">{r.n}</div>
                  <div className="text-[11px] text-gray-500 mt-1">{CUADRANTES[q].accion}</div>
                  <div className="text-[11px] text-gray-700 mt-1.5 tabular-nums">{r.pctVenta}% de lo que vende · <b>{r.pctGanancia}%</b> de lo que gana</div>
                </button>
              );
            })}
          </div>

          {alarmas.length > 0 && (
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
              <b>Alarma:</b> {alarmas.length === 1 ? "una estrella o vaca viene" : `${alarmas.length} estrellas o vacas vienen`} cayendo, y esos son los que más ganancia dan:{" "}
              {alarmas.slice(0, 4).map((a, i) => (
                <span key={a.clave}>{i > 0 ? ", " : ""}<button type="button" className="underline decoration-dotted font-medium" onClick={() => { setElegido(a.clave); setCuadrante(a.cuadrante); }}>{a.nombre} ({a.tendencia.cambioPct}%)</button></span>
              ))}
              {alarmas.length > 4 ? ` y ${alarmas.length - 4} más` : ""}.
            </p>
          )}

          {destacados.length > 0 && (
            <p className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 leading-relaxed">
              <b>Buena noticia:</b> {destacados.length === 1 ? "un producto nuevo va" : `${destacados.length} productos nuevos van`} muy bien, aunque todavía {destacados.length === 1 ? "está" : "están"} en prueba:{" "}
              {destacados.slice(0, 4).map((d, i) => (
                <span key={d.clave}>{i > 0 ? ", " : ""}<b>{d.nombre}</b> (día {d.dia}, {d.ritmoPct}% de lo típico de su familia{d.cajaProvisional ? `, caería en ${CUADRANTES[d.cajaProvisional].nombre}` : ""})</span>
              ))}
              {destacados.length > 4 ? ` y ${destacados.length - 4} más` : ""}. Conviene cuidarlos y destacarlos mientras se confirma.
            </p>
          )}

          <Dispersion puntos={m.puntos} enPrueba={m.enPrueba} cortes={m.cortes} elegido={elegido} onElegir={(c) => { setBuscado(null); setElegido(c); const p = m.puntos.find((x) => x.clave === c); if (p) setCuadrante(p.cuadrante); }} veredictos={veredictos} />

          {sel && !ficha && <Detalle p={sel} veredicto={veredictos.get(sel.clave) ?? null} acciones={lanzamiento} />}

          <div>
            <h5 className="text-xs font-semibold text-gray-800 mb-1.5">
              <span className="w-2 h-2 rounded-full inline-block mr-1.5" style={{ backgroundColor: COLOR[cuadrante] }} />
              {CUADRANTES[cuadrante].nombre}s · {CUADRANTES[cuadrante].accion} ({lista.length})
              {cuadrante === "perro" && <span className="font-normal text-gray-500"> · primero los que más urgen: los que caen</span>}
            </h5>
            <div className="overflow-x-auto rounded-xl border border-gray-200/80">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 text-left">
                  <tr><th className="px-3 py-2 font-medium">Producto</th><th className="px-2 py-2 font-medium text-right">Por semana</th><th className="px-2 py-2 font-medium text-right">Deja por venta</th><th className="px-2 py-2 font-medium text-right">Gana al mes</th><th className="px-3 py-2 font-medium">Demanda</th></tr>
                </thead>
                <tbody>
                  {visibles.map((p) => (
                    <tr key={p.clave} onClick={() => setElegido(p.clave)} className={`border-t border-gray-100 cursor-pointer hover:bg-gray-50 ${p.clave === elegido ? "bg-primary-50/50" : ""}`}>
                      <td className="px-3 py-2 text-gray-900"><span className="inline-flex items-center gap-1.5"><PuntoFamilia familia={p.familia} />{p.nombre}</span></td>
                      <td className="px-2 py-2 text-right tabular-nums">{un(p.unidadesSemana)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{soles(p.margenUnidad)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{soles0(p.gananciaMes)}</td>
                      <td className="px-3 py-2"><Pastilla tono={TEXTO_TENDENCIA[p.tendencia.clase].tono}>{TEXTO_TENDENCIA[p.tendencia.clase].corto}{p.tendencia.cambioPct !== null && p.tendencia.clase !== "poco-siempre" ? ` ${p.tendencia.cambioPct > 0 ? "+" : ""}${p.tendencia.cambioPct}%` : ""}</Pastilla></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {lista.length > 10 && (
              <button type="button" onClick={() => setTodos(!todos)} className="mt-2 text-xs font-medium text-primary hover:underline">
                {todos ? "Ver menos" : `Ver los ${lista.length}`}
              </button>
            )}
          </div>

          <EnPrueba items={m.enPrueba} acciones={lanzamiento} anotadas={anotadas} />

          <p className="text-[11px] text-gray-500 leading-relaxed">
            Cortes de esta vista: se vende más que {un(m.cortes.unidadesSemana)} por semana y deja más de {soles(m.cortes.margenUnidad)} por venta.
            {m.sinCosto.length > 0 && <> No se ubican {m.sinCosto.length} {m.sinCosto.length === 1 ? "producto" : "productos"} sin costo en el Excel de pricing.</>}
            {m.fuera > 0 && <> Quedan fuera {m.fuera} que ya no se venden o son acompañamientos.</>}
            {" "}La tendencia compara lo que vendía por semana antes contra los últimos 3 meses, solo con meses completos.
          </p>
        </>
      )}
    </div>
  );
}
