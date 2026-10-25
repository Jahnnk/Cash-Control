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

/**
 * `vista` (24-oct-2026): a quién se le muestra. Kelly (finanzas) ve el checklist del mes con el «qué hacer»; Jahnn y la
 * llave de solo lectura ven la línea del CEO (lib/controles-vista.ts). Los datos son los mismos.
 */
export type ControlesDelMes = { mes: string; sedes: ControlesMes[]; grupo: ControlesMes; vista: "ceo" | "kelly" };

export async function getControlesDelMes(mes: string): Promise<{ ok: true; data: ControlesDelMes } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (!puedeLeerDireccion(role)) return { ok: false, error: "Solo dirección." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return { ok: false, error: "Mes inválido." };
  try {
    const { sedes, grupo } = await controlesDelMesTodas(sql as never, mes);
    if (role?.kind === "full") await Promise.all([...sedes, grupo].map((r) => guardarControles(sql as never, r, "apertura")));
    const vista = role?.kind === "full" && role.quien === "kelly" ? "kelly" : "ceo";
    return { ok: true, data: { mes, sedes, grupo, vista } };
  } catch (err) {
    console.error("[getControlesDelMes] failed:", err);
    return { ok: false, error: "No se pudieron revisar los controles del mes." };
  }
}
