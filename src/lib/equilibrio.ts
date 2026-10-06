/**
 * Punto de equilibrio como lo enseña el libro · MOTOR (puro).
 *
 * Pedido de Jahnn (5-oct-2026, capítulo «El punto de equilibrio»): «conocer tu punto de
 * equilibrio te da un objetivo mínimo de ventas que necesitas alcanzar cada mes antes de
 * empezar a generar beneficio». Usa los mismos dos datos del libro:
 *
 *   margen de contribución = lo que queda de cada venta después de sus costos variables
 *   punto de equilibrio    = costos fijos ÷ margen de contribución
 *
 * En soles (costos fijos ÷ margen %) y en número de ventas (costos fijos ÷ margen por venta):
 * es la tabla de la Cafetería «El Grano» con los números de cada sede. La «venta» es un ticket
 * de Byte (en Atelier, un pedido) y su precio promedio es el ticket promedio.
 *
 * Además: el margen de seguridad (cuánto pueden bajar las ventas antes de perder), la curva
 * de ingresos y costos para la gráfica, y un simulador para los cuatro usos del libro: fijar
 * metas, evaluar un gasto nuevo, entender un mes difícil y ajustar precios.
 */

export type BaseEquilibrio = {
  /** Costos fijos del mes (en el mes en curso, el promedio de los meses cerrados). */
  fijos: number;
  /** Costos variables como fracción de las ventas (0–1). */
  varRatio: number;
  /** Ventas del mes (cerrado) o proyectadas al cierre con el ritmo actual (en curso). */
  ventas: number;
  /** Precio promedio por venta (ticket promedio). null = no se sabe cuántas ventas hubo. */
  ticket: number | null;
  diasDelMes: number;
  /** Cuotas de préstamos y tarjetas del mes (no son costo, pero hay que pagarlas). */
  financiamiento: number;
};

export type EstadoEquilibrio = "sobre" | "debajo" | "sin-margen" | "sin-datos";

