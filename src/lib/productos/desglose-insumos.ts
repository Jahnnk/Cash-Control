/**
 * Desglose del costo de un producto por insumo · MOTOR (puro).
 *
 * Mejora B del análisis del Excel de pricing (pedido de Jahnn, 18-nov-2026): para simular «si la
 * mantequilla sube 20%, ¿qué productos se pasan?», el sistema necesita saber cuánto de cada insumo
 * lleva cada producto, EN SOLES por unidad. El Excel ya lo tiene: cada línea de receta trae su «Costo
 * Unitario» (lo que esa línea aporta a una unidad, con la merma incluida).
 *
 * Las sub-recetas se abren: si el Triple Yayi's lleva «Mayonesa Yayi's» (SR040), esos S/ 0.09 se
 * reparten entre los insumos de la mayonesa (aceite, huevo, mostaza…) en la misma proporción que pesan
 * en su receta («Costo Total de Receta» de cada línea). Así una subida del aceite llega al sánguche.
 *
 * Lo que la cafetería le compra a Atelier (el pan del sánguche, PN…) es una hoja: la cafetería paga su
 * precio interno, no sus insumos.
 */

export type AporteInsumo = { sku: string | null; nombre: string; costo: number };

export type LineaReceta = {
  sku: string | null;
  nombre: string;
  /** Lo que la línea aporta a UNA unidad del producto (S/), con merma. null = el Excel no lo tiene. */
  aporte: number | null;
  /** Costo de la línea en la receta entera (S/): para repartir una sub-receta entre sus insumos. */
  total: number | null;
};

export type BloqueReceta = { nombre: string; lineas: LineaReceta[] };

const MAX_NIVELES = 5;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

const claveDe = (sku: string | null, nombre: string) => (sku?.trim() ? sku.trim().toUpperCase() : `N:${nombre.toLowerCase().trim()}`);

/** Lo que pesa cada insumo dentro de una sub-receta (suma 1). */
function proporciones(b: BloqueReceta, sub: (l: LineaReceta) => BloqueReceta | undefined, nivel: number): Map<string, { sku: string | null; nombre: string; parte: number }> {
  const out = new Map<string, { sku: string | null; nombre: string; parte: number }>();
  const pesos = b.lineas.map((l) => l.total ?? l.aporte ?? 0);
  const suma = pesos.reduce((t, p) => t + (p > 0 ? p : 0), 0);
  if (suma <= 0) return out;
  b.lineas.forEach((l, i) => {
    const peso = pesos[i];
    if (peso <= 0) return;
    const parte = peso / suma;
    const s = nivel < MAX_NIVELES ? sub(l) : undefined;
    if (s && s !== b) {
      for (const [k, x] of proporciones(s, sub, nivel + 1)) {
        const ya = out.get(k);
        out.set(k, { sku: x.sku, nombre: x.nombre, parte: (ya?.parte ?? 0) + parte * x.parte });
      }
      return;
    }
    const k = claveDe(l.sku, l.nombre);
    const ya = out.get(k);
    out.set(k, { sku: l.sku, nombre: l.nombre, parte: (ya?.parte ?? 0) + parte });
  });
  return out;
}

/**
 * El costo de una unidad del producto repartido por insumo, de mayor a menor. `sub` dice qué
 * sub-receta es una línea (o undefined si es un insumo).
 */
export function desglosar(b: BloqueReceta, sub: (l: LineaReceta) => BloqueReceta | undefined): AporteInsumo[] {
  const acum = new Map<string, AporteInsumo>();
  const sumar = (sku: string | null, nombre: string, costo: number) => {
    const k = claveDe(sku, nombre);
    const ya = acum.get(k);
    acum.set(k, { sku: ya?.sku ?? sku, nombre: ya?.nombre ?? nombre, costo: (ya?.costo ?? 0) + costo });
  };
  for (const l of b.lineas) {
    if (l.aporte === null || l.aporte <= 0) continue;
    const s = sub(l);
    if (s && s !== b) {
      const partes = proporciones(s, sub, 1);
      if (partes.size > 0) {
        for (const x of partes.values()) sumar(x.sku, x.nombre, l.aporte * x.parte);
        continue;
      }
    }
    sumar(l.sku, l.nombre, l.aporte);
  }
  return [...acum.values()].map((a) => ({ ...a, costo: r4(a.costo) })).filter((a) => a.costo > 0).sort((a, b) => b.costo - a.costo);
}
