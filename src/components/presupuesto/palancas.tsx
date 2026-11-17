"use client";

/**
 * Palancas del EBITDA (pedido de Jahnn, 13-nov-2026). Perillas a la izquierda, medidores a la derecha. Parte de la
 * realidad (promedio de los últimos meses cerrados). Fase 1: simulador (lib/palancas.ts). Fase 3: «¿Dónde se va la plata?» (donde-se-va.tsx). Fase 2: la ruta de 90 días y
 * «Convertir en presupuesto», que guarda un BORRADOR del plan del mes (lib/palancas-presupuesto.ts).
 */

import { useEffect, useState } from "react";
import { Loader2, Lock, LockOpen, RotateCcw, SlidersHorizontal } from "lucide-react";
import { getBasePalancas, setCandado, type DatosPalancas } from "@/app/actions/palancas";
import { admiteCandado, pisoOtrosFijos } from "@/lib/candados";
import { getPresupuesto, guardarPresupuesto } from "@/app/actions/presupuesto";
import { sugerir } from "@/lib/presupuesto";
import { planDesdePalancas, rutaDe90Dias, type Grupo, type PlanDesdePalancas } from "@/lib/palancas-presupuesto";
import { useToast } from "@/components/toast-provider";
import { GRUPO, paraLlegar, simular, type Camino, type Palancas as Pos } from "@/lib/palancas";
import { ETIQUETA_TERMOMETRO, META_BLOQUE_PCT, TOPE_PLANILLA_PCT, type Termometro } from "@/lib/regla-33";
import { nombreMes } from "@/lib/financiamientos";
import { Segmentado } from "@/components/productos/ui";
import { DondeSeVa } from "./donde-se-va";

const soles = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;
const conSigno = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}S/ ${Math.abs(Math.round(n)).toLocaleString("es-PE")}`;
const pct = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString("es-PE")}%`;
/** Regla 33-33-33: un tercio a costos variables y un tercio a fijos; de los fijos, la planilla hasta 25% y el resto lo demás. */
const META_VARIABLE = META_BLOQUE_PCT;
const META_OTROS_FIJOS = META_BLOQUE_PCT - TOPE_PLANILLA_PCT;
const TONO: Record<Termometro, string> = { fragil: "text-red-600", en_camino: "text-amber-700", eficiente: "text-emerald-700" };

/**
 * Dónde está la palanca frente a su meta, en % de la venta (pedido de Jahnn, 16-nov-2026: «Tope sano 25%… pero
 * ¿en qué nivel nos encontramos?»). La barra va de 0 a 2× la meta; la raya marca la meta.
 */
type Nivel = { pct: number; realPct: number; meta: number; nombreMeta: string; /** «ago–oct»: los meses del promedio real. */ periodo: string };
function NivelBarra({ n }: { n: Nivel }) {
  const escala = Math.max(n.meta * 2, n.pct, n.realPct) || 1;
  const ancho = (x: number) => `${Math.min(100, Math.max(0, (x / escala) * 100))}%`;
  const dif = n.pct - n.meta;
  const tono = dif <= 0.05 ? { barra: "bg-emerald-500", texto: "text-emerald-700" } : dif <= 5 ? { barra: "bg-amber-500", texto: "text-amber-700" } : { barra: "bg-red-500", texto: "text-red-600" };
  const movida = Math.abs(n.pct - n.realPct) >= 0.1;
  return (
    <div className="mt-2">
      <div className="relative h-2 rounded-full bg-gray-100">
        <div className={`h-2 rounded-full ${tono.barra}`} style={{ width: ancho(n.pct) }} />
        <div className="absolute -top-1 h-4 w-0.5 bg-gray-700" style={{ left: ancho(n.meta) }} title={`${n.nombreMeta} ${pct(n.meta)}`} />
      </div>
      <p className={`mt-1 text-[11px] font-medium ${tono.texto}`}>
        {movida ? "Con la palanca: " : `Real · promedio ${n.periodo}: `}{pct(n.pct)} de la venta · {n.nombreMeta} {pct(n.meta)} ·{" "}
        {dif <= 0.05 ? "dentro de la meta" : `${pct(dif).replace("%", "")} puntos encima`}
        {movida && <span className="font-normal text-gray-500"> (real {pct(n.realPct)})</span>}
      </p>
    </div>
  );
}

