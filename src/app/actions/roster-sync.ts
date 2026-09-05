"use server";

/**
 * Refleja el roster de PLANILLA en el de bonos de Cash Control.
 *
 * Pedido de Jahnn (5-sep-2026): que dar de baja a alguien o cambiarle las
 * horas en Planilla se refleje solo, sin que nadie tenga que acordarse.
 *
 * ─── Por qué una copia y no leer Planilla en vivo ───
 *
 * Son dos bases Neon distintas, y en el plan gratuito las horas de
 * compute se cuentan: leer Planilla en cada carga del panel la
 * despertaría todo el día. Por eso se copia, pero se copia SOLA — cada
 * vez que alguien abre incentivos, si la copia tiene más de unas horas
 * se refresca antes de calcular. Para quien usa el sistema es
 * automático; para las bases, son un par de consultas al día.
 *
 * ─── Falla hacia el lado seguro ───
 *
 * Si PLANILLA_DATABASE_URL no está configurada o Planilla no responde,
 * NO se rompe nada: se sigue con el roster que ya había y se avisa. Un
 * bono no puede depender de que dos sistemas estén arriba a la vez.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { requireFullSession, getSessionRole } from "@/lib/session-access";
import {
  planificarSync, planVacio,
  type TrabajadorPlanilla, type StaffCash, type PlanDeSync,
} from "@/lib/incentives/roster-sync";

const sql = neon(process.env.DATABASE_URL!);

/** Cash Control ↔ Planilla: qué empresa es cada sede. */
const PATRON_EMPRESA: Record<number, RegExp> = {
  1: /atelier/i,
  2: /fonavi/i,
  3: /centro/i,
};

/** Cada cuántas horas se refresca solo al abrir el panel. */
const HORAS_FRESCURA = 6;

export type ResultadoSync =
  | { ok: true; plan: PlanDeSync; aplicado: boolean; sincronizadoEn: string }
  | { ok: false; error: string; motivo: "sin-configurar" | "planilla-caida" | "sin-acceso" };

async function leerPlanilla(bId: number): Promise<TrabajadorPlanilla[] | null> {
  const url = process.env.PLANILLA_DATABASE_URL;
  if (!url) return null;
  const patron = PATRON_EMPRESA[bId];
  if (!patron) return null;

  const planilla = neon(url);
  const empresas = (await planilla`SELECT id, nombre FROM empresas`) as { id: string; nombre: string }[];
  const emp = empresas.find((e) => patron.test(e.nombre));
  if (!emp) return [];

  const rows = (await planilla`
    SELECT t.dni, t.nombre_completo AS nombre, a.nombre AS area,
           t.horas_semanales::float AS horas
    FROM trabajadores t
    LEFT JOIN areas_trabajo a ON a.id = t.area_trabajo_id
    WHERE t.empresa_id = ${emp.id} AND t.estado = 'activo' AND t.dni IS NOT NULL
  `) as { dni: string; nombre: string; area: string | null; horas: number | null }[];

  return rows.map((r) => ({
    dni: String(r.dni).trim(),
    nombre: r.nombre,
    area: r.area,
    horasSemanales: r.horas,
  }));
}

async function leerRoster(bId: number): Promise<StaffCash[]> {
  return (await sql`
    SELECT id::text, name, dni, area, jornada, horas_semanales::float AS "horasSemanales", active
    FROM staff WHERE business_id = ${bId}
  `) as StaffCash[];
}