export type AnalisisEquilibrio = {
  /** Margen de contribución como fracción (0–1). */
  mc: number | null;
  /** Punto de equilibrio del mes en soles, y por día. */
  pe: number | null;
  peDia: number | null;
  /** Lo que hay que vender para pagar también las cuotas de deuda. */
  peConDeudas: number | null;
  /** Ventas − punto de equilibrio: cuánto pueden bajar las ventas antes de perder. */
  margenSeguridad: number | null;
  margenSeguridadPct: number | null;
  /** Ventas × margen − fijos: lo que queda (o falta) en el mes. */
  utilidad: number | null;
  /** En número de ventas (tickets/pedidos). */
  ventas: number | null;
  costoVariableVenta: number | null;
  mcVenta: number | null;
  peVentas: number | null;
  peVentasDia: number | null;
  ventasDia: number | null;
  estado: EstadoEquilibrio;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function analizarEquilibrio(b: BaseEquilibrio): AnalisisEquilibrio {
  const vacio: AnalisisEquilibrio = {
    mc: null, pe: null, peDia: null, peConDeudas: null, margenSeguridad: null, margenSeguridadPct: null, utilidad: null,
    ventas: null, costoVariableVenta: null, mcVenta: null, peVentas: null, peVentasDia: null, ventasDia: null, estado: "sin-datos",
  };
  if (!(b.fijos > 0) || !(b.ventas > 0) || !Number.isFinite(b.varRatio)) return vacio;
  const mc = 1 - b.varRatio;
  const utilidad = r2(b.ventas * mc - b.fijos);
  if (mc <= 0) return { ...vacio, mc: Math.round(mc * 10000) / 10000, utilidad, estado: "sin-margen" };

  const pe = b.fijos / mc;
  const ticket = b.ticket && b.ticket > 0 ? b.ticket : null;
  const nVentas = ticket ? b.ventas / ticket : null;
  const mcVenta = ticket ? ticket * mc : null;
  const peVentas = mcVenta ? b.fijos / mcVenta : null;
  return {
    mc: Math.round(mc * 10000) / 10000,
    pe: r2(pe),
    peDia: r2(pe / b.diasDelMes),
    peConDeudas: r2((b.fijos + Math.max(0, b.financiamiento)) / mc),
    margenSeguridad: r2(b.ventas - pe),
    margenSeguridadPct: Math.round(((b.ventas - pe) / b.ventas) * 1000) / 10,
    utilidad,
    ventas: nVentas !== null ? Math.round(nVentas) : null,
    costoVariableVenta: ticket ? r2(ticket * b.varRatio) : null,
    mcVenta: mcVenta !== null ? r2(mcVenta) : null,
    peVentas: peVentas !== null ? Math.ceil(peVentas) : null,
    peVentasDia: peVentas !== null ? Math.round((peVentas / b.diasDelMes) * 10) / 10 : null,
    ventasDia: nVentas !== null ? Math.round((nVentas / b.diasDelMes) * 10) / 10 : null,
    estado: b.ventas >= pe ? "sobre" : "debajo",
  };
}

// ─── La gráfica: ingresos, costos totales y costos fijos ─────────────────────

export type PuntoCurva = { x: number; ingresos: number; costos: number; fijos: number };

export type CurvaEquilibrio = {
  /** Eje horizontal: número de ventas (si hay ticket) o soles vendidos. */
  eje: "ventas" | "soles";
  xMax: number;
  puntos: PuntoCurva[];
  /** Donde se cruzan ingresos y costos totales. */
  equilibrio: { x: number; y: number } | null;
  /** Lo vendido en el mes («estás aquí»). */
  actual: { x: number; y: number } | null;
};

/** Las tres rectas de la gráfica, de 0 a un poco más allá del mayor entre lo vendido y el equilibrio. */
export function curvaEquilibrio(b: BaseEquilibrio, a: AnalisisEquilibrio, tramos = 20): CurvaEquilibrio | null {
  if (a.pe === null || a.mc === null) return null;
  const ticket = b.ticket && b.ticket > 0 ? b.ticket : null;
  const eje: CurvaEquilibrio["eje"] = ticket ? "ventas" : "soles";
  // En soles: x = soles vendidos. En ventas: x = número de ventas, cada una a precio `ticket`.
  const precio = ticket ?? 1;
  const xPe = a.pe / precio;
  const xActual = b.ventas / precio;
  const bruto = Math.max(xPe, xActual) * 1.35;
  const paso = Math.pow(10, Math.floor(Math.log10(bruto)));
  const xMax = Math.ceil(bruto / (paso / 2)) * (paso / 2);
  const puntos: PuntoCurva[] = Array.from({ length: tramos + 1 }, (_, i) => {
    const x = (xMax * i) / tramos;
    const ingresos = x * precio;
    return { x: r2(x), ingresos: r2(ingresos), costos: r2(b.fijos + ingresos * b.varRatio), fijos: r2(b.fijos) };
  });
  return {
    eje, xMax, puntos,
    equilibrio: { x: r2(xPe), y: r2(a.pe) },
    actual: { x: r2(xActual), y: r2(b.ventas) },
  };
}

// ─── Simulador: «¿y si…?» ───────────────────────────────────────────────────

export type Escenario = {
  /** Gasto fijo nuevo al mes (S/): contratar a alguien, un alquiler, una cuota. */
  gastoNuevo: number;
  /** Cambio de precios, en % (10 = subir 10%). Se supone que la cantidad de ventas no cambia. */
  precioPct: number;
  /** Cambio de los costos variables (insumos), en %. */
  costoVariablePct: number;
  /** Cambio en la cantidad de ventas (clientes), en % (−20 = un mes difícil). */
  cantidadPct: number;
};

export const ESCENARIO_BASE: Escenario = { gastoNuevo: 0, precioPct: 0, costoVariablePct: 0, cantidadPct: 0 };

export type Simulacion = {
  base: BaseEquilibrio;
  nuevo: BaseEquilibrio;
  antes: AnalisisEquilibrio;
  despues: AnalisisEquilibrio;
  /** Para pagar el gasto nuevo: cuánto más hay que vender al mes, y cuántas ventas más por día. */
  ventasExtraMes: number | null;
  ventasExtraDia: number | null;
  frases: string[];
};

const soles = (n: number) => `S/${Math.round(Math.abs(n)).toLocaleString("en-US")}`;

export function simular(b: BaseEquilibrio, e: Escenario): Simulacion {
  const p = 1 + (e.precioPct || 0) / 100;
  const c = 1 + (e.costoVariablePct || 0) / 100;
  const q = 1 + (e.cantidadPct || 0) / 100;
  // Subir precios no sube el costo de cada venta: en soles el costo variable se queda, en % baja.
  const nuevo: BaseEquilibrio = {
    ...b,
    fijos: b.fijos + Math.max(0, e.gastoNuevo || 0),
    varRatio: (b.varRatio * c) / p,
    ventas: b.ventas * p * q,
    ticket: b.ticket ? b.ticket * p : null,
  };
  const antes = analizarEquilibrio(b);
  const despues = analizarEquilibrio(nuevo);

  const frases: string[] = [];
  let ventasExtraMes: number | null = null, ventasExtraDia: number | null = null;
  if ((e.gastoNuevo || 0) > 0 && despues.mc !== null && despues.mc > 0) {
    ventasExtraMes = r2(e.gastoNuevo / despues.mc);
    ventasExtraDia = despues.mcVenta ? Math.round((e.gastoNuevo / despues.mcVenta / b.diasDelMes) * 10) / 10 : null;
    frases.push(`Para pagar ${soles(e.gastoNuevo)} más al mes hay que vender ${soles(ventasExtraMes)} más${ventasExtraDia !== null ? ` (unas ${ventasExtraDia.toLocaleString("es-PE")} ventas más por día)` : ""}.`);
  }
  if (antes.pe !== null && despues.pe !== null && Math.abs(despues.pe - antes.pe) >= 1) {
    frases.push(`El piso del mes pasa de ${soles(antes.pe)} a ${soles(despues.pe)} (${despues.pe > antes.pe ? "+" : "−"}${soles(despues.pe - antes.pe)}).`);
  }
  if (despues.estado === "sin-margen") frases.push("Con estos números cada venta pierde plata: no hay volumen que alcance, el problema es de precio o de costo.");
  if (antes.utilidad !== null && despues.utilidad !== null && Math.abs(despues.utilidad - antes.utilidad) >= 1) {
    const signo = (n: number) => (n < 0 ? "una pérdida de " : "");
    frases.push(`El resultado del mes pasa de ${signo(antes.utilidad)}${soles(antes.utilidad)} a ${signo(despues.utilidad)}${soles(despues.utilidad)}.`);
  }
  if (antes.estado === "sobre" && despues.estado === "debajo") frases.push("Con este escenario la sede quedaría debajo de su punto de equilibrio: perdería plata.");
  if (antes.estado === "debajo" && despues.estado === "sobre") frases.push("Con este escenario la sede pasaría a estar sobre su punto de equilibrio.");
  if ((e.precioPct || 0) !== 0) frases.push("Ojo: supone que los clientes no bajan al cambiar el precio; si bajan, ajústalo en «Cantidad de ventas».");
  return { base: b, nuevo, antes, despues, ventasExtraMes, ventasExtraDia, frases };
}
