/**
 * Las seis cifras del negocio · MOTOR (puro).
 *
 * Pedido de Jahnn (3-oct-2026): rediseñar el dashboard de Grupo con seis
 * conceptos y sus definiciones TAL CUAL:
 *
 *   · Ventas        — lo que facturaste en el período. El punto de partida,
 *                     no el resultado.
 *   · Costos        — lo que gastas directamente para producir o entregar lo
 *                     que vendes.
 *   · Gastos        — lo que pagas para que el negocio funcione,
 *                     independientemente de cuánto vendas.
 *   · Caja          — el movimiento real del efectivo: lo que entra y lo que
 *                     sale físicamente.
 *   · Margen        — qué porcentaje de cada venta te queda después de cubrir
 *                     los costos directos.
 *   · Ganancia real — lo que efectivamente te queda después de todos los
 *                     costos, gastos e impuestos.
 *
 * Cómo se traduce con las categorías de la lista única (reglas-gasto.ts):
 *
 *   Costos   = tipo Variable, menos IMPUESTOS: PRODUCTOS ATELIER, INSUMOS,
 *              PACKAGING, DELIVERY Y FLETES, SS BANCARIOS (suben y bajan con
 *              la venta).
 *   Gastos   = tipo Fijo (planilla, alquiler, servicios…) + lo Desconocido
 *              (POR ACLARAR cuenta como fijo, igual que en el punto de
 *              equilibrio: dejarlo fuera haría ver la ganancia mejor de lo
 *              que es).
 *   Impuestos = IMPUESTOS (el IR de la MYPE es un % de la venta).
 *   Margen   = (Ventas − Costos) ÷ Ventas.
 *   Ganancia real = Ventas − Costos − Gastos − Impuestos.
 *
 * Quedan FUERA de la ganancia —pero sí salen de la caja— las cuotas de
 * deuda, las inversiones (equipos y remodelación) y lo que no es gasto del
 * negocio (ahorro, utilidades a socios, préstamos entre sedes, devoluciones):
 * se muestran aparte para poder conciliar la ganancia con la caja.
 *
 * Todo se calcula HASTA EL MISMO DÍA (el último con Excel): comparar ventas
 * de hoy con gastos de hace una semana inflaría la ganancia.
 *
 * Y no se muestra resultado (margen, ganancia) cuando todavía no tiene
 * sentido: sin gastos cargados, o con el mes recién empezado (antes del
 * día 10 casi no hay planilla ni alquiler pagados y la ganancia saldría
 * cerca de 100%). Se dice por qué en vez de mostrar un número engañoso.
 */

/** Antes de este día del mes, sin Excel completo, la ganancia no se muestra. */
export const DIA_MINIMO_RESULTADO = 10;

import { tipoDeCategoria } from "./reglas-gasto";

export type FilaCifras = { categoria: string; /** La parte de la sede (en un compartido, sin la de otras). */ propio: number; /** Lo que salió. */ monto: number };

/** `ahorro` y `reparto` son partes de `noEsGasto` (fondos mutuos; utilidades a socios): se muestran aparte en Caja. */
export type FueraDeLaGanancia = { deudas: number; inversion: number; noEsGasto: number; otrasSedes: number; ahorro: number; reparto: number };

