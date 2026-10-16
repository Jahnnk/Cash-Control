/**
 * El tablero de rentabilidad del CEO (pestaña «Rentabilidad» del dashboard de Grupo) · MOTOR (puro).
 *
 * Pedido de Jahnn (16-oct-2026): un tablero que junte las ideas de su coach —piso diario, Profit First,
 * food cost, planilla, mermas, regla 33-33-33 y los cuatro motores del EBITDA— con un selector
 * Consolidado · Fonavi · Centro · Atelier y un EBITDA como titular. Aquí solo se arman las cinco
 * tarjetas y el radar a partir de lo que YA calculan los otros motores (nada nuevo que cuadrar):
 *
 *   · Piso diario   = lib/equilibrio.ts (pisoDiario) vía BreakevenResult, contra lo que se vende por día.
 *   · Profit First  = lib/regla-33.ts (profitFirst): lo apartado contra el 25% de la venta.
 *   · Food cost     = los costos variables de la regla 33-33-33 contra su tercio.
 *   · Planilla      = planilla ÷ ventas contra el rango sano de 20–25%.
 *   · Mermas        = KPI de la sede (señal de eficiencia de lib/motores-ebitda.ts).
 *
 * Regla de Jahnn: al CEO solo lo que el sistema comprueba; lo que no tiene dato sale en gris.
 */

import type { BreakevenResult } from "./breakeven";
import { DIAS_DEL_PISO } from "./equilibrio";
import { PLANILLA_SANA_MIN_PCT, TOPE_PLANILLA_PCT, ETIQUETA_TERMOMETRO, type FilaProfitFirst, type FilaRegla } from "./regla-33";
import type { ClaveMotor, EstadoMotor, Motores } from "./motores-ebitda";

export type Tarjeta = {
  clave: "piso" | "profit" | "food" | "planilla" | "merma";
  titulo: string;
  /** La cifra grande. */
  valor: string;
  /** Contra qué se mide. */
  meta: string;
  /** Una línea de apoyo. */
  apoyo: string;
  estado: EstadoMotor;
  /** 0 a 100+ para una barra (100 = en su meta); null = sin barra. */
  avance: number | null;
};

const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;
const pct = (n: number) => `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`;

export type EntradaTablero = {
  regla: FilaRegla | null;
  profit: FilaProfitFirst | null;
  /** El punto de equilibrio de esa sede (o del grupo) del mes. */
  equilibrio: BreakevenResult | null;
  enCurso: boolean;
  motores: Motores | null;
};

/** Lo que se vende por día, en la misma base (÷ 30) que el piso: el mes entero si cerró, o el ritmo si está en curso. */
export function ventasPorDia(be: BreakevenResult | null, enCurso: boolean): number | null {
  if (!be) return null;
  const mes = enCurso ? be.ventasProyectadas : be.ventas;
  return mes !== null && mes > 0 ? Math.round((mes / DIAS_DEL_PISO) * 100) / 100 : null;
}

