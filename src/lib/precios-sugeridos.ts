/**
 * Precios sugeridos al crear una receta · MOTOR (puro).
 *
 * Fase A de «recetas y precios en el sistema» (pedido de Jahnn, 24-nov-2026): crear una receta nueva
 * (las casitas de jengibre) y saber en 5 minutos su costo y a cuánto venderla, sin el Excel de pricing.
 *
 * Las metas salen de las medianas del Excel de pricing de nov-2026:
 *   · margen interno de Atelier (a las cafeterías) 60 %   → precio = costo ÷ (1 − 0.60)
 *   · margen B2B de Atelier 75 %                          → precio = costo ÷ (1 − 0.75)
 *   · food cost de lo que se prepara en la cafetería 30 % → carta = costo ÷ 0.30
 *   · food cost de sede de lo que viene de Atelier ~55 %  → carta = precio interno ÷ 0.55
 * Por ahora son fijas; en la fase B se podrán cambiar en pantalla.
 *
 *   MARGEN     (precio − costo) ÷ precio
 *   FOOD COST  costo ÷ precio de carta. «De sede»: con lo que paga la cafetería (precio interno de lo que
 *              viene de Atelier). «De grupo»: con lo que le cuesta de verdad a Atelier (sus insumos).
 */

export const METAS = {
  margenInterno: 0.6,
  margenB2B: 0.75,
  foodCostCafeteria: 0.3,
  foodCostAtelierEnCarta: 0.55,
} as const;

/** Redondea hacia arriba al paso (0.10 o 0.50), sin errores de coma flotante. */
export function redondearArriba(n: number, paso: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  const pasos = Math.ceil(Math.round((n / paso) * 1e6) / 1e6);
  return Math.round(pasos * paso * 100) / 100;
}

export function precioPorMargen(costo: number, margen: number, paso = 0.1): number {
  return costo > 0 && margen < 1 ? redondearArriba(costo / (1 - margen), paso) : 0;
}

export function precioPorFoodCost(costo: number, foodCost: number, paso = 0.5): number {
  return costo > 0 && foodCost > 0 ? redondearArriba(costo / foodCost, paso) : 0;
}

/** (precio − costo) ÷ precio; null si falta el precio. */
export function margen(precio: number | null, costo: number | null): number | null {
  return precio && precio > 0 && costo != null ? (precio - costo) / precio : null;
}

/** costo ÷ precio de carta; null si falta el precio. */
export function foodCost(costo: number | null, precio: number | null): number | null {
  return precio && precio > 0 && costo != null ? costo / precio : null;
}

export type Sugeridos = { interno: number; b2b: number; carta: number };

/**
 * Producto de Atelier: interno y B2B por margen sobre el costo; la carta, sobre el precio interno que se
 * use (el que escribió Jahnn o, si no escribió, el sugerido).
 */
export function sugeridosAtelier(costo: number, internoElegido: number | null): Sugeridos {
  const interno = precioPorMargen(costo, METAS.margenInterno);
  const base = internoElegido && internoElegido > 0 ? internoElegido : interno;
  return { interno, b2b: precioPorMargen(costo, METAS.margenB2B), carta: precioPorFoodCost(base, METAS.foodCostAtelierEnCarta) };
}

/** Producto de cafetería: solo precio de carta. */
export function sugeridoCafeteria(costo: number): number {
  return precioPorFoodCost(costo, METAS.foodCostCafeteria);
}

/**
 * LA META ÚNICA del costo sobre el precio de carta (fase 3 de «unificar pricing», 25-nov-2026). Antes había tres
 * reglas: la ruta (30%), el Piso de precios (costo × 3 = 33%, margen 65–70%) y «¿Qué precios subir?» (alerta
 * sobre 35%, bien bajo 28%). Ahora todas leen ESTA, sacada de METAS:
 *
 *   · se prepara en la cafetería   costo de insumos ≤ 30% del precio de carta (foodCostCafeteria)
 *   · lo hace Atelier              costo de insumos ≤ 40% × 55% = 22% del precio de carta: la misma cuenta de la
 *                                  ruta (interno con 60% de margen y la sede con 55% de food cost)
 *
 * Se mide con el costo de INSUMOS (la mirada del Grupo). La mirada de la cafetería (lo que paga a Atelier por
 * su precio interno) se compara con foodCostAtelierEnCarta (55%).
 */
export function metaCostoCarta(deAtelier: boolean): number {
  const m = deAtelier ? (1 - METAS.margenInterno) * METAS.foodCostAtelierEnCarta : METAS.foodCostCafeteria;
  return Math.round(m * 10000) / 10000;
}

/** Margen de la meta: «en la meta» hasta 5 puntos por debajo de ella; más abajo, «holgado». */
export const HOLGURA_META_PTS = 5;

export type FrenteMeta = "pasa" | "en-meta" | "holgado";

/** Dónde queda un producto frente a la meta: costoPct = costo de insumos ÷ precio × 100. */
export function frenteMeta(costoPct: number, deAtelier: boolean): FrenteMeta {
  const meta = metaCostoCarta(deAtelier) * 100;
  if (costoPct > meta + 1e-9) return "pasa";
  if (costoPct > meta - HOLGURA_META_PTS + 1e-9) return "en-meta";
  return "holgado";
}

/**
 * El precio de carta que pide la meta: el mismo sugerido de la ruta de precios (en Atelier, con el precio interno
 * sugerido), redondeado de S/ 0.50 en S/ 0.50.
 */
export function cartaPorMeta(costoInsumos: number, deAtelier: boolean): number {
  return deAtelier ? sugeridosAtelier(costoInsumos, null).carta : sugeridoCafeteria(costoInsumos);
}

/** Prefijo de los insumos creados en el sistema: SIS-A001 (Atelier), SIS-C001 (Cafetería). */
export const prefijoInsumo = (origen: "Atelier" | "Cafetería") => (origen === "Atelier" ? "SIS-A" : "SIS-C");

export function skuInsumoNuevo(origen: "Atelier" | "Cafetería", usados: string[]): string {
  const p = prefijoInsumo(origen);
  const max = usados.filter((s) => s.toUpperCase().startsWith(p)).map((s) => Number(s.slice(p.length)) || 0).reduce((a, b) => Math.max(a, b), 0);
  return `${p}${String(max + 1).padStart(3, "0")}`;
}

export const esInsumoDelSistema = (sku: string) => /^SIS-[AC]\d{3,}$/i.test(sku.trim());