/** El candado de un costo que no se puede bajar (alquiler por contrato, sueldos). */
function BotonCandado({ bloqueado, onToggle, deshabilitado }: { bloqueado: boolean; onToggle: () => void; deshabilitado?: boolean }) {
  const Icono = bloqueado ? Lock : LockOpen;
  return (
    <button type="button" onClick={onToggle} disabled={deshabilitado} aria-pressed={bloqueado}
      title={bloqueado ? "Con candado: las palancas no lo bajan. Toca para quitarlo." : "Sin candado: las palancas pueden bajarlo. Toca si no se puede reducir."}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium disabled:opacity-50 ${bloqueado ? "bg-amber-100 text-amber-800" : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"}`}>
      <Icono className="h-3 w-3" aria-hidden />{bloqueado ? "fijo" : ""}
    </button>
  );
}

function Perilla({ titulo, ayuda, valor, real, min, max, paso, formato, onChange, nivel, comoSeMueve, candado }: {
  titulo: string; ayuda: string; valor: number; real: number; min: number; max: number; paso: number;
  formato: (n: number) => string; onChange: (n: number) => void;
  nivel?: Nivel;
  /** Qué tan fácil se mueve en la vida real (no todas las palancas se mueven igual). */
  comoSeMueve?: string;
  candado?: { bloqueado: boolean; onToggle: () => void; deshabilitado?: boolean };
}) {
  const movida = Math.abs(valor - real) > paso / 2;
  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-1.5"><label className="text-sm font-medium text-gray-900">{titulo}</label>{candado && <BotonCandado {...candado} />}</span>
        <b className="text-xl font-semibold tabular-nums text-gray-900">{formato(valor)}</b>
      </div>
      <input type="range" aria-label={titulo} min={Math.min(min, valor)} max={Math.max(max, valor)} step={paso} value={valor} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full accent-[#004C40]" />
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-gray-500">
        <span>{ayuda}</span>
        <span className="shrink-0 tabular-nums">
          Real: {formato(real)}
          {movida && <button type="button" onClick={() => onChange(real)} className="ml-2 font-medium text-primary hover:underline">volver</button>}
        </span>
      </div>
      {nivel && <NivelBarra n={nivel} />}
      {comoSeMueve && <p className="mt-1.5 text-[11px] leading-snug text-gray-400">{comoSeMueve}</p>}
    </div>
  );
}

const NOMBRE_CAMINO: Record<Camino["palanca"], string> = { ventas: "Solo vendiendo más", variable: "Solo bajando el costo variable", fijos: "Solo recortando fijos" };

function Caminos({ pos, meta, onAplicar, piso }: { pos: Pos; meta: number; onAplicar: (c: Camino) => void; piso: number }) {
  const caminos = paraLlegar(pos, meta, piso);
  if (caminos[0].yaLlego) return <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Con las palancas así ya llegas a {pct(meta)} de EBITDA.</p>;
  return (
    <ul className="mt-2 divide-y divide-gray-100">
      {caminos.map((c) => (
        <li key={c.palanca} className="flex items-center justify-between gap-3 py-2 text-sm">
          <span className="min-w-0 text-gray-700">
            {NOMBRE_CAMINO[c.palanca]}
            <span className="block text-[11px] text-gray-500">
              {c.valor === null || c.cambio === null ? (c.palanca === "fijos" && piso > 0 ? "No alcanza: los gastos con candado no se pueden bajar." : "No alcanza con esta sola palanca.") : c.palanca === "ventas"
                ? `vender ${soles(c.valor)} al mes (${conSigno(c.cambio)}, ${pct((c.cambio / pos.ventas) * 100)} más)`
                : c.palanca === "variable" ? `llevarlo a ${pct(c.valor)} (${Math.abs(c.cambio).toLocaleString("es-PE")} puntos menos)`
                : `dejarlos en ${soles(c.valor)} (${conSigno(c.cambio)} al mes)`}
            </span>
          </span>
          {c.valor !== null && <button type="button" onClick={() => onAplicar(c)} className="shrink-0 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:border-primary hover:text-primary">Probar</button>}
        </li>
      ))}
    </ul>
  );
}

function Fila({ etiqueta, valor, nota, tono }: { etiqueta: string; valor: string; nota?: string; tono?: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-2">
      <span className="text-sm text-gray-600">{etiqueta}{nota && <span className="block text-[11px] text-gray-400">{nota}</span>}</span>
      <b className={`shrink-0 tabular-nums ${tono ?? "text-gray-900"}`}>{valor}</b>
    </li>
  );
}


const mesMas = (mes: string, n: number) => {
  const i = Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1 + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
};
const mesDeHoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7);
const bonita = (c: string) => c.charAt(0) + c.slice(1).toLowerCase();
const NOMBRE_GRUPO: Record<Grupo, string> = { variable: "Costo variable", planilla: "Planilla", otrosFijos: "Otros fijos", sinMover: "No se mueve (sale del EBITDA)" };

type Vista = { plan: PlanDesdePalancas; aprobado: boolean; habiaPlan: boolean; /** Venta esperada del presupuesto guardado. */ ventaGuardada: number | null };

// ── El cuadro de «Convertir en presupuesto», didáctico (pedido de Jahnn, 16-nov-2026: «este punto es crucial») ──
// Dos pisos: arriba el RESUMEN (venta, los tres costos y el EBITDA que resulta, guardado vs propuesta) y abajo el
// DETALLE por categoría con la diferencia y una línea que explica de dónde sale cada grupo.

const COSTOS: { g: Exclude<Grupo, "sinMover">; nombre: string; meta: number; nombreMeta: string }[] = [
  { g: "variable", nombre: "Costo variable", meta: META_VARIABLE, nombreMeta: "meta" },
  { g: "planilla", nombre: "Planilla", meta: TOPE_PLANILLA_PCT, nombreMeta: "tope" },
  { g: "otrosFijos", nombre: "Otros fijos", meta: META_OTROS_FIJOS, nombreMeta: "meta" },
];
const POR_QUE: Record<Grupo, string> = {
  variable: "La perilla 2 (% de la venta) se reparte entre categorías según cuánto pesó cada una en los últimos meses cerrados.",
  planilla: "Es el monto de la perilla 3.",
  otrosFijos: "La perilla 4 se reparte según cuánto pesó cada gasto fijo en los últimos meses cerrados.",
  sinMover: "No es costo de operar (sale del EBITDA): las palancas no lo tocan. Queda como en el presupuesto guardado.",
};