export function tarjetasDelTablero(e: EntradaTablero): Tarjeta[] {
  const out: Tarjeta[] = [];

  // 1) Piso diario
  const be = e.equilibrio;
  const vende = ventasPorDia(be, e.enCurso);
  if (be?.pisoDia && vende !== null) {
    const r = vende / be.pisoDia;
    out.push({
      clave: "piso", titulo: "Piso diario", valor: soles(be.pisoDia), meta: `vendes ${soles(vende)} al día${e.enCurso ? " al ritmo actual" : ""}`,
      apoyo: r >= 1 ? `${soles(vende - be.pisoDia)} por día sobre el piso` : `faltan ${soles(be.pisoDia - vende)} por día`,
      estado: r >= 1 ? "verde" : r >= 0.95 ? "ambar" : "rojo", avance: Math.round(r * 100),
    });
  } else out.push({ clave: "piso", titulo: "Piso diario", valor: "—", meta: "sin datos", apoyo: "Falta un mes cerrado con ventas y fijos", estado: "gris", avance: null });

  // 2) Profit First
  const pf = e.profit;
  if (pf?.apartado && pf.meta !== null && pf.estado) {
    out.push({
      clave: "profit", titulo: `Profit First ${pct(pf.utilidadPct)}`, valor: soles(pf.apartado.neto), meta: `de ${soles(pf.meta)} que toca apartar`,
      apoyo: pf.estado === "cumple" ? "utilidad apartada completa" : `faltan ${soles(pf.falta ?? 0)}`,
      estado: pf.estado === "cumple" ? "verde" : pf.estado === "parcial" ? "ambar" : "rojo",
      avance: pf.meta > 0 ? Math.round(Math.max(0, (pf.apartado.neto / pf.meta) * 100)) : null,
    });
  } else out.push({ clave: "profit", titulo: "Profit First", valor: "—", meta: "sin datos", apoyo: pf?.sinResultadoPorque ?? "Sin Excel del mes", estado: "gris", avance: null });

  // 3) Food cost
  const c = e.regla?.costos;
  if (c) {
    out.push({
      clave: "food", titulo: "Food cost", valor: pct(c.pct), meta: `objetivo ≤ ${Math.round(c.metaPct)}%`,
      apoyo: c.pct <= c.metaPct ? "dentro de su tercio" : `${soles(c.difMeta)} sobre su tercio`,
      estado: c.pct <= c.metaPct ? "verde" : c.pct <= c.metaPct + 3 ? "ambar" : "rojo", avance: c.pct > 0 ? Math.round(Math.min(150, (c.metaPct / c.pct) * 100)) : null,
    });
  } else out.push({ clave: "food", titulo: "Food cost", valor: "—", meta: "sin datos", apoyo: e.regla?.sinResultadoPorque ?? "Sin Excel del mes", estado: "gris", avance: null });

  // 4) Planilla
  const pl = e.regla?.planilla;
  if (pl) {
    out.push({
      clave: "planilla", titulo: "Planilla", valor: pct(pl.pct), meta: `sano ${PLANILLA_SANA_MIN_PCT}–${TOPE_PLANILLA_PCT}% de la venta`,
      apoyo: pl.estado === "alta" ? `${soles(pl.monto - ((e.regla?.ventas ?? 0) * TOPE_PLANILLA_PCT) / 100)} sobre el tope` : pl.estado === "baja" ? "por debajo de lo sano: ¿falta gente?" : "en su rango sano",
      estado: pl.estado === "sana" ? "verde" : pl.estado === "baja" ? "ambar" : pl.pct <= TOPE_PLANILLA_PCT + 5 ? "ambar" : "rojo",
      avance: pl.pct > 0 ? Math.round(Math.min(150, (TOPE_PLANILLA_PCT / pl.pct) * 100)) : null,
    });
  } else out.push({ clave: "planilla", titulo: "Planilla", valor: "—", meta: "sin datos", apoyo: "Sin Excel del mes", estado: "gris", avance: null });

  // 5) Mermas
  const merma = e.motores?.motores.find((m) => m.clave === "eficiencia")?.senales?.find((s) => s.clave === "mermas");
  if (merma && merma.estado !== "gris" && merma.valor !== null && merma.valor !== undefined) {
    out.push({
      clave: "merma", titulo: "Mermas", valor: pct(merma.valor), meta: merma.meta ? `meta ≤ ${pct(merma.meta)} de la venta` : "de la venta",
      apoyo: merma.estado === "verde" ? "bajo control" : "sobre la meta", estado: merma.estado,
      avance: merma.meta ? Math.round(Math.min(150, (merma.meta / Math.max(merma.valor, 0.01)) * 100)) : null,
    });
  } else out.push({ clave: "merma", titulo: "Mermas", valor: "—", meta: "sin datos", apoyo: merma?.detalle ?? "Sin mermas registradas en el período", estado: "gris", avance: null });

  return out;
}

/** El titular: el EBITDA del período con su semáforo. */
export function titularEbitda(f: FilaRegla | null): { texto: string; estado: EstadoMotor; pct: number | null } {
  if (!f?.ebitda || !f.termometro) return { texto: "EBITDA sin datos todavía", estado: "gris", pct: null };
  const e = f.termometro === "eficiente" ? "verde" : f.termometro === "en_camino" ? "ambar" : "rojo";
  return { texto: `EBITDA ${pct(f.ebitda.pct)} · ${ETIQUETA_TERMOMETRO[f.termometro].toLowerCase()}`, estado: e, pct: f.ebitda.pct };
}

const ORDEN_RADAR: ClaveMotor[] = ["ventas", "producto", "fijos", "eficiencia"];

/**
 * Los puntos del radar de los cuatro motores: un eje por motor (arriba, derecha, abajo, izquierda)
 * con su puntaje de 0 a 100 (100 = en su meta). Sin puntaje, el eje queda en 0 y se marca.
 */
export function puntosDelRadar(m: Motores | null): { clave: ClaveMotor; titulo: string; puntaje: number | null; estado: EstadoMotor }[] {
  return ORDEN_RADAR.map((clave) => {
    const x = m?.motores.find((y) => y.clave === clave);
    return { clave, titulo: x?.titulo ?? clave, puntaje: x?.puntaje ?? null, estado: x?.estado ?? "gris" };
  });
}
