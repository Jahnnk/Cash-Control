/**
 * Lee de la base el precio B2B real de Byte por receta de Atelier (fase 4, 26-nov-2026). La regla está en
 * precio-b2b-byte.ts. Lee los «P-» de Atelier del mes en curso y los dos anteriores (rotacion_efectiva = la suma de
 * los periodos de cada mes, sin contar dos veces los reportes que se pisan). No es "use server".
 */

import type { CostoPreparacion } from "@/lib/costos-preparaciones";
import { preciosB2BDeByte, type PrecioB2BByte, type VentaB2B } from "./precio-b2b-byte";

type SqlTag = (strings: TemplateStringsArray, ...params: unknown[]) => Promise<unknown>;

const ATELIER = 1;
export const MESES_B2B = 3;

/** El mes en curso (hora de Lima) y los anteriores, del más nuevo al más viejo. */
export function mesesB2B(hoy = new Date(), n = MESES_B2B): string[] {
  const lima = new Date(hoy.getTime() - 5 * 3600 * 1000);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** ref de receta → precio B2B de Byte. La versión hecha en el sistema también queda con la ref del Excel que reemplaza. */
export async function leerPreciosB2BByte(sql: SqlTag, efectivo: CostoPreparacion[]): Promise<Map<string, PrecioB2BByte>> {
  const meses = mesesB2B();
  const porMes = await Promise.all(meses.map((mes) =>
    (sql`SELECT product_name_raw AS nombre, units::float AS unidades, revenue::float AS venta
         FROM rotacion_efectiva(${ATELIER}, ${mes})
         WHERE upper(product_name_raw) ~ '^\\s*(\\[[^]]*\\]\\s*)?P\\s*-'` as Promise<{ nombre: string; unidades: number; venta: number }[]>)
      .then((filas) => filas.map((f): VentaB2B => ({ mes, nombre: f.nombre, unidades: Number(f.unidades) || 0, venta: Number(f.venta) || 0 })))
      .catch(() => [] as VentaB2B[])));
  const recetas = efectivo.filter((i) => i.tipo === "producto");
  const precios = preciosB2BDeByte(porMes.flat(), recetas.map((r) => ({ ref: r.ref, nombre: r.nombre, byte: r.detalle?.byte })));
  for (const r of recetas) {
    const p = precios.get(r.ref);
    if (p && r.reemplaza && !precios.has(r.reemplaza)) precios.set(r.reemplaza, p);
  }
  return precios;
}
