/**
 * Presupuesto · MOTOR (puro).
 *
 * Pedido de Jahnn (6-oct-2026, capítulo «El presupuesto»): que la empresa decida ANTES de
 * gastar cómo va a usar su plata, en vez de descubrir al final del mes en qué se fue.
 * Jerarquía: empresa → sede → área → categoría, y cada mes Presupuestado / Real / Variación /
 * % de ejecución.
 *
 * Decisiones de Jahnn:
 *   · Áreas por función, armadas solas con las 25 categorías de la lista única (nadie marca nada).
 *   · Gastos fijos en soles; costos que suben con la venta (variables) como % de la venta.
 *     En un mes cerrado el % se aplica a la venta REAL («ajustado a lo que vendiste»), así un
 *     mes de buenas ventas no pinta de rojo los insumos; en el mes en curso, a la venta esperada.
 *   · Entra toda la plata que sale: la operación y, en bloques aparte, deudas, inversión y
 *     ahorro/socios. Lo que no se decide (préstamos entre sedes, devoluciones, por aclarar) se
 *     muestra pero no se presupuesta.
 */

import { CATEGORIAS_GASTO, tipoDeCategoria } from "./reglas-gasto";

export type Bloque = "operacion" | "deudas" | "inversion" | "ahorro" | "fuera";
export type Modo = "soles" | "pct";
export type Semaforo = "verde" | "ambar" | "rojo" | "sin-plan" | "neutro";

export type Area = { id: string; nombre: string; bloque: Bloque; categorias: string[] };

/** Las áreas por función (orden de la pantalla). */
export const AREAS: Area[] = [
  { id: "produccion", nombre: "Producción", bloque: "operacion", categorias: ["INSUMOS", "PRODUCTOS ATELIER", "PACKAGING", "DELIVERY Y FLETES"] },
  { id: "personal", nombre: "Personal", bloque: "operacion", categorias: ["PLANILLA", "PERSONAL"] },
  { id: "local", nombre: "Local", bloque: "operacion", categorias: ["ALQUILER", "SERVICIOS", "MANTENIMIENTO", "LIMPIEZA", "MENAJE Y UTENSILIOS"] },
  { id: "ventas", nombre: "Ventas", bloque: "operacion", categorias: ["MARKETING"] },
  { id: "administracion", nombre: "Administración", bloque: "operacion", categorias: ["CONTABILIDAD Y ASESORÍAS", "OFICINA Y SISTEMAS", "SS BANCARIOS", "IMPUESTOS", "CAJA CHICA"] },
  { id: "deudas", nombre: "Deudas", bloque: "deudas", categorias: ["PRÉSTAMOS Y TARJETAS"] },
  { id: "inversion", nombre: "Inversión", bloque: "inversion", categorias: ["EQUIPOS", "REMODELACIÓN"] },
  { id: "ahorro", nombre: "Ahorro y socios", bloque: "ahorro", categorias: ["AHORRO", "UTILIDADES A SOCIOS"] },
  // No se presupuesta: no es una decisión de gasto (o nadie sabe qué fue). Se muestra para cuadrar.
  { id: "fuera", nombre: "No se presupuesta", bloque: "fuera", categorias: ["PRÉSTAMOS ENTRE SEDES", "DEVOLUCIONES", "POR ACLARAR"] },
];

export const NOMBRE_BLOQUE: Record<Bloque, string> = {
  operacion: "Operación", deudas: "Deudas", inversion: "Inversión", ahorro: "Ahorro y socios", fuera: "No se presupuesta",
};

/** Categorías que se pueden presupuestar (todas menos el área «fuera»). */
export const CATEGORIAS_PRESUPUESTABLES = AREAS.filter((a) => a.bloque !== "fuera").flatMap((a) => a.categorias);

const AREA_DE = new Map(AREAS.flatMap((a) => a.categorias.map((c) => [c, a] as const)));
/** El área de una categoría; las que no están en la lista caen en «No se presupuesta». */
export const areaDe = (categoria: string): Area => AREA_DE.get(categoria) ?? AREAS[AREAS.length - 1];

