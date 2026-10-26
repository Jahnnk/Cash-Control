"use server";

/**
 * La frescura de datos del grupo, para la banda de "¿hasta cuándo
 * tenemos datos?".
 *
 * Reutiliza `getDataFreshness` (última fecha con movimiento financiero
 * por sede) y le aplica el motor puro. Acá no se decide nada.
 */

import { neon } from "@neondatabase/serverless";
import { getSessionRole, requireLectura, puedeLeerDireccion } from "@/lib/session-access";
import { getDataFreshness, getKellyLoadStatus } from "./grupo";
import { getDatosCargadosProductos } from "./productos-panorama";
import { resumirFrescura, type FrescuraGrupo } from "@/lib/frescura-datos";
import { ventaCubiertaHasta } from "@/lib/frescura-importables";

export async function getFrescuraGrupo(): Promise<FrescuraGrupo | null> {
  // Dirección o llave de solo lectura (18-oct-2026); antes no tenía control propio. Nunca lanza: sin acceso, null.
  if (!(await requireLectura())) return null;
  try {
    const sedes = await getDataFreshness();
    return resumirFrescura({
      todayISO: new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }),
      sedes: sedes.map((s) => ({ businessId: s.businessId, name: s.name, lastDate: s.lastDate })),
    });
  } catch (err) {
    // La banda nunca puede tumbar la página que la contiene.
    console.error("[getFrescuraGrupo] failed:", err);
    return null;
  }
}

/**
 * «Datos cargados» del dashboard de Grupo (15-oct-2026): hasta qué fecha llega cada
 * reporte que sube Jahnn (Byte: ventas, mayor y menor rotación) y el Excel de cada sede,
 * con el día en que se subió. Solo dirección; nunca tumba la pantalla.
 */
export type FrescuraImportables = {
  hoy: string;
  sedes: {
    businessId: number;
    nombre: string;
    ventasHasta: string | null;
    mayorHasta: string | null;
    menorHasta: string | null;
    excelHasta: string | null;
    excelSubido: string | null;
  }[];
};

const NOMBRES: Record<number, string> = { 2: "Fonavi", 3: "Centro", 1: "Atelier" };

export async function getFrescuraImportables(): Promise<FrescuraImportables | null> {
  const role = await getSessionRole();
  if (!puedeLeerDireccion(role)) return null;
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const [ventas, productos, excel] = await Promise.all([
      // Solo el reporte oficial de Byte (la venta de la sede o la de dirección), nunca lo tecleado a mano.
      // Los días con venta de los últimos ~80 días: el último y, si la sede cierra un día de la semana (Atelier los
      // domingos), ese cierre no cuenta como atraso (lib/frescura-importables.ts → ventaCubiertaHasta).
      sql`SELECT business_id, date::text AS fecha FROM byte_ventas_efectiva
          WHERE source = 'import' AND total > 0 AND date >= (${hoy}::date - 80)` as unknown as Promise<{ business_id: number; fecha: string }[]>,
      getDatosCargadosProductos(),
      getKellyLoadStatus(),
    ]);
    return {
      hoy,
      sedes: [2, 3, 1].map((id) => {
        const p = productos.ok ? productos.sedes.find((s) => s.businessId === id) : null;
        const x = excel.find((e) => e.businessId === id);
        return {
          businessId: id,
          nombre: NOMBRES[id],
          ventasHasta: ventaCubiertaHasta(ventas.filter((v) => v.business_id === id).map((v) => v.fecha), hoy),
          mayorHasta: p?.mayor.hasta ?? null,
          menorHasta: p?.menor.hasta ?? null,
          excelHasta: x?.coversThrough ?? null,
          excelSubido: x?.lastImportAt ?? null,
        };
      }),
    };
  } catch (e) {
    console.error("[getFrescuraImportables] failed:", e);
    return null;
  }
}
