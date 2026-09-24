/**
 * Regla 80/20 de los productos · MOTOR (puro).
 *
 * Pedido de Jahnn (24-sep-2026): "saber si el 80% de nuestros ingresos se
 * genera con el 20% de los productos", para el mes y para los últimos 3
 * meses, así se ve la tendencia.
 *
 * Se ordena la carta de mayor a menor ingreso y se acumula:
 *   · núcleo = los productos que hacen falta para llegar al 80% de la venta
 *     (el que cruza la línea del 80% cuenta dentro);
 *   · top 20% = cuánto de la venta hace la quinta parte más vendida;
 *   · cola = todo lo que queda fuera del núcleo.
 * Es el mismo criterio que la clase A del informe trimestral.
 */

export type ProductoPareto = { nombre: string; familia: string; ingresos: number; pct: number; acumPct: number };

export type Pareto = {
  productos: number;
  ventas: number;
  /** Cuántos productos hacen el 80% de la venta y qué parte de la carta son. */
  nucleo: number;
  pctNucleo: number;
  /** Qué parte de la venta hace el 20% de productos más vendidos. */
  top20: number;
  ventasTop20Pct: number;
  /** Lo que queda fuera del núcleo. */
  cola: number;
  ventasColaPct: number;
  /** La carta ordenada por ingresos, con su % y el % acumulado. */
  lista: ProductoPareto[];
};

const r1 = (n: number) => Math.round(n * 10) / 10;

export function reglaOchentaVeinte(items: { nombre: string; familia: string; ingresos: number }[]): Pareto | null {
  const carta = items.filter((x) => x.ingresos > 0).sort((a, b) => b.ingresos - a.ingresos);
  const ventas = carta.reduce((a, x) => a + x.ingresos, 0);
  if (carta.length === 0 || ventas <= 0) return null;
  let acum = 0;
  const lista: ProductoPareto[] = [];
  let nucleo = 0;
  for (const x of carta) {
    acum += x.ingresos;
    const acumPct = (acum / ventas) * 100;
    if (nucleo === 0 && acumPct >= 80 - 1e-9) nucleo = lista.length + 1;
    lista.push({ nombre: x.nombre, familia: x.familia, ingresos: x.ingresos, pct: r1((x.ingresos / ventas) * 100), acumPct: r1(acumPct) });
  }
  const top20 = Math.max(1, Math.ceil(carta.length * 0.2));
  const ventasTop20 = carta.slice(0, top20).reduce((a, x) => a + x.ingresos, 0);
  const ventasNucleo = carta.slice(0, nucleo).reduce((a, x) => a + x.ingresos, 0);
  return {
    productos: carta.length,
    ventas: Math.round(ventas * 100) / 100,
    nucleo,
    pctNucleo: r1((nucleo / carta.length) * 100),
    top20,
    ventasTop20Pct: r1((ventasTop20 / ventas) * 100),
    cola: carta.length - nucleo,
    ventasColaPct: r1(100 - (ventasNucleo / ventas) * 100),
    lista,
  };
}

export type TendenciaPareto = { tono: "concentra" | "reparte" | "estable"; texto: string };

/**
 * Mes contra últimos 3 meses: si este mes hacen falta MENOS productos para
 * llegar al 80%, la venta se concentra en pocos (más dependencia de ellos);
 * si hacen falta más, se reparte. Menos de 3 puntos de diferencia = estable.
 */
export function tendenciaPareto(mes: Pareto | null, tresMeses: Pareto | null): TendenciaPareto | null {
  if (!mes || !tresMeses) return null;
  const d = mes.pctNucleo - tresMeses.pctNucleo;
  if (d <= -3) return { tono: "concentra", texto: `La venta se concentra: este mes el 80% sale del ${mes.pctNucleo}% de la carta (en 3 meses, del ${tresMeses.pctNucleo}%).` };
  if (d >= 3) return { tono: "reparte", texto: `La venta se reparte más: este mes el 80% sale del ${mes.pctNucleo}% de la carta (en 3 meses, del ${tresMeses.pctNucleo}%).` };
  return { tono: "estable", texto: `Igual que en los últimos 3 meses: el 80% sale de alrededor del ${mes.pctNucleo}% de la carta.` };
}
