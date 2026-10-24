"use server";

/**
 * ¿Los números del mes son confiables? · el semáforo de cada sede y del grupo (lib/controles-fiabilidad.ts).
 * Lo ven dirección (Jahnn y Kelly) y la llave de solo lectura. Al abrir el mes se recalcula y se guarda (solo con
 * sesión de dirección: la llave de solo lectura no escribe nada).
 */

import { neon } from "@neondatabase/serverless";
import { getSessionRole, puedeLeerDireccion } from "@/lib/session-access";
import { controlesDelMesTodas, guardarControles } from "@/lib/controles-fiabilidad-sql";
import type { ControlesMes } from "@/lib/controles-fiabilidad";

const sql = neon(process.env.DATABASE_URL!);

export type ControlesDelMes = { mes: string; sedes: ControlesMes[]; grupo: ControlesMes };

export async function getControlesDelMes(mes: string): Promise<{ ok: true; data: ControlesDelMes } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (!puedeLeerDireccion(role)) return { ok: false, error: "Solo dirección." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return { ok: false, error: "Mes inválido." };
  try {
    const { sedes, grupo } = await controlesDelMesTodas(sql as never, mes);
    if (role?.kind === "full") await Promise.all([...sedes, grupo].map((r) => guardarControles(sql as never, r, "apertura")));
    return { ok: true, data: { mes, sedes, grupo } };
  } catch (err) {
    console.error("[getControlesDelMes] failed:", err);
    return { ok: false, error: "No se pudieron revisar los controles del mes." };
  }
}
