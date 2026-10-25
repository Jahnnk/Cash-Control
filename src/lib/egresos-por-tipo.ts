/**
 * Egresos por tipo de costo · lógica PURA (pedido de Jahnn, 25-oct-2026).
 *
 * La auditoría de Fonavi setiembre la armó Jahnn en la pestaña «Resumen fijo vs variable» del Excel: todo lo que
 * salió de la cuenta en el mes, clasificado con el catálogo en cinco tipos —Fijo, Variable, Financiamiento,
 * Inversión y No es gasto— con su % de los egresos, y el detalle por categoría. Fácil de leer. Este cuadro es esa
 * pestaña dentro del sistema, para cualquier sede y mes.
 *
 * Los tipos salen del catálogo, con los mismos criterios de las seis cifras (lib/seis-cifras.ts → rubroDe):
 *   · Fijo      = tipo Fijo + POR ACLARAR (fijo provisional mientras no se aclare) + lo que no está en el catálogo.
 *   · Variable  = tipo Variable, IMPUESTOS incluidos (en las seis cifras van en su propia línea).
 *   · Financiamiento, Inversión y No es gasto = su tipo del catálogo.
 * La suma de los cinco = el total de egresos del mes (lo que salió de la cuenta, igual al Excel).
 *
 * El PUENTE explica, línea por línea, cómo se pasa de lo que salió (este cuadro) al costo real de las seis cifras:
 * impuestos aparte, lo que otras sedes o personas devolvieron, la parte de otras sedes en los compartidos, los
 * gastos no ejecutados que volvieron, etc. Tiene que cerrar al céntimo; si no, `sinExplicar` lo dice.
 */

import { rubroDe, CATEGORIA_IMPUESTOS, type CifrasSede, type Rubro } from "./seis-cifras";
import { compensacionesDelMes, corteDelMes, gastosEnCifras, revisarTipoDelMes, salioDeLaCuenta, type DatosMesSede, type GastoMes } from "./seis-cifras-mes";

export type TipoEgreso = "Fijo" | "Variable" | "Financiamiento" | "Inversión" | "No es gasto";
export const TIPOS_EGRESO: TipoEgreso[] = ["Fijo", "Variable", "Financiamiento", "Inversión", "No es gasto"];

const DE_RUBRO: Record<Rubro, TipoEgreso> = {
  gastos: "Fijo", costos: "Variable", impuestos: "Variable", deudas: "Financiamiento", inversion: "Inversión", noEsGasto: "No es gasto",
};
export const tipoEgreso = (categoria: string): TipoEgreso => DE_RUBRO[rubroDe(categoria)];

/** ¿Entra al punto de equilibrio? (la columna de la pestaña de Jahnn). */
export const ENTRA_AL_PE: Record<TipoEgreso, string> = {
  Fijo: "Sí", Variable: "Sí", Financiamiento: "Solo en «PE incluyendo deudas»", "Inversión": "No", "No es gasto": "No",
};

/** `detalle`: qué movimientos hay detrás (p. ej. cada devolución), para quien quiera auditar. */
export type LineaPuente = { etiqueta: string; monto: number; detalle?: string[] };
export type PuenteTipo = { desde: number; lineas: LineaPuente[]; hasta: number; seisCifras: number; sinExplicar: number };

