"use server";

/**
 * Qué se vendió este mes · Actions.
 *
 * Pedido de Jahnn (21-sep-2026): que su informe de ventas de Fonavi (panorama
 * del mes, top 10 por ingresos y ranking de postres) esté también en el panel
 * de cada administrador, en el panel de Grupo y en el deck de la reunión.
 *
 * La fuente es la carga de los sábados: el reporte "Platos con mayor rotación"
 * de Byte que sube cada sede (`product_period_sales`). El mes es la suma de
 * sus períodos, y el rango que se muestra es el que de verdad está cargado —
 * nunca el mes entero si solo llegó hasta el día 19.
 *
 * Acceso: dirección ve las tres sedes; el administrador, solo la suya.
 */

import { neon } from "@neondatabase/serverless";
import { activeBusinessId } from "@/lib/active-business";
import { getSessionRole } from "@/lib/session-access";
import { armarPanorama, type PanoramaProductos } from "@/lib/productos/panorama";

const sql = neon(process.env.DATABASE_URL!);

const SEDES: { id: number; nombre: string }[] = [
  { id: 2, nombre: "Fonavi" },
  { id: 3, nombre: "Centro" },
  { id: 1, nombre: "Atelier" },
];

export type PanoramaDeSede = {
  businessId: number;
  sede: string;
  /** null = esa sede todavía no tiene cargado el reporte del mes. */
  panorama: PanoramaProductos | null;
  /** Cuándo se subió el último reporte del mes (para saber qué tan fresco es). */
  cargadoEl: string | null;
};

type Res<T> = ({ ok: true } & T) | { ok: false; error: string };

function mesValido(month: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

async function panoramaDe(bId: number, month: string): Promise<PanoramaProductos | null> {
  const [filas, rango] = await Promise.all([
    sql`
      SELECT product_name_raw AS nombre, SUM(units)::float AS unidades, SUM(revenue)::float AS ingresos
      FROM product_period_sales WHERE business_id = ${bId} AND month = ${month}
      GROUP BY 1
    ` as unknown as Promise<{ nombre: string; unidades: number; ingresos: number }[]>,
    sql`
      SELECT MIN(period_start)::text AS desde, MAX(period_end)::text AS hasta, MAX(imported_at)::text AS cargado
      FROM product_period_sales WHERE business_id = ${bId} AND month = ${month}
    ` as unknown as Promise<{ desde: string | null; hasta: string | null; cargado: string | null }[]>,
  ]);
  const r = rango[0];
  if (filas.length === 0 || !r?.desde || !r?.hasta) return null;
  return armarPanorama(filas, r.desde, r.hasta);
}

/** El panorama de UNA sede (la activa, o la que pida dirección). */
export async function getPanoramaProductos(month: string, businessId?: number): Promise<Res<{ data: PanoramaDeSede }>> {
  if (!mesValido(month)) return { ok: false, error: "Mes inválido." };
  const role = await getSessionRole();
  if (!role) return { ok: false, error: "Sin acceso." };
  const bId = businessId ?? (await activeBusinessId());
  if (role.kind === "admin" && role.sede !== bId) return { ok: false, error: "Sin acceso a esta sede." };
  if (role.kind !== "admin" && role.kind !== "full") return { ok: false, error: "Sin acceso." };
  try {
    const [panorama, cargado] = await Promise.all([
      panoramaDe(bId, month),
      sql`SELECT MAX(imported_at)::text AS c FROM product_period_sales WHERE business_id = ${bId} AND month = ${month}` as unknown as Promise<{ c: string | null }[]>,
    ]);
    return {
      ok: true,
      data: {
        businessId: bId,
        sede: SEDES.find((s) => s.id === bId)?.nombre ?? `Sede ${bId}`,
        panorama,
        cargadoEl: cargado[0]?.c ?? null,
      },
    };
  } catch (e) {
    console.error("[getPanoramaProductos] failed:", e);
    return { ok: false, error: "No se pudo leer la rotación de productos." };
  }
}

/** Las tres sedes, para el panel de Grupo y el deck de la reunión. */
export async function getPanoramaProductosGrupo(month: string): Promise<Res<{ sedes: PanoramaDeSede[] }>> {
  if (!mesValido(month)) return { ok: false, error: "Mes inválido." };
  const role = await getSessionRole();
  if (role?.kind !== "full") return { ok: false, error: "Solo dirección." };
  try {
    const sedes = await Promise.all(SEDES.map(async (s) => {
      const [panorama, cargado] = await Promise.all([
        panoramaDe(s.id, month),
        sql`SELECT MAX(imported_at)::text AS c FROM product_period_sales WHERE business_id = ${s.id} AND month = ${month}` as unknown as Promise<{ c: string | null }[]>,
      ]);
      return { businessId: s.id, sede: s.nombre, panorama, cargadoEl: cargado[0]?.c ?? null };
    }));
    return { ok: true, sedes };
  } catch (e) {
    console.error("[getPanoramaProductosGrupo] failed:", e);
    return { ok: false, error: "No se pudo leer la rotación de productos." };
  }
}
