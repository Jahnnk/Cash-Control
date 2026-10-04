/**
 * Flujo de caja mensual · cálculo puro (pedido de Jahnn, 3-oct-2026, idea de
 * un libro: "el flujo de caja es tu brújula").
 *
 *   Flujo del mes     = Entró − Salió (los mismos de la tarjeta Caja y del Excel).
 *   Flujo acumulado   = la suma de los flujos desde que llevamos el control
 *                       (marzo 2026). NO es el saldo del banco: no conoce la
 *                       plata con la que arrancó cada sede.
 *
 * El acumulado se calcula con TODOS los meses desde el primero con datos y
 * solo después se recorta a la ventana que se dibuja, para que la línea no
 * "reinicie" según el mes que se mire.
 */

import { formatCurrency } from "./utils";

export type MesFlujo = {
  mes: string;
  entro: number;
  salio: number;
  /** Depositado a fondos mutuos (parte de lo que salió). */
  ahorro: number;
  /** Utilidades pagadas a los socios (parte de lo que salió). */
  reparto: number;
  /** Rescatado del fondo mutuo (parte de lo que entró). */
  rescate: number;
};

export type PuntoFlujo = MesFlujo & { flujo: number; acumulado: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Suma varias sedes mes a mes (lo que una sede le presta a otra se cancela solo). */
export function sumarSedes(series: MesFlujo[][]): MesFlujo[] {
  const por = new Map<string, MesFlujo>();
  for (const serie of series) {
    for (const m of serie) {
      const a = por.get(m.mes) ?? { mes: m.mes, entro: 0, salio: 0, ahorro: 0, reparto: 0, rescate: 0 };
      a.entro += m.entro; a.salio += m.salio; a.ahorro += m.ahorro; a.reparto += m.reparto; a.rescate += m.rescate;
      por.set(m.mes, a);
    }
  }
  return [...por.values()].sort((a, b) => a.mes.localeCompare(b.mes));
}

/**
 * La serie que se dibuja: acumulado sobre todos los meses, recortada a los
 * últimos `ventana`, sin los meses anteriores a que la sede tuviera datos.
 */
export function armarSerie(meses: MesFlujo[], ventana = 6): PuntoFlujo[] {
  const orden = [...meses].sort((a, b) => a.mes.localeCompare(b.mes));
  let acumulado = 0;
  const puntos: PuntoFlujo[] = orden.map((m) => {
    const flujo = r2(m.entro - m.salio);
    acumulado = r2(acumulado + flujo);
    return { ...m, entro: r2(m.entro), salio: r2(m.salio), flujo, acumulado };
  });
  const primero = puntos.findIndex((p) => p.entro !== 0 || p.salio !== 0);
  return (primero < 0 ? [] : puntos.slice(primero)).slice(-ventana);
}

/**
 * Lo que se movió con el ahorro, en una frase. El rescate y el pago a socios
 * son UN movimiento cuando van juntos (se rescata para pagar las utilidades).
 */
export function textoMovimientosAhorro(f: { ahorro: number; rescate: number; reparto: number }): string {
  const partes: string[] = [];
  if (f.ahorro > 0) partes.push(`al ahorro ${formatCurrency(f.ahorro)}`);
  if (f.rescate > 0 && f.reparto > 0) partes.push(`del ahorro ${formatCurrency(f.rescate)} → utilidades a socios ${formatCurrency(f.reparto)}`);
  else if (f.rescate > 0) partes.push(`del ahorro ${formatCurrency(f.rescate)}`);
  else if (f.reparto > 0) partes.push(`utilidades a socios ${formatCurrency(f.reparto)}`);
  return partes.join(" · ");
}