export type CifrasSede = {
  businessId: number;
  sede: string;
  mes: string;
  /** Último día incluido en costos y gastos (el último con Excel); null = sin Excel del mes. */
  corte: string | null;
  /** El Excel llega hasta fin de mes (±2 días): la ganancia es la del mes, no provisional. */
  mesCompleto: boolean;
  /** Hay base para mostrar margen y ganancia (gastos cargados y mes con algo de avance). */
  conResultado: boolean;
  /** Por qué no hay resultado, dicho para la pantalla (null si lo hay). */
  sinResultadoPorque: string | null;
  ventas: number | null;
  /** Ventas que Byte ya trae después del corte (para decirlo, no para sumarlo). */
  ventasPosteriores: number;
  costos: number;
  gastos: number;
  impuestos: number;
  /** (Ventas − Costos) ÷ Ventas, en %. */
  margenPct: number | null;
  /** Ventas − Costos − Gastos − Impuestos. null si falta la venta o el Excel. */
  ganancia: number | null;
  gananciaPct: number | null;
  caja: { entro: number; salio: number; flujo: number };
  fuera: FueraDeLaGanancia;
  /** Lo que esta sede le compró a Atelier (para netear el consolidado). */
  compraAtelier: number;
  /** Las categorías que más pesan en cada rubro. */
  topCostos: { categoria: string; monto: number }[];
  topGastos: { categoria: string; monto: number }[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

export const CATEGORIA_IMPUESTOS = "IMPUESTOS";
export const CATEGORIA_COMPRA_ATELIER = "PRODUCTOS ATELIER";

/** En qué rubro cae una categoría. */
export type Rubro = "costos" | "gastos" | "impuestos" | "deudas" | "inversion" | "noEsGasto";

export function rubroDe(categoria: string): Rubro {
  if (categoria === CATEGORIA_IMPUESTOS) return "impuestos";
  const t = tipoDeCategoria(categoria);
  if (t === "Variable") return "costos";
  if (t === "Financiamiento") return "deudas";
  if (t === "Inversión") return "inversion";
  if (t === "No es gasto") return "noEsGasto";
  // Fijo, Desconocido y lo que no está en la lista (nadie lo clasificó): cuenta como gasto.
  return "gastos";
}

const top = (m: Map<string, number>, n = 3) =>
  [...m.entries()].map(([categoria, monto]) => ({ categoria, monto: r2(monto) })).sort((a, b) => b.monto - a.monto).slice(0, n);

export function cifrasDeSede(input: {
  businessId: number;
  sede: string;
  mes: string;
  /** Último día del mes (YYYY-MM-DD). */
  finDeMes: string;
  corte: string | null;
  filas: FilaCifras[];
  ventas: number | null;
  ventasPosteriores?: number;
  caja: { entro: number; salio: number };
}): CifrasSede {
  const sumas: Record<Rubro, number> = { costos: 0, gastos: 0, impuestos: 0, deudas: 0, inversion: 0, noEsGasto: 0 };
  const porCostos = new Map<string, number>();
  const porGastos = new Map<string, number>();
  let otrasSedes = 0;
  let compraAtelier = 0;
  let ahorro = 0;
  let reparto = 0;
  for (const f of input.filas) {
    const rubro = rubroDe(f.categoria);
    sumas[rubro] += f.propio;
    if (f.categoria === "AHORRO") ahorro += f.propio;
    if (f.categoria === "UTILIDADES A SOCIOS") reparto += f.propio;
    otrasSedes += f.monto - f.propio;
    if (rubro === "costos") porCostos.set(f.categoria, (porCostos.get(f.categoria) ?? 0) + f.propio);
    if (rubro === "gastos") porGastos.set(f.categoria, (porGastos.get(f.categoria) ?? 0) + f.propio);
    if (f.categoria === CATEGORIA_COMPRA_ATELIER) compraAtelier += f.propio;
  }
  const { ventas, corte } = input;
  const costos = r2(sumas.costos), gastos = r2(sumas.gastos), impuestos = r2(sumas.impuestos);
  // Mes completo: el Excel llega hasta fin de mes con 2 días de tolerancia (la planilla se paga el 30 o 31).
  const mesCompleto = corte !== null && Date.parse(`${input.finDeMes}T12:00:00Z`) - Date.parse(`${corte}T12:00:00Z`) <= 2 * 86_400_000;
  let sinResultadoPorque: string | null = null;
  if (corte === null) sinResultadoPorque = "Sin Excel de este mes";
  else if (ventas === null || ventas <= 0) sinResultadoPorque = "Sin ventas cargadas";
  else if (costos + gastos + impuestos <= 0) sinResultadoPorque = "Sin gastos cargados";
  else if (!mesCompleto && Number(corte.slice(8, 10)) < DIA_MINIMO_RESULTADO) sinResultadoPorque = "El mes recién empieza";
  const hayResultado = sinResultadoPorque === null;
  const ganancia = hayResultado ? r2(ventas! - costos - gastos - impuestos) : null;
  return {
    businessId: input.businessId, sede: input.sede, mes: input.mes, corte, mesCompleto,
    conResultado: hayResultado, sinResultadoPorque,
    ventas: ventas !== null ? r2(ventas) : null,
    ventasPosteriores: r2(input.ventasPosteriores ?? 0),
    costos, gastos, impuestos,
    margenPct: hayResultado ? r1(((ventas! - costos) / ventas!) * 100) : null,
    ganancia,
    gananciaPct: hayResultado && ganancia !== null ? r1((ganancia / ventas!) * 100) : null,
    caja: { entro: r2(input.caja.entro), salio: r2(input.caja.salio), flujo: r2(input.caja.entro - input.caja.salio) },
    fuera: { deudas: r2(sumas.deudas), inversion: r2(sumas.inversion), noEsGasto: r2(sumas.noEsGasto), otrasSedes: r2(otrasSedes), ahorro: r2(ahorro), reparto: r2(reparto) },
    compraAtelier: r2(compraAtelier),
    topCostos: top(porCostos), topGastos: top(porGastos),
  };
}

export type CifrasGrupo = {
  ventas: number | null;
  costos: number;
  gastos: number;
  impuestos: number;
  margenPct: number | null;
  ganancia: number | null;
  gananciaPct: number | null;
  caja: { entro: number; salio: number; flujo: number };
  fuera: FueraDeLaGanancia;
  /** Lo que Atelier le vendió a las cafeterías: se descontó una vez de ventas y de costos. */
  ventasInternas: number;
  /** Algún corte (o el Excel) no llega a fin de mes: la ganancia es provisional. */
  provisional: boolean;
  /** Sedes que no entran al resultado del grupo, con la razón. */
  sinResultado: { sede: string; porque: string }[];
};

/**
 * El consolidado del grupo. Lo que Atelier le vende a Fonavi y Centro se
 * cuenta UNA vez (lib/ventas-internas-grupo.ts): sale de las ventas de
 * Atelier y de los costos de las cafeterías. La ganancia no cambia; el
 * margen sí (con la venta interna, el margen del grupo se veía menor).
 */
export function cifrasDelGrupo(sedes: CifrasSede[]): CifrasGrupo {
  const conResultado = sedes.filter((s) => s.conResultado);
  const sinResultado = sedes.filter((s) => !s.conResultado).map((s) => ({ sede: s.sede, porque: s.sinResultadoPorque ?? "" }));
  const sum = (f: (s: CifrasSede) => number) => sedes.reduce((t, s) => t + f(s), 0);
  // Ventas del grupo: lo que Atelier le vende a las cafeterías se cuenta una vez.
  const atelierVende = sedes.some((s) => s.businessId === 1 && s.ventas !== null);
  const comprasCafeterias = (lista: CifrasSede[]) => lista.filter((s) => s.businessId !== 1).reduce((t, s) => t + s.compraAtelier, 0);
  const internoVentas = atelierVende ? comprasCafeterias(sedes) : 0;
  const ventas = sedes.some((s) => s.ventas !== null) ? r2(sum((s) => s.ventas ?? 0) - internoVentas) : null;
  // El resultado solo suma las sedes con base para tenerlo (gastos cargados, mes con avance).
  const interno = conResultado.some((s) => s.businessId === 1) ? comprasCafeterias(conResultado) : 0;
  const vRes = conResultado.reduce((t, s) => t + (s.ventas ?? 0), 0) - interno;
  const costos = r2(conResultado.reduce((t, s) => t + s.costos, 0) - interno);
  const gastos = r2(conResultado.reduce((t, s) => t + s.gastos, 0));
  const impuestos = r2(conResultado.reduce((t, s) => t + s.impuestos, 0));
  const hayResultado = conResultado.length > 0 && vRes > 0;
  const ganancia = hayResultado ? r2(vRes - costos - gastos - impuestos) : null;
  const entro = sum((s) => s.caja.entro), salio = sum((s) => s.caja.salio);
  return {
    ventas, costos, gastos, impuestos,
    margenPct: hayResultado ? r1(((vRes - costos) / vRes) * 100) : null,
    ganancia,
    gananciaPct: hayResultado && ganancia !== null ? r1((ganancia / vRes) * 100) : null,
    caja: { entro: r2(entro), salio: r2(salio), flujo: r2(entro - salio) },
    fuera: {
      deudas: r2(sum((s) => s.fuera.deudas)), inversion: r2(sum((s) => s.fuera.inversion)),
      noEsGasto: r2(sum((s) => s.fuera.noEsGasto)), otrasSedes: r2(sum((s) => s.fuera.otrasSedes)),
      ahorro: r2(sum((s) => s.fuera.ahorro)), reparto: r2(sum((s) => s.fuera.reparto)),
    },
    ventasInternas: r2(internoVentas),
    provisional: conResultado.some((s) => !s.mesCompleto),
    sinResultado,
  };
}
