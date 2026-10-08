"use client";

/**
 * Punto de equilibrio rediseñado con el libro (pedido de Jahnn, 5-oct-2026): el «piso» de cada
 * sede, cuántas ventas hacen falta para alcanzarlo, el margen de seguridad, la gráfica de
 * ingresos y costos, «cómo se calcula con tus números» y un simulador para los cuatro usos del
 * libro. Cálculo: lib/equilibrio.ts · datos: getEquilibrioSede (actions/breakeven.ts).
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { getEquilibrioSede, type EquilibrioSede } from "@/app/actions/breakeven";
import { analizarEquilibrio, curvaEquilibrio, simular, ESCENARIO_BASE, type AnalisisEquilibrio, type BaseEquilibrio, type CurvaEquilibrio, type Escenario } from "@/lib/equilibrio";
import { Pastilla, SeccionDesplegable, Segmentado } from "@/components/productos/ui";

const SEDES = [{ id: 2, nombre: "Fonavi" }, { id: 3, nombre: "Centro" }, { id: 1, nombre: "Atelier" }];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (m: string) => MESES[Number(m.slice(5, 7)) - 1];
const soles = (n: number) => `S/${Math.round(Math.abs(n)).toLocaleString("es-PE")}`;
const num = (n: number) => Math.round(n).toLocaleString("es-PE");
const dec = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 1 });
const COL = { ingresos: "#098B5F", costos: "#C0392B", fijos: "#4A7FB5" };

// ── La frase de arriba ──────────────────────────────────────────────────
function Lectura({ d, a }: { d: EquilibrioSede; a: AnalisisEquilibrio }) {
  if (a.pe === null) return null;
  const quien = d.sede;
  const cuando = d.enCurso ? (d.ventasBase === "proyeccion" ? "Al ritmo de este mes cerraría en" : "En un mes normal vende") : `En ${nombreMes(d.mes)} vendió`;
  const ventas = d.base!.ventas;
  return (
    <p className="text-[15px] leading-relaxed text-gray-900">
      <b>{quien}</b> necesita vender <b>{soles(a.pe)}</b> al mes ({soles(a.peDia!)} por día) para no perder plata.{" "}
      {cuando} <b>{soles(ventas)}</b>:{" "}
      {a.estado === "sobre"
        ? <><span className="text-emerald-700 font-semibold">{soles(a.margenSeguridad!)} por encima</span>. Sus ventas podrían caer un {dec(a.margenSeguridadPct!)}% antes de empezar a perder.</>
        : <><span className="text-red-700 font-semibold">{soles(a.margenSeguridad!)} por debajo</span>: {d.enCurso ? "va camino a perder" : "perdió"} unos {soles(a.utilidad!)} en el mes.</>}
    </p>
  );
}

// ── Las cuatro cifras ───────────────────────────────────────────────────
function Cifra({ titulo, valor, detalle, tono = "gris" }: { titulo: string; valor: string; detalle: string; tono?: "verde" | "rojo" | "gris" }) {
  const c = tono === "verde" ? "text-emerald-700" : tono === "rojo" ? "text-red-700" : "text-gray-900";
  return (
    <div className="rounded-xl border border-gray-200/80 bg-white px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{titulo}</div>
      <div className={`text-xl font-semibold tabular-nums mt-1 ${c}`}>{valor}</div>
      <div className="text-[11px] text-gray-500 mt-1 leading-snug">{detalle}</div>
    </div>
  );
}

function Cifras({ d, a }: { d: EquilibrioSede; a: AnalisisEquilibrio }) {
  const u = d.unidad;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
      <Cifra titulo="Piso del mes" valor={a.pe === null ? "—" : soles(a.pe)} detalle={a.peDia === null ? "" : `${soles(a.peDia)} por día · el mínimo para no perder`} />
      <Cifra titulo={u === "pedidos" ? "Pedidos necesarios" : "Ventas necesarias"} valor={a.peVentas === null ? "—" : `${num(a.peVentas)} al mes`}
        detalle={a.peVentasDia === null ? "Sin reporte de ventas de Byte para contarlas" : `${dec(a.peVentasDia)} por día · ${d.enCurso ? "hoy" : "hizo"} ${dec(a.ventasDia ?? 0)} por día`} />
      <Cifra titulo="Margen de seguridad" valor={a.margenSeguridadPct === null ? "—" : `${a.margenSeguridadPct > 0 ? "+" : ""}${dec(a.margenSeguridadPct)}%`}
        tono={a.margenSeguridad === null ? "gris" : a.margenSeguridad >= 0 ? "verde" : "rojo"}
        detalle={a.margenSeguridad === null ? "" : a.margenSeguridad >= 0 ? `${soles(a.margenSeguridad)} que las ventas pueden caer antes de perder` : `Faltan ${soles(a.margenSeguridad)} de ventas para cubrir los costos`} />
      {d.enCurso
        ? <Cifra titulo="Piso estable" valor={d.referencia ? soles(d.referencia.pe) : "—"} detalle={d.referencia ? `Promedio de los ${d.referencia.meses.length} meses cerrados` : "Sin meses cerrados"} />
        : <Cifra titulo="Incluyendo deudas" valor={a.peConDeudas === null ? "—" : soles(a.peConDeudas)} detalle={`Para pagar también las cuotas de préstamos y tarjetas (${soles(d.base!.financiamiento)} en el mes)`} />}
    </div>
  );
}

// ── La gráfica: ingresos, costos totales y costos fijos ─────────────────
const W = 720, H = 360, PL = 64, PR = 16, PT = 18, PB = 46;

/** Un paso «redondo» (1, 2, 2.5 o 5 × 10ⁿ) para que el eje tenga 4 marcas con números limpios. */
function pasoRedondo(maximo: number, marcas = 4) {
  const bruto = maximo / marcas;
  const p = Math.pow(10, Math.floor(Math.log10(bruto)));
  return [1, 2, 2.5, 5, 10].map((f) => f * p).find((x) => x >= bruto) ?? 10 * p;
}

