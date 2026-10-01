"use server";

/**
 * Excepciones al bono: quién NO cobra un periodo (ej. periodo de prueba) y
 * quién SÍ cobra aunque la regla automática lo deje afuera. Solo dirección.
 *
 * Nunca toca meses ya liquidados: el acta congela el resultado. Si hace
 * falta cambiar uno, se reabre la liquidación primero.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { requireFullSession } from "@/lib/session-access";

const sql = neon(process.env.DATABASE_URL!);
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function guardarExcepcionBono(i: {
  businessId: number;
  dni: string;
  accion: "excluir" | "incluir";
  desdeMes: string;
  /** Vacío = sin fin. */
  hastaMes: string | null;
  motivo: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo la dirección puede cambiar quién cobra el bono." };
  if (i.businessId !== 2 && i.businessId !== 3) return { ok: false, error: "Aplica a las cafeterías." };
  const dni = i.dni.trim();
  if (!/^\d{6,12}$/.test(dni)) return { ok: false, error: "Esa persona no tiene DNI en el sistema: no se puede registrar la excepción." };
  if (i.accion !== "excluir" && i.accion !== "incluir") return { ok: false, error: "Acción inválida." };
  if (!MES.test(i.desdeMes)) return { ok: false, error: "Mes inicial inválido." };
  const hasta = i.hastaMes && i.hastaMes.trim() !== "" ? i.hastaMes : null;
  if (hasta !== null && (!MES.test(hasta) || hasta < i.desdeMes)) return { ok: false, error: "El mes final no puede ser anterior al inicial." };
  const motivo = i.motivo.trim();
  if (motivo.length < 3) return { ok: false, error: "Escribe el motivo (ej. «periodo de prueba»)." };

  // No se cambia un mes que ya tiene acta.
  try {
    const cerrados = (await sql`
      SELECT month FROM incentive_liquidations
      WHERE business_id = ${i.businessId} AND month >= ${i.desdeMes} AND (${hasta}::text IS NULL OR month <= ${hasta})
    `) as { month: string }[];
    if (cerrados.length > 0) {
      return { ok: false, error: `El mes ${cerrados[0].month} ya está liquidado: reabre la liquidación antes de cambiar quién cobra.` };
    }
  } catch { /* tabla de actas pendiente: no hay actas que proteger */ }

  try {
    await sql`
      INSERT INTO bono_exclusiones (business_id, dni, accion, desde_mes, hasta_mes, motivo)
      VALUES (${i.businessId}, ${dni}, ${i.accion}, ${i.desdeMes}, ${hasta}, ${motivo})
      ON CONFLICT (business_id, dni, accion, desde_mes)
      DO UPDATE SET hasta_mes = EXCLUDED.hasta_mes, motivo = EXCLUDED.motivo
    `;
    revalidatePath("/grupo/incentivos");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/bono_exclusiones/.test(msg)) return { ok: false, error: "Falta crear la tabla de excepciones (se hace una sola vez en Neon)." };
    console.error("[guardarExcepcionBono] failed:", err);
    return { ok: false, error: "No se pudo guardar la excepción." };
  }
}

export async function quitarExcepcionBono(id: number): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo la dirección puede cambiar quién cobra el bono." };
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Excepción inválida." };
  try {
    const f = (await sql`SELECT business_id, desde_mes, hasta_mes FROM bono_exclusiones WHERE id = ${id}`) as { business_id: number; desde_mes: string; hasta_mes: string | null }[];
    if (f.length === 0) return { ok: true };
    try {
      const cerrados = (await sql`
        SELECT month FROM incentive_liquidations
        WHERE business_id = ${f[0].business_id} AND month >= ${f[0].desde_mes} AND (${f[0].hasta_mes}::text IS NULL OR month <= ${f[0].hasta_mes})
      `) as { month: string }[];
      if (cerrados.length > 0) {
        return { ok: false, error: `El mes ${cerrados[0].month} ya está liquidado: reabre la liquidación antes de cambiar quién cobra.` };
      }
    } catch { /* sin tabla de actas */ }
    await sql`DELETE FROM bono_exclusiones WHERE id = ${id}`;
    revalidatePath("/grupo/incentivos");
    return { ok: true };
  } catch (err) {
    console.error("[quitarExcepcionBono] failed:", err);
    return { ok: false, error: "No se pudo quitar la excepción." };
  }
}