/** Fijos en soles; los que suben con la venta (tipo Variable de la lista única), en %. */
export const modoPorDefecto = (categoria: string): Modo => (tipoDeCategoria(categoria) === "Variable" ? "pct" : "soles");

export const descripcionDe = (categoria: string) => CATEGORIAS_GASTO.find((c) => c.nombre === categoria)?.descripcion ?? "";

export type Linea = {
  categoria: string; modo: Modo; valor: number;
  /** La parte de esta categoría que maneja el administrador de la sede (su tope en Control de Caja). */
  topeCaja?: number | null;
};

/** Margen de tolerancia en un mes cerrado: hasta 10% por encima es precaución, más es rojo. */
export const TOLERANCIA_PCT = 10;
/** Mes en curso: un costo variable va «adelantado» si su ejecución pasa el avance del mes por más de esto. */
export const ADELANTO_PUNTOS = 15;

const r2 = (n: number) => Math.round(n * 100) / 100;

export type FilaPresupuesto = {
  presupuestado: number | null;
  real: number;
  /** real − presupuestado: positivo = se gastó de más. */
  variacion: number | null;
  /** real ÷ presupuestado × 100. */
  ejecucion: number | null;
  semaforo: Semaforo;
};

export type FilaCategoria = FilaPresupuesto & { categoria: string; modo: Modo | null; valor: number | null };
export type FilaArea = FilaPresupuesto & { area: Area; categorias: FilaCategoria[] };
export type FilaSede = FilaPresupuesto & {
  businessId: number; sede: string;
  /** La venta sobre la que se calculan los %: real (mes cerrado) o esperada (mes en curso). */
  ventaBase: number | null; ventaBaseEs: "real" | "esperada" | null;
  areas: FilaArea[];
  bloques: Record<Bloque, FilaPresupuesto>;
};

export type EntradaSede = {
  businessId: number; sede: string;
  lineas: Linea[];
  ventaEsperada: number | null;
  ventaReal: number | null;
  /** Lo que salió en el mes por categoría (parte propia de los compartidos). */
  real: Record<string, number>;
};

export type Contexto = { enCurso: boolean; /** % del mes transcurrido (0–100). */ avanceMes: number };

/** El monto en soles de una línea, con la venta que corresponda. */
export function montoDe(l: Linea, ventaBase: number | null): number | null {
  if (l.modo === "soles") return r2(l.valor);
  return ventaBase !== null && ventaBase > 0 ? r2((l.valor / 100) * ventaBase) : null;
}

function fila(presupuestado: number | null, real: number, ctx: Contexto, variable = false): FilaPresupuesto {
  real = r2(real);
  if (presupuestado === null || presupuestado <= 0) {
    return { presupuestado, real, variacion: null, ejecucion: null, semaforo: real > 0.5 ? "sin-plan" : "neutro" };
  }
  const ejecucion = Math.round((real / presupuestado) * 1000) / 10;
  let semaforo: Semaforo;
  if (ejecucion > 100 + TOLERANCIA_PCT) semaforo = "rojo";
  else if (ejecucion > 100) semaforo = ctx.enCurso ? "rojo" : "ambar";
  else if (ctx.enCurso && variable && ejecucion > ctx.avanceMes + ADELANTO_PUNTOS) semaforo = "ambar";
  else semaforo = "verde";
  return { presupuestado: r2(presupuestado), real, variacion: r2(real - presupuestado), ejecucion, semaforo };
}

function sumar(filas: FilaPresupuesto[], ctx: Contexto): FilaPresupuesto {
  const conPlan = filas.filter((f) => f.presupuestado !== null && f.presupuestado > 0);
  const p = conPlan.length ? conPlan.reduce((t, f) => t + (f.presupuestado ?? 0), 0) : null;
  const total = fila(p, filas.reduce((t, f) => t + f.real, 0), ctx);
  // Un total puede estar en verde con una categoría que se pasó: hereda lo peor de sus partes.
  const peor = (["rojo", "sin-plan", "ambar"] as Semaforo[]).find((s) => filas.some((f) => f.semaforo === s));
  if (total.semaforo === "verde" && peor) total.semaforo = "ambar";
  return total;
}