export type EgresosPorTipo = {
  businessId: number;
  sede: string;
  mes: string;
  totalEgresos: number;
  ingresos: number;
  tipos: { tipo: TipoEgreso; monto: number; pct: number }[];
  fijoMasVariable: number;
  /** Fijo y Variable como % de los ingresos del mes. */
  fijoPctIngresos: number | null;
  variablePctIngresos: number | null;
  /** Detalle por categoría (solo las que tienen movimiento), ordenado por tipo y monto. */
  categorias: { categoria: string; tipo: TipoEgreso; monto: number; pct: number }[];
  /** De lo que salió al costo de las seis cifras: Fijo → «Costos fijos», Variable → «Costos variables». */
  puente: { fijo: PuenteTipo; variable: PuenteTipo };
  /** Control: la suma de los tipos − el total de egresos (debe ser 0). */
  control: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;
const suma = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((t, x) => t + f(x), 0);

export function egresosPorTipo(d: DatosMesSede, c: CifrasSede): EgresosPorTipo {
  const salieron = d.gastos.filter(salioDeLaCuenta);
  const total = r2(suma(salieron, (g) => g.monto));
  const pct = (m: number) => (total > 0 ? r1((m / total) * 100) : 0);
  const porTipo = new Map<TipoEgreso, number>(TIPOS_EGRESO.map((t) => [t, 0]));
  const porCat = new Map<string, number>();
  for (const g of salieron) {
    porTipo.set(tipoEgreso(g.categoria), (porTipo.get(tipoEgreso(g.categoria)) ?? 0) + g.monto);
    porCat.set(g.categoria, (porCat.get(g.categoria) ?? 0) + g.monto);
  }
  const tipos = TIPOS_EGRESO.map((tipo) => ({ tipo, monto: r2(porTipo.get(tipo) ?? 0), pct: pct(porTipo.get(tipo) ?? 0) }));
  const fijo = tipos[0].monto, variable = tipos[1].monto;
  const ingresos = c.caja.entro;
  const orden = new Map(TIPOS_EGRESO.map((t, i) => [t, i]));
  const categorias = [...porCat.entries()]
    .map(([categoria, monto]) => ({ categoria, tipo: tipoEgreso(categoria), monto: r2(monto), pct: pct(monto) }))
    .filter((x) => Math.abs(x.monto) >= 0.005)
    .sort((a, b) => orden.get(a.tipo)! - orden.get(b.tipo)! || b.monto - a.monto);
  return {
    businessId: d.businessId, sede: d.sede, mes: d.mes, totalEgresos: total, ingresos,
    tipos, fijoMasVariable: r2(fijo + variable),
    fijoPctIngresos: ingresos > 0 ? r1((fijo / ingresos) * 100) : null,
    variablePctIngresos: ingresos > 0 ? r1((variable / ingresos) * 100) : null,
    categorias,
    puente: { fijo: puente(d, c, "Fijo"), variable: puente(d, c, "Variable") },
    control: r2(suma(tipos, (t) => t.monto) - total),
  };
}

/** De lo que salió (tipo Fijo o Variable) al costo de las seis cifras, con cada diferencia en su línea. */
function puente(d: DatosMesSede, c: CifrasSede, tipo: "Fijo" | "Variable"): PuenteTipo {
  const delTipo = (g: GastoMes) => tipoEgreso(g.categoria) === tipo;
  const salieron = d.gastos.filter((g) => salioDeLaCuenta(g) && delTipo(g));
  const enCifras = gastosEnCifras(d).filter(delTipo);
  const idsCifras = new Set(enCifras.map((g) => g.id));
  const corte = corteDelMes(d);
  const compensados = new Set(compensacionesDelMes(d).map((x) => x.gastoId));
  const revisar = new Set(revisarTipoDelMes(d).map((x) => x.id));
  const fuera = salieron.filter((g) => !idsCifras.has(g.id));
  const desde = r2(suma(salieron, (g) => g.monto));
  // Lo que otras sedes o personas devolvieron y resta en una categoría de este tipo (sin impuestos: van aparte).
  const recuperos = corte !== null ? (d.recuperos[corte]?.recuperos ?? []) : [];
  const lineas: LineaPuente[] = [
    { etiqueta: "Parte de otras sedes en gastos compartidos", monto: -r2(suma(enCifras.filter((g) => salioDeLaCuenta(g)), (g) => g.monto - g.propio)) },
    {
      etiqueta: "Devuelto por otras sedes o personas",
      monto: -r2(suma(recuperos.filter((x) => tipoEgreso(x.categoria) === tipo && x.categoria !== CATEGORIA_IMPUESTOS), (x) => x.monto)),
      detalle: recuperos.filter((x) => tipoEgreso(x.categoria) === tipo && x.categoria !== CATEGORIA_IMPUESTOS).map((x) => `${x.nota} · ${x.categoria} · S/${x.monto.toFixed(2)}`),
    },
    { etiqueta: "Gastos no ejecutados que volvieron", monto: -r2(suma(fuera.filter((g) => compensados.has(g.id)), (g) => g.monto)) },
    { etiqueta: "Filas con el tipo cruzado (por corregir)", monto: -r2(suma(fuera.filter((g) => revisar.has(g.id) && !compensados.has(g.id)), (g) => g.monto)) },
    { etiqueta: "Después del último día con venta de Byte", monto: -r2(suma(fuera.filter((g) => !compensados.has(g.id) && !revisar.has(g.id) && corte !== null && g.fecha > corte), (g) => g.monto)) },
    { etiqueta: "Pagado por el socio de su bolsillo", monto: r2(suma(enCifras.filter((g) => !salioDeLaCuenta(g)), (g) => g.propio)) },
    // Los impuestos salen de «Costos variables» enteros (lo que se haya devuelto de impuestos tampoco toca los costos).
    ...(tipo === "Variable" ? [{ etiqueta: "Impuestos (van en su propia línea)", monto: -r2(suma(enCifras.filter((g) => g.categoria === CATEGORIA_IMPUESTOS), (g) => g.propio)) }] : []),
  ].filter((l) => Math.abs(l.monto) >= 0.005);
  const hasta = r2(desde + suma(lineas, (l) => l.monto));
  const seisCifras = tipo === "Fijo" ? c.gastos : c.costos;
  return { desde, lineas, hasta, seisCifras, sinExplicar: r2(seisCifras - hasta) };
}
