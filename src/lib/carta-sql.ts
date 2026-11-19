/**
 * La carta de las cafeterías tal como la ve todo el sistema: el último Excel de pricing (costos_carta) con
 * los cambios hechos en el sistema encima (carta_sistema, lib/productos/carta-sistema.ts). Única puerta de
 * lectura de la carta: Productos, Candidatos, Precios y Recetas y costos leen de aquí.
 * Resiliente pre-migración: sin columnas nuevas o sin la tabla carta_sistema, devuelve lo que haya.
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { CostoCarta } from "@/lib/productos/costos-carta";
import { aplicarCartaSistema, type CambioCarta } from "@/lib/productos/carta-sistema";
import { ajustarDesglose } from "@/lib/productos/precios-vigentes";
import { leerCatalogo, leerPreciosVigentes } from "@/lib/catalogo-costos-sql";
import { costoTienda } from "@/lib/productos/receta-carta";

type Sql = NeonQueryFunction<false, false>;

export async function leerCambiosCarta(sql: Sql): Promise<CambioCarta[]> {
  try {
    return (await sql`
      SELECT ref, nombre, nombre_carta AS "nombreCarta", seccion, origen, categoria, precio::float AS precio, costo::float AS costo, nuevo, receta,
             to_char(actualizado_el AT TIME ZONE 'America/Lima', 'YYYY-MM-DD') AS "actualizadoEl"
      FROM carta_sistema`) as CambioCarta[];
  } catch {
    return [];
  }
}

export async function leerCarta(sql: Sql): Promise<CostoCarta[]> {
  const [excel, cambios] = await Promise.all([
    (sql`SELECT ref, nombre, nombre_carta AS "nombreCarta", categoria, costo::float AS costo, precio::float AS precio, origen, insumos, seccion, en_carta AS "enCarta", desglose FROM costos_carta` as unknown as Promise<CostoCarta[]>)
      // Antes de la migración del desglose por insumo (18-nov-2026): sin esa columna.
      .catch(() => (sql`SELECT ref, nombre, nombre_carta AS "nombreCarta", categoria, costo::float AS costo, precio::float AS precio, origen, insumos, seccion, en_carta AS "enCarta" FROM costos_carta` as unknown as Promise<CostoCarta[]>))
      // Antes de la migración de sección y en-carta (7-nov-2026): sin esas dos columnas.
      .catch(() => (sql`SELECT ref, nombre, nombre_carta AS "nombreCarta", categoria, costo::float AS costo, precio::float AS precio, origen, insumos FROM costos_carta` as unknown as Promise<CostoCarta[]>))
      // Antes de la migración de origen e insumos (8-oct-2026): sin esas dos columnas.
      .catch(() => (sql`SELECT ref, nombre, nombre_carta AS "nombreCarta", categoria, costo::float AS costo, precio::float AS precio FROM costos_carta` as unknown as Promise<CostoCarta[]>))
      .catch(() => [] as CostoCarta[]),
    leerCambiosCarta(sql),
  ]);
  return aplicarCartaSistema(excel, cambios);
}

/**
 * La carta con su costo de INSUMOS y los vínculos Byte → carta. Food cost real: lo de Atelier (AT-) al costo
 * de Atelier; lo que se prepara en la cafetería (CF-, MN-), a su costo. Con los precios de insumos cambiados
 * en el sistema (fase 1, 18-nov-2026): lo que prepara la cafetería sube con sus precios; lo de Atelier ya sube
 * por la lista de Atelier (leerCatalogo) y aquí solo se ajusta su desglose, para que el simulador parta de hoy.
 */
export async function leerCartaConCostos(sql: Sql): Promise<{ costos: CostoCarta[]; vinculos: Map<string, string> }> {
  const [costos, vinculos, catalogoAtelier, { vigentes, factores }, cambios] = await Promise.all([
    leerCarta(sql),
    (sql`SELECT clave, ref FROM carta_vinculos` as unknown as Promise<{ clave: string; ref: string }[]>).catch(() => []),
    leerCatalogo(sql, 1).then((c) => c.efectivo).catch(() => []),
    leerPreciosVigentes(sql),
    leerCambiosCarta(sql),
  ]);
  const recetas = new Map(cambios.filter((c) => c.nuevo && c.receta).map((c) => [c.ref, c.receta!]));
  for (const c of costos) {
    if (!c.desglose || c.desglose.length === 0 || recetas.has(c.ref)) continue;
    const deAtelier = c.ref.startsWith("AT-");
    const { desglose, delta } = ajustarDesglose(c.desglose, deAtelier ? "Atelier" : "Cafetería", factores);
    c.desglose = desglose;
    if (!deAtelier && delta !== 0) c.costo = Math.max(0, c.costo + delta);
  }
  // Productos nuevos que se preparan en tienda (fase 2b): su costo sale de su receta con los precios de HOY
  // (insumos de la cafetería y lo de Atelier a su precio interno), así que no se ajusta arriba.
  const cafeteria = new Map(vigentes.filter((v) => v.origen === "Cafetería").map((v) => [v.sku, v]));
  const internos = new Map(costos.filter((c) => c.ref.startsWith("AT-")).map((c) => [c.ref, c.costo]));
  for (const c of costos) {
    const r = recetas.get(c.ref);
    if (r?.tipo !== "tienda") continue;
    const t = costoTienda(r, (sku) => cafeteria.get(sku) ?? null, (ref) => internos.get(ref) ?? null);
    c.costo = t.costo ?? 0;
    c.desglose = t.costo !== null ? t.desglose : null;
  }
  const insumosAtelier = new Map(catalogoAtelier.map((i) => [i.reemplaza ?? i.ref, i.costo]));
  for (const c of costos) {
    const r = recetas.get(c.ref);
    c.costoInsumos = r?.tipo === "atelier" ? (r.recetaRef ? insumosAtelier.get(r.recetaRef) ?? null : null)
      : r?.tipo === "tienda" ? (c.costo > 0 ? c.costo : null)
      : c.ref.startsWith("AT-") ? (insumosAtelier.get(c.ref) ?? null) : c.costo;
  }
  return { costos, vinculos: new Map(vinculos.map((v) => [v.clave, v.ref])) };
}
