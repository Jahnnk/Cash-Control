"use server";

/**
 * Las seis cifras del dashboard de Grupo · solo dirección. El cálculo vive
 * en lib/seis-cifras.ts; aquí solo se leen los datos.
 *
 *   · Costos y gastos: las mismas filas que la cifra "salió" (igual al
 *     Excel), hasta el último día con Excel de cada sede.
 *   · Ventas: el cargador único (lib/kpis/ventas-loader.ts), hasta ese mismo día.
 *   · Caja: lo que entró y salió del mes (misma regla que totalesMesSede).
 *
 * Desde el 24-oct-2026 la lectura vive en lib/seis-cifras-sql.ts y el armado en lib/seis-cifras-mes.ts: el punto
 * de equilibrio y los controles de fiabilidad usan exactamente lo mismo.
 */

import { neon } from "@neondatabase/serverless";
import { requireLectura } from "@/lib/session-access";
import { cifrasDelGrupo, type CifrasSede, type CifrasGrupo } from "@/lib/seis-cifras";
import { cifrasDeSedeEnMes, hoyLima } from "@/lib/seis-cifras-sql";
import { leerConfigProfitFirst } from "@/lib/profit-first-config-sql";
import type { ConfigProfitFirst } from "@/lib/regla-33";

const sql = neon(process.env.DATABASE_URL!);

const SEDES: [number, string][] = [[2, "Fonavi"], [3, "Centro"], [1, "Atelier"]];

export type SeisCifras = {
  mes: string; sedes: CifrasSede[]; grupo: CifrasGrupo;
  /** Los ajustes del CEO para Profit First y la regla 33-33-33 (los de por defecto si no hay). */
  config: ConfigProfitFirst;
  /** ¿Se pueden guardar ajustes? (false = falta crear la tabla). */
  configGuardable: boolean;
};

export async function getSeisCifras(mes: string): Promise<{ ok: true; data: SeisCifras } | { ok: false; error: string }> {
  if (!(await requireLectura())) return { ok: false, error: "Solo dirección." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return { ok: false, error: "Mes inválido." };
  try {
    const hoy = hoyLima();
    const sedes = await Promise.all(SEDES.map(([bId, sede]) => cifrasDeSedeEnMes(sql as never, bId, sede, mes, hoy)));
    const { config, guardable } = await leerConfigProfitFirst(sql);
    return { ok: true, data: { mes, sedes, grupo: cifrasDelGrupo(sedes), config, configGuardable: guardable } };
  } catch (e) {
    console.error("[getSeisCifras] failed:", e);
    return { ok: false, error: "No se pudieron calcular las seis cifras." };
  }
}