/** Presupuesto contra real de una sede, por área y categoría. */
export function armarSede(e: EntradaSede, ctx: Contexto): FilaSede {
  const ventaBaseEs = ctx.enCurso ? (e.ventaEsperada ? "esperada" : null) : (e.ventaReal ? "real" : e.ventaEsperada ? "esperada" : null);
  const ventaBase = ventaBaseEs === "real" ? e.ventaReal : ventaBaseEs === "esperada" ? e.ventaEsperada : null;
  const lineaDe = new Map(e.lineas.map((l) => [l.categoria, l]));
  const otras = Object.keys(e.real).filter((c) => !AREA_DE.has(c));

  const areas: FilaArea[] = AREAS.map((area) => {
    const cats = area.bloque === "fuera" ? [...area.categorias, ...otras] : area.categorias;
    const categorias: FilaCategoria[] = cats
      .map((categoria) => {
        const l = area.bloque === "fuera" ? undefined : lineaDe.get(categoria);
        const p = l ? montoDe(l, ventaBase) : null;
        const f = area.bloque === "fuera"
          ? { presupuestado: null, real: r2(e.real[categoria] ?? 0), variacion: null, ejecucion: null, semaforo: "neutro" as Semaforo }
          : fila(p, e.real[categoria] ?? 0, ctx, l?.modo === "pct");
        return { ...f, categoria, modo: l?.modo ?? null, valor: l?.valor ?? null };
      })
      // Se muestran las que tienen plan o tuvieron gasto.
      .filter((c) => (c.presupuestado ?? 0) > 0 || Math.abs(c.real) > 0.005);
    const total = area.bloque === "fuera"
      ? { presupuestado: null, real: r2(categorias.reduce((t, c) => t + c.real, 0)), variacion: null, ejecucion: null, semaforo: "neutro" as Semaforo }
      : sumar(categorias, ctx);
    return { ...total, area, categorias };
  });

  const bloques = Object.fromEntries((Object.keys(NOMBRE_BLOQUE) as Bloque[]).map((b) => {
    const as = areas.filter((a) => a.area.bloque === b);
    return [b, b === "fuera"
      ? { presupuestado: null, real: r2(as.reduce((t, a) => t + a.real, 0)), variacion: null, ejecucion: null, semaforo: "neutro" as Semaforo }
      : sumar(as, ctx)];
  })) as Record<Bloque, FilaPresupuesto>;

  // El total de la sede: todo lo presupuestable (sin «No se presupuesta»).
  const total = sumar(areas.filter((a) => a.area.bloque !== "fuera"), ctx);
  return { ...total, businessId: e.businessId, sede: e.sede, ventaBase, ventaBaseEs, areas, bloques };
}

/** La empresa: la suma de las sedes, con las mismas áreas y categorías. */
export function armarEmpresa(sedes: FilaSede[], ctx: Contexto): FilaPresupuesto & { areas: FilaArea[]; bloques: Record<Bloque, FilaPresupuesto> } {
  const areas: FilaArea[] = AREAS.map((area) => {
    const deSedes = sedes.map((s) => s.areas.find((a) => a.area.id === area.id)!).filter(Boolean);
    const nombres = [...new Set(deSedes.flatMap((a) => a.categorias.map((c) => c.categoria)))];
    const categorias: FilaCategoria[] = nombres.map((categoria) => {
      const partes = deSedes.map((a) => a.categorias.find((c) => c.categoria === categoria)).filter((c): c is FilaCategoria => !!c);
      const f = area.bloque === "fuera"
        ? { presupuestado: null, real: r2(partes.reduce((t, c) => t + c.real, 0)), variacion: null, ejecucion: null, semaforo: "neutro" as Semaforo }
        : sumar(partes, ctx);
      return { ...f, categoria, modo: null, valor: null };
    });
    const total = area.bloque === "fuera"
      ? { presupuestado: null, real: r2(deSedes.reduce((t, a) => t + a.real, 0)), variacion: null, ejecucion: null, semaforo: "neutro" as Semaforo }
      : sumar(deSedes, ctx);
    return { ...total, area, categorias };
  });
  const bloques = Object.fromEntries((Object.keys(NOMBRE_BLOQUE) as Bloque[]).map((b) => {
    const partes = sedes.map((s) => s.bloques[b]);
    return [b, b === "fuera"
      ? { presupuestado: null, real: r2(partes.reduce((t, f) => t + f.real, 0)), variacion: null, ejecucion: null, semaforo: "neutro" as Semaforo }
      : sumar(partes, ctx)];
  })) as Record<Bloque, FilaPresupuesto>;
  return { ...sumar(sedes, ctx), areas, bloques };
}