async function aplicar(bId: number, plan: PlanDeSync): Promise<void> {
  for (const a of plan.altas) {
    await sql`
      INSERT INTO staff (business_id, name, dni, area, jornada, active, horas_semanales, sincronizado_en)
      VALUES (${bId}, ${a.name}, ${a.dni}, ${a.area}, ${a.jornada}, true, ${a.horasSemanales}, now())
    `;
  }
  for (const b of plan.bajas) {
    await sql`UPDATE staff SET active = false, sincronizado_en = now() WHERE id = ${b.id}`;
  }
  for (const r of plan.reactivaciones) {
    await sql`UPDATE staff SET active = true, sincronizado_en = now() WHERE id = ${r.id}`;
  }
  // Los cambios vienen uno por campo; se agrupan por persona para no
  // pisar un UPDATE con el siguiente.
  const porPersona = new Map<string, { horas?: string; jornada?: string }>();
  for (const c of plan.cambios) {
    const acc = porPersona.get(c.id) ?? {};
    if (c.campo === "horasSemanales") acc.horas = c.a;
    else acc.jornada = c.a;
    porPersona.set(c.id, acc);
  }
  for (const [id, c] of porPersona) {
    if (c.horas !== undefined && c.jornada !== undefined) {
      await sql`UPDATE staff SET horas_semanales = ${Number(c.horas)}, jornada = ${c.jornada}, sincronizado_en = now() WHERE id = ${id}`;
    } else if (c.horas !== undefined) {
      await sql`UPDATE staff SET horas_semanales = ${Number(c.horas)}, sincronizado_en = now() WHERE id = ${id}`;
    } else if (c.jornada !== undefined) {
      await sql`UPDATE staff SET jornada = ${c.jornada}, sincronizado_en = now() WHERE id = ${id}`;
    }
  }
  // Marca de "revisado": incluso sin cambios, deja constancia de cuándo
  // se comprobó contra Planilla.
  await sql`UPDATE staff SET sincronizado_en = now() WHERE business_id = ${bId} AND active = true`;
}

/** Sincroniza el roster de una sede. Solo dirección o el admin de ESA sede. */
export async function sincronizarRoster(bId: number, aplicarCambios = true): Promise<ResultadoSync> {
  const role = await getSessionRole();
  const permitido = role?.kind === "full" || (role?.kind === "admin" && role.sede === bId);
  if (!permitido) return { ok: false, error: "Sin acceso.", motivo: "sin-acceso" };

  let enPlanilla: TrabajadorPlanilla[] | null;
  try {
    enPlanilla = await leerPlanilla(bId);
  } catch {
    return {
      ok: false,
      motivo: "planilla-caida",
      error: "No pude leer el sistema de Planilla. Se sigue con el roster que ya estaba.",
    };
  }
  if (enPlanilla === null) {
    return {
      ok: false,
      motivo: "sin-configurar",
      error: "Falta configurar el acceso al sistema de Planilla (PLANILLA_DATABASE_URL). Avísale a Jahnn.",
    };
  }

  const plan = planificarSync(enPlanilla, await leerRoster(bId));
  if (aplicarCambios && !planVacio(plan)) {
    await aplicar(bId, plan);
    revalidatePath("/[negocio]/panel", "page");
  } else if (aplicarCambios) {
    await sql`UPDATE staff SET sincronizado_en = now() WHERE business_id = ${bId} AND active = true`;
  }
  return { ok: true, plan, aplicado: aplicarCambios, sincronizadoEn: new Date().toISOString() };
}

/**
 * Refresca el roster si la copia ya está vieja. Se llama antes de
 * calcular incentivos, para que quien abre el panel vea siempre el
 * equipo real sin apretar nada.
 *
 * Nunca lanza: si Planilla no está disponible, se sigue con lo que hay.
 */
export async function refrescarRosterSiHaceFalta(bId: number): Promise<void> {
  if (!process.env.PLANILLA_DATABASE_URL) return;
  try {
    const r = (await sql`
      SELECT MAX(sincronizado_en) AS ultima FROM staff
      WHERE business_id = ${bId} AND active = true
    `) as { ultima: string | null }[];
    const ultima = r[0]?.ultima ? new Date(r[0].ultima).getTime() : 0;
    const horas = (Date.now() - ultima) / 3_600_000;
    if (horas < HORAS_FRESCURA) return;
    await sincronizarRoster(bId, true);
  } catch {
    // Silencio a propósito: el bono no puede caerse porque el otro
    // sistema esté dormido. Se calcula con el roster que ya estaba.
  }
}

/** Vista previa sin escribir — para mostrar qué cambiaría. */
export async function previsualizarSync(bId: number): Promise<ResultadoSync> {
  return sincronizarRoster(bId, false);
}

/** Cuándo se reflejó por última vez desde Planilla. */
export async function ultimaSincronizacion(bId: number): Promise<string | null> {
  await requireFullSession();
  const r = (await sql`
    SELECT MAX(sincronizado_en)::text AS ultima FROM staff
    WHERE business_id = ${bId} AND active = true
  `) as { ultima: string | null }[];
  return r[0]?.ultima ?? null;
}
