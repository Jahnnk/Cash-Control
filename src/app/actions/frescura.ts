"use server";

/**
 * La frescura de datos del grupo, para la banda de "¿hasta cuándo
 * tenemos datos?".
 *
 * Reutiliza `getDataFreshness` (última fecha con movimiento financiero
 * por sede) y le aplica el motor puro. Acá no se decide nada.
 */

import { neon } from "@neondatabase/serverless";
import { getSessionRole } from "@/lib/session-access";
import { getDataFreshness, getKellyLoadStatus } from "./grupo";
import { getDatosCargadosProductos } from "./productos-panorama";
import { resumirFrescura, type FrescuraGrupo } from "@/lib/frescura-datos";

export async function getFrescuraGrupo(): Promise<FrescuraGrupo | null> {
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
  if (role?.kind !== "full") return null;
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const [ventas, productos, excel] = await Promise.all([
      // Solo el reporte oficial de Byte (la venta de la sede o la de dirección), nunca lo tecleado a mano.
      sql`SELECT business_id, MAX(date)::text AS hasta FROM byte_ventas_efectiva WHERE source = 'import' GROUP BY business_id` as unknown as Promise<{ business_id: number; hasta: string | null }[]>,
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
          ventasHasta: ventas.find((v) => v.business_id === id)?.hasta ?? null,
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
