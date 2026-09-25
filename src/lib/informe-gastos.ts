/**
 * "¿A dónde se va la plata?" — el informe de gastos por sede · MOTOR (puro).
 *
 * Pedido de Jahnn (25-sep-2026): "saber de manera concreta a dónde se está
 * yendo el dinero, qué gastos son los más fuertes por sede, en qué categoría
 * están, cuál es su recurrencia". Va en Grupo → Gastos y en 3 láminas del
 * deck de la reunión. Se apoya en el clasificador experto (la categoría de
 * cada egreso, lib/clasificador-gasto.ts): el informe vale lo que vale la
 * clasificación.
 *
 * Decisiones de Jahnn (25-sep-2026):
 *   · Mes: el último CERRADO, comparado con el promedio de los 3 anteriores
 *     (el mes en curso está a medias y las facturas de Atelier pagadas con
 *     retraso lo distorsionan).
 *   · Metas del semáforo: referencias del rubro para cafeterías — costo de lo
 *     vendido ≤ 35% de la venta, planilla ≤ 30%, costo primo ≤ 65%.
 *
 * Las filas son las mismas que la cifra "salió" (igual al Excel,
 * lib/totales-mes-sede.ts): los bolsillos suman exactamente eso. De un gasto
 * compartido, la parte de otra sede va a su propio bolsillo.
 */

import { tipoDeCategoria, type TipoCategoria } from "./reglas-gasto";
import { textoDeRegla, textoSugeridoParaRegla } from "./texto-regla";

export type GastoInforme = {
  /** YYYY-MM */
  mes: string;
  fecha: string;
  categoria: string;
  concepto: string | null;
  /** Lo que salió (igual al Excel). */
  monto: number;
  /** La parte de la sede (en un gasto compartido, sin la parte de las otras). */
  propio: number;
  /** ¿Vino del Excel? Los meses registrados a mano escriben los conceptos distinto. */
  deExcel: boolean;
};

export type Bolsillos = {
  /** Operación = fijo + variable + desconocido: lo que cuesta abrir la tienda. */
  operacion: number;
  fijo: number;
  variable: number;
  desconocido: number;
  /** Cuotas de préstamos y tarjetas. */
  deudas: number;
  /** Equipos y remodelación: duran años. */
  inversion: number;
  /** Ahorro, préstamos entre sedes, utilidades, devoluciones. */
  noEsGasto: number;
  /** Parte de gastos compartidos que pagó esta sede y le corresponde a otra. */
  otrasSedes: number;
  /** = la cifra "salió" del Excel. */
  total: number;
};

export type ClaveIndicador = "costoVendido" | "planilla" | "costoPrimo";

export type Indicador = {
  clave: ClaveIndicador;
  nombre: string;
  monto: number;
  /** % de la venta del mes; null sin venta. */
  pct: number | null;
  /** % de la venta en los 3 meses anteriores (suma/suma). */
  pctProm3: number | null;
  meta: number;
  estado: "ok" | "alerta" | "sin-venta";
};

export type FilaCategoria = {
  categoria: string;
  tipo: TipoCategoria | null;
  monto: number;
  pctVenta: number | null;
  /** Promedio mensual de los meses anteriores con datos. */
  prom3: number;
  /** % de cambio vs. ese promedio; null si antes no había. */
  variacionPct: number | null;
};

export type PagoGrande = {
  fecha: string;
  concepto: string | null;
  categoria: string;
  tipo: TipoCategoria | null;
  monto: number;
  /** ¿El mismo proveedor/concepto apareció en 2 o más de los meses anteriores? null = sin meses comparables. */
  recurrente: boolean | null;
};

export type ProveedorMes = {
  nombre: string;
  monto: number;
  /** En cuántos de los meses comparados aparece (este incluido)… */
  meses: number;
  /** …de cuántos. */
  de: number;
};

export type Recurrencia = {
  /** Lo que sale todos los meses sí o sí (fijos + cuotas), promedio de 4 meses. */
  pisoMensual: { total: number; detalle: { categoria: string; promedio: number }[] };
  proveedores: ProveedorMes[];
  /** % del gasto de operación del mes que viene de proveedores/conceptos que se repiten. */
  pctRecurrente: number | null;
  /** Pagos de operación de menos de S/50: pocos soles cada uno, pero muchos. */
  hormiga: { pagos: number; total: number; pctOperacion: number | null };
};

export type AlertaGasto = { titulo: string; detalle: string };

export type InformeGastosSede = {
  businessId: number;
  sede: string;
  mes: string;
  mesesPrevios: string[];
  ventas: number | null;
  bolsillos: Bolsillos;
  /** Promedio mensual de los meses anteriores con datos. */
  bolsillosProm3: Bolsillos;
  indicadores: Indicador[];
  categorias: FilaCategoria[];
  pagos: PagoGrande[];
  recurrencia: Recurrencia;
  alertas: AlertaGasto[];
};