function Grafica({ c, d, a }: { c: CurvaEquilibrio; d: EquilibrioSede; a: AnalisisEquilibrio }) {
  const [hover, setHover] = useState<number | null>(null);
  const pasoY = pasoRedondo(Math.max(...c.puntos.map((p) => Math.max(p.ingresos, p.costos))) * 1.03);
  const yMax = pasoY * 4;
  const X = (x: number) => PL + (x / c.xMax) * (W - PL - PR);
  const Y = (y: number) => H - PB - (y / yMax) * (H - PT - PB);
  const linea = (f: (p: (typeof c.puntos)[number]) => number) => c.puntos.map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)},${Y(f(p)).toFixed(1)}`).join(" ");
  const e = c.equilibrio!, act = c.actual!;
  const ultimo = c.puntos[c.puntos.length - 1];
  // Zonas: pérdida (entre costos e ingresos, antes del cruce) y ganancia (después).
  const perdida = `M${X(0)},${Y(c.puntos[0].costos)} L${X(e.x)},${Y(e.y)} L${X(0)},${Y(0)} Z`;
  const ganancia = `M${X(e.x)},${Y(e.y)} L${X(ultimo.x)},${Y(ultimo.ingresos)} L${X(ultimo.x)},${Y(ultimo.costos)} Z`;
  const yTicks = [0, 1, 2, 3, 4].map((k) => k * pasoY);
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * c.xMax);
  const unidad = c.eje === "ventas" ? (d.unidad === "pedidos" ? "pedidos" : "ventas") : "soles";
  const etX = (x: number) => (c.eje === "soles" ? soles(x) : num(x));
  const h = hover !== null ? c.puntos[hover] : null;
  const mesTxt = d.enCurso ? (d.ventasBase === "proyeccion" ? "Proyección del mes" : "Un mes normal") : `${nombreMes(d.mes)[0].toUpperCase()}${nombreMes(d.mes).slice(1)}`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-600 mb-1">
        <span className="inline-flex items-center gap-1.5"><span className="w-4 h-0.5 rounded" style={{ backgroundColor: COL.ingresos }} />Ingresos (ventas)</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 h-0.5 rounded" style={{ backgroundColor: COL.costos }} />Costos totales</span>
        <span className="inline-flex items-center gap-1.5"><svg width="16" height="4" aria-hidden><line x1="0" y1="2" x2="16" y2="2" stroke={COL.fijos} strokeWidth="2" strokeDasharray="4 3" /></svg>Costos fijos</span>
      </div>
      <div className="min-h-5 text-xs tabular-nums text-gray-700 mb-1" aria-live="polite">
        {h ? <>Con {etX(h.x)} {unidad === "soles" ? "vendidos" : unidad}: ingresos {soles(h.ingresos)} · costos {soles(h.costos)} · <b className={h.ingresos - h.costos >= 0 ? "text-emerald-700" : "text-red-700"}>{h.ingresos - h.costos >= 0 ? "gana" : "pierde"} {soles(h.ingresos - h.costos)}</b></>
          : <span className="text-gray-400">Pasa el dedo o el mouse por la gráfica: cuánto se gana o se pierde con cada nivel de ventas.</span>}
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px]" role="img" onMouseLeave={() => setHover(null)}
          aria-label={`Punto de equilibrio de ${d.sede}: ${etX(e.x)} ${unidad}, ${soles(e.y)}. ${mesTxt}: ${etX(act.x)} ${unidad}, ${soles(act.y)}.`}>
          {yTicks.map((t) => (
            <g key={`y${t}`}>
              <line x1={PL} x2={W - PR} y1={Y(t)} y2={Y(t)} stroke="#E5E7EB" strokeWidth="1" strokeDasharray={t === 0 ? undefined : "3 3"} />
              <text x={PL - 8} y={Y(t) + 4} textAnchor="end" fontSize="11" fill="#6B7280">{soles(t)}</text>
            </g>
          ))}
          {xTicks.map((t) => <text key={`x${t}`} x={X(t)} y={H - PB + 16} textAnchor="middle" fontSize="11" fill="#6B7280">{etX(t)}</text>)}
          <text x={(PL + W - PR) / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#4B5563">{unidad === "soles" ? "Ventas del mes (S/)" : `${unidad[0].toUpperCase()}${unidad.slice(1)} en el mes`}</text>
          <path d={perdida} fill={COL.costos} fillOpacity="0.08" />
          <path d={ganancia} fill={COL.ingresos} fillOpacity="0.1" />
          <text x={X(e.x * 0.35)} y={Y(e.y * 0.62)} fontSize="12" fontWeight="600" fill={COL.costos}>Pérdida</text>
          <text x={X(e.x + (c.xMax - e.x) * 0.55)} y={Y(ultimo.ingresos * 0.93)} fontSize="12" fontWeight="600" fill={COL.ingresos}>Ganancia</text>
          <path d={linea((p) => p.fijos)} fill="none" stroke={COL.fijos} strokeWidth="2" strokeDasharray="6 4" />
          <path d={linea((p) => p.costos)} fill="none" stroke={COL.costos} strokeWidth="2.2" />
          <path d={linea((p) => p.ingresos)} fill="none" stroke={COL.ingresos} strokeWidth="2.2" />
          {/* El punto de equilibrio */}
          <line x1={X(e.x)} x2={X(e.x)} y1={Y(e.y)} y2={Y(0)} stroke="#111827" strokeWidth="1" strokeDasharray="3 3" />
          <line x1={PL} x2={X(e.x)} y1={Y(e.y)} y2={Y(e.y)} stroke="#111827" strokeWidth="1" strokeDasharray="3 3" />
          <circle cx={X(e.x)} cy={Y(e.y)} r="5.5" fill="#111827" stroke="white" strokeWidth="2" />
          <text x={X(e.x) - 8} y={Y(e.y) - 14} textAnchor="end" fontSize="11.5" fontWeight="700" fill="#111827" stroke="white" strokeWidth="3" paintOrder="stroke">
            Punto de equilibrio: {unidad === "soles" ? etX(e.x) : `${num(Math.ceil(e.x))} ${unidad}`} · {soles(e.y)}
          </text>
          {/* Estás aquí */}
          <line x1={X(act.x)} x2={X(act.x)} y1={PT} y2={Y(0)} stroke={a.estado === "sobre" ? COL.ingresos : COL.costos} strokeWidth="1.5" strokeDasharray="2 3" />
          <circle cx={X(act.x)} cy={Y(act.y)} r="5" fill="white" stroke={a.estado === "sobre" ? COL.ingresos : COL.costos} strokeWidth="2.5" />
          <text x={X(act.x) + (act.x > c.xMax * 0.75 ? -6 : 6)} y={PT + 12} textAnchor={act.x > c.xMax * 0.75 ? "end" : "start"} fontSize="11.5" fontWeight="700" fill={a.estado === "sobre" ? COL.ingresos : COL.costos} stroke="white" strokeWidth="3" paintOrder="stroke">
            {mesTxt}: {etX(act.x)}{unidad === "soles" ? "" : ` ${unidad}`} · {soles(act.y)}
          </text>
          {c.puntos.map((p, i) => (
            <rect key={i} x={X(p.x) - (W - PL - PR) / c.puntos.length / 2} y={PT} width={(W - PL - PR) / c.puntos.length} height={H - PT - PB} fill="transparent" onMouseEnter={() => setHover(i)} />
          ))}
        </svg>
      </div>
    </div>
  );
}

// ── Cómo se calcula con tus números (la tabla del libro) ────────────────
function ComoSeCalcula({ d, a, b }: { d: EquilibrioSede; a: AnalisisEquilibrio; b: BaseEquilibrio }) {
  const u = d.unidad === "pedidos" ? "pedido" : "venta";
  const filas: [string, string, boolean?][] = [
    [`Costos fijos ${d.enCurso ? "(promedio de los meses cerrados)" : "del mes"}`, soles(b.fijos)],
  ];
  if (b.ticket && a.costoVariableVenta !== null && a.mcVenta !== null && a.peVentas !== null) {
    filas.push(
      [`Precio promedio por ${u} (ticket de Byte${d.ticketDe && d.ticketDe !== d.mes ? `, ${nombreMes(d.ticketDe)}` : ""})`, `S/${b.ticket.toFixed(2)}`],
      [`Costo variable promedio por ${u}`, `S/${a.costoVariableVenta.toFixed(2)}`],
      [`Margen de contribución por ${u}`, `S/${a.mcVenta.toFixed(2)} · ${dec((a.mc ?? 0) * 100)}%`],
      [`Punto de equilibrio en número de ${u}s`, `${soles(b.fijos)} ÷ S/${a.mcVenta.toFixed(2)} = ${num(a.peVentas)} al mes`, true],
      ["Punto de equilibrio en soles", `${soles(b.fijos)} ÷ ${dec((a.mc ?? 0) * 100)}% = ${soles(a.pe!)}`, true],
    );
  } else {
    filas.push(
      ["Costos variables (% de lo vendido)", `${dec(b.varRatio * 100)}%`],
      ["Margen de contribución", `${dec((a.mc ?? 0) * 100)}% de cada sol vendido`],
      ["Punto de equilibrio en soles", `${soles(b.fijos)} ÷ ${dec((a.mc ?? 0) * 100)}% = ${soles(a.pe!)}`, true],
    );
  }
  return (
    <div className="rounded-xl border border-gray-200/80 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
          <tr><th className="text-left font-medium px-4 py-2">Dato</th><th className="text-right font-medium px-4 py-2">{d.sede}</th></tr>
        </thead>
        <tbody>
          {filas.map(([k, v, fuerte]) => (
            <tr key={k} className={`border-t border-gray-100 ${fuerte ? "font-semibold text-gray-900" : "text-gray-700"}`}>
              <td className="px-4 py-2">{k}</td><td className="px-4 py-2 text-right tabular-nums">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-2.5 text-[11px] text-gray-500 bg-gray-50/60 border-t border-gray-100 leading-relaxed">
        El margen de contribución es lo que queda de cada {u} después de pagar lo que cuesta hacerla (insumos, empaques, delivery). Con eso se pagan los costos fijos (planilla, alquiler, servicios); lo que sobra es ganancia.
        No incluye las cuotas de préstamos: esas van en «incluyendo deudas».
      </p>
    </div>
  );
}

// ── ¿Y si…? ─────────────────────────────────────────────────────────────
const ATAJOS: { titulo: string; uso: string; e: Partial<Escenario> }[] = [
  { titulo: "Contratar a alguien", uso: "Evaluar un gasto nuevo", e: { gastoNuevo: 1500 } },
  { titulo: "Un mes difícil", uso: "Entender meses difíciles", e: { cantidadPct: -20 } },
  { titulo: "Subir precios 5%", uso: "Ajustar precios", e: { precioPct: 5 } },
  { titulo: "Suben los insumos 10%", uso: "Ajustar precios", e: { costoVariablePct: 10 } },
];

function Deslizador({ etiqueta, valor, min, max, paso, onChange, sufijo }: { etiqueta: string; valor: number; min: number; max: number; paso: number; onChange: (v: number) => void; sufijo: string }) {
  return (
    <label className="block text-xs text-gray-700">
      <span className="flex justify-between"><span>{etiqueta}</span><b className="tabular-nums">{valor > 0 ? "+" : ""}{valor}{sufijo}</b></span>
      <input type="range" min={min} max={max} step={paso} value={valor} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#004C40]" />
    </label>
  );
}

function Simulador({ d, b }: { d: EquilibrioSede; b: BaseEquilibrio }) {
  const [e, setE] = useState<Escenario>(ESCENARIO_BASE);
  const s = useMemo(() => simular(b, e), [b, e]);
  const u = d.unidad === "pedidos" ? "pedidos" : "ventas";
  const cambio = (k: keyof Escenario, v: number) => setE((x) => ({ ...x, [k]: v }));
  const filas: [string, string, string][] = [
    ["Piso del mes", s.antes.pe === null ? "—" : soles(s.antes.pe), s.despues.pe === null ? "sin margen" : soles(s.despues.pe)],
    [u === "pedidos" ? "Pedidos necesarios por día" : "Ventas necesarias por día", s.antes.peVentasDia === null ? "—" : dec(s.antes.peVentasDia), s.despues.peVentasDia === null ? "—" : dec(s.despues.peVentasDia)],
    ["Margen de seguridad", s.antes.margenSeguridadPct === null ? "—" : `${dec(s.antes.margenSeguridadPct)}%`, s.despues.margenSeguridadPct === null ? "—" : `${dec(s.despues.margenSeguridadPct)}%`],
    ["Resultado del mes", s.antes.utilidad === null ? "—" : `${s.antes.utilidad < 0 ? "−" : "+"}${soles(s.antes.utilidad)}`, s.despues.utilidad === null ? "—" : `${s.despues.utilidad < 0 ? "−" : "+"}${soles(s.despues.utilidad)}`],
  ];
  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white p-4 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-gray-900">¿Y si…?</h4>
        <button type="button" onClick={() => setE(ESCENARIO_BASE)} className="text-xs text-gray-500 underline decoration-dotted hover:text-gray-800">Volver a los números reales</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {ATAJOS.map((x) => (
          <button key={x.titulo} type="button" onClick={() => setE({ ...ESCENARIO_BASE, ...x.e })}
            className="text-left rounded-xl border border-gray-200 px-3 py-2 hover:border-primary/50 hover:bg-primary-50/40">
            <div className="text-xs font-semibold text-gray-900">{x.titulo}</div>
            <div className="text-[10px] text-gray-500">{x.uso}</div>
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <label className="block text-xs text-gray-700">
            Gasto fijo nuevo al mes (S/)
            <input type="number" min={0} step={100} value={e.gastoNuevo || ""} placeholder="0" onChange={(x) => cambio("gastoNuevo", Math.max(0, Number(x.target.value) || 0))}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm tabular-nums" />
          </label>
          <Deslizador etiqueta="Precios" valor={e.precioPct} min={-20} max={30} paso={1} sufijo="%" onChange={(v) => cambio("precioPct", v)} />
          <Deslizador etiqueta="Costo de insumos (variables)" valor={e.costoVariablePct} min={-20} max={40} paso={1} sufijo="%" onChange={(v) => cambio("costoVariablePct", v)} />
          <Deslizador etiqueta={`Cantidad de ${u}`} valor={e.cantidadPct} min={-50} max={50} paso={1} sufijo="%" onChange={(v) => cambio("cantidadPct", v)} />
        </div>
        <div className="space-y-3">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-gray-500"><tr><th className="text-left font-medium py-1"></th><th className="text-right font-medium py-1">Hoy</th><th className="text-right font-medium py-1">Con el cambio</th></tr></thead>
            <tbody>
              {filas.map(([k, x, y]) => (
                <tr key={k} className="border-t border-gray-100">
                  <td className="py-1.5 text-gray-700">{k}</td><td className="py-1.5 text-right tabular-nums text-gray-500">{x}</td>
                  <td className={`py-1.5 text-right tabular-nums font-semibold ${x === y ? "text-gray-500" : "text-gray-900"}`}>{y}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {s.frases.length > 0
            ? <ul className="space-y-1.5 text-xs text-gray-800 leading-relaxed">{s.frases.map((f) => <li key={f}>• {f}</li>)}</ul>
            : <p className="text-xs text-gray-500">Elige un atajo o mueve un valor para ver cómo cambia el piso.</p>}
        </div>
      </div>
    </div>
  );
}

// ── Historial ───────────────────────────────────────────────────────────
function Historial({ d }: { d: EquilibrioSede }) {
  if (d.historial.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200/80">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
          <tr>
            <th className="text-left font-medium px-3 py-2">Mes</th><th className="text-right font-medium px-3 py-2">Ventas</th>
            <th className="text-right font-medium px-3 py-2">Piso</th><th className="text-right font-medium px-3 py-2">Margen de seguridad</th>
            <th className="text-right font-medium px-3 py-2">Resultado</th><th className="text-right font-medium px-3 py-2">Excel</th>
          </tr>
        </thead>
        <tbody>
          {d.historial.map((f) => {
            const ms = f.puntoEquilibrio !== null && f.ventas > 0 && !f.enCurso ? Math.round(((f.ventas - f.puntoEquilibrio) / f.ventas) * 1000) / 10 : null;
            return (
              <tr key={f.month} className={`border-t border-gray-100 ${f.month === d.mes ? "bg-primary-50/40" : ""}`}>
                <td className="px-3 py-2 text-gray-900">{nombreMes(f.month)}{f.enCurso && <span className="text-gray-400"> (en curso)</span>}</td>
                <td className="px-3 py-2 text-right tabular-nums">{soles(f.ventas)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{f.puntoEquilibrio === null ? "—" : soles(f.puntoEquilibrio)}{f.porReferencia && <span className="block text-[10px] font-normal text-gray-400">promedio de meses cerrados</span>}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${ms === null ? "text-gray-400" : ms >= 0 ? "text-emerald-700" : "text-red-700"}`}>{ms === null ? "—" : `${ms > 0 ? "+" : ""}${dec(ms)}%`}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${f.utilidadOperativa !== null && f.utilidadOperativa < 0 ? "text-red-700" : "text-gray-700"}`}>{f.utilidadOperativa === null ? "—" : `${f.utilidadOperativa < 0 ? "−" : "+"}${soles(f.utilidadOperativa)}`}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-400">{f.excel === null ? "—" : soles(f.excel)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-3 py-2 text-[10px] text-gray-500 border-t border-gray-100">Cada mes cerrado con sus propios números (salta mes a mes porque las compras se registran el día que se pagan). «Excel» es el cálculo del Excel, como control.</p>
    </div>
  );
}

function Plegable({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <details className="group py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-gray-900">
        {titulo}
        <span className="text-xs font-medium text-primary"><span className="group-open:hidden">Ver</span><span className="hidden group-open:inline">Ocultar</span></span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

// ── La sección ──────────────────────────────────────────────────────────
export function PuntoEquilibrio({ mes, periodo }: { mes: string; periodo: string }) {
  const [datos, setDatos] = useState<Record<number, EquilibrioSede | null> | null>(null);
  useEffect(() => {
    let vivo = true;
    Promise.all(SEDES.map((s) => getEquilibrioSede(mes, s.id))).then((rs) => {
      if (!vivo) return;
      setDatos(Object.fromEntries(SEDES.map((s, i) => [s.id, rs[i].ok ? rs[i].data : null])));
    });
    return () => { vivo = false; };
  }, [mes]);
  return <VistaPuntoEquilibrio datos={datos} periodo={periodo} />;
}

/** Lo que se ve, con los datos ya cargados (separado para poder mostrarlo abierto en una vista previa). */
export function VistaPuntoEquilibrio({ datos, periodo, abiertaAlInicio = false, sedeInicial = 2 }: {
  datos: Record<number, EquilibrioSede | null> | null; periodo: string; abiertaAlInicio?: boolean; sedeInicial?: number;
}) {
  const [sede, setSede] = useState(sedeInicial);
  const d = datos?.[sede] ?? null;
  const b = d?.base ?? null;
  const a = useMemo(() => (b ? analizarEquilibrio(b) : null), [b]);
  const c = useMemo(() => (b && a ? curvaEquilibrio(b, a) : null), [b, a]);

  const resumen = !datos
    ? <span className="text-xs text-gray-400 inline-flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Calculando…</span>
    : (
      <div className="flex flex-wrap gap-1.5">
        {SEDES.map((s) => {
          const x = datos[s.id];
          const an = x?.base ? analizarEquilibrio(x.base) : null;
          if (!an || an.margenSeguridadPct === null) return <Pastilla key={s.id} tono="gris">{s.nombre}: sin datos</Pastilla>;
          return <Pastilla key={s.id} tono={an.estado === "sobre" ? "verde" : "rojo"}>{s.nombre}: {an.estado === "sobre" ? "✓" : "✕"} {dec(Math.abs(an.margenSeguridadPct))}% {an.estado === "sobre" ? "sobre" : "debajo de"} su piso</Pastilla>;
        })}
      </div>
    );

  return (
    <SeccionDesplegable
      abiertaAlInicio={abiertaAlInicio}
      titulo="Punto de equilibrio"
      subtitulo={`Lo mínimo que cada sede tiene que vender en ${periodo.split(" ")[0]} para no perder plata.`}
      resumen={resumen}
    >
      <div className="space-y-5">
        <Segmentado tamano="sm" valor={sede} onChange={setSede} opciones={SEDES.map((s) => ({ valor: s.id, etiqueta: s.nombre }))} />
        {!datos ? <div className="flex justify-center py-10 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
          : !d ? <p className="text-sm text-gray-500">No se pudo calcular el punto de equilibrio de esta sede.</p>
          : !b || !a || a.estado === "sin-datos" ? <p className="text-sm text-gray-500">{d.avisos[0] ?? "Faltan datos para calcular el punto de equilibrio."}</p>
          : a.estado === "sin-margen" ? <p className="text-sm text-red-700">Los costos variables se comen toda la venta: cada venta pierde plata y no hay piso alcanzable. El problema es de precio o de costo, no de volumen.</p>
          : (
            <>
              <Lectura d={d} a={a} />
              <Cifras d={d} a={a} />
              {c && <Grafica c={c} d={d} a={a} />}
              {/* Lo de consulta, a un toque: la cuenta del libro y el historial. */}
              <div className="divide-y divide-gray-100 border-y border-gray-100">
                <Plegable titulo={`Cómo se calcula, con los números de ${d.sede}`}><ComoSeCalcula d={d} a={a} b={b} /></Plegable>
                {d.historial.length > 0 && <Plegable titulo="Mes a mes"><Historial d={d} /></Plegable>}
              </div>
              <Simulador key={`${d.businessId}-${d.mes}`} d={d} b={b} />
              {d.avisos.length > 0 && <ul className="space-y-1 text-[11px] text-gray-500">{d.avisos.map((x) => <li key={x}>· {x}</li>)}</ul>}
            </>
          )}
      </div>
    </SeccionDesplegable>
  );
}
