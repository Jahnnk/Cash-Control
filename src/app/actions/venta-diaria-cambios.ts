"use server";

/** Lectura del historial de cambios de la venta diaria (solo dirección y llave de lectura). */

import { neon } from "@neondatabase/serverless";
import { requireLectura } from "@/lib/session-access";
import { nombreDeSede, type CambioDeVenta } from "@/lib/venta-diaria-historial";

const sql = neon(process.env.DATABASE_URL!);

type Fila = {
  business_id: number; date: string; venta_antes: number | null; venta_despues: number;
  personas_antes: number | null; personas_despues: number; quien: string; creado_en: string;
};

/** Los cambios del mes (por día de venta), los más recientes primero. `tablaLista` false = falta correr la migración. */
export async function getCambiosVentaDiaria(
  mes: string,
  sede: number | null,
): Promise<{ ok: true; cambios: CambioDeVenta[]; tablaLista: boolean } | { ok: false; error: string }> {
  if (!(await requireLectura())) return { ok: false, error: "Solo dirección." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return { ok: false, error: "Mes inválido." };
  try {
    const filas = (await sql`
      SELECT business_id, date::text AS date, venta_antes::float AS venta_antes, venta_despues::float AS venta_despues,
             personas_antes, personas_despues, quien, creado_en::text AS creado_en
      FROM venta_diaria_cambios
      WHERE to_char(date, 'YYYY-MM') = ${mes} AND (${sede}::int IS NULL OR business_id = ${sede})
      ORDER BY creado_en DESC
      LIMIT 200
    `) as Fila[];
    return {
      ok: true, tablaLista: true,
      cambios: filas.map((f) => ({
        businessId: f.business_id, sede: nombreDeSede(f.business_id), date: f.date,
        ventaAntes: f.venta_antes, ventaDespues: f.venta_despues,
        personasAntes: f.personas_antes, personasDespues: f.personas_despues,
        quien: f.quien, creadoEn: f.creado_en,
      })),
    };
  } catch {
    return { ok: true, cambios: [], tablaLista: false };
  }
}