/** Metas del semáforo (referencias del rubro, decisión de Jahnn 25-sep-2026). */
export const METAS: Record<ClaveIndicador, number> = { costoVendido: 35, planilla: 30, costoPrimo: 65 };

/** Lo que se compra para vender: en las cafeterías, lo de Atelier + insumos + empaques. */
export const CATEGORIAS_COSTO_VENDIDO = ["PRODUCTOS ATELIER", "INSUMOS", "PACKAGING"];
export const HORMIGA_HASTA = 50;
/** Una categoría "se disparó" si sube 20% o más y al menos S/300 frente a su promedio. */
const ALERTA_SUBE_PCT = 20;
const ALERTA_SUBE_SOLES = 300;
/** Un proveedor nuevo se avisa desde S/500 en el mes. */
const ALERTA_NUEVO_DESDE = 500;
/** Más avisos que esto dejan de leerse. */
const MAX_ALERTAS = 5;

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;
const pctDe = (monto: number, base: number | null) => (base && base > 0 ? r1((monto / base) * 100) : null);
const esOperacion = (t: TipoCategoria | null) => t === "Fijo" || t === "Variable" || t === "Desconocido";

/**
 * A quién se le pagó, para medir recurrencia: el proveedor que el sistema
 * guarda entre paréntesis ("VARIOS (METRO)" → METRO) o, si no hay, las
 * primeras palabras del concepto sin números ("Pago Sra Elena" → PAGO SRA ELENA).
 */
export function claveProveedor(concepto: string | null): string {
  const sinCorchetes = String(concepto ?? "").replace(/\[[^\]]*\]/g, "");
  const parentesis = [...sinCorchetes.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]);
  const prov = parentesis.at(-1);
  if (prov && textoDeRegla(prov).length >= 3) return textoDeRegla(prov);
  const palabras = textoSugeridoParaRegla(concepto).split(" ").filter((w) => w.length > 1 && !/\d/.test(w));
  return palabras.slice(0, 3).join(" ") || "SIN CONCEPTO";
}

/**
 * El proveedor con sus dos primeras palabras, para que "PRODUCTOS SALUDABLES
 * YAYI", "…YAYIS" y "…YAYI´S SRL" sean el mismo.
 */
function claveCorta(concepto: string | null): string {
  return claveProveedor(concepto).split(" ").slice(0, 2).join(" ");
}

function bolsillosDe(gastos: GastoInforme[]): Bolsillos {
  const b: Bolsillos = { operacion: 0, fijo: 0, variable: 0, desconocido: 0, deudas: 0, inversion: 0, noEsGasto: 0, otrasSedes: 0, total: 0 };
  for (const g of gastos) {
    const t = tipoDeCategoria(g.categoria);
    b.otrasSedes += g.monto - g.propio;
    b.total += g.monto;
    if (t === "Fijo") b.fijo += g.propio;
    else if (t === "Variable") b.variable += g.propio;
    else if (t === "Financiamiento") b.deudas += g.propio;
    else if (t === "Inversión") b.inversion += g.propio;
    else if (t === "No es gasto") b.noEsGasto += g.propio;
    // Una categoría fuera de la lista única se trata como desconocida: es
    // plata que salió y nadie clasificó (el clasificador la manda a revisar).
    else b.desconocido += g.propio;
  }
  b.operacion = b.fijo + b.variable + b.desconocido;
  return Object.fromEntries(Object.entries(b).map(([k, v]) => [k, r2(v)])) as Bolsillos;
}

function promedioBolsillos(lista: Bolsillos[]): Bolsillos {
  const n = lista.length || 1;
  const keys = ["operacion", "fijo", "variable", "desconocido", "deudas", "inversion", "noEsGasto", "otrasSedes", "total"] as const;
  return Object.fromEntries(keys.map((k) => [k, r2(lista.reduce((t, b) => t + b[k], 0) / n)])) as Bolsillos;
}