/** Diferencia propuesta − guardado. En un costo, subir es rojo; en la venta y el EBITDA, subir es verde. */
function Dif({ antes, ahora, subirEsBueno = false }: { antes: number | null; ahora: number | null; subirEsBueno?: boolean }) {
  if (antes === null || ahora === null) return <span className="text-gray-300">—</span>;
  const d = Math.round(ahora - antes);
  if (d === 0) return <span className="text-gray-400">igual</span>;
  const bueno = subirEsBueno ? d > 0 : d < 0;
  return <span className={bueno ? "text-emerald-700" : "text-red-600"}>{conSigno(d)}</span>;
}
const deVenta = (monto: number, venta: number | null) => (venta && venta > 0 ? pct((monto / venta) * 100) : "");

/** Lo gastado en promedio en los meses cerrados de la base: el «de dónde partimos» del cuadro. */
type Real = { venta: number; variable: number; planilla: number; otrosFijos: number; porCategoria: Record<string, number>; meses: string };

function Resumen({ v, real }: { v: Vista; real: Real }) {
  const suma = (g: Grupo, campo: "antes" | "ahora") => v.plan.cambios.filter((c) => c.grupo === g).reduce((t, c) => t + (c[campo] ?? 0), 0);
  const ventaG = v.habiaPlan ? v.ventaGuardada : null, ventaN = v.plan.ventaEsperada;
  const realDe: Record<Exclude<Grupo, "sinMover">, number> = { variable: real.variable, planilla: real.planilla, otrosFijos: real.otrosFijos };
  const ebitdaR = real.venta - real.variable - real.planilla - real.otrosFijos;
  const ebitdaN = ventaN - COSTOS.reduce((t, c) => t + suma(c.g, "ahora"), 0);
  const ebitdaG = ventaG !== null ? ventaG - COSTOS.reduce((t, c) => t + suma(c.g, "antes"), 0) : null;
  const celda = "px-3 py-2 text-right tabular-nums";
  const sub = (monto: number | null, venta: number | null, tono = "text-gray-400") => monto === null ? null : <span className={`block text-[10px] ${tono}`}>{deVenta(monto, venta)}</span>;
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full min-w-[520px] text-xs">
        <thead className="bg-gray-50 text-gray-500">
          <tr>
            <th className="px-3 py-1.5 text-left font-medium">En resumen</th>
            <th className="px-3 py-1.5 text-right font-medium">Promedio real<span className="block text-[10px] font-normal">{real.meses}</span></th>
            {v.habiaPlan && <th className="px-3 py-1.5 text-right font-medium">Presupuesto guardado</th>}
            <th className="px-3 py-1.5 text-right font-medium">Propuesta de las palancas</th>
            <th className="px-3 py-1.5 text-right font-medium">Ajuste<span className="block text-[10px] font-normal">propuesta − real</span></th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-gray-100">
            <td className="px-3 py-2 font-medium text-gray-900">Venta esperada</td>
            <td className={`${celda} text-gray-600`}>{soles(real.venta)}</td>
            {v.habiaPlan && <td className={`${celda} text-gray-400`}>{ventaG === null ? "—" : soles(ventaG)}</td>}
            <td className={`${celda} font-semibold text-gray-900`}>{soles(ventaN)}</td>
            <td className={celda}><Dif antes={real.venta} ahora={ventaN} subirEsBueno /></td>
          </tr>
          {COSTOS.map((c) => {
            const r = realDe[c.g], g = v.habiaPlan ? suma(c.g, "antes") : null, n = suma(c.g, "ahora"), nPct = ventaN > 0 ? (n / ventaN) * 100 : 0;
            return (
              <tr key={c.g} className="border-t border-gray-100">
                <td className="px-3 py-2 text-gray-700">− {c.nombre}<span className="block text-[10px] text-gray-400">{c.nombreMeta} {pct(c.meta)} de la venta</span></td>
                <td className={`${celda} text-gray-600`}>{soles(r)}{sub(r, real.venta)}</td>
                {v.habiaPlan && <td className={`${celda} text-gray-400`}>{g === null ? "—" : soles(g)}{sub(g, ventaG)}</td>}
                <td className={`${celda} font-semibold text-gray-900`}>{soles(n)}<span className={`block text-[10px] font-medium ${nPct > c.meta + 0.05 ? "text-red-600" : "text-emerald-700"}`}>{pct(nPct)}</span></td>
                <td className={celda}><Dif antes={r} ahora={n} /></td>
              </tr>
            );
          })}
          <tr className="border-t-2 border-gray-300 bg-gray-50/70">
            <td className="px-3 py-2 font-semibold text-gray-900">= EBITDA<span className="block text-[10px] font-normal text-gray-400">lo que deja la operación</span></td>
            <td className={`${celda} text-gray-600`}>{soles(ebitdaR)}{sub(ebitdaR, real.venta)}</td>
            {v.habiaPlan && <td className={`${celda} text-gray-400`}>{ebitdaG === null ? "—" : soles(ebitdaG)}{sub(ebitdaG, ventaG)}</td>}
            <td className={`${celda} font-semibold text-gray-900`}>{soles(ebitdaN)}{sub(ebitdaN, ventaN, "text-gray-500")}</td>
            <td className={`${celda} font-semibold`}><Dif antes={ebitdaR} ahora={ebitdaN} subirEsBueno /></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

type Candados = { lista: string[]; onToggle: (categoria: string) => void; deshabilitado: boolean };

function Detalle({ v, total, real, candados }: { v: Vista; total: (g: Grupo, campo: "antes" | "ahora") => number; real: Real; candados: Candados }) {
  const prom = (c: string) => real.porCategoria[c] ?? null;
  return (
    <details className="group rounded-xl border border-gray-200" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-semibold text-gray-900">
        <span>Detalle por categoría<span className="block text-[10px] font-normal text-gray-500">Toca el candado de un gasto que no se puede bajar (alquiler, sueldos): queda en su promedio real y el ajuste se reparte entre los demás.</span></span>
        <span className="shrink-0 font-medium text-primary"><span className="group-open:hidden">Ver</span><span className="hidden group-open:inline">Ocultar</span></span>
      </summary>
      <div className="max-h-[28rem] overflow-auto border-t border-gray-100">
        <table className="w-full min-w-[560px] text-xs">
          <thead className="sticky top-0 z-10 bg-gray-50 text-gray-500"><tr>
            <th className="px-3 py-1.5 text-left font-medium">Categoría</th>
            <th className="px-3 py-1.5 text-right font-medium">Promedio real<span className="block text-[10px] font-normal">{real.meses}</span></th>
            {v.habiaPlan && <th className="px-3 py-1.5 text-right font-medium">Guardado</th>}
            <th className="px-3 py-1.5 text-right font-medium">Propuesta</th>
            <th className="px-3 py-1.5 text-right font-medium">Ajuste</th>
          </tr></thead>
          <tbody>
            {(["variable", "planilla", "otrosFijos", "sinMover"] as Grupo[]).map((g) => {
              const filas = v.plan.cambios.filter((c) => c.grupo === g);
              if (filas.length === 0) return null;
              const r = filas.reduce((t, c) => t + (prom(c.categoria) ?? 0), 0), a = total(g, "antes"), n = total(g, "ahora");
              return [
                <tr key={g} className="border-t border-gray-200 bg-gray-50/60">
                  <td className="px-3 py-1.5 font-semibold text-gray-800">{NOMBRE_GRUPO[g]}<span className="block text-[10px] font-normal leading-snug text-gray-500">{POR_QUE[g]}</span></td>
                  <td className="px-3 py-1.5 text-right align-top font-semibold tabular-nums text-gray-600">{soles(r)}</td>
                  {v.habiaPlan && <td className="px-3 py-1.5 text-right align-top font-semibold tabular-nums text-gray-400">{soles(a)}</td>}
                  <td className="px-3 py-1.5 text-right align-top font-semibold tabular-nums text-gray-900">{soles(n)}</td>
                  <td className="px-3 py-1.5 text-right align-top font-semibold tabular-nums"><Dif antes={r} ahora={n} /></td>
                </tr>,
                ...filas.map((c) => {
                  const p = prom(c.categoria), fijo = candados.lista.includes(c.categoria);
                  return (
                    <tr key={c.categoria} className={`border-t border-gray-100 ${fijo ? "bg-amber-50/40" : ""}`}>
                      <td className="px-3 py-1 pl-5 text-gray-600">
                        <span className="inline-flex items-center gap-1.5">{bonita(c.categoria)}
                          {admiteCandado(c.categoria) && <BotonCandado bloqueado={fijo} onToggle={() => candados.onToggle(c.categoria)} deshabilitado={candados.deshabilitado} />}
                        </span>
                      </td>
                      <td className="px-3 py-1 text-right tabular-nums text-gray-600">{p === null ? "—" : soles(p)}</td>
                      {v.habiaPlan && <td className="px-3 py-1 text-right tabular-nums text-gray-400">{c.antes === null ? "—" : soles(c.antes)}</td>}
                      <td className="px-3 py-1 text-right tabular-nums text-gray-800">{c.ahora === null ? "se quita" : soles(c.ahora)}</td>
                      <td className="px-3 py-1 text-right tabular-nums">{fijo ? <span className="text-amber-700">con candado</span> : <Dif antes={p} ahora={c.ahora} />}</td>
                    </tr>
                  );
                }),
              ];
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Fase 2: lo que marcan las palancas se guarda como BORRADOR del presupuesto del mes elegido. Nunca aprueba. */
function Convertir({ sede, sedeNombre, pos, onGuardado, real, candados }: { sede: number; sedeNombre: string; pos: Pos; onGuardado?: () => void; real: Real; candados: Candados }) {
  const { showToast } = useToast();
  const actual = mesDeHoy();
  const [mes, setMes] = useState(mesMas(actual, 1));
  const [vista, setVista] = useState<Vista | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"ver" | "guardar" | null>(null);
  const [guardado, setGuardado] = useState(false);
  // Si se mueve una palanca, la sede o el mes, lo que se veía ya no vale.
  const huella = `${sede}|${mes}|${pos.ventas}|${pos.variablePct}|${pos.planilla}|${pos.otrosFijos}|${candados.lista.join(",")}`;
  const [huellaVista, setHuellaVista] = useState<string | null>(null);
  const vigente = huellaVista === huella ? vista : null;
  const listaCandados = candados.lista.join(",");
  // Al poner o quitar un candado con el cuadro abierto, se vuelve a calcular solo (no hay que pulsar otra vez).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (vista) void ver(); }, [listaCandados]);

  async function ver() {
    setBusy("ver"); setError(null); setGuardado(false);
    const r = await getPresupuesto(mes, sede);
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    const s = r.data.sedes[0];
    if (!s) { setError("No encontré esa sede."); return; }
    const fijas = Object.fromEntries(candados.lista.filter((c) => c !== "PLANILLA").map((c) => [c, real.porCategoria[c] ?? 0]));
    const plan = planDesdePalancas(pos, sugerir(s.historial).lineas, { ventaEsperada: s.cabecera?.ventaEsperada ?? null, lineas: s.lineas }, fijas);
    setVista({ plan, aprobado: !!s.cabecera?.aprobadoEl, habiaPlan: s.lineas.length > 0, ventaGuardada: s.cabecera?.ventaEsperada ?? null });
    setHuellaVista(huella);
  }
  async function guardar() {
    if (!vigente || vigente.aprobado) return;
    setBusy("guardar");
    const r = await guardarPresupuesto({ businessId: sede, mes, ventaEsperada: vigente.plan.ventaEsperada, lineas: vigente.plan.lineas });
    setBusy(null);
    if (!r.ok) { showToast(r.error, "error"); return; }
    setGuardado(true);
    showToast(`Borrador de ${nombreMes(mes)} guardado para ${sedeNombre}.`, "success");
    onGuardado?.();
  }
  const total = (g: Grupo, campo: "antes" | "ahora") => (vigente?.plan.cambios ?? []).filter((c) => c.grupo === g).reduce((t, c) => t + (c[campo] ?? 0), 0);

  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-900">Convertir en presupuesto</h3>
      <p className="mt-0.5 text-xs text-gray-500">Lo que marcan las palancas pasa a ser el borrador del presupuesto de {sedeNombre}. No se aprueba solo: lo revisas y lo apruebas en Grupo → Presupuesto.</p>
      <ol className="mt-2 grid grid-cols-2 gap-1.5 text-[11px] text-gray-600 sm:grid-cols-4">
        {["Elige el mes", "Pulsa «Ver cómo quedaría»", "Compara con lo guardado", "Guarda el borrador"].map((t, i) => (
          <li key={t} className="flex items-center gap-1.5 rounded-lg bg-gray-50 px-2 py-1"><b className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] text-white">{i + 1}</b>{t}</li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Segmentado tamano="sm" opciones={[{ valor: actual, etiqueta: nombreMes(actual) }, { valor: mesMas(actual, 1), etiqueta: nombreMes(mesMas(actual, 1)) }]} valor={mes} onChange={setMes} />
        <button type="button" onClick={ver} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-primary hover:text-primary disabled:opacity-50">
          {busy === "ver" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Ver cómo quedaría
        </button>
      </div>
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {vigente && (
        <div className="mt-3 space-y-3">
          <Resumen v={vigente} real={real} />
          <Detalle v={vigente} total={total} real={real} candados={candados} />
          {vigente.plan.sinRepartir > 0 && <p className="mt-2 text-[11px] text-amber-700">No hay historial de gastos fijos para repartir {soles(vigente.plan.sinRepartir)} de «Otros fijos»: agrégalos a mano en Grupo → Presupuesto.</p>}
          {vigente.aprobado
            ? <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">El plan de {nombreMes(mes)} ya está aprobado. Para cambiarlo, primero reábrelo en Grupo → Presupuesto.</p>
            : guardado
              ? <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">Borrador guardado. Míralo en Grupo → Presupuesto, eligiendo {nombreMes(mes)}, y apruébalo cuando estés conforme.</p>
              : (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={guardar} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                    {busy === "guardar" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar como borrador de {nombreMes(mes)}
                  </button>
                  {vigente.habiaPlan && <span className="text-[11px] text-amber-700">Reemplaza el borrador que ya existe de ese mes.</span>}
                </div>
              )}
        </div>
      )}
    </div>
  );
}

/**
 * Desde el 16-nov-2026 viven en el Dashboard de Grupo, sección 4 (pedido de Jahnn: «no tener dos conceptos en
 * diferentes lados»). Con `sede` fija sigue a la sede elegida en el Dashboard (GRUPO = el Grupo, solo referencia)
 * y no muestra su propio selector ni su título.
 */
/** El mes que se mira en el Dashboard, para conectarlo con el promedio (Jahnn, 16-nov-2026: «octubre dice 12.7% y aquí 14.1%»). */
export type MesVisto = { nombre: string; ebitda: number; pct: number; estimado: boolean };

export function Palancas({ onGuardado, sede: sedeFija, mesVisto }: { onGuardado?: () => void; sede?: number; mesVisto?: MesVisto | null } = {}) {
  const [datos, setDatos] = useState<DatosPalancas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sedePropia, setSede] = useState<number>(2);
  const enDashboard = sedeFija !== undefined;
  const sede = sedeFija ?? sedePropia;
  const [movidas, setMovidas] = useState<Record<number, Pos>>({});
  const [meta, setMeta] = useState<number>(25);
  const { showToast } = useToast();
  // Candados por sede (16-nov-2026): parten de lo guardado y se cambian aquí mismo.
  const [candados, setCandados] = useState<Record<number, string[]>>({});
  useEffect(() => { void getBasePalancas().then((r) => {
    if (r.ok) { setDatos(r.data); setCandados(Object.fromEntries(r.data.sedes.map((x) => [x.businessId, x.candados]))); } else setError(r.error);
  }); }, []);

  const actual = datos?.sedes.find((s) => s.businessId === sede) ?? null;
  const base = actual?.base ?? null;
  const pos = movidas[sede] ?? base?.palancas ?? null;
  const lectura = pos ? simular(pos) : null;
  const lecturaReal = base ? simular(base.palancas) : null;

  if (error) return <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>;
  if (!datos) return <p className="inline-flex items-center gap-2 p-4 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Leyendo los últimos meses cerrados…</p>;

  const mover = (cambio: Partial<Pos>) => { if (pos) setMovidas({ ...movidas, [sede]: { ...pos, ...cambio } }); };
  const lista = candados[sede] ?? [];
  // Los meses del promedio real, en corto («ago–oct»): reemplaza el «Hoy» que confundía (Jahnn, 16-nov-2026).
  const corto = (m: string) => nombreMes(m).split(" ")[0].slice(0, 3);
  const periodo = !base ? "" : base.meses.length === 1 ? nombreMes(base.meses[0]) : `${corto(base.meses[0])}–${corto(base.meses[base.meses.length - 1])}`;
  const planillaFija = lista.includes("PLANILLA");
  const promedio = actual?.promedio ?? {};
  const pisoOtros = pisoOtrosFijos(lista, promedio);
  const pisoPlanilla = planillaFija && base ? base.palancas.planilla : 0;
  const nombresFijos = lista.filter((c) => c !== "PLANILLA").map(bonita).join(", ");
  const aplicar = (c: Camino) => {
    if (!pos || c.valor === null) return;
    if (c.palanca === "ventas") mover({ ventas: Math.ceil(c.valor) });
    else if (c.palanca === "variable") mover({ variablePct: c.valor });
    else { // el recorte se reparte en proporción entre lo que NO tiene candado
      const libreP = Math.max(0, pos.planilla - pisoPlanilla), libreO = Math.max(0, pos.otrosFijos - pisoOtros);
      const recorte = pos.planilla + pos.otrosFijos - c.valor, k = libreP + libreO > 0 ? Math.min(1, recorte / (libreP + libreO)) : 0;
      mover({ planilla: Math.floor(pos.planilla - libreP * k), otrosFijos: Math.floor(pos.otrosFijos - libreO * k) });
    }
  };
  const cambiarCandado = async (categoria: string) => {
    if (sede === GRUPO) return;
    const antes = lista, bloquear = !antes.includes(categoria);
    const nueva = bloquear ? [...antes, categoria].sort() : antes.filter((c) => c !== categoria);
    setCandados({ ...candados, [sede]: nueva });
    // Al poner el candado, la palanca vuelve a lo real si estaba por debajo.
    if (bloquear && pos && base) {
      if (categoria === "PLANILLA" && pos.planilla < base.palancas.planilla) mover({ planilla: base.palancas.planilla });
      if (categoria !== "PLANILLA") { const piso = pisoOtrosFijos(nueva, promedio); if (pos.otrosFijos < piso) mover({ otrosFijos: piso }); }
    }
    const r = await setCandado(sede, categoria, bloquear);
    if (!r.ok) { setCandados((c) => ({ ...c, [sede]: antes })); showToast(r.error, "error"); }
  };
  const candadosProps: Candados = { lista, onToggle: (c) => void cambiarCandado(c), deshabilitado: !datos.candadosGuardables || sede === GRUPO };
  const metaDestino = Math.round(datos.ebitdaMetaPct * 10) / 10;
  const pctVenta = (monto: number, venta = pos?.ventas ?? 0) => (venta > 0 ? (monto / venta) * 100 : 0);
  const ruta = lecturaReal ? rutaDe90Dias(lecturaReal.ebitdaPct, 25) : [];
  const hayCambios = !!movidas[sede];

  return (
    <div className="max-w-6xl space-y-4">
      {!enDashboard && <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900"><SlidersHorizontal className="h-5 w-5 text-primary" aria-hidden />Palancas del EBITDA</h2>
          <p className="text-sm text-gray-500">Mueve una palanca y mira qué pasa. Nada se guarda hasta que pulses «Guardar como borrador».</p>
        </div>
        <Segmentado opciones={datos.sedes.map((s) => ({ valor: s.businessId, etiqueta: s.businessId === GRUPO ? `${s.sede} · referencia` : s.sede }))} valor={sede} onChange={setSede} />
      </div>}

      {!base || !pos || !lectura || !lecturaReal ? <p className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-500">{actual?.sede ?? "Esta sede"} todavía no tiene un mes cerrado con ventas y Excel completos para partir de la realidad.</p> : (
        <>
          <p className="text-xs text-gray-500">
            Punto de partida: promedio de {base.meses.length === 1 ? nombreMes(base.meses[0]) : `${nombreMes(base.meses[0])} a ${nombreMes(base.meses[base.meses.length - 1])}`} ({base.meses.length} {base.meses.length === 1 ? "mes cerrado" : "meses cerrados"}).
            {sede === 1 && <> Atelier vende a las sedes a precio interno: su meta propia está por definir.</>}
            {sede === GRUPO && <> Las tres sedes juntas, solo como referencia: lo que Atelier le vende a las cafeterías se cuenta una sola vez. Cada empresa se dirige y se presupuesta con su propia vista.</>}
          </p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* ── Perillas ── */}
            <div className="space-y-3">
              <Perilla titulo="1. Venta del mes" ayuda="Lo que esperas vender" comoSeMueve="Se mueve con precio, ticket promedio y número de clientes." valor={pos.ventas} real={base.palancas.ventas} min={Math.round(base.palancas.ventas * 0.5 / 100) * 100} max={Math.round(base.palancas.ventas * 2 / 100) * 100} paso={100} formato={soles} onChange={(n) => mover({ ventas: n })} />
              <Perilla titulo="2. Costo variable" ayuda="Insumos, empaques… de cada S/ 100 vendidos" nivel={{ pct: pos.variablePct, realPct: base.palancas.variablePct, meta: META_VARIABLE, nombreMeta: "meta", periodo }} comoSeMueve={sede === 2 || sede === 3 ? "Se mueve con recetas, mermas y precios de compra. En las cafeterías la mayor parte es lo que se le compra a Atelier." : "Se mueve con recetas, mermas y precios de compra."} valor={pos.variablePct} real={base.palancas.variablePct} min={15} max={75} paso={0.5} formato={pct} onChange={(n) => mover({ variablePct: n })} />
              <Perilla titulo="3. Planilla" ayuda="Sueldos y cargas del mes" nivel={{ pct: pctVenta(pos.planilla), realPct: pctVenta(base.palancas.planilla, base.palancas.ventas), meta: TOPE_PLANILLA_PCT, nombreMeta: "tope", periodo }} comoSeMueve={planillaFija ? "Con candado: no baja del monto real, porque los sueldos no se rebajan. Para bajarla habría que decidir menos horas o menos personas (quita el candado). La otra forma de acercarla al tope es vender más con el mismo equipo." : "Es la más difícil de bajar: significa menos horas o menos personas, y se mueve despacio. La otra forma de acercarla al tope es vender más con el mismo equipo."} candado={sede === GRUPO ? undefined : { bloqueado: planillaFija, onToggle: () => void cambiarCandado("PLANILLA"), deshabilitado: candadosProps.deshabilitado }} valor={pos.planilla} real={base.palancas.planilla} min={planillaFija ? Math.ceil(base.palancas.planilla) : Math.round(base.palancas.planilla * 0.4 / 50) * 50} max={Math.round(base.palancas.planilla * 1.5 / 50) * 50} paso={50} formato={soles} onChange={(n) => mover({ planilla: n })} />
              <Perilla titulo="4. Otros fijos" ayuda="Alquiler, servicios y el resto de la estructura" nivel={{ pct: pctVenta(pos.otrosFijos), realPct: pctVenta(base.palancas.otrosFijos, base.palancas.ventas), meta: META_OTROS_FIJOS, nombreMeta: "meta", periodo }} comoSeMueve={pisoOtros > 0 ? `No baja de ${soles(pisoOtros)}: ${nombresFijos} ${lista.filter((c) => c !== "PLANILLA").length === 1 ? "tiene" : "tienen"} candado. Pon o quita candados en «Convertir en presupuesto» → Detalle por categoría.` : "Alquiler y servicios casi no se mueven en el corto plazo. Revisa los que más pesan en «¿Dónde se va la plata?»."} valor={pos.otrosFijos} real={base.palancas.otrosFijos} min={Math.max(Math.round(base.palancas.otrosFijos * 0.4 / 50) * 50, Math.ceil(pisoOtros / 50) * 50)} max={Math.round(base.palancas.otrosFijos * 1.5 / 50) * 50} paso={50} formato={soles} onChange={(n) => mover({ otrosFijos: n })} />
              <Perilla titulo="5. Utilidad que apartas primero" ayuda="Profit First: % de la venta" valor={pos.utilidadPct} real={base.palancas.utilidadPct} min={0} max={40} paso={1} formato={pct} onChange={(n) => mover({ utilidadPct: n })} />
              {hayCambios && <button type="button" onClick={() => { const r = { ...movidas }; delete r[sede]; setMovidas(r); }} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"><RotateCcw className="h-3.5 w-3.5" aria-hidden />Volver todo a la realidad</button>}
            </div>

            {/* ── Medidores ── */}
            <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
              <div className="rounded-2xl bg-gray-50 p-4 sm:p-5" aria-live="polite">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm text-gray-600">{hayCambios ? "EBITDA con las palancas" : <>EBITDA de un mes típico <span className="text-gray-400">· promedio {periodo}</span></>}</div>
                    <div className={`mt-1 text-4xl font-semibold tabular-nums tracking-tight ${TONO[lectura.termometro]}`}>{soles(lectura.ebitda)}</div>
                    {hayCambios && <div className="mt-0.5 text-xs text-gray-500">Real · promedio {periodo}: {soles(lecturaReal.ebitda)} · cambio {conSigno(lectura.ebitda - lecturaReal.ebitda)}</div>}
                  </div>
                  <div className="text-right">
                    <div className={`text-3xl font-semibold tabular-nums ${TONO[lectura.termometro]}`}>{pct(lectura.ebitdaPct)}</div>
                    <div className={`text-xs font-semibold ${TONO[lectura.termometro]}`}>{ETIQUETA_TERMOMETRO[lectura.termometro]}</div>
                    {hayCambios && <div className="text-xs text-gray-500">Real · promedio {periodo}: {pct(lecturaReal.ebitdaPct)}</div>}
                  </div>
                </div>
                {mesVisto && (
                  <p className="mt-2 text-xs text-gray-500">
                    {mesVisto.nombre}{mesVisto.estimado ? " (estimado al cierre)" : ""} solo: <b className="tabular-nums text-gray-700">{soles(mesVisto.ebitda)} · {pct(mesVisto.pct)}</b>
                    {Math.abs(mesVisto.pct - lecturaReal.ebitdaPct) >= 0.1 && <> · {mesVisto.pct < lecturaReal.ebitdaPct ? "por debajo" : "por encima"} del promedio</>}
                  </p>
                )}
                {/* De cada S/ 100: variables, fijos y lo que queda. */}
                <div className="mt-4 flex h-3 gap-0.5 overflow-hidden rounded-full bg-gray-200" role="img" aria-label="De cada S/ 100 vendidos: costos variables, costos fijos y EBITDA">
                  <span style={{ width: `${Math.min(100, pos.variablePct)}%`, background: "#DCA64F" }} />
                  <span style={{ width: `${Math.min(100 - Math.min(100, pos.variablePct), pos.ventas > 0 ? (lectura.fijos / pos.ventas) * 100 : 0)}%`, background: "#5B7FB0" }} />
                  <span style={{ width: `${Math.max(0, lectura.ebitdaPct)}%`, background: "#4A8B72" }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500">
                  <span><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "#DCA64F" }} />Variables {pct(pos.variablePct)}</span>
                  <span><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "#5B7FB0" }} />Fijos {pct(pos.ventas > 0 ? (lectura.fijos / pos.ventas) * 100 : 0)}</span>
                  <span><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "#4A8B72" }} />EBITDA {pct(lectura.ebitdaPct)}</span>
                </div>
              </div>

              <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200/80 bg-white px-4">
                <Fila etiqueta="Punto de equilibrio" nota="venta mínima del mes para no perder" valor={lectura.equilibrio === null ? "—" : soles(lectura.equilibrio)} />
                <Fila etiqueta="Piso diario de ventas" nota="(fijos + costo variable) ÷ 30" valor={soles(lectura.pisoDiario)} />
                <Fila etiqueta="Planilla sobre la venta" nota={`tope ${TOPE_PLANILLA_PCT}%`} valor={pct(lectura.planillaPct)} tono={lectura.planillaPasada ? "text-red-600" : undefined} />
                <Fila etiqueta="Utilidad que se aparta" nota={lectura.cabe ? "la operación cabe en lo que queda" : "el EBITDA no alcanza para apartarla"} valor={soles(lectura.utilidad)} tono={lectura.cabe ? undefined : "text-red-600"} />
                <Fila etiqueta="Queda para impuestos, inversión y deudas" nota={`en promedio (${periodo}) salen ${soles(base.bolsaComprometida)} al mes por esto`} valor={conSigno(lectura.bolsa)} tono={lectura.bolsa < base.bolsaComprometida ? "text-red-600" : "text-emerald-700"} />
              </ul>

              <div className="rounded-2xl border border-gray-200/80 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">Llévame a la meta</h3>
                  <Segmentado tamano="sm" opciones={[{ valor: 25, etiqueta: "25% · paso" }, { valor: metaDestino, etiqueta: `${pct(metaDestino)} · destino` }]} valor={meta} onChange={setMeta} />
                </div>
                {ruta.length > 0 && (
                  <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Ruta de 90 días a 25%</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-600">
                      <span className="tabular-nums">Real {periodo} {pct(lecturaReal.ebitdaPct)}</span>
                      {ruta.map((paso, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5">
                          <span aria-hidden>→</span>
                          <button type="button" onClick={() => setMeta(paso)} aria-pressed={meta === paso} className={`rounded-lg border px-2 py-1 tabular-nums ${meta === paso ? "border-primary bg-white font-semibold text-primary" : "border-gray-300 bg-white text-gray-700 hover:border-primary"}`}>
                            {nombreMes(mesMas(mesDeHoy(), i + 1)).split(" ")[0]} {pct(paso)}
                          </button>
                        </span>
                      ))}
                    </div>
                    <p className="mt-1 text-[11px] text-gray-400">Toca un escalón para ver qué palanca mover ese mes. La ruta parte del promedio real y se recalcula cuando cierra un mes.</p>
                  </div>
                )}
                <p className="mt-2 text-xs text-gray-600">Para llegar a <b className="tabular-nums text-gray-900">{pct(meta)}</b>:</p>
                <Caminos pos={pos} meta={meta} onAplicar={aplicar} piso={pisoPlanilla + pisoOtros} />
                <p className="mt-2 text-[11px] text-gray-400">Cada línea mueve una sola palanca y deja las demás quietas. En la práctica se combinan.</p>
              </div>

            </div>
          </div>
          {/* A todo el ancho: el cuadro de guardado vs propuesta necesita espacio para leerse (16-nov-2026). */}
          {sede === GRUPO
            ? <p className="rounded-2xl border border-gray-200/80 bg-white p-4 text-xs text-gray-500">El presupuesto se guarda sede por sede. {enDashboard ? "Toca una sede en la sección 1" : "Elige una sede arriba"} para convertir sus palancas en el borrador del mes.</p>
            : <Convertir sede={sede} sedeNombre={actual?.sede ?? ""} pos={pos} onGuardado={onGuardado} candados={candadosProps}
                real={{ venta: base.palancas.ventas, variable: base.palancas.ventas * base.palancas.variablePct / 100, planilla: base.palancas.planilla, otrosFijos: base.palancas.otrosFijos, porCategoria: promedio,
                  meses: periodo }} />}
          {actual?.diagnostico && <DondeSeVa key={sede} d={actual.diagnostico} sede={actual.sede} />}
        </>
      )}
    </div>
  );
}
