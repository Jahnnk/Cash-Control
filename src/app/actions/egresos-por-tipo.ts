"use server";

/**
 * Egresos por tipo de costo de cada sede en un mes (lib/egresos-por-tipo.ts) · solo lectura, para dirección.
 * Lee lo mismo que las seis cifras (lib/seis-cifras-sql.ts), así el puente cierra con ellas al céntimo.
 */

import { neon } from "@neondatabase/serverless";
import { requireLectura } from "@/lib/session-access";
import { leerDatosMesSede } from "@/lib/seis-cifras-sql";
import { cifrasDelMes } from "@/lib/seis-cifras-mes";
import { egresosPorTipo, type EgresosPorTipo } from "@/lib/egresos-por-tipo";

const sql = neon(process.env.DATABASE_URL!);
const SEDES: [number, string][] = [[2, "Fonavi"], [3, "Centro"], [1, "Atelier"]];

export async function getEgresosPorTipo(mes: string): Promise<{ ok: true; sedes: EgresosPorTipo[] } | { ok: false; error: string }> {
  if (!(await requireLectura())) return { ok: false, error: "Solo dirección." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return { ok: false, error: "Mes inválido." };
  try {
    const sedes = await Promise.all(SEDES.map(async ([bId, sede]) => {
      const d = await leerDatosMesSede(sql as never, bId, sede, mes);
      return egresosPorTipo(d, cifrasDelMes(d));
    }));
    return { ok: true, sedes };
  } catch (err) {
    console.error("[getEgresosPorTipo] failed:", err);
    return { ok: false, error: "No se pudieron leer los egresos por tipo." };
  }
}