export function construirInformeSede(input: {
  businessId: number;
  sede: string;
  mes: string;
  /** Los 3 meses anteriores, del más reciente al más antiguo. */
  mesesPrevios: string[];
  gastos: GastoInforme[];
  ventasPorMes: Record<string, number | null>;
}): InformeGastosSede {
  const { mes, mesesPrevios } = input;
  const delMes = input.gastos.filter((g) => g.mes === mes);
  // Solo cuentan los meses anteriores que tienen gastos cargados.
  const previosConDatos = mesesPrevios.filter((m) => input.gastos.some((g) => g.mes === m));
  const dePrevios = input.gastos.filter((g) => previosConDatos.includes(g.mes));
  const ventas = input.ventasPorMes[mes] ?? null;
  const conVentaPrev = previosConDatos.filter((m) => (input.ventasPorMes[m] ?? 0) > 0);

  const bolsillos = bolsillosDe(delMes);
  const bolsillosProm3 = promedioBolsillos(previosConDatos.map((m) => bolsillosDe(input.gastos.filter((g) => g.mes === m))));

  // ── Indicadores del negocio de comida ──
  const sumaCats = (gs: GastoInforme[], cats: string[]) => gs.filter((g) => cats.includes(g.categoria)).reduce((t, g) => t + g.propio, 0);
  const gastosConVentaPrev = dePrevios.filter((g) => conVentaPrev.includes(g.mes));
  const ventasConVentaPrev = conVentaPrev.reduce((t, m) => t + (input.ventasPorMes[m] ?? 0), 0);
  const indicador = (clave: ClaveIndicador, nombre: string, cats: string[]): Indicador => {
    const monto = r2(sumaCats(delMes, cats));
    const pct = pctDe(monto, ventas);
    return {
      clave, nombre, monto, pct,
      pctProm3: pctDe(sumaCats(gastosConVentaPrev, cats), ventasConVentaPrev),
      meta: METAS[clave],
      estado: pct === null ? "sin-venta" : pct <= METAS[clave] ? "ok" : "alerta",
    };
  };
  const indicadores = [
    indicador("costoVendido", "Costo de lo vendido", CATEGORIAS_COSTO_VENDIDO),
    indicador("planilla", "Planilla", ["PLANILLA"]),
    indicador("costoPrimo", "Costo primo", [...CATEGORIAS_COSTO_VENDIDO, "PLANILLA"]),
  ];

  // ── Ranking de categorías de la operación ──
  const porCat = (gs: GastoInforme[]) => {
    const m = new Map<string, number>();
    for (const g of gs) if (esOperacion(tipoDeCategoria(g.categoria)) || tipoDeCategoria(g.categoria) === null) m.set(g.categoria, (m.get(g.categoria) ?? 0) + g.propio);
    return m;
  };
  const catMes = porCat(delMes);
  const catPrev = porCat(dePrevios);
  const nPrev = previosConDatos.length;
  const categorias: FilaCategoria[] = [...new Set([...catMes.keys(), ...catPrev.keys()])]
    .map((categoria) => {
      const monto = r2(catMes.get(categoria) ?? 0);
      const prom3 = nPrev > 0 ? r2((catPrev.get(categoria) ?? 0) / nPrev) : 0;
      return {
        categoria, tipo: tipoDeCategoria(categoria), monto, pctVenta: pctDe(monto, ventas), prom3,
        variacionPct: prom3 > 0 ? r1(((monto - prom3) / prom3) * 100) : null,
      };
    })
    .filter((c) => c.monto > 0)
    .sort((a, b) => b.monto - a.monto);

  // ── Recurrencia ──
  // Solo se comparan meses de la misma fuente: Atelier se registró a mano
  // hasta julio de 2026 ("Pago Sra Elena") y desde agosto viene del Excel
  // ("… (ELENA CUEVA)"); mezclarlos haría ver todo como "nuevo".
  const fuente = (m: string) => {
    const gs = input.gastos.filter((g) => g.mes === m);
    return gs.filter((g) => g.deExcel).length * 2 >= gs.length;
  };
  const comparables = previosConDatos.filter((m) => fuente(m) === fuente(mes));
  const mesesDe = new Map<string, Set<string>>();
  for (const g of input.gastos) {
    const k = claveCorta(g.concepto);
    if (!mesesDe.has(k)) mesesDe.set(k, new Set());
    mesesDe.get(k)!.add(g.mes);
  }
  const vecesAntes = (k: string) => comparables.filter((m) => mesesDe.get(k)?.has(m)).length;
  const esRecurrente = (concepto: string | null) => vecesAntes(claveCorta(concepto)) >= Math.min(2, comparables.length);

  const pagos: PagoGrande[] = [...delMes]
    .sort((a, b) => b.propio - a.propio)
    .slice(0, 10)
    .map((g) => ({
      fecha: g.fecha, concepto: g.concepto, categoria: g.categoria, tipo: tipoDeCategoria(g.categoria), monto: r2(g.propio),
      recurrente: comparables.length > 0 ? esRecurrente(g.concepto) : null,
    }));

  const operacionMes = delMes.filter((g) => esOperacion(tipoDeCategoria(g.categoria)));
  const totalOperacion = operacionMes.reduce((t, g) => t + g.propio, 0);
  const provMes = new Map<string, number>();
  // Se muestra el nombre más largo con que aparece (el más completo).
  const nombreDe = new Map<string, string>();
  for (const g of operacionMes) {
    const k = claveCorta(g.concepto);
    provMes.set(k, (provMes.get(k) ?? 0) + g.propio);
    const largo = claveProveedor(g.concepto);
    if ((nombreDe.get(k) ?? "").length < largo.length) nombreDe.set(k, largo);
  }
  const proveedores: ProveedorMes[] = [...provMes.entries()]
    .map(([k, monto]) => ({ nombre: nombreDe.get(k) ?? k, monto: r2(monto), meses: [mes, ...comparables].filter((m) => mesesDe.get(k)?.has(m)).length, de: comparables.length + 1 }))
    .sort((a, b) => b.monto - a.monto)
    .slice(0, 8);
  const recurrenteOp = comparables.length > 0 ? operacionMes.filter((g) => esRecurrente(g.concepto)).reduce((t, g) => t + g.propio, 0) : 0;

  const fijosYCuotas = (gs: GastoInforme[]) => gs.filter((g) => ["Fijo", "Financiamiento"].includes(tipoDeCategoria(g.categoria) ?? ""));
  const mesesPiso = [mes, ...previosConDatos];
  const pisoPorCat = new Map<string, number>();
  for (const g of fijosYCuotas(input.gastos.filter((x) => mesesPiso.includes(x.mes)))) pisoPorCat.set(g.categoria, (pisoPorCat.get(g.categoria) ?? 0) + g.propio);
  const pisoDetalle = [...pisoPorCat.entries()]
    .map(([categoria, t]) => ({ categoria, promedio: r2(t / mesesPiso.length) }))
    .sort((a, b) => b.promedio - a.promedio);

  const hormigas = operacionMes.filter((g) => g.propio > 0 && g.propio < HORMIGA_HASTA);
  const hormigaTotal = hormigas.reduce((t, g) => t + g.propio, 0);

  const recurrencia: Recurrencia = {
    pisoMensual: { total: r2(pisoDetalle.reduce((t, d) => t + d.promedio, 0)), detalle: pisoDetalle },
    proveedores,
    pctRecurrente: comparables.length > 0 ? pctDe(recurrenteOp, totalOperacion) : null,
    hormiga: { pagos: hormigas.length, total: r2(hormigaTotal), pctOperacion: pctDe(hormigaTotal, totalOperacion) },
  };

  // ── Alertas ──
  const soles = (n: number) => `S/${n.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  // Primero el costo primo (el que resume), después lo que más plata movió.
  const alertas: AlertaGasto[] = [];
  const primo = indicadores.find((i) => i.clave === "costoPrimo")!;
  const avisoIndicador = (i: Indicador) => ({ titulo: `${i.nombre}: ${i.pct}% de la venta`, detalle: `La referencia es ${i.meta}% o menos${i.pctProm3 !== null ? `; en los 3 meses anteriores fue ${i.pctProm3}%` : ""}.` });
  if (primo.estado === "alerta") alertas.push(avisoIndicador(primo));
  const porMonto: (AlertaGasto & { soles: number })[] = [];
  for (const i of indicadores) if (i.clave !== "costoPrimo" && i.estado === "alerta") porMonto.push({ ...avisoIndicador(i), soles: Number.MAX_SAFE_INTEGER });
  for (const c of categorias) {
    if (c.variacionPct !== null && c.variacionPct >= ALERTA_SUBE_PCT && c.monto - c.prom3 >= ALERTA_SUBE_SOLES) {
      porMonto.push({ titulo: `${c.categoria} subió ${c.variacionPct}%`, detalle: `${soles(c.monto)} este mes contra ${soles(c.prom3)} de promedio.`, soles: c.monto - c.prom3 });
    }
  }
  if (comparables.length >= 2) {
    for (const p of proveedores) {
      if (p.meses === 1 && p.monto >= ALERTA_NUEVO_DESDE) porMonto.push({ titulo: `Gasto nuevo: ${p.nombre}`, detalle: `${soles(p.monto)} este mes y nada en los meses anteriores.`, soles: p.monto });
    }
  }
  alertas.push(...porMonto.sort((a, b) => b.soles - a.soles).slice(0, MAX_ALERTAS - alertas.length).map(({ titulo, detalle }) => ({ titulo, detalle })));

  return {
    businessId: input.businessId, sede: input.sede, mes, mesesPrevios: previosConDatos,
    ventas: ventas !== null ? r2(ventas) : null,
    bolsillos, bolsillosProm3, indicadores, categorias, pagos, recurrencia, alertas,
  };
}
