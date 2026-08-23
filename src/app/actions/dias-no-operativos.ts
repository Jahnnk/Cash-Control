"use server";

/**
 * Marcar días que NO cuentan para la meta del equipo.
 *
 * Pedido de Jahnn (22-ago-2026), tras el corte de luz en Centro: poder
 * "pausar" un día para que no baje el ticket promedio del equipo.
 *
 * ─── El candado más importante de este archivo ───
 *
 * SOLO DIRECCIÓN marca días. El administrador NO, aunque sea su propia
 * sede: esto mueve el bono, y si quien lo cobra pudiera excluir sus
 * días flojos el número deja de ser creíble. El admin lo pide por
 * fuera y dirección decide — igual que con las propuestas de Highlight.
 *
 * ─── Y el segundo ───
 *
 * Un mes ya LIQUIDADO no se puede tocar: su base quedó congelada en el
 * acta que se le entregó al equipo. Cambiar un día después de pagar el
 * bono sería reescribir un acuerdo cerrado.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { getSessionRole } from "@/lib/session-access";
import { activeBusinessId } from "@/lib/active-business";
import { validarMotivoDia, type DiaNoOperativo } from "@/lib/incentivos/dias-no-operativos";

const sql = neon(process.env.DATABASE_URL!);

const SEDES: Record<number, string> = { 1: "Atelier", 2: "Fonavi", 3: "Centro" };
const esFecha = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

function faltaMigracion(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /relation .*dias_no_operativos.* does not exist/i.test(msg);
}

/** Quién puede marcar, y con qué nombre queda firmado. */
async function quienMarca(): Promise<string | null> {
  const role = await getSessionRole();
  if (role?.kind === "full") return role.quien === "kelly" ? "Kelly" : "Jahnn";
  return null;
}

export type DiaPausado = DiaNoOperativo & { sede: string; creadoEn: string };

export type DiasPausadosSede = {
  /** false = sin permiso, o la migración no corrió. */
  visible: boolean;
  /** true solo para dirección: el admin los VE pero no puede tocarlos. */
  puedeMarcar: boolean;
  dias: DiaPausado[];
};

/**
 * Los días pausados de una sede. Lo llaman tanto el panel (para no
 * pintar el día en rojo) como el motor de incentivos (para excluirlo).
 */
export async function getDiasPausados(
  desde?: string,
  hasta?: string,
): Promise<DiasPausadosSede> {
  const businessId = await activeBusinessId();
  const role = await getSessionRole();
  const vacio: DiasPausadosSede = { visible: false, puedeMarcar: false, dias: [] };
  if (!role) return vacio;

  const puedeVer =
    role.kind === "full" || (role.kind === "admin" && role.sede === businessId);
  if (!puedeVer) return vacio;

  try {
    const filas = (await sql`
      SELECT business_id, fecha::text AS fecha, motivo, marcado_por,
             creado_en::text AS creado_en
      FROM dias_no_operativos
      WHERE business_id = ${businessId}
        AND (${desde ?? null}::date IS NULL OR fecha >= ${desde ?? null}::date)
        AND (${hasta ?? null}::date IS NULL OR fecha <= ${hasta ?? null}::date)
      ORDER BY fecha DESC
      LIMIT 200
    `) as {
      business_id: number; fecha: string; motivo: string;
      marcado_por: string; creado_en: string;
    }[];

    return {
      visible: true,
      puedeMarcar: role.kind === "full",
      dias: filas.map((f) => ({
        businessId: f.business_id,
        sede: SEDES[f.business_id] ?? `Sede ${f.business_id}`,
        fecha: f.fecha,
        motivo: f.motivo,
        marcadoPor: f.marcado_por,
        creadoEn: f.creado_en,
      })),
    };
  } catch (e) {
    console.error("[getDiasPausados] failed:", e);
    return vacio;
  }
}

/** Todos los pausados de las 3 sedes, para el control de Grupo. */
export async function getTodosLosDiasPausados(
  desde?: string,
): Promise<{ businessId: number; fecha: string }[]> {
  const role = await getSessionRole();
  if (!role) return [];
  try {
    return (await sql`
      SELECT business_id AS "businessId", fecha::text AS fecha
      FROM dias_no_operativos
      WHERE (${desde ?? null}::date IS NULL OR fecha >= ${desde ?? null}::date)
    `) as { businessId: number; fecha: string }[];
  } catch (e) {
    // Sin migración, el sistema sigue igual que antes: nada pausado.
    if (!faltaMigracion(e)) console.error("[getTodosLosDiasPausados] failed:", e);
    return [];
  }
}

export async function marcarDiaNoOperativo(input: {
  fecha: string;
  motivo: string;
  /** Por defecto, la sede que se está mirando. */
  businessId?: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const businessId = input.businessId ?? (await activeBusinessId());
  const firma = await quienMarca();
  if (!firma) {
    return {
      ok: false,
      error: "Solo dirección puede marcar un día como no operativo.",
    };
  }
  if (!SEDES[businessId]) return { ok: false, error: "Sede inválida." };
  if (!esFecha(input.fecha)) return { ok: false, error: "Fecha inválida." };

  const v = validarMotivoDia(input.motivo);
  if (!v.ok) return { ok: false, error: v.error };

  try {
    // Un mes liquidado quedó congelado en su acta: no se reescribe.
    const liquidado = (await sql`
      SELECT 1 FROM incentive_liquidations
      WHERE business_id = ${businessId}
        AND month = ${input.fecha.slice(0, 7)}
      LIMIT 1
    `) as unknown[];
    if (liquidado.length > 0) {
      return {
        ok: false,
        error:
          "Ese mes ya está liquidado y su base quedó congelada en el acta. " +
          "Reabre la liquidación si de verdad hay que cambiarlo.",
      };
    }

    await sql`
      INSERT INTO dias_no_operativos (business_id, fecha, motivo, marcado_por)
      VALUES (${businessId}, ${input.fecha}, ${v.motivo}, ${firma})
      ON CONFLICT (business_id, fecha) DO UPDATE
        SET motivo = EXCLUDED.motivo, marcado_por = EXCLUDED.marcado_por
    `;
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("[marcarDiaNoOperativo] failed:", e);
    if (faltaMigracion(e)) {
      return { ok: false, error: "Falta correr la migración de la base de datos." };
    }
    return { ok: false, error: "No pude marcar el día." };
  }
}

/** Deshacer: el día vuelve a contar. Mismo candado. */
export async function quitarDiaNoOperativo(input: {
  fecha: string;
  businessId?: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const businessId = input.businessId ?? (await activeBusinessId());
  const firma = await quienMarca();
  if (!firma) return { ok: false, error: "Solo dirección puede cambiar esto." };

  try {
    const liquidado = (await sql`
      SELECT 1 FROM incentive_liquidations
      WHERE business_id = ${businessId} AND month = ${input.fecha.slice(0, 7)}
      LIMIT 1
    `) as unknown[];
    if (liquidado.length > 0) {
      return { ok: false, error: "Ese mes ya está liquidado: su base está congelada." };
    }

    await sql`
      DELETE FROM dias_no_operativos
      WHERE business_id = ${businessId} AND fecha = ${input.fecha}
    `;
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("[quitarDiaNoOperativo] failed:", e);
    return { ok: false, error: "No pude quitar la marca." };
  }
}