// ─── Sugerencia: lo que se gastó en promedio los últimos meses cerrados ────

export type MesHistorial = { mes: string; ventas: number | null; real: Record<string, number> };

/**
 * Propuesta para armar el presupuesto: fijos = promedio en soles de los meses dados
 * (redondeado a S/10); variables = lo gastado ÷ lo vendido en esos meses (en %, 1 decimal).
 * Venta esperada = el promedio de lo vendido.
 */
export function sugerir(historial: MesHistorial[]): { ventaEsperada: number | null; lineas: Linea[] } {
  const meses = historial.filter((h) => Object.keys(h.real).length > 0);
  if (!meses.length) return { ventaEsperada: null, lineas: [] };
  const conVenta = meses.filter((h) => (h.ventas ?? 0) > 0);
  const ventaEsperada = conVenta.length ? Math.round(conVenta.reduce((t, h) => t + h.ventas!, 0) / conVenta.length / 10) * 10 : null;
  const lineas: Linea[] = [];
  for (const categoria of CATEGORIAS_PRESUPUESTABLES) {
    const modo = modoPorDefecto(categoria);
    if (modo === "pct" && conVenta.length) {
      const gasto = conVenta.reduce((t, h) => t + (h.real[categoria] ?? 0), 0);
      const venta = conVenta.reduce((t, h) => t + h.ventas!, 0);
      const pct = Math.round((gasto / venta) * 1000) / 10;
      if (pct > 0) lineas.push({ categoria, modo, valor: pct });
    } else {
      const prom = meses.reduce((t, h) => t + (h.real[categoria] ?? 0), 0) / meses.length;
      const valor = Math.round(prom / 10) * 10;
      if (valor > 0) lineas.push({ categoria, modo: "soles", valor });
    }
  }
  return { ventaEsperada, lineas };
}

// ─── Lo que más se desvía (para decidir) ───────────────────────────────

export type Desvio = { businessId: number; sede: string; categoria: string; area: string; variacion: number; ejecucion: number | null; sinPlan: boolean };

/** Las categorías que más se pasaron (o que gastaron sin estar en el plan), de mayor a menor. */
export function mayoresDesvios(sedes: FilaSede[], max = 5): Desvio[] {
  const out: Desvio[] = [];
  for (const s of sedes) for (const a of s.areas) {
    if (a.area.bloque === "fuera") continue;
    for (const c of a.categorias) {
      if (c.semaforo === "rojo" || c.semaforo === "ambar") {
        out.push({ businessId: s.businessId, sede: s.sede, categoria: c.categoria, area: a.area.nombre, variacion: Math.max(0, c.variacion ?? 0), ejecucion: c.ejecucion, sinPlan: false });
      } else if (c.semaforo === "sin-plan") {
        out.push({ businessId: s.businessId, sede: s.sede, categoria: c.categoria, area: a.area.nombre, variacion: c.real, ejecucion: null, sinPlan: true });
      }
    }
  }
  return out.filter((d) => d.variacion >= 1).sort((x, y) => y.variacion - x.variacion).slice(0, max);
}
